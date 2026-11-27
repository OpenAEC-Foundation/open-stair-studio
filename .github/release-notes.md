# Open Stair Studio

OpenAEC desktopsoftware voor parametrisch trapontwerp, berekeningen, werkvoorbereiding, CNC-voorbereiding en IFC4-uitwisseling.

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
