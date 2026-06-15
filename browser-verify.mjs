import { spawn } from 'child_process';
import { chromium } from 'playwright';

// Start the dev server as a child process
const server = spawn('node', ['node_modules/.bin/next', 'dev', '-H', '0.0.0.0', '-p', '3000'], {
  cwd: '/home/z/my-project',
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

server.stdout.on('data', d => {
  const s = d.toString();
  if (s.includes('Ready')) console.log('SERVER READY');
});
server.stderr.on('data', d => process.stderr.write(d));

// Wait for server to be ready
await new Promise(r => setTimeout(r, 10000));

try {
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--single-process'] 
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Step 1: Homepage
  console.log('STEP 1: Homepage');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/z/my-project/verify-01-homepage.png' });
  console.log('✅ Homepage screenshot saved');

  // Step 2: Sign In
  console.log('STEP 2: Sign In');
  const signIn = page.locator('button:has-text("Sign In")').first();
  if (await signIn.isVisible()) {
    await signIn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/home/z/my-project/verify-02-auth-modal.png' });
    console.log('✅ Auth modal screenshot saved');

    // Fill credentials
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
    const pwdInput = page.locator('input[type="password"]').first();
    await emailInput.fill('vendor@test.com');
    await pwdInput.fill('password123');
    await page.screenshot({ path: '/home/z/my-project/verify-02b-credentials.png' });
    console.log('✅ Credentials filled screenshot saved');

    // Submit
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/home/z/my-project/verify-03-after-login.png' });
    console.log('✅ After login screenshot saved');
    
    const afterLoginUrl = page.url();
    const afterLoginText = await page.locator('body').innerText();
    console.log('URL after login:', afterLoginUrl);
    console.log('Has Active:', afterLoginText.includes('Active'));
    console.log('Has Expired:', afterLoginText.includes('Expired'));
  }

  // Step 3-4: Dashboard tabs
  console.log('STEP 3-4: Dashboard tabs');
  let bodyText = await page.locator('body').innerText();
  
  // Try to find and click Active tab
  const activeTab = page.locator('[role="tab"]:has-text("Active"), button:has-text("Active")').first();
  if (await activeTab.isVisible().catch(() => false)) {
    await activeTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/z/my-project/verify-04a-active-tab.png' });
    console.log('✅ Active tab screenshot saved');
  }
  
  // Try Expired tab
  const expiredTab = page.locator('[role="tab"]:has-text("Expired"), button:has-text("Expired")').first();
  if (await expiredTab.isVisible().catch(() => false)) {
    await expiredTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/z/my-project/verify-04b-expired-tab.png' });
    console.log('✅ Expired tab screenshot saved');
  }
  
  // Click back to Active for deal testing
  if (await activeTab.isVisible().catch(() => false)) {
    await activeTab.click();
    await page.waitForTimeout(1000);
  }

  // Step 5-6: Deal detail
  console.log('STEP 5-6: Deal detail modal');
  // Look for deal cards
  const dealCard = page.locator('[class*="card"]').first();
  if (await dealCard.isVisible().catch(() => false)) {
    await dealCard.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/z/my-project/verify-05-deal-click.png' });
    
    const modal = page.locator('[role="dialog"], [class*="modal"], [class*="dialog"]').first();
    if (await modal.isVisible().catch(() => false)) {
      console.log('✅ Detail modal opened');
      await page.screenshot({ path: '/home/z/my-project/verify-06-detail-modal.png' });
      
      // Step 7: Close modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      console.log('✅ Modal closed');
    } else {
      console.log('No modal appeared (might need different click target)');
    }
  }

  // Step 7-8: Edit button
  console.log('STEP 7-8: Edit button');
  const editBtn = page.locator('button:has-text("Edit")').first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/z/my-project/verify-08-edit-modal.png' });
    
    const editModal = page.locator('[role="dialog"], [class*="modal"], [class*="dialog"]').first();
    if (await editModal.isVisible().catch(() => false)) {
      const editText = await editModal.innerText();
      console.log('Edit modal has Status:', editText.includes('Status'));
      console.log('Edit modal has Save Changes:', editText.includes('Save Changes') || editText.includes('Save'));
      console.log('✅ Edit modal screenshot saved');
      
      // Step 9: Close edit modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      console.log('✅ Edit modal closed');
    }
  } else {
    console.log('No Edit button visible');
  }

  // Step 10-11: Admin
  console.log('STEP 10-11: Admin view');
  
  // Try role switcher
  const roleSwitcher = page.locator('button:has-text("vendor"), button:has-text("Vendor"), [aria-label*="role"], [class*="role-switch"]').first();
  if (await roleSwitcher.isVisible().catch(() => false)) {
    console.log('Role switcher found');
    await roleSwitcher.click();
    await page.waitForTimeout(1000);
    
    const adminOption = page.locator('text=Admin, [role="option"]:has-text("admin"), button:has-text("Admin")').first();
    if (await adminOption.isVisible().catch(() => false)) {
      await adminOption.click();
      await page.waitForTimeout(3000);
      console.log('Switched to admin role');
    }
  }
  
  // Check for Users tab
  const usersTab = page.locator('[role="tab"]:has-text("Users"), button:has-text("Users")').first();
  if (await usersTab.isVisible().catch(() => false)) {
    await usersTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/z/my-project/verify-11-admin-users.png' });
    
    bodyText = await page.locator('body').innerText();
    console.log('Has roles.map error:', bodyText.includes('roles.map'));
    console.log('✅ Admin Users screenshot saved');
  } else {
    // Try navigating to admin URL
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    // Look for any admin-related navigation
    bodyText = await page.locator('body').innerText();
    const hasAdmin = bodyText.includes('Admin') || bodyText.includes('admin');
    console.log('Has admin content:', hasAdmin);
    
    await page.screenshot({ path: '/home/z/my-project/verify-11-current-state.png' });
  }

  await browser.close();
  console.log('✅ Browser closed');
} catch(e) {
  console.error('BROWSER ERROR:', e.message);
}

server.kill();
console.log('✅ Server stopped');
console.log('\\n=== BROWSER VERIFICATION COMPLETE ===');
