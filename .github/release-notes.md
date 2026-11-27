# Open Stair Studio

OpenAEC desktopsoftware voor parametrisch trapontwerp, berekeningen, werkvoorbereiding, CNC-voorbereiding en IFC4-uitwisseling.

## Nieuw in 0.13.25

- Stel in het onder- en bovenkwart per TD-nummer de draaihoek en de verschuiving van de stootbordlijn in. Eén grenswijziging werkt door in beide aangrenzende zaagcontouren. Het rechte tussenstuk houdt zijn aansluitlijnen.
- Het bijgewerkte De Vries-voorbeeld bevat de ingemeten verdeling van alle vijftien bladen. In **Tredeblad** zijn de zaagcontour, DXF en LinuxCNC per onderdeel beschikbaar. IFC4 en IFCX alpha bevatten per verdreven trede de beide grensverschuivingen. [Meetrapport](https://github.com/OpenAEC-Foundation/open-stair-studio/blob/v0.13.25/docs/verdrijving-tweekwart.md) · [Voorbeelden linksom en rechtsom](https://github.com/OpenAEC-Foundation/open-stair-studio/raw/refs/tags/v0.13.25/examples/tweekwart-verdrijving.zip)

## Nieuw in 0.13.24

- Bij een houten tweekwartstrap met vaste buitenmaten kun je de onder- en bovenspil afzonderlijk plaatsen. Stel de doorsnede, positie, hoogte, smalle aantrede en insteekdiepte per spil in. Het De Vries-voorbeeld gebruikt een stuikende aansluiting.
- Kies de ontwerpmaat van 3140 × 992 mm of de gemeten IFC-maat van 3140 × 992,105 mm om de zaagcontour van trede 15 met het fabrikantmodel te vergelijken.
- Het tredeblad, de CNC-contour van trede 15 en de beide BIM-formaten volgen de gekozen aansluiting. IFC4 en IFCX alpha bevatten de houten spillen, hun verbindingen met de treden en de ingestelde huizen. [Meetrapport](https://github.com/OpenAEC-Foundation/open-stair-studio/blob/v0.13.24/docs/spillen-tweekwart.md) · [Voorbeeldprojecten en freesbestanden](https://github.com/OpenAEC-Foundation/open-stair-studio/raw/refs/tags/v0.13.24/examples/tweekwart-spillen.zip)
- Op het spilblad staan de DXF en de LinuxCNC-programma's per opspanvlak. Bij insteek geeft het blad aan welke binnenhoeken of schuine ruggen na het voorfrezen moeten worden nagestoken.

## Nieuw in 0.13.23

- Bij de tweekwartstrap kun je de buitenlengte en buitendiepte vastleggen en het rechte tussenstuk langs de trap verschuiven. Het onderkwart en het bovenkwart hebben elk een eigen aantal treden en draaihoek per trede.
- Met **De Vries-voorbeeld toepassen** teken je de gesloten tweekwart op 3140 × 992 mm met 45 mm wel. De draairichting blijft instelbaar. Het voorbeeld bevat vijf verdreven, vijf rechte en vijf verdreven treden.
- De werkbladen, CNC-tredecontouren, IFC4 en IFCX alpha volgen de ingestelde verdeling. [Verschillen met het fabrikantmodel](https://github.com/OpenAEC-Foundation/open-stair-studio/blob/v0.13.23/docs/bim-referentietrappen.md) · [Voorbeelden linksom en rechtsom](https://github.com/OpenAEC-Foundation/open-stair-studio/raw/refs/tags/v0.13.23/examples/tweekwart-3140x992.zip)

## Nieuw in 0.13.22

- Stel bij een houten trap de wel in millimeters in. Verplaats de hele trede langs de looplijn met de afzonderlijke maat **Tredepositie**. De stootborden, groeven en werkstukken volgen de gekozen aansluiting.
- Kies onder **Trapfamilie** de **Tweekwartstrap met recht tussenstuk**. Stel de draairichting, de verdreven treden per kwart en de rechte treden tussen beide draaien in.
- IFC4 en IFCX alpha bevatten de nieuwe trapfamilie. Bij gesloten houten trappen staat de wel als `NosingLength` op de trap en de vlucht. [Meetvergelijking met De Vries](https://github.com/OpenAEC-Foundation/open-stair-studio/blob/v0.13.22/docs/bim-referentietrappen.md) · [Voorbeeldprojecten en BIM-bestanden](https://github.com/OpenAEC-Foundation/open-stair-studio/raw/refs/tags/v0.13.22/examples/bim-tweekwart-vergelijking.zip)

## Nieuw in 0.13.21

- De BIM-werkruimte leest de sparingen die aan een vloer zijn gekoppeld. Voor de twee openbare Archicad-modellen van KIT komen de tellingen overeen met IfcOpenShell. FZK-Haus heeft vier vloerplaten met één vloersparing, het Institute-model heeft 26 vloerplaten met vier vloersparingen.
- De planpassing vergelijkt volledige doorsneden van trap, vloer en vloersparing op het middenpeil van de vloer. Zo zijn ook smalle inspringingen, eilanden van vloermateriaal en openingen die elkaar overlappen te beoordelen. Bij onvoldoende geometrie blijft de uitkomst open.
- Het [meetblad met doorsneden](https://github.com/OpenAEC-Foundation/open-stair-studio/blob/v0.13.21/output/pdf/BIM-vergelijking-trappen.pdf) zet de steektrap van Studio en die van De Vries op gelijke schaal naast elkaar.

## Nieuw in 0.13.20

- In IFC4 kun je houten treden, stootborden en bomen afzonderlijk selecteren en per vlucht terugvinden. De standaard IFC-eigenschappen geven de optredes, treden en beschikbare loopmaten. Nettovolumes staan op de fysieke houten onderdelen. Overeenkomstige onderdelen behouden hun GlobalId bij herexport en ontwerpwijzigingen.
- Bij export van één trapcomponent of de hele componentopstelling worden het projectnulpunt en de rotatie meegenomen. De voet van de bomen bij verdreven kwart- en halfslagtrappen sluit op het vertrekpeil aan.
- Onder **BIM** is naast IFC4 ook experimentele IFCX-alpha-uitvoer beschikbaar met de projectstructuur, wereldgeometrie en eigenschappen. De testbestanden zijn met IfcOpenShell en de IFCX-compositor van buildingSMART ingelezen.
- De vergelijking met zeven De Vries-trappen en drie openbare gebouwmodellen bevat gemeten maatvoering, wel, draai en objectopbouw. [Meetrapport en bronbestanden](https://github.com/OpenAEC-Foundation/open-stair-studio/blob/v0.13.20/docs/bim-referentietrappen.md)

## Nieuw in 0.13.19

- Kies onder **Houtdetails → Stootborden** het onderdeelmerk en klik op **Stootbord frezen**. Het blad levert LinuxCNC-programma’s voor de lippen, schouders en kopvlakken van het verticale bord. Bij een verdreven kwartslag of halfslag volgen de banen de draairichting en de ingestelde neuspositie.
- Elk programma hoort bij één vaste opspanning. Het werkblad geeft het referentiepunt op de ruwplank, de richting van de machineassen en de benodigde frees. Bij een inspringend verstek kan een aanvullende opspanning met een kleinere detailfrees nodig zijn. De twee gereedschapsprofielen worden bij het project opgeslagen.
- De controle vergelijkt de stootbordlippen met de groeven in de treden, bomen en bordessen. Onvoldoende snijlengte of resthout dat de aansluiting verhindert geeft een melding op het stootbordblad.

## Nieuw in 0.13.18

- Houten kwartslag- en halfslagtrappen met verdreven treden ondersteunen ingefreesde stootborden, linksom en rechtsom. Bij het verplaatsen van de neus volgen de trede, de oplegging van het volgende stootbord, de lippen en de bijbehorende groeven.
- Bij een haakse of gefacetteerde buitenwang bepaalt het werkelijke wangsegment de positie van de zijlip. Een plaatselijk verkorte insteek bij een verstek staat op het stootbordblad. Het tredeblad geeft de opspanzijde en de hoekpunten van de schuine groef voor CNC. De IFC4-export koppelt ieder stootbord aan de onderdelen waarin zijn lippen vallen.

## Nieuw in 0.13.17

- Kies bij houten trappen onder **Houtdetails → Verbinding stootbord** voor **Ingefreesd in trede en boom**. Verticale stootborden krijgen lippen in de aangrenzende treden, de ingekroosde bomen en het tussenbordes. Aan de vloer en bij de kopse wang toont het werkblad de werkelijke beëindiging. Opgeslagen ontwerpen behouden hun bestaande aansluiting.
- De werkbladen tonen per onderdeel de groeven, lippen en opspanzijde. Voor het boven- en ondervlak zijn afzonderlijke DXF- en LinuxCNC-bestanden beschikbaar. Bij het wijzigen van de neus volgen de beide groeven, de stootborden, het bordesraam, de hoeveelheden en de IFC4-onderdelen.

## Nieuw in 0.13.16

- Het plaatwangblad drukt nu als één A3-landscapeblad af. De contour, bruto- en nettomassa, alle opleghoekreferenties en de productienoot blijven bij elkaar.

## Nieuw in 0.13.15

- De open driehoekige stalen plaatwang heeft nu een eigen werkblad met buitencontour, echte uitsparing, bruto plaatmaat, netto massa en referentielijnen voor de gemodelleerde tredeopleggingen. Een DXF exporteert de twee snijcontouren op aparte lagen; boor- en lasdetails blijven expliciet projectwerk.
- De uitsparing houdt nu over de volledige lengte van elke tredeopleghoek een materiaalstrook vrij. Een geometrische controle voorkomt dat het gat onder de opleghoek doorloopt.
- Een aanvullend referentieonderzoek benoemt de volgende ontwikkelstappen voor gesloten stootbordhuizen, individuele starttredevormen, boomprofielen en verbindingen.

## Nieuw in 0.13.14

- De onderzijde van ingekroosde trapbomen heeft nu een vlakke oplegvoet aan vloer of bordes en loopt daarna evenwijdig aan de traphelling. Treden steken bij de bordesaansluiting niet meer onder de boom uit.
- Werkbladen, ruwmaten, calculatie, CNC-opspanning en IFC4 volgen de werkelijke vijfhoekige boomdoorsnede. De controle vergelijkt voor iedere trede beide randen met de onderzijde van de boom, ook links/rechts en met verplaatste neus.

## Nieuw in 0.13.13

- Stalen rechte trappen kunnen nu een open driehoekige plaatwang met doorlopende voetregel krijgen, zoals bij een korte roostertrap. De opening wordt als echt gat in 3D, massa, onderdelenstaat en IFC4 gemodelleerd.
- De sterkte- en doorbuigingstoets van deze nieuwe framevorm blijft op “Open” totdat een projectspecifiek doorsnede- en stabiliteitsmodel is vastgelegd. De bestaande volle-plaatberekening wordt niet ten onrechte als bewijs gebruikt.

## Nieuw in 0.13.12

- Ingekroosde trapbomen krijgen verticale kopse uiteinden bij de eerste trede en de bovenvloer. De onderste punt sluit aan op de vloer of de onderzijde van het bordes, zonder uitstekende strook.
- De zichtbare 3D-vorm, plattegrond, netto-/ruwvolume, infrezingen, CNC-opspanning en IFC4 gebruiken dezelfde afgezaagde boomcontour. Een verplaatste neus verschuift ook beide boomuiteinden.

## Nieuw in 0.13.11

- Het standaard houten stootbord staat nu verticaal tegen de achterzijde van de lagere trede en onder de volgende trede. Een schuine uitvoering blijft alleen als expliciet maatwerk beschikbaar.
- Bij een kwartslag, halfslag of rechte bordestrap eindigt het stootbord van de eerste vlucht aan de onderzijde van het bordes. De bordesplaat omvat de aansluiting van beide vluchten, ook bij een verplaatste tredevoorzijde en links- of rechtsdraaiende trappen.
- Werkplaatstekeningen, bruto houtmaat, calculatie en IFC4 gebruiken de aangepaste verticale onderdelen en bordesmaat. De controle wijst een te dik bordes voor een gesloten stootbord af.

## Nieuw in 0.13.10

- Nieuw project begint nu echt leeg: 0 trappen in de projectboom en geen automatisch 3D-trapmodel, onderdelen, werkbladen of trapexport.
- Pas na de keuze van een traptype wordt een trap toegevoegd. Een leeg project kan worden opgeslagen, gesloten en opnieuw geopend zonder dat de standaardtrap terugkomt.

## Nieuw in 0.13.9

- Nieuw project toont bij niet opgeslagen wijzigingen een duidelijke bevestiging in het appvenster. Annuleren bewaart het huidige project; bevestigen start een vers project en vervangt het automatisch herstelde concept.
- De opdracht Nieuw project is ook direct beschikbaar in de titelbalk en met Ctrl+N.

## Nieuw in 0.13.8

- Een neusverstelling verplaatst nu de volledige trede naar voren of achteren. Bij rechte vluchten blijft de trede even lang; ook de rugzijde, uitsparing in de keepboom en het stootbord volgen de nieuwe positie.
- Verdreven treden verschuiven langs de looplijn en worden opnieuw begrensd door hun binnen- en buitenboom. Werkbladen, calculatie, trede- en wang-CNC en IFC4 gebruiken dezelfde geometrie.

## Nieuw in 0.13.7

- De ruwplank van een schuin stootbord bevat nu ook de benodigde extra lengte voor de zaaghoeken. De calculatie gebruikt die gecorrigeerde ruwmaat.

## Eerder toegevoegd in 0.13.5

- Gesloten houten stootborden sluiten bij een terugliggende trede automatisch aan op de boven- en ondertrede. Waar nodig volgt het bord een schuine lijn.
- Voor rechte vluchten zijn de boven- en onderaansluiting handmatig instelbaar. De tool controleert of het bord onder de bovenste trede en binnen de onderste trede blijft.
- Het stootbord heeft een gesloten 3D-solid, een schuine doorsnede en ontwikkelde ruwmaat op het houtdetailblad. Calculatie en IFC4 gebruiken dezelfde vorm.

## Eerder toegevoegd in 0.13.4

- De tredevoorzijde kan nu vóór of achter de keep liggen: een negatieve neusmaat geeft een terugliggende neus.
- Ook de zijrand kan met een negatieve maat binnen de keepboom liggen. De tool controleert de resterende oplegbreedte.
- De aangepaste tredevorm werkt door in 3D, materiaalhoeveelheden, trede-CNC en IFC4.

## Eerder toegevoegd in 0.13.3

- Kies bij steektrappen en trappen met bordes per zijde tussen een ingekroosde boom en een uitgezaagde keepboom.
- Keepbomen hebben horizontale tredeopleggingen, een instelbare minimale houtstrook en een instelbaar tredeoverstek. Hun netto- en ruwvolume tellen mee in de calculatie.
- Werkvoorbereiding toont de keepboom en exporteert de nominale gesloten contour als DXF. Het fysieke 3D-solid wordt meegenomen in IFC4.
- De buitencontour van een keepboom is nog geen vrijgegeven CNC-programma. Verdreven keepbomen blijven een open ontwerppunt.

Download de Windows-installer (`*-setup.exe`) voor installatie per gebruiker. De app controleert bij het starten op nieuwe versies. Een gevonden, ondertekende update kan via **Update** in de titelbalk worden geïnstalleerd.

**Status:** ontwerp- en uitwisselproef. Constructieve controles en CNC-uitvoer vereisen projectspecifieke verificatie; zie `docs/bim-naakt-audit.md` en de projectdocumentatie.
