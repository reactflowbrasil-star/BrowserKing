const test = require('node:test');
const assert = require('node:assert/strict');
const { CodexModelRouter, AgentCostTracker } = require('../../codex-smart-router');

test('Codex routing never crosses to another provider', () => {
  const router = new CodexModelRouter({ enabled: true });
  for (const providerId of ['anthropic', 'google', 'openrouter']) {
    const route = router.route({ providerId, originalModel: 'provider-model', task: 'extract labels' });
    assert.equal(route.enabled, false);
    assert.equal(route.model, 'provider-model');
  }
});

test('disabled Codex routing preserves selected model', () => {
  const router = new CodexModelRouter({ enabled: false });
  const route = router.route({ providerId: 'openai', originalModel: 'gpt-manual', task: 'extract labels' });
  assert.equal(route.enabled, false);
  assert.equal(route.model, 'gpt-manual');
});

test('Codex routes simple, standard and ambiguous steps independently', () => {
  const router = new CodexModelRouter({ cheapModel: 'cheap', standardModel: 'standard', escalationModel: 'strong' });
  assert.equal(router.route({ providerId: 'openai', originalModel: 'manual', task: 'extrair labels', taskId: 'a' }).model, 'cheap');
  assert.equal(router.route({ providerId: 'openai', originalModel: 'manual', task: 'decidir a próxima ação', taskId: 'b' }).model, 'standard');
  assert.equal(router.route({ providerId: 'openai', originalModel: 'manual', task: 'resolver ambiguidade', taskId: 'c', loopDetected: true }).model, 'strong');
});

test('Codex router cache and escalation budget prevent costly loops', () => {
  const router = new CodexModelRouter({ escalationModel: 'strong', standardModel: 'standard', maxEscalations: 1 });
  const first = router.route({ providerId: 'openai', originalModel: 'manual', task: 'x', taskId: 'same', loopDetected: true });
  const cached = router.route({ providerId: 'openai', originalModel: 'manual', task: 'x', taskId: 'same', loopDetected: true });
  const budgeted = router.route({ providerId: 'openai', originalModel: 'manual', task: 'changed', taskId: 'same', loopDetected: true });
  assert.equal(first.tier, 'escalation');
  assert.equal(cached.cacheHit, true);
  assert.equal(budgeted.tier, 'standard');
});

test('Codex cost tracker keeps provider-specific token metrics', () => {
  const tracker = new AgentCostTracker();
  const metrics = tracker.record({ tier: 'cheap', cacheHit: true, inputCostPerMillion: 1, outputCostPerMillion: 2 }, { prompt_tokens: 10, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 3 } }, 25);
  assert.equal(metrics.codexRequests, 1);
  assert.equal(metrics.codexCheapRequests, 1);
  assert.equal(metrics.codexInputTokens, 10);
  assert.equal(metrics.codexCachedTokens, 3);
  assert.equal(metrics.lastRequestEstimatedCost, 0.000015);
});
