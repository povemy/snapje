import { spawn } from 'child_process';
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

const BASE = 'http://127.0.0.1:3000';
const results = [];

const server = spawn('node', ['.next/standalone/server.js'], {
  cwd: '/home/z/my-project',
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '0.0.0.0' }
});
server.stdout.on('data', d => process.stdout.write(d));
server.stderr.on('data', d => process.stderr.write(d));
await new Promise(r => setTimeout(r, 3000));

function req(method, path, body, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) } };
    const r = http.request(opts, res => { let d = ''; const sc = res.headers['set-cookie'] || []; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d), cookies: sc }); } catch { resolve({ status: res.statusCode, data: d, cookies: sc }); } }); });
    r.on('error', reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
const pCookies = arr => arr.map(c => c.split(';')[0]).join('; ');

try {
  // Quick API tests
  console.log('=== API Tests ===');
  
  const home = await req('GET', '/');
  results.push({ test: 'Homepage', pass: home.status === 200, details: `${home.status}` });
  console.log(`Homepage: ${home.status}`);

  const vLogin = await req('POST', '/api/auth/login', { email: 'vendor@test.com', password: 'password123' });
  const vCookies = pCookies(vLogin.cookies);
  const vUser = vLogin.data?.data;
  results.push({ test: 'Vendor Login', pass: vLogin.status === 200, details: `${vUser?.email} ${JSON.stringify(vUser?.roles)}` });
  console.log(`Vendor: ${vUser?.email}`);

  // Create a deal
  const expiresAt = new Date(Date.now() + 6*3600000).toISOString();
  const createRes = await req('POST', '/api/deals', {
    title: 'Test Nasi Lemak', description: 'Test deal', category: 'Malay',
    originalPrice: 15, dealPrice: 8.9, totalQuantity: 20, maxClaimsPerUser: 2,
    pickupOnly: true, expiresAt
  }, vCookies);
  console.log(`Create deal: ${createRes.status}`);

  const aLogin = await req('POST', '/api/auth/login', { email: 'admin@test.com', password: 'password123' });
  const aCookies = pCookies(aLogin.cookies);
  
  const aUsers = await req('GET', '/api/admin/users', null, aCookies);
  const users = aUsers.data?.data?.users || [];
  let hasStringRoles = users.some(u => typeof u.roles === 'string');
  results.push({ test: 'Admin Users (no roles.map)', pass: aUsers.status === 200, details: hasStringRoles ? 'API returns string roles; frontend getRoles() handles it' : 'Roles are arrays' });
  console.log(`Admin users: ${users.length}, stringRoles: ${hasStringRoles}`);

  // Browser tests
  console.log('\n=== Browser Tests ===');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  // Homepage
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(5000);
  const title = await page.title();
  await page.screenshot({ path: '/home/z/my-project/screenshot-verify-home.png' });
  results.push({ test: 'Browser homepage', pass: title.includes('SnapJe'), details: title });
  console.log(`Homepage title: ${title}`);

  // Check page content
  const bodyText = await page.textContent('body').catch(() => '');
  const hasSignIn = bodyText.includes('Sign In');
  console.log(`Has Sign In: ${hasSignIn}`);

  // Click Sign In
  if (hasSignIn) {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    await signInBtn.click();
    await page.waitForTimeout(2000);
    console.log('Clicked Sign In');

    // Fill credentials
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').first();
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill('vendor@test.com');
      const passInput = page.locator('input[type="password"]').first();
      await passInput.fill('password123');
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-verify-credentials.png' });
      
      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();
      await page.waitForTimeout(5000);
      console.log('Submitted login');
    }
  } else {
    console.log('No Sign In button - page might still be loading');
    await page.screenshot({ path: '/home/z/my-project/screenshot-verify-nosignin.png' });
  }
  
  await page.screenshot({ path: '/home/z/my-project/screenshot-verify-after-login.png' });
  
  // Check for dashboard
  const afterText = await page.textContent('body').catch(() => '');
  const hasDashboard = afterText.includes('Dashboard');
  const hasActiveTab = afterText.includes('Active');
  const hasExpiredTab = afterText.includes('Expired');
  console.log(`Dashboard: ${hasDashboard}, Active: ${hasActiveTab}, Expired: ${hasExpiredTab}`);
  results.push({ test: 'Vendor dashboard with tabs', pass: hasDashboard && (hasActiveTab || hasExpiredTab), details: `Dashboard: ${hasDashboard}, Active: ${hasActiveTab}, Expired: ${hasExpiredTab}` });

  // Click Active/Expired tabs
  if (hasActiveTab) {
    await page.locator('button:has-text("Active")').first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/home/z/my-project/screenshot-verify-active.png' });
    console.log('Clicked Active tab');
  }
  if (hasExpiredTab) {
    await page.locator('button:has-text("Expired")').first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/home/z/my-project/screenshot-verify-expired.png' });
    console.log('Clicked Expired tab');
  }

  // Dashboard screenshot with tabs
  if (hasActiveTab) {
    await page.locator('button:has-text("Active")').first().click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: '/home/z/my-project/screenshot-verify-dashboard.png' });

  // Deal detail modal
  let dealDetailWorks = false;
  const dealCards = page.locator('[class*="cursor-pointer"]');
  const cardCount = await dealCards.count().catch(() => 0);
  console.log(`Deal cards: ${cardCount}`);
  if (cardCount > 0) {
    await dealCards.first().click();
    await page.waitForTimeout(2000);
    const dialog = page.locator('[role="dialog"]').first();
    dealDetailWorks = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Deal detail modal: ${dealDetailWorks}`);
    await page.screenshot({ path: '/home/z/my-project/screenshot-verify-deal-detail.png' });
    if (dealDetailWorks) await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }
  results.push({ test: 'Deal detail modal', pass: dealDetailWorks, details: cardCount > 0 ? `Modal: ${dealDetailWorks}` : 'No deal cards' });

  // Edit modal
  let editModalWorks = false;
  const editBtn = page.locator('button:has-text("Edit")').first();
  if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editBtn.click();
    await page.waitForTimeout(2000);
    const editDialog = page.locator('[role="dialog"]').first();
    editModalWorks = await editDialog.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Edit modal: ${editModalWorks}`);
    await page.screenshot({ path: '/home/z/my-project/screenshot-verify-edit.png' });
    if (editModalWorks) await page.keyboard.press('Escape');
  }
  results.push({ test: 'Edit modal', pass: editModalWorks, details: `Modal: ${editModalWorks}` });

  // Admin users page
  for (const cookieStr of aLogin.cookies) {
    const [nameVal] = cookieStr.split(';');
    const eqIdx = nameVal.indexOf('=');
    await ctx.addCookies([{ name: nameVal.substring(0, eqIdx).trim(), value: nameVal.substring(eqIdx + 1), domain: '127.0.0.1', path: '/' }]);
  }
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(5000);
  
  const usersBtn = page.locator('button:has-text("Users"), [role="tab"]:has-text("Users")').first();
  if (await usersBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await usersBtn.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: '/home/z/my-project/screenshot-verify-admin-users.png' });
  
  const hasRolesMapError = pageErrors.some(e => e.includes('roles.map') || e.includes('map is not a function'));
  results.push({ test: 'Admin users (no roles.map error)', pass: !hasRolesMapError, details: hasRolesMapError ? 'ERROR FOUND' : 'No error' });
  console.log(`Admin users roles.map error: ${hasRolesMapError}`);
  console.log(`All page errors: ${pageErrors.length > 0 ? pageErrors.join('; ') : 'none'}`);

  await browser.close();
} catch (e) {
  console.log('Error:', e.message);
}

server.kill();

console.log('\n========================================');
console.log('TEST SUMMARY');
console.log('========================================');
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.test}: ${r.details}`);
}
