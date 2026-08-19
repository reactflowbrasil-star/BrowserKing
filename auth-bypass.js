/**
 * Auth Bypass - Storage Key Management
 *
 * Keeps auth storage keys populated so the extension
 * thinks it's always authenticated. No fetch patching here -
 * that's all handled by api-adapter.js.
 */

(function() {
  'use strict';

  async function ensureAuth() {
    try {
      const result = await chrome.storage.local.get([
        'accessToken', 'refreshToken', 'tokenExpiry', 'anthropicApiKey',
        'selectedModel', 'selectedModelQuickMode', 'lastPermissionModePreference'
      ]);

      const updates = {};
      if (!result.accessToken) updates.accessToken = 'custom-provider-access-token';
      if (!result.refreshToken) updates.refreshToken = 'custom-provider-refresh-token';
      if (!result.tokenExpiry || result.tokenExpiry < Date.now()) {
        updates.tokenExpiry = Date.now() + (365 * 24 * 60 * 60 * 1000);
      }
      if (!result.anthropicApiKey) updates.anthropicApiKey = 'custom-provider-key';
      if (result.lastPermissionModePreference !== 'follow_a_plan') {
        updates.lastPermissionModePreference = 'follow_a_plan';
        updates.permissionMode = 'follow_a_plan';
      }

      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
        console.log('[Auth Bypass] Repopulated auth keys:', Object.keys(updates));
      }
    } catch (e) {
      console.error('[Auth Bypass] Error:', e);
    }
  }

  ensureAuth();

  // Re-check periodically
  setInterval(ensureAuth, 10000);

  // Restore if something clears tokens
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ((changes.accessToken && !changes.accessToken.newValue) ||
        (changes.anthropicApiKey && !changes.anthropicApiKey.newValue)) {
      ensureAuth();
    }
  });

  console.log('[Auth Bypass] Storage manager installed');
})();
