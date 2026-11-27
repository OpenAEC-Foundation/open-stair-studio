# BIM-vergelijking met gepubliceerde IFC-trappen

Op 27 november 2026 zijn tien openbare IFC-bestanden met veertien trappen doorgemeten. Alle 241 onderdelen met een eigen geometrische representatie binnen deze trappen konden als driehoeksnet worden opgebouwd. De vergelijking onderzoekt welke maten, objecten en relaties een ontvangende BIM-toepassing uit het bestand kan halen.

## Houten trappen van De Vries Trappen

De leverancier publiceert de trapgatmaten bij de downloads. De kolom met modelmaten hieronder geeft de omhullende doos van álle gemodelleerde traponderdelen, inclusief uitstekende bomen of spillen, langs de wereldassen. Optrede en aantrede komen uit de eigenschappenset `CS_Set_Dimensions`. De controle gebruikte telkens het bestand met suffix `-L.IFC` uit de ZIP. [Downloadcatalogus De Vries Trappen](https://www.devriestrappen.nl/downloads/)

| Trap en fabrikantbestand | Trapgat volgens catalogus (mm) | Onderdelen | Modelmaat X × Y × Z (mm) | Optrede / aantrede (mm) | SHA-256 van IFC, eerste 12 |
| --- | --- | ---: | --- | --- | --- |
| [Steek, open](https://www.devriestrappen.nl/friksbeheer/wp-content/uploads/2019/09/Steektrap-open-3300x900-IFC.zip) | 3300 × 900 | 19 | 3378 × 880 × 3000 | 187,5 / 220 | `6d4f16d9ed7b` |
| [Steek, dicht](https://www.devriestrappen.nl/friksbeheer/wp-content/uploads/2019/09/Steektrap-dicht-3300x900-IFC.zip) | 3300 × 900 | 34 | 3378 × 880 × 3000 | 187,5 / 220 | `4a01f111d71a` |
| [Bovenkwart, dicht](https://www.devriestrappen.nl/friksbeheer/wp-content/uploads/2019/09/Bovenkwart-Dicht-2100x2100x1000x1000-IFC.zip) | 2100 × 2100 × 1000 × 1000 | 37 | 2171,1 × 2080 × 3000 | 187,5 / 220 | `6522649f1d23` |
| [Onderkwart, dicht](https://www.devriestrappen.nl/friksbeheer/wp-content/uploads/2019/09/Onderkwart-Dicht-2200x2000x1000x1000-IFC.zip) | 2200 × 2000 × 1000 × 1000 | 37 | 2180 × 2071,2 × 3087,3 | 187,5 / 220 | `78b53bc49982` |
| [Spil, dicht](https://www.devriestrappen.nl/friksbeheer/wp-content/uploads/2019/09/Spiltrap-Dicht-1850x1910-IFC.zip) | 1850 × 1910 | 38 | 1894 × 1830 × 3297,2 | 181,25 / 220 | `5e23e571ca12` |
| [Tweekwart, open](https://www.devriestrappen.nl/friksbeheer/wp-content/uploads/2019/09/Tweekwart-Open-3160x1000-IFC.zip) | 3160 × 1000 | 23 | 3140 × 984,4 × 3950 | 181,25 / 220 | `cc2f4875b230` |
| [Tweekwart, dicht](https://www.devriestrappen.nl/friksbeheer/wp-content/uploads/2019/09/Tweekwart-Dicht-3160x1000-IFC.zip) | 3160 × 1000 | 38 | 3140 × 992,1 × 3950 | 181,25 / 220,513 | `71baad364be8` |

Deze zeven Compass-modellen zijn geschreven als IFC2X3. Elke trap heeft één `IfcStair` met via `IfcRelAggregates` rechtstreeks gekoppelde `IfcBuildingElementPart`-onderdelen. Elk van de 226 delen heeft een eigen BRep. De leverancier gebruikt voor een boven- of onderkwart `QUARTER_WINDING_STAIR` en voor zowel de tweekwart als deze specifieke spiltrap `TWO_QUARTER_WINDING_STAIR`. De bouwlaag aggregeert de trap. Er zijn geen afzonderlijke `IfcStairFlight`-objecten, materiaalobjecten, hoeveelhedensets of classificatierelaties in deze bestanden. De vijf draaiende modellen hebben wel materiaalnamen per onderdeelgroep als tekst in `CS_Set_Materials`. [BIM bij De Vries Trappen](https://www.devriestrappen.nl/seriematige-trappen/bim/)

### Aansluiting van de gesloten steektrap

Het gesloten model bevat vijftien volle tredebladen van 265 × 804 × 38 mm, een bovenste aansluitstuk van 58 × 804 × 38 mm, zestien stootborden van 13 mm dik en twee bomen van 38 mm dik. Het open model bevat alleen het bovenste stootbord bij de vloeraansluiting. De optrede van 187,5 mm geeft zestien optredes over 3000 mm.

Bij de eerste trede ligt de voorkant op wereld-X 3358 mm en het zichtvlak van het onderliggende stootbord op 3313 mm. Bij de tweede liggen die vlakken op 3138 en 3093 mm. **De gemeten wel is beide keren 45 mm** en de afstand van neus tot neus is 220 mm. De bovenzijde van het eerste stootbord en de onderzijde van de eerste trede liggen op dezelfde Z van −2850,5 mm. Het volgende stootbord ligt met zijn zichtvlak op X 3093 mm tegen de achterkant van de eerste trede. De modellen geven hiermee een referentie voor positie en contactvlakken. Freesdiepte en passingstolerantie zijn in deze IFC niet gespecificeerd. [IFC gesloten steektrap](https://www.devriestrappen.nl/friksbeheer/wp-content/uploads/2019/09/Steektrap-dicht-3300x900-IFC.zip)

## Vergelijking met eigen IFC4-uitvoer

Het [vergelijkingsproject](../examples/bim-steektrap-vergelijking.oss.json) is via `readProject` ingelezen en via dezelfde geometrie- en IFC4-functies als in de toepassing geëxporteerd. Voor de drie onderstaande paren zijn de zes IFC-bestanden opnieuw geopend en getrianguleerd. De eigen bestanden bevatten elk één `IfcStair` met één `IfcStairFlight`, vijftien tredebladen en zestien stootborden. Alle 123 eigen onderdelen met geometrie konden worden gemeten.

**Invoer.** Alle drie eigen modellen hebben zestien optredes, gesloten stootborden met stuikverbinding en automatische positie, tredepositie 45 mm, bladdikte 38 mm, borddikte 13 mm, wangdikte 38 mm en geen leuningen. De eigen steektrap heeft een breedte van 880 mm. De twee draaiende modellen gebruiken 966 mm, gebaseerd op de lokaal gemeten rechte bladbreedte van 890 mm bij de fabrikant plus twee wangen van 38 mm. Voor de kwartslag is 3000 mm vloerhoogte en 220 mm aantrede gebruikt, voor de halfslag 2900 en 220,513 mm. Beide hebben vijf boogtreden per kwart, een haakse buitenwang en draaien linksom. De kwartslag begint met vijf treden vóór de boog, de halfslag met twee.

| Vorm | Onderdelen met geometrie, Studio / De Vries | Modelmaat X × Y × Z van Studio (mm) | Modelmaat X × Y × Z van De Vries (mm) | Verandering van richting > 1° bij Studio / De Vries |
| --- | --- | --- | --- | --- |
| Steek, dicht | 33 / 34 | 3313 × 880 × 3000 | 3378 × 880 × 3000 | 0 / 0 van 15 intervallen |
| Kwart met verdreven treden / bovenkwart | 42 / 37 | 2328,3 × 2238,3 × 3000 | 2171,1 × 2080 × 3000 | 9 / 5 van 15 intervallen |
| Halve draai / tweekwart | 48 / 38 | 1801,5 × 2369,8 × 2900 | 3140 × 992,1 × 3950 | 14 / 10 van 15 intervallen |

**Trede en stootbord.** Bij alle 45 vergeleken tredebladen (vijftien per vorm) is de wel loodrecht op het zichtvlak van het bijbehorende stootbord gemeten. Die afstand is bij De Vries 45,00 mm en bij deze eigen stuikverbinding 0,00 mm. Het invoerveld *Tredepositie langs looplijn* schuift in Studio het hele blad en het bijbehorende stootbord. Het verschil is ook terug te vinden in de rechte bladen van de steektrap. Die meten in Studio 220 × 804 × 38 mm en bij de fabrikant 265 × 804 × 38 mm. De gemeten aantrede van 220 mm, de optrede van 187,5 mm en het contact met de onderkant van de trede komen overeen. Studio heeft hier vijftien volle tredebladen en twee bomen. Bij De Vries is een zestiende, smal aansluitblad op de verdiepingsvloer gemodelleerd.

**Verdrijving.** De richting van de langste bovenrand van ieder stootbord is uit de IFC-mesh gemeten. De borden zijn op hoogte gesorteerd en hun onderlinge hoek is per trede bepaald. Een verschil groter dan 1° telt in deze vergelijking als draaiend interval. De totale draai is in beide kwartslagmodellen 90° en in beide halve draaien 180°. Bij het bovenkwart van De Vries gebeurt de draai in vijf opeenvolgende intervallen. In Studio gaat de richting over meer treden geleidelijk over. In de tweekwart van De Vries liggen vijf rechte intervallen tussen twee afzonderlijke verdreven kwarten. De eigen halfslag beschrijft één doorlopende boog. De lange en korte zijden van de omhulling en de verdeling van de boomsegmenten laten hetzelfde vormverschil zien.

**Aansluiting op de vloer, vóór en na correctie.** In de eerste eigen IFC-uitvoer staken de twee onderste wangsegmenten (`ST-01-WG-L1` en `ST-01-WG-R1`) bij de kwartslag 92,5 mm en bij de halfslag 98,75 mm onder de startvloer uit. Bij de fabrikant eindigen beide bomen op de startvloer. Na correctie van de zaagsnede in het trapmodel zijn de eigen kwart- en halfslag linksom én rechtsom opnieuw geëxporteerd. De acht onderzochte wangvoeten eindigen nu op Z = 0,00 mm. De tabel toont de nagemeten eindmaten. De hogere Z-maat van de tweekwart bij De Vries is terug te voeren op een spil die 1050 mm boven de verdiepingsvloer uitkomt.

**Linksom en rechtsom.** Na spiegelen over het XZ-vlak zijn alle unieke meshpunten uit de eigen IFC-bestanden vergeleken op een afronding van 0,0001 mm. Bij de kwartslag kwamen alle 254 punten overeen en bij de halfslag alle 290. De fabrikantvergelijking gebruikt de beschikbare linker modellen.

## Onafhankelijke gebouwmodellen

| Bron | Trappen in het bestand | Gemeten geometrie en opbouw |
| --- | --- | --- |
| [Duplex Apartment, buildingSMART Community, gepinde revisie](https://github.com/buildingsmart-community/Community-Sample-Test-Files/blob/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20%28IFC%202x3%29/Duplex%20Apartment/Duplex_A_20110907.ifc) | Twee rechte IFC2X3-trappen op Level 1 | Per trap één `IfcStairFlight`, twee `IfcMember` en twee `IfcRailing`. De vlucht bevat een looplijn, een begrenzing en een `SweptSolid`-body van 914,4 × 3772,4 × 3050 mm. SHA-256 begint met `b347a2c8aa8f`. |
| [KIT, FZK-Haus](https://www.ifcwiki.org/images/e/e3/AC20-FZK-Haus.ifc) | Eén IFC4-wenteltrap op Erdgeschoss | Eén `IfcStair` met eigen BRep en Box, 1596,4 × 1708,9 × 3560 mm. Het object heeft `Pset_StairCommon`. SHA-256 begint met `70cc8ff245fc`. |
| [KIT, kantoorgebouw](https://www.ifcwiki.org/images/9/98/AC20-Institute-Var-2.ifc) | Vier IFC4-trappen op vier verschillende bouwlagen | Vier afzonderlijke `IfcStair`-objecten gebruiken een `MappedRepresentation` en een Box. De geometrie per trap meet 5400 × 4000 × 4194,3 mm. SHA-256 begint met `cfb2124497b2`. |

De twee KIT-modellen komen van het Institute for Automation and Applied Informatics (IAI), Karlsruhe Institute of Technology, en zijn geëxporteerd uit Archicad 20. Hun trappen zijn indeelbaar per bouwlaag, maar hebben geen selecteerbare onderliggende vluchten. [Publicatie en gebruiksvoorwaarden van KIT](https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples)

Het Duplex-bestand laat zien waarom een uitleestest ook de vorm moet nameten. De projecteenheid is meter. Bij beide vluchten geven de directe IFC-attributen na eenheidsconversie 635,66 mm optrede en 820,21 mm aantrede. `Pset_StairFlightCommon` geeft 193,75 en 250 mm. Aan de eerste twee opeenvolgende bovenvlakken zijn 193,75 mm verticale en 250 mm horizontale afstand gemeten. De twee telattributen komen wel overeen met zestien optredes en vijftien loopvlakken. [Duplex Apartment, IFC-download](https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20%28IFC%202x3%29/Duplex%20Apartment/Duplex_A_20110907.ifc)

## Zelf nameten

Het vergelijkingsmodel van de gesloten steektrap is meegeleverd als [bewerkbaar project](../examples/bim-steektrap-vergelijking.oss.json), [IFC4](../examples/ST-01-coordinatiemodel.ifc) en [IFCX alpha](../examples/ST-01-coordinatiemodel.ifcx). De bestanden zijn vanuit de BIM-werkruimte gedownload. Voor alle 33 fysieke onderdelen zijn de identiteit, de omhulling in wereldcoördinaten en het opgegeven nettovolume uit beide bestanden gecontroleerd tegen de geometrie in IfcOpenShell.

De onafhankelijke uitwisseltest vergelijkt daarnaast acht eigen IFC4/IFCX-modelparen, waaronder een kwartbordes, verdreven trappen en een opstelling met glas, staal, een boomloze trap en een vluchttrap. Ze vergelijkt de begrenzing en het volume per fysiek onderdeel. Dezelfde IFC4-modellen leveren de maatstaf voor de IFCX-conversie. De fabrikantbestanden hierboven leveren een afzonderlijke vergelijking van de ontwerpen. [Uitwisseltest](../scripts/verify-ifcx-independent.py) · [Test van de BIM-knoppen en downloads](../scripts/verify-bim-downloads.py)

Pak het IFC-bestand uit de gewenste fabrikant-ZIP uit, of download een van de gebouwmodellen. Voer vanuit de projectmap de onafhankelijke meting uit met Python 3.12 en IfcOpenShell 0.9.0.post1. Er mogen meerdere bestandspaden achter het commando staan.

```powershell
uv run --no-project --python 3.12 --with ifcopenshell==0.9.0.post1 python scripts/inspect-reference-ifc.py --details "C:\BIM\Duplex_A_20110907.ifc"
```

De JSON-uitvoer vermeldt de volledige SHA-256 van de uitgepakte IFC, de projecteenheid, de objecttypen, de eigenschappen en de aanwezige ruimtelijke relaties. De meting volgt de decompositie van iedere trap en bouwt alle objecten met een representatie op in wereldcoördinaten. Elk object telt één keer per trap. Fouten bij het trianguleren worden gerapporteerd en leveren een foutcode op. Met `--details` bevat het resultaat per product de STEP-id, de uiterste coördinaten en de contourranden op het hoogste vlak. Voor vluchten worden ook de hoogtes en begrenzingen van de horizontale driehoeken gegeven.

Voor de welmeting zijn de parallelle bovenranden van blad en stootbord langer dan 500 mm op de plaatselijke normaal geprojecteerd. Het verschil tussen de voorste projecties is de wel. Voor de draai zijn de gerapporteerde hoeken van de langste bovenranden van de zestien stootborden per opeenvolgend paar vergeleken, rekening houdend met het doorlopen van 180°. Zo zijn ook de metingen bij schuine tredekoppen te reproduceren.

De openbare modellen zijn bedoeld voor vergelijking van BIM-uitwisseling. Projectgebonden ILS-afspraken, constructieve toetsing en CNC-vrijgave hebben elk eigen acceptatiecriteria.
