# Schil en modelweergave

Open Stair Studio gebruikt het officiële webpakket van OpenAEC Blueprint 2026.45.0, ontwerp 0.4, op commit `2eb8a958bbfe864dea81237e8890cf2405620b7d`. Dit is ook de Blueprint-revisie waarnaar het lokale Open Frame Studio 2026.48.4 verwijst. De applicatie behoudt het Svelte- en Tauri-model van Frame Studio. [Blueprint-webpakket](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/tree/2eb8a958bbfe864dea81237e8890cf2405620b7d/web)

| Onderdeel | Toepassing |
| --- | --- |
| Componenten en tokens | De originele bestanden `public/blueprint/openaec-components.css` en `openaec-tokens.css` sturen de documenttabs, ribbon-tabs, paneelkoppen, statusbalk en instellingen. De hoofdschil gebruikt de vijf oorspronkelijke themaprofielen. De gebruiker kiest apart de werkruimte, statusbalk en tekstgrootte. De instellingen worden lokaal bewaard. |
| Navigatie | Binnen beide tablijsten wisselen de pijlen van tab. Home en End gaan naar begin en einde. De actieve tab blijft zichtbaar en vormt de tabstop van de lijst. De teken-, reken- en productieweergaven zijn vaste weergaven van hetzelfde trappenproject. |
| Panelen | De projectverkenner en eigenschappen gebruiken de Blueprint-paneelbreedte van 240 px bij een breed venster. Sleep de scheidingslijn of gebruik pijltjes om ruimte te verdelen. Dubbelklik of druk op Enter om de standaardbreedte te herstellen. |
| Titelbalk | In de desktopversie gebruikt de titelbalk de Tauri-vensterfuncties voor verplaatsen, minimaliseren, maximaliseren, herstellen en sluiten. Webgebruikers bedienen het browservenster op de gebruikelijke manier. Ctrl+, opent de weergave-instellingen in beide versies. |
| Iconen en lettertypen | Het ongewijzigde B2-spritebestand `frame.svg` levert de 16- en 24-px-masters. De app laadt Inter, Space Grotesk, JetBrains Mono, Inter AEC en beide Noto-terugvalfonts lokaal. De licenties staan bij de distributiebestanden. |
| 3D | De viewport gebruikt Open BIM Suite v2026.47.5 op commit `a4747e63067524900f51dc409d4967295b438ebd`, de oorspronkelijke camera en shader, en de bijbehorende materiaal- en lijnpipelines. De canvasadapter verbindt die met de parametrische trappen. De desktopversie en de browserversie laden dezelfde WebAssembly-module. |

De sectie-inhoud, modelbomen, tekenbladen en engineeringformulieren zijn vakspecifiek voor Open Stair Studio. Voor de Svelte-bindings van de schil zijn het gedrag van de Blueprint-referentiecomponenten en de titelbalk, instellingen en paneelgrepen van Open Frame Studio gevolgd. [Officiële tab- en paneelcomponenten](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/blob/2eb8a958bbfe864dea81237e8890cf2405620b7d/web/react/src/shell.tsx)

De 3D-weergave draait met links slepen, verschuift met midden/rechts of Shift+links, en zoomt naar de cursor met het wiel. F maakt de hele trap passend. De bronherkomst, ondersteuning van WebGPU/WebGL2, voorwaarden voor GPU-herstel en bouwinstructies staan bij de renderer. [Viewport en bediening](../viewport/README.md)

## Verificatie

`scripts/verify-blueprint-shell.py` gebruikt Edge met Playwright. De browsertest meet bij 1440, 1100 en 1024 CSS-pixels breed alle zes Blueprint-hoogten. Hij controleert 32 px voor de titelbalk, 28 px voor de ribbon-tabs, 94 px voor het lint, 30 px voor documenttabs, 24 px voor paneelkoppen en 22 px voor de statusbalk. Andere controles omvatten muis- en toetsenbordbediening van beide panelen, herladen van voorkeuren, pictogrammen, tabnavigatie, afdrukgedrag en het maximaliseren en herstellen van de eigen Windows-titelbalk.

```powershell
python scripts/verify-blueprint-shell.py http://127.0.0.1:5198
python scripts/verify-blueprint-shell.py --desktop target/release/open-stair-studio.exe
```
