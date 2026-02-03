#!/usr/bin/env node

const WebSocket = require('ws');
const { encode, decode } = require('msgpackr');

// Configuration
const HOST = process.argv[2] || 'localhost';
const PORT = process.argv[3] || '9001';
const TOKEN = process.argv[4] || 'supersecrettoken';

console.log(`Testing connection to ws://${HOST}:${PORT}`);
console.log(`Using token: ${TOKEN}\n`);

const ws = new WebSocket(`ws://${HOST}:${PORT}`);

ws.on('open', () => {
  console.log('✓ Connection established');

  // Send a test message (op 4 - SWITCH_RELEASE with invalid data to test response)
  const testMessage = {
    reqId: 1,
    token: TOKEN,
    op: 4,
    payload: encode({ site: 'test-site', release: 'test-release' })
  };

  console.log('Sending test message...');
  ws.send(encode(testMessage));
});

let timeout;

ws.on('message', (data) => {
  const response = decode(data);
  console.log('✓ Received response:', response);

  if (response.error) {
    console.log('  (Expected error - this confirms the agent is processing messages correctly)');
  }

  console.log('\n✓ Connection test SUCCESSFUL');
  clearTimeout(timeout);
  ws.close();
});

ws.on('error', (error) => {
  console.error('✗ Connection error:', error.message);
  clearTimeout(timeout);
  process.exit(1);
});

ws.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});

timeout = setTimeout(() => {
  console.error('\n✗ Test timeout - no response received');
  ws.close();
  process.exit(1);
}, 5000);
