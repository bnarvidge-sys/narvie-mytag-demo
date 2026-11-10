import {installationState, requestInstallation} from './pwa.js';
const button=document.querySelector('#install-app');
const status=document.querySelector('#install-status');
function update(){
  const state=installationState();
  button.hidden=!state.canPrompt||state.standalone;
  status.textContent=state.standalone?'Je gebruikt Narvie al in een eigen appvenster.':!state.online?'Je bent offline. Een eerste installatie heeft internet nodig.':state.registrationFailed?'Offline opslaan is nog niet gelukt. Open de pagina opnieuw met internet.':'Geen code, account of echte tracker nodig voor dit voorbeeld.';
}
button.addEventListener('click',async()=>{
  const result=await requestInstallation();
  update();
  if(result.outcome==='dismissed')status.textContent='Nog niet toegevoegd. Je kunt het later opnieuw proberen via het browsermenu.';
  if(result.outcome==='instructions'||result.outcome==='unavailable')status.textContent='Gebruik de stappen hieronder voor jouw telefoon.';
  if(result.outcome==='accepted')status.textContent='Installatie bevestigd. Open de app vanaf het nieuwe icoon zodra je telefoon deze heeft toegevoegd.';
});
window.addEventListener('narvie-mytag:pwa-state',update);
function select(platform,focus=false){
  document.querySelectorAll('[data-platform]').forEach(tab=>{
    const active=tab.dataset.platform===platform;
    tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    document.querySelector('#'+tab.dataset.platform).hidden=!active;
    if(active&&focus)tab.focus();
  });
}
document.querySelectorAll('[data-platform]').forEach(tab=>{
  tab.addEventListener('click',()=>select(tab.dataset.platform));
  tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();select(event.key==='Home'?'iphone':event.key==='End'?'android':tab.dataset.platform==='iphone'?'android':'iphone',true);}});
});
select(/Android/i.test(navigator.userAgent)?'android':'iphone');
update();
