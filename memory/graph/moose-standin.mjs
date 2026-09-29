/**
 * Scripted Moose stand-in over MCP / MemoryPort (P1.G3).
 * Real Moose MCP onboarding = P1.X6. This stand-in exercises the same
 * bot-facing tools: store, recall, propose, ingest_file — with author moose-standin.
 */
export const MOOSE_IDENTITY = 'moose-standin';

export class MooseStandIn {
  /**
   * @param {object} port MemoryPort (stub or live MCP adapter)
   * @param {{ identity?: string, namespace?: string }} [opts]
   */
  constructor(port, opts = {}) {
    if (!port) throw new Error('MemoryPort required');
    this.port = port;
    this.identity = opts.identity || MOOSE_IDENTITY;
    this.namespace = opts.namespace || 'project-moose-standin';
  }

  async dropFile({ filename, text, namespace }) {
    const ns = namespace || this.namespace;
    return this.port.ingest_file({
      namespace: ns,
      filename,
      content_base64: Buffer.from(text, 'utf8').toString('base64'),
      metadata: { author: this.identity, type: 'semantic' },
    });
  }

  async proposeLearning({ text, namespace, metadata = {} }) {
    return this.port.propose({
      namespace: namespace || this.namespace,
      text,
      metadata: {
        type: 'semantic',
        ...metadata,
        author: this.identity,
        origin: metadata.origin || 'moose-standin',
      },
    });
  }

  async recall(query, opts = {}) {
    return this.port.recall({
      namespace: opts.namespace || this.namespace,
      query,
      k: opts.k || 5,
    });
  }

  async store(text, opts = {}) {
    return this.port.store({
      namespace: opts.namespace || this.namespace,
      text,
      metadata: { author: this.identity, type: opts.type || 'episodic', ...opts.metadata },
    });
  }

  /**
   * Scripted path used by G3/G4 smokes:
   * 1) file-drop note  2) propose low-evidence learning  3) wait for curator
   * 4) recall promoted learning in namespace
   */
  async scriptedRoundTrip(curator, opts = {}) {
    const ns = opts.namespace || this.namespace;
    const steps = [];

    const drop = await this.dropFile({
      filename: 'moose-stuck-note.md',
      text: 'Moose observed coder stuck on missing grounding ids.\n\nPrefer cite two memory refs before global semantic propose.',
      namespace: ns,
    });
    steps.push({ step: 'ingest_file', drop });

    const prop = await this.proposeLearning({
      text:
        opts.learning ||
        'Cite >=2 grounding memory ids before proposing global semantic learnings (Moose stand-in).',
      namespace: ns,
    });
    steps.push({ step: 'propose', prop });

    let decide = null;
    if (prop.decision === 'queued_for_review' && curator) {
      decide = await curator.approveProposal(prop.proposal_id, 'moose-standin scripted promote');
      steps.push({ step: 'curator_promote', decide });
    }

    const rc = await this.recall('grounding memory ids', { namespace: ns });
    steps.push({ step: 'recall', rc });

    return {
      status: 'ok',
      identity: this.identity,
      namespace: ns,
      promoted_id: decide?.promoted_id || null,
      recall_count: rc.count || 0,
      steps,
    };
  }
}
