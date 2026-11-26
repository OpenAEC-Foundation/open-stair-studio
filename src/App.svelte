<script>
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import UpdateControl from './UpdateControl.svelte';
  import WinderControls from './WinderControls.svelte';
  import WinderSchedule from './WinderSchedule.svelte';
  import HousingSheet from './HousingSheet.svelte';
  import HousingCam from './HousingCam.svelte';
  import LandingFrameSheet from './LandingFrameSheet.svelte';
  import TreadCam from './TreadCam.svelte';
  import EngineeringView from './EngineeringView.svelte';
  import ReferenceParts from './ReferenceParts.svelte';
  import { deriveEngineering, structureTypes } from './engineering.js';
  import JoineryControls from './JoineryControls.svelte';
  import { buildWorkshop, individualTreads, treadStockAllowance, referenceTreadRows } from './workshop.js';
  import { makePartsCsvRows } from './winder-parts.js';
  import BlueprintSettings from './BlueprintSettings.svelte';
  import BlueprintSplitter from './BlueprintSplitter.svelte';
  import BlueprintWindowControls from './BlueprintWindowControls.svelte';
  import { blueprintTabs } from './blueprint-shell.js';
  import StairViewport from './StairViewport.svelte';
  import StairwellView from './StairwellView.svelte';
  import WellProperties from './WellProperties.svelte';
  import { editLiftPlanFields } from './precast-plans.js';
  import { stairwell as concreteExample } from '../examples/trappenhuis-beton.oss.json';
  import { stairwell as liftPlanExample } from '../examples/prefab-elementhijsplannen.oss.json';
  import { assembleWell, componentTypes, newInstance, typeOf } from './stairwell.js';
  import { editWell } from './project.js';
  import { buildStairDetails, newDesignDetails } from './stair-details.js';
  import StairDetailControls from './StairDetailControls.svelte';
  import { createPlanDxf } from './plan-dxf.js';
  import { readHostIfc, checkHostFit } from './host-ifc.js';
  import { draftKey, editSession, isDirty, parseInput, readProject, redoSession, restoreDraft, saveDraft, startSession, undoSession } from './project.js';
  import { calculateEstimate, deriveStair, elevationPath, generateStairGeometry, inspectStair, ruleProfiles, stairFamilies, starterProject } from './stair.js';

  import TimberDetailSheet from './TimberDetailSheet.svelte';
  import { addTimberTakeoff } from './timber-takeoff.js';
  import timberExample from '../examples/klassieke-eiken-kwartslag.oss.json';

  function freshDesign() {
    const project=structuredClone(starterProject);
    Object.assign(project.stair,newDesignDetails,{timberDetail:'modern',noseProfile:'round',railSide:'none'});
    return project;
  }
  let model = freshDesign();
  let hostContext = null;
  let hostLoading = false;
  let session = startSession(model);
  let openRequest = 0;
  let projectFile;
  let newProjectDialog;
  let activeRibbon = 'Trap ontwerpen';
  let activeView = '3D-model';
  let wellSelection = '';
  let wellWorkspace;
  async function inspectCast(instanceId,castId) {
    wellSelection=instanceId;
    await tick();
    await wellWorkspace?.showCalculation(castId);
  }
  let exportingWell = false;
  $: well = model.stairwell;
  $: wellItem = well.instances.find(i=>i.id===wellSelection) ?? well.instances[0];
  $: assemblies = activeView === 'Trapontwerp' ? assembleWell(well) : [];
  $: activeStructural=assemblies.find(a=>a.instance.id===wellItem?.id)?.structural;
  function restoreDesign(project) {
    const id=project.designSelection;
    if(id===null)return;
    const item=project.stairwell.instances.find(i=>i.id===id)??project.stairwell.instances[0];
    if(item) openWell(item.id);
  }
  $: visibleComponents = componentTypes.filter(t => (t.label + (t.id==='loft'?' vlisotrap zoldertrap':'')).toLowerCase().includes(libraryQuery.trim().toLowerCase()));
  function openWell(id) {
    if (id) wellSelection=id;
    activeView='Trapontwerp';activeRibbon='Trap ontwerpen';rightTab='Eigenschappen';
  }
  function saveWell(raw) {
    try { commitSession(editWell(session,raw)); return true; }
    catch(error){notify(error.message);return false;}
  }
  function addWell(type, previous) {
    const item = newInstance(type,well,previous ? previous.storey+1 : (wellItem?.storey??0),previous);
    if (saveWell({...well,instances:[...well.instances,item]})) openWell(item.id);
  }
  function addConcreteExample(withLocalSteel=false) {
    if (well.instances.length) return false;
    const example=structuredClone(withLocalSteel?liftPlanExample:concreteExample);
    example.uid=well.uid;
    example.instances=example.instances.map(item=>({...item,id:crypto.randomUUID()}));
    if (!saveWell(example)) return false;
    openWell(example.instances[0].id);
    return true;
  }
  function changeWell(section,key,value) {
    if(section==='liftPlan') {
      try {
        const plans=editLiftPlanFields(wellItem.liftPlans??{},key,value);
        return saveWell({...well,instances:well.instances.map(i=>i.id===wellItem.id?{...i,liftPlans:plans}:i)});
      } catch(error) {notify(error.message);return false;}
    }
    if (section==='shaft') return saveWell({...well,[key]:value});
    if (section==='level') {
      const heights={...well.heights};
      if (value===null) delete heights[wellItem.storey]; else heights[wellItem.storey]=value;
      return saveWell({...well,heights});
    }
    const updated=section==='params'?{...wellItem,params:{...wellItem.params,[key]:value}}:
      section==='connectionGround'?{...wellItem,connectionGround:{...wellItem.connectionGround,[key]:value}}:{...wellItem,[key]:value};
    return saveWell({...well,instances:well.instances.map(i=>i.id===wellItem.id?updated:i)});
  }
  function removeWell() {
    if (wellItem && window.confirm(wellItem.mark+' uit het trappenhuis verwijderen?'))
      saveWell({...well,instances:well.instances.filter(i=>i.id!==wellItem.id)});
  }
  async function exportWellIfc(scope='selected') {
    if(exportingWell) return;
    exportingWell=true;
    const source=model, item=wellItem;
    try {
      const {createStairwellIfc}=await import('./stairwell-ifc.js');
      const full=scope==='project';
      const target=full?source.stairwell:{...source.stairwell,instances:[item]};
      const bytes=await createStairwellIfc(source.project,target);
      downloadFile(source.project.number+'-'+(full?'projectopstelling':item.mark)+'.ifc',bytes,'application/x-step');
      notify((full?'Gehele projectopstelling':item.mark)+' als IFC4 geëxporteerd');
    } catch(error){notify(error.message);} finally{exportingWell=false;}
  }
  let rightTab = 'Eigenschappen';
  let leftTab = 'Project';
  let libraryQuery = '';
  let zoom = 100;
  let viewport;
  let viewportDocument = 0;
  let stairCamera = null;
  let viewZoom = 100;
  function resetCamera() {
    woodView='all';
    stairCamera = null;
    viewZoom = 100;
    viewportDocument++;
  }
  let selectedTreadId = '';
  let selectedBeamId = '';
  let selectedPocketId = '';
  let sheetMode = 'staat';
  let showWalkline = true;
  let showWinderOpening = false;
  $: includeOpening = (!geometry.dimensions.family.winder || showWinderOpening) && model.building.openingWidth > 0 && model.building.openingLength > 0;
  function openTread(id) {
    selectedTreadId = id;
    sheetMode = 'detail';
    activeView = 'Onderdelen';
  }
  function resetPartSelection() {
    selectedTreadId = '';
    selectedBeamId = '';
    selectedPocketId = '';
    sheetMode = 'staat';
  }
  $: drawingView = ['3D-model', 'Plattegrond', 'Doorsnede'].includes(activeView);
  $: visibleFamilies = stairFamilies.filter(family => family.label.toLocaleLowerCase('nl').includes(libraryQuery.trim().toLocaleLowerCase('nl')));
  let selectedItem = model.stair.mark;
  let toast = '';
  let dirty = false;
  let timer;
  let history = [];
  let future = [];
  const ribbonTabs = ['Start', 'Trap ontwerpen', 'Engineering', 'Controleren', 'Werkvoorbereiding', 'CNC', 'BIM'];
  const views = [
    { id: '3D-model', icon: 'bim.workspace' },
    { id: 'Plattegrond', icon: 'frame.layout' },
    { id: 'Doorsnede', icon: 'frame.editor' },
    { id: 'Engineering', icon: 'calculation.recalculate' },
    { id: 'Onderdelen', icon: 'planning.cut-list' },
    { id: 'Houtdetails', icon: 'profile.manage' },
    { id: 'Wangbladen', icon: 'frame.editor' },
    { id: 'Calculatie', icon: 'calculation.recalculate' },
    { id: 'CNC-machine', icon: 'frame.cnc' },
    { id: 'Trede-CNC', icon: 'frame.cnc' },
    { id: 'BIM-model', icon: 'ifc.workspace' }
  ];

  // Project edits replace only the affected section. Keep the GPU scene alive
  // while a user edits loads, costs or other project metadata.
  const geometryByStair = new WeakMap();
  function geometryFor(stair) {
    if (!geometryByStair.has(stair)) geometryByStair.set(stair, generateStairGeometry(stair, { projectIsometric: false }));
    return geometryByStair.get(stair);
  }
  $: geometry = geometryFor(model.stair);
  $: designChecks = inspectStair(model, geometry);
  $: invalidGeometry = designChecks.find(item => item.level === 'error' && item.reference === 'Geometrische invoer');
  $: timberSystem = model.engineering.structureType === 'timber';
  $: details = timberSystem && !invalidGeometry ? buildStairDetails(model.stair,geometry) : [];
  $: baseWorkshop = invalidGeometry ? geometry : buildWorkshop(geometry,model);
  $: workshop = timberSystem && !invalidGeometry ? addTimberTakeoff(baseWorkshop,model.stair,details) : baseWorkshop;
  $: housingIssues = workshop.housings?.issues ?? [];
  let woodView='all';
  $: visibleWood=timberSystem && !invalidGeometry && (model.stair.timberDetail!=='basic'||model.stair.wellatType==='chamfered');
  $: isolated=visibleWood?woodView:'all';
  $: sceneGeometry = isolated==='rail'&&details.some(p=>p.kind==='railing')?{componentParts:details.filter(p=>p.kind==='railing'||p.role==='newel'||p.role==='baluster'),viewDirection:geometry.treads[0]?.direction}:
    {...geometry,treads:timberSystem?workshop.treads:geometry.treads,componentParts:isolated==='boards'?details.filter(p=>p.role==='riser'||p.role==='nosingStrip'):[...details,...(timberSystem?[...(geometry.landingFrame??[]),...(geometry.landingFasteners??[])]:[])],
    stringers:isolated==='boards'?[]:geometry.stringers};
  $: materialLabel = timberSystem ? model.stair.material : structureTypes.find(type => type.id === model.engineering.structureType)?.label;
  $: referenceRows = timberSystem ? [] : referenceTreadRows(geometry);
  $: hasTreadSheets = !!workshop.housings || !!workshop.detailTakeoff || geometry.dimensions.family.winder || (timberSystem && model.stair.noseProfile!=='square');
  $: treadParts = invalidGeometry ? [] : individualTreads(workshop);
  $: selectedPart = treadParts.find(p => p.id === selectedTreadId) ?? treadParts.find(p => p.isWinder) ?? treadParts[0];
  $: dimensions = geometry.dimensions;
  $: hostFit = checkHostFit(geometry, hostContext, model.bim);
  $: planBox = (() => {
    if (!includeOpening) return { ...geometry.planBox, y: -(geometry.planBox.y + geometry.planBox.height) };
    const pad = 160;
    const x0 = Math.min(geometry.planBox.x, -pad);
    const y0 = Math.min(geometry.planBox.y, -Number(model.building.openingWidth) / 2 - pad);
    const x1 = Math.max(geometry.planBox.x + geometry.planBox.width, Number(model.building.openingLength) + pad);
    const y1 = Math.max(geometry.planBox.y + geometry.planBox.height, Number(model.building.openingWidth) / 2 + pad);
    return { x: x0, y: -y1, width: x1 - x0, height: y1 - y0 };
  })();
  $: dossier = deriveEngineering(model, geometry);
  $: engineeringFindings = [
    ['Constructie van de trede', dossier.resistance, ['glass','grating','clt'].includes(model.engineering.structureType)],
    ['Doorstroomcapaciteit', dossier.escape, model.engineering.use !== 'regular']
  ].filter(([, , enabled]) => enabled).map(([title, result]) => ({
    title, reference: 'Engineeringdossier', level: result.status === 'fail' ? 'error' : result.status === 'pass' ? 'ok' : 'info',
    detail: result.status === 'fail' ? result.rows.filter(row => row.status === 'fail').map(row => row.label).join(' · ') + ' overschreden.'
      : result.status === 'pass' ? (result.capacity != null ? result.capacity + ' personen voor het opgegeven gedeelte.' : 'De doorgerekende onderdelen voldoen binnen het opgegeven rekenmodel.')
      : result.reasons[0] || 'Beoordeling open.'
  }));
  $: checks = [...details.filter(p=>p.fabricationIssue).map(p=>({level:'warning',title:p.id,detail:p.fabricationIssue,reference:'Houtdetails'})),...designChecks, ...engineeringFindings, ...housingIssues.map(issue => ({
    level: issue.level, title: 'Tredeverbinding', detail: issue.message, reference: 'Werkvoorbereiding'
  }))];
  $: cncAllowance = treadStockAllowance(treadParts, model.treadCam.stockMargin);
  $: estimate = calculateEstimate(workshop, model.estimate, cncAllowance);
  $: errors = checks.filter(item => item.level === 'error').length;
  $: outline = elevationPath(model.stair);
  $: stairTab = activeRibbon === 'Trapontwerp' ? 'Componenten, bouwlagen en plaatsing' : activeRibbon === 'Engineering' ? 'Tredesysteem, oplegging en vluchtroute' : activeRibbon === 'Trap ontwerpen' ? 'Traptype, geometrie en verbindingen' : activeRibbon === 'Werkvoorbereiding' ? 'Onderdelen, mallen en werkblad' : activeRibbon === 'CNC' ? 'Machine en bewerkingen' : activeRibbon === 'BIM' ? 'Model en uitwisseling' : activeRibbon === 'Controleren' ? 'Maatvoering en eisen' : 'Project en bewerken';

  onMount(() => {
    try {
      const recovered = restoreDraft(window.localStorage);
      if (recovered) {
        showSession(recovered);
        restoreDesign(recovered.model);
      }
    } catch (error) {
      // Retain the original JSON before a later edit writes a new draft.
      try {
        const original = window.localStorage.getItem(draftKey);
        if (original !== null) window.localStorage.setItem(draftKey + ':unreadable', original);
      } catch { /* The browser may disable local storage entirely. */ }
      notify(`Concept kon niet worden hersteld: ${error.message}`);
    }
    const onKeyDown = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); projectFile?.click(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); newProject(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function notify(message) {
    toast = message;
    clearTimeout(timer);
    timer = setTimeout(() => toast = '', 2800);
  }
  function showSession(next) {
    session = next;
    model = next.model;
    selectedItem = model.stairEnabled ? model.stair.mark : '';
    if (!model.stairEnabled && activeView !== 'Trapontwerp') activeView = 'Projectstart';
    if (model.stairEnabled && activeView === 'Projectstart') activeView = '3D-model';
    history = next.history;
    future = next.future;
    dirty = isDirty(next);
  }
  function commitSession(next, message) {
    showSession(next);
    try {
      saveDraft(window.localStorage, session);
      if (message) notify(message);
    } catch {
      notify('Automatisch bewaren is niet beschikbaar. Sla het project op als bestand.');
    }
  }
  function update(key, value) { updateRoot('stair', key, value); }
  function updateRoot(section, key, value) {
    const input = value instanceof HTMLInputElement ? value : null;
    try {
      if (input?.validity.badInput) throw new Error('Voer een geldig getal in.');
      const parsed = parseInput(section, key, input ? input.value : value);
      const next = editSession(session, section, key, parsed);
      if (next !== session) commitSession(next);
    } catch (error) {
      if (input) input.value = model[section][key] ?? '';
      notify(error.message);
    }
  }
  function undo() {
    if (!history.length) return notify('Geen eerdere wijziging');
    commitSession(undoSession(session));
  }
  function redo() {
    if (!future.length) return notify('Geen wijziging om opnieuw uit te voeren');
    commitSession(redoSession(session));
  }
  function newProject() {
    if (dirty) {
      if (!newProjectDialog.open) newProjectDialog.showModal();
      return;
    }
    createNewProject();
  }
  function createNewProject() {
    if (newProjectDialog.open) newProjectDialog.close();
    openRequest++;
    const next = freshDesign();
    next.project = { ...next.project, name: 'Nieuw trapproject', number: 'OSS-NIEUW', revision: 'A' };
    next.stair = { ...next.stair, mark: 'TR-01', name: 'Nieuwe trap' };
    next.stairEnabled = false;
    resetPartSelection();
    resetCamera();
    commitSession(startSession(next, false), 'Nieuw trapproject aangemaakt');
    hostContext=null;
    wellSelection=''; activeRibbon='Trap ontwerpen'; activeView='Projectstart'; rightTab='Eigenschappen';
  }
  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openHostIfc(event) {
    const file=event.currentTarget.files?.[0];
    event.currentTarget.value='';
    if(!file)return;
    hostLoading=true;
    try {
      hostContext=await readHostIfc(new Uint8Array(await file.arrayBuffer()),file.name);
      notify(`${hostContext.slabs.length} ${hostContext.slabs.length===1?'vloer':'vloeren'} en ${hostContext.openings.length} ${hostContext.openings.length===1?'sparing':'sparingen'} ingelezen`);
    } catch(error) {hostContext=null;notify(error.message);}
    finally {hostLoading=false;}
  }
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  function exportPartsCsv() {
    if (!model.stairEnabled) return notify('Kies eerst een traptype.');
    if (invalidGeometry) return notify(invalidGeometry.detail);
    if (housingIssues.length) return notify(housingIssues[0].message);
    const rows = timberSystem ? makePartsCsvRows(workshop, model.stair.material, { treads: treadParts, margin: model.treadCam.stockMargin }) : referenceRows;
    downloadFile(`${model.stair.mark}-onderdelenstaat.csv`, '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
    notify('Onderdelenstaat als CSV geëxporteerd');
  }
  function exportPlanDxf() {
    if (!model.stairEnabled) return notify('Kies eerst een traptype.');
    if (invalidGeometry) return notify(invalidGeometry.detail);
    const dxf = createPlanDxf(geometry);
    downloadFile(`${model.stair.mark}-plattegrond.dxf`, dxf, 'application/dxf');
    notify('2D-contour als DXF geëxporteerd · mm');
  }
  async function exportIfc() {
    if (!model.stairEnabled) return notify('Kies eerst een traptype.');
    if (invalidGeometry) return notify(invalidGeometry.detail);
    const exportModel = model;
    const exportGeometry = {...geometry,detailParts:details};
    try {
      const { createIfc4 } = await import('./ifc-export.js');
      const result = await createIfc4(exportModel, exportGeometry);
      downloadFile(`${exportModel.stair.mark}-coordinatiemodel.ifc`, result.bytes, 'application/x-step');
      notify(`IFC4-coördinatiemodel geëxporteerd · ${result.flightCount} vlucht(en), ${result.landingCount} bordes(sen), ${result.solidCount} solids`);
    } catch (error) {
      console.error('IFC4 export failed', error);
      notify(`IFC4 export mislukt: ${error.message}`);
    }
  }
  function chooseFamily(type) {
    if (typeOf(type)) {
      const existing=wellItem?.type===type?wellItem:well.instances.find(i=>i.type===type);
      if(existing) openWell(existing.id); else addWell(type);
      tick().then(()=>wellWorkspace?.showMode('3D'));return;
    }
    if(model.engineering.structureType!=='timber') updateEngineering('structureType','timber');
    update('type', type);
    resetPartSelection();
    rightTab = 'Eigenschappen';
    activeView = stairFamilies.find(f => f.id === type)?.winder ? 'Plattegrond' : '3D-model';
  }
  function openTimberExample() {
    if (dirty && !window.confirm('Het houtvoorbeeld openen en de huidige onopgeslagen wijzigingen verwerpen?')) return;
    openRequest++;
    resetPartSelection();resetCamera();woodView='all';
    commitSession(startSession(readProject(timberExample)), 'Voorbeeld met klassieke houtdetails geopend');
    activeView='3D-model';activeRibbon='Trap ontwerpen';rightTab='Eigenschappen';
  }
  function saveProject() {
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') document.activeElement.blur();
    const projectFile={...model,stair:model.stairEnabled?model.stair:null,designSelection:activeView==='Trapontwerp'?wellItem?.id??null:null};
    downloadFile(`${model.project.number}-${activeView==='Trapontwerp'&&wellItem?wellItem.mark:model.stairEnabled?model.stair.mark:'leeg-project'}.oss.json`, JSON.stringify(projectFile, null, 2), 'application/json');
    commitSession({ ...session, savedModel: JSON.stringify(model) }, 'Download van OSS-projectbestand gestart');
  }
  async function openProject(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = '';
    const request = ++openRequest;
    try {
      const next = readProject(JSON.parse(await file.text()));
      if (request !== openRequest) return;
      if (dirty && !window.confirm('Niet opgeslagen wijzigingen verwerpen en het gekozen project openen?')) return;
      hostContext=null;
      resetPartSelection();
      resetCamera();
      commitSession(startSession(next), 'Project geopend');
      activeView=next.stairEnabled?'3D-model':'Projectstart';activeRibbon='Trap ontwerpen';woodView='all';
      restoreDesign(next);
    } catch (error) {
      if (request === openRequest) notify(`Openen mislukt: ${error.message}`);
    }
  }
  function showWangbladen() {
    activeRibbon = 'Werkvoorbereiding';
    activeView = 'Wangbladen';
    rightTab = 'Eigenschappen';
  }
  function openHousing(beamId, pocketId) {
    selectedBeamId = beamId;
    selectedPocketId = pocketId;
    showWangbladen();
  }
  function openHousingCam(beamId, pocketId) {
    selectedBeamId = beamId;
    selectedPocketId = pocketId;
    selectRibbon('CNC');
  }
  const updateJoinery = (key, value) => updateRoot('joinery', key, value);
  const updateCam = (key, value) => updateRoot('cam', key, value);
  const updateTreadCam = (key, value) => updateRoot('treadCam', key, value);
  const updateEngineering = (key, value) => updateRoot('engineering', key, value);
  function openTreadCam(id) {
    selectedTreadId = id;
    activeRibbon = 'CNC';
    activeView = 'Trede-CNC';
  }
  function printPdf() { window.print(); }
  function selectRibbon(tab) {
    activeRibbon = tab;
    if (tab==='Trap ontwerpen') {rightTab='Eigenschappen';return;}
    if(activeView==='Trapontwerp' && wellItem && ['Engineering','Controleren','Werkvoorbereiding','BIM','CNC'].includes(tab)) {
      wellWorkspace?.showMode(tab==='Werkvoorbereiding'&&activeStructural?'Verbindingen':tab==='Engineering'&&activeStructural?'Berekening':tab==='Werkvoorbereiding'||tab==='CNC'?'Onderdelen':tab==='BIM'?'3D':'Ontwerpcontrole');
      rightTab=tab==='Controleren'?'Controleren':'Eigenschappen';return;
    }
    if (tab === 'Engineering') activeView = 'Engineering';
    if (tab === 'Werkvoorbereiding') activeView = 'Onderdelen';
    if (tab === 'CNC') activeView = 'CNC-machine';
    if (tab === 'BIM') activeView = 'BIM-model';
    if (tab === 'Controleren') rightTab = 'Controleren';
    else rightTab = 'Eigenschappen';
  }
</script>

<svelte:head>
  <title>{model.project.name} — Open Stair Studio</title>
  <meta name="description" content="OpenAEC Blueprint trapontwerp, werkvoorbereiding en BIM" />
</svelte:head>

<div class="app-shell oa-app" data-tread-system={model.engineering.structureType}>
  <header class="titlebar" data-tauri-drag-region>
    <div class="quick-access">
      <img src="/icon.png" alt="" class="app-icon" />
      <span class="titlebar-divider"></span>
      <button class="quick-button" title="Nieuw project (Ctrl+N)" aria-label="Nieuw project" onclick={newProject}><Icon name="file.new" /></button>
      <button class="quick-button" title="Project openen (Ctrl+O)" aria-label="Project openen" onclick={() => projectFile.click()}><Icon name="file.open" /></button><input bind:this={projectFile} type="file" accept=".json,.oss.json" onchange={openProject} hidden />
      <button class="quick-button" title="Project opslaan" onclick={saveProject}><Icon name="file.save" /></button>
      <button class="quick-button" title="Ongedaan maken" disabled={!history.length} onclick={undo}><Icon name="edit.undo" /></button>
      <button class="quick-button" title="Opnieuw" disabled={!future.length} onclick={redo}><Icon name="edit.redo" /></button>
    </div>
    <div class="caption" data-tauri-drag-region>
      <span class="document-name">{model.project.name} · {activeView==='Trapontwerp'?'Trapontwerp':model.stairEnabled?model.stair.mark+' '+model.stair.name:'Nog geen trap'}</span>
      {#if dirty}<i class="dirty-indicator" title="Niet opgeslagen"></i>{/if}
      <span class="titlebar-divider"></span><strong>Open Stair Studio</strong>
    </div>
    <div class="titlebar-tools"><span class="edition-label">OPENAEC · TRAPPEN</span><UpdateControl {dirty} /><BlueprintSettings /><BlueprintWindowControls /></div>
  </header>

  <div class="ribbon-tabs oa-tabs" role="tablist" use:blueprintTabs aria-label="Werkstromen">
    {#each ribbonTabs as tab}
      <button role="tab" aria-label={'Werkstroom ' + tab} aria-selected={activeRibbon === tab} class:active={activeRibbon === tab} onclick={() => selectRibbon(tab)}>{tab}</button>
    {/each}
    <span class="ribbon-tab-spacer"></span>
    <span class="active-ribbon-hint">{stairTab}</span>
  </div>

  <section class="ribbon" aria-label="Opdrachten">
    {#if activeRibbon === 'Start'}
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={newProject}><Icon name="file.new" size={24} /><span>Nieuw<br />project</span></button><button class="ribbon-command" onclick={() => projectFile.click()}><Icon name="file.open" size={24} /><span>Project<br />openen</span></button><button class="ribbon-command" onclick={saveProject}><Icon name="file.save" size={24} /><span>Project<br />opslaan</span></button></div><small>Project</small></div>
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={undo} disabled={!history.length}><Icon name="edit.undo" size={24} /><span>Ongedaan<br />maken</span></button><button class="ribbon-command" onclick={redo} disabled={!future.length}><Icon name="edit.redo" size={24} /><span>Opnieuw<br />uitvoeren</span></button></div><small>Bewerken · Ctrl+Z / Ctrl+Y</small></div>
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={printPdf}><Icon name="file.export" size={24} /><span>Werkblad<br />afdrukken</span></button></div><small>Uitvoer</small></div>
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={openTimberExample}><Icon name="frame.layout" size={24}/><span>Klassieke houten<br/>kwartslag</span></button></div><small>Voorbeeldproject</small></div>
    {:else if activeRibbon === 'Trap ontwerpen'}
      <div class="ribbon-group design-families"><label for="ontwerp-type">Traptype ontwerpen</label>
        <select id="ontwerp-type" onchange={e=>chooseFamily(e.currentTarget.value)} value={activeView==='Trapontwerp'?(wellItem?.type??''):model.stairEnabled?model.stair.type:''}>
          <option value="" disabled>Kies een traptype</option>
          <optgroup label="Houten trappen">{#each stairFamilies as f}<option value={f.id}>{f.label}</option>{/each}</optgroup>
          <optgroup label="Trappen en ladders">{#each componentTypes as t}<option value={t.id}>{t.label}</option>{/each}</optgroup>
        </select></div>
      {#if activeView==='Trapontwerp' && wellItem}
        <div class="ribbon-group"><div class="ribbon-group-buttons">{#each ['3D','Plattegrond','Aanzicht','Onderdelen'] as v}<button class="ribbon-command" onclick={()=>wellWorkspace?.showMode(v)}><Icon name={v==='3D'?'bim.workspace':v==='Onderdelen'?'planning.cut-list':'frame.layout'} size={22}/><span>{v}</span></button>{/each}</div><small>{wellItem.mark} · ontwerp</small></div>
        <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={exportWellIfc} disabled={exportingWell}><Icon name="ifc.export" size={22}/><span>IFC4 exporteren</span></button><button class="ribbon-command" onclick={()=>addWell(wellItem.type)}><Icon name="file.new" size={22}/><span>Extra exemplaar</span></button></div><small>Project</small></div>
      {:else}
        <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={()=>activeView='3D-model'}><Icon name="bim.workspace" size={22}/><span>3D-model</span></button><button class="ribbon-command" onclick={()=>activeView='Plattegrond'}><Icon name="drawing.settings" size={22}/><span>Plattegrond</span></button><button class="ribbon-command" onclick={()=>activeView='Houtdetails'}><Icon name="profile.manage" size={22}/><span>Houtdetails</span></button><button class="ribbon-command" onclick={showWangbladen}><Icon name="frame.editor" size={22}/><span>Wangbladen</span></button></div><small>Ontwerp en werkplaats</small></div>
      {/if}
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={()=>openWell()}><Icon name="file.structure" size={22}/><span>Projectopstelling</span></button><button class="ribbon-command" onclick={openTimberExample}><Icon name="profile.manage" size={22}/><span>Klassieke houten kwartslag</span></button></div><small>Bouwlagen</small></div>
    {:else if activeView==='Trapontwerp' && wellItem}
      <div class="ribbon-group"><div class="ribbon-group-buttons">{#each ['3D','Ontwerpcontrole',...(activeStructural?['Berekening','Verbindingen']:[]),'Onderdelen'] as v}<button class="ribbon-command" onclick={()=>wellWorkspace?.showMode(v)}><Icon name={v==='3D'?'bim.workspace':v==='Onderdelen'?'planning.cut-list':'validation.workspace'} size={22}/><span>{v}</span></button>{/each}<button class="ribbon-command" onclick={exportWellIfc} disabled={exportingWell}><Icon name="ifc.export" size={22}/><span>IFC4 exporteren</span></button></div><small>{wellItem.mark} · {typeOf(wellItem.type).label}</small></div>
    {:else if activeRibbon === 'Engineering'}
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={() => activeView = 'Engineering'}><Icon name="calculation.recalculate" size={24}/><span>Engineering-<br/>dossier</span></button><button class="ribbon-command" onclick={() => activeView = '3D-model'}><Icon name="bim.workspace" size={24}/><span>Trapmodel<br/>bekijken</span></button></div><small>Materiaal en lastwerking</small></div>
    {:else if activeRibbon === 'Controleren'}
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={() => rightTab = 'Controleren'}><Icon name="validation.workspace" size={24} /><span>Model-<br />controle</span></button><button class="ribbon-command" onclick={() => rightTab = 'Controleren'}><Icon name="frame.plausibility" size={24} /><span>Bbl-profiel<br />kiezen</span></button></div><small>Toetsing</small></div>
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={() => activeView = 'Doorsnede'}><Icon name="view.fit" size={24} /><span>Vrije hoogte<br />bekijken</span></button><button class="ribbon-command" onclick={() => activeView = 'Engineering'}><Icon name="calculation.recalculate" size={24} /><span>Constructie<br />berekenen</span></button></div><small>Geometrie & constructie</small></div>
    {:else if activeRibbon === 'Werkvoorbereiding'}
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={() => activeView = 'Onderdelen'}><Icon name="planning.cut-list" size={24} /><span>Onderdelen-<br />staat</span></button><button class="ribbon-command" onclick={() => activeView = 'Calculatie'}><Icon name="calculation.recalculate" size={24} /><span>Calculatie<br />openen</span></button><button class="ribbon-command" onclick={printPdf}><Icon name="file.export" size={24} /><span>Werkblad<br />afdrukken</span></button></div><small>Werkvoorbereiding</small></div>
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={exportPartsCsv}><Icon name="file.export" size={24} /><span>Onderdelen<br />naar CSV</span></button><button class="ribbon-command" onclick={exportPlanDxf}><Icon name="file.export" size={24} /><span>Plan naar<br />DXF</span></button></div><small>Uitwisseling · referentie</small></div>
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={showWangbladen}><Icon name="file.structure" size={24} /><span>Wangbladen<br />infrezingen</span></button><button class="ribbon-command" onclick={() => activeView='Houtdetails'}><Icon name="profile.manage" size={24} /><span>Houtdetails<br />en profielen</span></button><button class="ribbon-command" onclick={() => activeView='Bordesraam'}><Icon name="file.structure" size={24} /><span>Bordesraam<br />en naden</span></button></div><small>Werkplaats</small></div>
    {:else if activeRibbon === 'CNC'}
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={() => activeView = 'CNC-machine'}><Icon name="frame.cnc" size={24} /><span>Wangen<br />frezen</span></button><button class="ribbon-command" onclick={() => openTreadCam(selectedPart?.id)}><Icon name="frame.cnc" size={24} /><span>Treden<br />frezen</span></button><button class="ribbon-command" onclick={showWangbladen}><Icon name="calculation.recalculate" size={24} /><span>Wangblad<br />bekijken</span></button></div><small>CAM-profiel</small></div>

    {:else}
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={() => activeView = 'BIM-model'}><Icon name="ifc.workspace" size={24} /><span>BIM-model<br />bekijken</span></button><button class="ribbon-command" onclick={exportIfc}><Icon name="ifc.export" size={24} /><span>IFC4<br />exporteren</span></button></div><small>OpenBIM · coördinatie</small></div>
      <div class="ribbon-group"><div class="ribbon-group-buttons"><button class="ribbon-command" onclick={()=>activeView='BIM-model'}><Icon name="bim.workspace" size={24} /><span>Gebouwmodel<br />inlezen</span></button></div><small>Contextmodel</small></div>
    {/if}
    <span class="ribbon-spacer"></span>
    <button class="ribbon-save" onclick={saveProject}><Icon name="file.save" size={16} /> Opslaan</button>
  </section>

  <div class="document-tabs oa-document-tabs" use:blueprintTabs aria-label="Modelweergaven" role="tablist">
    {#if activeView==='Trapontwerp'}<button class="oa-document-tab active" role="tab" aria-selected="true" onclick={()=>openWell()}><Icon name="frame.layout" size={16}/>Trap ontwerpen{wellItem?' · '+wellItem.mark:''}</button>{:else if !model.stairEnabled}<button class="oa-document-tab active" role="tab" aria-selected="true"><Icon name="file.new" size={16}/>Nieuw project</button>{:else}
    {#each views as tab}
      <button class="oa-document-tab" role="tab" aria-selected={activeView === tab.id} class:active={activeView === tab.id} onclick={() => tab.id === 'Trapontwerp' ? openWell() : activeView = tab.id}><Icon name={tab.icon} size={16} />{tab.id}</button>
    {/each}
    {/if}
    <span class="document-tab-spacer"></span><span class="document-revision">{model.project.number} · {activeView==='Trapontwerp'?(wellItem?.mark??'Trapontwerp'):model.stairEnabled?model.stair.mark:'0 trappen'} · REV {model.project.revision}</span>
  </div>

  <main class="workspace">
    <aside class="project-panel oa-panel">
      <div class="panel-titlebar oa-panel-header"><span>Projectverkenner</span></div>
      <div class="panel-subtabs"><button class:active={leftTab === 'Project'} onclick={() => leftTab = 'Project'}>Project</button><button class:active={leftTab === 'Bibliotheek'} onclick={() => leftTab = 'Bibliotheek'}>Bibliotheek</button></div>
      {#if leftTab === 'Project'}
        <div class="tree-view">
          <div class="tree-root"><span class="chevron">⌄</span><Icon name="file.structure" /><div><b>{model.project.name}</b><small>{model.project.number} · Revisie {model.project.revision}</small></div></div>
          <div class="tree-node"><span class="chevron">⌄</span><span class="tree-emoji">▱</span><b>Verdieping 01</b></div>
          <div class="tree-node nest"><span class="chevron">⌄</span><span class="tree-emoji">⌑</span><b>Gebouwcontext</b><span class="tree-muted">{hostContext?'IFC ingelezen':'niet gekoppeld'}</span></div>
          <div class="tree-node nest"><span class="chevron">⌄</span><span class="tree-emoji">⌁</span><b>Trappen</b><span class="tree-count">{Number(model.stairEnabled) + well.instances.length}</span></div>
          {#if model.stairEnabled}
          <button class="tree-item" class:selected={activeView!=='Trapontwerp' && selectedItem === model.stair.mark} onclick={() => {selectedItem=model.stair.mark; activeView='3D-model';activeRibbon='Trap ontwerpen';}}><span class="tree-indent"></span><span class="tree-stair-icon">▱</span><div><b>{model.stair.mark} · {model.stair.name}</b><small>{dimensions.family.label} · Concept</small></div></button>
          <div class="tree-child"><span class="tree-indent"></span><span>└</span><span>Treden</span><small>{dimensions.treadCount}</small></div>
          <div class="tree-child"><span class="tree-indent"></span><span>└</span><span>{dimensions.family.winder ? 'Wangdelen' : 'Trapbomen'}</span><small>{geometry.stringers.length}</small></div>
          <div class="tree-child"><span class="tree-indent"></span><span>└</span><span>Leuning</span><small>{model.stair.railSide && model.stair.railSide!=='none' ? 'Gemodelleerd' : 'Zonder leuning'}</small></div>
          {:else if !well.instances.length}<p class="empty-tree-note">Nog geen trap toegevoegd.</p>{/if}
          <div class="tree-node collapsed"><span class="chevron">›</span><span class="tree-emoji">▱</span><b>Begane grond</b></div>
          <button class="add-tree-item" onclick={()=>openWell()}>Projectopstelling · {well.instances.length} ontwerpen</button>
          {#each [...well.instances].sort((a,b)=>a.storey-b.storey) as i}<button class="tree-item" class:selected={activeView==='Trapontwerp'&&wellItem?.id===i.id} onclick={()=>openWell(i.id)}><span class="tree-indent"></span><Icon name="bim.workspace" size={16}/><div><b>{i.mark} · {typeOf(i.type).label}</b><small>Bouwlaag {i.storey} → {i.storey+1}</small></div></button>{/each}
        </div>
      {:else}
        <div class="library-pane"><div class="library-search"><Icon name="view.search" /><input bind:value={libraryQuery} aria-label="Zoek trapmodellen" placeholder="Zoek trapmodellen" /></div><span class="eyebrow">TRAPFAMILIES</span>{#each visibleFamilies as family}<button class="library-item" class:family-selected={model.stairEnabled && model.stair.type === family.id} onclick={() => chooseFamily(family.id)}><span class="library-glyph">{family.icon}</span><span>{family.label}</span><small>{model.stairEnabled && model.stair.type === family.id ? 'Actief' : 'Beschikbaar'}</small></button>{/each}{#if visibleComponents.length}<span class="eyebrow">TRAPPEN EN LADDERS</span>{#each visibleComponents as t}<button class="library-item" onclick={()=>chooseFamily(t.id)}><Icon name="bim.workspace" size={16}/><span>{t.label}</span><small>Ontwerpen</small></button>{/each}{/if}{#if !visibleFamilies.length && !visibleComponents.length}<p>Geen trapfamilie gevonden.</p>{/if}</div>
      {/if}
      <div class="panel-bottom"><div class="project-meta-title">PROJECTSTATUS</div><div class="meta-row"><span>Ontwerpfase</span><b>Concept</b></div><div class="meta-row"><span>Regelprofiel</span><b>{ruleProfiles.find(p => p.id === model.regulatory.profile)?.label ?? 'Geen profiel'}</b></div><div class="meta-row"><span>Modelbeheer</span><b>{dirty ? 'Niet opgeslagen' : 'Lokaal model'}</b></div></div>
    </aside>
    <BlueprintSplitter side="left" />

    <section class="editor-area">
      <div class="print-heading"><strong>{model.project.name}</strong><span>{model.project.number} · revisie {model.project.revision} · {activeView==='Trapontwerp'?'Trapontwerp':model.stairEnabled?model.stair.mark+' '+model.stair.name:'Nog geen trap'}</span><span>{activeView} · concept</span></div>
      <header class="view-toolbar"><div class="view-heading"><b>{!model.stairEnabled && activeView!=='Trapontwerp' ? 'Leeg project' : activeView === '3D-model' ? '3D-model' : activeView}</b><span class="view-context">{activeView==='Trapontwerp' ? (wellItem?.mark??model.project.number) : model.stairEnabled?model.stair.mark+' · '+model.stair.name:'Kies een traptype'} · millimeters</span></div>{#if model.stairEnabled && drawingView && !invalidGeometry}
        <div class="view-tools">
          {#if activeView === '3D-model'}
            <button class="tool-button" title="Draai het model 90°" onclick={() => viewport?.rotateQuarter()}>↻ Draai 90°</button>
            <button class="tool-button" onclick={() => viewport?.fit()}><Icon name="view.fit" /> Passend</button>
            {#if visibleWood}<select class="wood-view" aria-label="Houten deelmodel" bind:value={woodView} onchange={()=>tick().then(()=>viewport?.home())}><option value="all">Hele trap</option>{#if details.some(p=>p.kind==='railing')}<option value="rail">Balustrade</option>{/if}<option value="boards">Treden en stootborden</option></select>{/if}
            <div class="zoom-control"><button aria-label="Uitzoomen" onclick={() => viewport?.zoomBy(0.8)}>−</button><span>{viewZoom}%</span><button aria-label="Inzoomen" onclick={() => viewport?.zoomBy(1.25)}>＋</button></div>
          {:else}
            <button class="tool-button" onclick={() => zoom = 100}><Icon name="view.fit" /> Passend</button>
            <div class="zoom-control"><button aria-label="Uitzoomen" disabled={zoom <= 50} onclick={() => zoom -= 25}>−</button><span>{zoom}%</span><button aria-label="Inzoomen" disabled={zoom >= 200} onclick={() => zoom += 25}>＋</button></div>
          {/if}
        </div>
      {/if}</header>

      {#if activeView === 'Trapontwerp'}
        <StairwellView bind:this={wellWorkspace} {well} instance={wellItem} {assemblies} project={model.project} add={addWell} {addConcreteExample} exportIfc={exportWellIfc} {downloadFile} change={changeWell}/>
      {:else if !model.stairEnabled}
        <div class="production-view empty-project"><span class="eyebrow">NIEUW PROJECT · 0 TRAPPEN</span><h1>Begin met een traptype</h1><p>Dit project bevat nog geen trap. Kies hieronder een traptype of gebruik de bibliotheek links.</p><div class="empty-project-choices">{#each stairFamilies as family}<button class="action-btn" onclick={() => chooseFamily(family.id)}>{family.icon} {family.label}</button>{/each}</div><p>Voor andere trappen en ladders kies je een type onder <b>Trap ontwerpen</b>.</p></div>
      {:else if activeView === 'Engineering'}
        {#if invalidGeometry}<p class="context-warning">{invalidGeometry.detail}</p>{/if}
        <EngineeringView {model} {geometry} {dossier} {updateEngineering} {downloadFile}/>
      {:else if invalidGeometry}
        <div class="production-view"><h2>{invalidGeometry.title}</h2><p>{invalidGeometry.detail}</p><button class="action-btn" onclick={() => rightTab = 'Eigenschappen'}>Trapmaten bewerken</button></div>
      {:else if !timberSystem && activeView === 'Onderdelen'}
        <ReferenceParts rows={referenceRows} material={materialLabel} exportCsv={exportPartsCsv} openEngineering={() => selectRibbon('Engineering')} />
      {:else if !timberSystem && ['Calculatie', 'Trede-CNC', 'CNC-machine', 'Wangbladen','Houtdetails','Bordesraam'].includes(activeView)}
        <div class="production-view"><h1>{materialLabel}</h1><p>{activeView === 'Calculatie' ? 'Vraag een productprijs aan op basis van de tredecontouren, de productopbouw en de opleggingen in het dossier.' : 'Voor dit tredesysteem zijn de nominale contouren en het engineeringdossier beschikbaar. De freesprofielen in deze versie horen bij massiefhouten tredeverbindingen.'}</p><div class="button-row"><button class="action-btn" onclick={() => selectRibbon('Engineering')}>Engineeringdossier openen</button><button class="action-btn" onclick={() => activeView = 'Onderdelen'}>Tredecontouren bekijken</button></div></div>
      {:else if activeView === 'Houtdetails'}
        <TimberDetailSheet {model} geometry={workshop} {details} {downloadFile}/>
      {:else if activeView === 'Onderdelen'}
        <div class="production-view"><div class="production-head"><div><span class="eyebrow">WERKVOORBEREIDING · CONCEPT</span><h1>{sheetMode === 'detail' ? 'Tredeblad' : 'Onderdelenstaat'}</h1><p>Afgeleid van de huidige geometrie · {model.stair.mark} · revisie {model.project.revision}</p></div><div class="button-row"><button class="action-btn" onclick={exportPartsCsv}>CSV</button><button class="action-btn" onclick={printPdf}><Icon name="file.export" /> PDF / afdrukken</button></div></div><div class="production-summary"><div><span>Traptype</span><b>{dimensions.family.label}</b></div><div><span>Houtsoort</span><b>{model.stair.material}</b></div><div><span>Vloerhoogte</span><b>{model.stair.floorHeight} mm</b></div><div><span>Netto houtvolume</span><b>{workshop.volume.toFixed(3)} m³</b></div></div>
          {#if hasTreadSheets || sheetMode === 'detail'}
            <WinderSchedule geometry={hasTreadSheets ? workshop : { ...workshop, parts: treadParts }} stockMargin={model.treadCam.stockMargin} {housingIssues} {downloadFile} {openHousing} {openTreadCam} bind:selectedId={selectedTreadId} bind:mode={sheetMode} />
          {:else}
            <button class="action-btn" onclick={() => openTread(selectedPart.id)}>Tredeblad</button>
          <table class="parts-table"><thead><tr><th>Merk</th><th>Onderdeel</th><th>Aantal</th><th>Lengte mm</th><th>Breedte mm</th><th>Dikte mm</th><th>Volume m³</th><th>Status</th></tr></thead><tbody>{#each geometry.parts as part}<tr><td>{part.id}</td><td>{part.name}</td><td>{part.quantity}</td><td>{Math.round(part.length)}</td><td>{Math.round(part.width)}</td><td>{Math.round(part.thickness)}</td><td>{part.volume.toFixed(3)}</td><td>Referentiemaat</td></tr>{/each}</tbody></table>
          {/if}
          {#if housingIssues.length}
            <div class="production-warning" role="status"><Icon name="status.warning" /><div><b>Verbindingen aanpassen</b><span>{housingIssues[0].message}</span><button class="action-btn" onclick={showWangbladen}>Wangbladen bekijken</button></div></div>
          {:else if workshop.housings}
            <div class="production-warning"><Icon name="frame.editor" /><div><b>Tredeverbindingen in de stukstaat</b><span>De tredecontour en ruwmaat omvatten de insteeklippen. Het netto wangvolume is verminderd met de nominale infrezingen. De hoekafwerking van de frees telt alleen mee in de CNC-banen.</span><button class="action-btn" onclick={showWangbladen}>Wangbladen bekijken</button></div></div>
          {/if}</div>
      {:else if activeView === 'Calculatie'}
        <div class="production-view"><div class="production-head"><div><span class="eyebrow">RAMING · INSTELBARE AANNAMES</span><h1>Calculatie</h1><p>Indicatie op basis van de bruto onderdelenstaat en jouw ingevoerde tarieven. Geen offerte.</p></div><button class="action-btn" onclick={printPdf}><Icon name="file.export" /> Raming afdrukken</button></div><div class="estimate-layout"><div class="estimate-inputs"><label for="estimate-tread-stock">Inkoopmaat treden<select id="estimate-tread-stock" value={model.estimate.treadStock} onchange={e => updateRoot('estimate', 'treadStock', e.currentTarget.value)}><option value="board">Ruwmaat tredeblad</option><option value="cnc">CNC-opspanmaat · {model.treadCam.stockMargin} mm rand per zijde</option></select></label><label>Houtprijs <span>€/m³</span><input type="number" min="0" step="50" value={model.estimate.timberPricePerM3} onchange={e => updateRoot('estimate','timberPricePerM3',e.currentTarget)} /></label><label>Zaag-/uitvalfactor <span>×</span><input type="number" min="1" max="3" step="0.01" value={model.estimate.wasteFactor} onchange={e => updateRoot('estimate','wasteFactor',e.currentTarget)} /></label><label>Werkuren <span>uur</span><input type="number" min="0" step="0.5" value={model.estimate.laborHours} onchange={e => updateRoot('estimate','laborHours',e.currentTarget)} /></label><label>Uurtarief <span>€/uur</span><input type="number" min="0" step="1" value={model.estimate.laborRate} onchange={e => updateRoot('estimate','laborRate',e.currentTarget)} /></label><label>Opslag <span>%</span><input type="number" min="0" step="1" value={model.estimate.overheadPercent} onchange={e => updateRoot('estimate','overheadPercent',e.currentTarget)} /></label><label>Brutomarge op verkoopprijs <span>%</span><input type="number" min="0" max="99" step="1" value={model.estimate.marginPercent} onchange={e => updateRoot('estimate','marginPercent',e.currentTarget)} /></label></div><div class="estimate-result"><span>{housingIssues.length ? 'VOORLOPIGE RAMING · VERBINDINGEN AANPASSEN' : 'INDICATIEVE VERKOOPPRIJS'}</span><strong>€ {estimate.indicativePrice.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><dl><dt>Hout volgens model</dt><dd>{estimate.volume.toFixed(3)} m³</dd>{#if workshop.blankVolume !== undefined || model.estimate.treadStock === 'cnc'}<dt>Bruto hout op ruwmaat</dt><dd>{estimate.blankVolume.toFixed(3)} m³</dd>{#if model.estimate.treadStock === 'cnc'}<dt>Waarvan CNC-opspanranden</dt><dd>{cncAllowance.toFixed(3)} m³</dd>{/if}<dt>Inkoopvolume incl. uitval</dt><dd>{estimate.materialVolume.toFixed(3)} m³</dd>{/if}{#if workshop.detailTakeoff}<dt>Waarvan houtdetails ({workshop.detailTakeoff.count} st.)</dt><dd>{workshop.detailTakeoff.stock.toFixed(3)} m³ bruto</dd>{/if}<dt>Hout incl. uitval</dt><dd>€ {estimate.materials.toFixed(2)}</dd><dt>Arbeid</dt><dd>€ {estimate.labor.toFixed(2)}</dd><dt>Kostprijs incl. opslag</dt><dd>€ {estimate.costPrice.toFixed(2)}</dd><dt>Marge</dt><dd>€ {estimate.margin.toFixed(2)}</dd></dl></div></div><div class="production-warning"><Icon name="status.warning" size={18} /><div><b>Raming op eigen aannames</b><span>Geen beslag, afwerking, transport, montage, btw, inkoopcondities of bewerkingen buiten de bruto hout- en urenraming.</span></div></div></div>
        {#if geometry.landingFasteners?.length}
          <div class="production-view"><div class="property-section"><h3>Bordesbeslag in de raming</h3><label for="fastener-price">Prijs per bordesschroef</label><div class="numeric-input"><input id="fastener-price" type="number" min="0" max="1000" step="0.1" value={model.estimate.fastenerUnitPrice} onchange={e=>updateRoot('estimate','fastenerUnitPrice',e.currentTarget)} /><span>€ / st.</span></div><p>{geometry.landingFasteners.length} schroeven · € {estimate.hardware.toFixed(2)} opgenomen in de kostprijs. Gebouwankers en beslag blijven buiten deze raming.</p></div></div>
        {/if}
      {:else if activeView === 'Trede-CNC'}
        {#if selectedPart}
          <div class="tread-picker"><label for="cnc-tread">Trede op de machine</label>
            <select id="cnc-tread" value={selectedPart.id} onchange={e => selectedTreadId = e.currentTarget.value}>
              {#each treadParts as part}<option value={part.id}>{part.id} · {part.name}</option>{/each}
            </select>
          </div>
          <TreadCam part={selectedPart} {model} {workshop} {downloadFile} {updateTreadCam} backToSheet={() => { activeRibbon = 'Werkvoorbereiding'; openTread(selectedPart.id); }} />
        {:else}
          <div class="production-view"><h1>Tredecontour ontbreekt</h1><p>{housingIssues[0]?.message ?? 'Controleer de trapgeometrie.'}</p></div>
        {/if}
      {:else if activeView === 'Bordesraam'}
        <LandingFrameSheet {geometry} {model} {downloadFile} />
      {:else if activeView === 'Wangbladen' || activeView === 'CNC-machine'}
        {#if !workshop.housings}
          <div class="production-view"><h1>Tredeverbindingen uitwerken</h1><p>Dit project bevat de trapmaten zonder insteeklippen. Voeg infrezingen toe om de wangbladen, bijpassende tredecontouren en CNC-banen te berekenen.</p><button class="action-btn" onclick={() => updateJoinery('type', 'housed')}>Infrezingen toevoegen</button></div>
        {:else if activeView === 'Wangbladen'}
          <HousingSheet housings={workshop.housings} cam={model.cam} metadata={{number:model.project.number, revision:model.project.revision, stairMark:model.stair.mark}} bind:selectedBeamId bind:selectedPocketId {downloadFile} openCam={openHousingCam} />
        {:else}
          <HousingCam geometry={workshop} {model} {downloadFile} {updateCam} bind:selectedBeamId bind:selectedPocketId />
        {/if}

      {:else if activeView === 'BIM-model'}
        <div class="production-view bim-view">
          <div class="production-head"><div><span class="eyebrow">OPENBIM · PROJECTOVERDRACHT</span><h1>Trap in gebouwcontext</h1><p>IFC4-coördinatie met typen, materialen, classificatie en projectplaatsing.</p></div><button class="action-btn" onclick={exportIfc}><Icon name="ifc.export" /> IFC4 exporteren</button></div>
          <div class="production-summary"><div><span>Trapobject</span><b>{model.stair.mark} · {model.stair.name}</b></div><div><span>Projectnulpunt</span><b>{model.bim.originAgreed ? 'Afgestemd' : 'Nog af te stemmen'}</b></div><div><span>IFC-schema</span><b>IFC4</b></div><div><span>Gebouwmodel</span><b>{hostContext?.filename ?? 'Niet ingelezen'}</b></div></div>
          <div class="property-section"><h3>Gebouwmodel en sparing</h3><label for="host-ifc-file">IFC-bestand inlezen</label><input id="host-ifc-file" type="file" accept=".ifc,application/x-step" onchange={openHostIfc} disabled={hostLoading} />
            {#if hostContext}<p>{hostContext.slabs.length} {hostContext.slabs.length===1?'vloer':'vloeren'} · {hostContext.openings.length} {hostContext.openings.length===1?'sparing':'sparingen'} · {hostContext.voids.length} vloersparingsrelaties</p>{/if}
            <p role="status"><b>{hostFit.status==='precheck'?'Planpassing voorlopig':hostFit.status==='outside'?'Sparingscontour controleren':'Hostcontrole open'}</b> · {hostFit.message}</p>
            <small>De toets snijdt trap en gekoppelde sparing op het midden van elk vloerpeil. Controle van vrije hoogte, draagkracht, vloerhelling en ankers volgt projectmatig.</small>
          </div>
          <div class="bim-placeholder"><Icon name="ifc.workspace" size={34} /><b>IFC4-coördinatiemodel</b><span>De houtbewerking staat op de werkplaatsbladen en in DXF/CNC. IFCX is nog in ontwikkeling bij buildingSMART. Externe BIM-validatie en acceptatie door het projectteam blijven nodig.</span></div>
        </div>
      {:else if activeView === '3D-model'}
        <div class="drawing-stage viewer-stage">
          {#key viewportDocument}
            <StairViewport geometry={sceneGeometry} system={model.engineering.structureType} bind:this={viewport} bind:cameraState={stairCamera} bind:zoomPercent={viewZoom} />
          {/key}
        </div>
      {:else}
        <div class="drawing-stage blueprint-stage" style:--drawing-zoom={zoom / 100}>
          <div class="drawing-grid"></div>
          {#if activeView === 'Plattegrond'}
            <svg class="drawing-view plan-view" viewBox={`${planBox.x} ${planBox.y} ${planBox.width} ${planBox.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Trapplattegrond">
              <defs><marker id="plan-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8Z" fill="var(--oa-text-secondary)" /></marker></defs>
              {#if includeOpening}
              <rect x="0" y={-model.building.openingWidth/2} width={model.building.openingLength} height={model.building.openingWidth} class="opening-line" />
              <text x="0" y={-Math.max(model.building.openingWidth / 2, geometry.footprint.y + geometry.footprint.depth) - 55} class="plan-label">TRAPGAT · {model.building.openingLength} × {model.building.openingWidth} mm · positie indicatief</text>
              {/if}
              <g transform="scale(1 -1)">
                {#each geometry.treads as tread}<polygon points={tread.svgPoints} class="plan-tread" class:winder-board={tread.isWinder} class:chosen-board={dimensions.family.winder && tread.id === selectedTreadId} />{/each}
                {#each geometry.landings as landing}<polygon points={landing.svgPoints} class="plan-landing" />{/each}
                {#each geometry.landingFrame??[] as member}<polygon points={member.svgPoints} class="plan-stringer" />{/each}
                {#each geometry.stringers as stringer}<polygon points={stringer.svgPoints} class="plan-stringer" />{/each}
                {#if dimensions.family.winder && showWalkline}
                  <polyline points={geometry.walkline.map(p => p.x + ',' + p.y).join(' ')} class="walk-line" />
                {/if}
              </g>
              {#if dimensions.family.winder && timberSystem}
                {#each geometry.treads as tread}
                  <g transform={'translate(' + tread.center.x + ' ' + (-tread.center.y) + ')'} class="step-marker" class:chosen={tread.id === selectedTreadId} tabindex="0" role="button"
                    aria-label={'Tredeblad ' + tread.id} onclick={() => openTread(tread.id)} onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTread(tread.id); } }}>
                    <title>{tread.id} · open tredeblad</title><circle r="58"/><text text-anchor="middle" dominant-baseline="central">{tread.level}</text>
                  </g>
                {/each}
              {/if}
              {#each details.filter(p=>p.axisPath) as p}<polyline points={p.axisPath.map(q=>q.x+','+(-q.y)).join(' ')} fill="none" stroke="var(--oa-accent-text)" stroke-width="1.4" vector-effect="non-scaling-stroke"><title>{p.label}</title></polyline>{/each}
              <line x1={geometry.footprint.x} y1={-geometry.footprint.y+95} x2={geometry.footprint.x+geometry.footprint.width} y2={-geometry.footprint.y+95} class="dimension-line" marker-start="url(#plan-arrow)" marker-end="url(#plan-arrow)" />
              <text x={geometry.footprint.x+geometry.footprint.width/2} y={-geometry.footprint.y+155} class="plan-label" text-anchor="middle">{Math.round(geometry.footprint.width)} mm · buitenwerks model</text>
            </svg>
          {:else if activeView === 'Doorsnede'}
            <svg class="drawing-view elevation" viewBox="0 0 820 520" role="img" aria-label="Trapdoorsnede en maatvoering">
              <defs><marker id="dim-arrow-elev" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8Z" fill="var(--oa-text-secondary)" /></marker></defs>
              <line x1="105" y1="410" x2="710" y2="410" class="level-line"/><line x1="105" y1="105" x2="710" y2="105" class="level-line"/>
              <path d={`${outline} L 688 410 L 105 410 Z`} class="stair-fill" />
              <path d={outline} class="stair-outline" />
              <line x1="80" y1="410" x2="80" y2="105" class="dimension-line" marker-start="url(#dim-arrow-elev)" marker-end="url(#dim-arrow-elev)" /><text x="52" y="270" class="dimension-text" transform="rotate(-90 52 270)">{model.stair.floorHeight} mm · vloerhoogte</text>
              <line x1="105" y1="443" x2="688" y2="443" class="dimension-line" marker-start="url(#dim-arrow-elev)" marker-end="url(#dim-arrow-elev)"/><text x="290" y="466" class="dimension-text">{dimensions.totalRun} mm · ontwikkelde looplengte</text>
              <text x="105" y="96" class="drawing-label">PEIL +{(model.stair.floorHeight / 1000).toFixed(3)}</text><text x="105" y="429" class="drawing-label">PEIL 0</text>
              <text x="105" y="65" class="drawing-label">UITGEVOUWEN LANGS DE {dimensions.family.winder ? 'KLIMLIJN' : 'MIDDENLIJN'} · SCHEMATISCH</text>
              <text x="458" y="195" class="drawing-note">{dimensions.risers} optredes × {dimensions.rise.toFixed(1)} mm</text>
            </svg>
          {:else}
            <div class="empty-model"><Icon name="ifc.workspace" size={32} /><b>Gebouwmodel ontbreekt</b><span>Koppel een IFC-model om trapgat, verdiepingspeilen en vrije hoogte te controleren.</span></div>
          {/if}
          <div class="view-cube"><span>TOP</span><b>{activeView === 'Plattegrond' ? 'BOVEN' : 'VOOR'}</b><span>VOOR</span></div>
          <div class="canvas-legend"><span><i class="legend-solid"></i> {dimensions.family.winder && activeView === 'Plattegrond' ? 'Verdreven trede' : 'Traponderdeel'}</span>{#if !dimensions.family.winder}<span><i class="legend-dash"></i> Referentie / opening</span>{/if}{#if dimensions.family.winder && activeView === 'Plattegrond'}<label><input type="checkbox" bind:checked={showWalkline} /> Klimlijn</label><label><input type="checkbox" bind:checked={showWinderOpening} disabled={!model.building.openingLength || !model.building.openingWidth} /> Trapgat</label>{/if}</div>
          <div class="coordinate-label">ORTHOGONAAL · mm</div>
        </div>
      {/if}
      {#if activeView==='Trapontwerp'}<div class="canvas-status"><span><i></i>{well.instances.length} componenten</span><span>Schacht {well.length} × {well.width} mm</span><span>Verdiepingshoogte {well.storeyHeight} mm</span></div>{:else if !model.stairEnabled}<div class="canvas-status"><span><i></i>Leeg project</span><span>0 trappen</span></div>{:else}<div class="canvas-status"><span><i></i>{invalidGeometry ? 'Geometrie onvolledig' : activeView === '3D-model' ? 'Model actueel' : activeView === 'Onderdelen' ? 'Stukstaat bijgewerkt' : 'Maatvoering bijgewerkt'}</span><span>{dimensions.risers} optredes</span><span>{dimensions.treadCount} aantreden</span>{#if drawingView && !invalidGeometry}<span>Zoom {activeView === '3D-model' ? viewZoom : zoom}%</span>{/if}<span>Eenheden mm</span></div>{/if}
    </section>

    <BlueprintSplitter side="right" />
    <aside class="properties-panel oa-panel">
      <div class="panel-titlebar oa-panel-header"><span>{rightTab === 'Eigenschappen' ? 'Eigenschappen' : 'Controleren'}</span></div>
      <div class="panel-subtabs"><button class:active={rightTab === 'Eigenschappen'} onclick={() => rightTab = 'Eigenschappen'}>Eigenschappen</button><button class:active={rightTab === 'Controleren'} onclick={() => rightTab = 'Controleren'}>Controleren <span class="panel-notice">{model.stairEnabled ? errors || '✓' : '0'}</span></button></div>
      {#if !model.stairEnabled && activeView !== 'Trapontwerp'}
        <div class="properties-content"><div class="selected-element"><span class="property-icon"><Icon name="file.new" size={18}/></span><div><span class="eyebrow">PROJECT · 0 TRAPPEN</span><b>{model.project.name}</b></div></div><div class="property-section"><h3>Projectgegevens</h3><label for="project-name">Projectnaam</label><input class="text-field" id="project-name" value={model.project.name} oninput={e => updateRoot('project','name',e.currentTarget.value)} /><label for="project-number">Projectnummer</label><input class="text-field" id="project-number" value={model.project.number} oninput={e => updateRoot('project','number',e.currentTarget.value)} /><label for="project-revision">Revisie</label><input class="text-field" id="project-revision" value={model.project.revision} oninput={e => updateRoot('project','revision',e.currentTarget.value)} /></div><div class="property-section"><h3>Trap toevoegen</h3><p>Kies links een traptype of gebruik de keuzelijst bovenaan.</p></div></div>
      {:else if activeView === 'Trapontwerp' && rightTab === 'Controleren'}
        <div class="properties-content"><div class="property-section"><h3>Geometrie en coördinatie</h3>{#each assemblies as a}<h4>{a.instance.mark} · {typeOf(a.instance.type).label}</h4>{#each a.issues as i}<div class="check-row"><i class:check-red={i.level==='error'}>{i.level==='error'?'×':'i'}</i><div><small>{i.text}</small></div></div>{:else}<p>Geen bevindingen uit de componentcontroles.</p>{/each}
          {#if a.precast}<h4>Prefab deeltoetsen</h4>{#each a.precast.elements as e}<button class="action-btn" onclick={()=>inspectCast(a.instance.id,e.id)}>{e.label} · {e.status==='fail'?'Overschreden':'Open punten'}</button>{/each}{/if}
          {:else}<p>Voeg eerst een trappenhuiscomponent toe.</p>{/each}</div></div>
      {:else if activeView === 'Trapontwerp'}
        <WellProperties {well} instance={wellItem} select={openWell} change={changeWell} duplicate={()=>addWell(wellItem.type,wellItem)} remove={removeWell} issues={assemblies.find(a=>a.instance.id===wellItem?.id)?.issues??[]}/>
      {:else if rightTab === 'Controleren'}
        <div class="properties-content"><div class="selected-element"><span class="property-icon"><Icon name="validation.workspace" size={18} /></span><div><span class="eyebrow">VOORCONTROLE · {errors} BLOKKEERFACTOR(EN)</span><b>{model.stair.mark} · {model.stair.name}</b></div></div><div class="rule-summary"><span>{errors ? '!' : 'i'}</span><div><b>{ruleProfiles.find(p => p.id === model.regulatory.profile)?.label ?? 'Profiel ontbreekt'}</b><small>Profielwaarden · toepasselijkheid vereist menselijke controle</small></div></div><div class="property-section"><h3>Toepassingsprofiel <span>⌃</span></h3><label for="rule-profile">Bouw- en gebruikscontext</label><select id="rule-profile" value={model.regulatory.profile} onchange={e => updateRoot('regulatory','profile',e.currentTarget.value)}>{#each ruleProfiles as profile}<option value={profile.id}>{profile.label}</option>{/each}</select>{#if model.regulatory.profile !== 'UNSET'}<label for="headroom">Gemeten vrije hoogte</label><div class="numeric-input"><input id="headroom" type="number" min="0" step="10" placeholder="nog niet gemeten" value={model.regulatory.headroom ?? ''} onchange={e => updateRoot('regulatory','headroom',e.currentTarget)} /><span>mm</span></div><a class="rule-source" href={ruleProfiles.find(p => p.id === model.regulatory.profile)?.source} target="_blank" rel="noreferrer">Bron: {ruleProfiles.find(p => p.id === model.regulatory.profile)?.article} ↗</a>{/if}</div><div class="property-section"><h3>Gebouwcontext <span>⌃</span></h3><label for="opening-width">Trapgat breedte</label><div class="numeric-input"><input id="opening-width" type="number" min="0" step="10" value={model.building.openingWidth} onchange={e => updateRoot('building','openingWidth',e.currentTarget)} /><span>mm</span></div><label for="opening-length">Trapgat lengte</label><div class="numeric-input"><input id="opening-length" type="number" min="0" step="10" value={model.building.openingLength} onchange={e => updateRoot('building','openingLength',e.currentTarget)} /><span>mm</span></div><div class="field-pair"><div><label for="upper-width">Bovenbordes breedte</label><div class="numeric-input"><input id="upper-width" type="number" min="0" step="10" value={model.building.upperLandingWidth} onchange={e => updateRoot('building','upperLandingWidth',e.currentTarget)} /><span>mm</span></div></div><div><label for="upper-depth">Bovenbordes diepte</label><div class="numeric-input"><input id="upper-depth" type="number" min="0" step="10" value={model.building.upperLandingDepth} onchange={e => updateRoot('building','upperLandingDepth',e.currentTarget)} /><span>mm</span></div></div></div><small class="context-note">Maatinvoer zonder sparingspositie of vloercontour. Koppel gebouwmodel voor fit- en vrijehoogtecontrole.</small></div><div class="property-section"><h3>Bevindingen <span>{checks.length}</span></h3>{#each checks as check}<div class="check-row"><i class:check-green={check.level === 'ok'} class:check-red={check.level === 'error'}>{check.level === 'ok' ? '✓' : check.level === 'error' ? '×' : 'i'}</i><div><b>{check.title}</b><small>{check.detail}</small><small class="check-reference">{check.reference}</small></div></div>{/each}</div><div class="compliance-note"><b>Status: voorcontrole</b><p>Dit is een beperkte dimensionele voorcontrole met Bbl-bronverwijzing. Geen constructieve berekening, volledige juridische toets, vergunningbesluit of garantie op conformiteit.</p></div></div>
      {:else}
        <div class="properties-content">
          <div class="selected-element"><span class="property-icon"><Icon name="frame.editor" size={18} /></span><div><span class="eyebrow">TRAP · {model.stair.mark}</span><b>{model.stair.name}</b></div><button class="element-menu" title="Meer">•••</button></div>
          <div class="property-section family-property">
            <label for="family">Trapfamilie</label><select id="family" value={model.stair.type} onchange={e => chooseFamily(e.currentTarget.value)}>{#each stairFamilies as family}<option value={family.id}>{family.label}</option>{/each}<optgroup label="Trappen en ladders">{#each componentTypes as t}<option value={t.id}>{t.label}</option>{/each}</optgroup></select>
            <label for="tread-system">Tredesysteem</label><select id="tread-system" value={model.engineering.structureType} onchange={e => { updateEngineering('structureType', e.currentTarget.value); selectRibbon('Engineering'); }}>{#each structureTypes as type}<option value={type.id}>{type.label}</option>{/each}</select>
          </div>
          {#if timberSystem && geometry.stringers.some(beam=>beam.profile!=='cut') && (activeView === 'Wangbladen' || activeView === 'CNC-machine')}<JoineryControls joinery={model.joinery} update={updateJoinery} />{/if}
          {#if dimensions.family.winder}<WinderControls stair={model.stair} {geometry} {update} showPlan={() => activeView = 'Plattegrond'} />{/if}
          <div class="property-section"><h3>Project en trap <span>⌃</span></h3><label for="project-name">Projectnaam</label><input class="text-field" id="project-name" value={model.project.name} oninput={e => updateRoot('project','name',e.currentTarget.value)} /><label for="project-number">Projectnummer</label><input class="text-field" id="project-number" value={model.project.number} oninput={e => updateRoot('project','number',e.currentTarget.value)} /><label for="project-revision">Revisie</label><input class="text-field" id="project-revision" value={model.project.revision} oninput={e => updateRoot('project','revision',e.currentTarget.value)} /><label for="project-client">Opdrachtgever</label><input class="text-field" id="project-client" value={model.project.client} oninput={e => updateRoot('project','client',e.currentTarget.value)} /><label for="project-location">Projectlocatie</label><input class="text-field" id="project-location" value={model.project.location} oninput={e => updateRoot('project','location',e.currentTarget.value)} /><label for="stair-mark">Trapmerk</label><input class="text-field" id="stair-mark" value={model.stair.mark} oninput={e => update('mark',e.currentTarget.value)} /><label for="stair-name">Trapomschrijving</label><input class="text-field" id="stair-name" value={model.stair.name} oninput={e => update('name',e.currentTarget.value)} /></div>
          <div class="property-section"><h3>Trapgeometrie <span>⌃</span></h3>
            <label for="floor-height">Vloerhoogte</label><div class="numeric-input"><input id="floor-height" type="number" min="100" max="10000" step="10" value={model.stair.floorHeight} onchange={e => update('floorHeight', e.currentTarget)} /><span>mm</span></div>
            <label for="stair-width">Trapbreedte buitenwerks · incl. bomen</label><div class="numeric-input"><input id="stair-width" type="number" min="300" max="3000" step="10" value={model.stair.width} onchange={e => update('width', e.currentTarget)} /><span>mm</span></div>
            <div class="field-pair"><div><label for="risers">Aantal optredes</label><div class="spinner"><button aria-label="Optrede minder" onclick={() => update('risers', Math.max(2, model.stair.risers - 1))}>−</button><input id="risers" type="number" min="2" max="40" value={model.stair.risers} onchange={e => update('risers', e.currentTarget)} /><button aria-label="Optrede meer" onclick={() => update('risers', Math.min(40, model.stair.risers + 1))}>＋</button></div></div><div><div class="field-label">Optrede</div><div class="computed-value">{dimensions.rise.toFixed(1)} <span>mm</span></div></div></div>
            <label for="going">{dimensions.family.winder ? 'Stapafstand langs de klimlijn' : 'Aantrede'}</label><div class="numeric-input"><input id="going" type="number" min="100" max="600" step="5" value={model.stair.going} onchange={e => update('going', e.currentTarget)} /><span>mm</span></div>
            {#if dimensions.flightCount > 1}<label for="landing-length">Bordeslengte</label><div class="numeric-input"><input id="landing-length" type="number" min="300" max="5000" step="10" value={model.stair.landingLength} onchange={e => update('landingLength', e.currentTarget)} /><span>mm</span></div>
              <label for="landing-thickness">Bordesdikte</label><div class="numeric-input"><input id="landing-thickness" type="number" min="20" max="300" step="5" value={model.stair.landingThickness} onchange={e => update('landingThickness',e.currentTarget)} /><span>mm</span></div>
              {#if timberSystem}
                <label for="landing-frame">Bordesrandliggers</label><select id="landing-frame" value={model.stair.landingFrame} onchange={e=>update('landingFrame',e.currentTarget.value)}><option value="none">Geen</option><option value="perimeter">Houten raam onder bordes</option></select>
                {#if model.stair.landingFrame==='perimeter'}
                  <label for="landing-frame-width">Breedte randligger</label><div class="numeric-input"><input id="landing-frame-width" type="number" min="40" max="150" step="5" value={model.stair.landingFrameWidth} onchange={e=>update('landingFrameWidth',e.currentTarget)} /><span>mm</span></div>
                  <label for="landing-frame-depth">Hoogte randligger</label><div class="numeric-input"><input id="landing-frame-depth" type="number" min="80" max="300" step="5" value={model.stair.landingFrameDepth} onchange={e=>update('landingFrameDepth',e.currentTarget)} /><span>mm</span></div>
                  <label for="landing-screws">Schroeven per stuiknaad</label><div class="numeric-input"><input id="landing-screws" type="number" min="0" max="4" step="1" value={model.stair.landingScrewsPerJoint} onchange={e=>update('landingScrewsPerJoint',e.currentTarget)} /><span>st.</span></div>
                  <label for="landing-screw-diameter">Schroefdiameter</label><div class="numeric-input"><input id="landing-screw-diameter" type="number" min="5" max="12" step="1" value={model.stair.landingScrewDiameter} onchange={e=>update('landingScrewDiameter',e.currentTarget)} /><span>mm</span></div>
                  <label for="landing-screw-length">Schroeflengte</label><div class="numeric-input"><input id="landing-screw-length" type="number" min="40" max="250" step="5" value={model.stair.landingScrewLength} onchange={e=>update('landingScrewLength',e.currentTarget)} /><span>mm</span></div>
                  <label for="landing-screw-rd">Opgegeven schuifweerstand per schroef</label><div class="numeric-input"><input id="landing-screw-rd" type="number" min="0" max="1000" step="0.1" value={model.stair.landingScrewShearRd} onchange={e=>update('landingScrewShearRd',e.currentTarget)} /><span>kN</span></div>
                  <label for="landing-timber-e">E-modulus randligger</label><div class="numeric-input"><input id="landing-timber-e" type="number" min="0" max="30000" step="100" value={model.stair.landingTimberE} onchange={e=>update('landingTimberE',e.currentTarget)} /><span>N/mm²</span></div>
                  <label for="landing-timber-fm">Ontwerpbuigsterkte randligger</label><div class="numeric-input"><input id="landing-timber-fm" type="number" min="0" max="100" step="0.1" value={model.stair.landingTimberFmRd} onchange={e=>update('landingTimberFmRd',e.currentTarget)} /><span>N/mm²</span></div>
                  <label for="landing-deflection-ratio">Doorbuigingsgrens L /</label><div class="numeric-input"><input id="landing-deflection-ratio" type="number" min="100" max="1000" step="25" value={model.stair.landingDeflectionRatio} onchange={e=>update('landingDeflectionRatio',e.currentTarget)} /><span>—</span></div>
                  <small class="context-note">Schroeven worden op de stuiknaden gepositioneerd. Draagkracht en gebouwoplegging blijven projectafhankelijk.</small>
                {/if}
              {/if}
              <label for="landing-riser">Bordes op optrede</label><select id="landing-riser" value={model.stair.landingRiser??0} onchange={e=>update('landingRiser',e.currentTarget)}>
                <option value="0">Automatisch · {dimensions.flightRisers[0]} · {Math.round(dimensions.flightHeights[0])} mm</option>
                {#each Array.from({length:Math.max(0,model.stair.risers-3)},(_,j)=>j+2) as step}<option value={step}>{step} · {Math.round(step*dimensions.rise)} mm</option>{/each}
              </select>
              {#if model.stair.type!=='landing'}<label for="turn-direction-landing">Draairichting bij oplopen</label><select id="turn-direction-landing" value={model.stair.turnDirection} onchange={e=>update('turnDirection',e.currentTarget.value)}><option value="left">Linksom</option><option value="right">Rechtsom</option></select>{/if}
            {/if}
            <div class="computed-row"><span>Ontwikkelde looplengte</span><b>{dimensions.totalRun} mm</b></div><div class="computed-row"><span>Hellingshoek</span><b>{dimensions.pitch.toFixed(1)}°</b></div>
          </div>
          <div class="property-section"><h3>Constructie <span>⌃</span></h3>
            {#if timberSystem}
              <label for="material">Houtsoort</label><select id="material" value={model.stair.material} onchange={e => update('material', e.currentTarget.value)}><option>Eiken · massief</option><option>Vuren · gelamineerd</option><option>Beuken · massief</option></select>
              <label for="stringer-left">Boom links bij oplopen</label><select id="stringer-left" value={model.stair.stringerLeft} onchange={e=>update('stringerLeft',e.currentTarget.value)}><option value="housed">Ingekroosde boom</option><option value="cut" disabled={dimensions.family.winder}>Uitgezaagde keepboom</option></select>
              <label for="stringer-right">Boom rechts bij oplopen</label><select id="stringer-right" value={model.stair.stringerRight} onchange={e=>update('stringerRight',e.currentTarget.value)}><option value="housed">Ingekroosde boom</option><option value="cut" disabled={dimensions.family.winder}>Uitgezaagde keepboom</option></select>
              {#if dimensions.family.winder}<p class="reference-note">Verdreven trappen gebruiken gesegmenteerde ingekroosde bomen met verstek. Keepbomen voor verdreven treden vragen nog een afzonderlijke keepverdeling.</p>{/if}
              {#if !dimensions.family.winder && (model.stair.stringerLeft==='cut'||model.stair.stringerRight==='cut')}<label for="stringer-overhang">Trederand t.o.v. keepboom (+ buiten, − binnen)</label><div class="numeric-input"><input id="stringer-overhang" type="number" min="-60" max="60" step="5" value={model.stair.stringerOverhang} onchange={e=>update('stringerOverhang',e.currentTarget)} /><span>mm</span></div>{/if}
            {:else}<p class="reference-note">De contour en referentiewangen bepalen de gereserveerde ruimte. Leg oplegging en productopbouw vast in Engineering.</p>{/if}
            <label for="stringer-depth">{dimensions.family.winder ? 'Verticale wanghoogte' : model.stair.stringerLeft==='cut'||model.stair.stringerRight==='cut' ? 'Minimale keepboomrug / boomhoogte' : 'Wanghoogte'}</label><div class="numeric-input"><input id="stringer-depth" type="number" min="100" max="1000" step="10" value={model.stair.stringerDepth} onchange={e => update('stringerDepth',e.currentTarget)} /><span>mm</span></div>
            <label for="stringer-thickness">Wangdikte</label><div class="numeric-input"><input id="stringer-thickness" type="number" min="20" max="150" step="5" value={model.stair.stringerThickness} onchange={e => update('stringerThickness',e.currentTarget)} /><span>mm</span></div><label for="nosing">Tredepositie langs de looplijn (+ naar voren, − naar achteren)</label><div class="numeric-input"><input id="nosing" type="number" min="-60" max="100" step="5" value={model.stair.nosing} onchange={e => update('nosing', e.currentTarget)} /><span>mm</span></div>
          </div>
          <div class="property-section"><label for="tread-thickness">Trededikte</label><div class="numeric-input"><input id="tread-thickness" type="number" min="10" step="1" value={model.stair.treadThickness} onchange={e => update('treadThickness', e.currentTarget)} /><span>mm</span></div></div>
          {#if timberSystem}<StairDetailControls stair={model.stair} {update} issue={invalidGeometry}/>{/if}
          <div class="property-section">
            <h3>IFC-projectnulpunt <span>⌃</span></h3>
            <label for="bim-origin-x">X-coördinaat</label><div class="numeric-input"><input id="bim-origin-x" type="number" step="1" value={model.bim.originX} onchange={e => updateRoot('bim','originX',e.currentTarget)} /><span>mm</span></div>
            <label for="bim-origin-y">Y-coördinaat</label><div class="numeric-input"><input id="bim-origin-y" type="number" step="1" value={model.bim.originY} onchange={e => updateRoot('bim','originY',e.currentTarget)} /><span>mm</span></div>
            <label for="bim-origin-z">Z-coördinaat</label><div class="numeric-input"><input id="bim-origin-z" type="number" step="1" value={model.bim.originZ} onchange={e => updateRoot('bim','originZ',e.currentTarget)} /><span>mm</span></div>
            <label for="bim-origin-rotation">Rotatie X-as t.o.v. host</label><div class="numeric-input"><input id="bim-origin-rotation" type="number" min="-360" max="360" step="0.1" value={model.bim.originRotationDeg} onchange={e => updateRoot('bim','originRotationDeg',e.currentTarget)} /><span>°</span></div>
            <label for="bim-origin-agreed"><input id="bim-origin-agreed" type="checkbox" checked={model.bim.originAgreed} onchange={e => updateRoot('bim','originAgreed',e.currentTarget.checked)} /> Projectnulpunt afgestemd</label>
            <small class="context-note">IFC Site gebruikt deze plaatsing. Stem assen, rotatie en coördinatenstelsel af met het gebouwmodel.</small>
          </div>
          {#if timberSystem}
            <div class="property-section">
              <h3>BIM-materiaal en classificatie <span>⌃</span></h3>
              <label for="naakt-name">Materiaalnaam · NAA.K.T.</label>
              <input class="text-field" id="naakt-name" value={model.stair.materialName} placeholder="bijv. eikenhout" oninput={e => update('materialName', e.currentTarget.value)} />
              <label for="naakt-feature">Kenmerk</label>
              <input class="text-field" id="naakt-feature" value={model.stair.materialFeature} placeholder="bijv. massief" oninput={e => update('materialFeature', e.currentTarget.value)} />
              <label for="naakt-application">Toepassing</label>
              <input class="text-field" id="naakt-application" value={model.stair.materialApplication} placeholder="bijv. trapvlucht en bordes" oninput={e => update('materialApplication', e.currentTarget.value)} />
              <label for="nlsfb-code">NL-SfB-elementcode</label>
              <input class="text-field" id="nlsfb-code" value={model.stair.nlsfbCode} placeholder="00.00" onchange={e => update('nlsfbCode', e.currentTarget.value)} />
              <label for="nlsfb-landing">NL-SfB bordes · optioneel</label>
              <input class="text-field" id="nlsfb-landing" value={model.stair.nlsfbLandingCode} placeholder="volgt hoofdcode" onchange={e => update('nlsfbLandingCode', e.currentTarget.value)} />
              <label for="nlsfb-railing">NL-SfB leuning · optioneel</label>
              <input class="text-field" id="nlsfb-railing" value={model.stair.nlsfbRailingCode} placeholder="volgt hoofdcode" onchange={e => update('nlsfbRailingCode', e.currentTarget.value)} />
              <small class="context-note">Vul alle drie materiaalvelden in voor de IFC-materiaalnaam. Controleer de gekozen NL-SfB-codes met het projectteam.</small>
            </div>
          {/if}
          {#if timberSystem && activeView !== 'Wangbladen' && activeView !== 'CNC-machine'}<button class="check-model" onclick={showWangbladen}><Icon name="frame.editor" /> Tredeverbindingen en wangbladen <span>→</span></button>{/if}
          <button class="check-model" onclick={() => rightTab = 'Controleren'}><Icon name="validation.workspace" /> Model controleren <span>→</span></button>
        </div>
      {/if}
    </aside>
  </main>

  <footer class="statusbar oa-statusbar"><div class="status-left"><span class="status-indicator"></span><span>{activeView==='Trapontwerp' ? 'Trapontwerp · '+(wellItem?.mark??model.project.number) : model.stairEnabled?model.stair.mark+' · '+model.stair.name:'Nog geen trap'}</span><span class="status-dimensions">{activeView==='Trapontwerp'?well.length+' × '+well.width+' mm':model.stairEnabled?model.stair.width+' × '+model.stair.floorHeight+' mm':'0 trappen'}</span><span class="status-muted">{activeView==='Trapontwerp'?'Coördinatiemodel':model.stairEnabled?materialLabel:'Kies een traptype'}</span></div><div class="status-right"><span>{dirty ? 'Niet opgeslagen' : 'Concept'}</span><span class="status-separator"></span><span>{ruleProfiles.find(p => p.id === model.regulatory.profile)?.label}</span><span class="status-separator"></span><span>OSS {model.version}</span></div></footer>
  {#if toast}<div class="toast">{toast}</div>{/if}
  <dialog bind:this={newProjectDialog} class="oa-dialog new-project-dialog" aria-labelledby="new-project-heading" aria-describedby="new-project-message">
    <h2 id="new-project-heading" class="oa-heading oa-heading--dialog">Nieuw project starten?</h2>
    <p id="new-project-message">Het huidige project heeft niet opgeslagen wijzigingen. Sla het eerst op als je deze wilt bewaren.</p>
    <div class="oa-dialog-actions">
      <button class="oa-button" type="button" onclick={() => newProjectDialog.close()}>Huidig project behouden</button>
      <button class="oa-button oa-button--primary" type="button" onclick={createNewProject}>Nieuw project starten</button>
    </div>
  </dialog>
</div>
