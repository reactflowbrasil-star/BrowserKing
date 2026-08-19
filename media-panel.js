(function() {
  'use strict';

  const MEDIA_STORAGE_KEY = 'hatclawGeneratedMedia';
  const MAX_MEDIA_ITEMS = 50;

  let panelExpanded = false;
  let dragState = null;
  let floatingIcon = null;
  let mediaPanel = null;

  function getStoredMedia() {
    try {
      const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function storeMedia(item) {
    const list = getStoredMedia();
    list.unshift({ ...item, timestamp: Date.now() });
    if (list.length > MAX_MEDIA_ITEMS) list.length = MAX_MEDIA_ITEMS;
    localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(list));
  }

  function createStyles() {
    if (document.getElementById('hatclaw-media-styles')) return;
    const s = document.createElement('style');
    s.id = 'hatclaw-media-styles';
    s.textContent = `
      #hatclaw-media-icon {
        position: fixed;
        bottom: 80px;
        right: 18px;
        z-index: 2147483647;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        border: 2px solid rgba(57, 255, 20, 0.5);
        box-shadow: 0 0 12px rgba(57, 255, 20, 0.25), 0 4px 16px rgba(0,0,0,0.4);
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: box-shadow 0.3s, border-color 0.3s, transform 0.15s;
        user-select: none;
        -webkit-user-select: none;
      }
      #hatclaw-media-icon:hover {
        border-color: rgba(57, 255, 20, 0.9);
        box-shadow: 0 0 20px rgba(57, 255, 20, 0.4), 0 4px 20px rgba(0,0,0,0.5);
        transform: scale(1.08);
      }
      #hatclaw-media-icon:active { cursor: grabbing; }
      #hatclaw-media-icon svg { width: 22px; height: 22px; fill: #39ff14; pointer-events: none; }
      #hatclaw-media-icon .badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #ff3b3b;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        min-width: 16px;
        height: 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s;
      }
      #hatclaw-media-icon .badge.show { opacity: 1; }

      #hatclaw-media-panel {
        position: fixed;
        top: 0;
        right: 0;
        width: 0;
        height: 100vh;
        background: #0d1117;
        border-left: 1px solid rgba(57, 255, 20, 0.15);
        z-index: 2147483646;
        overflow: hidden;
        transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #hatclaw-media-panel.open { width: 340px; }
      #hatclaw-media-panel .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(57, 255, 20, 0.12);
        flex-shrink: 0;
      }
      #hatclaw-media-panel .panel-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #e6e6e6;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #hatclaw-media-panel .panel-header h3 svg { width: 16px; height: 16px; fill: #39ff14; }
      #hatclaw-media-panel .close-btn {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        transition: color 0.2s, background 0.2s;
      }
      #hatclaw-media-panel .close-btn:hover { color: #ff6b6b; background: rgba(255,107,107,0.1); }
      #hatclaw-media-panel .close-btn svg { width: 18px; height: 18px; }

      #hatclaw-media-panel .media-list {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #hatclaw-media-panel .media-list::-webkit-scrollbar { width: 5px; }
      #hatclaw-media-panel .media-list::-webkit-scrollbar-track { background: transparent; }
      #hatclaw-media-panel .media-list::-webkit-scrollbar-thumb { background: rgba(57,255,20,0.2); border-radius: 3px; }

      #hatclaw-media-panel .media-item {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(57,255,20,0.08);
        border-radius: 8px;
        overflow: hidden;
        transition: border-color 0.2s;
      }
      #hatclaw-media-panel .media-item:hover { border-color: rgba(57,255,20,0.25); }
      #hatclaw-media-item .media-item img,
      #hatclaw-media-item .media-item video {
        width: 100%;
        display: block;
        border-radius: 0;
      }
      #hatclaw-media-panel .media-meta {
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      #hatclaw-media-panel .media-meta .type-badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #39ff14;
      }
      #hatclaw-media-panel .media-meta .prompt-text {
        font-size: 12px;
        color: #999;
        line-height: 1.4;
        word-break: break-word;
      }
      #hatclaw-media-panel .media-meta .timestamp {
        font-size: 10px;
        color: #555;
      }

      #hatclaw-media-panel .empty-state {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #555;
        gap: 10px;
        padding: 40px 20px;
        text-align: center;
      }
      #hatclaw-media-panel .empty-state svg { width: 40px; height: 40px; fill: #333; }
      #hatclaw-media-panel .empty-state p { margin: 0; font-size: 13px; line-height: 1.5; }

      #hatclaw-media-panel .media-actions {
        display: flex;
        gap: 6px;
        padding: 6px 10px 0;
      }
      #hatclaw-media-panel .media-actions button {
        flex: 1;
        background: rgba(57,255,20,0.08);
        border: 1px solid rgba(57,255,20,0.15);
        color: #39ff14;
        font-size: 11px;
        font-weight: 500;
        padding: 5px 8px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.2s;
      }
      #hatclaw-media-panel .media-actions button:hover { background: rgba(57,255,20,0.15); }
    `;
    document.head.appendChild(s);
  }

  function createFloatingIcon() {
    if (document.getElementById('hatclaw-media-icon')) return;
    floatingIcon = document.createElement('div');
    floatingIcon.id = 'hatclaw-media-icon';
    floatingIcon.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
      <span class="badge" id="hatclaw-media-badge">0</span>
    `;
    document.body.appendChild(floatingIcon);

    floatingIcon.addEventListener('click', (e) => {
      if (dragState?.moved) return;
      togglePanel();
    });

    initDrag(floatingIcon);
    updateBadge();
  }

  function createMediaPanel() {
    if (document.getElementById('hatclaw-media-panel')) return;
    mediaPanel = document.createElement('div');
    mediaPanel.id = 'hatclaw-media-panel';
    mediaPanel.innerHTML = `
      <div class="panel-header">
        <h3>
          <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
          Mídia Gerada
        </h3>
        <button class="close-btn" id="hatclaw-media-close">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="media-list" id="hatclaw-media-list"></div>
    `;
    document.body.appendChild(mediaPanel);

    document.getElementById('hatclaw-media-close').addEventListener('click', () => togglePanel(false));
    renderMediaList();
  }

  function togglePanel(force) {
    panelExpanded = force !== undefined ? force : !panelExpanded;
    if (panelExpanded) {
      createMediaPanel();
      requestAnimationFrame(() => mediaPanel.classList.add('open'));
    } else if (mediaPanel) {
      mediaPanel.classList.remove('open');
    }
  }

  function renderMediaList() {
    const list = document.getElementById('hatclaw-media-list');
    if (!list) return;
    const items = getStoredMedia();
    if (!items.length) {
      list.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
          <p>Nenhuma mídia gerada ainda.<br>Peda ao agente para gerar uma imagem ou vídeo.</p>
        </div>`;
      return;
    }
    list.innerHTML = items.map((item, i) => {
      const time = new Date(item.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const isVideo = item.type === 'video';
      const media = isVideo
        ? `<video src="${escapeAttr(item.url)}" controls preload="metadata"></video>`
        : `<img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.prompt || '')}" loading="lazy">`;
      return `
        <div class="media-item" data-index="${i}">
          ${media}
          <div class="media-meta">
            <span class="type-badge">${isVideo ? 'Video' : 'Imagem'}</span>
            <span class="prompt-text">${escapeHtml(item.prompt || '')}</span>
            <span class="timestamp">${time}</span>
          </div>
          <div class="media-actions">
            <button onclick="hatclawMediaPanel.openMedia(${i})">Abrir</button>
            <button onclick="hatclawMediaPanel.downloadMedia(${i})">Baixar</button>
            <button onclick="hatclawMediaPanel.removeMedia(${i})">Remover</button>
          </div>
        </div>`;
    }).join('');
  }

  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  function updateBadge() {
    const badge = document.getElementById('hatclaw-media-badge');
    if (!badge) return;
    const count = getStoredMedia().length;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('show', count > 0);
  }

  function initDrag(el) {
    let startX, startY, startRight, startBottom;
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
      const newRight = Math.max(0, Math.min(window.innerWidth - 44, startRight - dx));
      const newBottom = Math.max(0, Math.min(window.innerHeight - 44, startBottom - dy));
      el.style.right = newRight + 'px';
      el.style.bottom = newBottom + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      setTimeout(() => { dragState.moved = false; }, 50);
    };
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startRight = parseInt(getComputedStyle(el).right) || 18;
      startBottom = parseInt(getComputedStyle(el).bottom) || 80;
      dragState = { moved: false };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startRight = parseInt(getComputedStyle(el).right) || 18;
      startBottom = parseInt(getComputedStyle(el).bottom) || 80;
      dragState = { moved: false };
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }, { passive: false });
  }

  function onNewMedia(item) {
    storeMedia(item);
    updateBadge();
    if (panelExpanded) renderMediaList();
  }

  globalThis.hatclawMediaPanel = {
    open: () => togglePanel(true),
    close: () => togglePanel(false),
    toggle: () => togglePanel(),
    addMedia: onNewMedia,
    openMedia(i) {
      const items = getStoredMedia();
      if (items[i]) window.open(items[i].url, '_blank');
    },
    downloadMedia(i) {
      const items = getStoredMedia();
      const item = items[i];
      if (!item) return;
      const a = document.createElement('a');
      a.href = item.url;
      a.download = `hatclaw-${item.type || 'media'}-${Date.now()}`;
      a.click();
    },
    removeMedia(i) {
      const items = getStoredMedia();
      items.splice(i, 1);
      localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(items));
      updateBadge();
      renderMediaList();
    },
    getAll: getStoredMedia
  };

  function init() {
    createStyles();
    createFloatingIcon();
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.hatclawNewMedia) {
        const val = changes.hatclawNewMedia.newValue;
        if (val) onNewMedia(val);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
