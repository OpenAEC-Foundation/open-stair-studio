# Open Stair Studio

Open Stair Studio is an OpenAEC desktop application for parametric stair design, tread engineering, timber estimating and CNC preparation, and IFC4 coordination. Its Svelte/Tauri shell uses the OpenAEC Blueprint web assets. Its interactive viewport uses the Open BIM Suite camera, shader and wgpu scene pipeline.

## Run

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Build the frontend with `npm run build`. Start the Tauri desktop shell with `npm run desktop:dev`.

## Installeren en bijwerken

Download de Windows-installer van [OpenAEC GitHub Releases](https://github.com/OpenAEC-Foundation/open-stair-studio/releases/latest). De app controleert bij het starten op nieuwe releases. Klik op **Update** in de titelbalk om een gevonden versie te downloaden en installeren. De installer en elke volgende release gebruiken dezelfde app-identiteit en een ondertekend Tauri-updatebestand. Een nieuwe release ontstaat met een versietag `vX.Y.Z`; de [releaseworkflow](.github/workflows/release.yml) bouwt, controleert en publiceert de installer en `latest.json`. Bewaar de private updatesleutel veilig: zonder die sleutel kan een bestaande installatie geen toekomstige releases verifiëren.

Voor een volgende versie: verhoog de versie in `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, `src-tauri/tauri.conf.json` en `src/stair.js`; controleer met `node scripts/check-release-version.mjs vX.Y.Z` en `npm run verify`. Push `main`, maak daarna tag `vX.Y.Z` en push die tag. De workflow publiceert de installer pas na een geslaagde build. De overgang van de geïnstalleerde 0.13.1 naar 0.13.2 is via de updateknop getest met `scripts/verify-updater-upgrade.py`.

De applicatiecode heeft de [AGPL-3.0-licentie](LICENSE). De meegeleverde viewportmodule heeft de eigen [LGPL-3.0-licentie](viewport/LICENSE); voor de Blueprint-assets staat de bronvermelding in [NOTICE.txt](public/blueprint/NOTICE.txt).

Run `npm run verify` for geometry, material quantities, project recovery, dimension checks and IFC4 export. The suite covers the four original families and 1,280 winding layouts. For browser checks, run `scripts/verify-handoff.py` and `scripts/verify-winder-handoff.py` with Python, the running Vite URL, Microsoft Edge and the packages playwright, ezdxf and pymupdf. The independent IFC4/EXPRESS and mesh audit command is documented at the top of `scripts/verify-ifc-independent.py`.

## Working capabilities

- Six timber stair families, including quarter and half winding stairs. Choose turn direction, the number of treads per quarter turn, where the bend starts, and a square or faceted outer stringer.
- For straight flights and stairs with a landing, choose an ingekroosde boom or an uitgezaagde keepboom independently on the left and right. The keepboom has horizontal tread seats and a sloping underside with a configurable minimum web. Its closed solid enters the 3D view, material estimate and IFC4; Wangbladen exports its nominal 2D DXF contour. The tread edge relative to the keepboom and the tread position along the walking line are signed: positive moves the complete tread forward, negative moves it backward. Straight tread length stays equal to the going; winder contours follow their curved rails. A check requires at least 10 mm of lateral seat overlap.
- Standard closed straight-flight risers stand vertically against the lower tread back and below the next tread. An explicitly selected custom detail may still be sloped. At a landing, the incoming riser ends at the landing underside and the outgoing riser starts on its top; the rectangular landing blank extends to cover both interfaces. The actual solids and blank dimensions enter 3D, IFC4, estimates and workshop drawings. Winding risers follow the translated front edge of their tread.
- Shared derived geometry for tread layout, landings, outside stringer envelopes, plan footprint and parts schedule. Trapbreedte is measured outside-to-outside including stringers; usable tread width is derived by subtracting both stringer thicknesses.
- Editable project identity, stair parameters, timber assumptions, landing and opening context, and a small set of Dutch new-build Bbl dimension profiles.
- Source-linked geometric prechecks, material calculations and escape capacity checks with explicit assumptions and open inputs.
- Each winding tread has a numbered contour, walking-line section measurements, local DXF, printable tread sheet and CSV row. Click its number in plan to open its sheet. Winding stringers meet at shared vertical mitres.
- Tread blanks follow the nosing and include any tongues. Stringer blanks follow the pitch. The estimate applies the waste factor to the gross stock and adds the entered labour, overhead and margin.
- Local draft autosave, undo/redo, `.oss.json` project open/save, CSV parts export, layered 2D DXF plan contours for treads, landings and stringers, and print-to-PDF.
- IFC4 coordination export through `web-ifc`. A storey contains the stair, each timber flight groups individually selectable treads, risers and stringers, and landings have their own products. Standard stair property sets carry flight measures. Physical timber components have net volume quantities. Revision exports retain the identifiers of corresponding products.
- The BIM workspace also exports experimental IFCX alpha. A component or the complete component assembly uses the project datum in both formats. Download regression tests reopen the files and compare the meshes in world coordinates. [Public IFC benchmarks and measured stair dimensions](docs/bim-referentietrappen.md)
- The timber landing frame has editable thickness and four rim members. Their stock enters the estimate, 3D view, workshop sheet, DXF and IFC4. Joint screws have explicit positions, bore points and a preliminary shear comparison; member bending and deflection are calculated from declared loads and timber values. Host anchors remain project-specific.
- The BIM panel records the project origin and rotation, NAA.K.T. material fields and NL-SfB codes. IFC4 exports material, classification and type relations. A host IFC can be loaded in the current session to read slabs, openings and void relations and compare the stair and opening sections at each slab's mid height. [BIM scope and gaps](docs/bim-naakt-audit.md)
- OpenAEC Blueprint workspaces with adjustable panels, saved appearance and keyboard-accessible drawing tabs. In the 3D view, drag to orbit, middle-drag or Shift-drag to pan, scroll to zoom and press F to fit. [Shell and viewport verification](docs/blueprint-viewer.md)

## Integrated stair design

All fifteen designs are available in **Trap ontwerpen → Traptype ontwerpen**. Each complete assembly has editable dimensions, an optional railing or handhold, a 3D view, drawings, parts list and IFC4 export. Timber designs additionally offer machined nosings, chamfered nosing strips, turned or tapered balusters, profiled handrails and transition pieces. **Houtdetails** prints individual profile drawings and cutting lists, and exports millimetre DXFs. [Design workflow](docs/trap-ontwerpen.md) · [Timber sample](examples/klassieke-eiken-kwartslag.oss.json) · [Six assembly designs](examples/zes-trapontwerpen.oss.json) · [Timber workshop booklet](examples/houtdetails-kwartslag.pdf)

For glass, cantilever, steel and escape stairs, **Engineering → Berekening** shows the strength, deflection and connection checks for the selected assembly. Enter loads, resistance values and their project references in the properties panel. **Werkvoorbereiding → Verbindingen** produces dimensioned views and a local anchor schedule for each connection. IFC4 groups link the same parts and checks. The example uses illustrative loads and resistances. [Editable project](examples/rekenvoorbeeld-trapverbindingen.oss.json) · [Workshop sheets](examples/werkplaats-trapverbindingen.pdf) · [IFC4 example](examples/rekenvoorbeeld-trapverbindingen.ifc)

The [ten supplied reference stair designs](docs/referentietrappen-beeldreeks.md) are mapped to the current model and the missing geometry, support systems, details and manufacturing checks. A central steel spine, folded timber shell and open-centre helical stair are distinct support systems and are not represented as a conventional two-stringer or central-column stair.

## Multistorey stairwells

Open **Trap ontwerpen → Traptype ontwerpen** to choose a timber, laminated glass, cantilever, steel, escape, portable platform, ladder, precast, spiral or folding loft design. **Projectopstelling** provides the shared building context. Set its departure storey, position, rotation and dimensions. Copy a component to the next storey and set an individual floor height when needed. Switch between the active component, the floor and the whole stairwell in the 3D view and drawings.

- Precast flights have a stepped top, a sloping soffit, bearings and separate landings. The parts list reports concrete volume and mass per lifting element.
- The spiral stair has a central column, tread hubs, a base plate, tapered treads, a landing and a rising outer guard. The coordination model records the walking line, turn direction and clearance per revolution.
- The folding loft stair has a hatch, a casing and three hinged ladder sections. Four positions show the motion. The drawing gives the opening envelope, and the software flags possible conflicts with neighbouring components even when the hatch is closed.
- The six timber stair families can include closed risers, posts, balusters and continuous handrails. New timber designs start with closed risers. Choose the left, right or both sides to add a railing. Existing files preserve their original detail settings. Use the detail CSV to take off the added parts.

**Tekening afdrukken** produces a component drawing or a set of building elevations and floor plans. **Ontwerp als IFC4** exports the selected design. **Geheel project als IFC4** exports all placed components with their storeys, materials and identifiers. Open an editable example for [concrete](examples/trappenhuis-beton.oss.json), [spiral](examples/trappenhuis-spil.oss.json) or [loft stairs](examples/trappenhuis-vlizotrap.oss.json). See the [design research and workflow](docs/trappenhuis.md). Run `npm run verify:trappenhuis` to check the three component models, placement, drawing data and IFC4.

## Capability boundaries

The three-axis LinuxCNC profile machines solid timber tread outlines and their corresponding housed-stringer pockets. Keepboom cutting is a nominal DXF handoff; its external profile is not yet emitted as a verified machine program. Keepbomen in winding flights and their support/underslag engineering remain open. Machine travel, fixture clearance, tooling, material and assembly sequence require workshop verification. Handrail joints and building-specific landing connections require project detailing. Building-model import is scoped to floor and opening sections. IFCX alpha uses the buildingSMART IFC5 development format.

## Precast reinforcement, lifting and connections

Select a concrete component in **Trap ontwerpen → Prefab betontrap → Prefabdetails**. Activate reinforcement and inserts, then select a flight or landing. Choose **Alleen wapening en instortdelen** in 3D to see the cast-in details. Each element has two reinforcement mats, lifting inserts and lateral restraint connections. The workshop sheet includes metric views, a section through the mats, insert sections and a bar schedule. The CSV supplies the local start and end coordinates of every piece. The PDF can contain one element or the entire component.

On **Elementhijsplan**, each flight and landing can override the stair's lifting layout, rigging, capacities and concrete strength at lifting. The plan shows local coordinates, centre of gravity and point loads during stripping and free lifting. Under **Bijlegwapening**, enable bent bars around bearing seats, lifting sockets and connection anchors. The workshop sheets show the selected provision, the bar shape and developed length. CSV includes the exact straight and curved segments. IFC4 links each physical bar to its cast and its bearing, socket or anchor. The example starts with distinct lift plans for three of its five elements. [Editable sample](examples/prefab-elementhijsplannen.oss.json) · [Workshop and lifting sheets](examples/prefab-elementhijsplannen.pdf) · [Sample IFC4](examples/prefab-elementhijsplannen.ifc)

The calculation uses the actual element profile, reinforcement, support and lifting positions. Local checks compare the steel area, anchorage tail and documented load path. Product-dependent resistance, strut-and-tie design, concrete breakout, serviceability and lifting of fitted assemblies require project-specific engineering. Older projects retain their detailing and can opt into local reinforcement. [Calculation and scope](docs/prefab-berekeningen.md) · [Local reinforcement and individual lifting plans](docs/bijlegwapening-en-hijsplannen.md)

## Engineering

The **Engineering** workspace records glass, steel grating, CLT, timber and custom tread systems. Geometry in the non-timber workflows represents the coordination envelope. Each system has its own product specification, support arrangement and span. Regular use, a regular stair on an escape route and a stair exclusively for escape are separate choices. Switching the material preserves its product data for future edits and undo.

The structural model covers rectangular treads with two parallel end supports. It compares bending, shear, deflection, local patch capacity and support reactions for dead load combined separately with the imposed area load and the imposed point load. Depending on the load path, it also checks bearing pressure, the most heavily loaded fastener and the fastener group. Project inputs specify product resistance, load factors, effective section properties and connection evidence. Glass requires a post-breakage assessment. Winders and alternative support conditions stay open for a tread-specific analysis. [Calculation model](docs/rekenmodel-treden.md)

For Dutch new construction, the route worksheet applies the designated use under Bbl article 4.80(1) to a stair and optionally a room and doorway serving the same people. For winders, the surveyed continuous width must fit the calculated bands with a going of at least 170 mm between consecutive nosings. The result identifies the limiting section and its capacity in whole people. Separate provisions govern holding capacity and phased evacuation. [IPLO guidance](https://iplo.nl/publish/pages/245968/vluchten-bij-brand-nieuwbouw-bbl.pdf)

Open the example projects from the application. The glass and CLT examples pass the checks using fictional project data. The grating example exceeds both the bending and deflection limits for the selected bar. The dossier prints to PDF, exports inputs and results as JSON, and includes the scoped structural and capacity status in IFC4. [Glass](examples/rekenvoorbeeld-glas.oss.json) · [Grating](examples/rekenvoorbeeld-rooster.oss.json) · [CLT and escape route](examples/rekenvoorbeeld-clt.oss.json)

## CNC tread profiles

Open **Onderdelen → Tredeblad → Trede frezen**. The board is placed with its top face up, grain along the front and a stock margin on all four sides. G54 XY zero is the lower-left corner of that stock and Z0 is the top. Use a centre-cutting end mill and a spoilboard with independent vacuum retention of tread and offcut. Review the parameters for the actual machine. The program cuts through the stock in steps. Shoulder relief is machined into the body of the tread to preserve the rectangular tongues.

The assembly check compares each tongue with the matching housing at the configured tool diameters, including rounded or relieved housing corners, pocket depth and material at the shoulder. Tread and stringer tools have separate settings. The stock CSV includes the CNC blank sizes. In **Calculatie**, choose the CNC blank to include the additional wood. The example pairs one winding tread with the two matching housing programs. [Tread setup sheet](examples/trede-cnc-opstelblad.pdf) · [Matched CNC package](examples/trede-met-wanghuizen.zip)

Run `npm run verify` for the model and postprocessor tests. The independent volumetric check and the native download check can be reproduced with `scripts/verify-machined-fit.py` and `scripts/verify-tread-transfer.py`. See their file headers for invocation details.

## Housed treads

Open `examples/halfslag-infrezingen.oss.json` for a right-hand winding stair. Select a tread number in the plan and follow a tongue link on its tread sheet to the mating pocket. **Wangbladen** also opens the stringers directly. Print the selected overview or enlarged pocket detail, or use **Alle wangbladen / PDF** for a complete, numbered set. **Naar CNC** opens the selected setup and pocket with the same local XY datum.

The default housing depth is 12 mm. The default clearance adds 0.4 mm in total to the tongue length and height. The shoulder setting keeps the tongue clear of tread ends and checks stock margins at the mitres. The tongue and pocket share the nominal insertion depth. The DXF contains nominal face and pocket contours, tread marks and a layer per pocket depth. The CNC view exports the tool-centre paths and Z levels in CAM JSON and the executable LinuxCNC program in `.ngc`. Dogbone relief accommodates the square corners of a tongue. The rounded alternative requires matching rounded tongue corners or chiselling.

Select a complete stringer or an individual housing in the CNC view. Neighbour checks include all housings on the stringer in either mode. Large programs reuse the XY toolpath at successive Z levels using LinuxCNC O-code subroutines. The sample package contains the project, workshop drawings and the DXF, CAM JSON and machine program for stringer TR-01-WG-L3. [Download the example package](examples/werkplaatsvoorbeeld-halfslag.zip). [LinuxCNC subroutine reference](https://linuxcnc.org/docs/stable/html/gcode/o-code.html).

Use the inside face upwards with Z0 at the face. Positive X runs from the low towards the high end of the stringer. X0/Y0 is the lower left corner of the blank envelope in the indicated view. Align the blank and set G54 to the drawing before simulation and a trial cut. The project stores the tool dimensions, feeds, pass depth, clearance height and corner finish. Files from earlier versions acquire joints when **Infrezingen toevoegen** is selected.

Run `npm run verify` for geometric fit, workshop quantities and CAM regression checks. The independent swept-cutter audit is in `scripts/verify-cutter-sweep.py`. The browser checks `scripts/verify-housing-sheet.py` and `scripts/verify-housing-transfer.py` accept a Vite URL. The transfer check also accepts `--desktop target/release/open-stair-studio.exe` to test the packaged Windows application.

The Bbl profiles implement a limited set of numeric checks derived from the cited source. Applicability depends on occupancy, new-build/existing-build status, egress use, project-specific rules and exceptions; a selected profile does not establish compliance. Structural design needs versioned Eurocodes, material specifications, project loads and expert-reviewed calculation examples.

## Files

- `src/stair.js` — stair family geometry, preliminary Bbl checks, quantity takeoff and estimate calculation.
- `src/App.svelte` — Blueprint workspace, editors, views, project persistence and exports.
- `src/style.css` — workspace and print styling.
- `docs/onderzoek-open-stair-studio.md` — product, factory, software, standards and BIM research.

## Product direction

Open [the half-turn example](examples/halfslag-rechts.oss.json) with the Project openen command. See [the research report](docs/onderzoek-open-stair-studio.md) for the implementation checks and production roadmap.


## Resttoestand en stabiliteit

The glass design also checks the remaining load carrying plies after one bearing ply breaks. Cantilever stairs report horizontal resistance and free edge displacement. Steel flights report stringer buckling resistance and the complete stair lateral resistance. Set the substrate, grade, edge distance, anchor spacing, product report and group resistances for each anchored connection. Incomplete evidence stays open in the calculation, workshop sheet and IFC4 properties.
