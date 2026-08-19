const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

function merge(server, incoming) {
  if (!server) return structuredClone(incoming);
  const out = structuredClone(server);
  const projects = new Map([...out.projects, ...incoming.projects].map(item => [item.id, item]));
  out.projects = [...projects.values()];
  out.activeProjectId = incoming.activeProjectId;
  for (const project of out.projects) {
    const a = out.graphs[project.id] || { nodes: [], edges: [] };
    const b = incoming.graphs[project.id] || { nodes: [], edges: [] };
    out.graphs[project.id] = {
      nodes: [...new Map([...a.nodes, ...b.nodes].map(item => [item.id, item])).values()],
      edges: [...new Map([...a.edges, ...b.edges].map(item => [item.id, item])).values()]
    };
  }
  return out;
}

(async () => {
  let remoteState = null, revision = 0;
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/graph/sync' || req.headers.authorization !== 'Bearer qa-token') { res.writeHead(404); return res.end(); }
    let raw = ''; req.on('data', chunk => raw += chunk); req.on('end', () => {
      const body = JSON.parse(raw); remoteState = merge(remoteState, body.state); revision += 1;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, revision, state: remoteState }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const root = path.resolve(__dirname, '..');

  async function openProfile(name) {
    const profile = path.join(__dirname, name); fs.rmSync(profile, { recursive: true, force: true });
    const context = await chromium.launchPersistentContext(profile, { headless: false, ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`], viewport: { width: 420, height: 900 } });
    let worker = context.serviceWorkers()[0]; if (!worker) worker = await context.waitForEvent('serviceworker');
    const page = await context.newPage(); await page.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
    await page.evaluate(async ({ endpoint }) => {
      localStorage.setItem('hatclaw.graphify.sync.endpoint', endpoint);
      await chrome.storage.local.set({ browserKingRemoteBridge: { token: 'qa-token' } });
    }, { endpoint });
    await page.reload(); await page.waitForFunction(() => Boolean(window.HatClawGraphify));
    return { context, page };
  }

  const a = await openProfile('profile-graphify-sync-a');
  const importTest = await a.page.evaluate(() => {
    let malformedRejected = false;
    try { window.HatClawGraphify.importGraphJson('{quebrado'); } catch (_) { malformedRejected = true; }
    const id = window.HatClawGraphify.createProject('Computador A');
    window.HatClawGraphify.ingestMessage({ projectId: id, agentId: 'agent-a', text: 'Conhecimento somenteA arquivo-a.ts' });
    const exported = window.HatClawGraphify.exportProject(id);
    const imported = window.HatClawGraphify.importGraphJson(JSON.stringify(exported));
    return { malformedRejected, imported };
  });
  const syncA1 = await a.page.evaluate(() => window.HatClawGraphify.syncNow());

  const b = await openProfile('profile-graphify-sync-b');
  await b.page.evaluate(() => {
    const id = window.HatClawGraphify.createProject('Computador B');
    window.HatClawGraphify.ingestMessage({ projectId: id, agentId: 'agent-b', text: 'Conhecimento somenteB arquivo-b.ts' });
  });
  const syncB = await b.page.evaluate(() => window.HatClawGraphify.syncNow());
  const projectsB = await b.page.evaluate(() => window.HatClawGraphify.listProjects().map(item => item.name));
  const syncA2 = await a.page.evaluate(() => window.HatClawGraphify.syncNow());
  const projectsA = await a.page.evaluate(() => window.HatClawGraphify.listProjects().map(item => item.name));

  await a.page.click('.hc-agent-toggle'); await a.page.waitForSelector('.hc-graphify');
  const controls = await a.page.evaluate(() => ({ import: Boolean(document.querySelector('.hc-graph-import')), sync: Boolean(document.querySelector('.hc-graph-sync')), status: document.querySelector('.hc-graph-sync-status')?.textContent }));
  const outDir = path.join(root, 'qa-artifacts', 'graphify-sync-2026-08-17'); fs.mkdirSync(outDir, { recursive: true });
  await a.page.screenshot({ path: path.join(outDir, 'sync-panel.png') });
  const result = { importTest, syncA1, syncB, syncA2, projectsA, projectsB, controls, remoteRevision: revision };
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  await a.context.close(); await b.context.close(); await new Promise(resolve => server.close(resolve));
})().catch(error => { console.error(error); process.exit(1); });
