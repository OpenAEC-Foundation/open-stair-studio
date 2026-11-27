# Controle NAA.K.T. en BIM basis ILS

NAA.K.T. beschrijft een materiaal met naam, kenmerk en toepassing. De BIM basis ILS vraagt daarnaast onder meer een gedeeld projectnulpunt, consistente namen en types, passende IFC-entiteiten, bouwlaagtoewijzing, NL-SfB-classificatie en materiaalgegevens. De toepasselijke projectspecificatie bepaalt de uiteindelijke levering.

| Onderwerp | Huidige status |
| --- | --- |
| IFC4 met trap, vluchten, bordes en losse treden | Aanwezig |
| Bouwlaag en objectmerken | Aanwezig |
| Gedeeld projectnulpunt | Houten trap, geselecteerde component en complete componentopstelling gebruiken dezelfde X/Y/Z-verplaatsing en rotatie op IfcSite. Het akkoord van het projectteam is een afzonderlijke eigenschap. |
| Objecten en revisies | Houten treden en stootborden zijn afzonderlijke IfcPlate-objecten. Bomen zijn IfcMember met type STRINGER. De bouwlaag bevat de trap en de vlucht groepeert zijn onderdelen. De identiteit van bestaande onderdelen blijft behouden bij herexport, verplaatsing of wijziging van merk en neuspositie. |
| Maten en hoeveelheden | Pset_StairCommon en Pset_StairFlightCommon dragen de beschikbare trapmaten in de projecteenheid. Bij verdreven vluchten blijft de variabele aantrede herkenbaar. De houten treden, stootborden, bomen, bordessen en randliggers hebben afzonderlijke hoeveelhedensets met nettovolume in m³. |
| Viercijferige NL-SfB-code | Het hoofdtrapontwerp kan opgegeven codes koppelen aan trap en onderdelen, met desgewenst eigen codes voor bordes en leuning. De projectpartners bepalen de juiste code. De componentencatalogus heeft een eigen exportpad. |
| Materiaalnaam volgens naam, kenmerk en toepassing | Gestructureerde invoer en IFC-eigenschappen aanwezig; bij volledige invoer krijgen houten vluchten, bordessen en details dezelfde IFC-materiaalnaam |
| Bordesconstructie | Dikte instelbaar; optioneel vier houten randliggers met stuiknaden en geometrisch geplaatste schroeven in 3D, werkblad, boorpunten-DXF en IFC |
| Bordesberekening | Voorlopige liggerbuiging, doorbuiging en gelijke verdeling van de opgegeven belasting over schroeven; materiaal- en productweerstanden zijn projectinvoer |
| Verbinding van bordes en bomen met gebouw | Ondergrond, ankers, belastingafdracht en constructieve verbinding blijven projectdetail |
| Host-IFC | IFC4-vloeren, sparingen en IfcRelVoidsElement-relaties worden ingelezen; de doorsneden van trap en sparing op het midden van elk vloerpeil worden vergeleken, ook bij niet-rechthoekige sparingen. Dit is geen volledige 3D-clash- of vrijehoogtetoets |

De huidige export is daarmee niet aantoonbaar volledig conform BIM basis ILS. Een NAA.K.T.-materiaalnaam ontstaat pas na invullen van naam, kenmerk en toepassing. De code-invoer controleert alleen de notatie, niet of de gekozen code inhoudelijk juist is. De projectpartners moeten nulpunt, rotatie, codering en materiaalbeschrijvingen verifiëren voordat een ILS-levering kan worden geaccepteerd.

Bij de houten bordestrappen kan de bordesoptrede worden gekozen. De boom van de tweede vlucht begint op bordespeil. Kwartslag- en halfslagbordessen kunnen linksom en rechtsom worden gespiegeld. Het bordesraam heeft vier rechte liggers met stuiknaden; de schroeven lopen door de buitenliggers in de dwarsliggers. Hun schacht en boorpunten zijn gemodelleerd. De sterktecontrole gebruikt een opgegeven schuifweerstand per schroef en een eenvoudige gelijkmatige lastverdeling. Dit is geen volledige houtverbindingstoets. Een specifiek opleg- en verstekdetail naar het gebouw en meerdere vrije draaipunten vragen verdere productuitwerking. Een vrije bordeshoogte tussen optredes is bewust niet aangeboden zolang de aangrenzende optredes niet gelijk blijven.

Versie 0.13.20 biedt IFC4 voor coördinatie en een experimentele IFCX-alpha-export. De IFCX-laag bevat dezelfde productidentiteiten en een driehoeksnet in wereldcoördinaten per fysiek onderdeel. Contractuele levering vraagt afspraken over het ontvangende pakket, schema en informatiebehoefte. De metingen op tien gepubliceerde bestanden staan in de [vergelijking met fabrikant- en gebouwmodellen](bim-referentietrappen.md).

De download vanuit het hoofdtrapontwerp bevat de ontworpen trap. In de componentopstelling kiest de gebruiker het geselecteerde exemplaar of alle daar geplaatste exemplaren. Voor samenvoegen van het hoofdtrapontwerp en de componentopstelling in een coördinatiemodel gebruiken beide exports hetzelfde projectnulpunt.

Bij een gesloten houten trap met ingefreesde stootborden bevat IFC4 de uitsparingen en de aansluitende lippen. Een open houten trap met alleen tredehuizen gebruikt nominale coördinatievolumes. Een rooster dat als tredesysteem in Engineering is gekozen heeft een coördinatievlak en opgegeven inbouwdikte. De complete stalen roostertrap uit Trapontwerp heeft fysieke onderdelen. Oude hoofdtrapexports met willekeurig toegekende GlobalIds kunnen een eenmalige hervergelijking vragen wanneer een project overstapt naar 0.13.20.

Vanaf 0.13.21 vergelijkt de hostcontrole bij het hoofdtrapontwerp de volledige horizontale doorsneden op het middenpeil van elke vloer. Alleen openingselementen die de vloer via IfcRelVoidsElement uitsparen tellen mee. Op dit peil onderzoekt Studio ook ingesloten stukken vloermateriaal en concave contouren. De vergelijking gebruikt een raster van 0,1 mm. Vrije hoogte, hellende vloeren en volledige driedimensionale gebouwpassing vragen een aparte toets. Het hostbestand blijft tijdens de sessie in het geheugen.

[digiGO, NAA.K.T. materiaalbenaming](https://www.digigo.nu/wp-content/uploads/2023/11/EenduidigeMateriaalbenaming_toelichting.pdf)

[digiGO, BIM basis ILS](https://www.digigo.nu/wp-content/uploads/2023/11/BIM_basis_ILS_v1_0_NL.pdf)

[buildingSMART, IFCX Core en modularisatie](https://www.buildingsmart.org/ifcx-core-modularisation-project-update/)
