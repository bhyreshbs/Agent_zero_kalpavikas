import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://localhost:4000/api';

async function runTest() {
  console.log('--- Testing Backend Flow ---');
  
  // 1. Create Team via Admin
  console.log('1. Creating team via admin API...');
  const createRes = await fetch(`${API_BASE}/admin/teams/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': process.env.ADMIN_SECRET
    },
    body: JSON.stringify({
      teamName: 'TEST TEAM SCRIPT 4',
      password: 'testpassword123',
      member1: 'Alice',
      member2: 'Bob',
      contact: 'test@example.com'
    })
  });
  
  const createData = await createRes.json();
  if (createRes.ok || createData.error?.includes('already exists') || createData.error?.includes('already registered')) {
    console.log('   Team created (or already exists).');
  } else {
    console.error('   Failed to create team:', createData);
    return;
  }
  
  // 2. Login as the Team
  console.log('2. Logging in as TEST TEAM SCRIPT 4...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teamName: 'TEST TEAM SCRIPT 4',
      password: 'testpassword123'
    })
  });
  
  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    console.error('   Login failed:', loginData);
    return;
  }
  
  const token = loginData.session.access_token;
  console.log('   Login successful, obtained token.');
  
  // 3. Get Game State
  console.log('3. Fetching /api/game/state...');
  let stateRes = await fetch(`${API_BASE}/game/state`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  let stateData = await stateRes.json();
  console.log(`   Status: ${stateRes.status}`);
  if (stateRes.status !== 200) {
    console.error('   ❌ Verification failed:', stateData);
    return;
  }
  
  if (stateData.status === 'not_started') {
    const startRes = await fetch(`${API_BASE}/game/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    stateData = await startRes.json();
  }

  console.log('   Game status after start:', stateData.status, 'Level:', stateData.currentLevel);

  // 4. Play through Level 0
  if (stateData.currentLevel === 0) {
    console.log('4. Playing level 0...');
    await fetch(`${API_BASE}/game/action`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'MOVE_TO_EXIT_A' })
    });
    const moveBRes = await fetch(`${API_BASE}/game/action`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'MOVE_TO_EXIT_B' })
    });
    const result = await moveBRes.json();
    console.log('   Advanced to level:', result.advancedToLevel);
    
    // Status should now be 'paused' (transition)
    console.log('   Status after level 0:', result.clientState.status, 'isTransition:', result.clientState.isTransition);
    
    // Enter sector 1
    console.log('   Entering sector 1...');
    const enterRes = await fetch(`${API_BASE}/game/action`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ENTER_SECTOR' })
    });
    const enterData = await enterRes.json();
    console.log('   Status after enter:', enterData.clientState.status);
  }

  // 5. Action that costs a life in Level 1
  console.log('5. Performing level 1 action (OPEN_RED_DOOR) to test lifeLost...');
  const actionRes4 = await fetch(`${API_BASE}/game/action`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'OPEN_RED_DOOR' })
  });
  const finalState = await actionRes4.json();
  
  if (actionRes4.status === 200 && finalState.lifeLost === true) {
    console.log('   ✅ Verification successful! Action returned 200 and life was lost properly.');
  } else {
    console.error('   ❌ Action returned an unexpected result or threw 500:', actionRes4.status, finalState);
  }
}

runTest().catch(console.error);
