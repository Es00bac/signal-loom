// CDP eval helper — runs a JS expression inside the Signal Loom Android WebView
// over the forwarded devtools socket and prints the JSON result.
//
// Setup: adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
// Usage: node ops/android-smoke/cdp-eval.mjs '<js expression>' [port]
import WebSocket from 'ws';

const expression = process.argv[2];
const port = process.argv[3] || '9333';
if (!expression) {
  console.error('usage: cdp-eval.mjs "<js>" [port]');
  process.exit(1);
}

const pages = await fetch(`http://localhost:${port}/json/list`).then((r) => r.json());
const page = pages.find((p) => (p.title || '').includes('Signal Loom') && p.webSocketDebuggerUrl)
  ?? pages.find((p) => p.webSocketDebuggerUrl);
if (!page) {
  console.error('No debuggable Signal Loom page found.');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const messageId = ++id;
    pending.set(messageId, resolve);
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

ws.on('open', async () => {
  await send('Runtime.enable');
  const result = await send('Runtime.evaluate', {
    // Wrap in an async IIFE so the expression may `await` (e.g. fetch), then
    // stringify the resolved value. awaitPromise makes CDP wait for it.
    expression: `Promise.resolve((async () => { ${expression} })()).then((v) => JSON.stringify(v))`,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = result.result?.result?.value;
  const thrown = result.result?.exceptionDetails;
  if (thrown) console.error('EVAL ERROR:', JSON.stringify(thrown.exception?.description || thrown.text));
  else console.log(value);
  ws.close();
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('WS error:', err.message);
  process.exit(1);
});
