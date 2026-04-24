// Scrapes the Sodexo RPI menu pages with Playwright and writes JSON
// per hall to dining/data/{hall}.json. Runs daily via GitHub Actions.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HALLS = {
  commons: 'https://rpi.sodexomyway.com/en-us/locations/the-commons-dining-hall',
  sage:    'https://rpi.sodexomyway.com/en-us/locations/russell-sage-dining-hall',
};

const OUT_DIR = path.join(__dirname, '..', 'dining', 'data');

async function scrapeHall(browser, name, url) {
  const page = await browser.newPage();
  console.log(`[${name}] loading ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // Wait for menu DOM to actually render. Selector based on inspected class.
  try {
    await page.waitForSelector('.menu-item-container', { timeout: 20000 });
  } catch {
    console.warn(`[${name}] no .menu-item-container appeared — page may have changed`);
  }

  // Pull everything in one DOM pass. Adjust selectors here if Sodexo redesigns.
  const data = await page.evaluate(() => {
    const out = { periods: [] };

    // Meal periods usually show up as section headers. Try a few shapes.
    const periodNodes = document.querySelectorAll(
      '[class*="MenuPeriod"], [class*="menu-period"], [data-testid*="period"]'
    );

    if (periodNodes.length > 0) {
      periodNodes.forEach(p => {
        const title = (p.querySelector('h1,h2,h3,h4') || p).innerText.trim().split('\n')[0];
        const items = [...p.querySelectorAll('.menu-item-container')].map(el => ({
          name: (el.querySelector('.left') || el).innerText.trim().split('\n')[0],
          tags: [...el.querySelectorAll('[class*="tag"], [class*="Tag"]')].map(t => t.innerText.trim()).filter(Boolean),
        }));
        if (items.length) out.periods.push({ name: title, items });
      });
    } else {
      // Fallback: grab all items flat, no period grouping
      const items = [...document.querySelectorAll('.menu-item-container')].map(el => ({
        name: (el.querySelector('.left') || el).innerText.trim().split('\n')[0],
        tags: [...el.querySelectorAll('[class*="tag"], [class*="Tag"]')].map(t => t.innerText.trim()).filter(Boolean),
      }));
      out.periods.push({ name: 'All', items });
    }

    return out;
  });

  await page.close();
  data.scrapedAt = new Date().toISOString();
  data.source    = url;
  return data;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [name, url] of Object.entries(HALLS)) {
      try {
        const data = await scrapeHall(browser, name, url);
        const file = path.join(OUT_DIR, `${name}.json`);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        const count = data.periods.reduce((s, p) => s + p.items.length, 0);
        console.log(`[${name}] wrote ${count} items to ${file}`);
      } catch (e) {
        console.error(`[${name}] failed:`, e.message);
      }
    }
  } finally {
    await browser.close();
  }
})();
