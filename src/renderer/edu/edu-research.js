/* FactChecker Pro Education: Research Mode (researchers) and study participation (everyone). */
(function () {
  'use strict';
  const { esc, $, $$ } = Edu;
  const V = Edu.views;
  const PHASES = { pre: 'Before (pre-test)', task: 'During', post: 'After (post-test)' };
  const GROUP_KINDS = { control: 'Control', intervention: 'Intervention', study: 'Study' };
  const Q_TYPES = { scale5: 'Scale from 1 to 5', choice: 'Multiple choice', text: 'Open text' };

  V.studies = async function () {
    if (Edu.role !== 'researcher') return V['my-studies']();
    const [d, tpl] = await Promise.all([Edu.get('/studies'), Edu.get('/studies/templates')]);
    Edu.render('Studies', `
      <div class="page-head"><div><h1>Studies</h1><p class="lead">Run controlled studies with consent, groups, pre and post tests and a pseudonymised dataset. Participants can withdraw at any time.</p></div>
        <button class="btn" id="new" type="button">+ New study</button></div>
      ${d.studies.length ? `<div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Your studies</caption><thead><tr><th scope="col">Study</th><th scope="col">Status</th><th scope="col">Join code</th><th scope="col">Participants</th><th scope="col">Scenarios</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead>
        <tbody>${d.studies.map(s => `<tr><td><b>${esc(s.title)}</b></td><td>${s.status === 'open' ? Edu.chip('Open', 'ok', '●') : s.status === 'closed' ? Edu.chip('Closed') : Edu.chip('Draft', 'warn', '✎')}</td><td><code>${esc(s.join_code)}</code></td><td>${s.participants}</td><td>${s.scenarios}</td><td><button class="btn small" type="button" data-id="${esc(s.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`
        : Edu.empty('🔬', 'No studies yet', 'Start from a template or build your own scenarios.', '')}`);
    $$('[data-id]').forEach(b => b.onclick = () => Edu.go('study', { id: b.dataset.id }));
    $('#new').onclick = async () => {
      const r = await Edu.dialog({
        title: 'New study',
        body: `<div class="field"><label for="s-tpl">Start from</label><select id="s-tpl"><option value="">Empty study</option>${tpl.templates.map(t => `<option value="${esc(t.key)}">${esc(t.title)}</option>`).join('')}</select></div>
          <div class="field"><label for="s-title">Title</label><input id="s-title" type="text" maxlength="160"></div>
          <div class="field"><label for="s-consent">Consent text participants read before joining</label><textarea id="s-consent" maxlength="6000" placeholder="What the study is about, what is collected, how long it is kept, who sees it, and that taking part is voluntary and can be stopped at any time."></textarea></div>
          <div class="cols2"><div class="field"><label for="s-ret">Keep responses for (days after closing)</label><input id="s-ret" type="number" min="30" max="3650" value="365"></div>
          <div class="field"><label for="s-eth">Ethics approval reference <span class="hint">(optional)</span></label><input id="s-eth" type="text" maxlength="120"></div></div>`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Create study', value: 'ok', validate: dd => {
          const g = i => dd.querySelector(i).value.trim();
          if (g('#s-title').length < 3) { dd.querySelector('#s-title').focus(); return false; }
          if (g('#s-consent').length < 40) { dd.querySelector('#s-consent').focus(); return false; }
          return { template: g('#s-tpl') || null, title: g('#s-title'), consent_text: g('#s-consent'), retention_days: Number(g('#s-ret')) || 365, ethics_ref: g('#s-eth') };
        } }],
      });
      if (!r) return;
      try { const out = await Edu.post('/studies', r); Edu.go('study', { id: out.study.id }); } catch (e) { Edu.toast(e.message, true); }
    };
  };

  // ── one study (researcher) ─────────────────────────────────────────────────
  V.study = async function (p) {
    const d = await Edu.get('/studies/' + p.id);
    const s = d.study, draft = s.status === 'draft';
    const tab = p.tab || (draft ? 'design' : 'results');
    const survey = s.survey || [];
    Edu.render(s.title, `
      <div class="crumbs"><button type="button" id="crumb">Studies</button> / ${esc(s.title)}</div>
      <div class="page-head"><div><h1>${esc(s.title)}</h1><p class="lead">${s.status === 'open' ? Edu.chip('Open', 'ok', '●') : s.status === 'closed' ? Edu.chip('Closed') : Edu.chip('Draft', 'warn', '✎')} Join code <span class="code-box">${esc(s.join_code)}</span> <button class="btn ghost small" id="copy-code" type="button">Copy</button> · ${d.participants} participant${d.participants === 1 ? '' : 's'}</p></div>
        <div class="row">${draft ? '<button class="btn" id="open" type="button">Open the study</button>' : ''}${s.status === 'open' ? '<button class="btn ghost" id="close" type="button">Close the study</button>' : ''}<button class="btn ghost" id="delete" type="button">Delete</button></div></div>
      <div class="tabs" role="tablist" aria-label="Study sections">${[['design', 'Design'], ['results', 'Results']].map(([k, l]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
      <div id="tab-body"></div>`);
    $('#crumb').onclick = () => Edu.go('studies');
    $('#copy-code').onclick = () => Edu.copy(s.join_code, 'Study code copied');
    $$('[data-tab]').forEach(b => b.onclick = () => Edu.go('study', { id: p.id, tab: b.dataset.tab }));
    const reload = t => Edu.go('study', { id: p.id, tab: t || tab });
    const o = $('#open'); if (o) o.onclick = async () => { if (await Edu.confirm('Open the study', 'The design is locked once the study is open: consent text, groups, scenarios and survey cannot change. Participants can then join with the code.', 'Open study')) try { await Edu.post(`/studies/${p.id}/open`); reload('results'); } catch (e) { Edu.toast(e.message, true); } };
    const c = $('#close'); if (c) c.onclick = async () => { if (await Edu.confirm('Close the study', 'No more answers are accepted. Responses are kept for the retention period you set.', 'Close study')) try { await Edu.post(`/studies/${p.id}/close`); reload('results'); } catch (e) { Edu.toast(e.message, true); } };
    $('#delete').onclick = async () => { if (await Edu.confirmTyped('Delete study', 'This deletes the design and all collected responses.', 'DELETE')) try { await Edu.del('/studies/' + p.id); Edu.go('studies'); } catch (e) { Edu.toast(e.message, true); } };
    const body = $('#tab-body');

    if (tab === 'design') {
      body.innerHTML = `
        <div class="card"><h2>Consent text</h2><p class="small" style="white-space:pre-wrap">${esc(s.consent_text)}</p><p class="small muted">Kept ${s.retention_days} days after closing.${s.ethics_ref ? ' Ethics reference: ' + esc(s.ethics_ref) + '.' : ''}</p></div>
        <div class="card"><div class="row"><h2 class="spacer">Groups</h2>${draft ? '<button class="btn small" id="add-g" type="button">+ Add group</button>' : ''}</div>
          <p class="muted small">Participants are placed in groups at random, keeping group sizes balanced. Only the intervention group sees the hint text of a scenario.</p>
          ${d.groups.length ? `<ul class="stack" style="list-style:none;padding:0">${d.groups.map(g => `<li><b>${esc(g.name)}</b> ${Edu.chip(GROUP_KINDS[g.kind] || g.kind)} <span class="small muted">${g.participants} participant${g.participants === 1 ? '' : 's'}</span>${draft ? ` <button class="btn ghost small" type="button" data-rmg="${esc(g.id)}">Remove</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">No groups yet. A single group called "All participants" is created when you open the study.</p>'}</div>
        <div class="card"><div class="row"><h2 class="spacer">Scenarios</h2>${draft ? '<button class="btn small" id="add-s" type="button">+ Add scenario</button>' : ''}</div>
          ${['pre', 'task', 'post'].map(ph => { const list = d.scenarios.filter(x => x.phase === ph); return `<h3 class="mt">${PHASES[ph]}</h3>${list.length ? list.map(x => `<div class="evidence"><div class="row"><b class="spacer">${esc(x.title || x.claim_text.slice(0, 70))}</b>${Edu.chip('Correct: ' + Edu.conclusionLabel(x.true_verdict), 'purple')}${draft ? `<button class="btn ghost small" type="button" data-rms="${esc(x.id)}">Remove</button>` : ''}</div>
            <p class="small">${esc(x.claim_text)}</p>${x.hint ? `<p class="small muted"><b>Hint for the intervention group:</b> ${esc(x.hint)}</p>` : ''}</div>`).join('') : '<p class="muted small">None.</p>'}`; }).join('')}</div>
        <div class="card"><div class="row"><h2 class="spacer">Survey</h2>${draft ? '<button class="btn small" id="add-q" type="button">+ Add question</button>' : ''}</div>
          ${survey.length ? `<ol class="stack" style="padding-left:1.2rem">${survey.map((q, i) => `<li>${esc(q.text)} <span class="muted small">(${esc(Q_TYPES[q.type] || q.type)}${q.options ? ': ' + q.options.map(esc).join(', ') : ''})</span>${draft ? ` <button class="btn ghost small" type="button" data-rmq="${i}">Remove</button>` : ''}</li>`).join('')}</ol>` : '<p class="muted small">No survey questions.</p>'}</div>`;
      const g = $('#add-g'); if (g) g.onclick = async () => {
        const r = await Edu.dialog({ title: 'Add group', body: `<div class="field"><label for="g-n">Name</label><input id="g-n" type="text" maxlength="80"></div><div class="field"><label for="g-k">Type</label><select id="g-k">${Edu.opts(GROUP_KINDS, 'control')}</select></div>`, actions: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'ok', validate: dd => { const n = dd.querySelector('#g-n').value.trim(); return n ? { name: n, kind: dd.querySelector('#g-k').value } : false; } }] });
        if (r) try { await Edu.post(`/studies/${p.id}/groups`, r); reload(); } catch (e) { Edu.toast(e.message, true); }
      };
      $$('[data-rmg]').forEach(b => b.onclick = async () => { try { await Edu.del(`/studies/${p.id}/groups/${b.dataset.rmg}`); reload(); } catch (e) { Edu.toast(e.message, true); } });
      $$('[data-rms]').forEach(b => b.onclick = async () => { try { await Edu.del(`/studies/${p.id}/scenarios/${b.dataset.rms}`); reload(); } catch (e) { Edu.toast(e.message, true); } });
      const as = $('#add-s'); if (as) as.onclick = async () => {
        const r = await Edu.dialog({ title: 'Add scenario', body: `<div class="cols2"><div class="field"><label for="x-ph">Phase</label><select id="x-ph">${Edu.opts(PHASES, 'pre')}</select></div>
            <div class="field"><label for="x-sh">Shown to</label><select id="x-sh"><option value="all">All groups</option>${d.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)} only</option>`).join('')}</select></div></div>
          <div class="field"><label for="x-title">Short title <span class="hint">(optional)</span></label><input id="x-title" type="text" maxlength="160"></div>
          <div class="field"><label for="x-claim">The claim participants judge</label><textarea id="x-claim" maxlength="1500" style="min-height:4rem"></textarea></div>
          <div class="field"><label for="x-mat">Extra material <span class="hint">(text, optional)</span></label><textarea id="x-mat" maxlength="4000" style="min-height:3.5rem"></textarea></div>
          <div class="field"><label for="x-url">Link to material <span class="hint">(optional)</span></label><input id="x-url" type="url" placeholder="https://"></div>
          <div class="field"><label for="x-v">The correct conclusion</label><select id="x-v">${Edu.ref.conclusions.map(c => `<option value="${c.key}">${esc(c.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="x-h">Hint or explanation for the intervention group <span class="hint">(optional)</span></label><textarea id="x-h" maxlength="1500" style="min-height:3.5rem"></textarea></div>`,
          actions: [{ label: 'Cancel', value: null }, { label: 'Add scenario', value: 'ok', validate: dd => { const v = i => dd.querySelector(i).value.trim(); if (v('#x-claim').length < 10) { dd.querySelector('#x-claim').focus(); return false; } return { phase: v('#x-ph'), shown_to: v('#x-sh'), title: v('#x-title'), claim_text: v('#x-claim'), material: v('#x-mat'), material_url: v('#x-url'), true_verdict: v('#x-v'), hint: v('#x-h') }; } }] });
        if (r) try { await Edu.post(`/studies/${p.id}/scenarios`, r); reload(); } catch (e) { Edu.toast(e.message, true); }
      };
      const saveSurvey = async (q) => { try { await Edu.put(`/studies/${p.id}/survey`, { questions: q }); reload(); } catch (e) { Edu.toast(e.message, true); } };
      const aq = $('#add-q'); if (aq) aq.onclick = async () => {
        const r = await Edu.dialog({ title: 'Add survey question', body: `<div class="field"><label for="q-t">Question</label><input id="q-t" type="text" maxlength="300"></div><div class="field"><label for="q-y">Answer type</label><select id="q-y">${Edu.opts(Q_TYPES, 'scale5')}</select></div>
          <div class="field"><label for="q-o">Options <span class="hint">(one per line, for multiple choice)</span></label><textarea id="q-o" style="min-height:3.5rem"></textarea></div>`,
          actions: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'ok', validate: dd => { const t = dd.querySelector('#q-t').value.trim(); if (!t) return false; const type = dd.querySelector('#q-y').value; const opts = dd.querySelector('#q-o').value.split('\n').map(x => x.trim()).filter(Boolean); if (type === 'choice' && opts.length < 2) return false; return { text: t, type, options: type === 'choice' ? opts : undefined }; } }] });
        if (r) saveSurvey([...survey, { id: 'q' + (survey.length + 1), ...r }]);
      };
      $$('[data-rmq]').forEach(b => b.onclick = () => saveSurvey(survey.filter((_, i) => i !== Number(b.dataset.rmq))));
    } else {
      body.innerHTML = '<div class="loading" role="status">Loading results</div>';
      const r = await Edu.get(`/studies/${p.id}/summary`);
      body.innerHTML = `
        <div class="row mb"><h2 class="spacer" style="margin:0">Results</h2><button class="btn" id="export" type="button">Download dataset (CSV)</button></div>
        ${r.groups.length ? r.groups.map(g => `<div class="card"><div class="row"><h3 class="spacer">${esc(g.group)}</h3>${Edu.chip(GROUP_KINDS[g.kind] || g.kind || '')}${g.small_group ? Edu.chip('Under 5 participants', 'warn') : ''}<span class="small muted">${g.participants} participant${g.participants === 1 ? '' : 's'}</span></div>
          <table class="tbl"><thead><tr><th scope="col">Phase</th><th scope="col">Responses</th><th scope="col">Accuracy</th><th scope="col">Mean confidence</th><th scope="col">Mean seconds</th></tr></thead>
          <tbody>${['pre', 'task', 'post'].filter(ph => g.phases[ph]).map(ph => `<tr><td>${esc(PHASES[ph])}</td><td>${g.phases[ph].responses}</td><td>${g.phases[ph].accuracy_percent}%</td><td>${g.phases[ph].mean_confidence ?? ''}</td><td>${g.phases[ph].mean_seconds ?? ''}</td></tr>`).join('')}</tbody></table>
          ${g.change_pre_to_post != null ? `<p class="mt"><b>Change from before to after:</b> ${g.change_pre_to_post >= 0 ? '+' : ''}${g.change_pre_to_post} percentage points</p>` : ''}</div>`).join('') : Edu.empty('📊', 'No responses yet', 'Results appear as participants answer.', '')}
        <p class="small muted mt">${esc(r.note)} Exported datasets contain pseudonyms and dates only. Nobody, including you, can link a pseudonym to an account.</p>`;
      $('#export').onclick = async () => { try { const x = await Edu.get(`/studies/${p.id}/export`); await Edu.saveFile(x.filename, x.content); } catch (e) { Edu.toast(e.message, true); } };
    }
  };

  // ── participants ───────────────────────────────────────────────────────────
  V['my-studies'] = async function () {
    const d = await Edu.get('/studies/joined');
    Edu.render('Studies', `
      <div class="page-head"><div><h1>Research studies</h1><p class="lead">Take part in a study run by a university researcher. It is voluntary, you read the consent text first, and you can withdraw at any time.</p></div>
        <button class="btn" id="join" type="button">Join with a study code</button></div>
      ${d.studies.length ? `<div class="grid">${d.studies.map(s => `<button class="card tile" type="button" data-id="${esc(s.id)}"><h3>${esc(s.title)}</h3><p class="small muted">Joined ${Edu.fmtDate(s.joined_at)} · ${s.status === 'open' ? 'Open' : 'Closed'}</p></button>`).join('')}</div>` : Edu.empty('🧪', 'You are not in a study', 'Ask the researcher for the study code.', '')}`);
    $$('[data-id]').forEach(b => b.onclick = () => Edu.go('study-run', { id: b.dataset.id }));
    $('#join').onclick = async () => {
      const code = await Edu.prompt('Join a study', 'Study code', '', 'from the researcher'); if (!code) return;
      let prev;
      try { prev = await Edu.get('/studies/preview?code=' + encodeURIComponent(code)); } catch (e) { Edu.toast(e.message, true); return; }
      const s = prev.study;
      const ok = await Edu.dialog({ title: s.title, body: `<p class="small muted">Researcher: ${esc(s.researcher)}${s.ethics_ref ? ' · Ethics reference ' + esc(s.ethics_ref) : ''}</p>${s.description ? `<p>${esc(s.description)}</p>` : ''}<h3>Consent</h3><div class="claim-box" style="max-height:14rem;overflow:auto;white-space:pre-wrap" data-notr>${esc(s.consent_text)}</div>
        <p class="small muted mt">Your answers are stored under a pseudonym, not your name. They are kept ${s.retention_days} days after the study closes. You can withdraw and have them deleted at any time.</p>
        <label class="radio"><input id="agree" type="checkbox"> <span>I have read this and agree to take part.</span></label>`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Join the study', value: 'ok', validate: dd => dd.querySelector('#agree').checked ? true : false }] });
      if (!ok) return;
      try { const r = await Edu.post('/studies/join', { code, consent: true }); Edu.go('study-run', { id: r.study_id }); } catch (e) { Edu.toast(e.message, true); }
    };
  };

  V['study-run'] = async function (p) {
    const d = await Edu.get('/studies/' + p.id + '/run');
    const order = ['pre', 'task', 'post'];
    const next = (() => { for (const ph of order) { const x = d.phases[ph].find(s => !s.answered); if (x) return { ph, s: x }; } return null; })();
    const total = order.reduce((a, ph) => a + d.phases[ph].length, 0), done = order.reduce((a, ph) => a + d.phases[ph].filter(s => s.answered).length, 0);
    const wait = d.study.status !== 'open';
    const head = `<div class="crumbs"><button type="button" id="crumb">Studies</button> / ${esc(d.study.title)}</div>`;
    if (wait) { Edu.render(d.study.title, `${head}<div class="page-head"><div><h1>${esc(d.study.title)}</h1><p class="lead">This study is closed. Thank you for taking part.</p></div></div>${withdraw()}`); return wire(); }
    if (next) {
      const t0 = Date.now();
      Edu.render(d.study.title, `${head}<div class="page-head"><div><h1>${esc(d.study.title)}</h1><p class="lead">Question ${done + 1} of ${total}</p></div></div>${Edu.bar(100 * done / Math.max(1, total))}
        <div class="card mt"><p class="muted small">${esc(PHASESHORT[next.ph])}</p>${next.s.title ? `<h2>${esc(next.s.title)}</h2>` : ''}<div class="claim-box">${esc(next.s.claim_text)}</div>
          ${next.s.material ? `<div class="evidence mt">${esc(next.s.material)}</div>` : ''}${next.s.material_url ? `<p class="mt"><button class="link" id="open-mat" type="button">Open the material</button></p>` : ''}
          ${next.s.hint ? `<details class="mt" id="hint"><summary><b>Show an explanation</b></summary><p class="mt">${esc(next.s.hint)}</p></details>` : ''}
          <fieldset class="field mt" style="border:0;padding:0"><legend class="sr-only">Your conclusion</legend>${d.conclusions.map(c => `<label class="radio"><input type="radio" name="ans" value="${esc(c.key)}"> <span><b>${esc(c.label)}</b></span></label>`).join('')}</fieldset>
          <div class="field"><label for="conf">How sure are you?</label><select id="conf"><option value="">Choose</option>${[[1, '1 Not sure'], [2, '2'], [3, '3'], [4, '4'], [5, '5 Very sure']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          <button class="btn" id="send" type="button">Submit answer</button></div>${withdraw()}`);
      wire();
      let hintUsed = false;
      const h = $('#hint'); if (h) h.addEventListener('toggle', () => { if (h.open) hintUsed = true; });
      const om = $('#open-mat'); if (om) om.onclick = () => Edu.openExternal(next.s.material_url);
      $('#send').onclick = async () => {
        const a = document.querySelector('input[name=ans]:checked');
        if (!a || !$('#conf').value) { Edu.toast('Choose a conclusion and how sure you are.', true); return; }
        try { await Edu.post(`/studies/${p.id}/respond`, { scenario_id: next.s.id, answer: a.value, confidence: Number($('#conf').value), seconds: Math.round((Date.now() - t0) / 1000), hint_used: hintUsed }); Edu.go('study-run', { id: p.id }); } catch (e) { Edu.toast(e.message, true); }
      };
      return;
    }
    if (d.survey.length && !d.survey_done) {
      Edu.render(d.study.title, `${head}<div class="page-head"><div><h1>A few last questions</h1></div></div>
        <div class="card">${d.survey.map(q => `<div class="field"><label for="sv-${esc(q.id)}">${esc(q.text)}</label>${q.type === 'scale5' ? `<select id="sv-${esc(q.id)}"><option value="">Choose</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${n}</option>`).join('')}</select>` : q.type === 'choice' ? `<select id="sv-${esc(q.id)}"><option value="">Choose</option>${(q.options || []).map(o => `<option>${esc(o)}</option>`).join('')}</select>` : `<textarea id="sv-${esc(q.id)}" maxlength="1500" style="min-height:3.5rem"></textarea>`}</div>`).join('')}
          <button class="btn" id="send" type="button">Send</button></div>${withdraw()}`);
      wire();
      $('#send').onclick = async () => {
        const answers = {}; d.survey.forEach(q => { const v = document.getElementById('sv-' + q.id).value; if (v) answers[q.id] = v; });
        try { await Edu.post(`/studies/${p.id}/survey-response`, { answers }); Edu.go('study-run', { id: p.id }); } catch (e) { Edu.toast(e.message, true); }
      };
      return;
    }
    Edu.render(d.study.title, `${head}<div class="page-head"><div><h1>Thank you</h1><p class="lead">You finished the study. The researcher will share results when the study ends.</p></div></div>${withdraw()}`);
    wire();

    function withdraw() { return '<div class="row mt"><button class="btn ghost small" id="withdraw" type="button">Withdraw from this study</button></div><p class="small muted">Withdrawing deletes everything you answered.</p>'; }
    function wire() {
      $('#crumb').onclick = () => Edu.go('studies');
      const w = $('#withdraw'); if (w) w.onclick = async () => { if (await Edu.confirm('Withdraw', 'Your answers will be deleted and you leave the study.', 'Withdraw', true)) try { await Edu.del(`/studies/${p.id}/participation`); Edu.go('studies'); } catch (e) { Edu.toast(e.message, true); } };
    }
  };
  const PHASESHORT = { pre: 'Part 1', task: 'Part 2', post: 'Part 3' };
})();
