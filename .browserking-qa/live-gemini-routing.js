const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = path.join(root, '.browserking-qa', 'profile-live-gemini');
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 420, height: 900 }
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.waitForFunction(() => Boolean(window.HatClawRegistry));
  await page.waitForTimeout(600);

  const config = await page.evaluate(async () => {
    const state = await window.HatClawRegistry.loadState();
    const google = state.providers.google;
    return {
      activeProvider: state.activeProvider,
      model: google.model,
      hasKey: Boolean(String(google.apiKey || '').trim()),
      baseHost: (() => { try { return new URL(google.baseUrl).host; } catch { return ''; } })()
    };
  });
  if (!config.hasKey) throw new Error('NO_CONFIGURED_GEMINI_KEY');

  const send = prompt => page.evaluate(async text => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude', max_tokens: 300, stream: false,
        messages: [{ role: 'user', content: [{ type: 'text', text }] }]
      })
    });
    const body = await response.json().catch(() => ({}));
    const route = (await chrome.storage.local.get('hatclawModelRouterStatus')).hatclawModelRouterStatus;
    return {
      status: response.status,
      route: route ? { route: route.route, model: route.model, reason: route.reason } : null,
      text: Array.isArray(body.content) ? body.content.map(item => item.text || '').join(' ').slice(0, 160) : '',
      error: body.error?.message ? String(body.error.message).slice(0, 240) : ''
    };
  }, prompt);

  const defaultResult = await send('Responda exatamente: HATCLAW 36 OK');
  const domResult = await send('Use DOM e accessibility tree para analisar um locator Playwright. Responda exatamente: HATCLAW DOM OK');
  console.log(JSON.stringify({ config, defaultResult, domResult }, null, 2));
  if (defaultResult.status !== 200 || defaultResult.route?.model !== 'gemini-3.6-flash') {
    throw new Error('DEFAULT_LIVE_ROUTE_FAILED');
  }
  if (domResult.status !== 200 || domResult.route?.model !== 'gemini-3.1-pro-preview') {
    throw new Error('DOM_LIVE_ROUTE_FAILED');
  }
  await context.close();
})().catch(error => { console.error(error.message || error); process.exit(1); });
