/**
 * P3.R1 light reflective / ExpeL extraction stub (shipped only after P3.P1 gates).
 *
 * Pure helper: turn an episodic observation into a reflective candidate that
 * **must** go through human-gated propose (identity ns / low-evidence).
 * Not a full ExpeL / Voyager loop — deepen later.
 */

/**
 * @param {{ episodic_text: string, namespace?: string, grounding_ids?: string[] }} input
 */
export function extractReflectiveStub(input) {
  const text = String(input?.episodic_text || '').trim();
  const namespace = input?.namespace || 'preferences';
  const grounding_ids = Array.isArray(input?.grounding_ids) ? input.grounding_ids : [];
  return {
    type: 'reflective',
    namespace,
    text: text
      ? `REFLECT: ${text.slice(0, 400)}`
      : 'REFLECT: (empty episodic)',
    grounding_ids,
    must_human_gate: true,
    note: 'Light stub only — queue via propose(); never silent pin/identity promote.',
  };
}
