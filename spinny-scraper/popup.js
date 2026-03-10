
const CITIES = [
  'bangalore','delhi-ncr','hyderabad','mumbai','pune','chennai','kolkata',
  'ahmedabad','jaipur','lucknow','chandigarh','indore','kochi','coimbatore',
  'gurgaon','noida','ghaziabad','faridabad','mysore','vizag','nagpur',
  'bhopal','thiruvananthapuram','mangalore','surat','vadodara','rajkot',
  'ludhiana','agra','varanasi','patna','ranchi','bhubaneswar','guwahati',
  'dehradun','amritsar','jodhpur','udaipur','kanpur','madurai','tiruchirappalli',
  'salem','vijayawada','guntur','warangal','aurangabad','nashik','thane',
  'navi-mumbai','pimpri-chinchwad','hubli-dharwad','belgaum','gulbarga',
  'davangere','bellary','shimoga','tumkur','raichur','bijapur','hospet'
];

let selectedCity = '';
let scrapedCars = [];
let isRunning = false;

// DOM elements
const cityGrid = document.getElementById('cityGrid');
const searchCity = document.getElementById('searchCity');
const customCity = document.getElementById('customCity');
const useCustomBtn = document.getElementById('useCustom');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const progress = document.getElementById('progress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const downloadSection = document.getElementById('downloadSection');
const statusEl = document.getElementById('status');
const detectedEl = document.getElementById('detected');
const fetchDetailsChk = document.getElementById('fetchDetails');

function renderCities(filter = '') {
  cityGrid.innerHTML = '';
  const filtered = filter ? CITIES.filter(c => c.includes(filter.toLowerCase())) : CITIES;
  filtered.forEach(city => {
    const btn = document.createElement('button');
    btn.className = 'city-btn' + (city === selectedCity ? ' active' : '');
    btn.textContent = city.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    btn.onclick = () => selectCity(city);
    cityGrid.appendChild(btn);
  });
}

function selectCity(city) {
  selectedCity = city;
  renderCities(searchCity.value);
  statusEl.textContent = 'Selected: ' + city.replace(/-/g, ' ') + ' - Click Start to scrape';
}

searchCity.addEventListener('input', () => renderCities(searchCity.value));

useCustomBtn.addEventListener('click', () => {
  const city = customCity.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (city) selectCity(city);
});

// Auto-detect city from active Spinny tab
async function detectCity() {
  try {
    const tabs = await chrome.tabs.query({url: 'https://www.spinny.com/*'});
    for (const tab of tabs) {
      const url = tab.url || '';
      const match = url.match(/used-cars-in-([a-z0-9-]+)/);
      if (match) {
        const city = match[1];
        detectedEl.textContent = '✅ Detected city: ' + city.replace(/-/g, ' ') + ' (from open tab)';
        detectedEl.classList.add('show');
        selectCity(city);
        return;
      }
    }
  } catch(e) {}
}

detectCity();
renderCities();

// Scraping function
startBtn.addEventListener('click', async () => {
  if (!selectedCity) { statusEl.textContent = '⚠️ Please select a city first'; return; }
  
  isRunning = true;
  scrapedCars = [];
  startBtn.classList.add('hide');
  stopBtn.classList.add('show');
  progress.classList.add('show');
  downloadSection.classList.remove('show');
  
  const doDetails = fetchDetailsChk.checked;
  
  try {
    // Phase 1: Fetch listings from API
    progressText.textContent = 'Fetching car listings...';
    const baseUrl = 'https://api.spinny.com/v3/api/listing/v3/?city=' + selectedCity + '&product_type=cars&category=used&size=20&page=';
    let page = 1;
    let totalCount = 0;
    let allCars = [];
    
    while (isRunning) {
      const resp = await fetch(baseUrl + page);
      if (!resp.ok) break;
      const data = await resp.json();
      
      if (page === 1) {
        totalCount = data.count || 0;
        if (totalCount === 0) { statusEl.textContent = 'No cars found in ' + selectedCity; break; }
      }
      
      if (!data.results || data.results.length === 0) break;
      allCars.push(...data.results);
      
      const totalPages = Math.ceil(totalCount / 20);
      const pct = Math.round((page / totalPages) * (doDetails ? 50 : 100));
      progressFill.style.width = pct + '%';
      progressText.textContent = 'Listings: Page ' + page + '/' + totalPages + ' | ' + allCars.length + ' cars';
      
      if (page >= totalPages) break;
      page++;
      await new Promise(r => setTimeout(r, 200));
    }
    
    if (!isRunning) { finishScraping(allCars); return; }
    
    // Phase 2: Fetch inner details (if checked)
    if (doDetails && allCars.length > 0) {
      progressText.textContent = 'Fetching inner details (0/' + allCars.length + ')...';
      
      const BATCH = 5;
      let detailed = [];
      
      for (let i = 0; i < allCars.length && isRunning; i += BATCH) {
        const batch = allCars.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(car => fetchDetail(car)));
        detailed.push(...results);
        
        const pct = 50 + Math.round((detailed.length / allCars.length) * 50);
        progressFill.style.width = pct + '%';
        progressText.textContent = 'Details: ' + detailed.length + '/' + allCars.length + ' cars';
        await new Promise(r => setTimeout(r, 150));
      }
      
      finishScraping(detailed);
    } else {
      finishScraping(allCars);
    }
    
  } catch(e) {
    statusEl.textContent = '❌ Error: ' + e.message;
    isRunning = false;
    startBtn.classList.remove('hide');
    stopBtn.classList.remove('show');
  }
});

async function fetchDetail(car) {
  try {
    const url = 'https://www.spinny.com' + car.permanent_url;
    const resp = await fetch(url);
    if (!resp.ok) return car;
    const html = await resp.text();
    
    const marker = 'window.__INITIAL_STATE__=';
    const idx = html.indexOf(marker);
    if (idx === -1) return car;
    
    const endMarker = ',window.__STATIC_CONFIG__';
    const endIdx = html.indexOf(endMarker, idx);
    if (endIdx === -1) return car;
    
    const jsCode = html.substring(idx, endIdx);
    const origState = window.__INITIAL_STATE__;
    eval(jsCode);
    const state = window.__INITIAL_STATE__;
    window.__INITIAL_STATE__ = origState;
    
    const detail = state && state.product && state.product.pageData ? state.product.pageData.productDetail : null;
    if (!detail) return car;
    
    const inner = {
      insurance_type: detail.insurance_type || '',
      registration_month: detail.registration_month || '',
      make_month: detail.make_month || '',
      locality: detail.locality || '',
      hub_display_name: detail.hub_display_name || '',
      hub_address: detail.hub_address || '',
      added_on: detail.added_on || '',
      is_assured: detail.is_assured || false,
      insurance_validity_month: detail.insurance_validity_month || '',
      insurance_validity_year: detail.insurance_validity_year || '',
      norms: detail.norms || '',
      city_name: detail.city_name || '',
      last_service_date: detail.last_service_date || '',
      next_service_date: detail.next_service_date || ''
    };
    
    if (detail.technicalSpecification) {
      const ts = detail.technicalSpecification;
      if (ts.specification && ts.specification.top_specification) {
        ts.specification.top_specification.forEach(s => {
          inner['spec_' + s.display_name.replace(/[^a-zA-Z0-9]/g, '_')] = (s.value || '') + (s.unit ? ' ' + s.unit : '');
        });
      }
      if (ts.specification && ts.specification.specification_category) {
        ts.specification.specification_category.forEach(cat => {
          if (cat.sub_specification) {
            cat.sub_specification.forEach(s => {
              inner['spec_' + s.display_name.replace(/[^a-zA-Z0-9]/g, '_')] = (s.value || '') + (s.unit ? ' ' + s.unit : '');
            });
          }
        });
      }
      if (ts.features && ts.features.top_features) {
        inner.top_features = ts.features.top_features.map(f => f.display_name).join(', ');
      }
    }
    
    if (detail.product_photos && Array.isArray(detail.product_photos)) {
      inner.detail_images = detail.product_photos
        .filter(p => p.file && p.file.absurl && !p.file.absurl.includes('.svg'))
        .map(p => (p.file.absurl.startsWith('//') ? 'https:' : '') + p.file.absurl);
    }
    
    return {...car, ...inner};
  } catch(e) {
    return car;
  }
}

stopBtn.addEventListener('click', () => { isRunning = false; });

function finishScraping(cars) {
  isRunning = false;
  startBtn.classList.remove('hide');
  stopBtn.classList.remove('show');
  progressFill.style.width = '100%';
  
  // Clean and flatten data
  scrapedCars = cars.map(car => {
    const listingImgs = (car.images || [])
      .filter(img => img.file && img.file.absurl && !img.file.absurl.includes('.svg'))
      .map(img => (img.file.absurl.startsWith('//') ? 'https:' : '') + img.file.absurl);
    const detailImgs = (car.detail_images || []).filter(u => !u.includes('.svg'));
    const allImgs = [...new Set([...listingImgs, ...detailImgs])];
    
    let emiAmount = car.emi || '';
    let loanAmount = '', roi = '';
    if (car.finance && car.finance.best && car.finance.best.details) {
      const fd = car.finance.best.details;
      loanAmount = fd.loan_amount ? fd.loan_amount.best : '';
      roi = fd.roi || '';
    }
    
    const flat = {
      id: car.id,
      car_name: [car.make_year, car.make, car.model, car.variant].filter(Boolean).join(' '),
      make: car.make || '',
      model: car.model || '',
      variant: car.variant || '',
      make_year: car.make_year || '',
      make_month: car.make_month || '',
      registration_year: car.registration_year || '',
      registration_month: car.registration_month || '',
      price: car.price || '',
      emi: emiAmount,
      loan_amount: loanAmount,
      roi: roi,
      mileage_km: car.mileage || '',
      fuel_type: car.fuel_type || '',
      transmission: car.transmission || '',
      color: car.color || '',
      body_type: car.body_type || '',
      no_of_owners: car.no_of_owners || '',
      rto: car.rto || '',
      city: car.city || '',
      city_name: car.city_name || car.city || '',
      locality: car.locality || '',
      hub: car.hub || '',
      hub_display_name: car.hub_display_name || '',
      hub_short_name: car.hub_short_name || '',
      hub_address: car.hub_address || '',
      insurance_type: car.insurance_type || '',
      insurance_validity_month: car.insurance_validity_month || '',
      insurance_validity_year: car.insurance_validity_year || '',
      norms: car.norms || '',
      is_assured: car.is_assured || car.is_assured_plus || false,
      procurement_category: car.procurement_category || '',
      consumer_procurement_category: car.consumer_procurement_category || '',
      is_max_certified: car.is_max_certified || 0,
      booked: car.booked || false,
      sold: car.sold || false,
      tag_status: car.tag_status || '',
      home_test_drive_available: car.home_test_drive_available || false,
      added_on: car.added_on || '',
      permanent_url: 'https://www.spinny.com' + (car.permanent_url || ''),
      last_service_date: car.last_service_date || '',
      next_service_date: car.next_service_date || '',
      token_amount: car.token_amount || '',
      top_features: car.top_features || '',
      images: allImgs.join(' | '),
      images_count: allImgs.length
    };
    
    Object.keys(car).forEach(k => {
      if (k.startsWith('spec_')) flat[k] = car[k];
    });
    
    return flat;
  });
  
  progressText.textContent = 'Done! ' + scrapedCars.length + ' cars scraped';
  statusEl.textContent = '✅ Scraped ' + scrapedCars.length + ' cars from ' + selectedCity;
  downloadSection.classList.add('show');
}

// Download handlers
document.getElementById('dlJson').addEventListener('click', () => {
  const jsonStr = JSON.stringify(scrapedCars, null, 2);
  const blob = new Blob([jsonStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: 'spinny_' + selectedCity + '_used_cars.json',
    saveAs: true
  });
});

document.getElementById('dlCsv').addEventListener('click', () => {
  const allHeaders = new Set();
  scrapedCars.forEach(car => Object.keys(car).forEach(k => allHeaders.add(k)));
  const headers = [...allHeaders];
  
  function esc(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  
  const rows = [headers.map(h => esc(h)).join(',')];
  scrapedCars.forEach(car => {
    rows.push(headers.map(h => esc(car[h] || '')).join(','));
  });
  
  const csvStr = rows.join('\n');
  const blob = new Blob([csvStr], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: 'spinny_' + selectedCity + '_used_cars.csv',
    saveAs: true
  });
});
