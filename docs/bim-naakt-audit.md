# Controle NAA.K.T. en BIM basis ILS

NAA.K.T. beschrijft een materiaal met naam, kenmerk en toepassing. De BIM basis ILS vraagt daarnaast onder meer een gedeeld projectnulpunt, consistente namen en types, passende IFC-entiteiten, bouwlaagtoewijzing, NL-SfB-classificatie en materiaalgegevens. De toepasselijke projectspecificatie bepaalt de uiteindelijke levering.

| Onderwerp | Huidige status |
| --- | --- |
| IFC4 met trap, vluchten, bordes en losse treden | Aanwezig |
| Bouwlaag en objectmerken | Aanwezig |
| Gedeeld projectnulpunt | X/Y/Z-invoer, rotatie, Site-plaatsing en akkoordvlag in IFC aanwezig; afstemming met hostmodel blijft projectwerk |
| Typegegevens voor IFC-trapobjecten | IfcStairType, IfcStairFlightType, IfcSlabType en typen voor randliggers en losse details aanwezig; treden en wangen van de houten vlucht zitten nog in de vluchtgeometrie |
| Viercijferige NL-SfB-code op alle objecten | IFC-classificatiereferenties op trap en onderdelen; bordes en leuning kunnen een aparte code krijgen. Semantische codecontrole blijft projectwerk |
| Materiaalnaam volgens naam, kenmerk en toepassing | Gestructureerde invoer en IFC-eigenschappen aanwezig; bij volledige invoer krijgen houten vluchten, bordessen en details dezelfde IFC-materiaalnaam |
| Bordesconstructie | Dikte instelbaar; optioneel vier houten randliggers met stuiknaden en geometrisch geplaatste schroeven in 3D, werkblad, boorpunten-DXF en IFC |
| Bordesberekening | Voorlopige liggerbuiging, doorbuiging en gelijke verdeling van de opgegeven belasting over schroeven; materiaal- en productweerstanden zijn projectinvoer |
| Verbinding van bordes en bomen met gebouw | Ondergrond, ankers, belastingafdracht en constructieve verbinding blijven projectdetail |
| Host-IFC | IFC4-vloeren, sparingen en IfcRelVoidsElement-relaties worden ingelezen; de doorsneden van trap en sparing op het midden van elk vloerpeil worden vergeleken, ook bij niet-rechthoekige sparingen. Dit is geen volledige 3D-clash- of vrijehoogtetoets |

De huidige export is daarmee niet aantoonbaar volledig conform BIM basis ILS. Een NAA.K.T.-materiaalnaam ontstaat pas na invullen van naam, kenmerk en toepassing. De code-invoer controleert alleen de notatie, niet of de gekozen code inhoudelijk juist is. De projectpartners moeten nulpunt, rotatie, codering en materiaalbeschrijvingen verifiëren voordat een ILS-levering kan worden geaccepteerd.

Bij de houten bordestrappen kan de bordesoptrede worden gekozen. De boom van de tweede vlucht begint op bordespeil. Kwartslag- en halfslagbordessen kunnen linksom en rechtsom worden gespiegeld. Het bordesraam heeft vier rechte liggers met stuiknaden; de schroeven lopen door de buitenliggers in de dwarsliggers. Hun schacht en boorpunten zijn gemodelleerd. De sterktecontrole gebruikt een opgegeven schuifweerstand per schroef en een eenvoudige gelijkmatige lastverdeling. Dit is geen volledige houtverbindingstoets. Een specifiek opleg- en verstekdetail naar het gebouw en meerdere vrije draaipunten vragen verdere productuitwerking. Een vrije bordeshoogte tussen optredes is bewust niet aangeboden zolang de aangrenzende optredes niet gelijk blijven.

IFCX is in november 2026 nog in ontwikkeling bij buildingSMART. Deze versie exporteert IFC4. De hostimport leest vloeren en sparingen voor een doorsnedecontrole, inclusief niet-rechthoekige contouren. Vrije hoogte, hellende vloeren en volledige gebouwpassing blijven open. Het hostbestand wordt tijdens deze sessie in het geheugen gehouden en wordt niet in het OSS-projectbestand opgeslagen.

[digiGO, NAA.K.T. materiaalbenaming](https://www.digigo.nu/wp-content/uploads/2023/11/EenduidigeMateriaalbenaming_toelichting.pdf)

[digiGO, BIM basis ILS](https://www.digigo.nu/wp-content/uploads/2023/11/BIM_basis_ILS_v1_0_NL.pdf)

[buildingSMART, IFCX Core en modularisatie](https://www.buildingsmart.org/ifcx-core-modularisation-project-update/)
