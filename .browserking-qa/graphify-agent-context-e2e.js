const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

(async () => {
  const captures = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS' }); return res.end();
    }
    let raw = ''; req.on('data', chunk => raw += chunk); req.on('end', () => {
      if (raw) captures.push(JSON.parse(raw));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ id: 'qa', model: 'gpt-4.1-mini', choices: [{ message: { role: 'assistant', content: 'Resposta QA' }, finish_reason: 'stop' }], usage: {} }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const root = path.resolve(__dirname, '..');
  const profile = path.join(__dirname, 'profile-graphify-agent-context');
  fs.rmSync(profile, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(profile, { headless: false, ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`], viewport: { width: 420, height: 900 } });
  let worker = context.serviceWorkers()[0]; if (!worker) worker = await context.waitForEvent('serviceworker');
  const page = await context.newPage(); await page.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
  await page.waitForFunction(() => Boolean(window.HatClawGraphify));
  await page.evaluate(async ({ baseUrl }) => {
    await chrome.storage.local.set({
      browserKingProviderState: { version: 2, activeProvider: 'openai', providers: { openai: { enabled: true, baseUrl, apiKey: 'qa-key', model: 'gpt-4.1-mini' } } },
      browserKingOrchestration: { enabled: true, learningEnabled: false, agentCount: 3, agents: [
        { id: 'agent-a', name: 'Agente A', persona: 'Analista A' }, { id: 'agent-b', name: 'Agente B', persona: 'Analista B' }
      ] }
    });
    const api = window.HatClawGraphify;
    const projectId = api.createProject('Memória automática');
    api.ingestMessage({ projectId, agentId: 'root', agentTitle: 'Agente principal', text: 'arquitetura memoria-raiz usa root-only.ts' });
    api.ingestMessage({ projectId, agentId: 'agent-a', agentTitle: 'Agente A', text: 'arquitetura memoria-agent-a usa modulo-a.ts' });
    api.ingestMessage({ projectId, agentId: 'agent-b', agentTitle: 'Agente B', text: 'arquitetura memoria-agent-b usa modulo-b.ts' });
  }, { baseUrl });

  const response = await page.evaluate(async () => {
    const result = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: 'claude', max_tokens: 200, stream: false,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Peça aos agentes especialistas para analisar a arquitetura.' }] }]
    }) });
    return { status: result.status, body: await result.json(), consultations: window.HatClawGraphify.getConsultations() };
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  const openAICaptures = captures.slice();
  const anthropicStatus = await page.evaluate(async ({ baseUrl }) => {
    await chrome.storage.local.set({
      browserKingProviderState: { version: 2, activeProvider: 'anthropic', providers: { anthropic: { enabled: true, baseUrl, apiKey: 'qa-key', model: 'claude-sonnet-4-5' } } },
      browserKingOrchestration: { enabled: false }
    });
    const result = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude', max_tokens: 100, stream: false, messages: [{ role: 'user', content: [{ type: 'text', text: 'Analise a arquitetura.' }] }] }) });
    return result.status;
  }, { baseUrl });
  const texts = openAICaptures.map(body => JSON.stringify(body));
  const specialistA = texts.find(text => text.includes('Agente A')) || '';
  const specialistB = texts.find(text => text.includes('Agente B')) || '';
  const coordinator = texts.find(text => !text.includes('Voce e o agente especialista')) || '';
  const assertions = {
    responseStatus: response.status,
    capturedRequests: captures.length,
    anthropicStatus,
    anthropicHasRootMemory: JSON.stringify(captures.at(-1)).includes('memoria-raiz'),
    rootHasOwnMemory: coordinator.includes('memoria-raiz'),
    rootDoesNotLeakA: !coordinator.includes('memoria-agent-a'),
    rootDoesNotLeakB: !coordinator.includes('memoria-agent-b'),
    agentAHasOwnMemory: specialistA.includes('memoria-agent-a'),
    agentADoesNotLeakB: !specialistA.includes('memoria-agent-b'),
    agentBHasOwnMemory: specialistB.includes('memoria-agent-b'),
    agentBDoesNotLeakA: !specialistB.includes('memoria-agent-a'),
    consultedAgents: [...new Set(response.consultations.slice(-3).map(item => item.agentId))].sort()
  };
  await page.click('.hc-agent-toggle'); await page.waitForSelector('.hc-graph-memory-status');
  assertions.uiStatus = await page.locator('.hc-graph-memory-status').textContent();
  const outDir = path.join(root, 'qa-artifacts', 'graphify-agent-context-2026-08-17'); fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, 'automatic-consultation.png') });
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ assertions, consultations: response.consultations.slice(-3) }, null, 2));
  console.log(JSON.stringify(assertions, null, 2));
  if (Object.entries(assertions).some(([key, value]) => !['uiStatus','capturedRequests','responseStatus','anthropicStatus','consultedAgents'].includes(key) && value !== true)) throw new Error('Graphify isolation assertion failed');
  if (captures.length !== 4 || response.status !== 200 || anthropicStatus !== 200 || assertions.consultedAgents.join(',') !== 'agent-a,agent-b,root') throw new Error('Graphify consultation coverage failed');
  await context.close(); await new Promise(resolve => server.close(resolve));
})().catch(error => { console.error(error); process.exit(1); });
