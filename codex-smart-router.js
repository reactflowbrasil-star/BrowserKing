(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HatClawCodexRouting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    cheapModel: 'gpt-5.6-luna',
    standardModel: '',
    escalationModel: 'gpt-5.6-sol',
    confidenceThreshold: 0.75,
    escalationThreshold: 0.65,
    maxEscalations: 3,
    maxRetries: 2,
    cacheTtlMs: 5 * 60 * 1000,
    pricing: {
      cheap: { inputPerMillion: 0, outputPerMillion: 0 },
      standard: { inputPerMillion: 0, outputPerMillion: 0 },
      escalation: { inputPerMillion: 0, outputPerMillion: 0 }
    }
  });

  function compactText(value, limit) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit || 1200);
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  class CodexModelRouter {
    constructor(config) {
      this.config = { ...DEFAULT_CONFIG, ...(config || {}) };
      this.cache = new Map();
      this.escalationsByTask = new Map();
    }

    classifyComplexity(context) {
      const task = compactText(context?.task, 2400).toLowerCase();
      const taskType = String(context?.taskType || '').toLowerCase();
      const cheapTypes = ['extract', 'classify', 'summarize_dom', 'route', 'describe_ui'];
      const cheapPattern = /\b(extrair|extraia|classificar|resumir dom|identificar labels?|listar elementos?|extract|classify|summari[sz]e dom)\b/i;
      const escalation = Number(context?.failedAttempts || 0) >= 2
        || Boolean(context?.loopDetected)
        || Boolean(context?.visualAmbiguity)
        || Boolean(context?.substantialReplanning)
        || Number(context?.confidence ?? 1) < this.config.escalationThreshold;
      if (escalation) return 'escalation';
      if (cheapTypes.includes(taskType) || cheapPattern.test(task)) return 'cheap';
      return 'standard';
    }

    route(context) {
      const originalModel = String(context?.originalModel || '').trim();
      if (context?.providerId !== 'openai' || !this.config.enabled) {
        return { enabled: false, tier: 'existing', model: originalModel, originalModel, reason: 'Fluxo existente preservado.' };
      }
      const taskId = String(context?.taskId || hashText(context?.task || originalModel));
      const key = hashText(JSON.stringify({ taskId, task: compactText(context?.task, 1200), failedAttempts: context?.failedAttempts || 0, loopDetected: Boolean(context?.loopDetected), visualAmbiguity: Boolean(context?.visualAmbiguity) }));
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.at < this.config.cacheTtlMs) return { ...cached.route, cacheHit: true };

      let tier = this.classifyComplexity(context);
      if (tier === 'escalation') {
        const count = this.escalationsByTask.get(taskId) || 0;
        if (count >= this.config.maxEscalations) tier = 'standard';
        else this.escalationsByTask.set(taskId, count + 1);
      }
      const model = tier === 'cheap'
        ? this.config.cheapModel
        : tier === 'escalation'
          ? this.config.escalationModel
          : (this.config.standardModel || originalModel);
      const reason = tier === 'cheap'
        ? 'Etapa simples e estruturada.'
        : tier === 'escalation'
          ? 'Ambiguidade, baixa confiança ou falha repetida.'
          : 'Decisão semântica padrão.';
      const pricing = this.config.pricing?.[tier] || {};
      const route = { enabled: true, tier, model: model || originalModel, originalModel, taskId, reason, cacheHit: false, inputCostPerMillion: Number(pricing.inputPerMillion || 0), outputCostPerMillion: Number(pricing.outputPerMillion || 0) };
      this.cache.set(key, { at: Date.now(), route });
      return route;
    }
  }

  class AgentCostTracker {
    constructor(initial) {
      this.metrics = {
        codexRequests: 0, codexCheapRequests: 0, codexStandardRequests: 0,
        codexEscalations: 0, codexInputTokens: 0, codexOutputTokens: 0,
        codexCachedTokens: 0, codexEstimatedCost: 0, cacheHits: 0,
        totalLatencyMs: 0, ...(initial || {})
      };
    }

    record(route, usage, latencyMs) {
      const input = Number(usage?.prompt_tokens || usage?.input_tokens || 0);
      const output = Number(usage?.completion_tokens || usage?.output_tokens || 0);
      const cached = Number(usage?.prompt_tokens_details?.cached_tokens || usage?.cached_tokens || 0);
      const estimatedCost = ((Math.max(0, input - cached) * Number(route?.inputCostPerMillion || 0)) + (output * Number(route?.outputCostPerMillion || 0))) / 1000000;
      this.metrics.codexRequests += 1;
      if (route?.tier === 'cheap') this.metrics.codexCheapRequests += 1;
      if (route?.tier === 'standard') this.metrics.codexStandardRequests += 1;
      if (route?.tier === 'escalation') this.metrics.codexEscalations += 1;
      if (route?.cacheHit) this.metrics.cacheHits += 1;
      this.metrics.codexInputTokens += input;
      this.metrics.codexOutputTokens += output;
      this.metrics.codexCachedTokens += cached;
      this.metrics.codexEstimatedCost += estimatedCost;
      this.metrics.totalLatencyMs += Math.max(0, Number(latencyMs || 0));
      return { ...this.metrics, lastRequestEstimatedCost: estimatedCost };
    }
  }

  return { DEFAULT_CONFIG, CodexModelRouter, AgentCostTracker, compactText, hashText };
});
