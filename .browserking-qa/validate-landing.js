const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const output = path.resolve(__dirname, '..', 'qa-artifacts', 'landing');
  fs.mkdirSync(output, { recursive: true });
  const errors = [];

  const checkPage = async (name, viewport, mobile = false) => {
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    page.on('console', (message) => message.type() === 'error' && errors.push(`${name}: ${message.text()}`));
    page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(output, `${name}-top-v2.png`) });
    await page.locator('#como-funciona').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(output, `${name}-workflow-v2.png`) });
    await page.locator('#downloads').scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(output, `${name}-downloads-v2.png`) });

    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      title: document.title,
      primaryCtaVisible: !!document.querySelector('.hero-actions .button-primary')?.offsetParent,
      downloadsVisible: !!document.querySelector('.download-grid')?.offsetParent,
      faqCount: document.querySelectorAll('.faq details').length,
      workflowCards: document.querySelectorAll('.workflow-step').length,
      bodyTextOverflow: [...document.querySelectorAll('h1,h2,h3,p,summary')].filter((element) => element.scrollWidth > element.clientWidth + 1).length,
    }));

    if (mobile) {
      await page.locator('.menu-toggle').click();
      const expanded = await page.locator('.menu-toggle').getAttribute('aria-expanded');
      if (expanded !== 'true') errors.push('mobile: menu não abriu');
      await page.locator('.menu-toggle').click();
    }

    await page.locator('#tab-android').click();
    const androidVisible = await page.locator('#android-steps').isVisible();
    await page.locator('#tab-chrome').click();
    const chromeVisible = await page.locator('#chrome-steps').isVisible();
    if (!androidVisible || !chromeVisible) errors.push(`${name}: abas de instalação falharam`);

    await page.locator('.faq details').first().locator('summary').click();
    if (!(await page.locator('.faq details').first().locator('p').isVisible())) errors.push(`${name}: FAQ não abriu`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(output, `${name}-faq-v2.png`) });
    await page.locator('.prompt-suggestions button').first().click();
    if (!(await page.locator('.prompt-toast').getAttribute('class')).includes('show')) errors.push(`${name}: feedback do prompt falhou`);

    await context.close();
    return metrics;
  };

  const desktop = await checkPage('desktop', { width: 1440, height: 900 });
  const tablet = await checkPage('tablet', { width: 768, height: 1024 }, true);
  const mobile = await checkPage('mobile', { width: 390, height: 844 }, true);
  const responseChecks = {};
  const request = await playwrightRequest();
  for (const target of [
    'downloads/hatclaw-extension-v1.4.0.zip',
    'downloads/hatclaw-android-v1.0.0-debug.apk',
    'assets/product-screen.png',
  ]) {
    const response = await request.head(`http://127.0.0.1:4173/${target}`);
    responseChecks[target] = { status: response.status(), bytes: Number(response.headers()['content-length']) };
  }

  await request.dispose();

  await browser.close();
  console.log(JSON.stringify({ desktop, tablet, mobile, responseChecks, errors }, null, 2));
  process.exitCode = errors.length || [desktop, tablet, mobile].some((result) => result.scrollWidth > result.width || result.bodyTextOverflow > 0) ? 1 : 0;
})();

async function playwrightRequest() {
  const { request } = require('playwright');
  return request.newContext();
}
