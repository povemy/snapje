import { execSync, spawn } from 'child_process';
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
  
  // Wait for server
  console.log('Waiting for server...');
  for (let i = 0; i < 30; i++) {
    try {
      await request('GET', '/');
      console.log('Server ready!');
      break;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Test 1: Homepage
  console.log('\n=== TEST 1: Homepage ===');
  try {
    const res = await request('GET', '/');
    results.push({ test: 'Homepage loads', pass: res.status === 200, details: `Status: ${res.status}` });
    console.log(`Status: ${res.status}`);
  } catch (e) {
    results.push({ test: 'Homepage loads', pass: false, details: e.message });
    console.log('Error:', e.message);
  }

  // Test 2: Vendor Login
  console.log('\n=== TEST 2: Vendor Login ===');
  let vendorCookies = '';
  try {
    const res = await request('POST', '/api/auth/login', { email: 'vendor@test.com', password: 'password123' });
    vendorCookies = parseCookies(res.cookies);
    const user = res.data?.data || res.data;
    console.log('Email:', user?.email);
    console.log('Roles:', JSON.stringify(user?.roles));
    console.log('Active Role:', user?.activeRole);
    results.push({ test: 'Vendor login', pass: res.status === 200 && user?.activeRole === 'vendor', details: `Email: ${user?.email}, Roles: ${JSON.stringify(user?.roles)}, ActiveRole: ${user?.activeRole}` });
  } catch (e) {
    results.push({ test: 'Vendor login', pass: false, details: e.message });
    console.log('Error:', e.message);
  }

  // Test 3: Vendor Deals
  console.log('\n=== TEST 3: Vendor Deals ===');
  try {
    const res = await request('GET', '/api/deals', null, vendorCookies);
    const deals = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.deals || []);
    console.log('Deals count:', Array.isArray(deals) ? deals.length : 'not an array');
    if (Array.isArray(deals) && deals.length > 0) {
      console.log('First deal:', JSON.stringify(deals[0]).substring(0, 200));
    }
    results.push({ test: 'Vendor deals API', pass: res.status === 200, details: `Deals: ${Array.isArray(deals) ? deals.length : 'parse error'}` });
  } catch (e) {
    results.push({ test: 'Vendor deals API', pass: false, details: e.message });
    console.log('Error:', e.message);
  }

  // Test 4: Admin Login
  console.log('\n=== TEST 4: Admin Login ===');
  let adminCookies = '';
  try {
    const res = await request('POST', '/api/auth/login', { email: 'admin@test.com', password: 'password123' });
    adminCookies = parseCookies(res.cookies);
    const user = res.data?.data || res.data;
    console.log('Email:', user?.email);
    console.log('Roles:', JSON.stringify(user?.roles));
    console.log('Active Role:', user?.activeRole);
    results.push({ test: 'Admin login', pass: res.status === 200 && user?.activeRole === 'admin', details: `Email: ${user?.email}, Roles: ${JSON.stringify(user?.roles)}` });
  } catch (e) {
    results.push({ test: 'Admin login', pass: false, details: e.message });
    console.log('Error:', e.message);
  }

  // Test 5: Admin Users
  console.log('\n=== TEST 5: Admin Users API ===');
  try {
    const res = await request('GET', '/api/admin/users', null, adminCookies);
    console.log('Status:', res.status);
    const data = res.data;
    
    // Check for roles.map error
    let hasRolesMapError = false;
    let usersList = [];
    
    if (data?.error) {
      console.log('Error in response:', data.error);
      if (data.error.includes('roles.map') || data.error.includes('map is not a function')) {
        hasRolesMapError = true;
      }
    }
    
    if (data?.data && Array.isArray(data.data)) {
      usersList = data.data;
    } else if (Array.isArray(data)) {
      usersList = data;
    } else if (data?.users && Array.isArray(data.users)) {
      usersList = data.users;
    }
    
    console.log('Users count:', usersList.length);
    for (const u of usersList.slice(0, 3)) {
      const roles = u.roles;
      console.log(`  User: ${u.email}, roles: ${JSON.stringify(roles)}, roles type: ${typeof roles}, isArray: ${Array.isArray(roles)}`);
      if (typeof roles === 'string') {
        console.log('  WARNING: roles is a string, not an array - this would cause .map() error!');
        hasRolesMapError = true;
      }
    }
    
    results.push({ 
      test: 'Admin users (no roles.map error)', 
      pass: res.status === 200 && !hasRolesMapError, 
      details: hasRolesMapError ? 'roles.map error detected - roles is not an array!' : `Users: ${usersList.length}, no roles.map error` 
    });
  } catch (e) {
    results.push({ test: 'Admin users (no roles.map error)', pass: false, details: e.message });
    console.log('Error:', e.message);
  }

  // Summary
  console.log('\n========================================');
  console.log('API TEST SUMMARY');
  console.log('========================================');
  for (const r of results) {
    const status = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.test} - ${r.details}`);
  }
  
  return results;
}

test().catch(console.error);
