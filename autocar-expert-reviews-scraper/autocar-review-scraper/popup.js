let listingData = [];
let fullData = [];
const statusEl = document.getElementById('status');
const listCountEl = document.getElementById('listCount');
const deepCountEl = document.getElementById('deepCount');
const logEl = document.getElementById('log');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const btnScrapeList = document.getElementById('btnScrapeList');
const btnDeepScrape = document.getElementById('btnDeepScrape');
const btnJSON = document.getElementById('btnJSON');
const btnCSV = document.getElementById('btnCSV');
function log(msg, type) {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (type ? ' log-' + type : '');
  entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}
function setStatus(text) { statusEl.textContent = text; }
function setProgress(current, total) {
  progressBar.style.display = 'block';
  var pct = Math.round((current / total) * 100);
  progressFill.style.width = pct + '%';
}
// STEP 1: SCRAPE LISTING PAGE
btnScrapeList.addEventListener('click', async function () {
  btnScrapeList.disabled = true;
  setStatus('Loading all reviews...');
  log('Step 1: Clicking View More to load all reviews...', 'info');
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab.url.includes('autocarindia.com')) {
      log('ERROR: Navigate to autocarindia.com/car-reviews first!', 'error');
      setStatus('Wrong site');
      btnScrapeList.disabled = false;
      return;
    }
    var results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injected_loadAllAndScrapeList
    });
    listingData = results[0].result;
    listCountEl.textContent = listingData.length;
    setStatus('Found ' + listingData.length + ' reviews');
    log('Found ' + listingData.length + ' unique review URLs', 'info');
    btnDeepScrape.disabled = false;
  } catch (err) {
    log('Error: ' + err.message, 'error');
    setStatus('Error');
  }
  btnScrapeList.disabled = false;
});
// STEP 2: DEEP SCRAPE EACH ARTICLE
btnDeepScrape.addEventListener('click', async function () {
  if (!listingData.length) return;
  btnDeepScrape.disabled = true;
  btnScrapeList.disabled = true;
  fullData = [];
  setStatus('Deep scraping articles...');
  log('Step 2: Fetching full content for ' + listingData.length + ' articles...', 'info');
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  for (var i = 0; i < listingData.length; i++) {
    var item = listingData[i];
    setStatus('Scraping ' + (i + 1) + '/' + listingData.length + '...');
    setProgress(i + 1, listingData.length);
    log('[' + (i + 1) + '/' + listingData.length + '] ' + item.title, 'info');
    try {
      var fetchResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: injected_fetchArticle,
        args: [item.url]
      });
      var articleData = fetchResult[0].result;
      fullData.push({
        title: item.title,
        url: item.url,
        author: item.author,
        date: item.date,
        listingSummary: item.summary,
        imageUrl: item.imageUrl,
        views: item.views,
        section: item.section,
        fullSummary: articleData.fullSummary || '',
        readTime: articleData.readTime || '',
        articleViews: articleData.views || '',
        pros: (articleData.pros || []).join(' | '),
        cons: (articleData.cons || []).join(' | '),
        sectionRatings: JSON.stringify(articleData.sectionRatings || {}),
        sections: JSON.stringify(articleData.sections || []),
        bodyContent: articleData.bodyContent || '',
        carName: articleData.carName || '',
        price: articleData.price || '',
        rangeMileage: articleData.rangeMileage || '',
        specifications: articleData.specifications || '',
        features: articleData.features || '',
        variants: articleData.variants || '',
        imageGallery: (articleData.imageGallery || []).join(' | ')
      });
      deepCountEl.textContent = fullData.length;
    } catch (err) {
      log('Failed: ' + item.title + ' - ' + err.message, 'warn');
      fullData.push({
        title: item.title, url: item.url, author: item.author,
        date: item.date, listingSummary: item.summary, imageUrl: item.imageUrl,
        views: item.views, section: item.section,
        fullSummary: '', readTime: '', articleViews: '',
        pros: '', cons: '', sectionRatings: '{}', sections: '[]',
        bodyContent: 'FETCH_FAILED',
        carName: '', price: '', rangeMileage: '',
        specifications: '', features: '', variants: '', imageGallery: ''
      });
      deepCountEl.textContent = fullData.length;
    }
    await new Promise(function (r) { setTimeout(r, 800); });
  }
  setStatus('Done! ' + fullData.length + ' articles scraped');
  log('Deep scrape complete: ' + fullData.length + ' articles', 'info');
  btnJSON.disabled = false;
  btnCSV.disabled = false;
  btnDeepScrape.disabled = false;
  btnScrapeList.disabled = false;
});
// DOWNLOAD JSON
btnJSON.addEventListener('click', function () {
  if (!fullData.length) return;
  var jsonData = fullData.map(function (d) {
    return {
      title: d.title, url: d.url, author: d.author, date: d.date,
      listingSummary: d.listingSummary, imageUrl: d.imageUrl,
      views: d.views, section: d.section,
      fullSummary: d.fullSummary, readTime: d.readTime,
      articleViews: d.articleViews,
      pros: d.pros ? d.pros.split(' | ') : [],
      cons: d.cons ? d.cons.split(' | ') : [],
      sectionRatings: JSON.parse(d.sectionRatings || '{}'),
      sections: JSON.parse(d.sections || '[]'),
      bodyContent: d.bodyContent,
      carName: d.carName, price: d.price,
      rangeMileage: d.rangeMileage,
      specifications: d.specifications,
      features: d.features, variants: d.variants,
      imageGallery: d.imageGallery ? d.imageGallery.split(' | ') : []
    };
  });
  var jsonStr = JSON.stringify(jsonData, null, 2);
  downloadFile(jsonStr, 'autocar_reviews_full.json', 'application/json');
  log('Downloaded JSON (' + fullData.length + ' reviews)', 'info');
});
// DOWNLOAD CSV
btnCSV.addEventListener('click', function () {
  if (!fullData.length) return;
  var csv = convertToCSV(fullData);
  var bom = '\\uFEFF';
  downloadFile(bom + csv, 'autocar_reviews_full.csv', 'text/csv;charset=utf-8');
  log('Downloaded CSV (' + fullData.length + ' reviews)', 'info');
});
// HELPERS
function downloadFile(content, filename, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function convertToCSV(data) {
  if (!data.length) return '';
  var headers = Object.keys(data[0]);
  var csvRows = [headers.map(function (h) { return '"' + h + '"'; }).join(',')];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var values = headers.map(function (h) {
      var val = (row[h] == null ? '' : String(row[h]))
        .replace(/"/g, '""')
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, '');
      return '"' + val + '"';
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\\n');
}
// ================================================================
// INJECTED FUNCTIONS - These run inside the web page context
// ================================================================
function injected_loadAllAndScrapeList() {
  return new Promise(function (resolve) {
    var clickCount = 0;
    var maxClicks = 100;
    function clickViewMore() {
      var buttons = document.querySelectorAll('button');
      var viewMoreBtn = null;
      buttons.forEach(function (btn) {
        var text = btn.textContent.trim().toLowerCase();
        if (text.includes('view more') || text.includes('load more')) {
          viewMoreBtn = btn;
        }
      });
      if (viewMoreBtn && clickCount < maxClicks && !viewMoreBtn.disabled &&
          viewMoreBtn.offsetParent !== null) {
        viewMoreBtn.click();
        clickCount++;
        setTimeout(clickViewMore, 1500);
      } else {
        resolve(scrapeListingCards());
      }
    }
    function scrapeListingCards() {
      var reviews = [];
      var seen = {};
      document.querySelectorAll('a[href*="/car-reviews/"]').forEach(function (link) {
        var url = link.href;
        if (!url || seen[url] || url.indexOf('/car-reviews/') === -1) return;
        var heading = link.querySelector('h2, h3, h4, h5');
        if (!heading) return;
        var title = heading.textContent.trim();
        if (!title) return;
        seen[url] = true;
        var date = '', author = '', summary = '', imageUrl = '', views = '';
        link.querySelectorAll('div, span, p, time').forEach(function (child) {
          var text = child.textContent.trim();
          if (!date && /(\\d{1,2}\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{4}|\\d+\\s+(hrs?|hours?|mins?|minutes?|days?)\\s+ago)/i.test(text)) {
            date = text;
          }
          if (!views && /^\\d+K\\+$/.test(text)) views = text;
        });
        link.querySelectorAll('img').forEach(function (img) {
          var alt = img.alt || '';
          if (alt && alt.toLowerCase().indexOf('review') === -1 &&
              alt.toLowerCase().indexOf('autocar') === -1 &&
              alt.length > 2 && alt.length < 50 && /^[A-Z][a-z]+\\s+[A-Z]/.test(alt)) {
            if (!author) author = alt;
          }
        });
        link.querySelectorAll('div, span, p').forEach(function (child) {
          var text = child.textContent.trim();
          if (text.length > 50 && text !== title) summary = text;
        });
        var mainImg = link.querySelector('img[alt*="review"], img[alt*="Review"]');
        imageUrl = mainImg ? (mainImg.src || '') : '';
        if (!imageUrl) {
          link.querySelectorAll('img').forEach(function (img) {
            if (img.alt && img.alt === title) imageUrl = img.src || '';
          });
        }
        var section = 'Suggested';
        if (views) section = 'Trending';
        if (reviews.length === 0) section = 'Featured';
        reviews.push({
          title: title, url: url, author: author || '', date: date || '',
          summary: summary || '', imageUrl: imageUrl, views: views, section: section
        });
      });
      return reviews;
    }
    clickViewMore();
  });
}
function injected_fetchArticle(articleUrl) {
  return fetch(articleUrl)
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      var result = {
        fullSummary: '',
        readTime: '',
        views: '',
        pros: [],
        cons: [],
        sectionRatings: {},
        sections: [],
        bodyContent: '',
        carName: '',
        price: '',
        rangeMileage: '',
        specifications: '',
        features: '',
        variants: '',
        imageGallery: []
      };
      // Title area meta
      var allEls = doc.querySelectorAll('main div, main span, main p');
      allEls.forEach(function (el) {
        var text = el.textContent.trim();
        if (!result.readTime && /^\\d+\\s+min\\s+read$/i.test(text)) {
          result.readTime = text;
        }
        if (!result.views && /^\\d+K?\\+?\\s*views$/i.test(text)) {
          result.views = text;
        }
      });
      // Full summary
      var h1 = doc.querySelector('h1');
      if (h1) {
        var sib = h1.nextElementSibling;
        while (sib) {
          var t = sib.textContent.trim();
          if (t.length > 30 && t.indexOf('min read') === -1) {
            result.fullSummary = t;
            break;
          }
          sib = sib.nextElementSibling;
        }
      }
      // Pros and Cons
      var headings = doc.querySelectorAll('h2, h3, h4');
      headings.forEach(function (heading) {
        var hText = heading.textContent.trim().toLowerCase();
        if (hText === 'we like') {
          var list = heading.nextElementSibling;
          if (list && list.tagName === 'UL') {
            list.querySelectorAll('li').forEach(function (li) {
              result.pros.push(li.textContent.trim());
            });
          }
        }
        if (hText === "we don't like") {
          var list = heading.nextElementSibling;
          if (list && list.tagName === 'UL') {
            list.querySelectorAll('li').forEach(function (li) {
              result.cons.push(li.textContent.trim());
            });
          }
        }
      });
      // Section headings with ratings
      // Handles ALL 4 formats found on actual pages:
      //   1) "Volkswagen Tayron Exterior Design and Engineering8"     -> digit appended
      //   2) "Tata Punch EV facelift exterior design and engineering – 8/10"  -> en-dash + /10
      //   3) "Kia Seltos IVT exterior design and engineering - 7/10"  -> hyphen + /10
      //   4) "Ferrari 849 Testarossa Exterior Design and Engineering" -> no rating
      var sectionKeywords = [
        'exterior design', 'interior', 'features', 'safety',
        'performance', 'refinement', 'range', 'efficiency',
        'mileage', 'ride', 'handling', 'comfort',
        'value', 'money', 'verdict', 'price',
        'engine', 'specs', 'track'
      ];
      headings.forEach(function (heading) {
        var hText = heading.textContent.trim();
        var hLower = hText.toLowerCase();
        var isSection = false;
        for (var k = 0; k < sectionKeywords.length; k++) {
          if (hLower.indexOf(sectionKeywords[k]) !== -1) {
            isSection = true;
            break;
          }
        }
        if (!isSection) return;
        if (hLower === 'we like' || hLower === "we don't like") return;
        if (hLower.indexOf('explore') !== -1 || hLower.indexOf('suggested') !== -1 ||
            hLower.indexOf('trending') !== -1 || hLower.indexOf('upcoming') !== -1 ||
            hLower.indexOf('poll') !== -1 || hLower.indexOf('readers also') !== -1 ||
            hLower.indexOf('similar') !== -1 || hLower.indexOf('latest') !== -1) return;
        var sectionName = hText;
        var rating = null;
        // FORMAT 2 & 3: en-dash or hyphen followed by X/10
        // Examples: "... – 8/10"  or  "... - 7/10"
        var dashMatch = hText.match(/^(.+?)\s*[\u2013\u2014\-]\s*(\d{1,2})\/10$/);
        if (dashMatch) {
          sectionName = dashMatch[1].trim();
          rating = parseInt(dashMatch[2], 10);
        }
        // FORMAT 1: digit appended with no separator
        // Example: "...Engineering8"
        if (rating === null) {
          var appendedMatch = hText.match(/^(.+\\D)(\\d{1,2})$/);
          if (appendedMatch) {
            sectionName = appendedMatch[1].trim();
            rating = parseInt(appendedMatch[2], 10);
            // Sanity check: rating should be 1-10
            if (rating < 1 || rating > 10) {
              sectionName = hText;
              rating = null;
            }
          }
        }
        // FORMAT 4: no rating at all — sectionName stays as-is, rating stays null
        if (rating !== null) {
          result.sectionRatings[sectionName] = rating;
        }
        // Collect section body text until next section heading
        var sectionBody = '';
        var sibling = heading.nextElementSibling;
        while (sibling) {
          if (sibling.tagName === 'H2' || sibling.tagName === 'H3' || sibling.tagName === 'H4') {
            var sibLower = sibling.textContent.trim().toLowerCase();
            var isSectionHeading = false;
            for (var j = 0; j < sectionKeywords.length; j++) {
              if (sibLower.indexOf(sectionKeywords[j]) !== -1) {
                isSectionHeading = true;
                break;
              }
            }
            // If it's another major section heading, stop
            if (isSectionHeading && sibLower !== hLower) break;
            // Otherwise it's a sub-description, include it
            sectionBody += sibling.textContent.trim() + '\\n';
          } else if (sibling.tagName !== 'IMG') {
            var text = sibling.textContent.trim();
            if (text.length > 10) {
              sectionBody += text + '\\n';
            }
          }
          sibling = sibling.nextElementSibling;
        }
        result.sections.push({
          name: sectionName,
          rating: rating,
          content: sectionBody.trim()
        });
      });
      // Full body content
      var bodyParts = [];
      var mainEl = doc.querySelector('main');
      if (mainEl) {
        mainEl.querySelectorAll('p, div > span').forEach(function (el) {
          var text = el.textContent.trim();
          if (text.length > 80 &&
              text.indexOf('Copyright') === -1 &&
              text.indexOf('cookie') === -1 &&
              text.indexOf('Popular Car') === -1 &&
              text.indexOf('Expected price') === -1 &&
              text.indexOf('On road price') === -1) {
            bodyParts.push(text);
          }
        });
      }
      result.bodyContent = bodyParts.join('\\n\\n');
      // Spec Widget
      var specLinks = doc.querySelectorAll('a[href*="/mileage"], a[href*="/specifications"], a[href*="/variants"]');
      if (specLinks.length > 0) {
        // Range/Mileage
        doc.querySelectorAll('a[href*="/mileage"]').forEach(function (link) {
          if (!result.rangeMileage) {
            var parts = [];
            link.querySelectorAll('div, span, p').forEach(function (el) {
              var t = el.textContent.trim();
              if (t !== 'Range/Mileage' && t.length > 0) parts.push(t);
            });
            result.rangeMileage = parts.join(', ');
          }
        });
        // Specifications
        doc.querySelectorAll('a[href*="/specifications"]').forEach(function (link) {
          var href = link.getAttribute('href') || '';
          if (href.indexOf('#features') !== -1) {
            if (!result.features) {
              var parts = [];
              link.querySelectorAll('div, span, p').forEach(function (el) {
                var t = el.textContent.trim();
                if (t !== 'Features' && t.length > 0 && t.charAt(0) !== '+') parts.push(t);
              });
              result.features = parts.join(', ');
            }
          } else {
            if (!result.specifications) {
              var parts = [];
              link.querySelectorAll('div, span, p').forEach(function (el) {
                var t = el.textContent.trim();
                if (t !== 'Specifications' && t.length > 0 && t.charAt(0) !== '+') parts.push(t);
              });
              result.specifications = parts.join(', ');
            }
          }
        });
        // Variants
        doc.querySelectorAll('a[href*="/variants"]').forEach(function (link) {
          if (!result.variants) {
            var parts = [];
            link.querySelectorAll('div, span, p').forEach(function (el) {
              var t = el.textContent.trim();
              if (t !== 'Variants' && t.length > 0 && t.charAt(0) !== '+') parts.push(t);
            });
            result.variants = parts.join(', ');
          }
        });
      }
      // Car name from Explore now widget
      doc.querySelectorAll('a[href^="/cars/"]').forEach(function (link) {
        if (link.textContent.indexOf('Explore now') !== -1) {
          link.querySelectorAll('div, span, p').forEach(function (el) {
            var t = el.textContent.trim();
            if (t.length > 3 && t.indexOf('\\u20B9') === -1 && t !== 'Explore now' && t.indexOf('On road') === -1) {
              if (!result.carName || t.length > result.carName.length) result.carName = t;
            }
          });
        }
      });
      // Car name fallback
      if (!result.carName) {
        var carImg = doc.querySelector('a[href^="/cars/"] img');
        if (carImg) result.carName = carImg.alt || '';
      }
      // Price
      doc.querySelectorAll('a[href^="/cars/"]').forEach(function (link) {
        if (!result.price) {
          link.querySelectorAll('div, span, p').forEach(function (el) {
            var t = el.textContent.trim();
            if (t.indexOf('\\u20B9') !== -1 && (t.indexOf('Lakh') !== -1 || t.indexOf('Cr') !== -1)) {
              result.price = t.replace('(On road price)', '').trim();
            }
          });
        }
      });
      // Image gallery
      var imgSet = {};
      var mainImgs = doc.querySelectorAll('main img');
      mainImgs.forEach(function (img) {
        var src = img.src || img.getAttribute('data-src') || '';
        if (src && src.indexOf('http') !== -1 &&
            src.indexOf('author') === -1 && src.indexOf('logo') === -1 &&
            src.indexOf('icon') === -1 && src.indexOf('avatar') === -1 &&
            src.indexOf('google') === -1 && src.indexOf('spinny') === -1 &&
            src.indexOf('Autocar bg') === -1) {
          imgSet[src] = true;
        }
      });
      result.imageGallery = Object.keys(imgSet);
      return result;
    });
}