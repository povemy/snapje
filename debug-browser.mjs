import { spawn } from 'child_process';
import { chromium } from 'playwright';

// Start server
const server = spawn('node', ['.next/standalone/server.js'], {
  cwd: '/home/z/my-project',
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '0.0.0.0' }
});
server.stdout.on('data', d => process.stdout.write(d));
server.stderr.on('data', d => process.stderr.write(d));
await new Promise(r => setTimeout(r, 3000));

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Collect all console messages
const allConsole = [];
page.on('console', msg => {
  allConsole.push({ type: msg.type(), text: msg.text().substring(0, 200) });
});

const pageErrors = [];
page.on('pageerror', err => pageErrors.push(err.message));

// Collect network errors
const failedRequests = [];
page.on('requestfailed', req => {
  failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
});

console.log('Navigating to page...');
await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });

console.log('Waiting for JS to load...');
await page.waitForTimeout(10000);

// Check what the page looks like now
const bodyText = await page.textContent('body').catch(() => 'NO BODY TEXT');
console.log('\n=== Page Body Text (first 500 chars) ===');
console.log(bodyText.substring(0, 500));

console.log('\n=== Console Messages ===');
for (const msg of allConsole) {
  console.log(`[${msg.type}] ${msg.text}`);
}

console.log('\n=== Page Errors ===');
for (const err of pageErrors) {
  console.log(err);
}

console.log('\n=== Failed Network Requests ===');
for (const req of failedRequests) {
  console.log(`${req.url}: ${req.failure}`);
}

// Try to check if JS is executing at all
const jsWorking = await page.evaluate(() => {
  return {
    hasReact: typeof window.__NEXT_DATA__ !== 'undefined',
    hasDocument: typeof document !== 'undefined',
    bodyChildren: document.body.children.length,
    bodyHTML: document.body.innerHTML.substring(0, 500)
  };
}).catch(e => ({ error: e.message }));

console.log('\n=== JS Evaluation Result ===');
console.log(JSON.stringify(jsWorking, null, 2));

await page.screenshot({ path: '/home/z/my-project/screenshot-debug.png' });

await browser.close();
server.kill();
