import {loadState, saveState, initialState, escapeHtml as esc, ageLabel, filterTrackers, makeDemoTracker} from './store.js';
import {DemoTrackerService} from './adapters.js';
import {liveScreen, liveAction} from './live.js';
import {routeFor, parseRoute} from './routes.js';
import {installationState, requestInstallation, activateUpdate} from './pwa.js';

const paths = {
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  help:'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M9 3l-1 3-3 1-2 3 2 2-1 3 3 2 2 3h4l1-3 3-1 2-3-2-2 1-3-3-2-2-3Z',
  plus:'M12 5v14 M5 12h14', x:'M6 6l12 12 M18 6 6 18', chevron:'m9 5 7 7-7 7', back:'m15 5-7 7 7 7',
  search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  bike:'M8 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M26 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M3 16l6-11 6 11H3 M9 5h8 M21 16 17 5l-1-3h-4',
  bag:'M5 7h14l2 14H3L5 7Z M8 8V6a4 4 0 0 1 8 0v2',
  suitcase:'M7 5h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M9 5V2h6v3 M9 9v8 M15 9v8 M8 21v1 M16 21v1',
  key:'M14 8a6 6 0 1 1-6-6 6 6 0 0 1 6 6Z M12 12l10 10 M17 17l3-3 M7 6h.01',
  car:'m5 7 2-4h10l2 4 M3 11l2-4h14l2 4v8H3v-8Z M6 19v2 M18 19v2 M6 13h2 M16 13h2',
  battery:'M2 7h17v10H2z M22 10v4 M5 10v4 M8 10v4 M11 10v4',
  bluetooth:'m7 7 10 10-5 5V2l5 5L7 17',
  sound:'M11 5 6 9H2v6h4l5 4V5Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',
  refresh:'M20 7a9 9 0 1 0 1 8 M20 2v5h-5',
  navigate:'m21 3-7 18-3-8-8-3L21 3Z',
  check:'m5 12 4 4L19 6', shield:'M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6L12 2Z m-4 10 3 3 5-6',
  list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  target:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 1v3 M12 20v3 M1 12h3 M20 12h3 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  edit:'m16 3 5 5-12 12-6 1 1-6L16 3Z M13 6l5 5',
  trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  clock:'M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
  info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="${name==='bike'?'-3 0 32 25':'0 0 24 24'}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.pin}"/></svg>`;
const state = loadState();
const service = new DemoTrackerService();
const ui = {page:'home', view:'map', query:'', filter:'all', selected:state.trackers[0]?.id ?? null, zoom:1, busy:false, addedKind:'bike'};
let toastTimer, dialogReturnFocus, previousPage = 'home';
const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
const toastElement=document.querySelector('#toast');
const current=()=>state.trackers.find(t=>t.id===ui.selected);
const kindNames={bike:'Fiets',bag:'Tas',suitcase:'Koffer',key:'Sleutels',car:'Auto'};

function persist(){if(!saveState(state)) toast('Je browser kan wijzigingen niet bewaren. Houd dit venster open.');}
function toast(message,undo){
  clearTimeout(toastTimer);
  toastElement.innerHTML=`${icon('info')}<span>${esc(message)}</span>${undo?'<button id="undo">Ongedaan maken</button>':''}`;
  toastElement.classList.add('visible');
  if(undo) toastElement.querySelector('#undo').onclick=()=>{undo();toastElement.classList.remove('visible');};
  toastTimer=setTimeout(()=>toastElement.classList.remove('visible'),undo?10000:6000);
}
function openDialog(html){
  dialogReturnFocus=document.activeElement;
  dialog.innerHTML=`<button class="icon-button dialog-close" data-action="close-dialog" aria-label="Sluiten">${icon('x')}</button>${html}`;
  if(!dialog.open)history.pushState({...history.state,narvieMyTagModal:true},'',location.href);
  dialog.showModal();
}
function closeDialog(){
  if(!dialog.open)return Promise.resolve();
  dialog.close();
  if(history.state?.narvieMyTagModal)return new Promise(resolve=>{window.addEventListener('popstate',resolve,{once:true});history.back();});
  return Promise.resolve();
}
dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
dialog.addEventListener('close',()=>{if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus();else document.querySelector('[data-action="add"]')?.focus();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});

function shell(){
  document.documentElement.classList.toggle('reduce-motion',state.settings.reduceMotion);
  app.innerHTML=`
  <aside class="sidebar">
    <a class="wordmark" href="#home" data-action="nav" data-page="home" aria-label="Narvie, naar mijn trackers"><img src="assets/icon.svg" alt="" width="34" height="34"><span>narvie<span class="brand-dot">.</span></span></a>
    <div class="sidebar-label">JOUW DAG, GERUST.</div>
    <nav class="side-nav" aria-label="Hoofdnavigatie">${navItems()}</nav>
    <div class="sidebar-bottom"><div class="mini-tag">${icon('shield')}</div><strong>Dicht bij wat telt.</strong><p>Een vertrouwd gevoel.<br>Waar je ook bent.</p><div class="version">Narvie Trackers <span>v0.3</span></div></div>
  </aside>
  <div class="workspace">
    <div class="demo-strip"><span><span class="demo-dot"></span><strong>Voorbeeldgegevens</strong><span class="demo-description">Echte tracker nog niet gekoppeld</span></span><button data-action="about-demo">Meer info ${icon('chevron')}</button></div>
    <header class="topbar"><div class="mobile-wordmark"><img src="assets/icon.svg" alt="" width="32" height="32"><span>narvie.<small>TRACKERS</small></span></div><div class="breadcrumb">Narvie Trackers <span>/</span> <span id="breadcrumb-page">Mijn trackers</span></div><div class="topbar-right"><span id="connection-status" class="connection-status"></span><span class="private-note">${icon('shield')} Jouw spullen. Jouw overzicht.</span><button class="notification-button icon-button" data-action="notifications" aria-label="Meldingen bekijken">${icon('bell')}<span class="notification-dot"></span></button><div class="avatar" aria-label="Narvie voorbeeldprofiel">N</div></div></header><div id="update-banner" class="update-banner" hidden>Een nieuwe versie staat klaar. <button data-action="update-app">App bijwerken</button></div>
    <main id="main" tabindex="-1"></main>
    <footer class="app-footer"><span>Met een gerust gevoel op weg.</span><span>Gemaakt voor jouw Narvie-trackers</span></footer>
  </div>
  <nav class="bottom-nav" aria-label="Mobiele navigatie">${navItems()}</nav>`;
  renderMain();
  updatePWAUI();
}
function navItems(){return [['home','pin','Voorbeelden'],['live','bluetooth','Mijn tracker'],['help','help','Hulp'],['settings','settings','Instellingen']].map(([page,i,label])=>`<button data-action="nav" data-page="${page}" class="nav-item ${ui.page===page||(ui.page==='detail'&&page==='home')?'active':''}" ${ui.page===page?'aria-current="page"':''}>${icon(i)}<span>${label}</span>${page==='home'?'<span class="nav-count">'+state.trackers.length+'</span>':''}</button>`).join('');}
function renderNav(){document.querySelectorAll('.side-nav,.bottom-nav').forEach(n=>n.innerHTML=navItems());}
function renderMain(){
  const main=document.querySelector('#main');
  document.title=`Narvie Trackers · ${ui.page==='detail'?(current()?.name||'Tracker'):ui.page==='help'?'Hulp':ui.page==='settings'?'Instellingen':ui.page==='live'?'Mijn echte tracker':'Mijn trackers'}`;
  document.querySelector('#breadcrumb-page').textContent=ui.page==='detail'?'Tracker bekijken':ui.page==='help'?'Hulp':ui.page==='settings'?'Instellingen':ui.page==='live'?'Mijn echte tracker':'Mijn trackers';
  renderNav();
  if(ui.page==='detail'&&!current())ui.page='home';
  main.innerHTML=ui.page==='live'?liveScreen():ui.page==='home'?home():ui.page==='detail'?detail():ui.page==='help'?help():settings();
  const notifications=document.querySelector('.notification-button');if(notifications)notifications.hidden=ui.page==='live';
  const strip=document.querySelector('.demo-strip');
  if(strip)strip.innerHTML=ui.page==='live'?'<span><span class="demo-dot"></span><strong>Persoonlijke trackertest</strong><span class="demo-description">Alleen echte API-resultaten</span></span>':'<span><span class="demo-dot"></span><strong>Voorbeeldgegevens</strong><span class="demo-description">Echte tracker nog niet gekoppeld</span></span><button data-action="about-demo">Meer info</button>';
  updateMapZoom();
  updatePWAUI();
}
function home(){
  return `<section class="page-heading"><div><div class="eyebrow">EEN ZORG MINDER</div><h1>Alles op z’n plek<span>.</span></h1><p>Je belangrijke spullen, samen in één overzicht.</p></div><button class="button primary add-button" data-action="add">${icon('plus')} Tracker toevoegen</button></section>
    <div class="overview-bar"><div class="overview-stats"><span><strong>${state.trackers.length}</strong> trackers</span><span class="stats-divider"></span><span><i class="green-dot"></i><strong>${state.trackers.filter(t=>t.nearby).length}</strong> dichtbij <small>in dit voorbeeld</small></span></div><span class="example-label">${icon('spark')} Jouw eerste blik op Narvie</span></div>
    <section class="tracker-board" aria-label="Tracker-overzicht">
      <div class="board-toolbar"><div class="segmented" aria-label="Weergave"><button data-action="view" data-view="map" aria-pressed="${ui.view==='map'}" class="${ui.view==='map'?'selected':''}">${icon('pin')} Kaart</button><button data-action="view" data-view="list" aria-pressed="${ui.view==='list'}" class="${ui.view==='list'?'selected':''}">${icon('list')} Lijst</button></div><label class="search">${icon('search')}<input id="search" type="search" placeholder="Zoek een tracker…" aria-label="Zoek een tracker" value="${esc(ui.query)}" maxlength="100"></label></div>
      <div id="board-content">${boardContent()}</div>
    </section>
    <section class="reassurance"><div class="reassurance-icon">${icon('shield')}</div><div><strong>Klein hulpmiddel. Groot gerust gevoel.</strong><p>Een tas, je fiets of die ene koffer. Narvie helpt je het overzicht te houden.</p></div><button class="text-button" data-action="nav" data-page="help">Hoe werkt het? ${icon('chevron')}</button></section>`;
}
function boardContent(){
  const trackers=filterTrackers(state.trackers,ui.query,ui.filter);
  return `<div class="board-body ${ui.view==='list'?'list-mode':''}">
    ${ui.view==='map'?map(trackers):''}
    <div class="tracker-list-panel"><div class="list-panel-heading"><h2>Mijn trackers <span>${trackers.length}</span></h2><button class="icon-button small" data-action="refresh" aria-label="Voorbeeldgegevens vernieuwen" ${ui.busy?'disabled':''}>${icon('refresh',ui.busy?'spinning':'')}</button></div>
    <div class="filters" aria-label="Trackers filteren">${[['all','Alle'],['nearby','Dichtbij'],['battery','Batterij laag']].map(([v,l])=>`<button data-action="filter" data-filter="${v}" aria-pressed="${ui.filter===v}" class="${ui.filter===v?'active':''}">${l}</button>`).join('')}</div>
    <div class="tracker-list">${trackers.length?trackers.map(trackerCard).join(''):emptyState()}</div>
    <button class="add-inline" data-action="add">${icon('plus')} Nog een tracker toevoegen</button><div class="list-note">${icon('info')} Voorbeeldgegevens · geen echte verbinding</div></div>
  </div>`;
}
function trackerCard(t){
  return `<article class="tracker-card ${ui.selected===t.id?'is-selected':''}"><button class="tracker-select" data-action="select" data-id="${esc(t.id)}" aria-label="Bekijk ${esc(t.name)}"><span class="object-icon ${t.tone}">${icon(t.kind)}</span><span class="tracker-card-copy"><strong>${esc(t.name)}</strong><span class="tracker-status ${t.nearby?'nearby':''}">${t.nearby?'<i class="green-dot"></i>Dichtbij':t.observedAt?'Laatste locatie beschikbaar':'Nog niet gezien'}</span></span><span class="tracker-chevron">${icon('chevron')}</span></button><div class="tracker-meta"><span>${icon('clock')}${esc(ageLabel(t.observedAt))}</span><span class="${t.battery<=20?'low-battery':''}">${icon('battery')}${t.battery}%</span></div>${t.battery<=20?'<div class="battery-warning">Tijd om je batterij te controleren</div>':''}</article>`;
}
function emptyState(){return `<div class="empty-state"><span class="empty-icon">${icon('search')}</span><h3>${state.trackers.length?'Geen trackers gevonden':'Je overzicht begint hier'}</h3><p>${state.trackers.length?'Probeer een andere zoekterm of kies een ander filter.':'Voeg een voorbeeldtracker toe en ontdek de app.'}</p>${state.trackers.length?'<button class="text-button" data-action="clear-filters">Wis zoekopdracht en filters</button>':''}</div>`;}
function map(trackers,large=false){
  const t=current();
  const mappable=trackers.filter(t=>t.x!==null);
  return `<div class="map-panel ${large?'detail-map':''}" aria-label="Schematische voorbeeldkaart, geen echte locaties"><div class="map-stage"><img class="map-art" src="assets/map.svg" alt="Schematische kaart met Alkmaar en Heerhugowaard, uitsluitend ter illustratie" draggable="false">
    ${mappable.map(t=>`<button class="map-marker ${t.id===ui.selected?'selected':''} ${t.tone}" style="left:${t.x}%;top:${t.y}%" data-action="marker" data-id="${esc(t.id)}" aria-label="${esc(t.name)} op voorbeeldkaart"><span>${icon(t.kind)}</span><small>${esc(t.name)}</small></button>`).join('')}</div>
    <span class="map-example-badge">${icon('pin')} Voorbeeldkaart</span><div class="map-controls"><button class="icon-button" data-action="zoom-in" aria-label="Inzoomen" ${ui.zoom>=1.6?'disabled':''}>${icon('plus')}</button><button class="icon-button minus" data-action="zoom-out" aria-label="Uitzoomen" ${ui.zoom<=1?'disabled':''}>−</button><span></span><button class="icon-button" data-action="recenter" aria-label="Kaart herstellen">${icon('target')}</button></div>
    ${t&&!large&&trackers.some(v=>v.id===t.id)?`<div class="map-selection"><span class="object-icon ${t.tone}">${icon(t.kind)}</span><div><strong>${esc(t.name)}</strong><span>${esc(t.observedAt?t.place+', '+t.area:'Nog geen voorbeeldlocatie')}</span></div><button class="icon-button" data-action="details" data-id="${esc(t.id)}" aria-label="Details van ${esc(t.name)}">${icon('chevron')}</button></div>`:''}
    <span class="map-caption">Illustratie · geen navigatiekaart</span>${!mappable.length?'<div class="map-empty">Voor deze selectie is geen voorbeeldlocatie beschikbaar.</div>':''}</div>`;
}
function detail(){
  const t=current();
  const seen=t.observedAt!==null;
  return `<button class="back-button" data-action="back">${icon('back')} Mijn trackers</button><section class="detail-heading"><span class="object-icon large ${t.tone}">${icon(t.kind)}</span><div><div class="eyebrow">JOUW TRACKER</div><h1>${esc(t.name)}</h1><p>Narvie Magnetic · voorbeeldtracker</p></div><button class="icon-button edit-name" data-action="rename" aria-label="Naam wijzigen">${icon('edit')}</button></section>
    <section class="detail-board">${map([t],true)}<div class="detail-info"><div class="eyebrow">LAATSTE LOCATIE</div><h2>${seen?esc(t.place):'Nog even geduld'}</h2><p class="location-area">${seen?esc(t.area):'Er is nog geen voorbeeldlocatie beschikbaar.'}</p><div class="location-age">${icon('clock')} ${esc(ageLabel(t.observedAt))} <span>Voorbeeld</span></div>
    <div class="detail-metrics"><div>${icon('battery')}<span>Batterij<strong class="${t.battery<=20?'low-battery':''}">${t.battery}%</strong></span></div><div>${icon('bluetooth')}<span>Bereik<strong>${t.nearby?'Dichtbij':'Buiten bereik'}</strong></span></div></div>
    <button class="button primary wide" data-action="ring">${icon('sound')} Geluid proberen <span class="button-badge">Demo</span></button><p class="action-explanation">Laat zien hoe de piepfunctie werkt. Je echte tracker maakt nu geen geluid.</p><button class="button secondary wide" data-action="refresh" ${ui.busy?'disabled':''}>${icon('refresh',ui.busy?'spinning':'')} ${ui.busy?'Even vernieuwen…':'Voorbeeld vernieuwen'}</button>
    <p class="location-disclaimer">Een laatst bekende locatie is geen live positie. In dit voorbeeld zijn ook bereik en batterij gesimuleerd.</p></div></section>
    <section class="tracker-options"><div><h2>Maak ’m van jou</h2><p>Een herkenbare naam maakt terugvinden makkelijker.</p></div><button class="button secondary" data-action="rename">${icon('edit')} Naam wijzigen</button><button class="text-button danger" data-action="remove">${icon('trash')} Voorbeeldtracker verwijderen</button></section>`;
}
function help(){return `<section class="page-heading"><div><div class="eyebrow">WE HELPEN JE OP WEG</div><h1>Even samen kijken<span>.</span></h1><p>Alles wat je wilt weten over je Narvie-tracker.</p></div><span class="heading-illustration">${icon('help')}</span></section>
  <section class="help-intro"><div class="mini-tag">${icon('pin')}</div><div><h2>Terugvinden begint met overzicht.</h2><p>Dichtbij zoek je met geluid. Verder weg kijk je naar de laatst bekende locatie. Hoe recent die is, staat er altijd bij.</p></div></section>
  <div class="help-grid">${[
    ['Hoe voeg ik een tracker toe?','Met ‘Tracker toevoegen’ doorloop je de eerste schermen. In deze versie voeg je alleen een voorbeeldtracker toe; een echte tracker koppelen volgt na de praktijktest.'],
    ['Waarom is een locatie niet altijd actueel?','Een Bluetooth-tracker stuurt niet zelfstandig continu een GPS-positie door. Locatie-updates hangen af van het achterliggende netwerk. Daarom tonen we het tijdstip waarop de tracker voor het laatst is waargenomen. De precieze werking voor dit model wordt nog getest.'],
    ['Wanneer kan mijn tracker piepen?','De piepfunctie uit de documentatie werkt via een directe Bluetooth-verbinding. De afstand, omgeving en verbinding bepalen of dat lukt. ‘Geluid proberen’ in deze versie is uitsluitend een demonstratie.'],
    ['Kan ik mijn huidige MyTag-app blijven gebruiken?','Ja, bestaande klanten kunnen MyTag voorlopig blijven gebruiken. Deze appversie maakt geen verbinding met je account, wijzigt je tracker niet en zet geen gegevens over.'],
    ['Wat betekent een lage batterij?','In dit voorbeeld verschijnt onder 21% een melding. Bij echte trackers moet nog worden getest hoe betrouwbaar het percentage is. Locatiegegevens van de leverancier kunnen ook alleen een batterijcategorie bevatten.'],
    ['Zijn dit mijn echte locaties?','Nee. Alle trackers, batterijniveaus, bereikstatussen en locaties in deze versie zijn voorbeelden. De kaart is een illustratie. Er wordt geen telefoonlocatie opgevraagd en er worden geen gegevens naar MyTag verstuurd.'],
  ].map(([q,a])=>`<details><summary>${q}${icon('plus')}</summary><p>${a}</p></details>`).join('')}</div><section class="settings-card"><h2>We helpen je op weg.</h2><p class="support-copy">Vraag over de app? Vermeld je toestel en browser.</p><a class="text-button support-email" href="mailto:contact@narvie-tracker.nl?subject=Hulp%20bij%20Narvie%20Trackers">contact@narvie-tracker.nl</a><a class="text-button" href="installeren.html">Op je beginscherm zetten</a></section><div class="help-bottom">${icon('shield')} In deze versie blijven je wijzigingen op dit apparaat.</div>`;}
function settings(){return `<section class="page-heading"><div><div class="eyebrow">PRECIES ZOALS JIJ HET WILT</div><h1>Jouw instellingen<span>.</span></h1><p>Een helder overzicht, op jouw manier.</p></div></section>
  <section class="settings-card"><h2>Weergave</h2><div class="setting-row"><div><strong>Minder beweging</strong><p>Beperk animaties en overgangen in de app.</p></div><button class="switch ${state.settings.reduceMotion?'on':''}" role="switch" aria-checked="${state.settings.reduceMotion}" aria-label="Minder beweging" data-action="motion"><span></span></button></div><div class="setting-row"><div><strong>Taal</strong><p>Je app staat in het Nederlands.</p></div><span class="setting-value">Nederlands</span></div></section>
  <section class="settings-card"><h2>Over deze versie</h2><div class="setting-row"><div><strong>Narvie Trackers</strong><p>Telefoontest · 0.3.3</p></div><span class="mode-pill">Voorbeeldmodus</span></div><div class="setting-row"><div><strong>Jouw gegevens</strong><p>Alleen voorbeeldtrackers, lokaal bewaard. Er is nog geen account of cloudsynchronisatie.</p></div>${icon('shield')}</div><div class="setting-row"><div><strong>Opnieuw beginnen</strong><p>Zet de oorspronkelijke drie voorbeeldtrackers terug.</p></div><button class="text-button" data-action="reset">Voorbeeld herstellen</button></div></section>
  <section class="settings-card"><h2>Op je telefoon</h2><div class="setting-row"><div><strong>Narvie op je beginscherm</strong><p id="app-install-status">Open vanuit je browser of zet Narvie op je beginscherm.</p></div><a class="text-button" href="installeren.html">Installatie-uitleg</a></div><button class="button primary wide" data-action="install-app" hidden>Zet op mijn telefoon</button></section><div class="settings-note">${icon('info')} Onder Mijn tracker test je de echte leveranciersverbinding zodra de server is ingesteld. Bluetooth bedienen is nog niet aangesloten.</div>`;}

function showAdd(){
  if(state.trackers.length>=100){toast('Je hebt het maximum van 100 voorbeeldtrackers bereikt.');return;}
  ui.addedKind='bike';
  openDialog(`<div class="dialog-eyebrow">JE EERSTE STAP</div><div class="tracker-product"><div class="product-face"><span>narvie.</span><i></i></div><span class="product-shadow"></span><span class="product-spark">${icon('spark')}</span></div><h2 id="dialog-title">Een zorg minder.</h2><p>Geef je belangrijke spullen een eigen plek in Narvie.</p><div class="model-row"><span class="model-dot"></span><div><strong>Narvie Magnetic</strong><span>Voor trackers die nu MyTag gebruiken</span></div>${icon('check')}</div><div class="soft-notice">${icon('info')} Je voegt nu een voorbeeld toe. Je hebt geen code nodig en er wordt niets gekoppeld.</div><button class="button secondary wide" data-action="open-live">Mijn echte tracker testen</button><button class="button primary wide" data-action="add-next">Voorbeeldtracker toevoegen ${icon('chevron')}</button><button class="text-button dialog-cancel" data-action="close-dialog">Misschien later</button>`);
}
function addNext(){dialog.innerHTML=`<button class="icon-button dialog-close" data-action="close-dialog" aria-label="Sluiten">${icon('x')}</button><div class="dialog-eyebrow">MAAK ’M HERKENBAAR</div><h2 id="dialog-title">Waar gaat jouw<br>tracker mee naartoe?</h2><p>Kies een icoon en een naam die je direct herkent.</p><form id="add-form"><fieldset class="kind-picker"><legend>Waarvoor gebruik je de tracker?</legend>${Object.entries(kindNames).map(([k,label])=>`<label class="kind-choice"><input type="radio" name="kind" value="${k}" ${k==='bike'?'checked':''}><span>${icon(k)}<small>${label}</small></span></label>`).join('')}</fieldset><label class="field-label" for="tracker-name">Naam van je tracker</label><input class="text-input" id="tracker-name" name="name" placeholder="Bijvoorbeeld: Mijn fiets" value="Mijn fiets" maxlength="40" required autocomplete="off"><div class="field-hint">Maximaal 40 tekens. Je kunt dit later wijzigen.</div><p class="form-error" id="form-error" role="alert"></p><button class="button primary wide" type="submit">Voorbeeld bewaren ${icon('check')}</button><p class="dialog-footnote">Dit voegt alleen een voorbeeld toe op dit apparaat.</p></form>`;dialog.querySelector('#tracker-name').focus();}
function showRename(){const t=current();openDialog(`<div class="dialog-eyebrow">ZO GEVONDEN</div><h2 id="dialog-title">Maak ’m herkenbaar.</h2><p>Kies een eigen naam en pictogram.</p><form id="rename-form"><fieldset class="kind-picker"><legend>Pictogram van je tracker</legend>${Object.entries(kindNames).map(([k,label])=>`<label class="kind-choice"><input type="radio" name="kind" value="${k}" ${k===t.kind?'checked':''}><span>${icon(k)}<small>${label}</small></span></label>`).join('')}</fieldset><label class="field-label" for="rename-name">Naam van je tracker</label><input class="text-input" id="rename-name" name="name" value="${esc(t.name)}" maxlength="40" required autocomplete="off"><p class="form-error" id="form-error" role="alert"></p><button class="button primary wide" type="submit">Naam en pictogram bewaren</button></form>`);dialog.querySelector('#rename-name').select();}
function aboutDemo(){openDialog(`<div class="dialog-symbol">${icon('spark')}</div><h2 id="dialog-title">Ontdek je nieuwe app.</h2><p>Dit is de eerste klikbare versie van Narvie voor de trackers die nu MyTag gebruiken.</p><ul class="check-list"><li>${icon('check')} Overzicht en detailpagina’s bekijken</li><li>${icon('check')} Voorbeelden toevoegen en namen wijzigen</li><li>${icon('check')} Zoekfunctie, filters en instellingen proberen</li></ul><div class="soft-notice">${icon('info')} Alle locaties, batterijen en bereikstatussen zijn voorbeelden. Geluid en vernieuwen sturen geen echte opdracht. Er is nog geen klantaccount.</div><button class="button primary wide" data-action="close-dialog">Ik ga kijken ${icon('chevron')}</button>`);}
async function refresh(){if(ui.busy)return;ui.busy=true;const activePage=ui.page;renderMain();try{const result=await service.refresh(state.trackers);toast(result.message);}catch{toast('Vernieuwen lukt niet. Probeer het nog eens.');}finally{ui.busy=false;if(ui.page===activePage)renderMain();}}
function updateBoard(){document.querySelector('#board-content').innerHTML=boardContent();updateMapZoom();}
function updateMapZoom(){document.querySelectorAll('.map-stage').forEach(el=>el.style.transform=`scale(${ui.zoom})`);document.querySelectorAll('[data-action="zoom-in"]').forEach(el=>el.disabled=ui.zoom>=1.6);document.querySelectorAll('[data-action="zoom-out"]').forEach(el=>el.disabled=ui.zoom<=1);}
function applyRoute(){
  const route=parseRoute(location.hash,state.trackers);
  ui.page=route.page;if(route.selected)ui.selected=route.selected;
  history.replaceState({...history.state,narvieMyTagModal:false},'',routeFor(ui.page,ui.selected));
  renderMain();document.querySelector('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'auto'});
}
function navigate(page,{replace=false}={}){
  const hash=routeFor(page,ui.selected);
  const depth=history.state?.narvieMyTagDepth??0;
  if(location.hash!==hash)history[replace?'replaceState':'pushState']({narvieMyTagDepth:replace?depth:depth+1,narvieMyTagModal:false},'',hash);
  applyRoute();
}
function updatePWAUI(){
  const s=installationState();
  const status=document.querySelector('#connection-status');if(status)status.textContent=s.online?'':'Offline · voorbeeld';
  const update=document.querySelector('#update-banner');if(update)update.hidden=!s.updateAvailable;
  const install=document.querySelector('#app-install-status');if(install)install.textContent=s.standalone?'Geopend vanaf je beginscherm':s.registrationFailed?'Offline opslaan is nog niet gelukt. Open de app opnieuw met internet.':'Open vanuit je browser of zet Narvie op je beginscherm.';
  const button=document.querySelector('[data-action="install-app"]');if(button)button.hidden=s.standalone||!s.canPrompt;
}
window.addEventListener('narvie-mytag:pwa-state',updatePWAUI);
window.addEventListener('popstate',()=>{if(dialog.open)dialog.close();applyRoute();});

document.addEventListener('click',async e=>{
  const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action;
  if(button.tagName==='A')e.preventDefault();
  if(action.startsWith('live-')){await liveAction(action,null,renderMain);return;}
  if(action==='open-live'){await closeDialog();navigate('live');await liveAction('live-status',null,renderMain);return;}
  if(action==='nav'){navigate(button.dataset.page);if(button.dataset.page==='live')await liveAction('live-status',null,renderMain);}
  else if(action==='close-dialog')await closeDialog();
  else if(action==='about-demo')aboutDemo();
  else if(action==='add')showAdd();
  else if(action==='add-next')addNext();
  else if(action==='view'){ui.view=button.dataset.view;renderMain();}
  else if(action==='filter'){ui.filter=button.dataset.filter;updateBoard();}
  else if(action==='clear-filters'){ui.filter='all';ui.query='';renderMain();}
  else if(action==='select'||action==='details'){ui.selected=button.dataset.id;previousPage='home';navigate('detail');}
  else if(action==='marker'){ui.selected=button.dataset.id;if(ui.page==='home')updateBoard();else renderMain();}
  else if(action==='back'){if((history.state?.narvieMyTagDepth??0)>0)history.back();else navigate('home',{replace:true});}
  else if(action==='install-app'){const result=await requestInstallation();if(result.outcome==='accepted')toast('Bevestig de installatie op je telefoon.');else if(result.outcome!=='dismissed')location.href='installeren.html';}
  else if(action==='update-app')activateUpdate();
  else if(action==='rename')showRename();
  else if(action==='refresh')await refresh();
  else if(action==='ring'){const result=await service.ring(current());toast(result.message);button.classList.add('ring-demo');setTimeout(()=>button.classList.remove('ring-demo'),900);}
  else if(action==='zoom-in'){ui.zoom=Math.min(1.6,+(ui.zoom+.2).toFixed(1));updateMapZoom();}
  else if(action==='zoom-out'){ui.zoom=Math.max(1,+(ui.zoom-.2).toFixed(1));updateMapZoom();}
  else if(action==='recenter'){ui.zoom=1;updateMapZoom();}
  else if(action==='motion'){state.settings.reduceMotion=!state.settings.reduceMotion;persist();document.documentElement.classList.toggle('reduce-motion',state.settings.reduceMotion);renderMain();}
  else if(action==='notifications'){const low=state.trackers.filter(t=>t.battery<=20);openDialog(`<div class="dialog-symbol">${icon('bell')}</div><h2 id="dialog-title">Jouw meldingen</h2><p>Voorbeeldmeldingen, gebaseerd op de voorbeeldtrackers.</p>${low.length?low.map(t=>`<div class="notification-item"><span class="object-icon ${t.tone}">${icon(t.kind)}</span><div><strong>${esc(t.name)} · batterij laag</strong><span>Voorbeeld: nog ${t.battery}% batterij.</span></div></div>`).join(''):'<div class="empty-state"><h3>Helemaal bij.</h3><p>Geen voorbeeldmeldingen op dit moment.</p></div>'}<button class="button primary wide" data-action="close-dialog">Begrepen</button>`);}
  else if(action==='remove'){const t=current();openDialog(`<div class="dialog-symbol danger">${icon('trash')}</div><h2 id="dialog-title">Voorbeeld verwijderen?</h2><p>Je verwijdert ‘${esc(t.name)}’ uit dit voorbeeld. Een echte tracker of MyTag-account wordt niet gewijzigd.</p><button class="button danger-button wide" data-action="confirm-remove">Ja, voorbeeld verwijderen</button><button class="button secondary wide" data-action="close-dialog">Bewaren</button>`);}
  else if(action==='confirm-remove'){const t=current(), index=state.trackers.findIndex(v=>v.id===t.id);await closeDialog();state.trackers.splice(index,1);persist();ui.selected=state.trackers[0]?.id??null;navigate('home');toast('Voorbeeldtracker verwijderd.',()=>{if(!state.trackers.some(v=>v.id===t.id)){state.trackers.splice(index,0,t);persist();renderMain();}});}
  else if(action==='reset')openDialog(`<h2 id="dialog-title">Voorbeeld herstellen?</h2><p>Je eigen namen en toegevoegde voorbeelden worden vervangen door de oorspronkelijke drie voorbeeldtrackers.</p><button class="button primary wide" data-action="confirm-reset">Ja, voorbeeld herstellen</button><button class="button secondary wide" data-action="close-dialog">Annuleren</button>`);
  else if(action==='confirm-reset'){await closeDialog();Object.assign(state,initialState());ui.selected=state.trackers[0].id;ui.query='';ui.filter='all';ui.zoom=1;persist();shell();toast('Het oorspronkelijke voorbeeld is teruggezet.');}
});
document.addEventListener('input',e=>{if(e.target.id==='search'){ui.query=e.target.value;updateBoard();}});
document.addEventListener('change',e=>{if(e.target.name==='kind'){ui.addedKind=e.target.value;const name=dialog.querySelector('#tracker-name');if(name&&Object.values(kindNames).some(v=>name.value===`Mijn ${v.toLocaleLowerCase('nl')}`))name.value=`Mijn ${kindNames[ui.addedKind].toLocaleLowerCase('nl')}`;}});
document.addEventListener('submit',async e=>{
  if(e.target.id==='live-login-form'){e.preventDefault();const password=new FormData(e.target).get('password');e.target.reset();await liveAction('live-login',password,renderMain);return;}
  if(!['add-form','rename-form'].includes(e.target.id))return;e.preventDefault();
  const name=new FormData(e.target).get('name').trim();
  if(!name||name.length>40){dialog.querySelector('#form-error').textContent='Vul een naam in van maximaal 40 tekens.';return;}
  if(e.target.id==='add-form'){
    const t=makeDemoTracker(name,new FormData(e.target).get('kind'));await closeDialog();state.trackers.push(t);ui.selected=t.id;persist();navigate('detail');toast('Je voorbeeldtracker is toegevoegd. Er is geen echte tracker gekoppeld.');
  }else{const kind=new FormData(e.target).get('kind');await closeDialog();current().name=name;current().kind=kind;persist();renderMain();toast('Naam en pictogram bewaard op dit apparaat.');}
});
Object.assign(ui,parseRoute(location.hash,state.trackers));
history.replaceState({narvieMyTagDepth:0,narvieMyTagModal:false},'',routeFor(ui.page,ui.selected));
shell();
if(ui.page==='live')liveAction('live-status',null,renderMain);
