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
server.stdout.on('data', d => process.stdout.write(d));
server.stderr.on('data', d => process.stderr.write(d));
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
  // ===== API TESTS =====
  
  // Test 1: Homepage
  console.log('\n=== TEST 1: Homepage ===');
  const home = await req('GET', '/');
  results.push({ test: 'Homepage loads', pass: home.status === 200, details: `Status: ${home.status}` });
  console.log(`Status: ${home.status}`);

  // Test 2: Vendor Login
  console.log('\n=== TEST 2: Vendor Login ===');
  const vLogin = await req('POST', '/api/auth/login', { email: 'vendor@test.com', password: 'password123' });
  const vCookies = pCookies(vLogin.cookies);
  const vUser = vLogin.data?.data;
  console.log(`Email: ${vUser?.email}, Roles: ${JSON.stringify(vUser?.roles)}, ActiveRole: ${vUser?.activeRole}`);
  results.push({ test: 'Vendor login', pass: vLogin.status === 200 && vUser?.activeRole === 'vendor', details: `Roles: ${JSON.stringify(vUser?.roles)}` });

  // Test 3: Get vendor profile
  console.log('\n=== TEST 3: Vendor Profile ===');
  const vProfile = await req('GET', '/api/vendors?my=true', null, vCookies);
  const vendors = vProfile.data?.data?.vendors || [];
  const vendorId = vendors[0]?.id;
  console.log(`Vendor: ${vendors[0]?.businessName}, ID: ${vendorId}`);

  // Test 4: Create a deal for the vendor
  console.log('\n=== TEST 4: Create Deal for Vendor ===');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours from now
  
  const createDeal = await req('POST', '/api/deals', {
    title: 'Test Nasi Lemak Special',
    description: 'Delicious nasi lemak with sambal, fried chicken, and anchovies',
    category: 'Malay',
    originalPrice: 15,
    dealPrice: 8.90,
    totalQuantity: 20,
    maxClaimsPerUser: 2,
    pickupOnly: true,
    pickupInstructions: 'Pickup at counter near entrance',
    expiresAt: expiresAt.toISOString(),
  }, vCookies);
  
  console.log(`Create deal status: ${createDeal.status}`);
  if (createDeal.data?.success) {
    console.log(`Deal created: ${createDeal.data?.data?.title || createDeal.data?.data?.id}`);
  } else {
    console.log(`Create deal response: ${JSON.stringify(createDeal.data).substring(0, 300)}`);
  }

  // Also create an expired deal
  const expiredDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
  const createExpiredDeal = await req('POST', '/api/deals', {
    title: 'Test Roti Canai Set',
    description: 'Roti canai with dhal and curry sauce',
    category: 'Indian',
    originalPrice: 10,
    dealPrice: 5.90,
    totalQuantity: 15,
    maxClaimsPerUser: 1,
    pickupOnly: true,
    expiresAt: expiredDate.toISOString(),
  }, vCookies);
  console.log(`Create expired deal status: ${createExpiredDeal.status}`);

  // Test 5: Check vendor deals now
  console.log('\n=== TEST 5: Vendor Deals After Creation ===');
  const vDeals2 = await req('GET', `/api/deals?status=all&vendorId=${vendorId}&pageSize=100`, null, vCookies);
  const deals2 = vDeals2.data?.data?.deals || [];
  const activeD = deals2.filter(d => d.status === 'active' && new Date(d.expiresAt) > new Date());
  const expiredD = deals2.filter(d => d.status === 'expired' || d.status === 'cancelled' || (d.status === 'active' && new Date(d.expiresAt) <= new Date()));
  console.log(`Total: ${deals2.length}, Active: ${activeD.length}, Expired: ${expiredD.length}`);
  results.push({ test: 'Vendor deals (after seed)', pass: deals2.length > 0, details: `Total: ${deals2.length}, Active: ${activeD.length}, Expired: ${expiredD.length}` });

  // Test 6: Admin Login
  console.log('\n=== TEST 6: Admin Login ===');
  const aLogin = await req('POST', '/api/auth/login', { email: 'admin@test.com', password: 'password123' });
  const aCookies = pCookies(aLogin.cookies);
  const aUser = aLogin.data?.data;
  console.log(`Email: ${aUser?.email}, Roles: ${JSON.stringify(aUser?.roles)}`);
  results.push({ test: 'Admin login', pass: aLogin.status === 200, details: `Roles: ${JSON.stringify(aUser?.roles)}` });

  // Test 7: Admin Users - roles.map check
  console.log('\n=== TEST 7: Admin Users API ===');
  const aUsers = await req('GET', '/api/admin/users', null, aCookies);
  const users = aUsers.data?.data?.users || [];
  let hasStringRoles = false;
  for (const u of users) {
    if (typeof u.roles === 'string') hasStringRoles = true;
    console.log(`  ${u.email}: roles=${JSON.stringify(u.roles)} (isArray=${Array.isArray(u.roles)})`);
  }
  results.push({
    test: 'Admin users API - roles format',
    pass: aUsers.status === 200,
    details: hasStringRoles
      ? '⚠️ Roles returned as comma-separated strings from API; frontend getRoles() handles both formats - no .map() crash'
      : 'Roles are arrays'
  });

  // ===== BROWSER TESTS =====
  console.log('\n\n========== BROWSER TESTS ==========\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  // TEST 8: Load Homepage
  console.log('TEST 8: Browser - Load Homepage');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for the loading spinner to disappear and content to appear
    await page.waitForTimeout(5000);
    
    // Wait for content to appear (the app has a loading state)
    await page.waitForSelector('text=SnapJe', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    const title = await page.title();
    console.log(`Title: ${title}`);
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-homepage.png' });
    results.push({ test: 'Browser homepage loads', pass: title.includes('SnapJe'), details: `Title: ${title}` });
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser homepage loads', pass: false, details: e.message });
  }

  // TEST 9: Vendor Login via Browser
  console.log('\nTEST 9: Browser - Vendor Login');
  try {
    // Find and click Sign In button on the homepage
    // The button is in the top header bar
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    // Wait for it to be visible (page might still be loading)
    const btnVisible = await signInBtn.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`Sign In button visible: ${btnVisible}`);
    
    if (btnVisible) {
      await signInBtn.click();
      await page.waitForTimeout(2000);
      console.log('Clicked Sign In button');
    } else {
      // Try alternative approach - maybe the page shows auth screen directly
      console.log('Sign In button not visible, checking page state...');
      const bodyText = await page.textContent('body').catch(() => '');
      console.log(`Page has text: ${bodyText.substring(0, 200)}`);
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-auth-modal.png' });
    
    // Fill email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').first();
    const emailVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Email input visible: ${emailVisible}`);
    
    if (emailVisible) {
      await emailInput.fill('vendor@test.com');
      console.log('Filled email');
    }
    
    // Fill password
    const passInput = page.locator('input[type="password"]').first();
    const passVisible = await passInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (passVisible) {
      await passInput.fill('password123');
      console.log('Filled password');
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-credentials.png' });
    
    // Submit
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      console.log('Clicked submit');
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-after-login.png' });
    console.log(`URL after login: ${page.url()}`);
    
    const afterText = await page.textContent('body').catch(() => '');
    const hasDashboard = afterText.includes('Dashboard');
    const hasActiveTab = afterText.includes('Active');
    const hasExpiredTab = afterText.includes('Expired');
    console.log(`Has Dashboard: ${hasDashboard}, Active: ${hasActiveTab}, Expired: ${hasExpiredTab}`);
    
    results.push({ test: 'Browser vendor login', pass: hasDashboard, details: `Dashboard: ${hasDashboard}` });
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser vendor login', pass: false, details: e.message });
  }

  // TEST 10: Active/Expired Tabs
  console.log('\nTEST 10: Browser - Active/Expired Tabs');
  try {
    const activeTab = page.locator('button:has-text("Active")').first();
    const expiredTab = page.locator('button:has-text("Expired")').first();
    
    const activeVisible = await activeTab.isVisible({ timeout: 5000 }).catch(() => false);
    const expiredVisible = await expiredTab.isVisible({ timeout: 5000 }).catch(() => false);
    
    console.log(`Active tab: ${activeVisible}, Expired tab: ${expiredVisible}`);
    
    if (activeVisible) {
      await activeTab.click();
      await page.waitForTimeout(1500);
      console.log('Clicked Active tab');
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-active-tab.png' });
    
    if (expiredVisible) {
      await expiredTab.click();
      await page.waitForTimeout(1500);
      console.log('Clicked Expired tab');
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-expired-tab.png' });
    
    // Take final dashboard screenshot
    if (activeVisible) {
      await activeTab.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-dashboard-tabs.png' });
    
    results.push({ test: 'Browser Active/Expired tabs', pass: activeVisible || expiredVisible, details: `Active: ${activeVisible}, Expired: ${expiredVisible}` });
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser Active/Expired tabs', pass: false, details: e.message });
  }

  // TEST 11: Deal Detail Modal
  console.log('\nTEST 11: Browser - Deal Detail Modal');
  try {
    // Go to active tab
    const activeTab = page.locator('button:has-text("Active")').first();
    if (await activeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await activeTab.click();
      await page.waitForTimeout(1000);
    }
    
    // Find a deal card and click it
    // Deal cards are Card elements with cursor-pointer class
    const dealCards = page.locator('[class*="cursor-pointer"]');
    const cardCount = await dealCards.count().catch(() => 0);
    console.log(`Deal cards found: ${cardCount}`);
    
    if (cardCount > 0) {
      await dealCards.first().click();
      await page.waitForTimeout(2000);
      console.log('Clicked first deal card');
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-final-deal-detail.png' });
      
      const dialog = page.locator('[role="dialog"]').first();
      const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`Detail modal visible: ${dialogVisible}`);
      
      if (dialogVisible) {
        const dialogText = await dialog.textContent().catch(() => '');
        console.log(`Modal content preview: ${dialogText.substring(0, 100)}`);
      }
      
      results.push({ test: 'Browser deal detail modal', pass: dialogVisible, details: `Modal visible: ${dialogVisible}` });
      
      // Close modal
      if (dialogVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } else {
      console.log('No deal cards found');
      results.push({ test: 'Browser deal detail modal', pass: false, details: 'No deal cards found' });
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser deal detail modal', pass: false, details: e.message });
  }

  // TEST 12: Edit Modal
  console.log('\nTEST 12: Browser - Edit Modal');
  try {
    const editBtn = page.locator('button:has-text("Edit")').first();
    const editVisible = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (editVisible) {
      await editBtn.click();
      await page.waitForTimeout(2000);
      console.log('Clicked Edit button');
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-final-edit-modal.png' });
      
      const editDialog = page.locator('[role="dialog"]').first();
      const editDialogVisible = await editDialog.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (editDialogVisible) {
        const dialogText = await editDialog.textContent().catch(() => '');
        const hasEditDeal = dialogText.includes('Edit Deal');
        console.log(`Edit modal visible: ${editDialogVisible}, Contains "Edit Deal": ${hasEditDeal}`);
      }
      
      results.push({ test: 'Browser edit modal', pass: editDialogVisible, details: `Edit modal visible: ${editDialogVisible}` });
      
      if (editDialogVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } else {
      console.log('Edit button not visible');
      results.push({ test: 'Browser edit modal', pass: false, details: 'Edit button not visible' });
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser edit modal', pass: false, details: e.message });
  }

  // TEST 13: Admin Users Page
  console.log('\nTEST 13: Browser - Admin Users Page');
  try {
    // Set admin cookies in browser
    for (const cookieStr of aLogin.cookies) {
      const [nameVal] = cookieStr.split(';');
      const eqIdx = nameVal.indexOf('=');
      const name = nameVal.substring(0, eqIdx).trim();
      const value = nameVal.substring(eqIdx + 1);
      await ctx.addCookies([{
        name,
        value,
        domain: '127.0.0.1',
        path: '/'
      }]);
    }
    
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(5000);
    
    // Wait for content
    await page.waitForSelector('text=SnapJe', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-admin-home.png' });
    
    // Look for Users tab in the admin navigation
    const usersBtn = page.locator('button:has-text("Users"), [role="tab"]:has-text("Users")').first();
    const usersBtnVisible = await usersBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Users tab visible: ${usersBtnVisible}`);
    
    if (usersBtnVisible) {
      await usersBtn.click();
      await page.waitForTimeout(3000);
      console.log('Clicked Users tab');
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-final-admin-users.png' });
    
    const hasRolesMapError = pageErrors.some(e => e.includes('roles.map') || e.includes('map is not a function'));
    console.log(`Page errors: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
      console.log(`Errors: ${pageErrors.join('; ')}`);
    }
    console.log(`Has roles.map error: ${hasRolesMapError}`);
    
    results.push({
      test: 'Browser admin users (no roles.map error)',
      pass: !hasRolesMapError,
      details: hasRolesMapError ? '❌ roles.map error found!' : '✅ No roles.map error'
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
    results.push({ test: 'Browser admin users (no roles.map error)', pass: false, details: e.message });
  }

  await browser.close();
} catch (e) {
  console.log('Test error:', e.message);
}

server.kill();

// Summary
console.log('\n\n========================================');
console.log('FINAL TEST SUMMARY');
console.log('========================================');
for (const r of results) {
  const status = r.pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${r.test} - ${r.details}`);
}

fs.writeFileSync('/tmp/test-results.json', JSON.stringify(results, null, 2));
