// Canvas host for the Open BIM Suite scene pipeline and Z-up camera.
#[path = "../upstream/camera.rs"]
#[allow(dead_code)]
mod camera;
mod model;
mod pipeline;

use camera::{Camera, ViewPreset};
use glam::{Mat4, Vec3};
use model::Bounds;
use pipeline::{Pipeline, Uniforms, Vertex, DEPTH_FORMAT, SAMPLES};
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;
use wgpu::util::DeviceExt;

#[wasm_bindgen]
pub struct StairScene {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pipeline: Pipeline,
    color: wgpu::TextureView,
    depth: wgpu::TextureView,
    mesh: Option<wgpu::Buffer>,
    triangle_vertices: u32,
    edge_vertices: u32,
    camera: Camera,
    bounds: Bounds,
}

fn target(device: &wgpu::Device, config: &wgpu::SurfaceConfiguration, format: wgpu::TextureFormat) -> wgpu::TextureView {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some("o3v.offscreen"), size: wgpu::Extent3d { width: config.width, height: config.height, depth_or_array_layers: 1 },
        mip_level_count: 1, sample_count: SAMPLES, dimension: wgpu::TextureDimension::D2,
        format, usage: wgpu::TextureUsages::RENDER_ATTACHMENT, view_formats: &[],
    }).create_view(&Default::default())
}

#[wasm_bindgen]
impl StairScene {
    pub async fn open(canvas: HtmlCanvasElement, webgl: bool, loss_event: String) -> Result<StairScene, JsValue> {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: if webgl { wgpu::Backends::GL } else { wgpu::Backends::BROWSER_WEBGPU },
            ..Default::default()
        });
        let width = canvas.width().max(1);
        let height = canvas.height().max(1);
        let surface = instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas)).map_err(|e| e.to_string())?;
        let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions {
            compatible_surface: Some(&surface),
            ..Default::default()
        }).await.map_err(|e| e.to_string())?;
        let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("Open BIM Suite"),
            required_limits: wgpu::Limits::downlevel_webgl2_defaults().using_resolution(adapter.limits()),
            ..Default::default()
        }).await.map_err(|e| e.to_string())?;
        let mut config = surface.get_default_config(&adapter, width, height).ok_or("Geen renderformaat gevonden")?;
        let caps = surface.get_capabilities(&adapter);
        if let Some(format) = caps.formats.into_iter().find(|fmt| !fmt.is_srgb()) {
            config.format = format;
        }
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        surface.configure(&device, &config);
        let pipeline = Pipeline::new(&device, config.format);
        let color = target(&device, &config, config.format);
        let depth = target(&device, &config, DEPTH_FORMAT);
        if let Some(err) = device.pop_error_scope().await {
            return Err(err.to_string().into());
        }
        device.set_device_lost_callback(move |reason, _| {
            if reason != wgpu::DeviceLostReason::Destroyed {
                if let (Some(window), Ok(event)) = (web_sys::window(), web_sys::Event::new(&loss_event)) {
                    let _ = window.dispatch_event(&event);
                }
            }
        });
        Ok(Self { surface, device, queue, config, pipeline, color, depth, camera: Camera::default(),
            bounds: Bounds::default(), mesh: None, triangle_vertices: 0, edge_vertices: 0 })
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        if width == 0 || height == 0 || (width == self.config.width && height == self.config.height) { return; }
        let limit = self.device.limits().max_texture_dimension_2d;
        self.config.width = width.clamp(1, limit);
        self.config.height = height.clamp(1, limit);
        self.surface.configure(&self.device, &self.config);
        self.color = target(&self.device, &self.config, self.config.format);
        self.depth = target(&self.device, &self.config, DEPTH_FORMAT);
    }

    /// GPU vertex bytes use the suite's position/normal/Unorm8x4/unit layout.
    pub fn set_mesh(&mut self, bytes: &[u8], triangles: u32, bounds: &[f32]) -> Result<(), JsValue> {
        let stride = std::mem::size_of::<Vertex>();
        let count = (bytes.len() / stride) as u32;
        if bytes.len() % stride != 0 || triangles > count || triangles % 3 != 0 || (count - triangles) % 2 != 0 || bounds.len() != 6 {
            return Err("Ongeldig trapmodel".into());
        }
        self.bounds = Bounds { min: bounds[..3].try_into().unwrap(), max: bounds[3..].try_into().unwrap() };
        self.camera.scene_radius = self.bounds.radius().max(0.001);
        self.mesh = (!bytes.is_empty()).then(|| self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Traponderdelen"), contents: bytes, usage: wgpu::BufferUsages::VERTEX,
        }));
        self.triangle_vertices = triangles;
        self.edge_vertices = count - triangles;
        Ok(())
    }

    pub fn fit(&mut self) {
        self.camera.fit(&self.bounds, self.aspect());
    }

    /// Use the suite's isometric elevation and look from the foot of the first flight.
    pub fn stair_iso(&mut self, dx: f32, dy: f32) {
        self.camera.set_preset(ViewPreset::Iso);
        self.camera.yaw += dy.atan2(dx) - std::f32::consts::FRAC_PI_2;
    }
    pub fn orbit(&mut self, dx: f32, dy: f32) { self.camera.orbit(dx, dy); }
    pub fn pan(&mut self, dx: f32, dy: f32, height: f32) { self.camera.pan(dx, dy, height); }
    pub fn zoom(&mut self, steps: f32, x: f32, y: f32) { self.camera.zoom_at(steps, (x, y), self.aspect()); }
    pub fn quarter(&mut self) { self.camera.yaw += std::f32::consts::FRAC_PI_2; }

    pub fn camera_state(&self) -> Vec<f32> {
        let c = &self.camera;
        vec![c.target.x, c.target.y, c.target.z, c.distance, c.yaw, c.pitch]
    }

    pub fn restore(&mut self, values: &[f32]) {
        if values.len() != 6 || !values.iter().all(|v| v.is_finite()) || values[3] <= 0.0 { return; }
        self.camera.target = Vec3::new(values[0], values[1], values[2]);
        self.camera.distance = values[3];
        self.camera.yaw = values[4];
        self.camera.pitch = values[5];
    }

    pub fn draw(&mut self, red: u8, green: u8, blue: u8) -> Result<(), JsValue> {
        let frame = match self.surface.get_current_texture() {
            Ok(frame) => frame,
            Err(wgpu::SurfaceError::Timeout) => return Ok(()),
            Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
                self.surface.configure(&self.device, &self.config);
                self.surface.get_current_texture().map_err(|e| e.to_string())?
            }
            Err(e) => return Err(e.to_string().into()),
        };
        let view = frame.texture.create_view(&Default::default());
        let background = |channel: u8| {
            let value = f64::from(channel) / 255.0;
            if !self.config.format.is_srgb() { value }
            else if value <= 0.04045 { value / 12.92 }
            else { ((value + 0.055) / 1.055).powf(2.4) }
        };
        let eye = self.camera.eye();
        let uniforms = Uniforms {
            view_proj: self.camera.view_proj(self.aspect()).to_cols_array_2d(),
            model: Mat4::IDENTITY.to_cols_array_2d(),
            eye: [eye.x, eye.y, eye.z, 1.0],
            params: [u32::from(self.config.format.is_srgb()) as f32, 0.8, 0.0, 0.0],
            clip: [[0.0, 0.0, 0.0, 1.0], [0.0; 4], [0.0; 4]], cap: [0.0; 4], plane: [[0.0; 4]; 2],
        };
        self.queue.write_buffer(&self.pipeline.uniforms, 0, bytemuck::bytes_of(&uniforms));
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("o3v.scene"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.color, depth_slice: None, resolve_target: Some(&view),
                    ops: wgpu::Operations {load: wgpu::LoadOp::Clear(wgpu::Color {r: background(red), g: background(green), b: background(blue), a: 1.0}), store: wgpu::StoreOp::Discard},
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth, depth_ops: Some(wgpu::Operations {load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard}), stencil_ops: None,
                }),
                ..Default::default()
            });
            if let Some(mesh) = &self.mesh {
                pass.set_bind_group(0, &self.pipeline.bindings, &[]);
                pass.set_vertex_buffer(0, mesh.slice(..));
                pass.set_pipeline(&self.pipeline.lit);
                pass.draw(0..self.triangle_vertices, 0..1);
                pass.set_pipeline(&self.pipeline.glass);
                pass.draw(0..self.triangle_vertices, 0..1);
                pass.set_pipeline(&self.pipeline.lines);
                pass.draw(self.triangle_vertices..self.triangle_vertices + self.edge_vertices, 0..1);
            }
        }
        self.queue.submit(Some(encoder.finish()));
        frame.present();
        Ok(())
    }
}

impl StairScene {
    fn aspect(&self) -> f32 { self.config.width as f32 / self.config.height as f32 }
}

impl Drop for StairScene {
    fn drop(&mut self) { self.device.destroy(); }
}
