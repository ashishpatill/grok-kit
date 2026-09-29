/**
 * Minimal TypeScript orchestrator scaffold (P1.G1 + G3 handlers).
 * Registry + dispatch + pause/resume — curator / node handlers for G2+.
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
  memoryPort: unknown;

  constructor(db: Queryable, opts: { memoryPort?: unknown } = {}) {
    this.db = db;
    this.memoryPort = opts.memoryPort;
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
   * registered node's topics (or any node if topics empty), invoke handler, mark done.
   * Prefer to_node when set. Consent-gate pause: when paused, returns handled=false.
   */
  async dispatchOnce(): Promise<DispatchResult> {
    if (this.paused) {
      return { handled: false, detail: 'paused' };
    }
    if (this.nodes.size === 0) {
      return { handled: false, detail: 'no-nodes' };
    }

    const topicSet = new Set<string>();
    for (const n of this.nodes.values()) {
      for (const t of n.topics || []) topicSet.add(t);
    }
    const topics = topicSet.size ? [...topicSet] : undefined;
    const row = await outboxClaimNext(this.db, { topics });
    if (!row) return { handled: false, detail: 'empty' };

    let handler: NodeDef | undefined;
    if (row.to_node && this.nodes.has(row.to_node)) {
      handler = this.nodes.get(row.to_node);
    } else {
      for (const n of this.nodes.values()) {
        if (!n.topics?.length || n.topics.includes(row.topic)) {
          handler = n;
          break;
        }
      }
    }
    if (!handler) {
      await outboxComplete(this.db, row.id, 'dead');
      return { handled: false, outbox_id: row.id, detail: 'no-handler' };
    }

    let handler_result: unknown;
    if (typeof handler.handler === 'function') {
      try {
        handler_result = await handler.handler(row, {
          orch: this,
          memoryPort: this.memoryPort,
        });
      } catch (e) {
        await outboxComplete(this.db, row.id, 'dead');
        return {
          handled: false,
          node_id: handler.node_id,
          outbox_id: row.id,
          detail: `handler-error:${(e as Error).message || e}`,
        };
      }
    }

    await outboxComplete(this.db, row.id, 'done');
    await blackboardPut(this.db, {
      run_id: row.run_id || 'global',
      key: `last_dispatch:${row.topic}`,
      value: {
        outbox_id: row.id,
        node_id: handler.node_id,
        at: new Date().toISOString(),
        handler_result: handler_result ?? null,
      },
      updated_by: 'orchestrator',
    });

    return {
      handled: true,
      node_id: handler.node_id,
      outbox_id: row.id,
      handler_result,
    };
  }

  /** Drain up to `n` pending events (G3/G4 scripts). */
  async drain(n = 16): Promise<DispatchResult[]> {
    const out: DispatchResult[] = [];
    for (let i = 0; i < n; i++) {
      const r = await this.dispatchOnce();
      out.push(r);
      if (!r.handled && (r.detail === 'empty' || r.detail === 'paused' || r.detail === 'no-nodes')) break;
    }
    return out;
  }
}

export { blackboardGet, blackboardPut, outboxEnqueue, outboxClaimNext, outboxComplete };
