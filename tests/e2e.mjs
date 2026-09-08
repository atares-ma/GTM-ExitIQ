// End-to-end test of the GTM ExitIQ production page.
//
// Supabase REST is intercepted with mock data (run tests/gen-mock.mjs first);
// send-lead.php runs for real under PHP's built-in server with sendmail
// redirected to a file, so the whole lead path is exercised.
//
// Setup:
//   npm i playwright        (a Chromium install or PLAYWRIGHT_BROWSERS_PATH)
//   node tests/gen-mock.mjs
//   php -d sendmail_path="tee -a /tmp/exitiq-mail.txt >/dev/null" -S 127.0.0.1:8080 -t site &
//   node tests/e2e.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const SB = 'https://drkperzvmlkprawmzdzp.supabase.co';
const mockQuestions = readFileSync(new URL('mock-questions.json', import.meta.url), 'utf8');
const mockCategories = readFileSync(new URL('mock-categories.json', import.meta.url), 'utf8');

const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

let leadPosts = [];
await page.route(`${SB}/rest/v1/**`, async (route) => {
  const req = route.request();
  const url = req.url();
  if (url.includes('/rest/v1/qv_questions')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: mockQuestions });
  }
  if (url.includes('/rest/v1/qv_categories')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: mockCategories });
  }
  if (url.includes('/rest/v1/leads') && req.method() === 'POST') {
    leadPosts.push(JSON.parse(req.postData()));
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ status: 404, body: 'unexpected' });
});

page.on('pageerror', (e) => console.log('pageerror:', e.message));
const fail = (msg) => { console.log('FAIL:', msg); process.exitCode = 1; };

await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
const fontLoaded = await page.evaluate(() => document.fonts.check('800 24px "Open Sans"'));
console.log('Open Sans 800 loaded:', fontLoaded);
if (!fontLoaded) fail('self-hosted Open Sans did not load');

// Landing → sector → company form
await page.getByRole('button', { name: /Start your assessment|Start Free Assessment/ }).first().click();
await page.waitForTimeout(300);
await page.getByText('IT Services & Consulting', { exact: false }).first().click();
await page.waitForTimeout(300);
await page.locator('input').first().fill('Test GmbH');
const selects = page.locator('select');
for (let i = 0; i < await selects.count(); i++) {
  const opts = await selects.nth(i).locator('option').all();
  if (opts.length > 1) await selects.nth(i).selectOption({ index: 1 });
}
await page.getByRole('button', { name: /Continue to questions/ }).click();
await page.waitForTimeout(400);

// Walk the full question flow; the [DB] marker proves the Supabase bank is live.
let sawDbMarker = false;
let steps = 0;
while (steps < 60) {
  steps++;
  if ((await page.textContent('body')).includes('[DB]')) sawDbMarker = true;
  const next = page.getByRole('button', { name: /Next question|See my result/ }).first();
  const label = await next.textContent();
  await page.locator('button', { hasText: /.{20,}/ }).first().click().catch(() => {});
  await next.click();
  await page.waitForTimeout(120);
  if (/See my result/.test(label)) break;
}
console.log('question steps:', steps, '| saw [DB] marker:', sawDbMarker);
if (!sawDbMarker) fail('DB marker never appeared - Supabase bank not used');

// Result: name + email → summary (fires mail relay + Supabase lead insert)
const inputs = page.locator('input');
let filled = 0;
for (let i = 0; i < await inputs.count(); i++) {
  const el = inputs.nth(i);
  if (!(await el.isVisible().catch(() => false)) || await el.inputValue()) continue;
  await el.fill(filled === 0 ? 'Jane Doe' : 'jane.doe@example.com');
  filled++;
}
await page.getByRole('button', { name: /Show my assessment summary/ }).click();
await page.waitForTimeout(1500);
console.log('lead POSTs to Supabase:', leadPosts.length);
if (leadPosts.length < 1) fail('no lead insert reached Supabase');

// Introduction request (second lead, partner-routed)
const intro = page.getByRole('button', { name: /Request an introduction/ }).first();
if (await intro.isVisible().catch(() => false)) {
  await intro.click();
  await page.waitForTimeout(1200);
  console.log('lead POSTs after intro:', leadPosts.length);
  if (leadPosts.length < 2) fail('introduction request did not reach Supabase');
}

await browser.close();
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
