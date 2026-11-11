import {escapeHtml} from './store.js';
const liveErrors={
  SERVER_UNAVAILABLE:'De testserver is nog niet bereikbaar. De voorbeeldschermen blijven wel werken.',
  OWNER_LOGIN_NOT_CONFIGURED:'De persoonlijke testaanmelding is nog niet ingesteld op de server.',
  LOGIN_REJECTED:'Het testwachtwoord klopt niet.',LOGIN_REQUIRED:'Meld je opnieuw aan om je echte tracker te bekijken.',
  LOGIN_RATE_LIMITED:'Te veel aanmeldpogingen. Probeer het over 15 minuten opnieuw.',
  TOO_MANY_SESSIONS:'Er zijn te veel testsessies geopend. Probeer het later opnieuw.',
  SERVER_NOT_CONFIGURED:'De leverancierskoppeling is nog niet volledig ingesteld op de server.',
  VENDOR_UNREACHABLE:'De leveranciersserver is niet bereikbaar via HTTPS. Er is geen locatie ontvangen.',
  VENDOR_HTTP_ERROR:'De leveranciersserver gaf een fout. Er is geen locatie ontvangen.',
  VENDOR_ACCESS_REJECTED:'De leverancier heeft het verzoek geweigerd. Controleer token, SN-toewijzing, tijdinstelling en berichtcodering.',
  VENDOR_ENCODING_UNVERIFIED:'Het leveranciersantwoord kon niet worden ontsleuteld. De berichtcodering moet worden gecontroleerd.',
  VENDOR_RESPONSE_INVALID:'Het leveranciersantwoord heeft niet het verwachte formaat.',
  WAIT_BEFORE_RETRY:'Wacht 15 seconden voordat je opnieuw een verzoek doet.',
  VENDOR_HTTPS_REQUIRED:'Een bevestigde HTTPS-verbinding met de leverancier is nodig.',
  VENDOR_HTTP_TEST_NOT_APPROVED:'De leverancier biedt alleen HTTP voor de test. De tijdelijke testverbinding is nog niet vrijgegeven.',
  TRACKER_ASSIGNMENT_REQUIRED:'We wachten op het echte serienummer en de bevestiging dat de leverancier dit aan ons testtoken heeft toegewezen.',
};
const missingNames={owner_login:'Persoonlijke testaanmelding',vendor_token:'Leverancierstoken op de server',tracker_sn:'Echt API-serienummer van de leverancier',tracker_assignment:'Bevestiging van toewijzing aan ons testtoken',encoding_profile:'Berichtcodering',request_timezone:'Tijdzone voor verzoeken',timestamp_unit:'Tijdseenheid van locatiegegevens',api_version:'API-versie',vendor_https_url:'Leveranciersserveradres',http_test_approval:'Toestemming voor de tijdelijke HTTP-testverbinding'};
export class LiveTrackerClient {
  constructor({fetchImpl=(...args)=>fetch(...args),base='/api/mytag/'}={}) {this.fetch=fetchImpl;this.base=base;this.session=null;}
  async request(path,method='GET',body) {
    const headers={Accept:'application/json'};if(this.session)headers.Authorization=`Bearer ${this.session}`;
    if(body!==undefined)headers['Content-Type']='application/json';
    let response,data;
    try {
      response=await this.fetch(new URL(path,new URL(this.base,location.href)),{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(path==='status'?75_000:35_000)});
      if(!(response.headers.get('content-type')||'').includes('application/json'))throw Error();
      data=await response.json();
    }catch {throw new Error(liveErrors.SERVER_UNAVAILABLE);}
    if(!response.ok) {
      if(response.status===401)this.session=null;
      throw new Error(liveErrors[data.error]||'De testverbinding is niet gelukt. Er is geen nieuwe locatie ontvangen.');
    }
    return data;
  }
  async login(password) {const result=await this.request('session','POST',{password});this.session=result.session;return result;}
  async logout() {try {if(this.session)await this.request('logout','POST');}finally{this.session=null;}}
}
const testState={status:null,tracker:null,location:null,error:'',busy:false,checked:false,probe:false};
export const liveClient=new LiveTrackerClient({base:location.hostname==='narvie-mytag-demo.onrender.com'?'https://narvie-mytag-test.onrender.com/api/mytag/':'/api/mytag/'});
const batteryNames={unknown:'Onbekend',high:'Hoog',medium:'Gemiddeld',low:'Laag',depleted:'Leeg'};
export function liveScreen() {
  const s=testState,esc=escapeHtml,loggedIn=!!liveClient.session,o=s.location?.observation;
  return `<section class="page-heading"><div><div class="eyebrow">JOUW ECHTE TRACKER</div><h1>De eerste verbinding<span>.</span></h1><p>Afgeschermde test met één Narvie-tracker. Hier staan geen voorbeeldlocaties.</p></div></section>
  <section class="settings-card live-card" aria-busy="${s.busy}"><div class="live-state-label">${o?'Locatie ontvangen van leverancier':s.status?.ready?'Klaar om verbinding te testen':'Nog geen echte verbinding'}</div>
  <h2>${esc(s.tracker?.name||'Mijn Narvie-testtracker')}</h2><p>Beoogd model: Magnetic · voor MyTag-appmodellen</p>
  ${s.busy?'<p role="status">Verbinding controleren… De gratis testserver starten kan ongeveer één minuut duren.</p>':''}
  ${s.error?`<p class="live-error" role="alert">${esc(s.error)}</p>`:''}
  ${!s.checked?'<p>Controleer eerst of de testserver beschikbaar is.</p>':''}
  ${s.status&&!s.status.ready?`<div class="soft-notice">De server mist nog instellingen:<ul>${s.status.missing.map(key=>`<li>${esc(missingNames[key]||'Serverinstelling')}</li>`).join('')}</ul></div>`:''}
  ${!loggedIn?`<form id="live-login-form"><label class="field-label" for="live-password">Persoonlijk testwachtwoord</label><input class="text-input" id="live-password" name="password" type="password" minlength="12" maxlength="256" autocomplete="current-password" required ${!s.status?.loginConfigured||s.busy?'disabled':''}><p class="field-hint">Dit is een eigen Narvie-testwachtwoord. Gebruik hier geen MyTag-wachtwoord, tracker-code of leverancierstoken.</p><button class="button primary" type="submit" ${!s.status?.loginConfigured||s.busy?'disabled':''}>Aanmelden voor de test</button></form>`:`<dl class="live-values"><dt>Auth-code</dt><dd>${esc(s.tracker?.authCode||'Nog niet ingesteld')}</dd><dt>API-serienummer</dt><dd>${esc(s.tracker?.sn||'Wachten op leverancier')}</dd></dl><p class="field-hint">De Auth-code is geen API-serienummer. Laat de tracker in MyTag gekoppeld totdat de leverancier het serienummer heeft toegewezen en toestemming geeft om te ontkoppelen.</p><div class="live-actions"><button class="button primary" data-action="live-location" ${s.busy||!s.status?.ready?'disabled':''}>${s.busy?'Verbinding testen…':'Echte locatie opvragen'}</button><button class="button secondary" data-action="live-probe" ${s.busy||!s.status?.canProbe?'disabled':''}>Servertoegang testen</button><button class="text-button" data-action="live-logout" ${s.busy?'disabled':''}>Afmelden</button></div>`}
  <button class="text-button" data-action="live-status" ${s.busy?'disabled':''}>Serverstatus controleren</button>
  ${s.probe?'<p class="soft-notice" role="status">De leveranciersserver accepteert het token. Hiermee is toegang tot deze tracker nog niet bewezen.</p>':''}
  </section>
  ${s.location?`<section class="settings-card live-card" aria-live="polite"><h2>${o?'Laatste echte waarneming':'Nog geen bruikbare locatie'}</h2>${o?`<dl class="live-values"><dt>Waargenomen</dt><dd>${esc(new Date(o.observedAt).toLocaleString('nl-NL'))}</dd><dt>Coördinaten</dt><dd>${esc(o.latitude)}, ${esc(o.longitude)}</dd><dt>Nauwkeurigheid</dt><dd>${o.accuracy?esc(o.accuracy)+' meter (API)':'Onbekend'}</dd><dt>Batterij volgens netwerk</dt><dd>${esc(batteryNames[o.batteryCategory]||'Onbekend')} · geen percentage</dd></dl>${o.stale?'<p class="live-error">Deze waarneming is ouder dan 24 uur.</p>':''}<a class="button secondary" href="https://maps.apple.com/?ll=${encodeURIComponent(o.latitude+','+o.longitude)}&q=Narvie%20tracker" target="_blank" rel="noopener noreferrer">Open deze locatie in Kaarten</a>`:'<p>Er is nog geen bruikbare waarneming ontvangen. Dat bewijst niet dat de tracker gekoppeld of buiten bereik is. Er wordt geen voorbeeldlocatie ingevuld.</p>'}<p class="field-hint">Opgevraagd: ${esc(new Date(s.location.retrievedAt).toLocaleString('nl-NL'))}. Dit is niet het tijdstip van de locatie.</p></section>`:''}
  <section class="settings-card live-card"><h2>Wat deze test doet</h2><p>Locatie opvragen via de leveranciersserver zodra de toegang werkt. Locaties en de aanmeldsessie worden niet in de browseropslag bewaard. Na opnieuw openen meld je je weer aan.</p><p>Lokaal laten piepen, Bluetooth-batterij uitlezen en achtergrondverbindingen zijn nog niet aangesloten. Voor Bluetooth op iPhone is een native appmodule nodig.</p><p>Voor deze sampletest vraagt de leverancier een vooraf in MyTag geactiveerde tracker. Voor toekomstige batches zegt de leverancier serienummers tijdens productie te kunnen toewijzen.</p>${s.status?.vendorTransport==='http-test'?'<p class="live-error">De leveranciers-testserver biedt alleen HTTP. Bij een vrijgegeven sampletest is de verbinding naar de leverancier niet met TLS beveiligd.</p>':''}</section>`;
}
export async function liveAction(action,password,render) {
  if(testState.busy)return;
  testState.busy=true;testState.error='';render();
  try {
    if(action==='live-status') {testState.status=await liveClient.request('status');testState.checked=true;}
    if(action==='live-login') {await liveClient.login(password);testState.tracker=await liveClient.request('tracker');}
    if(action==='live-logout') {await liveClient.logout();testState.tracker=null;testState.location=null;testState.probe=false;}
    if(action==='live-probe') {await liveClient.request('probe','POST');testState.probe=true;}
    if(action==='live-location') {testState.location=await liveClient.request('location','POST');}
  }catch(error){testState.error=error.message;if(!liveClient.session){testState.location=null;testState.tracker=null;testState.probe=false;}}
  finally {testState.busy=false;render();}
}
