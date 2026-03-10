
function parseAppData(html) {
  const marker = 'window.__APP = ';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  let bc = 0, end = start;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') bc++;
    if (html[i] === '}') bc--;
    if (bc === 0) { end = i + 1; break; }
  }
  let jsStr = html.substring(start, end);
  // Convert JS object literal to valid JSON
  jsStr = jsStr.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  jsStr = jsStr.replace(/\bundefined\b/g, 'null');
  jsStr = jsStr.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(jsStr); }
  catch(e) { return null; }
}

function parseSubLocations(html, citySlug) {
  const regex = /href="\/([a-z-]+_g\d+)\/cars_c84">([^<]+)<span>\s*\(([0-9,]+)\)/g;
  const locs = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (m[1] !== citySlug) {
      locs.push({n: m[2].trim(), s: m[1], c: parseInt(m[3].replace(/,/g, ''))});
    }
  }
  return locs;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getSubLocations') {
    fetch('https://www.olx.in/en-in/' + msg.citySlug + '/cars_c84')
      .then(r => r.text())
      .then(html => {
        const locs = parseSubLocations(html, msg.citySlug);
        sendResponse({ok: true, data: locs});
      })
      .catch(e => sendResponse({ok: false, error: e.message}));
    return true;
  }

  if (msg.action === 'getBrands') {
    fetch('https://www.olx.in/en-in/' + msg.locSlug + '/cars_c84')
      .then(r => r.text())
      .then(html => {
        const app = parseAppData(html);
        if (!app) { sendResponse({ok: true, data: {brands: [], total: 0}}); return; }
        const mk = Object.keys(app.states.items.collectionMetadata);
        if (!mk.length) { sendResponse({ok: true, data: {brands: [], total: 0}}); return; }
        const md = app.states.items.collectionMetadata[mk[0]];
        const mf = md.filters ? md.filters.find(f => f.id === 'make') : null;
        if (!mf) { sendResponse({ok: true, data: {brands: [], total: md.total || 0}}); return; }
        const brands = mf.values.map(v => ({id: v.id, name: v.name, count: v.count || 0})).sort((a, b) => b.count - a.count);
        sendResponse({ok: true, data: {brands, total: md.total || 0}});
      })
      .catch(e => sendResponse({ok: false, error: e.message}));
    return true;
  }

  if (msg.action === 'scrapePage') {
    fetch('https://www.olx.in/en-in/' + msg.locSlug + '/cars_c84?filter=make_eq_' + msg.brandId + '&page=' + msg.page)
      .then(r => r.text())
      .then(html => {
        const app = parseAppData(html);
        if (!app) { sendResponse({ok: true, data: []}); return; }
        const items = Object.values(app.states.items.elements);
        sendResponse({ok: true, data: items});
      })
      .catch(e => sendResponse({ok: false, error: e.message}));
    return true;
  }
});
