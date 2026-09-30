async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(opts?.headers || {}) },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok && data?.status !== 'ok') throw new Error(data?.error || res.statusText);
  return data;
}

function $(sel) { return document.querySelector(sel); }

function setTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`));
    });
  });
}

async function loadStatus() {
  const s = await api('/api/status');
  $('#statusCard').innerHTML = `
    <div><strong>${s.backend}</strong> · ${s.memories_live} live memories</div>
    <div>${s.pending_proposals} pending proposals</div>
    <div class="meta" style="margin:0.4rem 0 0">${s.namespaces.map((n) => n.namespace).join(' · ') || 'no namespaces'}</div>
  `;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadReview() {
  const data = await api('/api/review');
  const root = $('#reviewList');
  if (!data.proposals?.length) {
    root.innerHTML = '<div class="card"><p class="hint">Review queue empty.</p></div>';
    return;
  }
  root.innerHTML = data.proposals.map((p) => `
    <article class="card" data-id="${escapeHtml(p.id)}">
      <div class="meta">
        <span class="badge warn">${escapeHtml(p.route_reason)}</span>
        <span>${escapeHtml(p.namespace)}</span>
        <span>${escapeHtml(p.type)} / ${escapeHtml(p.scope)}</span>
        <span>${p.pinned ? 'pinned' : 'unpinned'}</span>
        <span>${escapeHtml(p.id)}</span>
      </div>
      <h3>${escapeHtml(p.text)}</h3>
      <div class="meta">author ${escapeHtml(p.provenance?.author || '—')} · origin ${escapeHtml(p.provenance?.origin || '—')}</div>
      <div class="actions">
        <button type="button" class="btn ok" data-act="promote">Promote</button>
        <button type="button" class="btn danger" data-act="reject">Reject</button>
      </div>
    </article>
  `).join('');
  root.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const act = btn.dataset.act;
      btn.disabled = true;
      await api(`/api/${act}`, { method: 'POST', body: JSON.stringify({ proposal_id: id }) });
      await Promise.all([loadReview(), loadStatus()]);
    });
  });
}

async function loadHotPin() {
  const data = await api('/api/hot-pin');
  $('#hotMemory').textContent = data.memory_md || '';
  $('#hotTopics').textContent = data.topics_md || '';
}

$('#recallForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const qs = new URLSearchParams({
    namespace: fd.get('namespace'),
    query: fd.get('query'),
    k: fd.get('k'),
  });
  const data = await api(`/api/recall?${qs}`);
  $('#recallOut').hidden = false;
  $('#recallOut').textContent = JSON.stringify({
    status: data.status,
    count: data.count,
    hybrid: data.hybrid,
    legs: data.legs,
    contract: data.contract,
    removal_note: data.removal_note,
  }, null, 2);
  $('#recallCards').innerHTML = (data.results || []).map((r) => `
    <article class="card">
      <div class="meta">
        <span class="badge">${escapeHtml(r.id)}</span>
        <span>${escapeHtml(r.type)}</span>
        <span>rrf ${Number(r.rrf || 0).toFixed(4)}</span>
        <span>${r.pinned ? 'pinned' : 'unpinned'}</span>
      </div>
      <h3>${escapeHtml(r.text)}</h3>
      <div class="meta">provenance ${escapeHtml(JSON.stringify(r.provenance || {}))}</div>
      <p class="hint">${escapeHtml(r.removal)}</p>
    </article>
  `).join('') || '<div class="card"><p class="hint">No hits.</p></div>';
});

$('#proposeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const grounding = String(fd.get('grounding_ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const body = {
    namespace: fd.get('namespace'),
    text: fd.get('text'),
    metadata: {
      type: fd.get('type'),
      scope: fd.get('scope'),
      pinned: fd.get('pinned') === 'on',
      grounding_ids: grounding,
      author: 'console',
    },
  };
  const data = await api('/api/propose', { method: 'POST', body: JSON.stringify(body) });
  $('#proposeOut').hidden = false;
  $('#proposeOut').textContent = JSON.stringify(data, null, 2);
  await Promise.all([loadReview(), loadStatus()]);
});

$('#refreshReview').addEventListener('click', () => loadReview());
$('#refreshHot').addEventListener('click', () => loadHotPin());

setTabs();
await Promise.all([loadStatus(), loadReview(), loadHotPin()]);
