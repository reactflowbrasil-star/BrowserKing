(function() {
  'use strict';

  const CURSOR_ID = 'browserking-agent-cursor';
  const RIPPLE_ID = 'browserking-click-ripple';
  let agentCursor = null;
  let lastActionTs = 0;
  let isExecuting = false;

  /* ========== CURSOR VISUAL ========== */

  function createAgentCursor() {
    if (agentCursor && document.documentElement.contains(agentCursor)) return agentCursor;

    if (!document.getElementById('browserking-cursor-styles')) {
      var style = document.createElement('style');
      style.id = 'browserking-cursor-styles';
      style.textContent =
        '#' + CURSOR_ID + ' {' +
        '  position: fixed; left: -100px; top: -100px;' +
        '  width: 24px; height: 30px; pointer-events: none;' +
        '  z-index: 2147483647; opacity: 0;' +
        '  filter: drop-shadow(0 0 6px #39ff14) drop-shadow(0 0 12px rgba(57,255,20,.4));' +
        '  transition: left 450ms cubic-bezier(.22,.61,.36,1),' +
        '              top 450ms cubic-bezier(.22,.61,.36,1),' +
        '              opacity 150ms ease;' +
        '  will-change: left, top;' +
        '}' +
        '#' + CURSOR_ID + '.bk-visible { opacity: 1; }' +
        '#' + CURSOR_ID + '.bk-clicking svg { animation: bk-cursor-click 200ms ease-out; }' +
        '@keyframes bk-cursor-click {' +
        '  0% { transform: scale(1); }' +
        '  30% { transform: scale(.7); }' +
        '  60% { transform: scale(1.15); }' +
        '  100% { transform: scale(1); }' +
        '}' +
        '.' + RIPPLE_ID + ' {' +
        '  position: fixed; width: 12px; height: 12px;' +
        '  border: 2px solid #39ff14; border-radius: 50%;' +
        '  pointer-events: none; z-index: 2147483646;' +
        '  transform: translate(-50%, -50%) scale(0.4);' +
        '  opacity: 1; transition: all 350ms ease-out;' +
        '  box-shadow: 0 0 10px rgba(57,255,20,.8), 0 0 20px rgba(57,255,20,.3);' +
        '}' +
        '.' + RIPPLE_ID + '.bk-expand {' +
        '  transform: translate(-50%, -50%) scale(3); opacity: 0;' +
        '}';
      (document.head || document.documentElement).appendChild(style);
    }

    agentCursor = document.getElementById(CURSOR_ID);
    if (agentCursor) return agentCursor;

    agentCursor = document.createElement('div');
    agentCursor.id = CURSOR_ID;
    agentCursor.setAttribute('aria-hidden', 'true');
    agentCursor.innerHTML =
      '<svg width="24" height="30" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L21 17 Z" ' +
      'fill="#39FF14" stroke="#111" stroke-width="1.5"/>' +
      '</svg>';
    (document.documentElement || document.body).appendChild(agentCursor);
    return agentCursor;
  }

  function showCursor(x, y, clicked) {
    var cursor = createAgentCursor();
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    cursor.classList.add('bk-visible');
    cursor.classList.remove('bk-clicking');

    if (clicked) {
      void cursor.offsetWidth;
      cursor.classList.add('bk-clicking');
      showClickRipple(x, y);
      setTimeout(function() { cursor.classList.remove('bk-clicking'); }, 450);
    }
  }

  function hideCursor() {
    if (agentCursor) agentCursor.classList.remove('bk-visible');
  }

  function showClickRipple(x, y) {
    var ripple = document.createElement('div');
    ripple.className = RIPPLE_ID;
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    document.documentElement.appendChild(ripple);
    requestAnimationFrame(function() { ripple.classList.add('bk-expand'); });
    setTimeout(function() { ripple.remove(); }, 400);
  }

  /* ========== UTILITY ========== */

  function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function getElementCenter(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    var rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function isElementVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 &&
           style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /* ========== ELEMENT FINDER (DOM-first, semantic) ========== */

  function resolveRef(ref) {
    if (!ref) return null;
    try {
      var map = window.__claudeElementMap;
      if (map) {
        var entry = map[ref];
        if (entry && typeof entry.deref === 'function') {
          var el = entry.deref();
          if (el) return el;
        }
      }
    } catch (_) {}
    try {
      return document.querySelector('[data-ref="' + ref + '"]') ||
             document.getElementById(ref) ||
             document.querySelector('[aria-label="' + CSS.escape(ref) + '"]');
    } catch (_) { return null; }
  }

  function findElement(action) {
    if (!action) return null;

    // 1. Accessibility tree ref (most reliable)
    if (action.ref) {
      var el = resolveRef(action.ref);
      if (el) return el;
    }

    // 2. CSS selector
    if (action.selector) {
      try {
        var sel = document.querySelector(action.selector);
        if (sel) return sel;
      } catch (_) {}
    }

    // 3. Text content match on interactive elements
    if (action.text) {
      var selectors = 'button, a, input, textarea, select, [role="button"], [tabindex], [role="tab"], [role="menuitem"], label';
      var candidates = Array.from(document.querySelectorAll(selectors));
      var needle = action.text.trim().toLowerCase();
      var found = candidates.find(function(c) {
        var text = (c.innerText || c.getAttribute('aria-label') ||
                   c.getAttribute('placeholder') || c.getAttribute('title') || c.value || '');
        return text.trim().toLowerCase().indexOf(needle) !== -1;
      });
      if (found) return found;
    }

    // 4. Coordinate fallback (element at point)
    if (action.coordinate && action.coordinate.length >= 2) {
      var pt = document.elementFromPoint(action.coordinate[0], action.coordinate[1]);
      if (pt) return pt;
    }

    return null;
  }

  /* ========== CURSOR MOVEMENT TO ELEMENT ========== */

  async function moveCursorToElement(element) {
    if (!element) throw new Error('Elemento nao encontrado');
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    await sleep(400);
    var center = getElementCenter(element);
    showCursor(center.x, center.y, false);
    await sleep(200);
  }

  /* ========== DOM EVENT SIMULATION ========== */

  function dispatchMouseEvents(element, type, opts) {
    opts = opts || {};
    var rect = element.getBoundingClientRect();
    var x = opts.x || rect.left + rect.width / 2;
    var y = opts.y || rect.top + rect.height / 2;
    var common = {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y,
      screenX: x + window.screenX, screenY: y + window.screenY,
      button: opts.button || 0, buttons: opts.buttons || 0
    };
    element.dispatchEvent(new PointerEvent(type, Object.assign({}, common, { pointerType: 'mouse' })));
    element.dispatchEvent(new MouseEvent(type, common));
  }

  function simulateHover(element) {
    dispatchMouseEvents(element, 'pointerover');
    dispatchMouseEvents(element, 'mouseover');
    dispatchMouseEvents(element, 'mouseenter');
  }

  function simulateMouseDown(element) {
    dispatchMouseEvents(element, 'pointerdown', { buttons: 1 });
    dispatchMouseEvents(element, 'mousedown', { buttons: 1 });
  }

  function simulateMouseUp(element) {
    dispatchMouseEvents(element, 'pointerup');
    dispatchMouseEvents(element, 'mouseup');
  }

  /* ========== ACTION EXECUTORS ========== */

  async function agentClick(element, opts) {
    opts = opts || {};
    if (!element) throw new Error('Elemento nao encontrado para clique');

    if (!isElementVisible(element)) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      await sleep(400);
    }

    var center = getElementCenter(element);
    showCursor(center.x, center.y, false);
    await sleep(200);

    // Hover
    simulateHover(element);
    await sleep(100);

    // Mouse down
    simulateMouseDown(element);
    await sleep(50);

    // Visual click + ripple
    showCursor(center.x, center.y, true);

    // Real DOM click
    if (opts.double) {
      element.click();
      await sleep(50);
      element.click();
    } else {
      element.click();
    }

    // Mouse up
    simulateMouseUp(element);
    await sleep(200);
  }

  async function agentType(element, text) {
    if (!element) throw new Error('Elemento nao encontrado para digitacao');

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);

    var center = getElementCenter(element);
    showCursor(center.x, center.y, false);
    await sleep(200);

    simulateHover(element);
    await sleep(100);
    element.focus();
    await sleep(100);

    var isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
    var prop = isInput ? 'value' : 'textContent';
    element[prop] = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));

    for (var i = 0; i < text.length; i++) {
      element[prop] += text[i];
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(25 + Math.random() * 35);
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function agentFocus(element) {
    if (!element) throw new Error('Elemento nao encontrado para foco');
    await moveCursorToElement(element);
    element.focus();
  }

  async function agentSelect(element, value) {
    if (!element) throw new Error('Elemento nao encontrado para selecao');
    await moveCursorToElement(element);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function agentScroll(direction, amount) {
    var px = (amount || 3) * 120;
    var top = direction === 'up' ? -px : px;
    window.scrollBy({ top: top, behavior: 'smooth' });
    await sleep(400);
  }

  async function agentHover(element) {
    if (!element) throw new Error('Elemento nao encontrado para hover');
    var center = getElementCenter(element);
    showCursor(center.x, center.y, false);
    await sleep(150);
    simulateHover(element);
  }

  /* ========== MAIN ACTION DISPATCHER ========== */

  async function executeAction(action) {
    if (!action || !action.type) throw new Error('Acao invalida: tipo nao especificado');

    var actionType = String(action.type).toLowerCase();

    // Scroll needs no element
    if (actionType === 'scroll') {
      await agentScroll(action.direction, action.amount);
      return;
    }

    var element = findElement(action);
    if (!element) {
      throw new Error('Elemento nao encontrado: ' + JSON.stringify({
        selector: action.selector, ref: action.ref,
        text: action.text, coordinate: action.coordinate
      }));
    }

    switch (actionType) {
      case 'click':
      case 'left_click':
        await agentClick(element);
        break;
      case 'double_click':
        await agentClick(element, { double: true });
        break;
      case 'right_click':
        await agentClick(element);
        break;
      case 'type':
      case 'input':
        await agentType(element, action.text || action.value || '');
        break;
      case 'focus':
        await agentFocus(element);
        break;
      case 'select':
        await agentSelect(element, action.value || '');
        break;
      case 'hover':
      case 'mouseover':
        await agentHover(element);
        break;
      default:
        throw new Error('Acao nao suportada: ' + actionType);
    }
  }

  /* ========== POST-ACTION VERIFICATION ========== */

  function capturePageState() {
    return {
      url: window.location.href,
      title: document.title,
      bodyLength: document.body ? document.body.innerHTML.length : 0,
      elementCount: document.querySelectorAll('*').length,
      ts: Date.now()
    };
  }

  function verifyAction(prev, curr) {
    if (!prev || !curr) return { ok: false, evidence: 'no state' };
    var urlChanged = prev.url !== curr.url;
    var titleChanged = prev.title !== curr.title;
    var domChanged = Math.abs(prev.bodyLength - curr.bodyLength) > 50;
    var elementChanged = Math.abs(prev.elementCount - curr.elementCount) > 5;
    return {
      ok: urlChanged || titleChanged || domChanged || elementChanged,
      urlChanged: urlChanged,
      titleChanged: titleChanged,
      domChanged: domChanged,
      elementChanged: elementChanged,
      evidence: urlChanged ? 'navigation' : (domChanged ? 'dom_mutation' : (titleChanged ? 'title_change' : 'no_change'))
    };
  }

  /* ========== ORCHESTRATOR ========== */

  async function handleAgentAction(action) {
    if (!action || !action.ts) return;
    if (action.ts <= lastActionTs) return;
    if (isExecuting) return;

    lastActionTs = action.ts;
    isExecuting = true;

    var prevState = capturePageState();
    var startTime = Date.now();

    try {
      console.log('[BrowserKing] executing action:', action.type, action);
      await executeAction(action);
      await sleep(300);

      var currState = capturePageState();
      var verification = verifyAction(prevState, currState);

      chrome.storage.local.set({
        hatclawActionResult: {
          success: true,
          action: action.type,
          verification: verification,
          duration: Date.now() - startTime,
          ts: Date.now()
        }
      });
      console.log('[BrowserKing] action OK:', action.type, verification);
    } catch (error) {
      console.error('[BrowserKing] action FAILED:', action.type, error.message);
      chrome.storage.local.set({
        hatclawActionResult: {
          success: false,
          action: action.type,
          error: error.message,
          duration: Date.now() - startTime,
          ts: Date.now()
        }
      });
    } finally {
      isExecuting = false;
    }
  }

  /* ========== CURSOR-ONLY COMMANDS (legacy compat) ========== */

  function handleCursorCommand(cmd) {
    if (!cmd || (cmd.ts && cmd.ts <= lastActionTs)) return;
    if (cmd.type === 'MOVE_CURSOR') {
      showCursor(cmd.x, cmd.y, !!cmd.clicked);
    } else if (cmd.type === 'MOVE_CURSOR_TO_ELEMENT') {
      var el = findElement(cmd);
      if (el) {
        var center = getElementCenter(el);
        showCursor(center.x, center.y, !!cmd.clicked);
      }
    }
  }

  /* ========== STORAGE LISTENER (primary) ========== */

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function(changes, areaName) {
      if (areaName !== 'local') return;

      // Full DOM action (primary path)
      if (changes.hatclawAgentAction) {
        var action = changes.hatclawAgentAction.newValue;
        if (action && action.ts) {
          handleAgentAction(action);
        }
      }

      // Cursor-only command (legacy compat)
      if (changes.hatclawCursorCommand) {
        handleCursorCommand(changes.hatclawCursorCommand.newValue);
      }
    });
  }

  /* ========== MESSAGE LISTENER (fallback) ========== */

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message.type === 'AGENT_ACTION' && message.action) {
        handleAgentAction(Object.assign({ ts: Date.now() }, message.action));
        sendResponse({ received: true });
        return true;
      }
      if (message.type === 'MOVE_CURSOR') {
        showCursor(message.x, message.y, !!message.clicked);
      }
      if (message.type === 'MOVE_CURSOR_TO_ELEMENT') {
        var el = findElement(message);
        if (el) {
          var center = getElementCenter(el);
          showCursor(center.x, center.y, !!message.clicked);
        }
      }
      return false;
    });
  }

  console.log('[BrowserKing] content-script.js loaded - DOM-first agent ready');

})();
