/**
 * Test WebSocket connection
 */
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('open', () => {
  console.log('✅ Connected to WebSocket');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`\n📨 Event: ${msg.event}`);
  
  if (msg.event === 'prices_updated') {
    console.log('Prices received:');
    msg.data.forEach((p: any) => {
      console.log(`  ${p.symbol || p.mint?.substring(0,8)}: YES $${p.yesPrice?.toFixed(3)}`);
    });
  } else {
    console.log('Data:', JSON.stringify(msg.data, null, 2));
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});

ws.on('close', () => {
  console.log('WebSocket closed');
});

// Keep alive
setInterval(() => {}, 1000);

 * Test WebSocket connection
 */
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('open', () => {
  console.log('✅ Connected to WebSocket');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`\n📨 Event: ${msg.event}`);
  
  if (msg.event === 'prices_updated') {
    console.log('Prices received:');
    msg.data.forEach((p: any) => {
      console.log(`  ${p.symbol || p.mint?.substring(0,8)}: YES $${p.yesPrice?.toFixed(3)}`);
    });
  } else {
    console.log('Data:', JSON.stringify(msg.data, null, 2));
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});

ws.on('close', () => {
  console.log('WebSocket closed');
});

// Keep alive
setInterval(() => {}, 1000);

