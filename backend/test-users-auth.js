// Test script for users authentication endpoints
// Run with: node backend/test-users-auth.js

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api/users/auth';

// Test data
const testUser = {
  prenom: 'Test',
  nom: 'User',
  email: `test${Date.now()}@example.com`,
  telephone: '0612345678',
  type_compte: 'Client',
  password: 'TestPassword123',
  confirm_password: 'TestPassword123'
};

let authToken = null;

async function testRegister() {
  console.log('\n📝 Testing Registration...');
  try {
    const response = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Registration successful');
      console.log('User ID:', data.user.id);
      console.log('Email:', data.user.email);
      console.log('Token received:', data.token.substring(0, 20) + '...');
      authToken = data.token;
      return true;
    } else {
      console.log('❌ Registration failed:', data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testLogin() {
  console.log('\n🔐 Testing Login...');
  try {
    const response = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Login successful');
      console.log('User:', data.user.prenom, data.user.nom);
      console.log('Auth provider:', data.user.auth_provider);
      authToken = data.token;
      return true;
    } else {
      console.log('❌ Login failed:', data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testGetCurrentUser() {
  console.log('\n👤 Testing Get Current User...');
  try {
    const response = await fetch(`${BASE_URL}/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Get current user successful');
      console.log('User:', data.user.prenom, data.user.nom);
      console.log('Email:', data.user.email);
      console.log('Account type:', data.user.type_compte);
      return true;
    } else {
      console.log('❌ Get current user failed:', data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testInvalidLogin() {
  console.log('\n🚫 Testing Invalid Login...');
  try {
    const response = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: 'WrongPassword123'
      })
    });
    
    const data = await response.json();
    
    if (!response.ok && response.status === 401) {
      console.log('✅ Invalid login correctly rejected');
      console.log('Error message:', data.message);
      return true;
    } else {
      console.log('❌ Invalid login should have been rejected');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testDuplicateEmail() {
  console.log('\n📧 Testing Duplicate Email Registration...');
  try {
    const response = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    
    const data = await response.json();
    
    if (!response.ok && response.status === 409) {
      console.log('✅ Duplicate email correctly rejected');
      console.log('Error message:', data.message);
      return true;
    } else {
      console.log('❌ Duplicate email should have been rejected');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Starting Users Authentication Tests');
  console.log('=====================================');
  console.log('Testing against:', BASE_URL);
  
  const results = {
    register: await testRegister(),
    login: await testLogin(),
    getCurrentUser: await testGetCurrentUser(),
    invalidLogin: await testInvalidLogin(),
    duplicateEmail: await testDuplicateEmail()
  };
  
  console.log('\n📊 Test Results');
  console.log('=====================================');
  console.log('Register:', results.register ? '✅ PASS' : '❌ FAIL');
  console.log('Login:', results.login ? '✅ PASS' : '❌ FAIL');
  console.log('Get Current User:', results.getCurrentUser ? '✅ PASS' : '❌ FAIL');
  console.log('Invalid Login:', results.invalidLogin ? '✅ PASS' : '❌ FAIL');
  console.log('Duplicate Email:', results.duplicateEmail ? '✅ PASS' : '❌ FAIL');
  
  const passedTests = Object.values(results).filter(r => r).length;
  const totalTests = Object.keys(results).length;
  
  console.log('\n📈 Summary:', `${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️ Some tests failed. Please check the errors above.');
  }
}

// Run tests
runTests().catch(console.error);
