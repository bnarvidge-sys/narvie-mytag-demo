const base = new URL('./', import.meta.url);
let deferredPrompt = null, registration = null, reloading = false, registrationFailed = false;
export const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export function installationState() {
  return {standalone:standalone(), canPrompt:!!deferredPrompt, updateAvailable:!!registration?.waiting,
    online:navigator.onLine, secure:window.isSecureContext, registrationFailed};
}
const announce = () => window.dispatchEvent(new CustomEvent('narvie-mytag:pwa-state', {detail:installationState()}));
window.addEventListener('beforeinstallprompt', event => {event.preventDefault();deferredPrompt=event;announce();});
window.addEventListener('appinstalled', () => {deferredPrompt=null;announce();});
window.addEventListener('online', announce);
window.addEventListener('offline', announce);
export async function requestInstallation() {
  if(!deferredPrompt) return {outcome:'instructions'};
  const prompt = deferredPrompt;
  deferredPrompt = null;
  announce();
  try {await prompt.prompt();return await prompt.userChoice;}
  catch {return {outcome:'unavailable'};}
  finally {announce();}
}
export function activateUpdate() {
  if(registration?.waiting) {
    reloading=true;
    registration.waiting.postMessage({type:'NARVIE_MYTAG_ACTIVATE_UPDATE'});
  }
}
if('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(base.protocol) && !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {if(reloading)location.reload();});
  navigator.serviceWorker.register(new URL('sw.js',base), {scope:base.pathname}).then(result => {
    registration=result;
    announce();
    registration.addEventListener('updatefound', () => {
      const worker=registration.installing;
      worker?.addEventListener('statechange', () => {if(worker.state==='installed')announce();});
    });
  }).catch(() => {registrationFailed=true;announce();});
}
