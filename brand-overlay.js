(function() {
  'use strict';

  const registry = globalThis.HatClawRegistry;
  const SYSTEM_BRAND_COLOR = '#C8FF3D';
  if (!registry || !globalThis.chrome?.storage?.local) {
    return;
  }

  function hexToRgba(hex, alpha) {
    const raw = hex.replace('#', '');
    const value = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
    const red = parseInt(value.slice(0, 2), 16);
    const green = parseInt(value.slice(2, 4), 16);
    const blue = parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function ensureOverlayStyle() {
    let style = document.getElementById('browserking-overlay-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'browserking-overlay-style';
      document.head.appendChild(style);
    }
    return style;
  }

  let lastColor = null;

  async function applyOverlay() {
    const state = await registry.loadState();
    const definition = registry.getActiveProviderDefinition(state);
    const color = definition.color || SYSTEM_BRAND_COLOR;
    const isDark = true; // Most browser agents use dark themes

    // Inject CSS overrides for the stop button hover — this avoids
    // cloning the button (which caused infinite mutation loops).
    const bgNormal = isDark ? '#FAF9F5' : `${color}22`;
    const bgHover = isDark ? '#F0EEE6' : `${color}33`;
    const shadow = `0 40px 80px ${hexToRgba(color, 0.24)}, 0 4px 14px ${hexToRgba(color, 0.24)}`;

    const greenColor = '#39ff14';
    const pulseKeyframes = `
      @keyframes claude-pulse {
        0% {
          box-shadow:
            inset 0 0 18px rgba(57, 255, 20, 0.45),
            inset 0 0 40px rgba(57, 255, 20, 0.22),
            inset 0 0 70px rgba(57, 255, 20, 0.08);
          outline: 2px solid rgba(57, 255, 20, 0.35);
        }
        50% {
          box-shadow:
            inset 0 0 28px rgba(57, 255, 20, 0.7),
            inset 0 0 55px rgba(57, 255, 20, 0.38),
            inset 0 0 95px rgba(57, 255, 20, 0.15);
          outline: 2px solid rgba(57, 255, 20, 0.55);
        }
        100% {
          box-shadow:
            inset 0 0 18px rgba(57, 255, 20, 0.45),
            inset 0 0 40px rgba(57, 255, 20, 0.22),
            inset 0 0 70px rgba(57, 255, 20, 0.08);
          outline: 2px solid rgba(57, 255, 20, 0.35);
        }
      }

      @keyframes browserking-neon-halo {
        0%, 100% {
          opacity: 0.4;
          filter: blur(14px);
          box-shadow:
            inset 0 0 25px rgba(57, 255, 20, 0.5),
            inset 0 0 55px rgba(57, 255, 20, 0.25),
            inset 0 0 100px rgba(57, 255, 20, 0.1);
        }
        50% {
          opacity: 0.75;
          filter: blur(20px);
          box-shadow:
            inset 0 0 35px rgba(57, 255, 20, 0.72),
            inset 0 0 75px rgba(57, 255, 20, 0.4),
            inset 0 0 130px rgba(57, 255, 20, 0.18);
        }
      }
    `;

    // Replace the stock animation styles directly when the element exists.
    // This is the most reliable approach since @keyframes ignores !important
    // and "last definition wins" means we must control the original element.
    const animationStyle = document.getElementById('claude-agent-animation-styles');
    if (animationStyle) {
      animationStyle.textContent = pulseKeyframes;
    }

    const overlayStyle = ensureOverlayStyle();
    // Move our style element to end of <head> so our rules come last
    document.head.appendChild(overlayStyle);
    overlayStyle.textContent = `
      .ProseMirror {
        white-space: pre-wrap;
      }

      #claude-agent-stop-button {
        background: ${bgNormal} !important;
        border-color: ${color}66 !important;
        box-shadow: ${shadow} !important;
      }
      #claude-agent-stop-button:hover {
        background: ${bgHover} !important;
        box-shadow: ${shadow} !important;
      }

      ${pulseKeyframes}

      #claude-agent-glow-border {
        border: 2px solid rgba(57, 255, 20, 0.5) !important;
        box-shadow:
          inset 0 0 18px rgba(57, 255, 20, 0.45),
          inset 0 0 40px rgba(57, 255, 20, 0.22),
          inset 0 0 70px rgba(57, 255, 20, 0.08),
          inset 0 0 120px rgba(57, 255, 20, 0.05) !important;
        outline: 2px solid rgba(57, 255, 20, 0.35) !important;
        outline-offset: -2px !important;
      }

      #claude-agent-glow-border::before,
      #claude-agent-glow-border::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        border: 3px solid rgba(57, 255, 20, 0.45);
        animation: browserking-neon-halo 3.5s ease-in-out infinite;
      }

      #claude-agent-glow-border::after {
        inset: 5px;
        border-width: 2px;
        opacity: 0.55;
        animation-delay: -1.75s;
      }
    `;

    // Also set inline style directly as fallback
    const border = document.getElementById('claude-agent-glow-border');
    if (border) {
      border.style.setProperty('box-shadow',
        `inset 0 0 18px rgba(57, 255, 20, 0.45), inset 0 0 40px rgba(57, 255, 20, 0.22), inset 0 0 70px rgba(57, 255, 20, 0.08), inset 0 0 120px rgba(57, 255, 20, 0.05)`,
        'important'
      );
      border.style.setProperty('border', `2px solid rgba(57, 255, 20, 0.5)`, 'important');
      border.style.setProperty('outline', `2px solid rgba(57, 255, 20, 0.35)`, 'important');
      border.style.setProperty('outline-offset', '-2px', 'important');
    }

    const stopButton = document.getElementById('claude-agent-stop-button');
    if (stopButton && stopButton.innerHTML.includes('Stop Claude')) {
      stopButton.innerHTML = stopButton.innerHTML.replace('Stop Claude', 'Stop HatClaw');
    }

    const staticIndicator = document.getElementById('claude-static-indicator-container');
    if (staticIndicator) {
      const html = staticIndicator.innerHTML;
      if (html.includes('Claude is active') || html.includes('#D97757')) {
        staticIndicator.innerHTML = html
          .replaceAll('Claude is active in this tab group', 'HatClaw is active in this tab group')
          .replaceAll('#D97757', color);
      }
    }

    lastColor = color;
  }

  let debounceTimer = null;
  function debouncedApply() {
    if (debounceTimer) {
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      applyOverlay();
    }, 100);
  }

  const observer = new MutationObserver(debouncedApply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.browserKingProviderState) {
      applyOverlay();
    }
  });
  applyOverlay();
})();
