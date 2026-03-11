
// ===== CITY DATABASE =====
const CITIES = [
  { name: "Mumbai", mask: "mumbai" }, { name: "Delhi", mask: "delhi" }, { name: "Bangalore", mask: "bangalore" },
  { name: "Chennai", mask: "chennai" }, { name: "Hyderabad", mask: "hyderabad" }, { name: "Kolkata", mask: "kolkata" },
  { name: "Pune", mask: "pune" }, { name: "Ahmedabad", mask: "ahmedabad" }, { name: "Coimbatore", mask: "coimbatore" },
  { name: "Jaipur", mask: "jaipur" }, { name: "Lucknow", mask: "lucknow" }, { name: "Chandigarh", mask: "chandigarh" },
  { name: "Kochi", mask: "kochi" }, { name: "Indore", mask: "indore" }, { name: "Nagpur", mask: "nagpur" },
  { name: "Gurgaon", mask: "gurgaon" }, { name: "Noida", mask: "noida" }, { name: "Goa", mask: "goa" },
  { name: "Surat", mask: "surat" }, { name: "Vadodara", mask: "vadodara" }, { name: "Bhopal", mask: "bhopal" },
  { name: "Patna", mask: "patna" }, { name: "Visakhapatnam", mask: "visakhapatnam" }, { name: "Mysore", mask: "mysore" },
  { name: "Mangalore", mask: "mangalore" }, { name: "Thiruvananthapuram", mask: "thiruvananthapuram" },
  { name: "Bhubaneswar", mask: "bhubaneswar" }, { name: "Guwahati", mask: "guwahati" },
  { name: "Dehradun", mask: "dehradun" }, { name: "Ranchi", mask: "ranchi" }, { name: "Raipur", mask: "raipur" },
  { name: "Vijayawada", mask: "vijayawada" }, { name: "Madurai", mask: "madurai" }, { name: "Aurangabad", mask: "aurangabad" },
  { name: "Nashik", mask: "nashik" }, { name: "Jabalpur", mask: "jabalpur" }, { name: "Ludhiana", mask: "ludhiana" },
  { name: "Rajkot", mask: "rajkot" }, { name: "Amritsar", mask: "amritsar" }, { name: "Faridabad", mask: "faridabad" },
  { name: "Ghaziabad", mask: "ghaziabad" }, { name: "Agra", mask: "agra" }, { name: "Varanasi", mask: "varanasi" },
  { name: "Meerut", mask: "meerut" }, { name: "Jodhpur", mask: "jodhpur" }, { name: "Udaipur", mask: "udaipur" },
  { name: "Salem", mask: "salem" }, { name: "Tiruchirappalli", mask: "tiruchirappalli" },
  { name: "Hubli", mask: "hubli" }, { name: "Belgaum", mask: "belgaum" }, { name: "Thrissur", mask: "thrissur" },
  { name: "Kozhikode", mask: "kozhikode" }, { name: "Navi Mumbai", mask: "navi-mumbai" },
  { name: "Thane", mask: "thane" }, { name: "Kolhapur", mask: "kolhapur" }, { name: "Siliguri", mask: "siliguri" },
  { name: "Kanpur", mask: "kanpur" }, { name: "Allahabad", mask: "allahabad" }, { name: "Bareilly", mask: "bareilly" },
  { name: "Jalandhar", mask: "jalandhar" }, { name: "Jammu", mask: "jammu" }, { name: "Shimla", mask: "shimla" },
  { name: "Gwalior", mask: "gwalior" }, { name: "Dhanbad", mask: "dhanbad" }
];

let scrapedCars = [];
let isRunning = false;
let shouldStop = false;
let selectedCityMask = '';
let selectedCityName = '';
let detectedTotalPages = 0;
let detectedTotalCars = 0;
let currentTabId = null;
let currentToken = '';
let currentCityId = '';

const $ = id => document.getElementById(id);

function log(msg, type) {
  const p = document.createElement('p');
  if (type) p.className = type;
  p.textContent = (type === 'err' ? '\u2717 ' : type === 'ok' ? '\u2713 ' : '\u25B6 ') + msg;
  $('logBox').appendChild(p);
  $('logBox').scrollTop = $('logBox').scrollHeight;
}

function updateProgress(cur, tot, text) {
  const pct = tot > 0 ? Math.round((cur / tot) * 100) : 0;
  $('progressFill').style.width = pct + '%';
  $('progressText').textContent = text || (pct + '%');
}

// ========== INIT ==========
(async function init() {
  // Find any carwale tab
  const tabs = await chrome.tabs.query({});
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let target = (activeTab && activeTab.url && activeTab.url.includes('carwale.com')) ? activeTab : tabs.find(t => t.url && t.url.includes('carwale.com'));

  if (!target) {
    log('No CarWale tab found. Open carwale.com first.', 'err');
    return;
  }
  currentTabId = target.id;

  // Auto-detect city from URL if on a used cars page
  if (target.url.includes('/used/')) {
    const m = target.url.match(/\/used\/([\w-]+)\//);
    if (m) {
      const mask = m[1];
      const found = CITIES.find(c => c.mask === mask);
      if (found) {
        selectCity(found.name, found.mask);
      } else {
        // Unknown city in URL — still use it
        const name = mask.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        selectCity(name, mask);
      }
    }
  }

  renderCities(CITIES);
  log('Ready. Select a city or auto-detected from tab.', 'info');
})();

// ========== RENDER CITY BUTTONS ==========
function renderCities(list) {
  const grid = $('cityGrid');
  grid.innerHTML = '';
  list.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'city-btn' + (c.mask === selectedCityMask ? ' active' : '');
    btn.textContent = c.name;
    btn.addEventListener('click', () => selectCity(c.name, c.mask));
    grid.appendChild(btn);
  });
}

// ========== SEARCH FILTER ==========
$('citySearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = q ? CITIES.filter(c => c.name.toLowerCase().includes(q)) : CITIES;
  renderCities(filtered);

  // If user types a city not in list, allow custom input
  if (filtered.length === 0 && q.length > 2) {
    const grid = $('cityGrid');
    const btn = document.createElement('button');
    btn.className = 'city-btn';
    btn.textContent = '\u2795 Use "' + q + '" as city';
    btn.addEventListener('click', () => {
      const mask = q.replace(/\s+/g, '-').toLowerCase();
      const name = q.replace(/\b\w/g, c => c.toUpperCase());
      selectCity(name, mask);
    });
    grid.appendChild(btn);
  }
});

// ========== SELECT CITY & AUTO-DETECT PAGES ==========
async function selectCity(name, mask) {
  selectedCityName = name;
  selectedCityMask = mask;

  // Update UI
  document.querySelectorAll('.city-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.city-btn').forEach(b => { if (b.textContent === name) b.classList.add('active'); });

  $('detectBox').style.display = 'block';
  $('selectedCity').textContent = name;
  $('totalPagesTag').textContent = 'detecting...';
  $('totalCarsTag').textContent = 'detecting...';
  $('startBtn').disabled = true;
  log('Detecting cars in ' + name + '...', 'info');

  // Fetch page 1 via API to get totalCount
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: detectCityInfo,
      args: [mask]
    });

    const info = res[0].result;
    detectedTotalCars = info.totalCars;
    detectedTotalPages = info.totalPages;
    currentToken = info.token || '';
    currentCityId = info.cityId || '0';

    $('totalPagesTag').textContent = detectedTotalPages + ' pages';
    $('totalCarsTag').textContent = detectedTotalCars.toLocaleString() + ' cars';
    $('pageProgress').textContent = '0/' + detectedTotalPages;
    $('startBtn').disabled = false;

    if (detectedTotalCars === 0) {
      log('No cars found in ' + name + '. Try another city.', 'err');
      $('startBtn').disabled = true;
    } else {
      log(name + ': ' + detectedTotalCars + ' cars, ' + detectedTotalPages + ' pages', 'ok');
    }
  } catch (err) {
    log('Error detecting: ' + err.message, 'err');
  }
}

// ========== INJECTED: Detect city info via API ==========
function detectCityInfo(cityMask) {
  let token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
  let cityId = "0";
  const m = document.body.innerHTML.match(/"cityId":\s*"?(\d+)"?/) || document.body.innerHTML.match(/"cityMaskId":\s*"?(\d+)"?/);
  if (m) { cityId = m[1]; }

  return fetch('/api/used/search/v1?cityMakeRootName=' + cityMask + '&url=/used/' + cityMask + '/')
    .then(r => r.json())
    .then(data => {
      const total = data.usedSearch?.totalCount || 0;
      let pages = Math.ceil(total / 24);
      if (pages < 1) pages = 1;
      return { totalCars: total, totalPages: pages, token: token, cityId: cityId };
    })
    .catch(() => ({ totalCars: 0, totalPages: 0, token: '', cityId: '' }));
}

// ========== START SCRAPING ==========
$('startBtn').addEventListener('click', async () => {
  if (!currentTabId || !selectedCityMask || detectedTotalPages < 1) {
    log('Select a valid city first.', 'err');
    return;
  }

  isRunning = true;
  shouldStop = false;
  scrapedCars = [];
  let totalImages = 0;
  $('startBtn').style.display = 'none';
  $('stopBtn').style.display = 'block';
  $('jsonBtn').disabled = true;
  $('csvBtn').disabled = true;

  log('Scraping ' + selectedCityName + ' (' + detectedTotalPages + ' pages)...', 'info');

  try {
    for (let page = 1; page <= detectedTotalPages; page++) {
      if (shouldStop) { log('Stopped at page ' + page, 'err'); break; }

      const pageUrl = page === 1
        ? '/used/' + selectedCityMask + '/'
        : '/used/' + selectedCityMask + '/page-' + page + '/';
      const apiUrl = '/api/used/search/v1?cityMakeRootName=' + selectedCityMask + '&url=' + pageUrl;

      const res = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: fetchCarWalePage,
        args: [apiUrl, page, currentToken, currentCityId, (page - 1) * 24, scrapedCars.length || 32]
      });

      const cars = res[0].result || [];
      cars.forEach(c => {
        const fingerprint = [c.carName, c.priceNumeric, c.makeYear, c.kmsNumeric].join('|');
        const isUrlDup = scrapedCars.some(existing => existing.carUrl === c.carUrl);
        const isLogicalDup = scrapedCars.some(existing =>
          [existing.carName, existing.priceNumeric, existing.makeYear, existing.kmsNumeric].join('|') === fingerprint
        );
        const isOtherCity = c.cityName && selectedCityName && c.cityName.toLowerCase() !== selectedCityName.toLowerCase();

        if (!isUrlDup && !isLogicalDup && !isOtherCity) {
          totalImages += (c.images || []).length;
          scrapedCars.push(c);
        }
      });

      $('carCount').textContent = scrapedCars.length;
      $('pageProgress').textContent = page + '/' + detectedTotalPages;
      $('imgCount').textContent = totalImages;
      updateProgress(page, detectedTotalPages, 'Page ' + page + '/' + detectedTotalPages);

      if (page % 25 === 0 || page === detectedTotalPages) {
        log('Page ' + page + ': ' + scrapedCars.length + ' cars', 'ok');
      }
      if (cars.length === 0 && page > 3) { log('No more results. Done.', 'info'); break; }
    }

    scrapedCars.forEach((c, i) => c.sr_no = i + 1);
    log('\u2705 DONE! ' + scrapedCars.length + ' cars | ' + totalImages + ' images', 'ok');
    updateProgress(100, 100, 'Complete! ' + scrapedCars.length + ' cars');
    $('jsonBtn').disabled = false;
    $('csvBtn').disabled = false;
  } catch (err) {
    log('Error: ' + err.message, 'err');
  }

  isRunning = false;
  $('startBtn').style.display = 'block';
  $('stopBtn').style.display = 'none';
});

$('stopBtn').addEventListener('click', () => { shouldStop = true; log('Stopping...', 'err'); });

// ========== INJECTED: Fetch one page ==========
function fetchCarWalePage(apiUrl, page, token, cityId, lcr, stockfetched) {
  let fetchPromise;
  if (page === 1 || !token || !cityId || cityId === "0") {
    fetchPromise = fetch(apiUrl).then(r => r.json()).then(data => data.usedSearch?.stocks || []);
  } else {
    fetchPromise = fetch('/api/used/stocks/filters/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'serverdomain': 'CarWale',
        'requestverificationtoken': token
      },
      body: JSON.stringify({
        pn: page, city: cityId, ps: "24", sc: "-1", so: "-1",
        lcr: lcr, shouldfetchnearbycars: "False", stockfetched: String(stockfetched), excludestocks: ""
      })
    }).then(r => r.json()).then(data => data.stocks || []);
  }

  return fetchPromise.catch(() => []).then(stocks => {
    return stocks.map(s => ({
      carName: s.carName || '', makeYear: s.makeYear || '', price: s.price || '',
      priceNumeric: s.priceNumeric || '', kms: s.km || '', kmsNumeric: s.kmNumeric || '',
      fuel: s.fuel || '', additionalFuel: s.additionalFuel || '', transmission: s.transmission || '',
      location: (s.areaName || '') + (s.areaName && s.cityName ? ', ' : '') + (s.cityName || ''),
      cityName: s.cityName || '', areaName: s.areaName || '',
      carUrl: s.url ? 'https://www.carwale.com' + s.url : '',
      makeName: s.makeName || '', modelName: s.modelName || '', versionName: s.versionName || '',
      rootName: s.rootName || '', bodyStyleId: s.bodyStyleId || '',
      sellerType: s.sellerType || '', sellerName: s.sellerName || '',
      ownership: s.ownersId === 1 ? 'First Owner' : s.ownersId === 2 ? 'Second Owner' : s.ownersId === 3 ? 'Third Owner+' : s.ownersId === 6 ? 'Unregistered' : String(s.ownersId || ''),
      emi: s.emiFormatted || '', seatingCapacity: s.seatingCapacity || '',
      overallCondition: s.overAllCondition || '', certProgId: s.certProgId || 0,
      isPremium: !!s.isPremium, isTrusted: !!s.isTrusted,
      images: (s.stockImages || []).filter(u => typeof u === 'string' && u.startsWith('http'))
    }));
  });
}

// ========== DOWNLOADS ==========
$('jsonBtn').addEventListener('click', () => {
  const fn = 'carwale_' + selectedCityMask + '.json';
  const json = JSON.stringify(scrapedCars, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  chrome.downloads.download({ url: URL.createObjectURL(blob), filename: fn, saveAs: true });
  log('JSON: ' + fn + ' (' + Math.round(json.length / 1024) + 'KB)', 'ok');
});

$('csvBtn').addEventListener('click', () => {
  function esc(v) { if (!v && v !== 0) return ''; v = String(v); if (v.includes(',') || v.includes('"') || v.includes('\n')) return '"' + v.replace(/"/g, '""') + '"'; return v; }
  const h = ['Sr_No', 'Car_Name', 'Make_Year', 'Price', 'Price_Numeric', 'KMs', 'KMs_Numeric', 'Fuel', 'Additional_Fuel', 'Transmission', 'Location', 'City', 'Area', 'Car_URL', 'Make', 'Model', 'Version', 'Root_Name', 'Body_Style', 'Seller_Type', 'Seller_Name', 'Ownership', 'EMI', 'Seating_Capacity', 'Overall_Condition', 'Certified', 'Premium', 'Trusted', 'Image_1', 'Image_2', 'Image_3', 'Image_4', 'Image_5', 'Image_6', 'Image_7', 'Image_8', 'Image_9', 'Image_10', 'Image_11', 'Image_12', 'Image_13', 'Image_14', 'Image_15', 'Image_16', 'Image_17', 'Image_18', 'Image_19', 'Image_20'];
  let csv = h.join(',') + '\n';
  scrapedCars.forEach(c => {
    const im = c.images || [];
    csv += [c.sr_no, esc(c.carName), c.makeYear, esc(c.price), esc(c.priceNumeric), esc(c.kms), esc(c.kmsNumeric), esc(c.fuel), esc(c.additionalFuel), esc(c.transmission), esc(c.location), esc(c.cityName), esc(c.areaName), esc(c.carUrl), esc(c.makeName), esc(c.modelName), esc(c.versionName), esc(c.rootName), esc(c.bodyStyleId), esc(c.sellerType), esc(c.sellerName), esc(c.ownership), esc(c.emi), esc(c.seatingCapacity), esc(c.overallCondition), esc(c.certProgId), c.isPremium, c.isTrusted, ...Array.from({ length: 20 }, (_, i) => esc(im[i] || ''))].join(',') + '\n';
  });
  const fn = 'carwale_' + selectedCityMask + '.csv';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  chrome.downloads.download({ url: URL.createObjectURL(blob), filename: fn, saveAs: true });
  log('CSV: ' + fn + ' (' + Math.round(csv.length / 1024) + 'KB)', 'ok');
});
