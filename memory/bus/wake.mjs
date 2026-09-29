/**
 * P3.B4 — wake.request: authenticated daemon wake (POST /wake + WAKE_TOKEN).
 * Cross-bot nudge primitive. Does not claim X1 Tailscale serve — localhost
 * (or whatever WAKE_URL points at) is enough for the contract.
 */

/**
 * @param {{ url?: string, token?: string, source?: string, from?: string, reason?: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<{ ok: boolean, status: number, body: any, request: object }>}
 */
export async function wakeRequest(opts = {}) {
  const url = opts.url || process.env.WAKE_URL || `http://127.0.0.1:${process.env.PORT || 8787}/wake`;
  const token = Object.prototype.hasOwnProperty.call(opts, 'token')
    ? opts.token
    : process.env.WAKE_TOKEN;
  if (!token) {
    const err = new Error('wake.request requires WAKE_TOKEN (or opts.token)');
    err.code = 'bus_wake_no_token';
    throw err;
  }

  const body = {
    source: opts.source || 'wake.request',
    from: opts.from || null,
    reason: opts.reason || null,
    type: 'wake.request',
  };

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    const err = new Error('wake.request: fetch unavailable');
    err.code = 'bus_wake_no_fetch';
    throw err;
  }

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    body: parsed,
    request: { url, type: 'wake.request', source: body.source },
  };
}
