# Prefab betontrap in het trappenhuis

De prefab betontrap heeft een rechte of terugkerende vlucht, een eigen bordes op de verdieping en bij de retourvorm een tussenbordes over beide vluchten. De opstelling verbindt twee opgegeven vloerpeilen. Bij een oneven aantal optredes krijgt de eerste vlucht één optrede extra. Het uittreepunt verschuift dan één aantrede ten opzichte van de aanzet. Plaats aangrenzende verdiepingsvloeren en doorgangen op de resulterende bordesrand.

## Aansluiting op de praktijk

- Vebo onderscheidt bestaande mallen met specifieke maten van projectspecifieke betontrappen. Daarom heeft dit component afzonderlijke invoer voor bordesdiepte, vluchtafmetingen en oplegdetail. De fabriekscertificering van een bestaand product geldt voor dat product. [Vebo prefab trappen](https://www.vebo.nl/trappen)
- HCI levert combinaties met boven-, tussen- en onderbordes en adviseert om de montage van relingen in het prefabontwerp te voorzien. In het model zijn de hekstijlen en voetplaten afzonderlijk terug te vinden. Het ankerplan en de draagkracht van de bevestigingen worden met de leverancier uitgewerkt. [HCI trappen en bordessen](https://www.hcibeton.nl/woningbouw/producten/trappen-en-bordessen/)
- Bij Vebo's montageadvies zijn stelruimte en een gecontroleerde randafstand voor het oplegmateriaal van belang. Schöck documenteert de opbouw met elastomeer tussen een prefab vlucht en een bordes. Het generieke oplegdetail hier heeft instelbare geometrie en maakt geen aanspraak op de draagkracht, geluidsisolatie of brandprestatie van een fabrieksproduct. [Vebo verwerkingsadvies](https://www.verwerkingsadviezen.nl/vebo-trappen/) · [Schöck Tronsole F](https://www.schoeck.com/en-gb/tronsole-f)
- Mombarg beschrijft zowel losse als aangestorte bordessen en verschillende neus- en oppervlakafwerkingen. De gemodelleerde bordessen zijn losse prefab elementen. De optie voor een contraststrip reserveert per tredevlak een sponning van 30 × 4 mm en vult deze met een afzonderlijke strip. De stroefheid en hechting van de gekozen afwerking vragen productgegevens. [Mombarg trappen en bordessen](https://mombargbeton.nl/prefab-beton-elementen/trappen-bordessen/)

## Geometrie en hoeveelheden

De bovenzijde van de vlucht heeft één optrede per hoogteverschil, met het gekozen onderschot van het stootbord en een afgeschuinde neus. Het bovenbordes neemt de laatste aantrede over. De onderzijde loopt evenwijdig aan de lijn door de binnenhoeken van de trap. De opgegeven loopplaatdikte wordt loodrecht op die lijn gemeten.

Aan de kop en voet van de vlucht liggen horizontale oplegnokken. Een instelbare massieve schouder achter de teen van het laatste stootbord zorgt voor een doorgaande betondoorsnede bij de bovennok. De bijbehorende ondersponning van het bordes ligt op de nokhoogte plus de stripdikte onder het loopvlak. De effectieve breedte van de gemodelleerde oplegstrip is de nokprojectie minus de stelvoeg en tweemaal de ingestelde randafstand. De strip loopt over de volle vluchtbreedte. Bij de keuze voor een gebouwvloer wordt de bijpassende sponning aan de aanzet door het gebouw geleverd.

Het netto volume is het uitgestorte langsprofiel maal de elementbreedte. Ook de vellingkanten, neusvorm, sponningen en oplegnokken tellen mee. De massa volgt uit dat volume en de ingevoerde volumieke massa. Met de voorbeeldmaten bevat een retourtrap van 2.880 mm twee vluchten, veertien tredevlakken met contraststrip en twee bordessen. Het betonvolume is circa 2,455 m³. Bij 2.450 kg/m³ is de gezamenlijke massa circa 6.015 kg. De massa per element staat bij de betreffende vlucht en het bordes.

De rondstalen leuningen volgen de tredevlakken en de buitenrand van het tussenbordes. Aan de schalmzijde keren zij rond de rand van het trapgat. Mogelijke aansluitingen op aangrenzende vloeren en wanden vragen de gebouwtekening. De massa's dienen voor hoeveelheden en coördinatie. Voor transport en hijsen zijn de definitieve gewichten, zwaartepunten en ingestorte voorzieningen van de fabrikant vereist.

`node scripts/verify-concrete.mjs` controleert zestien maat-/uitvoeringscombinaties, de oriëntatie en geslotenheid van iedere solid, het volume via onafhankelijke integratie en de positie van de elastomeerstrips in de bordessponning.
