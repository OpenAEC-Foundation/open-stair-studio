# Constructieve toets van rechthoekige treden

De toets gebruikt de werkelijke tredediepte inclusief neus, de breedte en de dikte uit de modelgeometrie. De trede overspant in één richting tussen twee parallelle opleglijnen aan de kopranden. Dezelfde doorsnede en oplegsituatie moeten voor alle berekende treden gelden. Bordessen, belaste overstekken en verdreven treden vereisen een apart plaat- en oplegmodel.

## Belastingen en oplegreactie

De gebruiker levert de permanente belasting inclusief eigen gewicht, veranderlijke vlaklast en puntlast, UGT-factoren, lastafmetingen en de toepasselijke vervormingsgrens. De app neemt de ongunstigste uitkomst van twee afzonderlijke combinaties, permanente belasting plus vlaklast en permanente belasting plus puntlast. Beide veranderlijke belastingen zijn positief vereist. Herkomst en toepasselijkheid komen uit het projectdossier. [Europese Commissie JRC over belastingen op constructies](https://eurocodes.jrc.ec.europa.eu/EN-Eurocodes/eurocode-1-actions-structures)

Bij gelijkmatig verdeelde lijnlast *w* gelden *M = wL²/8* en *R = wL/2*. De puntlast op veldmidden geeft *M = PL/4*. Voor dwarskracht en eindverbinding geldt conservatief de hele puntlast nabij één steun. Voor de volledige verbinding wordt de verdeelde last over de hele trede geïntegreerd. De invoer voor de verticale verbinding is de kleinste ontwerpweerstand van beide volledige aansluitingen, inclusief eventuele excentrische belasting. Aan het maatgevende belaste oppervlak bij de rand of hoek wordt tevens de extra toelaatbare ontwerplast bij de aanwezige permanente belasting gecontroleerd.

## Materiaalgedrag

| Systeem | Doorsnede en stijfheid | Benodigde onderbouwing |
| --- | --- | --- |
| Gelaagd glas | *W = b hσ²/6*, *I = b hw³/12*. De effectieve dikte voor spanning hoort bij het maatgevende blad. Voor de stijfheid geldt een afzonderlijke effectieve dikte. | Projectgebonden opbouw, glaslagen, temperaturen, belastingsduren, maatgevende plaats van het lastvlak, effectieve strookbreedte, lokale rand- en oplegweerstand. Het restdraagvermogen na breuk verlangt een eigen bewijsreferentie. |
| Stalen rooster | Netto rechthoekige draagstaaf met *W = t h²/6* en *I = t h³/12*. Bij vlaklast wordt de grootste tributair belaste breedte per staaf ingevoerd. Bij puntlast draagt één staaf de volledige last. | Richting en netto profiel van de draagstaaf, stabiliteit, productweerstanden, lastvlak, randstaaf, kopplaat, oplegging en verbinding. |
| CLT | Buig- en schuifstijfheid per meter uit de schuifanalogiemethode in de werkelijke draagrichting, teruggerekend naar de onderbouwde strookbreedte. *GA* bevat de schuifcorrectie en rolafschuiving. De weerstandstoets gebruikt netto *MRd* en *VRd* in dezelfde richting. | Productopbouw en ETA, exacte oriëntatie, gebruiksklasse, rolafschuiving, netto randcapaciteit en bevestiging. Kruipfactor en quasiblijvende factor komen uit de projectgrondslagen. |

De afzonderlijke effectieve glasdikten en hun afhankelijkheid van de belasting zijn beschreven door het JRC. De NGA beschrijft de specifieke eisen aan beloopbaar glas, plaatselijke belasting en gebroken glaslagen. [JRC over effectieve dikte van gelaagd glas](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2025-08/JRCWorkshop_2ndGenEUROCODES_EC10_rk_website.pdf) · [NGA over glazen vloeren en trappen](https://www.glass.org/sites/default/files/2021-07/FB14-07_2020_Glass_Floors_and_Stairs_0521.pdf) · [NEN 2608:2026](https://www.nen.nl/nen-2608-2026-nl-345335)

De IGI-leidraad behandelt draagstaaf, overspanning, belastingvlak en bevestiging van roostertreden. Het CLT Handboek beschrijft de schuifanalogiemethode en productafhankelijke stijfheden. [IGI-leidraad, hoofdstukken 2 en 3](https://www.gitterroste-online.de/fileadmin/inhalte/igi/download/IGI_Leitfaden_NL_2020_low.pdf) · [Swedish Wood, The CLT Handbook, §3.3](https://www.swedishwood.com/siteassets/5-publikationer/pdfer/clt-handbook-2019-eng-m-svensk-standard-2019-2022.pdf)

## Doorbuiging en uitkomst

Voor het midden van de ligger gelden *u = 5wL⁴/(384EI)* en *u = PL³/(48EI)*. Bij CLT komt voor die gevallen respectievelijk *wL²/(8GA)* en *PL/(4GA)* erbij. De app berekent de einddoorbuiging van CLT als *uG(1+kdef) + uQ(1+ψ₂kdef)*. Bij glas worden voor het volledige belastingbereik conservatieve effectieve stijfheden ingevoerd.

De berekening van de rechthoekige stalen draagstaaf bevat ook de schuifvervorming. De schuifoppervlakte is *5A/6*. Voor stabiel isotroop staal geldt *G = E/[2(1+ν)]* met *ν < 0,5*. De rekenkern gebruikt de conservatieve ondergrens *E/3*. [MIT, isotrope elasticiteit](https://ocw.mit.edu/courses/16-20-structural-mechanics-fall-2002/f3afb8471fa0b58366cebcad2a171375_ho2.pdf) · [MIT, Timoshenko-ligger en schuifcorrectie](https://ocw.mit.edu/courses/2-094-finite-element-analysis-of-solids-and-fluids-ii-spring-2011/116df281a310a9ccdbbb8dd7ec7a2d6e_MIT2_094S11_2094_lectures.pdf)

Iedere uitkomstregel bevat de belasting, grens, benutting en het maatgevende lastgeval. Bij ontbrekend bewijs krijgt de toets de status open. Een bekende overschrijding blijft zichtbaar wanneer bewijsreferenties ontbreken. Een positieve materiaaltoets heeft uitsluitend betrekking op het berekende tredemodel en de ingevoerde projectgegevens. De software verifieert de inhoud van een genoemd rapport niet. De onafhankelijke rekenvoorbeelden zijn uitvoerbaar met `node scripts/verify-resistance.mjs`.

## Onafhankelijke regressiecontrole

Voer vanuit de projectmap `node scripts/verify-independent-engineering.mjs` uit. De proef berekent momenten en oplegreacties uit evenwicht bij 101 puntlastposities. Voor de doorbuiging integreert zij virtuele arbeid over 4.000 intervallen. Bij een overspanning van 800 mm, G = 0,5 kN/m², q = 3 kN/m² en P = 2 kN geeft de proef 4,6286 mm voor glas, 6,4330 mm voor de roosterstaaf en 7,6970 mm voor CLT. De modeldoorsneden en stijfheden staan in het script. Een tweede lastgeval maakt de verdeelde belasting maatgevend.

Dezelfde proef meet de breedte met minstens 170 mm aantrede met 16.001 meetstralen per neus op de contour tot de volgende neus. Zij controleert 136 treden van kwart- en halfslagtrappen met beide draairichtingen en beide buitenvormen. De toegestane meetafwijking tussen de analytische uitkomst en de bemonstering is 0,14 mm.
