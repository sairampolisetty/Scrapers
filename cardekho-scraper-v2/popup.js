
let scrapedCars = [];
let isRunning = false;
let shouldStop = false;
let detectedCity = '';
let detectedBaseUrl = '';
let detectedTotalPages = 0;
let currentTabId = null;

const $ = id => document.getElementById(id);

// ========== INIT: Auto-detect city & pages when popup opens ==========
(async function init() {
  log('Initializing...', 'info');

  // Get ALL tabs, find any cardekho used-cars tab
  const tabs = await chrome.tabs.query({});
  let targetTab = null;

  // First try active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.url && activeTab.url.includes('cardekho.com/used-cars')) {
    targetTab = activeTab;
  }

  // If active tab isn't cardekho, search all tabs
  if (!targetTab) {
    targetTab = tabs.find(t => t.url && t.url.includes('cardekho.com/used-cars'));
  }

  if (!targetTab) {
    $('warnBox').style.display = 'block';
    $('detectBox').style.display = 'none';
    log('No CarDekho used cars tab found. Open one first!', 'err');
    $('startBtn').disabled = true;
    return;
  }

  currentTabId = targetTab.id;
  log('Found CarDekho tab: ' + targetTab.url.substring(0, 60) + '...', 'info');

  // Inject detection script
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: detectPageInfo
    });

    const info = results[0].result;
    detectedCity = info.city;
    detectedBaseUrl = info.baseUrl;
    detectedTotalPages = info.totalPages;

    $('cityName').textContent = detectedCity || 'Unknown City';
    $('baseUrl').textContent = detectedBaseUrl;
    $('totalPages').textContent = detectedTotalPages;
    $('estCars').textContent = '~' + (detectedTotalPages * 20);
    $('pageProgress').textContent = '0/' + detectedTotalPages;

    log('City: ' + detectedCity + ' | Pages: ' + detectedTotalPages, 'ok');
  } catch (err) {
    log('Detection error: ' + err.message, 'err');
    $('warnBox').style.display = 'block';
    $('startBtn').disabled = true;
  }
})();

// ========== Detection function injected into page ==========
function detectPageInfo() {
  const url = window.location.href;

  // Extract base URL (remove /page-X if present)
  let baseUrl = url.replace(/\/page-\d+/, '').split('?')[0].replace(/\/$/, '');

  // Detect city from URL: /used-cars+in+{city}
  let city = 'Unknown';
  const cityMatch = baseUrl.match(/used-cars\+in\+([\w-]+)/i);
  if (cityMatch) {
    city = cityMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Detect total pages from pagination text
  let totalPages = 1;

  // Method 1: Look for "Page X of Y" text
  const allText = document.body.textContent;
  const pageMatch = allText.match(/Page\s*\d+\s*of\s*(\d+)/i);
  if (pageMatch) {
    totalPages = parseInt(pageMatch[1]);
  }

  // Method 2: Look for pagination links
  if (totalPages <= 1) {
    const links = document.querySelectorAll('a[href*="/page-"]');
    links.forEach(link => {
      const m = link.href.match(/\/page-(\d+)/);
      if (m) {
        const p = parseInt(m[1]);
        if (p > totalPages) totalPages = p;
      }
    });
  }

  // Method 3: Look for total cars count and estimate pages
  if (totalPages <= 1) {
    const countMatch = allText.match(/(\d+)\s*Used\s*Cars/i);
    if (countMatch) {
      const totalCars = parseInt(countMatch[1]);
      totalPages = Math.ceil(totalCars / 20);
    }
  }

  return { city, baseUrl, totalPages };
}

// ========== Logging ==========
function log(msg, type) {
  const p = document.createElement('p');
  if (type) p.className = type;
  p.textContent = (type === 'err' ? '✗ ' : type === 'ok' ? '✓ ' : '▶ ') + msg;
  $('logBox').appendChild(p);
  $('logBox').scrollTop = $('logBox').scrollHeight;
}

function updateProgress(current, total, text) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  $('progressFill').style.width = pct + '%';
  $('progressText').textContent = text || (pct + '%');
}


// ========== START SCRAPING ==========
$('startBtn').addEventListener('click', async () => {
  if (!currentTabId || !detectedBaseUrl || detectedTotalPages < 1) {
    log('Cannot start. No valid CarDekho page detected.', 'err');
    return;
  }

  isRunning = true;
  shouldStop = false;
  scrapedCars = [];
  $('startBtn').style.display = 'none';
  $('stopBtn').style.display = 'block';
  $('jsonBtn').disabled = true;
  $('csvBtn').disabled = true;

  log('Starting scrape: ' + detectedCity + ' (' + detectedTotalPages + ' pages)', 'info');

  try {
    // ===== PHASE 1: Scrape all listing pages =====
    for (let page = 1; page <= detectedTotalPages; page++) {
      if (shouldStop) { log('Stopped by user at page ' + page, 'err'); break; }

      const pageUrl = page === 1 ? detectedBaseUrl : detectedBaseUrl + '/page-' + page;

      const res = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: scrapeListingPage,
        args: [pageUrl]
      });

      const cars = res[0].result || [];
      scrapedCars.push(...cars);
      $('carCount').textContent = scrapedCars.length;
      $('pageProgress').textContent = page + '/' + detectedTotalPages;
      updateProgress(page, detectedTotalPages, 'Listings: Page ' + page + '/' + detectedTotalPages);

      if (page % 10 === 0 || page === detectedTotalPages) {
        log('Page ' + page + '/' + detectedTotalPages + ' — ' + scrapedCars.length + ' cars', 'ok');
      }
    }

    log('Listing scrape done: ' + scrapedCars.length + ' cars found', 'ok');

    // ===== PHASE 2: Fetch inner details =====
    if ($('fetchInner').checked && !shouldStop && scrapedCars.length > 0) {
      log('Fetching inner details for ' + scrapedCars.length + ' cars...', 'info');
      const batchSize = 10;
      let done = 0;

      for (let i = 0; i < scrapedCars.length; i += batchSize) {
        if (shouldStop) { log('Stopped during inner fetch', 'err'); break; }

        const batch = scrapedCars.slice(i, i + batchSize);
        const urls = batch.map(c => c.carUrl);

        const res = await chrome.scripting.executeScript({
          target: { tabId: currentTabId },
          func: fetchInnerBatch,
          args: [urls]
        });

        const details = res[0].result || [];
        details.forEach((d, j) => {
          if (d && scrapedCars[i + j]) {
            Object.assign(scrapedCars[i + j], d);
          }
        });

        done += batch.length;
        $('detailProgress').textContent = done;
        updateProgress(done, scrapedCars.length, 'Details: ' + done + '/' + scrapedCars.length);

        if (done % 100 === 0 || done === scrapedCars.length) {
          log('Inner details: ' + done + '/' + scrapedCars.length, 'ok');
        }
      }
    }

    // Add sr_no
    scrapedCars.forEach((c, i) => c.sr_no = i + 1);

    log('COMPLETE! ' + scrapedCars.length + ' cars with full details', 'ok');
    updateProgress(100, 100, 'Done! ' + scrapedCars.length + ' cars scraped');
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


// ========== INJECTED: Scrape one listing page via fetch ==========
function scrapeListingPage(url) {
  return fetch(url).then(r => r.text()).then(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cards = doc.querySelectorAll('.NewUcExCard');
    const results = [];
    const seen = new Set();

    cards.forEach(card => {
      const linkEl = card.querySelector('a[href*="cars-"][href*=".htm"]');
      if (!linkEl) return;
      const carName = linkEl.textContent.trim();
      if (!carName || carName.length < 5 || seen.has(carName)) return;
      seen.add(carName);

      const priceEl = card.querySelector('.Price');
      const price = priceEl ? priceEl.textContent.trim() : '';

      const specsEl = card.querySelector('.dotsDetails');
      let kms = '', fuel = '', transmission = '';
      if (specsEl) {
        const s = specsEl.textContent;
        const k = s.match(/([\d,]+)\s*kms/i); kms = k ? k[1] : '';
        const f = s.match(/(Petrol|Diesel|CNG|Electric|LPG|Hybrid)/i); fuel = f ? f[1] : '';
        const t = s.match(/(Automatic|Manual)/i); transmission = t ? t[1] : '';
      }

      const bs = card.querySelector('.bottomFlexSection');
      let location = bs ? bs.textContent.replace('Compare', '').replace(/\s+/g, ' ').trim() : '';

      const imgs = card.querySelectorAll('img');
      const images = [];
      imgs.forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (src && src.includes('gaadi.com') && !src.endsWith('.svg') && !src.includes('icon')
            && !src.includes('map') && !src.includes('whatsapp') && !src.includes('Search')
            && !src.includes('Shortlist') && !src.includes('redStar') && !images.includes(src)) {
          images.push(src);
        }
      });

      const href = linkEl.getAttribute('href') || '';
      const carUrl = href.startsWith('http') ? href : 'https://www.cardekho.com' + href;

      results.push({ carName, price, kms, fuel, transmission, location, carUrl, images });
    });
    return results;
  }).catch(() => []);
}

// ========== INJECTED: Fetch inner details for a batch of URLs ==========
function fetchInnerBatch(urls) {
  return Promise.all(urls.map(url =>
    fetch(url, { signal: AbortSignal.timeout(15000) }).then(r => r.text()).then(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const d = {};

      // Extract key-value pairs from list items
      doc.querySelectorAll('li').forEach(li => {
        const leaves = Array.from(li.querySelectorAll('*')).filter(c => c.children.length === 0);
        const parts = leaves.map(c => c.textContent.trim()).filter(t => t);
        const keys = ['Registration Year','Insurance','Fuel Type','Seats','Kms Driven','RTO',
          'Ownership','Engine Displacement','Transmission','Year of Manufacture',
          'Engine','Power','Mileage','Fuel','No. of Airbags'];
        for (const key of keys) {
          const idx = parts.indexOf(key);
          if (idx >= 0 && idx < parts.length - 1) d[key] = parts[idx + 1];
        }
      });

      // New car price
      const bt = doc.body ? doc.body.textContent : '';
      const npm = bt.match(/New Car Price[\s\S]*?(\u20B9[\d.,]+\s*(?:Lakh|Crore))/i);

      // Owner
      const om = html.match(/(1st|2nd|3rd|4th|First|Second|Third|Fourth)\s*Owner/i);

      // EMI
      const em = bt.match(/\u20B9([\d,]+)\s*\/mo/);

      // All real images
      const images = [];
      doc.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (src && src.includes('gaadi.com') && !src.endsWith('.svg')
            && !src.includes('icon') && !src.includes('Shortlist')
            && !src.includes('redStar') && !images.includes(src)) {
          images.push(src);
        }
      });

      // Features
      const features = [];
      const featureWords = ['Leather','Climate','Voice','Steering','Conditioner','Lock',
        'Window','Airbag','Fog','Alloy','Camera','Keyless','Defogger','Sensor',
        'Sunroof','Cruise','Touchscreen','Bluetooth','USB','CarPlay','Android',
        'Navigation','Push Button','ABS','EBD','Hill','Traction','Tyre Pressure'];
      doc.querySelectorAll('li').forEach(li => {
        const t = li.textContent.trim();
        if (t.length > 3 && t.length < 50 && featureWords.some(f => t.includes(f)) && !features.includes(t)) {
          features.push(t);
        }
      });

      return {
        registrationYear: d['Registration Year'] || '',
        insurance: d['Insurance'] || '',
        seats: d['Seats'] || '',
        rto: d['RTO'] || '',
        ownership: d['Ownership'] || '',
        engineDisplacement: d['Engine Displacement'] || '',
        yearOfManufacture: d['Year of Manufacture'] || '',
        newCarPrice: npm ? npm[1] : '',
        owner: om ? om[0] : '',
        emi: em ? '\u20B9' + em[1] + '/mo' : '',
        engine: d['Engine'] || '',
        power: d['Power'] || '',
        mileage: d['Mileage'] || '',
        fuelSpec: d['Fuel'] || '',
        airbags: d['No. of Airbags'] || '',
        features: features.join(' | '),
        images: images
      };
    }).catch(() => null)
  ));
}


// ========== Download JSON ==========
$('jsonBtn').addEventListener('click', () => {
  const filename = 'cardekho_' + (detectedCity || 'cars').toLowerCase().replace(/\s+/g, '_') + '.json';
  const json = JSON.stringify(scrapedCars, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true });
  log('JSON downloading: ' + filename + ' (' + Math.round(json.length/1024) + 'KB)', 'ok');
});

// ========== Download CSV ==========
$('csvBtn').addEventListener('click', () => {
  function esc(val) {
    if (!val) return '';
    val = String(val);
    if (val.includes(',') || val.includes('"') || val.includes('\n')) return '"' + val.replace(/"/g, '""') + '"';
    return val;
  }

  const headers = [
    'Sr_No','Car_Name','Price','KMs_Driven','Fuel_Type','Transmission','Location','Car_URL',
    'Registration_Year','Insurance','Seats','RTO','Ownership','Engine_Displacement',
    'Year_of_Manufacture','New_Car_Price','Owner','EMI','Engine','Power','Mileage',
    'Fuel_Spec','Airbags','Features',
    'Image_1','Image_2','Image_3','Image_4','Image_5','Image_6','Image_7','Image_8',
    'Image_9','Image_10','Image_11','Image_12','Image_13','Image_14','Image_15',
    'Image_16','Image_17','Image_18','Image_19','Image_20'
  ];

  let csv = headers.join(',') + '\n';

  scrapedCars.forEach((car, idx) => {
    const imgs = car.images || [];
    const row = [
      car.sr_no || idx + 1,
      esc(car.carName), esc(car.price), esc(car.kms), esc(car.fuel), esc(car.transmission),
      esc(car.location), esc(car.carUrl),
      esc(car.registrationYear), esc(car.insurance), esc(car.seats), esc(car.rto),
      esc(car.ownership), esc(car.engineDisplacement), esc(car.yearOfManufacture),
      esc(car.newCarPrice), esc(car.owner), esc(car.emi),
      esc(car.engine), esc(car.power), esc(car.mileage), esc(car.fuelSpec), esc(car.airbags),
      esc(car.features),
      ...Array.from({length: 20}, (_, i) => esc(imgs[i] || ''))
    ];
    csv += row.join(',') + '\n';
  });

  const filename = 'cardekho_' + (detectedCity || 'cars').toLowerCase().replace(/\s+/g, '_') + '.csv';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true });
  log('CSV downloading: ' + filename + ' (' + Math.round(csv.length/1024) + 'KB)', 'ok');
});
