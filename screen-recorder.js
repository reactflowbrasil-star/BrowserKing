/**
 * Screen Recorder
 *
 * Injects a video recording button into the HatClaw sidepanel header.
 * Records screen, tab, or window and exports as MP4.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'hatclaw.screenRecorder.v1';

  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let currentStream = null;
  let recordingStartTime = 0;
  let timerInterval = null;
  let recordBtn = null;
  let dropdown = null;
  let timerEl = null;

  const RECORD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`;

  const STOP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/></svg>`;

  const SCREEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;

  const TAB_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;

  const WINDOW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>`;

  function getSupportedMimeType() {
    const types = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  function getExtensionForMime(mime) {
    if (mime.includes('mp4')) return 'mp4';
    return 'webm';
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    if (h > 0) return `${h}:${mm}:${ss}`;
    return `${mm}:${ss}`;
  }

  function createStyles() {
    if (document.getElementById('hc-recorder-styles')) return;
    const style = document.createElement('style');
    style.id = 'hc-recorder-styles';
    style.textContent = `
      #hc-record-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: hsl(var(--text-200, 0 0% 60%));
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.15s, background 0.15s, color 0.15s;
        flex-shrink: 0;
        position: relative;
      }
      #hc-record-btn:hover {
        opacity: 1;
        background: hsl(var(--bg-200, 0 0% 15%));
      }
      #hc-record-btn.hc-recording {
        color: #EF4444;
        opacity: 1;
        animation: hc-rec-pulse 1.5s ease-in-out infinite;
      }
      @keyframes hc-rec-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      #hc-record-timer {
        font-size: 10px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #EF4444;
        margin-left: 4px;
        display: none;
        white-space: nowrap;
        letter-spacing: 0.02em;
      }
      #hc-record-timer.visible {
        display: inline;
      }
      #hc-record-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 6px;
        background: hsl(var(--bg-000, 0 0% 7%));
        border: 1px solid hsl(var(--border-200, 0 0% 20%) / 0.5);
        border-radius: 12px;
        padding: 6px;
        min-width: 180px;
        z-index: 99999;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(12px);
        display: none;
        pointer-events: auto;
      }
      #hc-record-dropdown.open {
        display: block;
      }
      .hc-rec-option {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 9px 12px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: hsl(var(--text-100, 0 0% 90%));
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.12s;
        text-align: left;
      }
      .hc-rec-option:hover {
        background: hsl(var(--bg-100, 0 0% 12%));
      }
      .hc-rec-option svg {
        flex-shrink: 0;
        opacity: 0.7;
      }
      .hc-rec-divider {
        height: 1px;
        background: hsl(var(--border-200, 0 0% 20%) / 0.3);
        margin: 4px 8px;
      }
      .hc-rec-stop-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 9px 12px;
        border: none;
        border-radius: 8px;
        background: rgba(239, 68, 68, 0.12);
        color: #EF4444;
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.12s;
        text-align: left;
      }
      .hc-rec-stop-btn:hover {
        background: rgba(239, 68, 68, 0.22);
      }
    `;
    document.head.appendChild(style);
  }

  function findInjectionTarget() {
    // Look for the header toolbar area - the top bar with icons
    // The sidepanel header typically has a flex row with icons
    const header = document.querySelector('[class*="header"], [class*="Header"], [class*="toolbar"], [class*="Toolbar"]');
    if (header) return header;

    // Fallback: look for a flex container near the top that has SVG buttons
    const candidates = document.querySelectorAll('div, nav, header');
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.top < 60 && rect.height < 80 && rect.height > 30) {
        const hasSvg = el.querySelector('svg');
        const isFlex = getComputedStyle(el).display === 'flex';
        if (hasSvg && isFlex) return el;
      }
    }
    return null;
  }

  function createRecordButton() {
    const wrapper = document.createElement('div');
    wrapper.id = 'hc-record-wrapper';
    wrapper.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;position:relative;';

    recordBtn = document.createElement('button');
    recordBtn.id = 'hc-record-btn';
    recordBtn.type = 'button';
    recordBtn.title = 'Record screen';
    recordBtn.innerHTML = RECORD_ICON;

    timerEl = document.createElement('span');
    timerEl.id = 'hc-record-timer';

    dropdown = document.createElement('div');
    dropdown.id = 'hc-record-dropdown';

    wrapper.appendChild(recordBtn);
    wrapper.appendChild(timerEl);
    wrapper.appendChild(dropdown);

    recordBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isRecording) {
        stopRecording();
      } else {
        toggleDropdown();
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        closeDropdown();
      }
    });

    return wrapper;
  }

  function renderDropdown() {
    if (!dropdown) return;
    if (isRecording) {
      dropdown.innerHTML = `
        <button class="hc-rec-stop-btn" data-action="stop">
          ${STOP_ICON}
          <span>Stop recording</span>
        </button>
      `;
      dropdown.querySelector('[data-action="stop"]').addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        stopRecording();
      });
    } else {
      dropdown.innerHTML = `
        <button class="hc-rec-option" data-mode="screen">
          ${SCREEN_ICON}
          <span>Record entire screen</span>
        </button>
        <button class="hc-rec-option" data-mode="window">
          ${WINDOW_ICON}
          <span>Record window</span>
        </button>
        <button class="hc-rec-option" data-mode="tab">
          ${TAB_ICON}
          <span>Record tab</span>
        </button>
      `;
      dropdown.querySelectorAll('.hc-rec-option').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const mode = btn.getAttribute('data-mode');
          closeDropdown();
          startRecording(mode);
        });
      });
    }
  }

  function toggleDropdown() {
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    if (isOpen) {
      closeDropdown();
    } else {
      renderDropdown();
      dropdown.classList.add('open');
    }
  }

  function closeDropdown() {
    if (dropdown) dropdown.classList.remove('open');
  }

  function updateRecordingUI(recording) {
    isRecording = recording;
    if (recordBtn) {
      recordBtn.classList.toggle('hc-recording', recording);
      recordBtn.innerHTML = recording ? STOP_ICON : RECORD_ICON;
      recordBtn.title = recording ? 'Stop recording' : 'Record screen';
    }
    if (timerEl) {
      timerEl.classList.toggle('visible', recording);
      if (!recording) timerEl.textContent = '';
    }
  }

  function startTimer() {
    recordingStartTime = Date.now();
    timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
      if (timerEl) timerEl.textContent = formatTime(Date.now() - recordingStartTime);
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  async function startRecording(mode) {
    try {
      const displayMediaOptions = {
        video: {
          cursor: 'always',
        },
        audio: false,
      };

      if (mode === 'tab') {
        displayMediaOptions.video.displaySurface = 'browser';
        displayMediaOptions.video.logicalSurface = true;
        displayMediaOptions.video.cursor = 'never';
        displayMediaOptions.selfBrowserSurface = 'include';
      } else if (mode === 'window') {
        displayMediaOptions.video.displaySurface = 'window';
      } else {
        displayMediaOptions.video.displaySurface = 'monitor';
      }

      currentStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      recordedChunks = [];
      const mimeType = getSupportedMimeType();
      const recorderOptions = { mimeType };
      if (mimeType.includes('mp4')) {
        recorderOptions.videoBitsPerSecond = 5000000;
      }

      mediaRecorder = new MediaRecorder(currentStream, recorderOptions);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        saveRecording();
      };

      mediaRecorder.onerror = (event) => {
        console.warn('[HatClaw Recorder] MediaRecorder error:', event.error);
        cleanup();
      };

      currentStream.getVideoTracks()[0].addEventListener('ended', () => {
        if (isRecording) stopRecording();
      });

      mediaRecorder.start(1000);
      updateRecordingUI(true);
      startTimer();
      closeDropdown();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[HatClaw Recorder] Could not start recording:', err.message);
      }
      cleanup();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    stopTimer();
    updateRecordingUI(false);
  }

  function saveRecording() {
    if (recordedChunks.length === 0) {
      cleanup();
      return;
    }

    const mimeType = mediaRecorder ? mediaRecorder.mimeType : getSupportedMimeType();
    const ext = getExtensionForMime(mimeType);
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `hatclaw-recording-${timestamp}.${ext}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);

    cleanup();
  }

  function cleanup() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
    mediaRecorder = null;
    recordedChunks = [];
    stopTimer();
    updateRecordingUI(false);
  }

  function injectButton() {
    if (document.getElementById('hc-record-btn')) return;

    createStyles();

    const target = findInjectionTarget();
    if (!target) return false;

    const btn = createRecordButton();

    // Try to insert before the last icon button (before teach hatclaw icon)
    const buttons = target.querySelectorAll('button, [role="button"]');
    if (buttons.length > 0) {
      // Insert before the last button (typically the rightmost icon)
      const lastBtn = buttons[buttons.length - 1];
      if (lastBtn && !lastBtn.id?.includes('record')) {
        target.insertBefore(btn, lastBtn);
        return true;
      }
    }

    // Fallback: prepend to the target
    target.insertBefore(btn, target.firstChild);
    return true;
  }

  // Poll for the header to appear
  let attempts = 0;
  const interval = setInterval(() => {
    const injected = injectButton();
    attempts++;
    if (injected || attempts > 80) {
      clearInterval(interval);
    }
  }, 500);

  // Re-inject if UI re-renders
  const observer = new MutationObserver(() => {
    if (!document.getElementById('hc-record-btn')) {
      injectButton();
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

})();
