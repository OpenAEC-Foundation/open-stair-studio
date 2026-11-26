# Open Stair Studio

OpenAEC desktopsoftware voor parametrisch trapontwerp, berekeningen, werkvoorbereiding, CNC-voorbereiding en IFC4-uitwisseling.

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
