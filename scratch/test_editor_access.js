const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = path.resolve('scratch/temp_chrome_profile');

// We'll test with a separate debugging port and user data dir or copy
async function getWsUrl(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, res => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => {
            try { resolve(JSON.parse(b)); } catch(e) { reject(e); }
          });
        }).on('error', reject);
      });
      const page = Array.isArray(data) && data.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return null;
}

(async () => {
  // Let's launch chrome pointing to the editor URL
  const targetUrl = 'https://hungers-marketing.myshopify.com/admin/themes/190332633219/editor';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9225',
    `--user-data-dir=${userDataDir}`,
    targetUrl
  ]);

  console.log('Connecting to Chrome...');
  const wsUrl = await getWsUrl(9225);
  if (!wsUrl) {
    console.log('Could not connect to Chrome CDP (User Data Dir might be locked by running Chrome).');
    chrome.kill();
    process.exit(0);
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const cbs = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && cbs.has(m.id)) { cbs.get(m.id)(m); cbs.delete(m.id); }
  };
  await new Promise(r => ws.onopen = r);
  function send(method, params = {}) {
    return new Promise(r => { const reqId = id++; cbs.set(reqId, r); ws.send(JSON.stringify({ id: reqId, method, params })); });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  await new Promise(r => setTimeout(r, 6000));

  const pageInfo = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({ url: location.href, title: document.title, bodyLength: document.body ? document.body.innerHTML.length : 0 })',
    returnByValue: true
  });
  console.log('Page info:', pageInfo.result.result.value);

  // Take screenshot
  const ss = await send('Page.captureScreenshot', { format: 'png' });
  if (ss.result && ss.result.data) {
    fs.writeFileSync('scratch/editor_check.png', Buffer.from(ss.result.data, 'base64'));
    console.log('Saved screenshot to scratch/editor_check.png');
  }

  ws.close();
  chrome.kill();
})();
