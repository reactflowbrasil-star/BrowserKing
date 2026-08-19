const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = path.join(__dirname, 'profile-graphify');
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
  await page.waitForSelector('.hc-agent-toggle');
  await page.click('.hc-agent-toggle');
  await page.waitForSelector('.hc-graphify');

  const result = await page.evaluate(() => {
    const api = window.HatClawGraphify;
    const projectA = api.createProject('Projeto Alpha');
    api.registerAgent({ id: 'root', title: 'Agente principal' });
    api.registerAgent({ id: 'agent-ui', title: 'Agente UI' });
    api.ingestMessage({ projectId: projectA, agentId: 'root', agentTitle: 'Agente principal', text: 'Arquitetura secretaRaiz usa backend.js', role: 'user' });
    api.ingestMessage({ projectId: projectA, agentId: 'agent-ui', agentTitle: 'Agente UI', text: 'Interface exclusivaAgente usa painel.css e https://hatclaw.test/mapa', role: 'assistant' });
    const projectB = api.createProject('Projeto Beta');
    api.ingestMessage({ projectId: projectB, agentId: 'root', text: 'Conhecimento isoladoBeta em worker.ts', role: 'user' });
    const alphaAgent = api.query('exclusivaAgente', { projectId: projectA, agentId: 'agent-ui' });
    const alphaRootLeak = api.query('secretaRaiz', { projectId: projectA, agentId: 'agent-ui' });
    const betaLeak = api.query('isoladoBeta', { projectId: projectA });
    api.setActiveProject(projectA);
    const exported = api.exportProject(projectA);
    return {
      projectA, projectB,
      projects: api.listProjects(),
      alphaAgentMatches: alphaAgent.nodes.length,
      alphaRootLeak: alphaRootLeak.nodes.length,
      betaLeak: betaLeak.nodes.length,
      nodes: exported.graph.nodes.length,
      edges: exported.graph.edges.length,
      agentNodes: exported.graph.nodes.filter(node => node.type === 'agent').map(node => node.label),
      entityAgentIds: exported.graph.nodes.filter(node => ['concept', 'file', 'url'].includes(node.type)).map(node => node.agentId)
    };
  });

  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('.hc-agent-toggle');
  await page.click('.hc-agent-toggle');
  await page.waitForSelector('.hc-graphify');
  const persisted = await page.evaluate(() => ({
    projects: window.HatClawGraphify.listProjects().map(item => item.name),
    summary: window.HatClawGraphify.getSummary(),
    svg: Boolean(document.querySelector('.hc-graph-svg')),
    selectedProject: document.querySelector('.hc-graph-project')?.selectedOptions[0]?.textContent,
    text: document.querySelector('.hc-graphify')?.innerText
  }));
  const outDir = path.join(root, 'qa-artifacts', 'graphify-2026-08-17');
  fs.mkdirSync(outDir, { recursive: true });
  await page.locator('.hc-graphify').scrollIntoViewIfNeeded();
  await page.evaluate(() => { const panel = document.querySelector('.hc-expanded'); if (panel) panel.scrollTop = panel.scrollHeight; });
  await page.screenshot({ path: path.join(outDir, 'graphify-panel.png') });
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ result, persisted }, null, 2));
  console.log(JSON.stringify({ extensionId, result, persisted }, null, 2));
  await context.close();
})().catch(error => { console.error(error); process.exit(1); });
