const pages = {home:'trackers', help:'hulp', settings:'instellingen'};
export function routeFor(page, id) {
  return page === 'detail' ? '#tracker/' + encodeURIComponent(id) : '#' + (pages[page] || pages.home);
}
export function parseRoute(hash, trackers) {
  const path = (hash || '').replace(/^#/, '');
  if(path.startsWith('tracker/')) {
    try {
      const id = decodeURIComponent(path.slice(8));
      if(trackers.some(t => t.id === id)) return {page:'detail', selected:id};
    } catch { /* Malformed links return safely to the overview. */ }
  }
  return {page:Object.keys(pages).find(key => pages[key] === path) || 'home'};
}
