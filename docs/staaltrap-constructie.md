# Constructie van stalen trappen

De stalen trap en stalen vluchttrap gebruiken dezelfde geometrie voor de rekenstaat, de aansluitdetails en de IFC-onderdelen. De projectbasis bevat de belastingscategorie, toepasselijke normversies met nationale bijlagen, combinaties en oplegvoorwaarden. De Europese Commissie behandelt de afzonderlijke controles van staaldoorsneden, stabiliteit en verbindingen in haar uitgewerkte voorbeelden. [JRC, Design of Steel Buildings](https://eurocodes.jrc.ec.europa.eu/publications/eurocodes-background-applications-design-steel-buildings-worked-examples)

## Invoer en combinaties

Voer de aanvullende permanente belasting Gk, veranderlijke vlaklast qk, alternatieve puntlast Qk, twee UGT-factoren, rekenvloeigrens en vervormingsgrens in. De meshvolumes leveren het eigengewicht met 7850 kg/m³ en 9,81 m/s². Neem dit eigengewicht één keer mee. Voor UGT doorloopt het model de vlaklast en puntlast apart, elk met de ongunstige permanente belasting. Voor BGT gelden de karakteristieke combinaties en E = 210000 N/mm². Een ontbrekende projectbasis of ontbrekende gebruikslast geeft een open uitkomst.

## Treden en bordesvloer

Bij de gezette trede vormen de plaat en twee lippen van 35 mm de getekende doorsnede. De afstand tot de uiterste vezel bepaalt W. De trede overspant conservatief de volle breedte tussen de binnenzijden van de wangen, op twee hoeken van 40 × 40 × 4. Bij een punt aan de wandzijde kan één hoek de volledige variabele puntlast ontvangen. De lokale plaatwerking, torsie en het oplegdetail hebben een aparte projecttoets. Bij een vlakke bordesplaat draagt een strook ter breedte van het ingevoerde puntlastvlak de puntlast.

Voor het open rooster rekent de software een getekende draagstrip van 3 mm met zijn werkelijke hoogte en de uit de paneeldiepte volgende steek. Standaard neemt één strip de volle puntlast op. Een groter effectief aantal vereist een onderbouwing voor het gekozen rooster en lastvlak. Controleer afzonderlijk de randstrip, het eindcontact en de verbindingen met de dwarsstaven. Producententabellen onderscheiden maas, overspanning en belast oppervlak. [Lichtgitter, tabellen gelaste roosters](https://lichtgitter.co.uk/wp-content/uploads/2020/09/Lichtgitter-Manual.pdf)

## Wangen, frame en kolommen

De plaatwang is een schuin, enkelvoudig opgelegd liggermodel met verticale eindreacties en een horizontaal verschuifbaar uiteinde. Elke trede levert een discrete vlaklast op haar eigen station. De software integreert het volume en eerste moment van elk stalen onderdeel en plaatst het gewicht op zijn zwaartepunt. Binnen dit schema behouden de puntresultanten de verticale eindreacties en geven ze een bovengrens voor positieve buiging en doorbuiging. De randpuntlast kan volledig naar één wang gaan. De doorsnedehoogte loodrecht op de wangas is de verticale getekende hoogte maal de cosinus van de helling.

De volle doorsnede krijgt een elastische buigtoets, een omhullende vergelijking voor normaalkracht, buiging en dwarskracht en een toets op doorbuiging loodrecht op de as. Voor dit model leveren de exacte momenten door stationlasten en een bewegende puntlast het UGT-maximum. Bij BGT telt de puntlastvariant afzonderlijke maxima van permanente belasting en puntlast op. De voetuitsparing, kip, knik en torsie vragen het lokale uitvoerings- en stabiliteitsdetail.

Het bordes ontvangt de corresponderende eindreacties van de aangesloten vluchten. Bij een keerbordes zijn dit de bovenreacties van de onderste vlucht én de onderreacties van de bovenste vlucht. Het vierkolomsmodel geeft per bordesligger een enkelvoudig opgelegde referentietoets met alle bordeslasten en vluchtreacties als bovengrens. Voor de kolomdruk wordt de volledige last op één kolom beschouwd, vermeerderd met de invloed van de overstekken tot de kolomassen. Scheefstand, raamwerking, eindoverstekken, lokale lasten, horizontale stabiliteit en netto opwaartse voetreacties vragen een projectmodel. Bij ondersteuning door het gebouw blijven de liggercontroles open tot het eigenlijke oplegschema bekend is.

## Aansluitingen en verankering

Per opleghoek, wangkop, wangvoet en kolomvoet staat de rekenkracht bij de bijbehorende onderdeelmerken. De ingevoerde verticale ontwerpweerstand betreft de complete aansluiting met plaat, las, excentriciteit, ondergrond en bij kolommen de werkelijke kniklengte. De werkplaatstekeningen verwijzen naar de betrokken trede, oplegging, wang of bordesligger. De bovenste vlucht op het keerbordes krijgt een stalen oplegstoel.

De vloergebonden wangvoet heeft vier M12-vloerankers op 64 × 54 mm. De kolomvoet heeft vier M12-vloerankers op 94 × 94 mm. Beide platen hebben doorgaande gaten van Ø14 mm. Inbedding, staaf en zeskant zijn onderdeel van het 3D-model. Bevestig de maatgevende UGT-omhullende van trek, horizontale kracht en momenten in beide plaatassen en torsie, inclusief opwippen. Pas de weerstand per effectief anker toe die hoort bij de gekozen groepsconfiguratie, randafstanden, inbedding, betontoestand, plaat en montage. De combinatie van trek en afschuiving gebruikt een lineaire interactie. Een aparte ankerberekening moet de ondergrond en de geldigheid van dit krachtenmodel inclusief prying vastleggen. [Fischer, bevestigingen volgens EN 1992-4](https://www.fischer-international.com/en/service/din-en-1992-4)

Om de handvoorbeelden en de geometriecontrole uit te voeren, gebruik `node scripts/verify-component-steel-design.mjs` en `node scripts/verify-steel-stairs.mjs`.


## Resttoestand en stabiliteit

Voor iedere plaatwang wordt het maatgevende buigmoment vergeleken met de opgegeven kipweerstand voor de gedocumenteerde afstand tussen zijdelingse steunpunten. Een aanvullende toets vergelijkt de horizontale belasting van de hele trap met de weerstand van het stabiliteitsverband. De productberekening moet de knopen, hekwerkafdracht en gebouwverankering omvatten. Per stalen voet is de ondergrond apart instelbaar. De stalen rekenkern geeft een maatgevende individuele ankerkracht. De ondergrondtoets voor de volledige groep blijft open tot een onderbouwde groepsvraag beschikbaar is.
