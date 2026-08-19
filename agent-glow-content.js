(function() {
  'use strict';

  const AGENT_GREEN_RGB = '57, 255, 20';
  let glowHost = null;
  let glowElement = null;

  function createGlowStructure() {
    if (document.getElementById('agent-glow-root')) return;

    glowHost = document.createElement('div');
    glowHost.id = 'agent-glow-root';
    glowHost.style.cssText = 'position:fixed; inset:0; z-index:2147483646; pointer-events:none;';

    const shadow = glowHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        --agent-green: #39ff14;
        --agent-green-rgb: ${AGENT_GREEN_RGB};
      }

      .agent-active-glow {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        opacity: 0;
        box-sizing: border-box;
        box-shadow:
          inset 0 0 15px rgba(var(--agent-green-rgb), 0.1),
          inset 0 0 30px rgba(var(--agent-green-rgb), 0.05),
          inset 0 0 60px rgba(var(--agent-green-rgb), 0.02);
        transition: opacity 800ms cubic-bezier(0.4, 0, 0.2, 1);
        will-change: opacity;
      }

      .agent-active-glow.active {
        opacity: 1;
        animation: agentGlowPulse 5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      .agent-active-glow::before {
        content: "";
        position: absolute;
        inset: -8%;
        pointer-events: none;
        background: radial-gradient(
          circle at 50% 50%,
          rgba(var(--agent-green-rgb), 0.04) 0%,
          rgba(var(--agent-green-rgb), 0.01) 40%,
          transparent 70%
        );
        filter: blur(50px);
        opacity: 0.4;
        animation: agentGreenAura 6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      .agent-active-glow::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        box-shadow:
          inset 0 0 10px rgba(var(--agent-green-rgb), 0.08),
          inset 0 0 20px rgba(var(--agent-green-rgb), 0.04);
      }

      @keyframes agentGlowPulse {
        0%, 100% { opacity: 0.25; }
        50% { opacity: 0.55; }
      }

      @keyframes agentGreenAura {
        0%, 100% { transform: scale(0.98); opacity: 0.2; }
        50% { transform: scale(1.02); opacity: 0.45; }
      }

      @media (prefers-reduced-motion: reduce) {
        .agent-active-glow.active, .agent-active-glow.active::before {
          animation: none;
        }
        .agent-active-glow.active { opacity: 0.35; }
      }
    `;

    glowElement = document.createElement('div');
    glowElement.className = 'agent-active-glow';

    shadow.appendChild(style);
    shadow.appendChild(glowElement);
    (document.documentElement || document.body).appendChild(glowHost);
  }

  function updateGlow(state) {
    if (!glowElement) createGlowStructure();

    const activeStates = [
      'thinking', 'observing', 'planning', 'executing', 'verifying',
      'understanding', 'observation', 'action', 'verification'
    ];
    if (activeStates.includes(state)) {
      glowElement.classList.add('active');
    } else {
      glowElement.classList.remove('active');
    }
  }

  // Listen for messages from background/sidepanel
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'HATCLAW_AGENT_ACTIVITY') {
      updateGlow(message.detail.data.type || 'executing');
    }

    if (message.type === 'HIDE_GLOW_FOR_SCREENSHOT') {
      if (glowHost) glowHost.style.display = 'none';
    }

    if (message.type === 'RESTORE_GLOW_AFTER_SCREENSHOT') {
      if (glowHost) glowHost.style.display = 'block';
    }
  });

  // PRIMARY: storage.onChanged — reliable cross-context communication
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        // Activity-based glow (original)
        if (changes.hatclawAgentActivity) {
          const payload = changes.hatclawAgentActivity.newValue;
          if (payload?.action === 'start' && payload?.data?.type) {
            updateGlow(payload.data.type);
          } else if (payload?.action === 'clear') {
            updateGlow('idle');
          }
        }

        // DOM action-based glow (content-script.js)
        if (changes.hatclawAgentAction) {
          const action = changes.hatclawAgentAction.newValue;
          if (action && action.type) {
            updateGlow('action');
          }
        }
      }
    });
  }

  // Also poll for active state (backup for when storage events are missed)
  setInterval(() => {
    if (chrome.storage?.local) {
      chrome.storage.local.get(['hatclawAgentActivity', 'hatclawAgentAction'], (result) => {
        // Check activity-based state
        const payload = result?.hatclawAgentActivity;
        if (payload?.action === 'start' && payload?.data?.type) {
          const age = Date.now() - (payload.ts || 0);
          if (age < 30000) {
            updateGlow(payload.data.type);
          } else {
            updateGlow('idle');
          }
        }

        // Check DOM action-based state
        const domAction = result?.hatclawAgentAction;
        if (domAction && domAction.type) {
          const age = Date.now() - (domAction.ts || 0);
          if (age < 10000) {
            updateGlow('action');
          }
        }
      });
    }
  }, 2000);

  // Request current state on load to persist through navigation
  chrome.runtime.sendMessage({ type: 'GET_AGENT_STATE' }, (response) => {
    if (response && response.state) updateGlow(response.state);
  });

})();
