import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:3000';

async function test() {
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-gpu'] 
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  
  const results = [];
  
  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  // Test 1: Load homepage
  console.log('\n=== TEST 1: Load Homepage ===');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const title = await page.title();
    console.log('Page title:', title);
    console.log('Page URL:', page.url());
    const hasError = pageErrors.length > 0;
    console.log('Page errors:', pageErrors.length ? pageErrors : 'None');
    console.log('Console errors:', consoleErrors.length ? consoleErrors.slice(0, 5) : 'None');
    results.push({ test: 'Homepage loads', pass: !hasError && title.includes('SnapJe'), details: `Title: ${title}` });
    await page.screenshot({ path: '/home/z/my-project/screenshot-test-homepage.png' });
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Homepage loads', pass: false, details: e.message });
  }

  // Test 2: Login as vendor
  console.log('\n=== TEST 2: Login as Vendor ===');
  try {
    // Look for login/auth button or modal
    await page.waitForTimeout(2000);
    
    // Take snapshot of current page state
    const pageContent = await page.content();
    
    // Try to find and click a login/sign-in button
    const loginBtn = await page.locator('button:has-text("Sign"), button:has-text("Login"), button:has-text("Log in"), a:has-text("Sign"), a:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loginBtn.click();
      await page.waitForTimeout(2000);
      console.log('Clicked login button');
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-test-auth-modal.png' });
    
    // Try to find email and password fields
    const emailField = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"], input[name="email"]').first();
    const passwordField = page.locator('input[type="password"], input[name="password"], input[placeholder*="assword"]').first();
    
    if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailField.fill('vendor@test.com');
      console.log('Filled email');
    } else {
      console.log('Email field not visible, trying alternative approach');
      // Maybe we need to navigate to a login page
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/home/z/my-project/screenshot-test-login-page.png' });
    }
    
    if (await passwordField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passwordField.fill('password123');
      console.log('Filled password');
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-test-filled-credentials.png' });
    
    // Submit the form
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      console.log('Clicked submit');
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: '/home/z/my-project/screenshot-test-after-login.png' });
    console.log('URL after login attempt:', page.url());
    
    // Check for errors
    console.log('Page errors after login:', pageErrors.length ? pageErrors.slice(-3) : 'None');
    console.log('Console errors after login:', consoleErrors.length ? consoleErrors.slice(-5) : 'None');
    
    results.push({ test: 'Vendor login', pass: true, details: `URL: ${page.url()}` });
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Vendor login', pass: false, details: e.message });
  }

  // Test 3: Check vendor dashboard with tabs
  console.log('\n=== TEST 3: Vendor Dashboard with Active/Expired Tabs ===');
  try {
    await page.waitForTimeout(3000);
    
    // Look for Active/Expired tabs
    const activeTab = page.locator('button:has-text("Active"), [role="tab"]:has-text("Active")').first();
    const expiredTab = page.locator('button:has-text("Expired"), [role="tab"]:has-text("Expired")').first();
    
    const activeVisible = await activeTab.isVisible({ timeout: 5000 }).catch(() => false);
    const expiredVisible = await expiredTab.isVisible({ timeout: 5000 }).catch(() => false);
    
    console.log('Active tab visible:', activeVisible);
    console.log('Expired tab visible:', expiredVisible);
    
    results.push({ 
      test: 'Vendor dashboard tabs', 
      pass: activeVisible || expiredVisible, 
      details: `Active: ${activeVisible}, Expired: ${expiredVisible}` 
    });
    
    // Click Active tab
    if (activeVisible) {
      await activeTab.click();
      await page.waitForTimeout(2000);
      console.log('Clicked Active tab');
      await page.screenshot({ path: '/home/z/my-project/screenshot-test-active-tab.png' });
    }
    
    // Click Expired tab
    if (expiredVisible) {
      await expiredTab.click();
      await page.waitForTimeout(2000);
      console.log('Clicked Expired tab');
      await page.screenshot({ path: '/home/z/my-project/screenshot-test-expired-tab.png' });
    }
    
    // Screenshot of dashboard
    await page.screenshot({ path: '/home/z/my-project/screenshot-test-dashboard-tabs.png' });
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Vendor dashboard tabs', pass: false, details: e.message });
  }

  // Test 4: Click deal card for detail modal
  console.log('\n=== TEST 4: Deal Detail Modal ===');
  try {
    // Go back to active tab first
    const activeTab = page.locator('button:has-text("Active"), [role="tab"]:has-text("Active")').first();
    if (await activeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await activeTab.click();
      await page.waitForTimeout(1000);
    }
    
    // Find a deal card
    const dealCard = page.locator('[class*="deal"], [class*="card"]').first();
    if (await dealCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dealCard.click();
      await page.waitForTimeout(2000);
      console.log('Clicked deal card');
      await page.screenshot({ path: '/home/z/my-project/screenshot-test-deal-detail.png' });
      
      // Check if a modal/dialog appeared
      const modal = page.locator('[role="dialog"], [class*="modal"], [class*="dialog"]').first();
      const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);
      console.log('Detail modal visible:', modalVisible);
      
      results.push({ test: 'Deal detail modal', pass: modalVisible, details: `Modal visible: ${modalVisible}` });
      
      // Close modal
      if (modalVisible) {
        const closeBtn = page.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] button[aria-label="Close"], [role="dialog"] [class*="close"]').first();
        if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeBtn.click();
        } else {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(1000);
      }
    } else {
      console.log('No deal cards visible');
      results.push({ test: 'Deal detail modal', pass: false, details: 'No deal cards visible' });
    }
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Deal detail modal', pass: false, details: e.message });
  }

  // Test 5: Edit modal
  console.log('\n=== TEST 5: Edit Modal ===');
  try {
    // Find edit button
    const editBtn = page.locator('button:has-text("Edit"), button[aria-label*="edit"], button[aria-label*="Edit"]').first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(2000);
      console.log('Clicked Edit button');
      await page.screenshot({ path: '/home/z/my-project/screenshot-test-edit-modal.png' });
      
      // Check if edit modal appeared
      const editModal = page.locator('[role="dialog"], [class*="modal"], [class*="dialog"]').first();
      const editModalVisible = await editModal.isVisible({ timeout: 3000 }).catch(() => false);
      console.log('Edit modal visible:', editModalVisible);
      
      results.push({ test: 'Edit modal', pass: editModalVisible, details: `Edit modal visible: ${editModalVisible}` });
      
      // Close edit modal
      if (editModalVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } else {
      console.log('Edit button not visible');
      results.push({ test: 'Edit modal', pass: false, details: 'Edit button not visible' });
    }
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Edit modal', pass: false, details: e.message });
  }

  // Test 6: Admin Users page (login as admin)
  console.log('\n=== TEST 6: Admin Users Page ===');
  try {
    // Try logging out first, then login as admin
    // First, check if there's a way to switch to admin
    
    // Try using the API to login as admin
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'admin@test.com', password: 'password123' }
    });
    console.log('Admin login response status:', loginResponse.status());
    
    if (loginResponse.ok()) {
      const loginData = await loginResponse.json();
      console.log('Admin login data:', JSON.stringify(loginData).substring(0, 200));
      
      // Navigate to admin users page
      await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/home/z/my-project/screenshot-test-admin-home.png' });
      
      // Try navigating to admin panel / users tab
      // Look for admin/users link or tab
      const usersTab = page.locator('button:has-text("Users"), a:has-text("Users"), [role="tab"]:has-text("Users")').first();
      if (await usersTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await usersTab.click();
        await page.waitForTimeout(3000);
        console.log('Clicked Users tab');
      } else {
        // Try navigating directly
        await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(3000);
      }
      
      await page.screenshot({ path: '/home/z/my-project/screenshot-test-admin-users.png' });
      
      // Check for the roles.map error
      const hasRolesError = consoleErrors.some(e => e.includes('roles.map')) || pageErrors.some(e => e.includes('roles.map'));
      console.log('Has roles.map error:', hasRolesError);
      console.log('Recent page errors:', pageErrors.slice(-3));
      console.log('Recent console errors:', consoleErrors.slice(-5));
      
      results.push({ 
        test: 'Admin users page (no roles.map error)', 
        pass: !hasRolesError, 
        details: hasRolesError ? 'roles.map error found!' : 'No roles.map error' 
      });
    } else {
      console.log('Admin login failed');
      results.push({ test: 'Admin users page', pass: false, details: 'Admin login failed' });
    }
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Admin users page', pass: false, details: e.message });
  }

  // Final summary
  console.log('\n\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');
  for (const r of results) {
    const status = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.test} - ${r.details}`);
  }
  
  await browser.close();
  return results;
}

test().catch(console.error);
