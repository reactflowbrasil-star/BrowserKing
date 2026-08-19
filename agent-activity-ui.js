(function() {
  'use strict';

  const AGENT_GREEN = '#39FF14';
  const STORAGE_KEY = 'hatclaw.agentActivity.history.v1';

  class AgentActivityManager {
    constructor() {
      this.steps = [];
      this.container = null;
      this.listContainer = null;
      this.isExpanded = false;
      this.suppressClick = false;
      this.init();
    }

    init() {
      if (document.getElementById('hc-activity-host')) return;

      const host = document.createElement('div');
      host.id = 'hc-activity-host';
      document.body.appendChild(host);

      const style = document.createElement('style');
      style.textContent = `
        #hc-activity-host {
          position: fixed;
          top: 50px;
          right: 12px;
          width: 296px;
          z-index: 999999;
          pointer-events: none;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Floating Pill Icon */
        .hc-activity-pill {
          background: rgba(15, 15, 15, 0.95);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(57, 255, 20, 0.3);
          border-radius: 50%;
          padding: 0;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          pointer-events: auto;
          cursor: grab;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          margin-left: auto;
          user-select: none;
          touch-action: none;
        }

        .hc-activity-pill:active {
          cursor: grabbing;
        }

        .hc-activity-pill:hover {
          background: rgba(25, 25, 25, 1);
          transform: translateY(-1px);
          border-color: rgba(57, 255, 20, 0.6);
        }

        .hc-activity-pill .hc-status-dot {
          position: absolute;
          top: -1px;
          right: -1px;
          width: 9px;
          height: 9px;
          background: #444;
          border: 2px solid rgba(15, 15, 15, 1);
          border-radius: 50%;
          display: none;
        }

        .hc-activity-pill.hc-busy .hc-status-dot {
          display: block;
          background: ${AGENT_GREEN};
          box-shadow: 0 0 10px ${AGENT_GREEN};
          animation: hc-pulse 2s infinite;
        }

        .hc-activity-pill .hc-pill-label {
          display: none;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #fff;
          white-space: nowrap;
        }

        .hc-activity-pill.hc-pill-open {
          cursor: pointer;
          border-radius: 20px;
          width: fit-content;
          padding: 8px 14px;
          gap: 10px;
        }

        .hc-activity-pill.hc-pill-open .hc-pill-label {
          display: inline;
        }

        .hc-activity-pill.hc-pill-open .hc-status-dot {
          position: static;
          border: none;
          flex-shrink: 0;
        }

        .hc-activity-pill .hc-pill-icon {
          width: 18px;
          height: 18px;
          display: block;
        }

        /* Timeline Container */
        .hc-timeline-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: none;
          padding-top: 4px;
        }

        .hc-expanded .hc-timeline-container {
          max-height: 480px;
          opacity: 1;
          pointer-events: auto;
          overflow-y: auto;
        }

        /* Card Styles */
        .hc-step-card {
          background: rgba(22, 22, 22, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 12px;
          color: #eee;
          transition: all 0.25s ease;
          position: relative;
        }

        .hc-step-card.hc-active {
          border-color: rgba(57, 255, 20, 0.2);
          background: rgba(22, 22, 22, 1);
        }

        .hc-step-header {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }

        .hc-step-icon {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #444;
        }

        .hc-active .hc-step-icon {
          background: ${AGENT_GREEN};
          box-shadow: 0 0 8px ${AGENT_GREEN};
        }

        .hc-completed .hc-step-icon {
          background: rgba(57, 255, 20, 0.6);
        }

        .hc-step-title {
          font-size: 12.5px;
          font-weight: 700;
          flex: 1;
        }

        .hc-step-content {
          margin-top: 8px;
          font-size: 12px;
          color: #aaa;
          line-height: 1.5;
          display: none;
        }

        .hc-card-expanded .hc-step-content {
          display: block;
        }

        .hc-step-summary { color: #ccc; }
        .hc-step-details { font-size: 11px; color: #777; margin-top: 4px; }

        @keyframes hc-pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }

        /* Hide scrollbar */
        .hc-timeline-container::-webkit-scrollbar { width: 0; }
      `;
      document.head.appendChild(style);
      this.container = host;

      this.renderBase();
    }

    renderBase() {
      this.container.innerHTML = `
        <div class="hc-activity-pill" title="Atividade do agente">
          <div class="hc-status-dot"></div>
          <svg class="hc-pill-icon" viewBox="0 0 24 24" fill="none" stroke="${AGENT_GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="16" height="12" x="4" y="8" rx="2"/>
            <path d="M12 8V4H8"/>
            <path d="M2 14h2"/>
            <path d="M20 14h2"/>
            <path d="M15 13v2"/>
            <path d="M9 13v2"/>
          </svg>
          <span id="hc-pill-text" class="hc-pill-label">Agent Idle</span>
        </div>
        <div class="hc-timeline-container" id="hc-timeline"></div>
      `;

      const pill = this.container.querySelector('.hc-activity-pill');
      pill.onclick = () => {
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        this.toggleExpand();
      };
      this.listContainer = this.container.querySelector('#hc-timeline');
      this.initDrag(pill);
    }

    initDrag(pill) {
      const host = this.container;
      let startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false, moved = false;

      pill.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const rect = host.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        dragging = true;
        moved = false;
        host.style.right = 'auto';
        host.style.left = startLeft + 'px';
        host.style.top = startTop + 'px';
        pill.setPointerCapture(e.pointerId);
      });

      pill.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (moved) {
          const maxLeft = Math.max(0, window.innerWidth - host.offsetWidth);
          const maxTop = Math.max(0, window.innerHeight - host.offsetHeight);
          host.style.left = Math.min(Math.max(0, startLeft + dx), maxLeft) + 'px';
          host.style.top = Math.min(Math.max(0, startTop + dy), maxTop) + 'px';
        }
      });

      const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        try { pill.releasePointerCapture(e.pointerId); } catch (err) {}
        if (moved) this.suppressClick = true;
      };

      pill.addEventListener('pointerup', endDrag);
      pill.addEventListener('pointercancel', endDrag);
    }

    toggleExpand() {
      this.isExpanded = !this.isExpanded;
      this.container.classList.toggle('hc-expanded', this.isExpanded);
      const pill = this.container.querySelector('.hc-activity-pill');
      if (pill) pill.classList.toggle('hc-pill-open', this.isExpanded);
    }

    addStep(step) {
      const id = 'step-' + Date.now();
      const newStep = {
        id,
        status: 'active',
        expanded: true,
        ...step
      };

      this.steps.forEach(s => {
        if (s.status === 'active') {
          s.status = 'completed';
          s.expanded = false;
          this.updateDOM(s.id);
        }
      });

      this.steps.push(newStep);
      this.renderStep(newStep);
      this.updatePill(newStep.title);
      this.refreshBusy();
      this.save();
      return id;
    }

    updateStep(id, updates) {
      const step = this.steps.find(s => s.id === id);
      if (step) {
        Object.assign(step, updates);
        this.updateDOM(id);
        if (step.status === 'active') this.updatePill(step.title);
        this.refreshBusy();
        this.save();
      }
    }

    refreshBusy() {
      const hasActive = this.steps.some(s => s.status === 'active');
      this.container.classList.toggle('hc-busy', hasActive);
    }

    updatePill(text) {
      const el = document.getElementById('hc-pill-text');
      if (el) el.textContent = text;
      const pill = this.container.querySelector('.hc-activity-pill');
      if (pill) pill.title = text;
    }

    updateDOM(id) {
      const step = this.steps.find(s => s.id === id);
      const el = document.getElementById(id);
      if (!el || !step) return;

      el.className = `hc-step-card hc-${step.status} ${step.expanded ? 'hc-card-expanded' : ''}`;
    }

    renderStep(step) {
      const el = document.createElement('div');
      el.id = step.id;
      el.className = `hc-step-card hc-active hc-card-expanded`;

      el.innerHTML = `
        <div class="hc-step-header">
          <div class="hc-step-icon"></div>
          <div class="hc-step-title">${step.title}</div>
        </div>
        <div class="hc-step-content">
          <div class="hc-step-summary">${step.summary}</div>
          <div class="hc-step-details">${step.details || ''}</div>
        </div>
      `;

      el.onclick = (e) => {
        e.stopPropagation();
        step.expanded = !step.expanded;
        el.classList.toggle('hc-card-expanded', step.expanded);
      };

      this.listContainer.appendChild(el);
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    clear() {
      this.steps = [];
      this.listContainer.innerHTML = '';
      this.updatePill('Agent Idle');
      this.container.classList.remove('hc-busy');
      if (this.isExpanded) this.toggleExpand();
    }

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.steps.slice(-10)));
    }
  }

  window.AgentActivityUI = new AgentActivityManager();

  window.addEventListener('hatclaw:agent-activity', (e) => {
    const { action, stepId, data } = e.detail;
    if (action === 'start') {
      window.AgentActivityUI.addStep(data);
    } else if (action === 'update' && stepId) {
      window.AgentActivityUI.updateStep(stepId, data);
    } else if (action === 'clear') {
      window.AgentActivityUI.clear();
    }
  });

})();
