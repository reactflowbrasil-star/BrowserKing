(function() {
  'use strict';

  var CURSOR_ID = 'browserking-agent-cursor';
  var RIPPLE_ID = 'browserking-click-ripple';
  var agentCursor = null;
  var lastActionTs = 0;
  var isExecuting = false;
  var cursorWasVisibleBeforeScreenshot = false;
  var recentActionStates = [];
  var currentTabId = null;
  try { chrome.runtime.sendMessage({ type: 'HATCLAW_IDENTIFY_TAB' }, function(response) { currentTabId = response?.tabId || null; }); } catch (_) {}

  function belongsToThisTab(payload) {
    return !payload?.controlledTabId || !currentTabId || payload.controlledTabId === currentTabId;
  }

  /* ===== ELEMENT MEMORY ===== */

  var elementMemory = {};
  var MEMORY_MAX = 200;
  var MEMORY_TTL = 60000;

  function memoryKey(el) {
    if (!el) return null;
    var tag = el.tagName || '';
    var id = el.id || '';
    var cls = (el.className && typeof el.className === 'string') ? el.className.split(' ')[0] : '';
    var text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').slice(0, 40);
    var role = el.getAttribute('role') || '';
    return tag + '|' + id + '|' + cls + '|' + role + '|' + text;
  }

  function rememberElement(el, context) {
    if (!el) return;
    var key = memoryKey(el);
    if (!key) return;
    var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    elementMemory[key] = {
      tag: el.tagName,
      id: el.id,
      className: typeof el.className === 'string' ? el.className : '',
      text: (el.innerText || '').slice(0, 100),
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      role: el.getAttribute('role') || '',
      rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      lastSeen: Date.now(),
      context: context || 'action'
    };
    var keys = Object.keys(elementMemory);
    if (keys.length > MEMORY_MAX) {
      var now = Date.now();
      for (var i = keys.length - 1; i >= 0; i--) {
        if (now - elementMemory[keys[i]].lastSeen > MEMORY_TTL) {
          delete elementMemory[keys[i]];
        }
      }
    }
  }

  function findMemoryByDescription(desc) {
    if (!desc) return null;
    var lower = desc.toLowerCase();
    var now = Date.now();
    var best = null;
    var bestScore = 0;
    var keys = Object.keys(elementMemory);
    for (var i = 0; i < keys.length; i++) {
      var mem = elementMemory[keys[i]];
      if (now - mem.lastSeen > MEMORY_TTL) continue;
      var score = 0;
      if (mem.text && mem.text.toLowerCase().indexOf(lower) !== -1) score += 10;
      if (mem.ariaLabel && mem.ariaLabel.toLowerCase().indexOf(lower) !== -1) score += 10;
      if (mem.placeholder && mem.placeholder.toLowerCase().indexOf(lower) !== -1) score += 8;
      if (mem.id && lower.indexOf(mem.id.toLowerCase()) !== -1) score += 5;
      if (score > bestScore) { bestScore = score; best = mem; }
    }
    return best;
  }

  /* ===== DOM COMPREHENSION ===== */

  function getElementDescription(el) {
    if (!el) return '(null)';
    var tag = el.tagName || '?';
    var id = el.id ? '#' + el.id : '';
    var cls = (el.className && typeof el.className === 'string') ? '.' + el.className.split(' ')[0] : '';
    var role = el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '';
    var text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 40);
    var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    var pos = rect ? ' @(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ')' : '';
    return '<' + tag + id + cls + role + '> "' + text + '"' + pos;
  }

  function normalizeWords(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(function(word) { return word.length > 2; });
  }

  function relevanceScore(info, goal) {
    var words = normalizeWords(goal);
    if (!words.length) return info.visible ? 1 : 0;
    var haystack = normalizeWords([info.text, info.ariaLabel, info.placeholder, info.label, info.parentContext].join(' '));
    var score = info.visible ? 2 : 0;
    for (var i = 0; i < words.length; i++) if (haystack.indexOf(words[i]) !== -1) score += 4;
    return score;
  }

  function buildPageContext(goal) {
    var ctx = { url: window.location.href, title: document.title, headings: [], elements: [], visibleText: '' };
    try {
      var headingNodes = document.querySelectorAll('h1, h2, h3, [role="heading"]');
      for (var h = 0; h < Math.min(headingNodes.length, 12); h++) {
        var headingText = (headingNodes[h].innerText || headingNodes[h].textContent || '').trim();
        if (headingText) ctx.headings.push(headingText.slice(0, 160));
      }
      ctx.visibleText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
      var all = document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="textbox"], [tabindex]:not([tabindex="-1"]), [onclick], [contenteditable="true"]');
      for (var i = 0; i < all.length && i < 300; i++) {
        var el = all[i];
        var rect = el.getBoundingClientRect();
        var style = window.getComputedStyle(el);
        var isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        var label = el.labels && el.labels[0] ? (el.labels[0].innerText || '').trim() : '';
        var parent = el.closest('form, section, article, dialog, [role="dialog"], [role="menu"], nav');
        var info = {
          elementId: 'E' + (i + 1), index: i, tag: el.tagName, type: el.type || '', id: el.id || null,
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          placeholder: el.getAttribute('placeholder') || null,
          label: label || null,
          parentContext: parent ? ((parent.getAttribute('aria-label') || parent.querySelector('h1,h2,h3')?.textContent || '').trim().slice(0, 120)) : null,
          text: (el.innerText || '').trim().slice(0, 80),
          visible: isVisible,
          enabled: !el.disabled && el.getAttribute('aria-disabled') !== 'true',
          selected: Boolean(el.checked || el.selected || el.getAttribute('aria-selected') === 'true'),
          rect: isVisible ? { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) } : null
        };
        info.relevance = relevanceScore(info, goal);
        ctx.elements.push(info);
      }
      ctx.elements.sort(function(left, right) { return right.relevance - left.relevance || left.index - right.index; });
      ctx.elements = ctx.elements.filter(function(info, index) { return info.visible || index < 20; }).slice(0, 60);
    } catch (e) {}
    return ctx;
  }

  function getPageContextSummary(goal) {
    var ctx = buildPageContext(goal);
    var lines = [];
    lines.push('PAGE: ' + ctx.title + ' | ' + ctx.url);
    if (ctx.headings.length) lines.push('HEADINGS: ' + ctx.headings.join(' | '));
    lines.push('ELEMENTS: ' + ctx.elements.length + ' compactados e ordenados por relevância');
    for (var i = 0; i < ctx.elements.length; i++) {
      var el = ctx.elements[i];
      lines.push('[' + el.elementId + '] ' + (el.role || el.tag.toLowerCase()) + ' "' + (el.text || el.ariaLabel || el.label || el.placeholder || el.id || '?') + '" visible=' + el.visible + ' enabled=' + el.enabled + ' selected=' + el.selected + (el.parentContext ? ' context="' + el.parentContext + '"' : ''));
    }
    if (ctx.visibleText) lines.push('VISIBLE TEXT: ' + ctx.visibleText);
    return lines.join('\n');
  }

  /* ===== CURSOR VISUAL ===== */

  function createAgentCursor() {
    if (agentCursor && document.documentElement.contains(agentCursor)) return agentCursor;
    if (!document.getElementById('browserking-cursor-styles')) {
      var style = document.createElement('style');
      style.id = 'browserking-cursor-styles';
      style.textContent =
        '#' + CURSOR_ID + '{position:fixed;left:-100px;top:-100px;width:20px;height:28px;pointer-events:none;z-index:2147483647;opacity:0;filter:drop-shadow(0 0 6px #39ff14) drop-shadow(0 0 12px rgba(57,255,20,.4));transition:left 350ms cubic-bezier(.22,.61,.36,1),top 350ms cubic-bezier(.22,.61,.36,1),opacity 120ms ease;will-change:left,top}' +
        '#' + CURSOR_ID + '.bk-visible{opacity:1}' +
        '#' + CURSOR_ID + '.bk-clicking svg{animation:bk-cursor-click 200ms ease-out}' +
        '@keyframes bk-cursor-click{0%{transform:scale(1)}30%{transform:scale(.7)}60%{transform:scale(1.15)}100%{transform:scale(1)}}' +
        '.' + RIPPLE_ID + '{position:fixed;width:12px;height:12px;border:2px solid #39ff14;border-radius:50%;pointer-events:none;z-index:2147483646;transform:translate(-50%,-50%) scale(.4);opacity:1;transition:all 350ms ease-out;box-shadow:0 0 10px rgba(57,255,20,.8),0 0 20px rgba(57,255,20,.3)}' +
        '.' + RIPPLE_ID + '.bk-expand{transform:translate(-50%,-50%) scale(3);opacity:0}';
      (document.head || document.documentElement).appendChild(style);
    }
    agentCursor = document.getElementById(CURSOR_ID);
    if (agentCursor) return agentCursor;
    agentCursor = document.createElement('div');
    agentCursor.id = CURSOR_ID;
    agentCursor.setAttribute('aria-hidden', 'true');
    agentCursor.innerHTML = '<svg width="20" height="28" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L0 22 L5.5 16 L9 26 L13 24.5 L9.5 15 L18 15 Z" fill="#39FF14" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
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

  /* ===== UTILITY ===== */

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  function waitForStableState(timeoutMs, quietMs) {
    timeoutMs = timeoutMs || 5000;
    quietMs = quietMs || 350;
    return new Promise(function(resolve) {
      var finished = false;
      var quietTimer = null;
      var observer = new MutationObserver(function() {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      });
      function done() { if (finished) return; finished = true; clearTimeout(quietTimer); observer.disconnect(); resolve(); }
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      quietTimer = setTimeout(done, quietMs);
      setTimeout(done, timeoutMs);
    });
  }

  function getElementCenter(el) {
    if (!el || el === document.body || el === document.documentElement) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function isElementVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function isElementAttached(el) {
    if (!el) return false;
    try { return el.isConnected || document.documentElement.contains(el); } catch (_) { return document.documentElement.contains(el); }
  }

  var INTERACTIVE_TAG = { BUTTON:1, A:1, INPUT:1, TEXTAREA:1, SELECT:1, SUMMARY:1, LABEL:1 };
  var INTERACTIVE_ROLE = { BUTTON:1, LINK:1, MENUITEM:1, TAB:1, CHECKBOX:1, RADIO:1, SWITCH:1, OPTION:1, COMBOBOX:1, TEXTBOX:1, SEARCHBOX:1, SLIDER:1 };

  function isInteractive(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (INTERACTIVE_TAG[el.tagName]) return true;
    if (el.tabIndex >= 0 && el.tagName !== 'DIV' && el.tagName !== 'SPAN') return true;
    var role = (el.getAttribute('role') || '').toLowerCase();
    if (INTERACTIVE_ROLE[role]) return true;
    if (el.onclick || el.onmousedown || el.getAttribute('onclick')) return true;
    return false;
  }

  function findNearestInteractive(el) {
    if (!el) return null;
    if (isInteractive(el)) return el;
    var current = el;
    for (var i = 0; i < 8; i++) {
      current = current.parentElement;
      if (!current || current === document.body || current === document.documentElement) break;
      if (isInteractive(current)) return current;
    }
    var parent = el.parentElement;
    if (parent) {
      var siblings = parent.children;
      for (var j = 0; j < siblings.length; j++) {
        if (siblings[j] !== el && isInteractive(siblings[j])) return siblings[j];
      }
    }
    return el;
  }

  function isLikelyOverlay(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if ((style.position === 'fixed' || style.position === 'absolute') && parseInt(style.zIndex) > 1000) return true;
    if (el.id && el.id.indexOf('overlay') !== -1) return true;
    if (el.className && typeof el.className === 'string' && (el.className.indexOf('overlay') !== -1 || el.className.indexOf('modal') !== -1 || el.className.indexOf('popup') !== -1 || el.className.indexOf('backdrop') !== -1)) return true;
    return false;
  }

  /* ===== ELEMENT FINDER ===== */

  function resolveRef(ref) {
    if (!ref) return null;
    try {
      var map = window.__claudeElementMap;
      if (map) {
        var entry = map[ref];
        if (entry && typeof entry.deref === 'function') {
          var el = entry.deref();
          if (el && isElementAttached(el)) return el;
        }
      }
    } catch (_) {}
    try {
      return document.querySelector('[data-ref="' + ref + '"]') || document.getElementById(ref) || document.querySelector('[aria-label="' + CSS.escape(ref) + '"]');
    } catch (_) { return null; }
  }

  function findElement(action) {
    if (!action) return null;
    var found = null;

    if (action.ref) {
      found = resolveRef(action.ref);
      if (found) { rememberElement(found, 'ref:' + action.ref); console.log('[BK] ref "' + action.ref + '" ->', getElementDescription(found)); return found; }
      console.log('[BK] ref "' + action.ref + '" NOT found');
    }

    if (action.selector) {
      try {
        found = document.querySelector(action.selector);
        if (found) { rememberElement(found, 'selector:' + action.selector); console.log('[BK] selector ->', getElementDescription(found)); return found; }
      } catch (_) {}
    }

    if (action.text) {
      // Digitação deve sempre mirar um campo editável; nunca use cabeçalhos
      // ou outros elementos apenas porque estão visíveis na página.
      if (/^(type|input)$/i.test(String(action.type || ''))) {
        var editables = Array.from(document.querySelectorAll('textarea, input:not([type="hidden"]), [contenteditable="true"], [role="textbox"]'))
          .filter(isElementVisible)
          .filter(function (el) { return !el.disabled && !el.readOnly; });
        var activeEditable = document.activeElement && editables.indexOf(document.activeElement) >= 0 ? document.activeElement : null;
        var exactEditable = editables.find(function (el) {
          var haystack = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.innerText || '')).toLowerCase();
          return haystack.indexOf(action.text.trim().toLowerCase()) >= 0;
        });
        var preferredEditable = exactEditable || activeEditable || editables.find(function (el) { return el.getAttribute('role') === 'textbox' || el.isContentEditable; }) || editables[0];
        if (preferredEditable) {
          rememberElement(preferredEditable, 'editable:' + action.text);
          console.log('[BK] type target ->', getElementDescription(preferredEditable));
          return preferredEditable;
        }
      }
      var searchSel = 'button, a, input, textarea, select, [role="button"], [tabindex], [role="tab"], [role="menuitem"], [role="link"], label, [role="checkbox"], [role="radio"], [role="switch"]';
      var candidates = Array.from(document.querySelectorAll(searchSel));
      var needle = action.text.trim().toLowerCase();
      var bestMatch = null;
      var bestScore = 0;
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        var score = 0;
        var cText = (c.innerText || '').trim().toLowerCase();
        var cLabel = (c.getAttribute('aria-label') || '').toLowerCase();
        var cPlaceholder = (c.getAttribute('placeholder') || '').toLowerCase();
        if (cText === needle) score += 100;
        else if (cText.indexOf(needle) !== -1) score += 50;
        if (cLabel.indexOf(needle) !== -1) score += 40;
        if (cPlaceholder.indexOf(needle) !== -1) score += 35;
        if (isElementVisible(c)) score += 10;
        if (isInteractive(c)) score += 5;
        if (isLikelyOverlay(c)) score -= 20;
        if (score > bestScore) { bestScore = score; bestMatch = c; }
      }
      if (bestMatch && bestScore > 0) {
        rememberElement(bestMatch, 'text:' + action.text);
        console.log('[BK] text "' + action.text + '" (score=' + bestScore + ') ->', getElementDescription(bestMatch));
        return bestMatch;
      }
    }

    if (action.coordinate && action.coordinate.length >= 2) {
      var cx = action.coordinate[0];
      var cy = action.coordinate[1];
      var pt = document.elementFromPoint(cx, cy);
      if (pt) {
        console.log('[BK] point(' + cx + ',' + cy + ') ->', getElementDescription(pt));
        if (isLikelyOverlay(pt)) {
          var origDisplay = pt.style.display;
          pt.style.display = 'none';
          var behind = document.elementFromPoint(cx, cy);
          pt.style.display = origDisplay;
          if (behind && !isLikelyOverlay(behind)) { pt = behind; console.log('[BK] bypassed overlay ->', getElementDescription(pt)); }
        }
        found = findNearestInteractive(pt);
        rememberElement(found, 'coord:' + cx + ',' + cy);
        console.log('[BK] nearest interactive ->', getElementDescription(found));
        return found;
      }
    }

    if (action.text || action.description) {
      var desc = action.text || action.description;
      var mem = findMemoryByDescription(desc);
      if (mem && mem.rect) {
        var el = document.elementFromPoint(mem.rect.left + mem.rect.width / 2, mem.rect.top + mem.rect.height / 2);
        if (el) { found = findNearestInteractive(el); console.log('[BK] memory fallback ->', getElementDescription(found)); return found; }
      }
    }

    console.log('[BK] NO element found for', JSON.stringify(action));
    return null;
  }

  /* ===== CURSOR MOVEMENT ===== */

  async function moveCursorToElement(element) {
    if (!element) throw new Error('Elemento nao encontrado');
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    await sleep(400);
    var center = getElementCenter(element);
    showCursor(center.x, center.y, false);
    await sleep(200);
  }

  /* ===== DOM EVENT SIMULATION ===== */

  function makeMouseEvent(type, el, opts) {
    opts = opts || {};
    var rect = el.getBoundingClientRect();
    var x = opts.x != null ? opts.x : rect.left + rect.width / 2;
    var y = opts.y != null ? opts.y : rect.top + rect.height / 2;
    return new MouseEvent(type, { bubbles: opts.bubbles !== false, cancelable: true, view: window, clientX: x, clientY: y, screenX: x + window.screenX, screenY: y + window.screenY, button: opts.button || 0, buttons: opts.buttons || 0, detail: opts.detail || 1 });
  }

  function makePointerEvent(type, el, opts) {
    opts = opts || {};
    var rect = el.getBoundingClientRect();
    var x = opts.x != null ? opts.x : rect.left + rect.width / 2;
    var y = opts.y != null ? opts.y : rect.top + rect.height / 2;
    return new PointerEvent(type, { bubbles: opts.bubbles !== false, cancelable: true, view: window, clientX: x, clientY: y, screenX: x + window.screenX, screenY: y + window.screenY, button: opts.button || 0, buttons: opts.buttons || 0, pointerId: 1, pointerType: 'mouse' });
  }

  function simulateFullClick(element, opts) {
    opts = opts || {};
    var rect = element.getBoundingClientRect();
    var x = opts.x != null ? opts.x : rect.left + rect.width / 2;
    var y = opts.y != null ? opts.y : rect.top + rect.height / 2;
    var c = { x: x, y: y, detail: opts.double ? 2 : 1 };
    element.dispatchEvent(makePointerEvent('pointerover', element, c));
    element.dispatchEvent(makeMouseEvent('mouseover', element, c));
    element.dispatchEvent(makePointerEvent('pointerenter', element, { x: x, y: y, bubbles: false }));
    element.dispatchEvent(makeMouseEvent('mouseenter', element, { x: x, y: y, bubbles: false }));
    element.dispatchEvent(makePointerEvent('pointermove', element, c));
    element.dispatchEvent(makeMouseEvent('mousemove', element, c));
    element.dispatchEvent(makePointerEvent('pointerdown', element, { x: x, y: y, buttons: 1 }));
    element.dispatchEvent(makeMouseEvent('mousedown', element, { x: x, y: y, buttons: 1 }));
    try { element.focus(); } catch(_) {}
    element.dispatchEvent(makePointerEvent('pointerup', element, c));
    element.dispatchEvent(makeMouseEvent('mouseup', element, c));
    element.dispatchEvent(makeMouseEvent('click', element, c));
  }

  /* ===== ACTION EXECUTORS ===== */

  async function agentClick(element, opts) {
    opts = opts || {};
    if (!element) throw new Error('Elemento nao encontrado para clique');
    if (!isElementAttached(element)) throw new Error('Elemento stale (fora do DOM)');
    if (!isElementVisible(element)) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      await sleep(500);
    }
    var center = getElementCenter(element);
    showCursor(center.x, center.y, false);
    await sleep(250);
    simulateFullClick(element, { double: opts.double });
    showCursor(center.x, center.y, true);
    await sleep(300);
  }

  async function agentType(element, text) {
    if (!element) throw new Error('Elemento nao encontrado para digitacao');
    if (!isElementAttached(element)) throw new Error('Elemento stale');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);
    var center = getElementCenter(element);
    showCursor(center.x, center.y, false);
    await sleep(200);
    simulateFullClick(element);
    await sleep(150);
    try { element.focus(); } catch(_) {}
    await sleep(100);
    var isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
    var prop = isInput ? 'value' : 'textContent';
    element[prop] = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      element.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));
      element[prop] += ch;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
      await sleep(25 + Math.random() * 35);
    }
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function agentFocus(element) {
    if (!element) throw new Error('Elemento nao encontrado para foco');
    await moveCursorToElement(element);
    try { element.focus(); } catch(_) {}
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
    window.scrollBy({ top: direction === 'up' ? -px : px, behavior: 'smooth' });
    await sleep(400);
  }

  async function agentHover(element) {
    if (!element) throw new Error('Elemento nao encontrado para hover');
    var center = getElementCenter(element);
    showCursor(center.x, center.y, false);
    await sleep(150);
    element.dispatchEvent(makePointerEvent('pointerover', element));
    element.dispatchEvent(makeMouseEvent('mouseover', element));
    element.dispatchEvent(makeMouseEvent('mouseenter', element, { bubbles: false }));
  }

  /* ===== MAIN DISPATCHER ===== */

  async function executeAction(action) {
    if (!action || !action.type) throw new Error('Acao invalida');
    var actionType = String(action.type).toLowerCase();
    console.log('[BK] executeAction:', actionType, JSON.stringify(action));

    if (actionType === 'scroll') { await agentScroll(action.direction, action.amount); return; }

    var element = findElement(action);
    if (!element) { await sleep(500); element = findElement(action); }
    if (!element) throw new Error('Elemento nao encontrado para: ' + actionType);
    if (!isElementAttached(element)) throw new Error('Elemento desconectado do DOM');
    console.log('[BK] target:', getElementDescription(element));

    switch (actionType) {
      case 'click': case 'left_click': await agentClick(element); break;
      case 'double_click': await agentClick(element, { double: true }); break;
      case 'right_click': await agentClick(element); break;
      case 'type': case 'input': await agentType(element, action.text || action.value || ''); break;
      case 'focus': await agentFocus(element); break;
      case 'select': await agentSelect(element, action.value || ''); break;
      case 'hover': case 'mouseover': await agentHover(element); break;
      default: throw new Error('Acao nao suportada: ' + actionType);
    }
  }

  /* ===== VERIFICATION ===== */

  function hashState(value) {
    var hash = 2166136261;
    value = String(value || '');
    for (var i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }

  function capturePageState() {
    var visibleText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
    var forms = Array.from(document.querySelectorAll('input,textarea,select')).slice(0, 100).map(function(el) { return [el.id || el.name || el.type, el.value, el.checked, el.disabled].join(':'); }).join('|');
    var modalCount = document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]').length;
    var successText = Array.from(document.querySelectorAll('[role="alert"], [aria-live], .toast, .notification, .success, .error')).slice(0, 20).map(function(el) { return (el.innerText || '').trim(); }).filter(Boolean).join(' | ').slice(0, 1200);
    return { url: window.location.href, title: document.title, bodyLength: document.body ? document.body.innerHTML.length : 0, elementCount: document.querySelectorAll('*').length, scrollY: window.scrollY, textHash: hashState(visibleText), formHash: hashState(forms), modalCount: modalCount, successText: successText, fingerprint: hashState([window.location.href, visibleText, forms, modalCount].join('|')), ts: Date.now() };
  }

  function verifyAction(prev, curr) {
    if (!prev || !curr) return { ok: false, evidence: 'no state' };
    var urlChanged = prev.url !== curr.url;
    var titleChanged = prev.title !== curr.title;
    var domChanged = Math.abs(prev.bodyLength - curr.bodyLength) > 50;
    var elementChanged = Math.abs(prev.elementCount - curr.elementCount) > 5;
    var scrolled = Math.abs(prev.scrollY - curr.scrollY) > 50;
    var textChanged = prev.textHash !== curr.textHash;
    var formChanged = prev.formHash !== curr.formHash;
    var modalChanged = prev.modalCount !== curr.modalCount;
    var feedbackChanged = prev.successText !== curr.successText && Boolean(curr.successText);
    var classification = urlChanged || titleChanged || formChanged || feedbackChanged ? 'SUCCESS' : (domChanged || elementChanged || textChanged || modalChanged || scrolled ? 'PARTIAL_SUCCESS' : 'NO_EFFECT');
    return {
      ok: classification !== 'NO_EFFECT',
      classification: classification,
      urlChanged: urlChanged, titleChanged: titleChanged, domChanged: domChanged,
      elementChanged: elementChanged, textChanged: textChanged, formChanged: formChanged,
      modalChanged: modalChanged, feedbackChanged: feedbackChanged, scrolled: scrolled,
      evidence: urlChanged ? 'navigation' : (formChanged ? 'form_state' : (feedbackChanged ? 'page_feedback' : (textChanged ? 'visible_text_diff' : (modalChanged ? 'modal_state' : (scrolled ? 'scroll' : 'no_change')))))
    };
  }

  async function recordLocalActionMetric(result) {
    try {
      var stored = await chrome.storage.local.get('hatclawAgentTaskMetrics');
      var metrics = stored.hatclawAgentTaskMetrics || { totalSteps: 0, modelCalls: 0, localActions: 0, taskSuccess: false, loopsDetected: 0 };
      metrics.totalSteps += 1;
      metrics.localActions += 1;
      metrics.taskSuccess = Boolean(result.success);
      if (result.verification?.classification === 'LOOP_DETECTED') metrics.loopsDetected += 1;
      metrics.updatedAt = Date.now();
      await chrome.storage.local.set({ hatclawAgentTaskMetrics: metrics });
    } catch (_) {}
  }

  /* ===== ORCHESTRATOR ===== */

  async function handleAgentAction(action) {
    if (!action || !action.ts) return;
    if (action.ts <= lastActionTs) return;
    if (isExecuting) { await sleep(200); if (isExecuting) return; }
    lastActionTs = action.ts;
    isExecuting = true;
    var prevState = capturePageState();
    var startTime = Date.now();
    try {
      console.log('[HatClaw] === ACTION START ===', action.type, JSON.stringify(action));
      await executeAction(action);
      await waitForStableState(5000, 350);
      var currState = capturePageState();
      var verification = verifyAction(prevState, currState);
      var stateKey = [action.type, currState.url, currState.title, currState.bodyLength, currState.elementCount, Math.round(currState.scrollY / 50)].join('|');
      recentActionStates.push(stateKey);
      recentActionStates = recentActionStates.slice(-6);
      var repeats = recentActionStates.filter(function(key) { return key === stateKey; }).length;
      if (!verification.ok && repeats >= 3) {
        verification.classification = 'LOOP_DETECTED';
        verification.evidence = 'same_action_same_state_no_progress';
      }
      var successResult = { success: verification.ok, action: action.type, requestTs: action.ts, verification: verification, duration: Date.now() - startTime, memorySize: Object.keys(elementMemory).length, ts: Date.now() };
      await chrome.storage.local.set({ hatclawActionResult: successResult });
      await recordLocalActionMetric(successResult);
      console.log('[HatClaw] === ACTION OK ===', action.type, verification);
    } catch (error) {
      console.error('[HatClaw] === ACTION FAILED ===', action.type, error.message);
      var failureResult = { success: false, action: action.type, requestTs: action.ts, error: error.message, duration: Date.now() - startTime, ts: Date.now() };
      await chrome.storage.local.set({ hatclawActionResult: failureResult });
      await recordLocalActionMetric(failureResult);
    } finally {
      isExecuting = false;
    }
  }

  function handleCursorCommand(cmd) {
    if (!cmd || (cmd.ts && cmd.ts <= lastActionTs)) return;
    if (cmd.type === 'MOVE_CURSOR') { showCursor(cmd.x, cmd.y, !!cmd.clicked); }
    else if (cmd.type === 'MOVE_CURSOR_TO_ELEMENT') {
      var el = findElement(cmd);
      if (el) { var center = getElementCenter(el); showCursor(center.x, center.y, !!cmd.clicked); }
    }
  }

  /* ===== STORAGE + MESSAGE LISTENERS ===== */

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function(changes, areaName) {
      if (areaName !== 'local') return;
      if (document.visibilityState !== 'visible') {
        hideCursor();
        return;
      }
      if (changes.hatclawAgentAction) { var a = changes.hatclawAgentAction.newValue; if (a && a.ts && belongsToThisTab(a)) handleAgentAction(a); else if (a && !belongsToThisTab(a)) hideCursor(); }
      if (changes.hatclawCursorCommand) { var cursorCommand = changes.hatclawCursorCommand.newValue; if (belongsToThisTab(cursorCommand)) handleCursorCommand(cursorCommand); else hideCursor(); }
    });
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState !== 'visible') hideCursor();
  });

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message.type === 'AGENT_ACTION' && message.action) {
        handleAgentAction(Object.assign({ ts: Date.now() }, message.action));
        sendResponse({ received: true });
        return false;
      }
      if (message.type === 'GET_PAGE_CONTEXT') {
        var context = getPageContextSummary(message.goal || message.task || '');
        sendResponse({ context: context, fingerprint: capturePageState().fingerprint, memorySize: Object.keys(elementMemory).length });
        return false;
      }
      if (message.type === 'MOVE_CURSOR') { showCursor(message.x, message.y, !!message.clicked); }
      if (message.type === 'HIDE_GLOW_FOR_SCREENSHOT') {
        cursorWasVisibleBeforeScreenshot = Boolean(agentCursor && agentCursor.classList.contains('bk-visible'));
        hideCursor();
      }
      if (message.type === 'RESTORE_GLOW_AFTER_SCREENSHOT' && cursorWasVisibleBeforeScreenshot && agentCursor) {
        agentCursor.classList.add('bk-visible');
        cursorWasVisibleBeforeScreenshot = false;
      }
      if (message.type === 'MOVE_CURSOR_TO_ELEMENT') {
        var el = findElement(message);
        if (el) { var center = getElementCenter(el); showCursor(center.x, center.y, !!message.clicked); }
      }
      return false;
    });
  }

  /* ===== DOM MUTATION TRACKER ===== */

  try {
    new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType === 1) {
            if (isInteractive(node)) rememberElement(node, 'mutation');
            if (node.querySelectorAll) {
              var children = node.querySelectorAll('button, a, input, textarea, select, [role="button"], [tabindex]');
              for (var k = 0; k < Math.min(children.length, 10); k++) rememberElement(children[k], 'mutation-child');
            }
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  console.log('[HatClaw] content-script.js v3 loaded - DOM-first with element memory');

})();
