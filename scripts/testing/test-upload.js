#!/usr/bin/env node

const WebSocket = require('ws');
const { encode, decode } = require('msgpackr');
const crypto = require('crypto');

const HOST = process.argv[2] || '95.217.89.48';
const PORT = process.argv[3] || '9001';
const TOKEN = process.argv[4] || 'supersecrettoken';

const ws = new WebSocket(`ws://${HOST}:${PORT}`);
let reqId = 0;

function send(op, payload) {
  return new Promise((resolve) => {
    const id = ++reqId;
    const msg = { reqId: id, token: TOKEN, op, payload: encode(payload) };

    const handler = (data) => {
      const response = decode(data);
      if (response.reqId === id) {
        ws.off('message', handler);
        resolve(response);
      }
    };

    ws.on('message', handler);
    ws.send(encode(msg));
  });
}

ws.on('open', async () => {
  console.log('Connected. Testing file upload...\n');

  const fileContent = 'Hello from deployment test!\n';
  const hash = crypto.createHash('sha256').update(fileContent).digest('hex');

  // 1. PUT_BEGIN
  console.log('1. Starting upload (PUT_BEGIN)...');
  let resp = await send(1, {
    site: 'test-site',
    release: 'test-release-001',
    path: 'test.txt',
    hash: hash
  });
  console.log('   Response:', resp);

  if (resp.error) {
    console.error('Failed at PUT_BEGIN');
    ws.close();
    return;
  }

  // 2. PUT_CHUNK
  console.log('2. Uploading content (PUT_CHUNK)...');
  resp = await send(2, {
    uploadId: resp.uploadId,
    chunk: Buffer.from(fileContent)
  });
  console.log('   Response:', resp);

  if (resp.error) {
    console.error('Failed at PUT_CHUNK');
    ws.close();
    return;
  }

  // 3. PUT_COMMIT
  console.log('3. Committing file (PUT_COMMIT)...');
  resp = await send(3, {
    uploadId: resp.uploadId
  });
  console.log('   Response:', resp);

  if (resp.error) {
    console.error('Failed at PUT_COMMIT');
  } else {
    console.log('\n✓ File upload successful!');
    console.log(`Check: /srv/all_websites/sites/test-site/test-release-001/test.txt`);
  }

  ws.close();
});

ws.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
