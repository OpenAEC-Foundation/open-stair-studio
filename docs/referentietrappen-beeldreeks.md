# Referentietrappen: tien aangeleverde beelden

Onderzoek op basis van de tien beelden van 26 november 2026. Een foto toont de zichtbare vorm, maar bewijst geen materiaalopbouw, draagweg, maat of bevestiging. Die gegevens moeten per project worden ingevoerd en getoetst. Een model geldt pas als beschikbaar wanneer de tredecontour, drager, verbinding, materiaallijst, tekening en IFC hetzelfde ontwerp beschrijven.

| Beeld | Zichtbare ontwerpkenmerken | Huidige dekking | Nodige uitbreiding |
| --- | --- | --- | --- |
| 1 | Houten kwartslag, gesloten stootborden, rechte buitenboom, trappalen, houten regel en zwarte sierbalusters | Kwartslag, stootborden en houten leuning aanwezig; de precieze paal- en balustervorm ontbreekt | Individuele paalprofielen, gemengde balustermaterialen en paal/boomverbinding |
| 2 | Open houten treden op een zwarte centrale stalen zigzagdrager, zonder zijbomen | Vrijdragende wandtrap is een andere draagweg; dit centrale systeem ontbreekt | Centrale plaatstalen of kokerdrager, tredeconsoles, lassen, voet- en kopankers en torsietoets |
| 3 | Gesloten, gevouwen houten trede/stootbordschil met zaagtandrand en vrije onderruimte | Gesloten houten trappen bestaan, maar hebben nog zichtbare zijbomen | Gevouwen zelfdragende schil, momentvaste hoekverbindingen, onderzijde en bekleding als afzonderlijke lagen |
| 4 | Brede zwevende treden met wandzijde, weinig zichtbare ondersteuning en een doorlopende wandhandregel | Boomloze wandtrap heeft al ankers en consoles; de foto laat de verborgen draagconstructie niet zien | Onafhankelijke keuze wandconsole, ingeklemde trede of verborgen stalen drager, plus brede starttreden |
| 5 | Compacte houten waaier met scherpe binnenzijde en binnenpaal | Verdrijving bestaat, maar de huidige minimumstraal en segmentbomen vormen deze waaier niet precies | Treden per stuk met eigen binnen- en buitencontour, binnenpaal, verbinding en vrije breedte langs klimlijn |
| 6 | Rechte beklede trap met verbrede afgeronde onderste aantreden en klassieke trappaal | Rechte trap, gesloten stootborden en houten paal bestaan | Per trede instelbare breedte/voorzijde, starttreden met gebogen neus en afwerklaag los van de draagtrede |
| 7 | Brede, vloeiende gebogen vlucht met open treden, gebogen binnenbalustrade en wandhandregel | Spiltrap is een andere geometrie; deze vlucht ontbreekt | Vrije ruimtekromme voor klimlijn, variabele breedte, gebogen binnen- en buitenboom en gebogen leuning |
| 8 | Klassieke houten verdreven trap met gebogen starttrede, paal, balusters en doorlopende gebogen handregel | Kwartslag en houtdetails bestaan gedeeltelijk | Voluut/starttrede, gebogen boom en handregel met werkelijk aansluitstuk; profiel en paalpositie per station |
| 9 | Helicale houten trap rond een open vide, zonder dragende middenspil | De huidige spiltrap heeft een centrale kolom; dit is een andere draagweg | Helicale binnen- en buitenboom, doorlopende hoogteontwikkeling, gebogen treden en ringvormige balustrade |
| 10 | Houten/stenen trap met gebogen onderste treden, decoratieve risers en smeedijzeren krulbalustrade | Recht/bordes, staalhek en houttreden bestaan als losse vaste typen | Eerste treden als vrije contour; riserbekleding; parametrische sierpanelen met maakbare knopen en bevestigingen |

## Modelkeuzes

1. **Looplijn en tredenvlakken los van dragers.** Een vlucht krijgt een 2D of 3D route met stations voor voor- en achterkant van iedere trede. Rechte, verdreven, waaier-, gebogen en helicale routes gebruiken dezelfde uitgewisselde tredegegevens, maar ieder een eigen geometrische generator. De gangbare `going` langs de looplijn en de werkelijke minimale diepte aan de smalle zijde blijven afzonderlijk toetsbaar.
2. **Draagweg als zelfstandige keuze.** Per vlucht: twee ingekroosde bomen, twee keepbomen, centrale drager, wandconsoles, zelfdragende gevouwen schil of gebogen binnen- en buitenboom. Een verborgen constructie wordt niet uit een foto geraden. De constructieve berekening moet bij de gekozen draagweg passen, inclusief torsie, verbindingen en ondergrond.
3. **Onderdelen en afwerkingen scheiden.** Trede, neus, stootbord, bekleding, antislip, boom, console, paal, baluster en handregel krijgen eigen materiaal, vorm, merk en hoeveelheden. Bekleding verandert de afgewerkte maat en massa, maar wordt niet stilzwijgend als dragend beschouwd.
4. **Vorm per onderdeel kunnen wijzigen.** Treden kunnen van rechthoek naar waaier of vrije contour; de eerste treden kunnen breder en afgerond zijn. Bomen en leuningen hebben profielstations, eindverlengingen, paalaansluitingen en productiedelen. Een gebogen of helicaal deel vraagt een ontwikkelde mal, 3D-vorm, segmentering en maakbaarheidscontrole.
5. **Eén bron voor alle uitgangen.** 3D, plattegrond, doorsnede, werkblad, hoeveelheden en IFC lezen hetzelfde onderdeelmodel. DXF/CNC wordt per materiaal en bewerking vrijgegeven; een zichtbare 3D-vorm alleen is geen CNC-baan of constructief bewijs.

Deze scheiding sluit aan bij de afzonderlijke bewerking van treden, bomen en leuningen in [StairDesigner part properties](https://wooddesigner.org/help-centre/stairdesigner-part-properties/). De fabrikant onderscheidt ook rechte, gebogen, centrale en uitgezaagde bomen en afzonderlijke boomposities. [StairDesigner](https://wooddesigner.org/stairdesigner-software/) toont daarnaast helicale, gebogen en variabel gevormde treden als verschillende configuraties. [EeStairs](https://www.eestairs.com/html/documents/25-Years-of-EeStairs-3.pdf) beschrijft voor grote gebogen trappen de samenhang tussen draagstructuur, treden, segmentering en nauwkeurige montage.

## Volgorde voor implementatie en acceptatie

1. Maak per referentie een reproduceerbaar project en leg de zichtbare vorm en de ontbrekende informatie vast. Beelden 1, 4 en 8 kunnen gedeeltelijk met de huidige typen worden opgezet; de andere blijven expliciet onvolledig.
2. Voeg een centrale drager met houten treden toe als eigen constructietype. Accepteer pas als de tredeconsoles, voet/kop, torsie, massa, tekening en IFC kloppen.
3. Voeg vrije starttredecontouren en bekleding toe. Controleer de looplijnmaten op de afgewerkte bovenzijde en de bruto/netto hoeveelheid van de afzonderlijke materialen.
4. Breid de routegenerator uit naar waaier en continue krommen. Controleer spiegeling, smalle tredepunt, vrije breedte, hoofdruimte en clashes voor zowel linksom als rechtsom.
5. Voeg gebogen/helicale bomen en leuningen toe met productiedelen, verbindingen en mallen. Een centrale spiltrap mag niet als bewijs voor een trap rond een open vide gelden.

De terugliggende neus en trederand van een keepboom zijn inmiddels parametrisch gemaakt. Dat lost alleen de positie van een rechte trede ten opzichte van een rechte keepboom op; het maakt de gebogen, centrale en gevouwen voorbeelden hierboven nog niet bouwrijp.
