const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const logDiv = document.getElementById('log');
const statsWrap = document.getElementById('statsWrap');

let scrapedData = null;
let stopRequested = false;

function log(msg, isError = false) {
  logDiv.style.display = 'block';
  const line = document.createElement('div');
  line.className = isError ? 'log-error' : 'log-line';
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logDiv.appendChild(line);
  logDiv.scrollTop = logDiv.scrollHeight;
}

function updateProgress(current, total) {
  const pct = Math.round((current / total) * 100);
  progressBar.style.width = pct + '%';
  progressText.textContent = `${current}/${total} (${pct}%)`;
}

function updateStats(cars, images, total, elapsed) {
  document.getElementById('statCars').textContent = cars;
  document.getElementById('statImages').textContent = images.toLocaleString();
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statTime').textContent = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed/60)}m ${elapsed%60}s`;
}

startBtn.addEventListener('click', async () => {
  stopRequested = false;
  startBtn.disabled = true;
  stopBtn.style.display = 'block';
  downloadBtn.style.display = 'none';
  progressWrap.style.display = 'block';
  statsWrap.style.display = 'grid';
  logDiv.innerHTML = '';
  logDiv.style.display = 'block';

  const scrapeImages = document.getElementById('scrapeImages').checked;
  const maxCars = parseInt(document.getElementById('maxCars').value) || 0;
  const format = document.getElementById('format').value;
  const startTime = Date.now();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('cars24.com')) {
      log('Please navigate to cars24.com first!', true);
      startBtn.disabled = false;
      stopBtn.style.display = 'none';
      return;
    }

    // Extract city from URL
    const cityMatch = tab.url.match(/buy-used-cars-([a-z-]+)/);
    const citySlug = cityMatch ? `buy-used-cars-${cityMatch[1]}` : 'buy-used-cars-hyderabad';

    log(`Detected city: ${cityMatch ? cityMatch[1] : 'hyderabad'}`);
    log('Fetching car listings from API...');

    // Step 1: Fetch all car listings via API
    const allCars = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (citySlug, maxCars) => {
        const allCars = [];
        let searchAfter = null;
        let page = 0;

        while (true) {
          const body = { sort: 'bestmatch', size: 20 };
          if (searchAfter) body.searchAfter = searchAfter;

          const r = await fetch(`https://car-catalog-gateway-in.c24.tech/listing/v1/${citySlug}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const data = await r.json();
          if (!data.content || data.content.length === 0) break;

          allCars.push(...data.content);
          searchAfter = data.page?.searchAfter || null;
          if (!searchAfter) break;
          if (maxCars > 0 && allCars.length >= maxCars) break;

          page++;
          await new Promise(r => setTimeout(r, 300));
        }

        return maxCars > 0 ? allCars.slice(0, maxCars) : allCars;
      },
      args: [citySlug, maxCars]
    });

    const cars = allCars[0].result;
    if (!cars || cars.length === 0) {
      log('No cars found!', true);
      startBtn.disabled = false;
      stopBtn.style.display = 'none';
      return;
    }

    log(`Found ${cars.length} cars`);
    updateStats(0, 0, cars.length, 0);

    // Step 2: Process cars and optionally scrape images
    let totalImages = 0;
    const processedCars = [];

    for (let i = 0; i < cars.length; i++) {
      if (stopRequested) { log('Stopped by user'); break; }

      const car = cars[i];
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      const carObj = {
        sno: i + 1,
        year: car.year,
        make: car.make,
        model: car.model,
        variant: car.variant,
        body_type: car.bodyType,
        fuel_type: car.fuelType,
        transmission: car.transmissionType?.display || '',
        color: car.color,
        km_driven: car.odometer?.display || '',
        odometer_raw: car.odometer?.value || 0,
        ownership: car.ownership,
        registration: car.maskedRegNum,
        listing_price: car.listingPrice,
        original_price: car.originalPrice,
        emi: car.emiDetails?.displayText || '',
        seats: car.seats,
        seller_type: car.sellerSubType || '',
        business_tag: car.businessTag || '',
        location: car.address?.locality || '',
        detail_page_url: `https://www.cars24.com/${car.cdpRelativeUrl || ''}`,
        listing_image: car.listingImage?.bgRemovedUri || car.listingImage?.uri || '',
        total_images: 0,
        all_image_urls: []
      };

      // Scrape gallery images if enabled
      if (scrapeImages) {
        try {
          const imgResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (cdpUrl) => {
              const r = await fetch(`https://www.cars24.com/${cdpUrl}`);
              const html = await r.text();
              const p1 = html.match(/https:\/\/media\.cars24\.com\/hello-ar\/dev\/(?:uploads|transformed)\/[^"'\s\\)]+/g) || [];
              const p2 = html.match(/https:\/\/marketplace-cdn\.cars24\.com\/production\/[^"'\s\\)]+/g) || [];
              return [...new Set([...p1, ...p2])];
            },
            args: [car.cdpRelativeUrl]
          });

          const imgs = imgResult[0].result || [];
          carObj.total_images = imgs.length;
          carObj.all_image_urls = imgs;
          totalImages += imgs.length;
        } catch (e) {
          carObj.total_images = 0;
          carObj.all_image_urls = [];
        }
      }

      processedCars.push(carObj);
      updateProgress(i + 1, cars.length);
      updateStats(i + 1, totalImages, cars.length, elapsed);

      if ((i + 1) % 50 === 0) log(`Processed ${i + 1}/${cars.length} cars...`);
    }

    // Done
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log(`Done! ${processedCars.length} cars, ${totalImages.toLocaleString()} images in ${elapsed}s`);
    updateStats(processedCars.length, totalImages, cars.length, elapsed);

    scrapedData = { format, cars: processedCars };
    downloadBtn.style.display = 'block';

  } catch (e) {
    log(`Error: ${e.message}`, true);
  }

  startBtn.disabled = false;
  stopBtn.style.display = 'none';
});

stopBtn.addEventListener('click', () => { stopRequested = true; });

downloadBtn.addEventListener('click', () => {
  if (!scrapedData) return;

  let content, filename, mime;

  if (scrapedData.format === 'json') {
    content = JSON.stringify(scrapedData.cars, null, 2);
    filename = `cars24_scraped_${scrapedData.cars.length}_cars.json`;
    mime = 'application/json';
  } else {
    // CSV
    const headers = Object.keys(scrapedData.cars[0]);
    const rows = [headers.join(',')];
    scrapedData.cars.forEach(car => {
      const row = headers.map(h => {
        let val = car[h];
        if (Array.isArray(val)) val = val.join(' | ');
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n')))
          val = `"${val.replace(/"/g, '""')}"`;
        return val;
      });
      rows.push(row.join(','));
    });
    content = rows.join('\n');
    filename = `cars24_scraped_${scrapedData.cars.length}_cars.csv`;
    mime = 'text/csv';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  log(`Downloaded: ${filename}`);
});
