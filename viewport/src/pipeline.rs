// Adapted from Open BIM Suite v2026.47.5, src/viewport/render.rs (LGPL-3.0-or-later).
use bytemuck::{Pod, Zeroable};

pub const SAMPLES: u32 = 4;
pub const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24PlusStencil8;
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct Vertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub color: [u8; 4],
    /// Unit of the exploded view: index into the offsets (0 never moves).
    pub unit: u32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct Uniforms {
    pub view_proj: [[f32; 4]; 4],
    pub model: [[f32; 4]; 4],
    pub eye: [f32; 4],
    pub params: [f32; 4],
    pub clip: [[f32; 4]; 3],
    pub cap: [f32; 4],
    pub plane: [[f32; 4]; 2],
}

pub struct Pipeline {
    pub uniforms: wgpu::Buffer,
    pub bindings: wgpu::BindGroup,
    pub lit: wgpu::RenderPipeline,
    pub glass: wgpu::RenderPipeline,
    pub lines: wgpu::RenderPipeline,
}

impl Pipeline {
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat) -> Self {
        let uniform_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("o3v.uniforms.layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // the offsets of the exploded view
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // how every unit looks
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
            ],
        });
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("o3v.uniforms.model"),
            size: std::mem::size_of::<Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        // The parametric model occupies unit 0; the initial zero texel carries no overrides.
        let state = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("o3v.unit-state"), size: wgpu::Extent3d {width: 1, height: 1, depth_or_array_layers: 1},
            mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba32Float, usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let state_view = state.create_view(&Default::default());
        let bindings = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("o3v.model.group"), layout: &uniform_layout,
            entries: &[
                wgpu::BindGroupEntry {binding: 0, resource: uniforms.as_entire_binding()},
                wgpu::BindGroupEntry {binding: 1, resource: wgpu::BindingResource::TextureView(&state_view)},
                wgpu::BindGroupEntry {binding: 2, resource: wgpu::BindingResource::TextureView(&state_view)},
            ],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("o3v.scene.shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../upstream/scene.wgsl").into()),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("o3v.scene.layout"),
            bind_group_layouts: &[&uniform_layout],
            push_constant_ranges: &[],
        });
        let vertex_attributes = wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Unorm8x4, 3 => Uint32];
        let vertex_layout = wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<Vertex>() as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &vertex_attributes,
        };
        let make_pipeline = |label, topology, fs: &str, blend, bias: wgpu::DepthBiasState, depth_write: bool| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label),
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_main"),
                    buffers: &[vertex_layout.clone()],
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                },
                primitive: wgpu::PrimitiveState { topology, cull_mode: None, ..Default::default() },
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: DEPTH_FORMAT,
                    depth_write_enabled: depth_write,
                    depth_compare: wgpu::CompareFunction::LessEqual,
                    stencil: wgpu::StencilState::default(),
                    bias,
                }),
                multisample: wgpu::MultisampleState { count: SAMPLES, mask: !0, alpha_to_coverage_enabled: false },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some(fs),
                    targets: &[Some(wgpu::ColorTargetState { format, blend, write_mask: wgpu::ColorWrites::ALL })],
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                }),
                multiview: None,
                cache: None,
            })
        };
        // Triangles are pushed back a little so edges drawn on top win the depth test.
        let lit = make_pipeline(
            "o3v.lit",
            wgpu::PrimitiveTopology::TriangleList,
            "fs_lit",
            None,
            wgpu::DepthBiasState { constant: 2, slope_scale: 1.0, clamp: 0.0 },
            true,
        );
        let glass = make_pipeline(
            "o3v.glass",
            wgpu::PrimitiveTopology::TriangleList,
            "fs_glass",
            Some(wgpu::BlendState::ALPHA_BLENDING),
            wgpu::DepthBiasState { constant: 2, slope_scale: 1.0, clamp: 0.0 },
            false,
        );
        let lines = make_pipeline(
            "o3v.lines",
            wgpu::PrimitiveTopology::LineList,
            "fs_line",
            Some(wgpu::BlendState::ALPHA_BLENDING),
            wgpu::DepthBiasState::default(),
            true,
        );
        Self { uniforms, bindings, lit, glass, lines }
    }
}
