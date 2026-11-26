# 3D-viewport van Open Stair Studio

De viewport gebruikt de renderer van Open BIM Suite v2026.47.5, vastgezet op commit `a4747e63067524900f51dc409d4967295b438ebd`. De Rust-crate bouwt met wgpu 27.0.1 voor WebGPU en WebGL2. De Svelte-werkruimte en de Tauri-WebView laden dezelfde lokale WebAssembly-module. [Open BIM Suite v2026.47.5](https://github.com/OpenAEC-Foundation/open-bim-suite/tree/a4747e63067524900f51dc409d4967295b438ebd)

## Herkomst

| Onderdeel | Implementatie |
| --- | --- |
| Z-up-camera | `upstream/camera.rs` is de originele bron. Camerastand, projectie, orbit, pan, cursorzoom en passend maken gebruiken de gepubliceerde methodes. |
| GPU-shader | `upstream/scene.wgsl` is de originele bron. De vertex-layout, uniformen en bindings sluiten aan op de model-, glas- en lijnpasses. |
| Renderpipeline | `src/pipeline.rs` is overgenomen en aangepast uit `src/viewport/render.rs`. De drie passes gebruiken dezelfde shader-entrypoints, dieptetest, randbias, transparante blending en 4× MSAA. |
| Canvas en parametrische trapgeometrie | `src/lib.rs` bindt de scene aan een browsercanvas en vervangt het iced-renderdoel. `../src/viewport-mesh.js` trianguleert de onderdelen, inclusief concave en schuine vlakken, en voert ze in meters aan. De actieve trap levert de looprichting voor het openingsbeeld. |
| Materiaalweergave | De geometrie volgt de parametrische buitencontour van de treden, trapbomen en bordessen. Glas gebruikt de transparante shaderpass, CLT en staal krijgen hun eigen oppervlaktekleur. Roosteropeningen, individuele CLT-lamellen en oplegdetails zijn niet gemodelleerd in de onderdeelgeometrie. |

De originele camera en shader zijn byte voor byte gecontroleerd tegen de gepinde versie. De aanpassingen aan de renderer en de canvasadapter vallen onder LGPL-3.0-or-later. Bronvermelding en licentie zijn bijgevoegd in de desktop- en webdistributie. [Originele viewportbron](https://github.com/OpenAEC-Foundation/open-bim-suite/tree/a4747e63067524900f51dc409d4967295b438ebd/src/viewport)

## Bediening

| Handeling | Bediening |
| --- | --- |
| Draaien om het doelpunt | Linkermuisknop slepen, Shift + middenknop slepen of één vinger |
| Verschuiven | Midden- of rechtermuisknop slepen, Shift + linkermuisknop of twee vingers verschuiven |
| Zoomen naar de cursor | Muiswiel of twee vingers knijpen |
| Gehele trap in beeld | Passend of F met focus op het model |
| Isometrie herstellen | Home met focus op het model |
| Draaien of zoomen met toetsen | Pijlen en +/− met focus op het model |

De host tekent op aanvraag. Een tabwissel en een modelwijziging behouden de camera. Bij GPU-verlies opent de host de surface opnieuw met dezelfde camerapositie. Een probleem met beide backends wordt in de weergave gemeld; de gebruiker kan de sessie opnieuw openen.

## Bouwen en testen

De gegenereerde bestanden `src/viewport-wasm/stair_viewport.js` en `stair_viewport_bg.wasm` horen bij de bronboom. Een gewone `npm ci` en `npm run build` bouwen de applicatie met deze bestanden. De Rust-bouwstap is nodig bij wijzigingen aan de renderer. Voer de volgende opdrachten uit vanuit de projectroot. De bron is gebouwd met Rust 1.99, wasm-pack 0.15.1 en de versies uit `viewport/Cargo.lock`.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.1 --locked
node scripts/build-viewport.mjs
npm run build
```

De viewportregressie gebruikt Edge, Playwright en Pillow. Start de applicatie en voer daarna `python scripts/verify-viewport.py http://127.0.0.1:5198` uit. De proef leest de pixels van het canvas, controleert de camera tijdens orbit/pan/cursorzoom, wisselt van tab en vensterformaat, en herhaalt de handelingen met WebGPU uitgeschakeld. De WebGL2-proef verbreekt de werkelijke context via `WEBGL_lose_context` en controleert de herstelde weergave.

