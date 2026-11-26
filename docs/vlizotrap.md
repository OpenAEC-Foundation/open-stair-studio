# Vlizotrap in een trappenhuis

Een vlizotrap, ook vlieringtrap of zoldertrap, biedt inpandig toegang tot een hoger gelegen ruimte. Het wisselen van werkstand verandert de ruimte die het samenstel inneemt. Voor een trappenhuis zijn daarom zowel de plafondopening als de vrije vloer vóór de trap en de ruimte boven het luik van belang.

## Productonderzoek

| Bron | Gegevens voor het componentmodel |
| --- | --- |
| FAKRO LWK Komfort op maat | De fabrikant beschrijft een houten ladder met drie of vier delen, een geïsoleerd luik, een handgreep en voetbeschermers. Bij deze productreeks is de buitenbak 16 mm korter en 20 mm smaller dan de plafondopening. De brochure onderscheidt uitloop in gebruik, maximale reikwijdte bij openen en hoogte van het opgeborgen pakket. [Productpagina](https://www.fakro.nl/producten/zoldertrappen/zoldertrap-op-maat/) · [Maatbladen zoldertrappen](https://www.fakro.nl/att/LOCAL/catalogs/products/FAKRO_brochure_zoldertrappen-2024_april-WEB-MET-PRIJZEN-.pdf) |
| DOLLE clickFIX | De technische gegevens onderscheiden ruwbouwsparing, buitenkast en vrije kamerhoogte. De houten uitvoering vermeldt onder meer bomen van 21 mm dik, een tredediepte van 83 mm en een afgewerkte trededikte van 17,5 mm. De montage-informatie vraagt afzonderlijk aandacht voor vloercontact en de ruimte tijdens het uitklappen. [Technische gegevens](https://www.dolle.de/bodentreppen-clickfix) · [Montage en inbouw](https://www.dolle.de/montage-einbau-bodentreppe) |
| NEN-EN 14975 | Deze productnorm behandelt eisen, markering en beproeving van vlieringtrappen. Het in 2025 gepubliceerde ontwerp noemt incidentele, tijdelijke inpandige toegang als toepassing. Productkeuze, belastbaarheid, brandwerendheid en eventuele toepassing in een vluchtroute vragen afzonderlijk project- en productbewijs. [NEN-EN 14975:2007+A1:2010](https://www.nen.nl/nen-en-14975-2007-a1-2010-en-148870) · [Ontwerp uit 2025](https://www.nen.nl/nen-en-14975-2025-ontw-en-344382) |

Een concreet inmeetvoorbeeld is de FAKRO LWZ Plus voor een plafondopening van 700 × 1200 mm. De fabrikant geeft bij 2800 mm plafondhoogte een buitenkast van 680 × 1188 mm, een maximale reikwijdte van 1560 mm, 1200 mm reikwijdte in gebruik en een pakket van 270 mm hoog. Voor deze uitvoering vraagt de openingsbeweging dus 360 mm extra vloerzone. Ook de lengte van de montagevoeg wijkt per productreeks af. Bij een leveranciersspecifiek BIM-object horen deze maten en de bijbehorende maatdefinities bij dezelfde productcode. [FAKRO-maatblad LWZ Plus](https://www.fakro.nl/att/LOCAL/catalogs/products/FAKRO_brochure_zoldertrappen-2024_april-WEB-MET-PRIJZEN-.pdf)

## Plaatsing en bewegingsruimte

De lokale oorsprong ligt op de ondervloer, recht onder het midden van de achterste korte rand van de ruwbouwsparing. De positieve X-as wijst naar de voeten van de uitgeklapte ladder. De Y-as loopt dwars op de ladder. De verdiepingshoogte wordt gemeten van afgewerkte vloer tot afgewerkte vloer. De onderkant van het plafond ligt één vloerpakketdikte onder de bovenvloer.

De kast bestaat uit vier planken. Het model bevat een luik met sluiting, twee cilindrische openingssteunen, zes ladderbomen, afzonderlijke treden, scharnierbladen en pennen, een greep en twee afgeschuinde voetschoenen. Elke trede draait star mee met haar eigen segment. De tredevlakken staan horizontaal en de beide schoenen sluiten op de ondervloer aan in de gebruiksstand.

De vier werkstanden delen dezelfde onderdeelcodes. Eerst draait het luik met het gevouwen pakket om de achteras. Vervolgens bewegen de twee vouwscharnieren over gelijke, tegengestelde hoeken totdat alle segmenten in elkaars verlengde liggen. Deze bewegingsafspraak levert een reproduceerbare ontwerpruimte. Het bewegingspad en de aansluitdetails van een besteld product volgen uit het bijbehorende montageblad.

De maat **uitloop** is de grootste X-coördinaat van de beweegbare onderdelen in gebruik. Voor de **bedieningsruimte** bepaalt het model per hoekpunt ook de uiterste positie tussen de getoonde standen. Dat gebeurt analytisch op de rotatiebogen. Rond de cilinders telt de buitenstraal mee. Beide maten gebruiken dezelfde achterrand als nulpunt. De gestreepte bewegingsenvelop in de plattegrond omhult alle standen over de inwendige kastbreedte. De positie van de persoon die de ladder bedient vraagt extra ruimte. De opgegeven vrije lengte en vrije hoogte boven de bovenvloer worden aan de modelbeweging getoetst. Een te korte kast kan het pakket in rust of juist tijdens het kantelen raken.

| Voorbeeld met drie delen | Ontwerpmaat |
| --- | ---: |
| Verdiepingshoogte / vloerpakket / vrije plafondhoogte | 2880 / 180 / 2700 mm |
| Ruwbouwsparing / buitenmaat kast | 1300 × 700 / 1284 × 680 mm |
| Treden / hellingshoek in gebruik | 12 / 68° |
| Uitloop in gebruik / benodigde bedieningsruimte, naar boven afgerond | 1265 / 1963 mm |
| Opberghoogte vanaf plafond / boven bovenvloer | 326 / 146 mm |

Dit zijn uitkomsten van het generieke ontwerp. De waarden bij een productcode kunnen verschillen door de scharnierposities, segmentlengten, veermechanismen en reële montagevoegen. Leg voor bestelling ook de overstap op de bovenste vloer, de bevestiging van de luikkast, de randbeveiliging rond de opening en de beschikbare ruimte voor de bediener vast.

Met `node scripts/verify-loft.mjs` worden vier werkstanden, gesloten solids, starre afmetingen, scharnierassen, stand van de treden, vloercontact en de verschillende inbouwconflicten gecontroleerd. Een afzonderlijke reconstructie uit de geëxporteerde onderdelencoördinaten controleert de bedieningsruimte met 901 tussenstanden per bewegingsfase.
