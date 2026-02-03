#!/usr/bin/env node

const WebSocket = require('ws');
const { encode, decode } = require('msgpackr');

const HOST = process.argv[2] || '95.217.89.48';
const PORT = process.argv[3] || '9001';
const TOKEN = process.argv[4] || 'supersecrettoken';

const ws = new WebSocket(`ws://${HOST}:${PORT}`);

ws.on('open', () => {
  console.log('Connected. Testing release switch...\n');

  const msg = {
    reqId: 1,
    token: TOKEN,
    op: 4,
    payload: encode({
      site: 'test-site',
      release: 'test-release-001'
    })
  };

  ws.send(encode(msg));
});

ws.on('message', (data) => {
  const response = decode(data);
  console.log('Response:', response);

  if (response.ok) {
    console.log('\n✓ Release switch successful!');
    console.log('Check: ls -la /srv/all_websites/sites/test-site/current');
  } else {
    console.error('Failed:', response.error);
  }

  ws.close();
});

ws.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
