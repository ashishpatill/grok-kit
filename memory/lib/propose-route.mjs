/**
 * Pure write-gate routing for MCP propose() (IDL §12 + P3.P1 identity harden).
 *
 * Decision: auto_approved | queued_for_review
 * Never silently auto-promotes pinned / identity / procedural into memories.
 */
export const MIN_EVIDENCE_AUTO = 2;

/** Namespaces that are human-write-only even when unpinned (plan preferences row). */
export const IDENTITY_NAMESPACES = new Set(['preferences']);

/**
 * @param {string} [namespace]
 * @returns {boolean}
 */
export function isIdentityNamespace(namespace) {
  if (!namespace || typeof namespace !== 'string') return false;
  return IDENTITY_NAMESPACES.has(namespace);
}

/**
 * @typedef {{ type?: string, scope?: string, pinned?: boolean, grounding_ids?: string[], namespace?: string }} ProposeMeta
 * @typedef {{ decision: 'auto_approved'|'queued_for_review', reason: string }} RouteResult
 */

/**
 * Route a propose() attempt. Pure — no DB.
 * @param {ProposeMeta} meta
 * @returns {RouteResult}
 */
export function routePropose(meta = {}) {
  const type = meta.type || 'semantic';
  const scope = meta.scope || 'global';
  const pinned = Boolean(meta.pinned);
  const grounding_ids = Array.isArray(meta.grounding_ids) ? meta.grounding_ids : [];
  const namespace = meta.namespace;

  // Gate 1: episodic / node-local → automatic
  if (type === 'episodic' || scope === 'node_local') {
    return { decision: 'auto_approved', reason: 'episodic-or-node_local' };
  }

  // Gate 2: procedural / pinned / identity ns → human-always
  if (type === 'procedural') {
    return { decision: 'queued_for_review', reason: 'procedural-human-always' };
  }
  if (pinned) {
    return { decision: 'queued_for_review', reason: 'pinned-human-always' };
  }
  if (isIdentityNamespace(namespace)) {
    return { decision: 'queued_for_review', reason: 'identity-ns-human-always' };
  }

  // Gate 3: global semantic needs cited grounding
  if (grounding_ids.length < MIN_EVIDENCE_AUTO) {
    return { decision: 'queued_for_review', reason: 'low-evidence' };
  }

  return {
    decision: 'auto_approved',
    reason: `grounding_ids>=${MIN_EVIDENCE_AUTO}`,
  };
}

/**
 * True when a route must never become a silent pinned/identity live row.
 * @param {RouteResult} route
 */
export function isHumanGated(route) {
  return route?.decision === 'queued_for_review';
}
