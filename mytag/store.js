export const STORAGE_KEY = 'narvie-mytag:demo:v1';
const KINDS = ['bike', 'bag', 'suitcase', 'key', 'car'];
const TONES = ['green', 'clay', 'blue', 'sand'];
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function initialState(now = Date.now()) {
  return {
    version: 1, settings: {reduceMotion: false},
    trackers: [
      {id:'demo-bike', name:'Mijn fiets', kind:'bike', tone:'green', battery:88, nearby:true, place:'Bij het station', area:'Heerhugowaard', observedAt:now-4*60000, x:61, y:38, demo:true},
      {id:'demo-bag', name:'Mijn tas', kind:'bag', tone:'clay', battery:64, nearby:false, place:'In het centrum', area:'Alkmaar', observedAt:now-28*60000, x:35, y:66, demo:true},
      {id:'demo-suitcase', name:'Mijn koffer', kind:'suitcase', tone:'blue', battery:19, nearby:false, place:'Nog geen locatie', area:'', observedAt:null, x:null, y:null, demo:true},
    ],
  };
}

export function validateState(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.trackers) || input.trackers.length > 100) return null;
  const seen = new Set();
  const trackers = [];
  for (const t of input.trackers) {
    if (!t || typeof t.id !== 'string' || t.id.length > 100 || seen.has(t.id) || t.demo !== true) return null;
    if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 40 || !KINDS.includes(t.kind) || !TONES.includes(t.tone)) return null;
    if (!Number.isInteger(t.battery) || t.battery < 0 || t.battery > 100 || typeof t.nearby !== 'boolean') return null;
    if (t.observedAt !== null && (!Number.isFinite(t.observedAt) || t.observedAt < 0)) return null;
    if (typeof t.place !== 'string' || t.place.length > 100 || typeof t.area !== 'string' || t.area.length > 100) return null;
    if (t.x !== null && (!Number.isFinite(t.x) || t.x < 0 || t.x > 100)) return null;
    if (t.y !== null && (!Number.isFinite(t.y) || t.y < 0 || t.y > 100)) return null;
    if ((t.x === null) !== (t.y === null)) return null;
    seen.add(t.id);
    trackers.push({...t, name:t.name.trim()});
  }
  return {version:1, trackers, settings:{reduceMotion:input.settings?.reduceMotion === true}};
}

export function loadState(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const value = target.getItem(STORAGE_KEY) ?? target.getItem('narvie-mytag-demo-v1');
    return validateState(JSON.parse(value)) ?? initialState();
  }
  catch { return initialState(); }
}
export function saveState(state, storage) {
  try { (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export function ageLabel(timestamp, now = Date.now()) {
  if (timestamp === null) return 'Nog geen locatie';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'Zojuist gezien';
  if (minutes < 60) return `${minutes} min geleden`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} uur geleden`;
  return `${Math.floor(minutes / 1440)} dagen geleden`;
}
export function filterTrackers(trackers, query, filter = 'all') {
  const needle = query.trim().toLocaleLowerCase('nl');
  return trackers.filter(t => `${t.name} ${t.place} ${t.area}`.toLocaleLowerCase('nl').includes(needle))
    .filter(t => filter === 'all' || (filter === 'nearby' ? t.nearby : t.battery <= 20));
}
export function makeDemoTracker(name, kind = 'key', now = Date.now()) {
  if (!name.trim() || name.trim().length > 40) throw new Error('Geef je tracker een naam van maximaal 40 tekens.');
  if (!KINDS.includes(kind)) throw new Error('Kies een geldig type.');
  return {id:`demo-${crypto.randomUUID()}`, name:name.trim(), kind, tone:'sand', battery:100, nearby:false, place:'Nog geen locatie', area:'', observedAt:null, x:null, y:null, demo:true};
}
