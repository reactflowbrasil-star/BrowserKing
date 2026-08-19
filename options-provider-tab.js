(function() {
  'use strict';

  const TAB_ID = 'options?prism_tab=providers';
  const TAB_LABEL = 'Providers';
  const ORCHESTRATION_TAB_ID = 'options?prism_tab=orchestration';

  function isProvidersTab() {
    return window.location.hash === `#${TAB_ID}`;
  }

  function setActiveTab() {
    const isProviders = isProvidersTab();
    const isOrchestration = window.location.hash === `#${ORCHESTRATION_TAB_ID}`;
    const frame = document.getElementById('prism-provider-frame-wrap');
    if (!frame) {
      return;
    }

    frame.style.display = isProviders ? '' : 'none';
    const orchestrationFrame = document.getElementById('prism-orchestration-frame-wrap');
    if (orchestrationFrame) orchestrationFrame.style.display = isOrchestration ? '' : 'none';

    const contentHost = frame.parentElement;
    if (!contentHost) {
      return;
    }

    contentHost.style.position = 'relative';
    contentHost.style.minHeight = 'calc(100vh - 180px)';

    Array.from(contentHost.children).forEach((child) => {
      if (child === frame || child === orchestrationFrame) {
        return;
      }

      child.style.display = (isProviders || isOrchestration) ? 'none' : '';
    });

    const providerButton = document.querySelector('[data-prism-provider-nav]');
    const orchestrationButton = document.querySelector('[data-prism-orchestration-nav]');
    const navItems = document.querySelectorAll('nav ul button');
    navItems.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }

      if (button === providerButton) {
        if (isProviders) {
          button.setAttribute('aria-current', 'page');
          button.setAttribute('data-state', 'active');
          button.tabIndex = 0;
        } else {
          button.removeAttribute('aria-current');
          button.removeAttribute('data-state');
        }
        button.style.background = isProviders ? 'hsl(var(--bg-300))' : 'transparent';
        button.style.color = isProviders ? 'hsl(var(--text-000))' : 'hsl(var(--text-200))';
        button.style.fontWeight = isProviders ? '550' : '430';
        return;
      }

      if (button === orchestrationButton) {
        if (isOrchestration) {
          button.setAttribute('aria-current', 'page');
          button.setAttribute('data-state', 'active');
          button.tabIndex = 0;
        } else {
          button.removeAttribute('aria-current');
          button.removeAttribute('data-state');
        }
        button.style.background = isOrchestration ? 'hsl(var(--bg-300))' : 'transparent';
        button.style.color = isOrchestration ? 'hsl(var(--text-000))' : 'hsl(var(--text-200))';
        button.style.fontWeight = isOrchestration ? '550' : '430';
        return;
      }

      if (isProviders || isOrchestration) {
        button.removeAttribute('aria-current');
        button.removeAttribute('data-state');
        button.tabIndex = -1;
        button.style.background = 'transparent';
        button.style.color = 'hsl(var(--text-200))';
        button.style.fontWeight = '430';
      } else {
        button.style.background = '';
        button.style.color = '';
        button.style.fontWeight = '';
        button.tabIndex = 0;
      }
    });
  }

  function mount() {
    const navList = document.querySelector('nav ul');
    const contentHost = document.querySelector('nav + div');
    if (!navList || !contentHost || document.getElementById('prism-provider-frame-wrap')) {
      return;
    }

    const navItem = document.createElement('li');
    const templateButton = navList.querySelector('button');
    const templateClasses = templateButton ? templateButton.className : '';
    navItem.innerHTML = `
      <button
        type="button"
        data-prism-provider-nav="true"
        class="${templateClasses}"
        style="display:block;width:100%;"
      >
        ${TAB_LABEL}
      </button>
    `;
    navItem.querySelector('button').addEventListener('click', () => {
      window.location.hash = TAB_ID;
    });
    navList.appendChild(navItem);

    const orchestrationItem = document.createElement('li');
    orchestrationItem.innerHTML = `<button type="button" data-prism-orchestration-nav="true" class="${templateClasses}" style="display:block;width:100%;">Multiagentes</button>`;
    orchestrationItem.querySelector('button').addEventListener('click', () => { window.location.hash = ORCHESTRATION_TAB_ID; });
    navList.appendChild(orchestrationItem);

    const frameWrap = document.createElement('div');
    frameWrap.id = 'prism-provider-frame-wrap';
    frameWrap.style.display = 'none';
    frameWrap.style.position = 'absolute';
    frameWrap.style.inset = '0';
    frameWrap.style.zIndex = '2';
    frameWrap.innerHTML = `
      <iframe
        src="/provider-settings.html"
        title="Provider settings"
        style="width:100%;height:100%;min-height:calc(100vh - 180px);border:1px solid hsl(var(--border-300) / 0.18);border-radius:18px;background:hsl(var(--bg-100));"
      ></iframe>
    `;
    contentHost.appendChild(frameWrap);

    const orchestrationWrap = document.createElement('div');
    orchestrationWrap.id = 'prism-orchestration-frame-wrap';
    orchestrationWrap.style.cssText = 'display:none;position:absolute;inset:0;z-index:2';
    orchestrationWrap.innerHTML = `<iframe src="/orchestration-settings.html" title="Orquestração multiagente" style="width:100%;height:100%;min-height:calc(100vh - 180px);border:1px solid hsl(var(--border-300) / 0.18);border-radius:18px;background:#191919"></iframe>`;
    contentHost.appendChild(orchestrationWrap);

    setActiveTab();
  }

  const observer = new MutationObserver(() => {
    mount();
    setActiveTab();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', setActiveTab);
  mount();
})();
