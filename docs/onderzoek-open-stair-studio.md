# Open Stair Studio — verdiepend product- en haalbaarheidsonderzoek

**Onderzoeksdatum:** 24 november 2026  
**Doel:** richting geven aan een nieuw OpenAEC-programma voor trapontwerp, toetsing, calculatie, werkvoorbereiding, CNC en BIM.  
**Basis:** code en documentatie van Open Frame Studio (OFS) in `C:\Bronbestanden\Open Frame Studio`.

## 1. Advies in één pagina

Bouw Open Stair Studio (OSS) als een **parametrisch, materiaal- en workflowgericht trapplatform** met één controleerbaar projectmodel. Begin niet met de belofte dat elk denkbaar product meteen normatief of CNC-gereed kan worden vrijgegeven. Er bestaan al volwassen trap-CAD/CAM-pakketten met sterke houttrapfunctionaliteit en machinekoppelingen. Een haalbaar onderscheid voor OSS is de open, navolgbare keten van BIM-inmeting en gebouwcontext tot trapmodel, regelcontrole, stuklijst, werkvoorbereiding en gevalideerde producentenuitvoer.

De kernbeslissing is een scheiding in expliciete statussen:

1. **Ontwerp** — geometrie en varianten, zonder conformiteitsclaim.
2. **Gecontroleerd** — benoemde geometrische, functionele en regelcontroles met projectcontext en bronversie.
3. **Gecalculeerd** — materiaal, onderdelen, verbindingen en kostendrivers volgens gekozen leveranciers-/rekenprofiel.
4. **Werkvoorbereid** — revisiebeheerde tekeningen, stuklijsten, bewerkingen en montage-informatie.
5. **Machinevrijgave** — alleen via een gevalideerde machine-, gereedschaps- en postprocessorconfiguratie; nooit via een generieke “CNC-export”.

PDF en IFC moeten vanaf de eerste werkende versie bruikbare uitgangen zijn. DXF/STEP en machinebestanden zijn aanvullende routes met eigen validatie. De extensie **IFCX** is in 2026 in ontwikkeling als een volgende, modulaire buildingSMART-familie; het is geen vervanging die nu al een stabiele, brede trapuitwisseling garandeert. Lever daarom gewone IFC4/IFC4.3-uitwisseling als de BIM-basis, houd IFCX als experimentele adapter achter een feature flag en schrijf nooit de eigen brongegevens alleen in IFC.

## 2. Wat we aantreffen in Open Frame Studio

OFS is een Tauri 2 desktopapp met een Svelte-UI en gedeelde Rust-kern (`ofs-core`), met SDK/WASM- en webonderdelen. De bestaande productindeling omvat onder meer project- en onderdeelmodellen, materiaal-/profielbibliotheken, berekeningen, werkplaatstekeningen, PDF, IFC, BCF, CNC/postprocessors, wijzigingsgeschiedenis, cloudscaffolding en leveranciersprofielen. De repository heeft al onderzoek naar software, fabrieksprocessen, BIM, IFC-acceptatie en een “alles-in-één”-gap-analyse.

De README en release-documentatie noemen expliciet dat sommige productieroutes en normcontroles indicatief of bèta zijn. Ook is het desktop/web/cloud-niveau niet gelijk. Dat is een nuttig ontwerpprincipe voor OSS: presenteer elke capability aan de hand van bewijs, invoer, profiel en status; laat het bestaan van een knop geen indruk van productiegeschiktheid wekken.

**Herbruikbaar:** shell en Blueprint-layout, projectverkenner, eigenschappen, undo/redo, bestand-/revisieworkflow, Rust-domeinkern, PDF- en IFC-ervaring, profielregistratie, postprocessorconcept, acceptatieprotocollen, meertaligheid en visuele taal.

**Niet blind hergebruiken:** kozijn-geometrie en kozijnspecifieke IFC-properties, profiel- en zaagmodellen, assumpties over toleranties, generieke norm-/certificeringsclaims en huidige CNC-postprocessors. Maak een eigen `oss-core`-domeinmodel en deel waar zinvol alleen generieke bibliotheken of UI-componenten. Het trapmodel is veel meer dan één extrusie: looplijn, aantreden, optredes, verdreven treden, bordessen, bomen/wangen, spil, balustrade, leuning, aansluitingen en vrije ruimte hangen geometrisch en functioneel samen.

## 3. Gebruikers en marktruimte

OSS heeft minstens vier verschillende gebruikersgroepen, met verschillende eisen aan hetzelfde model:

| Gebruiker | Wat moet het programma oplossen | Gewenste overdracht |
|---|---|---|
| Architect/tekenaar/BIM-modelleur | Ruimtebeslag, trapvorm, verdiepingsaansluiting, sparing, vrije hoogte, materiaalbeeld, revisies | IFC, PDF, eenvoudige geometrische uitwisseling |
| Trapontwerper/verkoper | Inmeten, configureren, visualiseren, prijsindicatie, varianten, offerte | Offerte-PDF, meetstaat, klantvisualisatie |
| Werkvoorbereider/constructeur | Exacte geometrie, normen, sterkte, detaillering, toleranties, aansluitingen, montagevolgorde | Berekeningsrapport, werkplaatstekeningen, onderdelen-IFC, DXF/STEP, stuklijst |
| Productie/CNC | Materiaalvoorraad, nesting, tools, bewerkingsvolgorde, machinegrenzen, postprocessor, vrijgave | Machine-native bestand en controleerbare productiekaart |

De producten van Staircon, Compass en StairDesigner laten zien dat parametrisch trapontwerp en productieautomatisering al een serieuze gespecialiseerde categorie vormen. Staircon biedt verkoop-, professional- en CAM-routes met 3/4/5-assige machinekoppelingen; Compass beschrijft een modulaire CAD/CAM-aanpak van geometrie/visualisatie tot CNC; de Nederlandse vertegenwoordiger Kamp noemt brede inzet onder trapfabrikanten. StairLabs richt zich op orderconfiguratie, nesting en productieplanning, ook in combinatie met data uit andere stairpakketten. SEMA dekt houtbouw en trappen binnen een bredere CAD/CAM-omgeving. Deze productclaims zijn leveranciersinformatie, geen onafhankelijke benchmark.

**Ruimte voor OSS:** niet “ook een trapgenerator” zijn, maar een open en inspecteerbare brug vormen tussen bouwcontext/BIM, ontwerp, eisencontrole en een trapfabrikant. De vraag of OSS ook de volledige niche-CAM moet vervangen, is een latere productkeuze. Koppel in het begin aan bestaande CAM- en machineketens.

## 4. Productscope: breed domein, gecontroleerde fasering

“Alle bedenkbare trappen” is een bruikbare richting voor het datamodel, niet een geloofwaardige eerste releaseclaim. Modelleer het domein zo dat bijzondere vormen niet onmogelijk worden, maar geef per vorm een helder supportniveau.

### Trapvormen die het domein moet kunnen beschrijven

- Rechte steektrap, enkele of meerdere steeklopen, tussen- en kwartbordessen.
- Kwart-, half-, dubbele kwart- en driekwartdraai; met bordes of verdreven/wenteltreden.
- Open, dichte, één- of tweezijdig ingesloten; onderkwart, bovenkwart, spil-/centrumbuis en boomconstructies.
- Spiltrap met ronde, elliptische of rechthoekige buitencontour.
- Gebogen trap met constante of veranderende straal; gebogen bomen, neuzen en leuningen.
- Waaier-/waaiertreden, bordesvarianten, asymmetrische of vrije vormen.
- Z-, U-, L-, zwevende/uitkragende, console-, monolithische en prefab betontrappen.
- Industriële, vlucht-, buiten-, kelder-, vliering- en tijdelijke trappen; ladders als verwant maar apart regelprofiel.
- Combinaties van hout, staal, aluminium, glas, natuursteen, beton en hybride draagconstructies.

### Voorstel supportniveaus

| Niveau | Reikwijdte | Wat er wél wordt geclaimd |
|---|---|---|
| A — concept | 2D/3D vorm en gebouwfit voor alle families | Visualisatie en ruimtebeslag; geen fabricage- of nalevingsclaim |
| B — parametrisch ontwerp | Rechte en gangbare kwart-/halfslag houttrappen, bordessen, bomen, leuningen | Maatvoering en reproduceerbare geometrie binnen ondersteunde varianten |
| C — werkvoorbereiding | Gevalideerde hout-/staalonderdelen, verbindingen, onderdelen-IFC, PDF, DXF/STEP en stuklijsten | Productie-informatie volgens benoemd materiaal-/leveranciersprofiel |
| D — machinevrijgave | Geteste machinefamilie, CAM-/postprocessorversie, gereedschap en proefonderdeel | Alleen voor expliciet gevalideerde configuratie |
| E — specialistisch | Spil, vrije curves, prefab beton, glas/natuursteen, complexe staalverbindingen | Per familie pas na domeinreview en acceptatie door producent/constructeur |

## 5. Normen en toetsing

### Bouwkundige eisen in Nederland

Het Bbl stelt eisen die afhankelijk zijn van gebruiksfunctie, nieuwbouw/bestaande bouw, vluchtroute, woonfunctie en projectcontext. IPLO behandelt onder andere afmetingen, bordessen, trapleuningen, afscheidingen, trapmarkeringen, vrije hoogte/doorgang en vluchtcapaciteit. Ook is er onderscheid tussen een reguliere trap en een trap uitsluitend voor ontvluchten. Dit betekent dat “trap voldoet” niet één profielschakelaar is. De regelmotor moet de gekozen gebruiksfunctie, toepasselijke Bbl-paragrafen, nieuwbouw/verbouwstatus en eventuele projectuitzonderingen registreren en iedere regel naar het relevante artikel terugleiden.

De eerste regelset moet een **traceerbare voorcontrole** zijn: maatregel, resultaat, meetmethode, invoer, projectcontext, bron/artikel, regelsetversie, waarschuwing en openstaande aannames. Een groene check is geen vergunningbesluit en geen vervanging van bevoegd gezag of deskundige.

### Constructieve berekening

Voor constructief ontwerp zijn minstens grondslagen en combinaties, gebruiksbelastingen, materiaalsterkte en details nodig. NEN noemt Eurocode 0 en Eurocode 1 (waaronder NEN-EN 1991-1-1 plus Nationale Bijlage) en Eurocode 5 voor hout. Voor staal en beton horen Eurocode 3 en 2 met bijlagen en projectspecifieke aansluit-/brandcondities erbij. De relevante generatie en nationale bijlage moeten per project aantoonbaar worden vastgelegd. NEN waarschuwt dat publicatiestatus en de regelgeving waarnaar het Bbl verwijst niet automatisch samenvallen; een nieuw gepubliceerde norm kan dus niet zonder controle als geldende projectbasis worden gekozen.

In 2026 is de tweede generatie NEN-EN 1995-1-1 als actuele publicatie verschenen, terwijl de regelgeving niet noodzakelijk tegelijk is overgeschakeld. De software moet daarom normversies beheren als data/configuratie, niet normconstanten hardcoderen of “nieuwste norm” gelijkstellen aan “wettelijk toepasselijk”. In vroege releases kunnen de resultaten beperkt blijven tot transparante geometrie- en plausibiliteitscontroles. Een constructieve berekeningsmodule vraagt gevalideerde modellen, belastingcombinaties, materiaaldata en onafhankelijke review.

### Kwaliteitsmodel toetsregels

- Elke regel krijgt ID, bron, geldigheidsdatum, toepassingsvoorwaarden, methode en testgevallen.
- Scheid wettelijke eis, constructieve check, ergonomische richtlijn, leveranciersregel en gebruikersvoorkeur.
- Geef `voldoet`, `voldoet niet`, `niet beoordeeld` of `onvoldoende gegevens`; nooit stilzwijgend “voldoet”.
- Bewaar een reproduceerbare snapshot van alle relevante invoer en regel-/profielversies bij ieder rapport.
- Laat fabrikant en constructeur een validatieprotocol en referentievoorbeelden tekenen vóór een vrijgaveclaim.

## 6. Van aanvraag tot CNC: aanbevolen workflow

1. **Project intake:** project-ID, klant, gebruiksfunctie, verdieping/hoogtes, bouwfase, land/regio en toepasselijke regelgeving.
2. **BIM/context:** IFC-model, verdiepingniveaus, vloeropeningen/sparingen, wanden, constructie en referentiecoördinaten inlezen; onzekerheden in geometrie tonen.
3. **Inmeting:** ruwe maatvoering, referentievlak, toleranties, meetbron en fotonotities vastleggen. Een bestaande trap/renovatie is niet hetzelfde als nominale nieuwbouwmaat.
4. **Configuratie:** trapfamilie, looplijn, aantal treden/hoogten, aantrede, breedte, draaiing, bordes, bomen, materiaal, balustrade en aansluitingen parametrisch vastleggen.
5. **Iteratie:** 2D-plattegrond, aanzicht, doorsnede en 3D gelijktijdig laten reageren; sparing, vrije hoogte, looplijn, botsingen en montage-/transportmaat bewaken.
6. **Controle:** Bbl-/projectregels en eventuele constructieve analyses als afzonderlijke controles uitvoeren; fouten koppelen aan modelobject en oplossingsopties.
7. **Calculatie:** materiaalgebruik, bruto/netto oppervlak, onderdelen, bevestigers, verspilling, arbeidstijden, afwerking, inkoop-/prijsboek, machine- en montagekosten tonen met instelbare tarieven en marge.
8. **Werkvoorbereiding (WVB):** onderdelen-ID, revisie, materiaal/kwaliteit, ruwe en afgewerkte maat, zaag-/frees-/boor-/lasbewerkingen, verbindingen, tolerantie, randafwerking, paklijst, montagevolgorde en tekeningstatus.
9. **Productie:** CAM-/machineprofiel kiezen; onderdeelgeometrie, gereedschap, opspanning, bereik, klemzones, botsingen en postprocessor vooraf controleren. Produceer preview/simulatie en revisiegebonden vrijgavebon.
10. **BIM/overdracht:** coördinatiemodel plus informatierijke samenstelling, IDS-/projectchecks, PDF-bundel en BCF-issuekoppeling; terugkoppeling van as-built/revisie.

Calculatie moet onderscheid maken tussen **offerteprijs**, **materiaalraming** en **productiecalculatie**. De prijslogica verschilt per producent en is commercieel gevoelig; werk met versieerbare, configureerbare prijsboeken en presenteer onderliggende hoeveelheden en aannames.

## 7. BIM, IFC, IFCX en PDF

### IFC

De officiële buildingSMART-pagina noemt IFC 4.3.2.0 (IFC4.3 ADD2 / ISO 16739-1:2024) als huidige officiële release en vermeldt IFC als object- en informatiestandaard met meerdere serialisaties. Gebruik `IfcStair` als samengestelde trap, `IfcStairFlight` per loop, bordessen als passende `IfcSlab`/elementen en relaties voor aggregatie/verbinding. IFC4.3 heeft trapvormen, flight-eigenschappen, hoeveelheden en fabricage-propertysets; eigenschappen zoals looplijn, aantrede, optrede en vrije hoogte moeten met de schema-/propertysetdefinities worden gemapt. Een trap als één generieke mesh verliest de informatie die nodig is voor BIM, planning en hoeveelheden.

Maak minimaal twee uitleverprofielen: (1) **coördinatie**: robuuste massa/geometrie en elementtype/plaatsing; (2) **onderdelen-/productieoverdracht**: stabiele GlobalId's, samenstelling, onderdeelgeometrie, materialen, eigenschappen, hoeveelheden, revisie/merk en kruisverwijzing naar stuklijst. Deze tweede route moet strikter en opt-in zijn. Gebruik een acceptatiematrix voor Revit, Tekla, Archicad, Solibri, Blender/Bonsai en ten minste één producentenpakket; een geldige STEP/parser zegt niets over correcte semantiek of importbruikbaarheid.

### IFCX

BuildingSMART beschrijft IFCX Core in 2026 als een project voor een minimale, modulaire en uitbreidbare basis die nog ontwikkeld, getest en gestandaardiseerd moet worden. Dit wijst op een toekomstige richting, geen stabiele interoperabiliteitsbasis voor de eerste OSS-release. De extensie `.ifcx` uit OFS-demobestanden mag daarom niet worden verward met een bewezen productie-uitwisselstandaard. Scheid interne OSS-projectdata van IFC-serialisatie en IFCX-prototypes.

### PDF

PDF is het betrouwbare leesbare dossier voor offerte, controle en werkplaats. Maak sjablonen voor:

- offerte-/ontwerpblad met 3D-beeld, maten, materiaal, aannames en status;
- plattegrond, doorsneden, aanzichten, detailaanzichten en sparing-/aansluitmaten;
- trapstaat, looplijn, treedtabel, balustrade/leuning en maatcontrole;
- onderdelenlijst, materialenstaat, zaag-/bewerkingslijst, bevestigers en gewicht;
- WVB-/montagepakket met revisie, toleranties, volgorde, markeringen en verpakkings-/transportnotities;
- controle-/berekeningsrapport met normbasis, input, uitkomst en niet-beoordeelde punten.

Elke pagina hoort projectnummer, trapmerk, revisie, datum, auteur, schaal/eenheden en expliciete documentstatus te bevatten. “PDF uitgegeven” is niet hetzelfde als “productievrijgegeven”.

## 8. Concurrenten, fabrieken en ecosysteem

| Systeem/bron | Zichtbare positionering | Implicatie voor OSS |
|---|---|---|
| [Staircon](https://www.staircon.com/) | Modulaire niveaus voor verkoop en 3D-presentatie, beperkte/professionele productie, 1:1-productietekeningen en optionele DXF; CAM voor 3/4/5 assen, met een uitgebreider 5+-profiel voor boogdetails en Z-optredes | Productstructuur moet van configurator via detailtekening naar gevalideerde machinekoppeling kunnen groeien. CNC-ondersteuning is een expliciet niveau, geen generieke exportknop |
| [CNC-ware — Staircon](https://www.cncware.eu/en/staircon/) | Nederlandse implementatie-/supportpartner voor Staircon, met online configurator, implementatie en koppeling naar CNC; verwante tools richten zich op digitaal inmeten en laserprojectie in productie | Lokale implementatie, training, meetapparatuur en machineacceptatie horen bij de productketen; OSS kan die implementatiebehoefte niet alleen met een bestandsformaat oplossen |
| [Compass Software](https://compass.pixelconsult.de/us/stair-manufacturing/design) | Modulair ontwerp, visualisatie en productie, meerdere traptypen; CAD/CAM | Marktbenchmark voor diepte en schaalbaarheid; onderzoek koppeling in plaats van volledige CAM-pariteit |
| [Kamp Automatisering / Compass NL](https://trappensoftware.nl/) | Nederlandse leverancier/implementatiepartner; noemt meer dan honderd gebruikers onder NL-trapfabrikanten en CNC-koppelingen | Waardevolle doelgroep voor discovery; aantallen zijn leveranciersclaim en moeten in gesprekken worden bevestigd |
| [StairDesigner / Wood Designer](https://wooddesigner.org/stairdesigner-software/) | Parametrische houttrapgeometrie, onderdelen- en snijlijsten, werkplaatsmappen, 1:1-templates en postprocessoruitvoer voor CAM/CNC | OSS moet lopen, maatvoering, vrije hoogte, onderdelen en werkplaatsoutput als samenhangende ontwerpdata behandelen |
| [Hantos — StairDesigner](https://www.hantos.nl/2016/05/stairdesigner/) | Nederlandse verkooppagina (2016) noemt steek-, onder-/bovenkwart-, spil-, ronde, bordes- en S-trappen, verschoven looplijn, verschillende boomtypen en zaaglijsten | Handig historisch bewijs van lokale gebruikersvragen; de pagina is oud en is geen bevestiging van actuele softwaremogelijkheden |
| [Prodim Stairs](https://www.prodim-systems.nl/producten/stairs/) | Proliner-gestuurde inmeting van bestaande treden in diverse materialen; bewerking van meetresultaat, controle/optimalisatie en DXF-/PDF-uitvoer | Renovatie/inmeting vraagt een eigen workflow van ruwe meetpunten naar bewerkbare trapvorm; nominale nieuwbouwmaten volstaan daar niet |
| [DDX PowerSTAIRS](https://www.ddxgroup.com/en/software/wood/powerstairs/) | Parametrische trapmodellen en eigen modelbibliotheek, 3D-plattegrond, dragende constructies, uiteenlopende vormen en CNC-integratie binnen een CAD/CAM-productieketen | Modelbibliotheek en regels moeten aan componenten en productiemethoden gekoppeld zijn; trapfamilies zijn geen los uiterlijkssjabloon |
| [De Vries Trappen — BIM](https://www.devriestrappen.nl/seriematige-trappen/bim/) | BIM/3D-presentatie voor projectcontext en kopersconfiguratie, naast seriematige/prefab levering | BIM-waarde zit zowel in vroege clash-/presentatiecontext als in herhaalbare serie- en montageoverdracht |
| [SEMA](https://www.sema-soft.com/en/) | CAD/CAM voor houtconstructie en trappen | Benchmark voor aansluiting trap op houtbouw/gebouwmodel |
| [StairLabs](https://stairlabs.com/software) | Orderconfiguratie, materiaaloptimalisatie, productieplanning; koppelt aan bestaande trapsoftware | Mogelijke partner/benchmark voor calculatie en fabrieksworkflow |
| [WOODWEB CNC/trapdiscussie](https://woodweb.com/knowledge_base/CNC_StairBuilding_Capabilities.html) | Praktijkdiscussie over CNC-capaciteit, machines, kosten en traponderdelen | Gebruikerssignaal: workflow, ervaring en handwerk variëren; forum is anekdotisch en geen productspecificatie |

**Fabrieksonderzoek dat nog nodig is:** interview een kleine maatwerk-trappenmaker, middelgrote serieproducent, staaltrapbedrijf, prefab betonfabrikant en een trapmonteur/werkvoorbereider. Breng per locatie machinepark (merk, besturing, assen, opspanning), huidige CAD/CAM, ERP/prijsboek, meetmethode, revisieprocedure, fout-/herstelkosten, handmatige uitzonderingen en gewenste BIM/klantdocumenten in kaart. Vraag een geanonimiseerde echte opdracht en laat die door de huidige keten lopen. Een verkoopdemo is geen vervanging voor een proeforder.

### Wat deze productvergelijking verandert aan het OSS-scherm

De startpagina hoort geen losse meetdemo te zijn. Ze hoort de trapfamilie, project-/trapgatcontext, 3D-model en eigenschappen naast elkaar te tonen, met duidelijke documenttabs voor plan, doorsnede, onderdelen, CNC en BIM. Het lint organiseert de taak per fase: trap configureren, geometrie/looplijn controleren, werkplaatsdocumenten maken en machine/BIM-overdracht volgen. Dat sluit aan op de werkelijke softwareketens van Staircon en PowerSTAIRS, de maat-/vrije-hoogtechecks en 1:1-templates van StairDesigner, Prodim's meet-naar-CAD-route en de bouwcontext van de De Vries BIM-toepassing. In de OSS-prototype-interface zijn die werkruimten zichtbaar; hun productievrijgave blijft bewust geblokkeerd tot partnerspecifieke validatie.

## 9. Aanbevolen technische architectuur

### Domeinmodel

Eén bronmodel met aparte, versieerbare objecten voor `Project`, `StairAssembly`, `Flight`, `Landing`, `Tread`, `Riser`, `Stringer`, `Spindle`, `Railing`, `Handrail`, `Connection`, `Support`, `Opening`, `BuildingReference`, `MaterialSpec`, `Operation`, `RuleCheck`, `Estimate`, `Revision` en `MachineProfile`. Sla eenheden expliciet op en gebruik numerieke toleranties met vaste afrondingsregels.

Maak onderscheid tussen:

- **nominale ontwerpgeometrie**;
- **afgewerkte onderdelen**;
- **ruwe voorraadmaten en verspaningstoegift**;
- **montage-/referentiegeometrie**;
- **fabricagebewerkingen en machine-setup**.

Geometrie moet parametrisch herberekenbaar zijn. Beperk de eerste kern tot stabiele 2D/3D bouwstenen, maar zorg dat gewelfde looplijnen en niet-rechthoekige componenten later niet een nieuw model vereisen.

### Modules in OFS-stijl

- `oss-core`: geometrie, constraints, trapfamilies, eenheden, calculaties, regelmotor en outputmodel.
- UI-editor: plattegrond/aanzicht/doorsnede/3D en eigenschappen, met gedeeld OpenAEC Blueprint-shell.
- Bibliotheken: materiaal, doorsneden, verbindingen, beslag, normen, prijsboeken, machineprofielen en leveranciersprofielen; metadata met eigenaar, versie en geldigheidsperiode.
- Import/export: IFC4/4.3, IFCX-experiment, PDF, DXF, STEP, CSV/XLSX en BCF.
- WVB/CAM-adapters: neutraal bewerkingsmodel plus gevalideerde postprocessors; machineconfiguratie buiten geometriekern houden.
- SDK/API: later pas na stabiel kernschema, met formele schema-/versiecompatibiliteit.

Niet starten met cloud-ERP, volledige ingebouwde CAM, generatieve AI of een allesomvattende leverancierbibliotheek. Eerst is een reproduceerbare geometrie-/regels-/exportketen waardevoller.

## 10. Roadmap en beslispoorten

| Fase | Levering | Bewijs dat klaar is |
|---|---|---|
| 0 — discovery | Fabrieksinterviews, 3 echte trapdossiers, norm-/BIM-profielen, concurrentmatrix | Gevalideerde MVP-gebruiker, use cases, interfaceverzoeken en expliciete scope |
| 1 — concept en BIM fit | Projectbasis, gebouw-/IFC-inleescontext, geometrie van rechte en kwartslag houttrap, 2D/3D, maatvoering, concept-PDF en IFC-coördinatie | Referentiemodellen openen en maten sluiten; expliciet ontwerpstatus |
| 2 — houttrap-WVB | Aantrede-/optredetabel, trapstaat, materialen, boom/treden, stuklijst, detailtekeningen, versie/revisie en calculatie-invoer | Fabrieksreview van maatstaat/tekeningen; onderdelen passen in referentieproef |
| 3 — regelprofiel NL | Bbl-/gebouwfunctieprofiel, traceerbare controles, issue-/rapportuitvoer, testcases | Juridisch/technisch deskundige beoordeelt regelmapping en voorbeelden |
| 4 — producentenadapter | Eén fabrikantprofiel en één machine/CAM-keten, inclusief simulatie en proefproduct | Volledige proeforder, terugmeting, versievaste postprocessor en ondertekend acceptatierapport |
| 5 — uitbreidingen | Spil/curves, staal, hybride, prefab beton, internationale regelprofielen, prijs-/ERP-API's | Per materiaal/familie onafhankelijke specialist en leveranciersvalidatie |

**Aanbevolen MVP:** parametrisch ontwerp en BIM-coördinatie voor gangbare houten steek-, kwartslag- en halfslagtrappen; gecontroleerde geometrie- en Bbl-voorchecks; onderdelenstaat/maatwerkplaatstaat; offerte-, ontwerp- en werkvoorbereidings-PDF; IFC4/IFC4.3-coördinatie-export. Een eerste CNC-uitvoer pas na een expliciete partner en proefmachine. Dit sluit aan op de bewezen OFS-aanpak van kleine capability-slices, maar vermijdt een ongetoetste machineclaim.

## 11. Risico's en mitigaties

| Risico | Waarom relevant | Mitigatie |
|---|---|---|
| Scope wordt “alle trappen, alle materialen” | Ontwerptaken, normen, fabricage en markt verschillen per familie | Capability-level per familie; MVP begrenzen, datamodel breed houden |
| Normen verkeerd of verouderd | Bbl-context, nationale bijlagen en normgeneraties veranderen | Versiebeheer, toepasselijkheid tonen, specialist review, geen stille defaults |
| CNC-bestand past niet op de machine | Machine, besturing, postprocessor, gereedschap en opspanning bepalen resultaat | Partneracceptatie, simulatie, proefdeel, vrijgavepoort; nooit generieke G-code voor trapdelen |
| IFC-model is alleen visueel | Semantiek, onderdelenrelaties en eigenschappen kunnen ontbreken | Use-casegerichte MVD/IDS, parser plus echte-software acceptatie |
| “Calculatie” suggereert een gegarandeerde offerte | Inkoop, arbeid, afval, marge en capaciteit verschillen per bedrijf | Configureerbare versieerbare prijsboeken; raming versus bindende offerte expliciet labelen |
| Meetfout of gewijzigde bouwkundige situatie | Een trap moet passen tussen echte vlakken en sparingen | Meetreferentie, tolerantie en onzekerheid opslaan; fit-check en as-built revisie |
| Overbouw van bestaande software | Staircon/Compass/SEMA zijn diep geïntegreerd bij fabrikanten | Discovery en adapters eerst; vervangen pas waar OSS aantoonbaar beter/interoperabel is |

## 12. Vervolgonderzoek / eerstvolgende acties

1. Plan 8–12 gestructureerde gesprekken met trapfabrikanten, één constructeur, twee monteurs, twee architecten/BIM-modelleurs en machine-/CAM-partners.
2. Verzamel minimaal drie geanonimiseerde referentieprojecten: standaard woningtrap, renovatie met afwijkende maatvoering en maatwerk-/gebogen of industriële trap.
3. Inventariseer concrete machine-/CAM-ketens van de gesprekspartners en vraag om voorbeeldbestanden en acceptatiecriteria; geen postprocessor bouwen op marketinginformatie.
4. Maak een regelmatrix voor Bbl-gebruiksfuncties en grensgevallen; controleer actuele wettelijke verwijzingen bij de start van implementatie.
5. Maak IFC4.3-proefmodellen met `IfcStair`-aggregatie en afzonderlijke flights, landings, leuningen en onderdelen; valideer met buildingSMART-validatie en echte ontvangers.
6. Beslis na discovery of eerste doelgroep (A) architect/BIM voor coördinatie, (B) kleine houten trapmaker voor werkvoorbereiding, of (C) producent voor quote-to-CNC is. Kies één hoofdgebruiker voor MVP.

## Bronnen

### Open Frame Studio — lokale basis

- [Open Frame Studio README](C:/Bronbestanden/Open%20Frame%20Studio/README.md)
- [Open Frame Studio PLAN](C:/Bronbestanden/Open%20Frame%20Studio/PLAN.md)
- [Marktonderzoek kozijnsoftware en BIM](C:/Bronbestanden/Open%20Frame%20Studio/docs/marktonderzoek-kozijnsoftware-en-bim.md)
- [Onderzoek profielsystemen en fabrieksprocessen](C:/Bronbestanden/Open%20Frame%20Studio/docs/onderzoek-profielsystemen-en-fabrieksprocessen.md)
- [IFC-acceptatie Revit, Tekla, SketchUp en hsbCAD](C:/Bronbestanden/Open%20Frame%20Studio/docs/ifc-acceptatie-revit-tekla-sketchup-hsbcad.md)
- [Alles-in-één gap-analyse](C:/Bronbestanden/Open%20Frame%20Studio/docs/alles-in-een-gap-analyse.md)

### Regelgeving en normen

- [IPLO — Trappen: regels bij nieuwbouw](https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/trappen/)
- [IPLO — Afscheiding vloer, trap en hellingbaan](https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/afscheiding-vloer-trap-hellingbaan/)
- [IPLO — Bbl en woning (infoblad)](https://iplo.nl/publish/pages/245968/infoblad-besluit-bouwwerken-leefomgeving-en-woning_200223-februari-2026-2-.pdf)
- [NEN — overzicht Eurocodes](https://www.nen.nl/bouw/constructieve-veiligheid/eurocodes)
- [NEN — NEN-EN 1995-1-1:2026](https://www.nen.nl/en/nen-en-1995-1-1-2026-en-345824)

### Software en productiepraktijk

- [Staircon](https://www.staircon.com/)
- [Compass Software — stair design](https://compass.pixelconsult.de/us/stair-manufacturing/design)
- [Kamp Automatisering / trappensoftware.nl](https://trappensoftware.nl/)
- [StairDesigner](https://wooddesigner.org/stairdesigner-software/)
- [SEMA](https://www.sema-soft.com/en/)
- [StairLabs](https://stairlabs.com/software)
- [WOODWEB — CNC stair-building capabilities (forum)](https://woodweb.com/knowledge_base/CNC_StairBuilding_Capabilities.html)
- [WOODWEB — digital measuring for staircase work (forum)](https://woodweb.com/knowledge_base/Digital_Measuring_for_Staircase_Work.html)

### BIM / open standaarden

- [buildingSMART — IFC](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/)
- [IFC4.3 — IfcStairFlight](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcStairFlight.htm)
- [IFC4.3 — IfcStairTypeEnum](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcStairTypeEnum.htm)
- [IFC4.3 — Pset_StairFlightCommon](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/Pset_StairFlightCommon.htm)
- [buildingSMART — IFCX Core & Modularisation project (2026)](https://www.buildingsmart.org/ifcx-core-modularisation-project-update/)


## 13. Implementatiecheckpoint OSS 0.2.0

Dit is een werkende productdoorsnede binnen de prototypegrens, geen volledige fabrikantrelease.

### Ingebouwd en zelf gecontroleerd

- Eén projectbestandmodel voor projectidentiteit, revisie, trapmaatvoering, gebouwinvoer, prijs-/arbeidsaannames en regelprofiel. Lokale autosave, `.oss.json` openen/opslaan en undo/redo zijn aangesloten.
- Vier parametrische houttrapconcepten: steektrap, onderkwart, twee rechte lopen met tussenbordes en halfslag. Treden, bordessen, hellende prismatische trapbomen, plattegrond, isometrie en onderdelenstaat komen uit dezelfde kern.
- Trapbreedte is buitenwerks inclusief de twee trapbomen; de tredebreedte is de netto maat ertussen. Plattegrond en DXF laten treden, bordessen en trapbomen op eigen lagen zien.
- Voorcalculatie met netto bruto-prisma-volume, ingevoerde uitval, houtprijs, arbeid, opslag en verkoopmarge. Kosten zijn ramingen op gebruikersaannames; beslag, afwerking, montage, transport, btw, inkoopcondities en zaagoptimalisatie zitten er niet in.
- Werkvoorbereiding: PDF via afdrukdialoog, CSV-onderdelenstaat en DXF-plancontouren in mm.
- IFC4-coördinatie-export via web-ifc: `IfcProject` / `IfcSite` / `IfcBuilding` / `IfcBuildingStorey`, `IfcStair`, geaggregeerde `IfcStairFlight`-objecten, `IfcSlab`-bordessen, uitgetrokken geometrie en een `Pset_OpenStairStudio_Design` met trapgegevens. De export wordt direct opnieuw ingelezen; schema, aantal trappen, vluchten, bordessen en verwachte extrusies worden geteld voordat de download slaagt.
- De CNC-route blijft geblokkeerd. Er is geen gevalideerd CAM-model, machineprofiel of postprocessor.

De IFC-uitvoer is IFC4 en bedoeld voor coördinatie. Er zijn nog geen IDS/validatiefixtures, ontvangertests in Revit/Tekla/andere software, gebouwmodelimport, clash-/sparingsfit of contractueel geaccepteerde export. De solids zijn ontwerpbenaderingen: rechthoekige treden, rechthoekig bordes en prismatische trapbomen. Ze zijn geen fabrikantcontouren of productiematen. IFCX is niet geïmplementeerd; houd IFC4 als uitwisselbasis totdat IFCX en ontvangerondersteuning stabiel en getoetst zijn. De IFC-opbouw volgt de IFC-semantiek waarin een trap vluchten en bordessen aggregeert; een `IfcStairFlight` beschrijft één loop zonder onderbreking door een bordes. Zie de [buildingSMART-definitie van IfcStairFlight](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcStairFlight.html) en [web-ifc, de gebruikte reader/writer](https://github.com/ThatOpen/engine_web-ifc).

### Beperkte Nederlandse dimensionele voorcontrole

De standaardprofielen in deze versie zijn expliciet beperkt tot nieuwbouwprofielen. De woonfunctie gebruikt minima/maxima uit Bbl-tabel 4.26: volle trapbreedte 800 mm, vrije hoogte 2.300 mm, aantrede 220 mm ter plaatse van de klimlijn, optrede maximaal 188 mm, tredevlak minimaal 50 mm en 230 mm ter plaatse van de klimlijn, plus maximaal 4 m hoogteverschil. Overige gebruiksfuncties en uitsluitend ontvluchten gebruiken in deze tabel onder meer 2.100 mm vrije hoogte, 185 mm minimumaantrede en maximaal 210 mm optrede. Ook de opgegeven bovenbordesruimte van minimaal 800 × 800 mm wordt als invoergrens weergegeven. IPLO legt de context en uitzonderingen uit op de [trappenpagina](https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/trappen/); de wettelijke tabel staat in het [Bbl, art. 4.26](https://wetten.overheid.nl/BWBR0041297/2026-07-01).

De controle van 230 mm tredevlak neemt `aantrede + neusoverstek` aan als beschikbare tredevlakmaat. Dat is een expliciete geometrische benadering en moet met de exacte meetdefinitie en projectdetails door een deskundige worden beoordeeld. Leuningen, balustradeopeningen, markeringen, regenwerendheid, doorstroomcapaciteit, gebruiksfuncties met extra eisen, bestaande bouw, verbouw, particulier opdrachtgeverschap, maatwerkregels en gelijkwaardige maatregelen zijn nog niet volledig getoetst. Trapgatmaten worden bewaard en getoond, maar sparingspositie en vrije hoogte worden niet geometrisch berekend. Een groen resultaat betekent alleen dat de beperkte ingestelde voorwaarde in het ingevoerde model past; het betekent niet dat de trap aan alle wet- of normvereisten voldoet.

Constructieve sterkte, doorbuiging, verbindingen, materiaalsterkte en belastingscombinaties zijn niet berekend. Normteksten zijn geen inbegrepen calculatiebron: de relevante ontwerpstandaarden en nationale bijlagen moeten formeel worden beheerd. NEN publiceert inmiddels [NEN-EN 1995-1-1:2026](https://www.nen.nl/en/nen-en-1995-1-1-2026-en-345824); een normgeneratie kiezen is op zichzelf onvoldoende om een houten trap constructief te beoordelen.

### Eigen controles in deze checkpoint

- Verificatie wordt herhaald met `npm run build`, `npm run verify:stair` (alle vier families; IFC4 opnieuw openen en entiteiten tellen) en `cargo check --manifest-path src-tauri/Cargo.toml`.

Deze controles bewijzen geen CNC-productiegeschiktheid, structurele veiligheid, volledige Bbl-conformiteit of interoperabiliteit met een specifieke BIM-ontvanger. De eerstvolgende volwassenheidsstap is IFC4-ontvangertests, drie echte geanonimiseerde trapreferenties, een gevalideerde sparings-/vrijehoogtemotor en een fabrieksreview van de bruto onderdelenstaat.

### Hercontrole met Astra, 24 november 2026

| Onderdeel | Gereproduceerd en hersteld | Uitgevoerde controle |
| --- | --- | --- |
| Tekening en stukstaat | De kwartslag en halfslag hadden een bordes dat over de eerste vlucht lag. De stukstaat gebruikte de buitenwerkse breedte voor de treden. De hellingshoek hing af van de bordeslengte. | 32 maatvarianten over vier families, met controles op bordesnaden, uitgevouwen doorsnede, tredebreedte, boomcontour en volume. |
| IFC4 | Relatie-attributen stonden op de verkeerde positie en millimeterwaarden in eigenschappen erfden de projecteenheid meter. | IfcOpenShell controleerde de vier bestanden tegen het IFC4-schema en de EXPRESS-regels. Tessellatie van in totaal 82 solids leverde per trap de verwachte buitencontour en het houtvolume op. |
| Werkvoorbereiding | De DXF miste gegevens die een CAD-lezer nodig heeft voor gesloten polylijnen. Op de PDF verschenen bedieningsknoppen en tijdelijke meldingen. | Via Edge voor alle vier families gedownload. ezdxf opende de lagen en gesloten contouren zonder reparaties. Aantallen uit de CSV vergeleken met de DXF. De A4-onderdelenstaten op inhoud gecontroleerd en een proefblad visueel nagezien. |
| Projectbeheer | Openen van een bestand behield de vorige herstelkopie en bewerkingsgeschiedenis. | Openen, herladen, ongedaan maken, opnieuw uitvoeren, opslaan en beschadigde invoer doorlopen in een tijdelijk browserprofiel. De referentiecalculatie kwam uit op € 2.200. |
| Voorcontrole | De hoogte van een hele trap met tussenbordes veroorzaakte dezelfde 4-meterfout als een enkele vlucht van die hoogte. Ontbrekende bordesmaten werden als nul behandeld. | Referentie van 4.500 mm met één vlucht en met twee vluchten, aangevuld met grensgevallen voor bordesmaat en geometrie zonder regelprofiel. Zie de uitleg over tussenbordessen bij [IPLO](https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/trappen/). |

De gebouwde Windows-app is met een tijdelijk WebView2-profiel gestart. De IFC-knop schreef vanuit de ingebouwde applicatie een leesbaar IFC4-bestand. De acceptatie in specifieke BIM-pakketten en de fabrieksvalidatie van de trapboomaansluitingen blijven open.

## 14. Verdreven trappen in OSS 0.3.0

In **Trap ontwerpen** zijn twee families toegevoegd voor een doorlopende kwartslag en halfslag. De stapafstand bepaalt de stations langs de klimlijn. Het aantal boogtreden per kwart bepaalt samen met die stapafstand de straal. De richting van de voorranden verloopt geleidelijk in de overgang naar de rechte lopen. De draairichting, bochtpositie en haakse of gefacetteerde buitenwang zijn instelbaar. De smalle binnenwang volgt de bocht in rechte segmenten. Bij een onmogelijke binnenstraal of kruisende tredegrenzen geeft de editor aan welke maat moet veranderen.

**Van tekening naar werkplaats.** Een klik op een tredenummer opent het bijbehorende tredeblad. Dat bevat de plaatcontour inclusief neus, de ruwe plankmaat met nerf evenwijdig aan de voorrand, de bovenkant en de maten bij de klimlijn. De afzonderlijke DXF gebruikt millimeters en de lokale plankcoördinaten. De plan-DXF houdt de klimlijn en nummering op aparte lagen. De CSV vermeldt netto en bruto houtvolumes. De raming gebruikt de bruto delen plus de ingevoerde uitvalfactor. Voor de nieuwe families is de wanghoogte verticaal gemeten. Opeenvolgende wangdelen delen hetzelfde verstekvlak.

**Maatcontrole.** Bij de klimlijn meet het model loodrecht op de voorrand tot de fysieke begrenzing van de volgende trede of het tredevlak. De voorcontrole vermeldt het merk met de kleinste maat. Bij de starterkwartslag met een ingestelde stapafstand van 220 mm is dat afgerond 218,8 mm aantrede. De maat langs de korte wangzijde is beschikbaar voor werkvoorbereiding. Voor de volledige beoordeling van het smalle einde blijft de loodrechte maat volgens de toepasselijke meetdefinitie te beoordelen. Zie tabel 4.26 in de [officiële publicatie van het Bbl](https://zoek.officielebekendmakingen.nl/stb-2018-291.html).

**Controles met Astra.** De geometrieproef doorliep 1.280 varianten en toetste onder meer aansluiting, spiegeling, polygonen, gesloten wangvolumes en plankmaten. Via de editor zijn PDF, CSV, plan-DXF, individuele trede-DXF en IFC-bestanden gecontroleerd. De acht windingcombinaties (twee families, beide draairichtingen en beide buitenwangen) zijn onafhankelijk geopend in IfcOpenShell. Per trap controleerde de proef het type windingtrap, één doorlopende `IfcStairFlight`, de tredecontouren en peilen, de wangvolumes en de verstekaansluitingen. Samen bevatten die acht modellen 136 treden en 114 wangdelen met 98 aansluitingen. De vier bestaande families blijven onderdeel van de regressieproeven.

Een te openen [voorbeeldproject](../examples/halfslag-rechts.oss.json) en [de commando's voor de controles](../README.md) horen bij de werkversie. De constructieve dimensionering, frezingen en machinevrijgave vragen afzonderlijke uitwerking.

## 15. Ingefreesde treden in OSS 0.4.0

Elke lip krijgt een referentie naar de trede en de ontvangende trapboom. Bij een verdreven trede kan de zijrand langs twee of meer wangdelen lopen. Per deel bepaalt de software waar de lip past, rekening houdend met de trededikte, de neus, de schoudermaat en beide zijden van het verstek. Onvoldoende oplegging of overlappende huizen worden als geometriefout getoond. De werkplaats kan de insteekdiepte, de totale speling en de schoudermaat per trap instellen.

Op het tredeblad staat de zaagcontour inclusief lippen. Elke lip verwijst naar het bijbehorende wangblad. Dit blad bevat het binnenaanzicht, het lokale nulpunt, de coördinaten van de pocket en de bodemdiepte. De lokale DXF bevat de nominale maat. Het vergrotingsdetail laat daarnaast het bereik van de ingestelde frees zien. De calculatie gebruikt het bruto plankvolume en de onderdelenstaat telt de nominale uitsparingen mee in het netto wangvolume. Het IFC4-model vermeldt de verbindingsparameters bij de trap.

De CNC-overdracht gebruikt voor elke opspanning millimeters, G54 en Z0 op het binnenvlak. De werkplaats kiest een frees en bepaalt de voedingen, de dieptes per gang en de hoekafwerking. Het programma freest de kamer uit en werkt de omtrek af. Bij hoekontlasting maakt de frees ruimte voor de rechte hoeken van de lip. De machinebesturing en de inrichting van de eigen opspanning bepalen de fysieke toepasbaarheid. [LinuxCNC G-code](https://linuxcnc.org/docs/stable/html/gcode/g-code.html)

De controle van de passing vergeleek 918 lip-huisparen in 24 geometrieën met de oorspronkelijke 3D-wang. In een afzonderlijke controle zijn voor twaalf afwijkende configuraties 146 geschreven NC-programma’s en hun wang-DXF’s teruggelezen. Daarbij zijn freesbanen voor 532 lippen met de werkelijke contouren en wangdoorsneden vergeleken. De geometrische verificatie omvat beide draairichtingen, beide buitenwangvormen en de verstekken. Een fysieke proefbewerking en montageproef staan open. [Voorbeeldproject](../examples/halfslag-infrezingen.oss.json) · [Wangblad met detail](../examples/wangblad-infrezing.pdf)

## 16. Trede-CNC en engineering in OSS 0.5

Het tredeblad opent de bewerking van de volledige trede met haar insteeklippen. Het CNC-nulpunt ligt op de bovenzijde bij de linkeronderhoek van de overmaatplank. De freesbaan maakt plaats bij de lipwortels en houdt het rechte dragende deel van elke lip intact. De pascontrole toetst beide freesopstellingen, de schouder, de diepte en de beschikbare opening per wanghuis. In de calculatie kiest de gebruiker of de inkoopmaat ook de opspanranden omvat. [Opstelblad van een verdreven trede](../examples/trede-cnc-opstelblad.pdf) · [Trede en passende wangprogramma’s](../examples/trede-met-wanghuizen.zip)

De onafhankelijke NC-simulatie reconstrueerde trede en wang uit de geschreven bewegingen en freesdiameters. In zestien assemblages zijn 261 treden en 582 verbindingen doorgerekend. 244 treden pasten in het gesimuleerde volume. De 17 treden van de opzettelijk te krappe proef raakten de ronde hoeken en werden geblokkeerd. Ook een frees van 6 mm die een volledige schouder van 6 mm wegnam, leidde na correctie tot een blokkade. [Volumetrische regressie](../scripts/verify-machined-fit.py)

In het engineeringdossier wordt het tredesysteem onafhankelijk van het gebruik vastgelegd. Voor glas horen daar onder meer laminaatopbouw, gedrag na breuk en oplegdetails bij. Voor staalroosters zijn de draagstaafrichting, overspanning en de belastingtabel van het gekozen product nodig. CLT vraagt gegevens over laagopbouw en draagrichting. Bij bijzondere ontwerpen beschrijft de ontwerper het constructieprincipe. Voor een vluchtroute worden bezetting, capaciteit en brand- en rookbescherming apart beoordeeld. [NEN 2608](https://www.nen.nl/nen-2608-2026-nl-345335) · [IPLO over trappen en vluchtroutes](https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/trappen/)

Het eenvoudige rekenmodel levert momenten en oplegreacties voor een vrij opgelegde overspanning met twee afzonderlijke belastinggevallen. De productweerstand en de routecapaciteit staan als open verificaties in het dossier. De PDF en JSON leggen de aannames vast. IFC4 draagt per trede de opgegeven systeemeigenschappen over. Rooster- en maatwerktreden krijgen een open referentievlak, glas en CLT een nominale omhulling. [Bewerkbaar glasvoorbeeld](../examples/engineering-glas-vluchtroute.oss.json) · [Bijbehorend engineeringdossier](../examples/engineering-glas-vluchtroute.pdf)
