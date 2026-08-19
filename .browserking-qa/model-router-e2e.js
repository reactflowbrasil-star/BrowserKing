const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

(async () => {
  const captures = [];
  let rejectVisualOnce = false;
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
      });
      return res.end();
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      captures.push(body);
      if (rejectVisualOnce && body.model === 'gemini-2.5-computer-use-preview-10-2025') {
        rejectVisualOnce = false;
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ error: { message: 'model not found' } }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        id: 'router-qa',
        model: body.model,
        choices: [{ message: { role: 'assistant', content: `OK ${body.model}` }, finish_reason: 'stop' }],
        usage: {}
      }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}/v1beta/openai`;
  const root = path.resolve(__dirname, '..');
  const profile = path.join(__dirname, 'profile-model-router');
  fs.rmSync(profile, { recursive: true, force: true });
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
  await page.evaluate(async ({ baseUrl }) => {
    const state = await window.HatClawRegistry.loadState();
    state.activeProvider = 'google';
    state.providers.google.enabled = true;
    state.providers.google.apiKey = 'qa-key';
    state.providers.google.baseUrl = baseUrl;
    state.providers.google.model = 'gemini-2.5-pro';
    await window.HatClawRegistry.syncStateToChrome(state);
  }, { baseUrl });
  await page.reload();
  await page.waitForFunction(async () => {
    const state = await window.HatClawRegistry.loadState();
    return state.activeProvider === 'google' && state.providers.google.model === 'gemini-3.6-flash';
  });

  const send = text => page.evaluate(async prompt => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude', max_tokens: 100, stream: false,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
      })
    });
    return { status: response.status, body: await response.json() };
  }, text);

  const cases = [
    ['Resuma este texto em três linhas.', 'gemini-3.6-flash'],
    ['Abra uma página, observe a tela, clique no botão e preencha o formulário.', 'gemini-2.5-computer-use-preview-10-2025'],
    ['Use Playwright e a accessibility tree para encontrar o melhor locator no DOM.', 'gemini-3.1-pro-preview'],
    ['Execute esta extração repetitiva em milhares de páginas com menor custo.', 'gemini-3.6-flash'],
    ['Controle o aplicativo Android por ADB, touch e swipe.', 'gemini-3.5-flash']
  ];
  const results = [];
  for (const [prompt, expected] of cases) {
    const before = captures.length;
    const response = await send(prompt);
    results.push({ prompt, expected, actual: captures[before]?.model, status: response.status });
  }

  rejectVisualOnce = true;
  const fallbackStart = captures.length;
  const fallbackResponse = await send('Observe a tela e clique no botão visual.');
  const fallbackModels = captures.slice(fallbackStart).map(item => item.model);
  const storage = await page.evaluate(async () => {
    const state = await window.HatClawRegistry.loadState();
    const route = (await chrome.storage.local.get('hatclawModelRouterStatus')).hatclawModelRouterStatus;
    return { activeProvider: state.activeProvider, configuredModel: state.providers.google.model, route };
  });

  const assertions = {
    defaultProvider: storage.activeProvider === 'google',
    defaultModel: storage.configuredModel === 'gemini-3.6-flash',
    routes: results.every(item => item.expected === item.actual && item.status === 200),
    fallback: fallbackResponse.status === 200
      && fallbackModels.join(',') === 'gemini-2.5-computer-use-preview-10-2025,gemini-3.5-flash',
    fallbackPersisted: storage.route?.route === 'fallback' && storage.route?.model === 'gemini-3.5-flash'
  };
  console.log(JSON.stringify({ assertions, results, fallbackModels, storage }, null, 2));
  if (Object.values(assertions).some(value => value !== true)) throw new Error('Model router assertion failed');

  await context.close();
  await new Promise(resolve => server.close(resolve));
})().catch(error => { console.error(error); process.exit(1); });
