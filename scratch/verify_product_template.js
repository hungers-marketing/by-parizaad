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
  const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9227', 'about:blank']);
  const wsUrl = await getWsUrl(9227);
  if (!wsUrl) {
    console.error('Could not connect to Chrome CDP on 9227');
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

  const testUrl = 'http://127.0.0.1:9292/products/pendant?view=virtual-try-on';
  console.log('Navigating to:', testUrl);
  await send('Page.navigate', { url: testUrl });

  await new Promise(r => setTimeout(r, 6000));

  const evalResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const isProductSection = !!document.querySelector('.product');
      const tryonSection = document.querySelector('.parizad-tryon-section');
      const isProductMode = tryonSection ? tryonSection.dataset.isProductPage === 'true' : false;
      const productCategory = tryonSection ? tryonSection.dataset.productCategory : null;
      
      const productSummary = document.querySelector('.parizad-tryon__product-summary');
      const engineTag = document.querySelector('.parizad-tryon__engine-tag');
      const productTitle = document.querySelector('.parizad-tryon__product-summary-title');
      const productPrice = document.querySelector('[data-summary-price]');
      const availBadge = document.querySelector('[data-summary-avail]');
      const assetNotice = document.querySelector('.parizad-tryon__asset-notice');
      const cartBtn = document.querySelector('.parizad-tryon__cart-btn');
      const cartText = cartBtn ? cartBtn.querySelector('.parizad-tryon__cart-text').textContent.trim() : null;
      const cartDisabled = cartBtn ? cartBtn.disabled : null;

      // Check category tabs in product mode (should be absent)
      const categoryTabs = document.querySelector('.parizad-tryon__tabs');

      // Product script JSON check
      const productScript = document.querySelector('script[id^="ParizadTryonProduct-"]');
      let productData = null;
      if (productScript) {
        try { productData = JSON.parse(productScript.textContent); } catch(e) {}
      }

      // Check Dawn main-product components
      const mainTitle = document.querySelector('.product__title');
      const mainBuyBtn = document.querySelector('.product-form__submit');
      const relatedProducts = document.querySelector('.related-products');

      return {
        url: location.href,
        documentTitle: document.title,
        hasMainProduct: !!mainTitle,
        mainProductTitle: mainTitle ? mainTitle.textContent.trim() : null,
        hasMainBuyBtn: !!mainBuyBtn,
        hasRelatedProducts: !!relatedProducts,
        hasTryonSection: !!tryonSection,
        isProductMode,
        productCategory,
        categoryTabsPresent: !!categoryTabs,
        engineTag: engineTag ? engineTag.textContent.trim() : null,
        productSummaryTitle: productTitle ? productTitle.textContent.trim() : null,
        productSummaryPrice: productPrice ? productPrice.textContent.trim() : null,
        availBadgeText: availBadge ? availBadge.textContent.trim() : null,
        assetNoticeVisible: assetNotice ? getComputedStyle(assetNotice).display !== 'none' : false,
        cartText,
        cartDisabled,
        productData: productData ? {
          id: productData.id,
          title: productData.title,
          handle: productData.handle,
          variantId: productData.variantId,
          available: productData.available,
          category: productData.category,
          hasTryonAsset: productData.hasTryonAsset
        } : null
      };
    })()`,
    returnByValue: true
  });

  console.log('--- TEST RESULTS ---');
  console.log(JSON.stringify(evalResult.result.result.value, null, 2));

  ws.close();
  chrome.kill();
})();
