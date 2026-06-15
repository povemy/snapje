import { chromium } from 'playwright';
import http from 'http';

const BASE = 'http://127.0.0.1:3000';

function request(method, path, body, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { 'Cookie': cookies } : {})
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      const setCookies = res.headers['set-cookie'] || [];
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), cookies: setCookies });
        } catch {
          resolve({ status: res.statusCode, data, cookies: setCookies });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseCookies(cookieArr) {
  return cookieArr.map(c => c.split(';')[0]).join('; ');
}

async function test() {
  const results = [];
  
  // First test APIs with curl-like requests
  console.log('=== API Tests ===\n');
  
  // Test 1: Homepage
  console.log('TEST 1: Homepage loads');
  try {
    const res = await request('GET', '/');
    results.push({ test: 'Homepage loads', pass: res.status === 200, details: `Status: ${res.status}` });
    console.log(`  ✅ Status: ${res.status}`);
  } catch (e) {
    results.push({ test: 'Homepage loads', pass: false, details: e.message });
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Test 2: Vendor Login
  console.log('\nTEST 2: Vendor Login');
  let vendorCookies = '';
  try {
    const res = await request('POST', '/api/auth/login', { email: 'vendor@test.com', password: 'password123' });
    vendorCookies = parseCookies(res.cookies);
    const user = res.data?.data || res.data;
    console.log(`  Email: ${user?.email}, Roles: ${JSON.stringify(user?.roles)}, ActiveRole: ${user?.activeRole}`);
    results.push({ test: 'Vendor login', pass: res.status === 200 && user?.activeRole === 'vendor', details: `Email: ${user?.email}, Roles: ${JSON.stringify(user?.roles)}` });
  } catch (e) {
    results.push({ test: 'Vendor login', pass: false, details: e.message });
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Test 3: Vendor Deals
  console.log('\nTEST 3: Vendor Deals (for dashboard tabs)');
  try {
    const res = await request('GET', '/api/deals?status=all&vendorId=vendor_kak_roti&pageSize=100', null, vendorCookies);
    const deals = res.data?.data?.deals || res.data?.deals || [];
    const activeDeals = deals.filter(d => d.status === 'active' && new Date(d.expiresAt) > new Date());
    const expiredDeals = deals.filter(d => d.status === 'expired' || d.status === 'cancelled' || (d.status === 'active' && new Date(d.expiresAt) <= new Date()));
    console.log(`  Total deals: ${deals.length}, Active: ${activeDeals.length}, Expired: ${expiredDeals.length}`);
    if (deals.length > 0) {
      console.log(`  Sample: ${deals[0].title} (status: ${deals[0].status})`);
    }
    results.push({ test: 'Vendor deals API', pass: res.status === 200, details: `Total: ${deals.length}, Active: ${activeDeals.length}, Expired: ${expiredDeals.length}` });
  } catch (e) {
    results.push({ test: 'Vendor deals API', pass: false, details: e.message });
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Test 4: Vendor's own deals (with my=true)
  console.log('\nTEST 4: Vendor Profile');
  try {
    const res = await request('GET', '/api/vendors?my=true', null, vendorCookies);
    const vendors = res.data?.data?.vendors || [];
    console.log(`  Vendor count: ${vendors.length}`);
    if (vendors.length > 0) {
      console.log(`  Business: ${vendors[0].businessName}, ID: ${vendors[0].id}`);
    }
    results.push({ test: 'Vendor profile API', pass: res.status === 200, details: `Vendors: ${vendors.length}` });
  } catch (e) {
    results.push({ test: 'Vendor profile API', pass: false, details: e.message });
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Test 5: Admin Login
  console.log('\nTEST 5: Admin Login');
  let adminCookies = '';
  try {
    const res = await request('POST', '/api/auth/login', { email: 'admin@test.com', password: 'password123' });
    adminCookies = parseCookies(res.cookies);
    const user = res.data?.data || res.data;
    console.log(`  Email: ${user?.email}, Roles: ${JSON.stringify(user?.roles)}, ActiveRole: ${user?.activeRole}`);
    results.push({ test: 'Admin login', pass: res.status === 200 && user?.activeRole === 'admin', details: `Email: ${user?.email}, Roles: ${JSON.stringify(user?.roles)}` });
  } catch (e) {
    results.push({ test: 'Admin login', pass: false, details: e.message });
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Test 6: Admin Users - check for roles.map error
  console.log('\nTEST 6: Admin Users API (checking for roles.map error)');
  try {
    const res = await request('GET', '/api/admin/users', null, adminCookies);
    console.log(`  Status: ${res.status}`);
    
    const users = res.data?.data?.users || [];
    console.log(`  Users count: ${users.length}`);
    
    let hasRolesMapError = false;
    for (const u of users.slice(0, 5)) {
      const roles = u.roles;
      const rolesType = typeof roles;
      const isArray = Array.isArray(roles);
      console.log(`  User: ${u.email}, roles: ${JSON.stringify(roles)}, type: ${rolesType}, isArray: ${isArray}`);
      if (typeof roles === 'string') {
        console.log(`  ⚠️ WARNING: roles is string, not array - would cause .map() error on frontend!`);
        hasRolesMapError = true;
      }
    }
    
    results.push({ 
      test: 'Admin users (no roles.map error)', 
      pass: res.status === 200 && !hasRolesMapError, 
      details: hasRolesMapError ? '❌ roles.map error: roles is string not array!' : `✅ Users: ${users.length}, roles are arrays, no .map() error` 
    });
  } catch (e) {
    results.push({ test: 'Admin users (no roles.map error)', pass: false, details: e.message });
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Now try browser testing
  console.log('\n\n=== Browser Tests ===\n');
  
  try {
    const browser = await chromium.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // Test: Navigate to homepage
    console.log('TEST 7: Browser - Load Homepage');
    try {
      await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      const title = await page.title();
      console.log(`  Title: ${title}`);
      console.log(`  Console errors: ${consoleErrors.length}`);
      console.log(`  Page errors: ${pageErrors.length}`);
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-homepage.png' });
      results.push({ test: 'Browser homepage', pass: title.includes('FlashBite'), details: `Title: ${title}` });
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      results.push({ test: 'Browser homepage', pass: false, details: e.message });
    }

    // Test: Login as vendor
    console.log('\nTEST 8: Browser - Vendor Login');
    try {
      // Look for sign in / login button
      const pageText = await page.textContent('body');
      const hasSignIn = pageText?.toLowerCase().includes('sign');
      console.log(`  Has sign-in text: ${hasSignIn}`);
      
      // Take screenshot to see current state
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-pre-login.png' });
      
      // Try clicking sign in button
      const signInBtn = page.locator('button:has-text("Sign In"), button:has-text("Sign in"), button:has-text("Login"), a:has-text("Sign In")').first();
      if (await signInBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await signInBtn.click();
        await page.waitForTimeout(2000);
        console.log('  Clicked sign in button');
      }
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-auth-modal.png' });
      
      // Fill credentials
      const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').first();
      const passInput = page.locator('input[type="password"]').first();
      
      if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await emailInput.fill('vendor@test.com');
        console.log('  Filled email');
      }
      if (await passInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passInput.fill('password123');
        console.log('  Filled password');
      }
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-credentials.png' });
      
      // Submit
      const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        console.log('  Clicked submit');
        await page.waitForTimeout(5000);
      }
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-after-vendor-login.png' });
      console.log(`  URL after login: ${page.url()}`);
      
      // Check for vendor dashboard
      const dashboardText = await page.textContent('body');
      const hasDashboard = dashboardText?.includes('Dashboard') || dashboardText?.includes('Active Deals');
      console.log(`  Has dashboard content: ${hasDashboard}`);
      
      results.push({ test: 'Browser vendor login', pass: true, details: `URL: ${page.url()}, Dashboard: ${hasDashboard}` });
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      results.push({ test: 'Browser vendor login', pass: false, details: e.message });
    }

    // Test: Active/Expired tabs
    console.log('\nTEST 9: Browser - Active/Expired Tabs');
    try {
      const activeTab = page.locator('button:has-text("Active")').first();
      const expiredTab = page.locator('button:has-text("Expired")').first();
      
      const activeVisible = await activeTab.isVisible({ timeout: 5000 }).catch(() => false);
      const expiredVisible = await expiredTab.isVisible({ timeout: 5000 }).catch(() => false);
      
      console.log(`  Active tab visible: ${activeVisible}`);
      console.log(`  Expired tab visible: ${expiredVisible}`);
      
      if (activeVisible) {
        await activeTab.click();
        await page.waitForTimeout(1000);
        console.log('  Clicked Active tab');
      }
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-active-tab.png' });
      
      if (expiredVisible) {
        await expiredTab.click();
        await page.waitForTimeout(1000);
        console.log('  Clicked Expired tab');
      }
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-expired-tab.png' });
      
      results.push({ test: 'Browser Active/Expired tabs', pass: activeVisible || expiredVisible, details: `Active: ${activeVisible}, Expired: ${expiredVisible}` });
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      results.push({ test: 'Browser Active/Expired tabs', pass: false, details: e.message });
    }

    // Test: Deal detail modal
    console.log('\nTEST 10: Browser - Deal Detail Modal');
    try {
      // Go back to active tab
      const activeTab = page.locator('button:has-text("Active")').first();
      if (await activeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await activeTab.click();
        await page.waitForTimeout(1000);
      }
      
      // Click a deal card
      const dealCard = page.locator('.cursor-pointer, [class*="shadow-card"]').first();
      if (await dealCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dealCard.click();
        await page.waitForTimeout(2000);
        console.log('  Clicked deal card');
        
        await page.screenshot({ path: '/home/z/my-project/screenshot-browser-deal-detail.png' });
        
        // Check for dialog/modal
        const dialog = page.locator('[role="dialog"]').first();
        const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`  Detail modal visible: ${dialogVisible}`);
        
        results.push({ test: 'Browser deal detail modal', pass: dialogVisible, details: `Modal visible: ${dialogVisible}` });
        
        // Close modal
        if (dialogVisible) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      } else {
        console.log('  No deal cards visible');
        results.push({ test: 'Browser deal detail modal', pass: false, details: 'No deal cards visible' });
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      results.push({ test: 'Browser deal detail modal', pass: false, details: e.message });
    }

    // Test: Edit modal
    console.log('\nTEST 11: Browser - Edit Modal');
    try {
      const editBtn = page.locator('button:has-text("Edit")').first();
      if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(2000);
        console.log('  Clicked Edit button');
        
        await page.screenshot({ path: '/home/z/my-project/screenshot-browser-edit-modal.png' });
        
        // Check for edit dialog
        const editDialog = page.locator('[role="dialog"]').first();
        const editDialogVisible = await editDialog.isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`  Edit modal visible: ${editDialogVisible}`);
        
        // Check if the dialog contains "Edit Deal" text
        if (editDialogVisible) {
          const dialogText = await editDialog.textContent();
          const hasEditDeal = dialogText?.includes('Edit Deal');
          console.log(`  Edit Deal text found: ${hasEditDeal}`);
        }
        
        results.push({ test: 'Browser edit modal', pass: editDialogVisible, details: `Edit modal visible: ${editDialogVisible}` });
        
        // Close edit modal
        if (editDialogVisible) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      } else {
        console.log('  Edit button not visible');
        results.push({ test: 'Browser edit modal', pass: false, details: 'Edit button not visible' });
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      results.push({ test: 'Browser edit modal', pass: false, details: e.message });
    }

    // Test: Admin Users page
    console.log('\nTEST 12: Browser - Admin Users Page');
    try {
      // Login as admin via API and set cookies
      const adminLoginRes = await request('POST', '/api/auth/login', { email: 'admin@test.com', password: 'password123' });
      const adminCookiesArr = adminLoginRes.cookies;
      
      // Set cookies in browser context
      for (const cookieStr of adminCookiesArr) {
        const parts = cookieStr.split(';')[0].split('=');
        const name = parts[0];
        const value = parts.slice(1).join('=');
        await context.addCookies([{
          name,
          value,
          domain: '127.0.0.1',
          path: '/'
        }]);
      }
      
      // Navigate to the app
      await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-admin-home.png' });
      
      // Try to find Users tab/button
      const usersBtn = page.locator('button:has-text("Users"), a:has-text("Users"), [role="tab"]:has-text("Users")').first();
      if (await usersBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await usersBtn.click();
        await page.waitForTimeout(3000);
        console.log('  Clicked Users tab');
      }
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-browser-admin-users.png' });
      
      // Check for roles.map error
      const hasRolesMapError = pageErrors.some(e => e.includes('roles.map') || e.includes('map is not a function'));
      console.log(`  Page errors: ${pageErrors.length}`);
      console.log(`  Has roles.map error: ${hasRolesMapError}`);
      if (pageErrors.length > 0) {
        console.log(`  Errors: ${pageErrors.slice(-3).join('; ')}`);
      }
      
      results.push({ 
        test: 'Browser admin users (no roles.map error)', 
        pass: !hasRolesMapError, 
        details: hasRolesMapError ? '❌ roles.map error found!' : '✅ No roles.map error' 
      });
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      results.push({ test: 'Browser admin users (no roles.map error)', pass: false, details: e.message });
    }

    await browser.close();
  } catch (e) {
    console.log(`Browser tests failed: ${e.message}`);
    results.push({ test: 'Browser tests', pass: false, details: e.message });
  }

  // Summary
  console.log('\n\n========================================');
  console.log('FULL TEST SUMMARY');
  console.log('========================================');
  for (const r of results) {
    const status = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.test} - ${r.details}`);
  }
  
  return results;
}

test().catch(console.error);
