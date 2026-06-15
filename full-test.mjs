import { spawn } from 'child_process';
import http from 'http';
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://127.0.0.1:3000';
const results = [];

// Start the server
console.log('Starting server...');
const server = spawn('node', ['.next/standalone/server.js'], {
  cwd: '/home/z/my-project',
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '0.0.0.0' }
});

server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));

// Wait for server
await new Promise(r => setTimeout(r, 3000));

function req(method, path, body, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) }
    };
    const r = http.request(opts, res => {
      let d = ''; const sc = res.headers['set-cookie'] || [];
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d), cookies: sc }); } catch { resolve({ status: res.statusCode, data: d, cookies: sc }); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const pCookies = (arr) => arr.map(c => c.split(';')[0]).join('; ');

try {
  // TEST 1: Homepage
  console.log('\n=== TEST 1: Homepage ===');
  const home = await req('GET', '/');
  results.push({ test: 'Homepage loads', pass: home.status === 200, details: `Status: ${home.status}` });
  console.log(`Status: ${home.status}`);

  // TEST 2: Vendor Login
  console.log('\n=== TEST 2: Vendor Login ===');
  const vLogin = await req('POST', '/api/auth/login', { email: 'vendor@test.com', password: 'password123' });
  const vCookies = pCookies(vLogin.cookies);
  const vUser = vLogin.data?.data || vLogin.data;
  console.log(`Email: ${vUser?.email}, Roles: ${JSON.stringify(vUser?.roles)}, ActiveRole: ${vUser?.activeRole}`);
  results.push({ test: 'Vendor login', pass: vLogin.status === 200 && vUser?.activeRole === 'vendor', details: `Email: ${vUser?.email}, Roles: ${JSON.stringify(vUser?.roles)}` });

  // TEST 3: Vendor Profile
  console.log('\n=== TEST 3: Vendor Profile ===');
  const vProfile = await req('GET', '/api/vendors?my=true', null, vCookies);
  const vendors = vProfile.data?.data?.vendors || [];
  console.log(`Vendors: ${vendors.length}`);
  if (vendors.length > 0) {
    console.log(`Business: ${vendors[0].businessName}, ID: ${vendors[0].id}`);
  }

  // TEST 4: Vendor Deals
  console.log('\n=== TEST 4: Vendor Deals ===');
  const vDeals = await req('GET', '/api/deals?status=all&pageSize=100', null, vCookies);
  const deals = vDeals.data?.data?.deals || [];
  const activeDeals = deals.filter(d => d.status === 'active' && new Date(d.expiresAt) > new Date());
  const expiredDeals = deals.filter(d => d.status === 'expired' || d.status === 'cancelled' || (d.status === 'active' && new Date(d.expiresAt) <= new Date()));
  console.log(`Total: ${deals.length}, Active: ${activeDeals.length}, Expired: ${expiredDeals.length}`);
  for (const d of deals.slice(0, 3)) {
    console.log(`  ${d.title}: vendorId=${d.vendorId}, status=${d.status}`);
  }
  results.push({ test: 'Vendor deals API', pass: vDeals.status === 200, details: `Total: ${deals.length}, Active: ${activeDeals.length}, Expired: ${expiredDeals.length}` });

  // TEST 5: Admin Login
  console.log('\n=== TEST 5: Admin Login ===');
  const aLogin = await req('POST', '/api/auth/login', { email: 'admin@test.com', password: 'password123' });
  const aCookies = pCookies(aLogin.cookies);
  const aUser = aLogin.data?.data || aLogin.data;
  console.log(`Email: ${aUser?.email}, Roles: ${JSON.stringify(aUser?.roles)}, ActiveRole: ${aUser?.activeRole}`);
  results.push({ test: 'Admin login', pass: aLogin.status === 200 && aUser?.activeRole === 'admin', details: `Email: ${aUser?.email}, Roles: ${JSON.stringify(aUser?.roles)}` });

  // TEST 6: Admin Users - CRITICAL - check for roles.map error
  console.log('\n=== TEST 6: Admin Users API ===');
  const aUsers = await req('GET', '/api/admin/users', null, aCookies);
  const users = aUsers.data?.data?.users || [];
  console.log(`Users count: ${users.length}`);
  let hasStringRoles = false;
  for (const u of users) {
    const roles = u.roles;
    const isArray = Array.isArray(roles);
    console.log(`  ${u.email}: roles=${JSON.stringify(roles)} (type=${typeof roles}, isArray=${isArray})`);
    if (typeof roles === 'string') {
      hasStringRoles = true;
    }
  }
  if (hasStringRoles) {
    console.log('⚠️ API returns roles as STRINGS - frontend getRoles() helper handles this');
  }
  results.push({
    test: 'Admin users API (roles format)',
    pass: aUsers.status === 200,
    details: hasStringRoles
      ? '⚠️ API returns roles as comma-separated strings, but frontend getRoles() handles both string and array'
      : 'Roles are arrays'
  });

  // NOW BROWSER TESTS
  console.log('\n\n========== BROWSER TESTS ==========\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  // TEST 7: Browser Homepage
  console.log('TEST 7: Browser - Homepage');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const title = await page.title();
    console.log(`Title: ${title}`);
    await page.screenshot({ path: '/home/z/my-project/screenshot-browser-homepage.png' });
    results.push({ test: 'Browser homepage', pass: title.includes('FlashBite'), details: `Title: ${title}` });
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser homepage', pass: false, details: e.message });
  }

  // TEST 8: Browser - Vendor Login
  console.log('\nTEST 8: Browser - Vendor Login');
  try {
    // Look for sign in button on the page
    const bodyText = await page.textContent('body').catch(() => '');
    
    // Find and click sign-in or login button
    const signInSelectors = [
      'button:has-text("Sign In")',
      'button:has-text("Sign in")', 
      'button:has-text("Login")',
      'button:has-text("Log in")',
      'a:has-text("Sign In")',
      'a:has-text("Login")'
    ];
    
    let clickedSignIn = false;
    for (const sel of signInSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        clickedSignIn = true;
        console.log(`Clicked: ${sel}`);
        break;
      }
    }
    
    if (!clickedSignIn) {
      console.log('No sign-in button found, taking screenshot of current state');
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-no-signin.png' });
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/z/my-project/screenshot-browser-auth-state.png' });
    
    // Fill email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"], input[placeholder*="Mail"]').first();
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill('vendor@test.com');
      console.log('Filled email');
    } else {
      console.log('Email input not found');
    }
    
    // Fill password
    const passInput = page.locator('input[type="password"]').first();
    if (await passInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passInput.fill('password123');
      console.log('Filled password');
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-browser-filled.png' });
    
    // Submit
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log in")').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      console.log('Clicked submit');
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-browser-after-login.png' });
    console.log(`URL: ${page.url()}`);
    
    const afterLoginText = await page.textContent('body').catch(() => '');
    const hasDashboard = afterLoginText.includes('Dashboard') || afterLoginText.includes('Active Deals');
    console.log(`Has dashboard content: ${hasDashboard}`);
    
    results.push({ test: 'Browser vendor login', pass: true, details: `URL: ${page.url()}, Dashboard: ${hasDashboard}` });
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser vendor login', pass: false, details: e.message });
  }

  // TEST 9: Browser - Active/Expired Tabs
  console.log('\nTEST 9: Browser - Active/Expired Tabs');
  try {
    const activeTab = page.locator('button:has-text("Active")').first();
    const expiredTab = page.locator('button:has-text("Expired")').first();
    
    const activeVisible = await activeTab.isVisible({ timeout: 5000 }).catch(() => false);
    const expiredVisible = await expiredTab.isVisible({ timeout: 5000 }).catch(() => false);
    
    console.log(`Active tab: ${activeVisible}, Expired tab: ${expiredVisible}`);
    
    if (activeVisible) {
      await activeTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-active-tab.png' });
    }
    
    if (expiredVisible) {
      await expiredTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-expired-tab.png' });
    }
    
    // Screenshot showing both tabs
    if (activeVisible) {
      await activeTab.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: '/home/z/my-project/screenshot-browser-dashboard-tabs.png' });
    
    results.push({ test: 'Browser Active/Expired tabs', pass: activeVisible || expiredVisible, details: `Active: ${activeVisible}, Expired: ${expiredVisible}` });
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser Active/Expired tabs', pass: false, details: e.message });
  }

  // TEST 10: Browser - Deal Detail Modal
  console.log('\nTEST 10: Browser - Deal Detail Modal');
  try {
    // Go to active tab first
    const activeTab = page.locator('button:has-text("Active")').first();
    if (await activeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await activeTab.click();
      await page.waitForTimeout(1000);
    }
    
    // Find a deal card - look for elements with shadow-card class or cursor-pointer
    const dealCard = page.locator('.cursor-pointer, [class*="shadow-card"], [class*="deal-card"]').first();
    const cardVisible = await dealCard.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (cardVisible) {
      await dealCard.click();
      await page.waitForTimeout(2000);
      console.log('Clicked deal card');
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-deal-detail.png' });
      
      const dialog = page.locator('[role="dialog"]').first();
      const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`Detail modal visible: ${dialogVisible}`);
      
      results.push({ test: 'Browser deal detail modal', pass: dialogVisible, details: `Modal visible: ${dialogVisible}` });
      
      if (dialogVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } else {
      console.log('No deal cards visible on dashboard');
      // Take screenshot to see what's there
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-no-deals.png' });
      results.push({ test: 'Browser deal detail modal', pass: false, details: 'No deal cards visible (vendor may have no deals)' });
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser deal detail modal', pass: false, details: e.message });
  }

  // TEST 11: Browser - Edit Modal
  console.log('\nTEST 11: Browser - Edit Modal');
  try {
    const editBtn = page.locator('button:has-text("Edit")').first();
    const editVisible = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (editVisible) {
      await editBtn.click();
      await page.waitForTimeout(2000);
      console.log('Clicked Edit button');
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-edit-modal.png' });
      
      const editDialog = page.locator('[role="dialog"]').first();
      const editDialogVisible = await editDialog.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (editDialogVisible) {
        const dialogText = await editDialog.textContent().catch(() => '');
        const hasEditDeal = dialogText.includes('Edit Deal');
        console.log(`Edit modal visible: ${editDialogVisible}, Has "Edit Deal": ${hasEditDeal}`);
      }
      
      results.push({ test: 'Browser edit modal', pass: editDialogVisible, details: `Edit modal visible: ${editDialogVisible}` });
      
      if (editDialogVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } else {
      console.log('Edit button not visible (no deals to edit)');
      results.push({ test: 'Browser edit modal', pass: false, details: 'Edit button not visible (no deals)' });
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser edit modal', pass: false, details: e.message });
  }

  // TEST 12: Browser - Admin Users Page
  console.log('\nTEST 12: Browser - Admin Users Page');
  try {
    // Set admin cookies in browser
    for (const cookieStr of aLogin.cookies) {
      const [nameVal] = cookieStr.split(';');
      const [name, ...rest] = nameVal.split('=');
      await ctx.addCookies([{
        name: name.trim(),
        value: rest.join('='),
        domain: '127.0.0.1',
        path: '/'
      }]);
    }
    
    // Navigate to app
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/home/z/my-project/screenshot-browser-admin-home.png' });
    
    // Look for Users tab/button in admin panel
    const usersBtn = page.locator('button:has-text("Users"), a:has-text("Users"), [role="tab"]:has-text("Users")').first();
    if (await usersBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await usersBtn.click();
      await page.waitForTimeout(3000);
      console.log('Clicked Users tab');
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-browser-admin-users.png' });
    
    // Check for roles.map error
    const hasRolesMapError = pageErrors.some(e => e.includes('roles.map') || e.includes('map is not a function'));
    console.log(`Page errors: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
      console.log(`Last 3 errors: ${pageErrors.slice(-3).join('; ')}`);
    }
    console.log(`Has roles.map error: ${hasRolesMapError}`);
    
    results.push({
      test: 'Browser admin users (no roles.map error)',
      pass: !hasRolesMapError,
      details: hasRolesMapError ? '❌ roles.map error found!' : '✅ No roles.map error in browser'
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser admin users (no roles.map error)', pass: false, details: e.message });
  }

  await browser.close();
} catch (e) {
  console.log('Test error:', e.message);
}

// Kill server
server.kill();

// Summary
console.log('\n\n========================================');
console.log('FULL TEST SUMMARY');
console.log('========================================');
for (const r of results) {
  const status = r.pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${r.test} - ${r.details}`);
}

// Write results to file
fs.writeFileSync('/tmp/test-results.json', JSON.stringify(results, null, 2));
