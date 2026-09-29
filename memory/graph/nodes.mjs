/**
 * P1.G3 — three graph nodes + registration helper.
 * grok-coder-01, verifier-01, curator-01 (FINAL-PLAN-V2.md §11 / TASKS P1.G3).
 */
import { CuratorClient } from './curator-client.mjs';

export const NODE_DEFS = [
  {
    node_id: 'grok-coder-01',
    role: 'coder',
    capabilities: ['implement', 'debug', 'propose_learning'],
    topics: ['task', 'handoff'],
  },
  {
    node_id: 'verifier-01',
    role: 'verifier',
    capabilities: ['verify', 'verdict'],
    topics: ['handoff'],
  },
  {
    node_id: 'curator-01',
    role: 'curator',
    capabilities: ['promote', 'reject', 'review_decide'],
    topics: ['memory_diff'],
  },
];

/**
 * Register the three P1 nodes on an Orchestrator.
 * Optional handlers: when `handlers[node_id]` is set, dispatch invokes it
 * (see orchestrator patch for G3).
 * @param {import('./orchestrator.ts').Orchestrator} orch
 * @param {{ memoryPort?: object, curator?: CuratorClient }} [ctx]
 */
export function registerP1Nodes(orch, ctx = {}) {
  const curator =
    ctx.curator ||
    (ctx.memoryPort ? new CuratorClient(ctx.memoryPort) : null);

  for (const def of NODE_DEFS) {
    const node = { ...def };
    if (def.node_id === 'curator-01' && curator) {
      node.handler = async (event, { orch: o }) => {
        // memory_diff → list + promote next pending proposal as svc:curator
        const result = await curator.promoteNext(
          event.payload?.note || 'curator-01 auto-promote on memory_diff'
        );
        await o.putBoard(
          'curator_last',
          { result, at: new Date().toISOString() },
          { run_id: event.run_id || 'global', updated_by: 'curator-01' }
        );
        return result;
      };
    }
    if (def.node_id === 'grok-coder-01') {
      node.handler = async (event, { orch: o }) => {
        const run_id = event.run_id || 'global';
        const stuck = Boolean(event.payload?.stuck);
        await o.putBoard(
          'coder_state',
          {
            ask: event.payload?.ask,
            stuck,
            evidence: event.payload?.evidence || [],
            at: new Date().toISOString(),
          },
          { run_id, updated_by: 'grok-coder-01' }
        );
        if (stuck) {
          // Handoff to verifier with stuck signal
          await o.emit(
            'handoff',
            {
              job_id: event.payload?.job_id || event.trace_id,
              ask: event.payload?.ask,
              evidence: event.payload?.evidence || [],
              stuck: true,
              must_not: event.payload?.must_not || [],
            },
            {
              from_node: 'grok-coder-01',
              to_node: 'verifier-01',
              run_id,
              trace_id: event.trace_id,
            }
          );
        }
        return { stuck };
      };
    }
    if (def.node_id === 'verifier-01') {
      node.handler = async (event, { orch: o, memoryPort }) => {
        const run_id = event.run_id || 'global';
        const fail = event.payload?.stuck || event.payload?.fail;
        const verdict = fail ? 'fail' : 'pass';
        await o.putBoard(
          'verdict',
          { verdict, reason: fail ? 'stuck-debug' : 'ok', at: new Date().toISOString() },
          { run_id, updated_by: 'verifier-01' }
        );
        // Verdict stays on blackboard (avoid outbox self-claim loops).
        if (fail && memoryPort) {
          // Propose a learning about the stuck path (queues for curator)
          const prop = await memoryPort.propose({
            namespace: event.payload?.namespace || 'errors-resolved-debug',
            text:
              event.payload?.learning ||
              'When coder reports stuck on a debug ask, verifier emits memory_diff and curator promotes a grounded learning.',
            metadata: {
              type: 'semantic',
              author: 'verifier-01',
              origin: 'stuck-debug',
              grounding_ids: event.payload?.memory_refs || [],
            },
          });
          await o.emit(
            'memory_diff',
            { proposal_id: prop.proposal_id || prop.id, decision: prop.decision },
            { from_node: 'verifier-01', to_node: 'curator-01', run_id, trace_id: event.trace_id }
          );
          return { verdict, propose: prop };
        }
        return { verdict };
      };
    }
    orch.register(node);
  }
  return { curator };
}
