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
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    const msg = { reqId: id, token: TOKEN, op, payload: encode(payload) };

    console.log(`\n[DEBUG] Sending message:`, {
      reqId: id,
      token: TOKEN,
      op,
      payload
    });

    const handler = (data) => {
      const response = decode(data);
      console.log(`[DEBUG] Received message:`, response);

      if (response.reqId === id) {
        ws.off('message', handler);
        clearTimeout(timeout);
        resolve(response);
      }
    };

    const timeout = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for response to reqId ${id}`));
    }, 5000);

    ws.on('message', handler);
    ws.send(encode(msg));
  });
}

ws.on('open', async () => {
  console.log('Connected. Testing file upload...\n');

  try {
    const fileContent = 'Hello from deployment test!\n';
    const hash = crypto.createHash('sha256').update(fileContent).digest('hex');

    // 1. PUT_BEGIN
    console.log('1. Starting upload (PUT_BEGIN)...');
    console.log(`   File hash: ${hash}`);

    let resp = await send(1, {
      site: 'test-site',
      release: 'test-release-001',
      path: 'test.txt',
      hash: hash
    });
    console.log('   Response:', resp);

    if (resp.error) {
      console.error('Failed at PUT_BEGIN:', resp.error);
      ws.close();
      return;
    }

    if (!resp.uploadId) {
      console.error('No uploadId in response!');
      ws.close();
      return;
    }

    // 2. PUT_CHUNK
    console.log('\n2. Uploading content (PUT_CHUNK)...');
    console.log(`   Upload ID: ${resp.uploadId}`);

    resp = await send(2, {
      uploadId: resp.uploadId,
      chunk: Buffer.from(fileContent)
    });
    console.log('   Response:', resp);

    if (resp.error) {
      console.error('Failed at PUT_CHUNK:', resp.error);
      ws.close();
      return;
    }

    // 3. PUT_COMMIT
    console.log('\n3. Committing file (PUT_COMMIT)...');
    resp = await send(3, {
      uploadId: resp.uploadId
    });
    console.log('   Response:', resp);

    if (resp.error) {
      console.error('Failed at PUT_COMMIT:', resp.error);
    } else {
      console.log('\n✓ File upload successful!');
      console.log(`Check: /srv/all_websites/sites/test-site/test-release-001/test.txt`);
    }

    ws.close();
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\nConnection closed');
});
