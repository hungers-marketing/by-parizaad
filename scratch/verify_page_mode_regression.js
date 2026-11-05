const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
      await new Promise(r => setTimeout(r, 400));
    }
  }
  return null;
}

(async () => {
  const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9228', 'about:blank']);
  const wsUrl = await getWsUrl(9228);
  if (!wsUrl) {
    chrome.kill();
    process.exit(1);
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

  // Request section rendering of parizad-virtual-try-on
  await send('Page.navigate', { url: 'http://127.0.0.1:9292/?sections=parizad-virtual-try-on' });
  await new Promise(r => setTimeout(r, 4000));

  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const sectionHtml = document.body ? document.body.innerText : '';
      const parsed = JSON.parse(sectionHtml);
      const tryonHtml = parsed['parizad-virtual-try-on'];
      
      const div = document.createElement('div');
      div.innerHTML = tryonHtml;
      const section = div.querySelector('.parizad-tryon-section');
      const isProductPage = section ? section.dataset.isProductPage : null;
      const hasTabs = !!div.querySelector('.parizad-tryon__tabs');
      const hasCatalogScript = !!div.querySelector('script[id^="ParizadTryonCatalog-"]');
      const hasProductScript = !!div.querySelector('script[id^="ParizadTryonProduct-"]');

      return {
        isProductPage,
        hasTabs,
        hasCatalogScript,
        hasProductScript
      };
    })()`,
    returnByValue: true
  });

  console.log('--- PAGE MODE TEST RESULTS ---');
  console.log(JSON.stringify(result.result.result.value, null, 2));

  ws.close();
  chrome.kill();
})();
