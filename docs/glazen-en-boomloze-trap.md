# Glazen trap en boomloze wandtrap

Beide ontwerpen zijn rechte vluchten met een afzonderlijk aankomstbordes. Onder **Trap ontwerpen** stel je onder meer de breedte, aantrede, het aantal optredes en de bordesdiepte in. De verdieping bepaalt het hoogteverschil.

## Glazen trap

De trede en het bordes bestaan uit twee tot vijf afzonderlijke glasplaten met lamineerfolie. Bij drie platen van 10 mm en twee folies van 1,52 mm is de totale bouwdikte 33,04 mm. Iedere laag krijgt een eigen gesloten lichaam en materiaal in IFC4. Voor het loopvlak kun je keramische zeefdrukstroken aan de voorrand kiezen. [sedak, glazen trappen met gelaagde treden, glazen wangen en zeefdruk](https://www.sedak.com/en/architecture/glass-stairs/)

Onder ieder uiteinde van een trede ligt een doorlopende elastomeerband op een stalen oplegstoel. Een tweede band scheidt de oplegstoel van de wang. De maat *vrije overspanning tussen oplegbanden* volgt uit de binnenranden van de twee opleggingen. Je kunt gelaagde glazen of stalen zaagtandwangen kiezen. De voet- en bordesplaten hebben gemodelleerde ankergaten en bevestigers. [Jockimo, oplegdetails voor glasvloeren en glastreden](https://www.jockimo.com/files/Jockimo-glassflooring-glasstreads_web.pdf)

Bij een glazen balustrade tekent het programma per paneel twee glaslagen met een folie, een stalen schoen met bodem- en zijpakkingen en een doorlopende handregel. Kies de zijden bij het stijgen. De constructeur en leverancier bepalen per project de toepasbare opbouw, restdraagkracht bij breuk, stroefheid, glaskantbelasting en bevestiging.

## Boomloze wandtrap

Elke aantrede heeft twee holle stalen draagkokers aan een geboorde wandplaat. Het hout omhult de kokers. De rechthoekige uitsparingen zijn werkelijk uit het tredevolume genomen. Bij de uitvoering met wandhandregel eindigen de kokers in blinde uitsparingen. De maat *hout voorbij de blinde uitsparing* bepaalt de dikte van de houten sluitzijde. Een langere bordesplaat krijgt extra paren draagkokers. De opbouw met houten trede, stalen console en wandverankering is herkenbaar in leveranciersdetails. [KENNGOTT, principedoorsnede](https://www.kenngott.de/fileadmin/kenngott/Produkte/Sonstiges/Merkblatt_KENNGOTT-Kragarmtreppe.pdf) · [AN Treppenbau, stalen wandconsoles](https://www.an-treppenbau.de/produkte/stahlkonsolen/)

Met een glazen balustrade aan de vrije zijde lopen de kokers door tot de buitenste kopplaat die de balustradeschoen draagt. De spiegelinstelling verplaatst de complete wandbevestiging, de houten treden en de leuning naar de andere zijde. Inbedding en kokermaat zijn ontwerpwaarden. De draagkracht van de bestaande wand, ankergroep en lasverbinding en het trillingsgedrag vragen een projectberekening.

## Constructieve invoer

Geef in het trapontwerp de karakteristieke vlaklast, de afzonderlijke puntlast, de totale permanente belasting per m² horizontale projectie en de projectgrens voor doorbuiging op. Leg in de projectnota vast welke opbouw, belastingduur, gebruiksfunctie en combinatie je beoordeelt. De twee afzonderlijke UGT-lastgevallen zijn γG·G + γQ·q en γG·G + γQ·Q. De BGT gebruikt de karakteristieke lasten. Onderbouw hoe eigen gewichten van de aansluitingen, de wang en het leuningwerk in G zijn opgenomen. Aanvullende horizontale, dynamische of accidentele belastingen vragen een eigen beoordeling.

Het rekenblad voor de glazen trap behandelt trede en bordes afzonderlijk. De glasstrook overspant tussen de harten van de elastomeerbanden. De bovenste glasplaat geldt als slijtlaag. De overige even dikke bladen delen de buiging met afzonderlijke traagheidsmomenten. Voor *n* dragende bladen, strookbreedte *b* en bladdikte *t* geldt I = n·b·t³/12 en W = n·b·t²/6. Voor de plaatselijke puntlast moet de projectnota de effectieve breedte onderbouwen, ook aan de rand. De berekende doorbuiging is een bovengrens uit de maximale kromming over de overspanning en de uitkragingen. Breukgedrag, lokale contactspanningen en borging blijven afzonderlijke controles. [JRC, ontwerp van constructief glas](https://eurocodes.jrc.ec.europa.eu/news/cents-191002021-design-glass-structures) · [National Glass Association, Glass Floors and Stairs](https://www.glass.org/sites/default/files/2021-07/FB14-07_2020_Glass_Floors_and_Stairs_0521.pdf)

Voor elke zaagtandwang vul je de projectspecifieke momentweerstand en de ondergrens van de equivalente verticale buigstijfheid op horizontale projectie in. Deze moeten de werkelijke inkepingen en randcondities dekken. Het programma bepaalt drukreacties op de voet en de kop. Bij de kopconsole volgen het moment en de trekkracht uit de afstand tot de vloerwand en de opgegeven hefboom tot de drukzone. Beide kopankers liggen in dezelfde horizontale rij. De gemodelleerde flens begrenst de hefboom tot 22 mm. Een detailrapport moet rekening houden met de groep, ondergrond, inbedding en afstanden tot randen. [EOTA, beoordelingsdocumenten voor bevestigingen](https://www.eota.eu/eads)

Bij de boomloze trap liggen de kokerassen op een halve steek van de voor- en achterrand. Een puntlast op deze rand levert bij een kokerpaar reacties van 1,5 Q en −0,5 Q. De controle volgt de zwaarst belaste arm van de oplegstrook tot de rondomlas. De elasticiteitsberekening omvat buig- en schuifvervorming. Een aparte strookcontrole beoordeelt de houten bovenhuid dwars op de kokers. Voor de vier wandankers rekent het programma met torsie door excentrische belasting, trek op de bovenste rij en gecombineerde afschuiving. Voer de groepsweerstanden en de hefboom van de getoetste wandplaat in. Onderbouw ook de verdeling over meerdere bordesparen, het oplichten van de huls, de hoeklast op een blind uiteinde en de gezamenlijke vervorming van huls, koker en wandplaat.

## Verificatie

`node scripts/verify-glass-cantilever.mjs` controleert de gesloten volumes, de netto uitsparingen en materiaaldikten, de oplegcontacten, spiegeling en de materiaaltoewijzing na IFC4-export. Met `--ifc-dir` gevolgd door een bestaande map schrijf je beide controlemodellen weg.

`node scripts/verify-glass-design.mjs` vergelijkt de glasstrook, oplegreacties, koker, las en ankers met handberekeningen en controleert de koppeling aan de getekende onderdelen. De tests bevatten ook ontbrekende gegevens, overschrijdingen, een gespiegeld ontwerp en bordessen met meerdere wandplaten.


## Resttoestand en stabiliteit

Bij één gebroken dragend blad neemt de resttoets één blad uit de afzonderlijk dragende glaslagen weg. De bovenste slijtlaag telt niet als dragend. De toets toont spanning en een elastische bovengrens voor doorbuiging bij intacte opleggingen. Het rapport voor fragmentretentie en borging van de tegenoverliggende oplegging blijft een afzonderlijk open projectpunt. Boomloze trappen hebben invoer voor horizontale karakteristieke belasting, weerstand van de complete wandverbinding en een grens voor zijverplaatsing. De vervormingscontrole neemt conservatief de volledige belasting op één koker aan. Per wandankergroep worden ondergrondtype, sterkteklasse, randafstand, getekende h.o.h.-afstand en productrapport opgeslagen.
