# Trap ontwerpen

Open **Trap ontwerpen → Traptype ontwerpen**. Het eerste deel van de keuzelijst bevat de zes houten trapfamilies. Daaronder staan glas, boomloos, staal, vluchttrap, losse platformtrap, aanlegladder, prefab beton, spiltrap en vlizotrap. Selecteer een bestaand merk in de projectboom of bij **Actief ontwerp**. Met **Extra exemplaar** plaats je een tweede ontwerp van hetzelfde type. In **Projectopstelling** zijn bouwlagen en vloercontouren beschikbaar.

| Ontwerp | Instelbare uitwerking |
|---|---|
| Hout | Rechte en verdreven treden met rechte, afgeronde of afgeschuinde bovenzijde. De klassieke balustrade heeft gedraaide spijlen, de moderne uitvoering verjongde spijlen. Beide hebben houten trappalen, geprofileerde handlijsten en aansluitstukken bij richtingswisselingen. Gesloten trappen kunnen een wellat met vellingkant onder iedere neus krijgen. |
| Glazen trap | Treden en bordes met afzonderlijke glasbladen en folies, elastomeeropleggingen, glazen of stalen wangen en optionele glazen balustrades. |
| Boomloze trap | Houten treden met blinde uitsparingen, stalen draagkokers, geboorde wandplaten en ankers. Kies de draagwandzijde en voeg desgewenst een wandhandregel of hek aan de vrije zijde toe. |
| Stalen trap en vluchttrap | Steektrap of retourtrap, gezette plaat of open rooster, plaatwangen, opleghoeken, bordesliggers, voetplaten en optionele kolommen. Kies hekwerk per zijde. De vluchttrap heeft daarnaast een voorcontrole van de doorstroomcapaciteit voor het opgegeven trapgedeelte. |
| Losse platformtrap en aanlegladder | Eigen werk- of aanlegpunthoogte, breedte en helling. De platformtrap heeft een achtersteun en een instelbare beugel. De ladder heeft ronde sporten of vlakke treden en optionele handgrepen. |

**Werkplaats en BIM.** Op **Houtdetails** kies je een onderdeelgroep en merk, profielstation, maatvaste PDF of detail-DXF. De maatstaat en calculatie gebruiken de ruwmaten van de houten detailstukken. De CNC-contour voor de trede krijgt op het opstelblad een aparte bewerking voor het neusprofiel. Bij de overige ontwerptypen geven **Onderdelen**, plattegrond en aanzicht de getekende uitvoering. **Ontwerp als IFC4** exporteert het geselecteerde merk. **Geheel project als IFC4** exporteert de complete opstelling.

Open voor glas, boomloos, staal en vluchttrappen **Engineering → Berekening**. Daar staan de ontwerpgrondslag, rekeninvoer, grenswaarden, resultaten en open projecttoetsen. Bij glas en boomloos omvat Gk het toegerekende eigen gewicht. Bij staal berekent het model het eigen gewicht uit de onderdeelvolumes en voer je de overige permanente lasten in. Onder **Werkvoorbereiding → Verbindingen** kies je een detail. Het blad toont de modelgeometrie, de traplokale ankerharten en de deeltoetsen. In IFC4 bevat een IfcGroup per verbinding dezelfde onderdeelmerken en toetswaarden. [Rekenvoorbeeld](../examples/rekenvoorbeeld-trapverbindingen.oss.json) · [Glas en boomloos](glazen-en-boomloze-trap.md) · [Staal en vluchttrappen](staaltrap-constructie.md) · [buildingSMART, Group Assignment](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2/HTML/schema/templates/group-assignment.htm)

Bij vluchttrappen blijft de doorstroomcapaciteit afzonderlijk te raadplegen onder **Ontwerpcontrole**. [IPLO, vluchten bij brand](https://iplo.nl/publish/pages/245968/vluchten-bij-brand-nieuwbouw-bbl.pdf)

De positie van de wellat onder de neus sluit aan op een gangbare uitvoering bij gesloten houten trappen. De voorbeeldprofielen en maten in de software zijn eigen ontwerpen. [De Kruijf Trappen, gesloten dubbelkwart met wellat](https://www.dekruijftrappen.nl/trap-projecten/vuren-dichte-dubbelkwart-trap-naar-de-zolder/) · [Glazen en boomloze trap](glazen-en-boomloze-trap.md)
