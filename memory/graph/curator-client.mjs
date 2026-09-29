/**
 * Curator client (P1.G2) — calls memory port / MCP as `svc:curator`.
 * FINAL-PLAN-V2.md §8: promote/reject_proposal + review_list/review_decide.
 */
import { CURATOR_IDENTITY } from '../lib/curator-decide.mjs';

/**
 * @typedef {object} MemoryPort
 * @property {(opts?: object) => Promise<object>} review_list
 * @property {(opts: object) => Promise<object>} promote
 * @property {(opts: object) => Promise<object>} reject_proposal
 * @property {(opts: object) => Promise<object>} review_decide
 * @property {(opts: object) => Promise<object>} [propose]
 * @property {(opts: object) => Promise<object>} [get]
 * @property {(opts: object) => Promise<object>} [store]
 * @property {(opts: object) => Promise<object>} [recall]
 */

export class CuratorClient {
  /**
   * @param {MemoryPort} port
   * @param {{ identity?: string }} [opts]
   */
  constructor(port, opts = {}) {
    if (!port) throw new Error('MemoryPort required');
    this.port = port;
    this.identity = opts.identity || CURATOR_IDENTITY;
  }

  /** List pending proposals + queued review_items. */
  async listPending(opts = {}) {
    return this.port.review_list({ ...opts, decided_by: this.identity });
  }

  /** Approve + promote a proposal → memory (provenance.author = svc:curator). */
  async approveProposal(proposal_id, note) {
    return this.port.promote({
      proposal_id,
      decided_by: this.identity,
      note,
    });
  }

  async rejectProposal(proposal_id, note) {
    return this.port.reject_proposal({
      proposal_id,
      decided_by: this.identity,
      note,
    });
  }

  /**
   * Decide a review_item (approve|reject|resolve) or proposal via unified API.
   * @param {{ target: 'proposal'|'review_item', id: string, decision: string, note?: string }} opts
   */
  async decide(opts) {
    return this.port.review_decide({
      ...opts,
      decided_by: this.identity,
    });
  }

  /** Convenience: promote first pending proposal (deterministic smoke helper). */
  async promoteNext(note) {
    const list = await this.listPending();
    const first = list.proposals?.[0];
    if (!first) return { status: 'ok', decision: 'noop', detail: 'empty' };
    return this.approveProposal(first.id, note);
  }
}

export { CURATOR_IDENTITY };
