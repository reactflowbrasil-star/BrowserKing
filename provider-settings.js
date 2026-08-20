(function() {
  'use strict';

  const registry = globalThis.HatClawRegistry;

  if (!registry) {
    return;
  }

  const providerGrid = document.getElementById('provider-grid');
  const providerSearch = document.getElementById('provider-search');
  const providerSummary = document.getElementById('provider-summary');
  const saveButton = document.getElementById('save-providers');
  const resetButton = document.getElementById('reset-providers');
  const syncAllButton = document.getElementById('sync-all-models');
  const codexModal = document.getElementById('codex-profile-modal');
  const codexName = document.getElementById('codex-profile-name');
  const codexAccentList = document.getElementById('codex-accent-list');
  const codexStatus = document.getElementById('codex-profile-status');
  const CODEX_PROFILE_KEY = 'hatclawCodexProfile';
  const CODEX_ACCENTS = ['#ef4444','#f97316','#f59e0b','#84cc16','#10b981','#14b8a6','#06b6d4','#3b82f6','#8b5cf6','#a855f7','#d946ef','#ec4899'];
  let codexProfile = { name: 'Meu Codex', accent: '#f97316', linked: false, planType: null };

  let state = null;
  let filterText = '';

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function renderCard(providerId, definition, providerState) {
    const isActive = state.activeProvider === providerId;
    const note = definition.note
      ? `<div class="card-note">${escapeHtml(definition.note)}</div>`
      : '';

    return `
      <article class="provider-card ${isActive ? 'active' : ''}" data-provider-id="${providerId}" style="--provider-color: ${definition.color}">
        <div class="provider-top">
          <div class="provider-title">
            <span class="provider-dot"></span>
            <div class="provider-heading">
              <h2>${escapeHtml(definition.label)}</h2>
              <p>${definition.transport === 'anthropic' ? 'Native Anthropic messages' : 'OpenAI-compatible chat completions'}</p>
            </div>
          </div>
          <div class="provider-actions">
            <label class="toggle">
              <input type="checkbox" data-action="toggle-enabled" ${providerState.enabled ? 'checked' : ''} />
              Enabled
            </label>
          </div>
        </div>

        ${note}

        ${definition.authMode === 'chatgpt' ? `
        <div class="card-note">Use um perfil Codex vinculado à conta que deve atender este agente.</div>
        ${codexProfile.linked ? `<div class="codex-profile-summary" style="--profile-accent:${escapeHtml(codexProfile.accent)}"><span class="profile-accent"></span><strong>${escapeHtml(codexProfile.name)}</strong><small>${escapeHtml(codexProfile.planType || 'Codex')}</small></div>` : ''}
        <div class="buttons">
          <button class="primary" data-action="codex-profile" type="button">${codexProfile.linked ? 'Gerenciar perfil Codex' : 'Adicionar perfil Codex'}</button>
          <button class="secondary" data-action="chatgpt-status" type="button">Verificar conexão</button>
          <button class="secondary" data-action="chatgpt-logout" type="button">Sair</button>
        </div>` : ''}

        <div class="field">
          <label>Base URL</label>
          <input data-action="base-url" value="${escapeHtml(providerState.baseUrl)}" />
        </div>

        <div class="field">
          <label>${definition.authMode === 'chatgpt' ? 'Autenticação' : 'API Key'}</label>
          <input data-action="api-key" type="password" placeholder="${definition.requiresApiKey ? 'Enter API key' : 'Not required for this provider'}" value="${escapeHtml(providerState.apiKey || '')}" />
          <small>${definition.authMode === 'chatgpt' ? 'Use o botão acima; nenhuma chave ou cookie é salvo na extensão.' : (definition.requiresApiKey ? 'Only providers with a key appear in the sidepanel picker.' : 'Local or proxy provider.')}</small>
        </div>

        <div class="row">
          <div class="field">
            <label>Default model</label>
            <select data-action="model-select">
              ${providerState.models.map((model) => `
                <option value="${escapeHtml(model.id)}" ${model.id === providerState.model ? 'selected' : ''}>
                  ${escapeHtml(model.name)}${model.supportsVision ? ' - vision' : ''}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="field">
            <label>Availability</label>
            <small>
              ${providerState.models.length} models cached${providerState.lastSyncedAt ? `, last synced ${new Date(providerState.lastSyncedAt).toLocaleString()}` : ''}.
            </small>
          </div>
        </div>

        <div class="buttons">
          <button class="primary" data-action="set-active" type="button">${isActive ? 'Active provider' : 'Set active'}</button>
          <button class="secondary" data-action="sync-models" type="button">Fetch models</button>
        </div>

        <div class="status" data-role="status"></div>
      </article>
    `;
  }

  function updateSummary() {
    const enabled = registry.getEnabledProviders(state);
    const currentProvider = registry.getActiveProviderDefinition(state);
    const currentModel = registry.getCurrentModel(state);
    providerSummary.textContent = `${enabled.length} configured provider${enabled.length === 1 ? '' : 's'} available. Active: ${currentProvider.label} / ${currentModel.name}.`;
  }

  function render() {
    const cards = Object.keys(registry.PROVIDERS)
      .filter((providerId) => {
        if (!filterText) {
          return true;
        }

        const definition = registry.getProviderDefinition(providerId);
        const haystack = `${definition.label} ${providerId}`.toLowerCase();
        return haystack.includes(filterText);
      })
      .map((providerId) => renderCard(providerId, registry.getProviderDefinition(providerId), state.providers[providerId]))
      .join('');

    providerGrid.innerHTML = cards;
    updateSummary();
  }

  async function load() {
    const storedProfile = await chrome.storage.local.get(CODEX_PROFILE_KEY);
    codexProfile = { ...codexProfile, ...(storedProfile[CODEX_PROFILE_KEY] || {}) };
    state = await registry.loadState();
    render();
  }

  function renderAccentChoices() {
    codexAccentList.innerHTML = CODEX_ACCENTS.map((accent) => `<button class="accent-dot ${codexProfile.accent === accent ? 'selected' : ''}" type="button" data-accent="${accent}" style="--accent:${accent}" aria-label="Cor ${accent}"></button>`).join('');
  }

  function openCodexProfile() {
    codexName.value = codexProfile.name || 'Meu Codex';
    codexStatus.textContent = codexProfile.linked ? `Conta vinculada${codexProfile.planType ? ` · ${codexProfile.planType}` : ''}` : '';
    renderAccentChoices();
    codexModal.hidden = false;
    codexName.focus();
    codexName.select();
  }

  function closeCodexProfile() { codexModal.hidden = true; }

  async function persist(message) {
    state = await registry.saveState(state);
    render();
    if (!message) {
      return;
    }
    providerSummary.textContent = message;
  }

  function setCardStatus(card, message, kind) {
    const status = card.querySelector('[data-role="status"]');
    if (!status) {
      return;
    }

    status.textContent = message;
    status.className = `status ${kind || ''}`.trim();
  }

  function canSyncProvider(providerId, providerState) {
    const definition = registry.getProviderDefinition(providerId);
    if (!providerState.enabled) {
      return false;
    }

    if (definition.publicModelsUrl) {
      return true;
    }

    if (!definition.requiresApiKey) {
      return true;
    }

    return Boolean(providerState.apiKey);
  }

  async function syncProviderModels(providerId, card) {
    const providerState = state.providers[providerId];
    if (!canSyncProvider(providerId, providerState)) {
      if (card) {
        setCardStatus(card, 'Add an API key first to fetch models.', 'error');
      }
      return false;
    }

    if (card) {
      setCardStatus(card, 'Fetching live models...', '');
    }

    const models = await registry.fetchProviderModels(providerId, providerState);
    if (!models.length) {
      if (card) {
        setCardStatus(card, 'No models returned by this provider.', 'error');
      }
      return false;
    }

    providerState.models = models;
    if (!models.some((model) => model.id === providerState.model)) {
      providerState.model = models[0].id;
    }
    providerState.lastSyncedAt = Date.now();

    if (card) {
      setCardStatus(card, 'Model list refreshed.', 'success');
    }

    return true;
  }

  providerGrid.addEventListener('input', (event) => {
    const card = event.target.closest('[data-provider-id]');
    if (!card) {
      return;
    }

    const providerId = card.getAttribute('data-provider-id');
    const providerState = state.providers[providerId];
    const action = event.target.getAttribute('data-action');

    if (action === 'base-url') {
      providerState.baseUrl = event.target.value.trim();
    }

    if (action === 'api-key') {
      providerState.apiKey = event.target.value.trim();
    }
  });

  providerGrid.addEventListener('change', (event) => {
    const card = event.target.closest('[data-provider-id]');
    if (!card) {
      return;
    }

    const providerId = card.getAttribute('data-provider-id');
    const providerState = state.providers[providerId];
    const action = event.target.getAttribute('data-action');

    if (action === 'toggle-enabled') {
      providerState.enabled = event.target.checked;
    }

    if (action === 'model-select') {
      providerState.model = event.target.value;
    }
  });

  providerGrid.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const card = event.target.closest('[data-provider-id]');
    if (!card) {
      return;
    }

    const providerId = card.getAttribute('data-provider-id');
    const providerState = state.providers[providerId];
    const action = button.getAttribute('data-action');

    if (action === 'codex-profile') { openCodexProfile(); return; }

    if (action.startsWith('chatgpt-')) {
      button.disabled = true;
      try {
        const nativeAction = action === 'chatgpt-login' ? 'codex.login' : action === 'chatgpt-logout' ? 'codex.logout' : 'codex.status';
        const reply = await chrome.runtime.sendMessage({ target: 'browserking-windows', action: nativeAction, params: {} });
        if (!reply?.ok) throw new Error(reply?.error || 'Falha no companion Codex');
        if (reply.result?.authUrl) await chrome.tabs.create({ url: reply.result.authUrl });
        if (nativeAction === 'codex.login') {
          providerState.enabled = true;
          state.activeProvider = 'openai';
          await persist('Login aberto no navegador. Conclua o acesso e clique em Verificar conexão.');
        }
        if (nativeAction === 'codex.status' && reply.result?.authenticated) {
          codexProfile = { ...codexProfile, linked: true, planType: reply.result.planType || null };
          await chrome.storage.local.set({ [CODEX_PROFILE_KEY]: codexProfile });
          render();
        }
        if (nativeAction === 'codex.logout') {
          codexProfile = { ...codexProfile, linked: false, planType: null };
          await chrome.storage.local.set({ [CODEX_PROFILE_KEY]: codexProfile });
          render();
        }
        const currentCard = providerGrid.querySelector(`[data-provider-id="${providerId}"]`) || card;
        setCardStatus(currentCard, reply.result?.message || (reply.result?.authenticated ? `Conectado via ChatGPT (${reply.result.planType || 'plano ativo'}).` : 'Ainda não conectado.'), reply.result?.authenticated ? 'success' : '');
      } catch (error) {
        setCardStatus(card, error.message, 'error');
      } finally {
        button.disabled = false;
      }
      return;
    }

    if (action === 'set-active') {
      state.activeProvider = providerId;
      providerState.enabled = true;
      await persist(`Active provider updated to ${registry.getProviderDefinition(providerId).label}.`);
      return;
    }

    if (action === 'sync-models') {
      try {
        const synced = await syncProviderModels(providerId, card);
        if (synced) {
          await persist(`Fetched live models for ${registry.getProviderDefinition(providerId).label}.`);
        }
      } catch (error) {
        setCardStatus(card, error.message || 'Failed to fetch models.', 'error');
      }
    }
  });

  codexAccentList.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-accent]');
    if (!choice) return;
    codexProfile.accent = choice.dataset.accent;
    renderAccentChoices();
  });

  document.getElementById('codex-link-account').addEventListener('click', async () => {
    const linkButton = document.getElementById('codex-link-account');
    linkButton.disabled = true;
    codexStatus.textContent = 'Abrindo login oficial do Codex...';
    try {
      const reply = await chrome.runtime.sendMessage({ target: 'browserking-windows', action: 'codex.login', params: {} });
      if (!reply?.ok) throw new Error(reply?.error || 'Falha ao vincular conta Codex');
      if (reply.result?.authUrl) await chrome.tabs.create({ url: reply.result.authUrl });
      codexProfile = { ...codexProfile, name: codexName.value.trim() || 'Meu Codex', linked: Boolean(reply.result?.authenticated), planType: reply.result?.planType || null };
      await chrome.storage.local.set({ [CODEX_PROFILE_KEY]: codexProfile });
      codexStatus.textContent = reply.result?.authenticated ? `Conta vinculada · ${reply.result.planType || 'Codex'}` : 'Conclua o login no navegador e depois verifique a conexão.';
      state.providers.openai.enabled = true;
      state.activeProvider = 'openai';
      await registry.saveState(state);
      render();
    } catch (error) { codexStatus.textContent = error.message; }
    finally { linkButton.disabled = false; }
  });

  ['codex-profile-close','codex-profile-cancel'].forEach((id) => document.getElementById(id).addEventListener('click', closeCodexProfile));
  codexModal.addEventListener('click', (event) => { if (event.target === codexModal) closeCodexProfile(); });

  providerSearch.addEventListener('input', () => {
    filterText = providerSearch.value.trim().toLowerCase();
    render();
  });

  saveButton.addEventListener('click', async () => {
    providerSummary.textContent = 'Saving provider configuration and refreshing live model catalogs...';
    for (const providerId of Object.keys(state.providers)) {
      try {
        await syncProviderModels(providerId);
      } catch (error) {
        console.warn('[Provider Settings] Failed to sync models for', providerId, error);
      }
    }
    await persist('Provider configuration saved and live model catalogs refreshed.');
  });

  resetButton.addEventListener('click', async () => {
    state = registry.buildDefaultState();
    await persist('Provider configuration reset to defaults.');
  });

  syncAllButton.addEventListener('click', async () => {
    providerSummary.textContent = 'Fetching models from enabled providers...';

    const providerIds = Object.keys(state.providers).filter((providerId) => canSyncProvider(providerId, state.providers[providerId]));
    for (const providerId of providerIds) {
      try {
        await syncProviderModels(providerId);
      } catch (error) {
        console.warn('[Provider Settings] Failed to sync models for', providerId, error);
      }
    }

    await persist('Live model sync finished.');
  });

  load();
})();
