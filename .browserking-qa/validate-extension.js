const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = path.join(root, '.browserking-chromium-profile');
  const artifacts = path.join(root, 'qa-artifacts');
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });

  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });

  try {
    let workers = context.serviceWorkers();
    if (!workers.length) {
      const extensionsPage = context.pages()[0] || await context.newPage();
      await extensionsPage.goto('chrome://extensions');
      const devMode = extensionsPage.locator('#devMode');
      if (await devMode.getAttribute('aria-pressed') !== 'true') await devMode.click();
      const dialogHelper = `Start-Sleep -Milliseconds 1200;Set-Clipboard -Value '${root.replace(/'/g,"''")}';$w=New-Object -ComObject WScript.Shell;$w.SendKeys('^l');Start-Sleep -Milliseconds 300;$w.SendKeys('^v');$w.SendKeys('{ENTER}');Start-Sleep -Milliseconds 900;$w.SendKeys('%s');Start-Sleep -Milliseconds 300;$w.SendKeys('{ENTER}')`;
      spawn('powershell.exe', ['-NoProfile','-WindowStyle','Hidden','-Command',dialogHelper], { detached:true, stdio:'ignore', windowsHide:true }).unref();
      await extensionsPage.locator('#loadUnpacked').click();
      workers = [await context.waitForEvent('serviceworker', { timeout:25000 })];
    }
    const extensionId = new URL(workers[0].url()).host;
    console.log(`EXTENSION_ID=${extensionId}`);

    const install = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'native-host','install.ps1'),'-ExtensionId',extensionId], { encoding:'utf8' });
    if (install.status !== 0) throw new Error(`Host install failed: ${install.stderr || install.stdout}`);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/control-center.html`, { waitUntil:'domcontentloaded' });
    await page.getByRole('button', { name:'Ver status' }).click();
    await page.waitForFunction(() => document.querySelector('#output')?.textContent.includes('auditDirectory'), null, { timeout:15000 });
    const status = JSON.parse(await page.locator('#output').textContent());
    if (!status.ok || !status.result?.allowedRoots?.length) throw new Error('Native status response is incomplete');

    const unknown = await page.evaluate(() => chrome.runtime.sendMessage({ target:'browserking-windows', action:'not.real', params:{} }));
    if (unknown.ok || !/Unknown action/i.test(unknown.error)) throw new Error('Unknown-action denial failed');
    const outside = await page.evaluate(() => chrome.runtime.sendMessage({ target:'browserking-windows', action:'file.read', params:{ path:'C:\\Windows\\win.ini' } }));
    if (outside.ok || !/outside allowed roots/i.test(outside.error)) throw new Error('Filesystem boundary denial failed');

    const fit = await page.evaluate(() => ({
      title:document.title,
      innerWidth,
      innerHeight,
      scrollWidth:document.documentElement.scrollWidth,
      canScrollX:document.documentElement.scrollWidth>document.documentElement.clientWidth,
      cards:[...document.querySelectorAll('.card')].map(e=>{const r=e.getBoundingClientRect();return {right:r.right,bottom:r.bottom}})
    }));
    await page.screenshot({ path:path.join(artifacts,'control-center-desktop.png'), fullPage:true });

    await page.setViewportSize({ width:800, height:700 });
    await page.screenshot({ path:path.join(artifacts,'control-center-small.png'), fullPage:true });
    const small = await page.evaluate(() => ({ canScrollX:document.documentElement.scrollWidth>document.documentElement.clientWidth, width:innerWidth }));
    if (fit.canScrollX || small.canScrollX) throw new Error('Horizontal clipping detected');

    console.log(JSON.stringify({ extensionId, nativeStatus:true, unknownDenied:true, outsideRootDenied:true, fit, small, screenshots:['qa-artifacts/control-center-desktop.png','qa-artifacts/control-center-small.png'] }, null, 2));
    await new Promise(resolve => setTimeout(resolve, 1500));
  } finally {
    await context.close();
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
