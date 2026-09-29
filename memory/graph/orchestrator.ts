/**
 * Minimal TypeScript orchestrator scaffold (P1.G1).
 * Registry + dispatch + pause/resume placeholders — enough for G2 curator client.
 *
 * FINAL-PLAN-V2.md §11: blackboard-first; supervisor = deterministic routing;
 * event bus = outbox table on Neon.
 */
import type { DispatchResult, NodeDef } from './types.ts';
import {
  blackboardGet,
  blackboardPut,
  outboxClaimNext,
  outboxComplete,
  outboxEnqueue,
  type Queryable,
} from './store.ts';

export class Orchestrator {
  readonly nodes = new Map<string, NodeDef>();
  paused = false;
  db: Queryable;

  constructor(db: Queryable) {
    this.db = db;
  }

  register(node: NodeDef): void {
    if (!node?.node_id) throw new Error('node_id required');
    this.nodes.set(node.node_id, { ...node, topics: node.topics || [] });
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  async putBoard(key: string, value: unknown, opts: { run_id?: string; updated_by?: string } = {}) {
    return blackboardPut(this.db, { key, value, ...opts });
  }

  async getBoard(key: string, opts: { run_id?: string } = {}) {
    return blackboardGet(this.db, { key, ...opts });
  }

  async emit(
    topic: string,
    payload: unknown,
    opts: { from_node?: string; to_node?: string; run_id?: string; trace_id?: string } = {}
  ) {
    return outboxEnqueue(this.db, { topic, payload, ...opts });
  }

  /**
   * Deterministic router: claim one pending outbox row whose topic matches a
   * registered node's topics (or any node if topics empty), mark done.
   * Consent-gate pause: when paused, returns handled=false without claiming.
   */
  async dispatchOnce(): Promise<DispatchResult> {
    if (this.paused) {
      return { handled: false, detail: 'paused' };
    }
    if (this.nodes.size === 0) {
      return { handled: false, detail: 'no-nodes' };
    }

    // Prefer nodes with explicit topic subscriptions; fall back to first node.
    const topicSet = new Set<string>();
    for (const n of this.nodes.values()) {
      for (const t of n.topics || []) topicSet.add(t);
    }
    const topics = topicSet.size ? [...topicSet] : undefined;
    const row = await outboxClaimNext(this.db, { topics });
    if (!row) return { handled: false, detail: 'empty' };

    let handler: NodeDef | undefined;
    for (const n of this.nodes.values()) {
      if (!n.topics?.length || n.topics.includes(row.topic)) {
        handler = n;
        break;
      }
    }
    if (!handler) {
      await outboxComplete(this.db, row.id, 'dead');
      return { handled: false, outbox_id: row.id, detail: 'no-handler' };
    }

    // G1 scaffold: mark done. G2+ will invoke node handlers / curator MCP.
    await outboxComplete(this.db, row.id, 'done');
    await blackboardPut(this.db, {
      run_id: row.run_id || 'global',
      key: `last_dispatch:${row.topic}`,
      value: { outbox_id: row.id, node_id: handler.node_id, at: new Date().toISOString() },
      updated_by: 'orchestrator',
    });

    return { handled: true, node_id: handler.node_id, outbox_id: row.id };
  }
}

export { blackboardGet, blackboardPut, outboxEnqueue, outboxClaimNext, outboxComplete };
