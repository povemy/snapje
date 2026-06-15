import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const results = [];

async function step(num, desc) {
  console.log(`\n=== STEP ${num}: ${desc} ===`);
}

async function snap(name) {
  await page.screenshot({ path: `/home/z/my-project/verify-${name}.png`, fullPage: false });
  console.log(`  📸 Screenshot saved: verify-${name}.png`);
}

async function reportErrors() {
  const consoleErrors = [];
  page.on('pageerror', err => consoleErrors.push(err.message));
  return consoleErrors;
}

// Step 1: Navigate to homepage
await step(1, 'Navigate to http://localhost:3000 and take snapshot');
const pageErrors = reportErrors();
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);
await snap('01-homepage');
const homeContent = await page.content();
const hasSignIn = homeContent.includes('Sign In') || homeContent.includes('sign in') || homeContent.includes('Login') || homeContent.includes('login');
console.log(`  Homepage loaded. Has Sign In/Login button: ${hasSignIn}`);
console.log(`  Page title: ${await page.title()}`);

// Check for Sign In button
const signInBtn = await page.locator('button:has-text("Sign In"), a:has-text("Sign In"), button:has-text("Login"), a:has-text("Login")').first();
const signInVisible = await signInBtn.isVisible().catch(() => false);
console.log(`  Sign In button visible: ${signInVisible}`);

// Step 2: Click Sign In and log in
await step(2, 'Click Sign In and log in with vendor@test.com / password123');
if (signInVisible) {
  await signInBtn.click();
  await page.waitForTimeout(1500);
  await snap('02-auth-modal');
  console.log('  Clicked Sign In button');
  
  // Look for email and password fields
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]').first();
  
  const emailVisible = await emailInput.isVisible().catch(() => false);
  const passwordVisible = await passwordInput.isVisible().catch(() => false);
  console.log(`  Email input visible: ${emailVisible}`);
  console.log(`  Password input visible: ${passwordVisible}`);
  
  if (emailVisible && passwordVisible) {
    await emailInput.fill('vendor@test.com');
    await passwordInput.fill('password123');
    await snap('02b-credentials-filled');
    
    // Click submit/login button
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")').first();
    const submitVisible = await submitBtn.isVisible().catch(() => false);
    console.log(`  Submit button visible: ${submitVisible}`);
    
    if (submitVisible) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      await snap('02c-after-login');
      console.log(`  After login URL: ${page.url()}`);
    }
  } else {
    // Maybe we need to navigate to a login page
    console.log('  Could not find email/password inputs. Checking page content...');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log(`  Body text preview: ${bodyText.substring(0, 300)}`);
  }
} else {
  console.log('  No Sign In button found. Looking for alternative...');
  const allButtons = await page.locator('button').allTextContents();
  console.log(`  Buttons found: ${allButtons.join(', ')}`);
}

// Step 3: After login, switch to vendor role if needed
await step(3, 'Switch to vendor role and verify dashboard');
const currentUrl = page.url();
console.log(`  Current URL: ${currentUrl}`);

// Check if we're logged in - look for role switcher or vendor dashboard
const bodyText3 = await page.locator('body').innerText().catch(() => '');
const hasVendor = bodyText3.includes('Vendor') || bodyText3.includes('vendor');
const hasDashboard = bodyText3.includes('Dashboard') || bodyText3.includes('dashboard');
const hasActive = bodyText3.includes('Active');
const hasExpired = bodyText3.includes('Expired');
console.log(`  Page has 'Vendor': ${hasVendor}`);
console.log(`  Page has 'Dashboard': ${hasDashboard}`);
console.log(`  Page has 'Active': ${hasActive}`);
console.log(`  Page has 'Expired': ${hasExpired}`);

// Look for role switcher
const roleSwitcher = page.locator('[data-role-switcher], button:has-text("Vendor"), select:has-text("Vendor"), [class*="role"]').first();
const roleSwitcherVisible = await roleSwitcher.isVisible().catch(() => false);
console.log(`  Role switcher visible: ${roleSwitcherVisible}`);

if (!hasActive || !hasExpired) {
  // Try to find and click vendor role
  const vendorBtn = page.locator('button:has-text("Vendor"), a:has-text("Vendor"), [role="tab"]:has-text("Vendor")').first();
  const vendorBtnVisible = await vendorBtn.isVisible().catch(() => false);
  if (vendorBtnVisible) {
    await vendorBtn.click();
    await page.waitForTimeout(2000);
    console.log('  Clicked Vendor button');
  }
}

// Step 4: Snapshot of vendor dashboard with tabs
await step(4, 'Snapshot vendor dashboard showing tabs');
await snap('04-vendor-dashboard');
const bodyText4 = await page.locator('body').innerText().catch(() => '');
const hasActiveTab = bodyText4.includes('Active');
const hasExpiredTab = bodyText4.includes('Expired');
console.log(`  Active tab present: ${hasActiveTab}`);
console.log(`  Expired tab present: ${hasExpiredTab}`);

// List all visible text for debugging
const allTabs = await page.locator('[role="tab"], button[class*="tab"]').allTextContents().catch(() => []);
console.log(`  Tab elements found: ${allTabs.join(', ')}`);

// Step 5: Click on a deal card
await step(5, 'Click on a deal card to verify detail modal');
const dealCard = page.locator('[class*="deal"], [class*="card"], article, .cursor-pointer').first();
const dealCardVisible = await dealCard.isVisible().catch(() => false);
console.log(`  Deal card visible: ${dealCardVisible}`);

if (dealCardVisible) {
  await dealCard.click();
  await page.waitForTimeout(2000);
  
  // Check if modal opened
  const modal = page.locator('[role="dialog"], [class*="modal"], [class*="dialog"], [class*="overlay"]').first();
  const modalVisible = await modal.isVisible().catch(() => false);
  console.log(`  Modal opened after click: ${modalVisible}`);
  
  // Step 6: Snapshot detail modal
  await step(6, 'Snapshot detail modal');
  await snap('06-deal-detail-modal');
  
  const modalText = modalVisible ? await modal.innerText().catch(() => 'No modal text') : 'No modal found';
  console.log(`  Modal content preview: ${modalText.substring(0, 200)}`);
} else {
  console.log('  No deal card found to click');
  // List clickable elements
  const clickables = await page.locator('button, a, [role="button"]').allTextContents().catch(() => []);
  console.log(`  Clickable elements: ${clickables.slice(0, 15).join(', ')}`);
}

// Step 7: Close modal, try Edit button
await step(7, 'Close modal and try Edit button');
// Close modal - try Escape, close button, or overlay click
const closeButton = page.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] [aria-label="Close"], [role="dialog"] button:first-child').first();
const closeBtnVisible = await closeButton.isVisible().catch(() => false);
if (closeBtnVisible) {
  await closeButton.click();
} else {
  await page.keyboard.press('Escape');
}
await page.waitForTimeout(1000);

// Find Edit button on deal card
const editBtn = page.locator('button:has-text("Edit"), a:has-text("Edit"), [class*="edit"]').first();
const editBtnVisible = await editBtn.isVisible().catch(() => false);
console.log(`  Edit button visible: ${editBtnVisible}`);

if (editBtnVisible) {
  await editBtn.click();
  await page.waitForTimeout(2000);
  
  // Step 8: Snapshot edit modal
  await step(8, 'Snapshot edit modal with Status dropdown and Save Changes');
  await snap('08-edit-modal');
  
  const editModal = page.locator('[role="dialog"], [class*="modal"], [class*="dialog"]').first();
  const editModalVisible = await editModal.isVisible().catch(() => false);
  console.log(`  Edit modal visible: ${editModalVisible}`);
  
  if (editModalVisible) {
    const editModalText = await editModal.innerText().catch(() => '');
    const hasStatus = editModalText.includes('Status') || editModalText.includes('status');
    const hasSaveChanges = editModalText.includes('Save Changes') || editModalText.includes('Save');
    const hasDropdown = await editModal.locator('select, [role="combobox"], [class*="select"]').count() > 0;
    console.log(`  Has Status field: ${hasStatus}`);
    console.log(`  Has Save Changes button: ${hasSaveChanges}`);
    console.log(`  Has dropdown/select: ${hasDropdown}`);
  }
}

// Step 9: Close edit modal
await step(9, 'Close edit modal');
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);
await snap('09-after-close-edit');

// Step 10: Login as admin
await step(10, 'Navigate to admin role / login as admin');
// First, try to find a way to switch to admin or logout
const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Log Out"), button:has-text("Sign Out"), a:has-text("Logout"), a:has-text("Sign Out")').first();
const logoutVisible = await logoutBtn.isVisible().catch(() => false);
console.log(`  Logout button visible: ${logoutVisible}`);

// Try switching to admin role
const adminSwitch = page.locator('button:has-text("Admin"), a:has-text("Admin"), [class*="admin"]').first();
const adminSwitchVisible = await adminSwitch.isVisible().catch(() => false);
console.log(`  Admin switch visible: ${adminSwitchVisible}`);

if (adminSwitchVisible) {
  await adminSwitch.click();
  await page.waitForTimeout(2000);
  console.log(`  Clicked Admin switch, URL: ${page.url()}`);
} else if (logoutVisible) {
  await logoutBtn.click();
  await page.waitForTimeout(2000);
  
  // Log in as admin
  const emailInput2 = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput2 = page.locator('input[type="password"], input[name="password"]').first();
  
  const e2Visible = await emailInput2.isVisible().catch(() => false);
  if (e2Visible) {
    await emailInput2.fill('admin@test.com');
    await passwordInput2.fill('password123');
    const submitBtn2 = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').first();
    await submitBtn2.click();
    await page.waitForTimeout(3000);
    console.log(`  Logged in as admin, URL: ${page.url()}`);
  }
} else {
  // Navigate fresh
  console.log('  No logout/admin switch found. Navigating fresh...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
}

// Step 11: Go to Users tab in admin
await step(11, 'Go to Users tab in admin');
// Look for Users tab
const usersTab = page.locator('[role="tab"]:has-text("Users"), button:has-text("Users"), a:has-text("Users")').first();
const usersTabVisible = await usersTab.isVisible().catch(() => false);
console.log(`  Users tab visible: ${usersTabVisible}`);

if (usersTabVisible) {
  await usersTab.click();
  await page.waitForTimeout(2000);
}
await snap('11-admin-users');

const bodyText11 = await page.locator('body').innerText().catch(() => '');
const hasRolesMapError = bodyText11.includes('roles.map') || bodyText11.includes('roles.map is not a function');
const hasUsersList = bodyText11.includes('vendor@test.com') || bodyText11.includes('admin@test.com') || bodyText11.includes('Email') || bodyText11.includes('Role');
console.log(`  Has "roles.map" error: ${hasRolesMapError}`);
console.log(`  Users list appears to load: ${hasUsersList}`);
console.log(`  Page text preview (last check): ${bodyText11.substring(0, 400)}`);

// Check for any console errors
await page.waitForTimeout(1000);

// Summary
console.log('\n\n=== SUMMARY ===');
console.log('Step 1: Homepage loaded ✓');
console.log('Step 2: Login flow tested');
console.log('Step 3: Vendor dashboard checked');
console.log('Step 4: Dashboard tabs checked');
console.log('Step 5: Deal card click tested');
console.log('Step 6: Detail modal checked');
console.log('Step 7: Edit button tested');
console.log('Step 8: Edit modal checked');
console.log('Step 9: Edit modal closed');
console.log('Step 10: Admin login attempted');
console.log('Step 11: Admin Users tab checked');
console.log('roles.map error present: ' + hasRolesMapError);

await browser.close();
