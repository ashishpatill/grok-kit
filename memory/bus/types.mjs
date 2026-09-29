/**
 * Thin inter-bot bus — A2A vocabulary (P3.B1–B4).
 * Not a full A2A wire protocol. MCP stays for memory/tools; this bus is
 * horizontal bot↔bot only.
 */

export const MESSAGE_TYPES = Object.freeze([
  'presence.heartbeat',
  'message.send',
  'task.request',
  'task.update',
  'task.cancel',
  'wake.request',
]);

/** Minimal task / message lifecycle (A2A-ish). */
export const LIFECYCLE = Object.freeze([
  'submitted',
  'working',
  'input-required',
  'completed',
  'failed',
  'canceled',
]);

/** Terminal statuses — no further transitions except cancel→canceled already terminal. */
export const TERMINAL = Object.freeze(['completed', 'failed', 'canceled']);

/**
 * Allowed status transitions (thin):
 *   submitted → working | canceled
 *   working   → input-required | completed | failed | canceled
 *   input-required → working | completed | failed | canceled
 */
export function canTransition(from, to) {
  if (from === to) return true;
  if (TERMINAL.includes(from)) return false;
  const allowed = {
    submitted: ['working', 'canceled'],
    working: ['input-required', 'completed', 'failed', 'canceled'],
    'input-required': ['working', 'completed', 'failed', 'canceled'],
  };
  return (allowed[from] || []).includes(to);
}

/** Fail-closed evidence gate for message.send / task.request. */
export function hasEvidence({ evidence, memory_refs } = {}) {
  const ev = Array.isArray(evidence) ? evidence : [];
  const refs = Array.isArray(memory_refs) ? memory_refs : [];
  return ev.length > 0 || refs.length > 0;
}

export function assertType(type) {
  if (!MESSAGE_TYPES.includes(type)) {
    const err = new Error(`unknown bus type: ${type}`);
    err.code = 'bus_unknown_type';
    throw err;
  }
}
