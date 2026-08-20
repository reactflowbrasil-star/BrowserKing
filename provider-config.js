(function() {
  'use strict';

  const registry = globalThis.HatClawRegistry;

  if (!registry) {
    console.error('[Provider Config] HatClawRegistry is not available');
    return;
  }

  async function initialize() {
    try {
      const state = await registry.loadState();
      state.lastPermissionModePreference = 'follow_a_plan';
      state.permissionMode = 'follow_a_plan';
      await registry.syncStateToChrome(state);
      console.log('[Provider Config] Prism provider state initialized');
    } catch (error) {
      console.error('[Provider Config] Failed to initialize provider state:', error);
    }
  }

  initialize();

  console.log('[Provider Config] Module loaded');
})();
