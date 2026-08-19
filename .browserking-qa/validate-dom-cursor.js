const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = path.join(root, '.browserking-cursor-qa-profile');
  const artifacts = path.join(root, 'qa-artifacts');
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });

  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1200, height: 760 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });

  try {
    const page = await context.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.mouse.move(180, 140, { steps: 8 });
    await page.waitForTimeout(80);
    const moving = await page.evaluate(() => {
      const el = document.querySelector('#hatclaw-dom-navigation-cursor');
      return el && {
        left: el.style.left,
        top: el.style.top,
        opacity: getComputedStyle(el).opacity,
        width: getComputedStyle(el).width,
        height: getComputedStyle(el).height,
        shape: el.querySelector('path')?.getAttribute('d'),
        fill: el.querySelector('path')?.getAttribute('fill'),
        pointerEvents: getComputedStyle(el).pointerEvents,
        zIndex: getComputedStyle(el).zIndex
      };
    });
    if (!moving || moving.opacity !== '1' || moving.width !== '18px' ||
        moving.height !== '22px' || moving.fill !== '#8b9198' || !moving.shape) {
      throw new Error(`Cursor did not appear correctly: ${JSON.stringify(moving)}`);
    }

    await page.mouse.down();
    await page.waitForTimeout(120);
    const clicked = await page.evaluate(() => {
      const el = document.querySelector('#hatclaw-dom-navigation-cursor');
      return { animation: getComputedStyle(el).animationName, opacity: getComputedStyle(el).opacity };
    });
    await page.screenshot({ path: path.join(artifacts, 'dom-navigation-cursor-click.png') });
    await page.mouse.up();
    if (clicked.animation !== 'hatclaw-cursor-pulse') {
      throw new Error(`Click pulse was not active: ${JSON.stringify(clicked)}`);
    }

    const synthetic = await page.evaluate(() => {
      const link = document.querySelector('a');
      link.addEventListener('click', event => event.preventDefault(), { once: true });
      const rect = link.getBoundingClientRect();
      link.click();
      const cursor = document.querySelector('#hatclaw-dom-navigation-cursor');
      return {
        expectedLeft: `${rect.left + rect.width / 2}px`,
        expectedTop: `${rect.top + rect.height / 2}px`,
        left: cursor.style.left,
        top: cursor.style.top,
        opacity: getComputedStyle(cursor).opacity,
        animation: getComputedStyle(cursor).animationName
      };
    });
    if (Math.abs(parseFloat(synthetic.left) - parseFloat(synthetic.expectedLeft)) > 0.1 ||
        Math.abs(parseFloat(synthetic.top) - parseFloat(synthetic.expectedTop)) > 0.1 ||
        synthetic.opacity !== '1' || synthetic.animation !== 'hatclaw-cursor-pulse') {
      throw new Error(`Synthetic DOM click did not show the cursor: ${JSON.stringify(synthetic)}`);
    }
    await page.screenshot({ path: path.join(artifacts, 'dom-navigation-cursor-synthetic-click.png') });

    await page.waitForTimeout(1600);
    const hiddenOpacity = await page.locator('#hatclaw-dom-navigation-cursor').evaluate(el => getComputedStyle(el).opacity);
    if (hiddenOpacity !== '0') throw new Error(`Cursor did not hide: opacity=${hiddenOpacity}`);

    console.log(JSON.stringify({
      page: await page.title(),
      moving,
      clicked,
      synthetic,
      hiddenOpacity,
      screenshot: 'qa-artifacts/dom-navigation-cursor-synthetic-click.png'
    }, null, 2));
  } finally {
    await context.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
