(() => {
  const CURSOR_ID = 'hatclaw-dom-navigation-cursor';
  const STYLE_ID = 'hatclaw-dom-navigation-cursor-styles';
  let cursor = null;
  let hideTimer = null;
  let isAgentActive = false;
  let lastCmdTs = 0;
  let cursorExplicitlyShown = false;

  function ensureCursor() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        @keyframes hatclaw-cursor-click {
          0% { transform: translate(-50%, -50%) scale(1); }
          30% { transform: translate(-50%, -50%) scale(.55); }
          60% { transform: translate(-50%, -50%) scale(1.15); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes hatclaw-cursor-ripple {
          0% { box-shadow: 0 0 0 0 rgba(128,255,0,.7); }
          100% { box-shadow: 0 0 0 25px rgba(128,255,0,0); }
        }
        #${CURSOR_ID}.clicking {
          animation: hatclaw-cursor-click 200ms ease-out;
        }
        #${CURSOR_ID}.clicking::after {
          content: '';
          position: absolute;
          left: 50%; top: 50%;
          width: 10px; height: 10px;
          margin-left: -5px; margin-top: -5px;
          border-radius: 50%;
          animation: hatclaw-cursor-ripple 400ms ease-out;
          pointer-events: none;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    cursor = document.getElementById(CURSOR_ID);
    if (cursor) return cursor;
    cursor = document.createElement('div');
    cursor.id = CURSOR_ID;
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = `<img src="${chrome.runtime.getURL('assets/cursor.png')}" alt="" />`;
    cursor.style.cssText = `
      position: fixed;
      left: -100px; top: -100px;
      width: 36px; height: 36px;
      margin-left: -4px; margin-top: -4px;
      pointer-events: none;
      z-index: 2147483647;
      opacity: 0;
      filter: drop-shadow(0 0 6px rgba(128,255,0,.9));
      transition: opacity 80ms ease;
    `;
    (document.body || document.documentElement).appendChild(cursor);
    return cursor;
  }

  function checkAgentActive() {
    const glowRoot = document.getElementById('agent-glow-root');
    if (glowRoot && glowRoot.shadowRoot) {
      const glowEl = glowRoot.shadowRoot.querySelector('.agent-active-glow');
      if (glowEl && glowEl.classList.contains('active')) return true;
    }
    const glowBorder = document.getElementById('claude-agent-glow-border');
    if (glowBorder && glowBorder.style.display !== 'none') return true;
    return false;
  }

  function updateAgentStatus() {
    isAgentActive = checkAgentActive();
    const el = ensureCursor();

    if (isAgentActive) {
      cursorExplicitlyShown = false;
      el.style.display = 'block';
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      clearTimeout(hideTimer);
    }
  }

  const observer = new MutationObserver(() => updateAgentStatus());
  observer.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['style', 'id', 'class']
  });

  function getElementCenter(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function showAt(x, y, clicked) {
    const el = ensureCursor();
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.opacity = '1';
    el.style.visibility = 'visible';
    el.style.display = 'block';
    cursorExplicitlyShown = true;
    clearTimeout(hideTimer);

    if (clicked) {
      el.classList.remove('clicking');
      void el.offsetWidth;
      el.classList.add('clicking');
      setTimeout(() => el.classList.remove('clicking'), 450);
    }
  }

  function hideCursor() {
    if (cursorExplicitlyShown) return;
    const el = document.getElementById(CURSOR_ID);
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
      if (!cursorExplicitlyShown && !isAgentActive) el.style.visibility = 'hidden';
    }, 300);
  }

  function resolveRef(ref) {
    if (!ref) return null;
    try {
      const map = window.__claudeElementMap;
      if (map && typeof map[ref]?.deref === 'function') {
        const el = map[ref].deref();
        if (el) return el;
      }
    } catch (_) {}
    try {
      return document.querySelector(`[data-ref="${ref}"]`) ||
             document.getElementById(ref) ||
             document.querySelector(`[aria-label="${ref}"]`);
    } catch (_) { return null; }
  }

  function followElement(element, clicked) {
    if (!element) return;
    const pos = getElementCenter(element);
    if (pos.x > 0 && pos.y > 0 && pos.x < window.innerWidth && pos.y < window.innerHeight) {
      showAt(pos.x, pos.y, !!clicked);
    }
  }

  function handleCursorCommand(cmd) {
    if (!cmd || (cmd.ts && cmd.ts <= lastCmdTs)) return;
    if (cmd.ts) lastCmdTs = cmd.ts;

    if (cmd.type === 'MOVE_CURSOR') {
      showAt(cmd.x, cmd.y, !!cmd.clicked);
    } else if (cmd.type === 'MOVE_CURSOR_TO_ELEMENT') {
      let element = null;
      if (cmd.selector) {
        try { element = document.querySelector(cmd.selector); } catch (_) {}
      }
      if (!element && cmd.ref) element = resolveRef(cmd.ref);
      followElement(element, cmd.clicked);
    }
  }

  // PRIMARY: chrome.storage.onChanged
  if (globalThis.chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes.hatclawAgentActivity) {
        const payload = changes.hatclawAgentActivity.newValue;
        if (!payload) return;
        const state = payload.data?.type;
        const activeStates = ['thinking', 'observing', 'planning', 'executing', 'verifying',
          'understanding', 'observation', 'action', 'verification'];
        if (activeStates.includes(state)) {
          isAgentActive = true;
          updateAgentStatus();
        }
      }

      if (changes.hatclawCursorCommand) {
        handleCursorCommand(changes.hatclawCursorCommand.newValue);
      }
    });
  }

  // FALLBACK: chrome.tabs.sendMessage
  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'MOVE_CURSOR') {
        showAt(message.x, message.y, !!message.clicked);
      }
      if (message.type === 'MOVE_CURSOR_TO_ELEMENT') {
        let element = null;
        if (message.selector) try { element = document.querySelector(message.selector); } catch (_) {}
        if (!element && message.ref) element = resolveRef(message.ref);
        followElement(element, message.clicked);
      }
      if (message.type === 'HATCLAW_AGENT_ACTIVITY') {
        const state = message.detail?.data?.type;
        const activeStates = ['thinking', 'observing', 'planning', 'executing', 'verifying',
          'understanding', 'observation', 'action', 'verification'];
        if (activeStates.includes(state)) { isAgentActive = true; updateAgentStatus(); }

        if (state === 'action' && isAgentActive) {
          try {
            const detailsStr = String(message.detail?.data?.details || '');
            const jsonStart = detailsStr.indexOf('{');
            const jsonEnd = detailsStr.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              const params = JSON.parse(detailsStr.slice(jsonStart, jsonEnd + 1));
              const actionName = String(params.action || '').toLowerCase();
              const isClick = ['left_click', 'right_click', 'double_click', 'triple_click', 'click'].some(a => actionName.includes(a));
              let coord = null;
              if (typeof params.x === 'number' && typeof params.y === 'number') coord = [params.x, params.y];
              else if (Array.isArray(params.coordinate) && params.coordinate.length >= 2) coord = params.coordinate;
              if (coord) { showAt(coord[0], coord[1], isClick); }
              else {
                let element = null;
                const sel = params.selector || params.cssSelector || params.element;
                const ref = params.ref || params.elementRef || params.target;
                if (sel) try { element = document.querySelector(sel); } catch (_) {}
                if (!element && ref) element = resolveRef(ref);
                followElement(element, isClick);
              }
            }
          } catch (_) {}
        }
      }
      return true;
    });
  }

  setTimeout(updateAgentStatus, 1000);
})();
