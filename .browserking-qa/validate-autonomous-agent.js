const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1100, height: 720 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
    const pageA = await context.newPage();
    await pageA.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    await pageA.evaluate(() => {
      document.body.innerHTML = '<main><h1>Conta da empresa</h1><div style="height:1300px"></div><button id="target">Salvar telefone</button><p id="status" role="status"></p></main>';
      document.querySelector('#target').addEventListener('click', () => { document.querySelector('#target').dataset.clicked = 'true'; document.querySelector('#status').textContent = 'Alterações salvas'; });
    });
    await pageA.waitForTimeout(800);
    const tabA = await worker.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, pageA.url());
    const contextSummary = await worker.evaluate(async ({ tabA }) => chrome.tabs.sendMessage(tabA, { type: 'GET_PAGE_CONTEXT', goal: 'salvar telefone da empresa' }), { tabA });
    if (!contextSummary.context.includes('[E') || !contextSummary.fingerprint) throw new Error('Compact DOM context was not produced');

    await worker.evaluate(async ({ tabA }) => chrome.storage.local.set({ hatclawAgentActivity: { action: 'start', data: { type: 'executing' }, controlledTabId: tabA, ts: Date.now() } }), { tabA });
    await worker.evaluate(async ({ tabA }) => chrome.storage.local.set({ hatclawAgentAction: { type: 'left_click', selector: '#target', controlledTabId: tabA, ts: Date.now() } }), { tabA });
    await pageA.waitForFunction(() => document.querySelector('#target')?.dataset.clicked === 'true', null, { timeout: 10000 });
    const actionProof = await pageA.evaluate(() => {
      const cursor = document.querySelector('#browserking-agent-cursor');
      const glow = document.querySelector('#agent-glow-root');
      return { clicked: document.querySelector('#target').dataset.clicked, scrollY, cursorVisible: cursor?.classList.contains('bk-visible'), glowActive: glow?.shadowRoot?.querySelector('.agent-active-glow')?.classList.contains('active'), status: document.querySelector('#status').textContent };
    });
    if (!actionProof.cursorVisible || !actionProof.glowActive || actionProof.scrollY < 500 || actionProof.status !== 'Alterações salvas') throw new Error(`Visual action proof failed: ${JSON.stringify(actionProof)}`);

    await worker.evaluate(async ({ tabA }) => chrome.tabs.sendMessage(tabA, { type: 'HIDE_GLOW_FOR_SCREENSHOT' }), { tabA });
    const hidden = await pageA.evaluate(() => ({ cursor: document.querySelector('#browserking-agent-cursor')?.classList.contains('bk-visible'), glow: getComputedStyle(document.querySelector('#agent-glow-root')).display }));
    await worker.evaluate(async ({ tabA }) => chrome.tabs.sendMessage(tabA, { type: 'RESTORE_GLOW_AFTER_SCREENSHOT' }), { tabA });
    const restored = await pageA.evaluate(() => ({ cursor: document.querySelector('#browserking-agent-cursor')?.classList.contains('bk-visible'), glow: getComputedStyle(document.querySelector('#agent-glow-root')).display }));
    if (hidden.cursor || hidden.glow !== 'none' || !restored.cursor || restored.glow === 'none') throw new Error('Screenshot hygiene failed');

    const pageB = await context.newPage();
    await pageB.goto('https://example.org', { waitUntil: 'domcontentloaded' });
    await pageB.evaluate(() => { document.body.innerHTML = '<button id="tab-target" onclick="this.dataset.clicked=\'true\'">Aba B</button>'; });
    await pageB.waitForTimeout(800);
    const tabB = await worker.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, pageB.url());
    await worker.evaluate(async ({ tabB }) => chrome.storage.local.set({ hatclawAgentActivity: { action: 'start', data: { type: 'executing' }, controlledTabId: tabB, ts: Date.now() }, hatclawAgentAction: { type: 'left_click', selector: '#tab-target', controlledTabId: tabB, ts: Date.now() } }), { tabB });
    await pageB.waitForFunction(() => document.querySelector('#tab-target')?.dataset.clicked === 'true', null, { timeout: 8000 });
    const backgroundVisualsOff = await pageA.evaluate(() => ({ cursor: document.querySelector('#browserking-agent-cursor')?.classList.contains('bk-visible'), glow: document.querySelector('#agent-glow-root')?.shadowRoot?.querySelector('.agent-active-glow')?.classList.contains('active') }));
    if (backgroundVisualsOff.cursor || backgroundVisualsOff.glow) throw new Error('Background tab retained agent visuals');

    await pageB.reload({ waitUntil: 'domcontentloaded' });
    await pageB.waitForTimeout(2600);
    const restoredAfterNavigation = await pageB.evaluate(() => document.querySelector('#agent-glow-root')?.shadowRoot?.querySelector('.agent-active-glow')?.classList.contains('active'));
    if (!restoredAfterNavigation) throw new Error('Glow state was not restored after navigation');

    await pageB.evaluate(() => { document.body.innerHTML = '<button id="noop">Sem efeito</button>'; });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ts = Date.now() + attempt;
      await worker.evaluate(async ({ tabB, ts }) => chrome.storage.local.set({ hatclawAgentAction: { type: 'left_click', selector: '#noop', controlledTabId: tabB, ts } }), { tabB, ts });
      await worker.evaluate(async ({ ts }) => new Promise((resolve, reject) => {
        const deadline = Date.now() + 8000;
        const poll = () => chrome.storage.local.get('hatclawActionResult', result => {
          if (Number(result?.hatclawActionResult?.requestTs || 0) === ts) resolve();
          else if (Date.now() > deadline) reject(new Error('action result timeout'));
          else setTimeout(poll, 100);
        });
        poll();
      }), { ts });
    }
    const loopResult = await worker.evaluate(async () => (await chrome.storage.local.get('hatclawActionResult')).hatclawActionResult);
    if (loopResult?.verification?.classification !== 'LOOP_DETECTED') throw new Error(`Loop detection failed: ${JSON.stringify(loopResult)}`);

    console.log(JSON.stringify({ compactDom: true, actionProof, screenshotHygiene: { hidden, restored }, tabSwitch: true, restoredAfterNavigation, loopDetected: true }, null, 2));
  } finally {
    await context.close();
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
