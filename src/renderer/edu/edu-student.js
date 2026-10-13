/* FactChecker Pro Education: student views.
   Home, class page, Investigation Workspace and result. */
(function () {
  'use strict';
  const { esc, $, $$ } = Edu;
  const V = Edu.views;

  const POLICY_TEXT = {
    allowed: 'AI tools are allowed in this assignment. You may still be asked how you used them.',
    disclose: 'AI tools are allowed if you say how you used them. You will answer a short disclosure before you submit.',
    not_allowed: 'AI tools are not allowed in this assignment.',
  };
  const KIND_LABELS = Edu.KIND_LABELS, SRC_LABELS = Edu.SRC_LABELS, REL_LABELS = Edu.REL_LABELS;

  // ── home ───────────────────────────────────────────────────────────────────
  V.studentHome = async function () {
    const [cd, prof] = await Promise.all([Edu.get('/classes'), Edu.get('/competencies/me')]);
    const classes = cd.classes;
    const name = (Edu.me.user.display_name || Edu.me.user.username || '');
    Edu.render('Home', `
      <div class="page-head"><div><h1>Welcome${name ? ', ' + esc(name) : ''}</h1><p class="lead">Your classes, your investigations and what to practise next.</p></div>
        <button class="btn" id="join" type="button">Join a class</button></div>
      ${classes.length ? `<h2>Your classes</h2><div class="grid">${classes.map(c => `
        <button class="card tile" type="button" data-class="${esc(c.id)}" aria-label="Open class ${esc(c.name)}">
          <div class="row"><h3 class="spacer">${esc(c.name)}</h3>${c.archived ? Edu.chip('Archived') : ''}</div>
          <p class="muted small">Teacher: ${esc(c.teacher_name || c.teacher_username)}${c.subject ? ' · ' + esc(c.subject) : ''}</p>
          <div class="mt">${Edu.bar(c.assignments ? Math.round(100 * c.done / c.assignments) : 0)}</div>
          <div class="small mt">${c.done} of ${c.assignments} assignment${c.assignments === 1 ? '' : 's'} done</div>
        </button>`).join('')}</div>` :
        Edu.empty('🔑', 'Join your first class', 'Ask your teacher for the class code. It has six letters and numbers.', '<button class="btn" id="join2" type="button">Enter a class code</button>')}
      <div class="cols2 mt">
        <div class="card"><h3>Practise next</h3>
          ${prof.recommended_modules.length ? `<ul class="stack" style="list-style:none">${prof.recommended_modules.map(m => `<li><button class="link" type="button" data-mod="${esc(m.id)}">${esc(m.title)}</button></li>`).join('')}</ul>` : '<p class="muted">You have finished the recommended modules.</p>'}
          <p class="small muted mt">${prof.modules_done} of ${prof.modules_total} modules passed.</p></div>
        <div class="card"><h3>Teacher feedback</h3>
          ${prof.teacher_feedback.length ? prof.teacher_feedback.slice(0, 2).map(f => `<p><b>${esc(f.title)}</b><br><span class="small">${esc(f.feedback)}</span></p>`).join('') : '<p class="muted">Feedback from your teacher appears here after they review your work.</p>'}
          <button class="btn ghost small mt" id="to-prof" type="button">See my skills profile</button></div>
      </div>`);
    $$('[data-class]').forEach(t => t.onclick = () => Edu.go('sclass', { id: t.dataset.class }));
    $$('[data-mod]').forEach(b => b.onclick = () => Edu.go('module', { id: b.dataset.mod }));
    ['join', 'join2'].forEach(id => { const b = document.getElementById(id); if (b) b.onclick = joinDialog; });
    $('#to-prof').onclick = () => Edu.go('profile');
  };

  async function joinDialog() {
    const r = await Edu.dialog({
      title: 'Join a class',
      body: `<div class="field"><label for="jc">Class code <span class="hint">(from your teacher)</span></label><input id="jc" type="text" maxlength="10" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em" placeholder="ABC123"></div>
        <p class="small muted">Your teacher will see your name and your submitted work for this class. They do not see your browsing.</p>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Join class', value: 'ok', validate: d => { const v = d.querySelector('#jc').value.trim(); if (v.length < 4) { d.querySelector('#jc').focus(); return false; } return v; } }],
    });
    if (!r) return;
    try { const out = await Edu.post('/classes/join', { code: r }); Edu.toast('You joined ' + out.class.name); Edu.go('sclass', { id: out.class.id }); } catch (e) { Edu.toast(e.message, true); }
  }

  // ── class page ─────────────────────────────────────────────────────────────
  V.sclass = async function (p) {
    const [cd, ad] = await Promise.all([Edu.get('/classes/' + p.id), Edu.get('/classes/' + p.id + '/assignments')]);
    const c = cd.class;
    Edu.render(c.name, `
      <div class="crumbs"><button type="button" id="crumb">Home</button> / ${esc(c.name)}</div>
      <div class="page-head"><div><h1>${esc(c.name)}</h1><p class="lead">Teacher: ${esc(c.teacher_name || '')}${c.subject ? ' · ' + esc(c.subject) : ''}</p></div></div>
      ${ad.assignments.length ? `<div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Assignments in ${esc(c.name)}</caption>
        <thead><tr><th scope="col">Assignment</th><th scope="col">Deadline</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
        <tbody>${ad.assignments.map(a => { const d = Edu.dueInfo(a.due_at); const done = a.my_status === 'submitted' || a.my_status === 'reviewed';
          return `<tr><td><b>${esc(a.title)}</b><div class="small muted">${a.claim_count} claim${a.claim_count === 1 ? '' : 's'}</div></td>
          <td>${done ? '' : Edu.chip(d.text, d.cls)}</td><td>${Edu.statusChip(a.my_status)} ${a.my_late ? Edu.chip('Late', 'bad') : ''}</td>
          <td><button class="btn small ${done ? 'ghost' : ''}" type="button" data-open="${esc(a.id)}">${done ? 'View' : a.my_status === 'draft' ? 'Continue' : 'Start'}</button></td></tr>`; }).join('')}</tbody></table></div>` :
        Edu.empty('📝', 'No assignments yet', 'Your teacher has not published an assignment. Try a curriculum module while you wait.', '<button class="btn" id="mods" type="button">Open the curriculum</button>')}
      <div class="row mt"><button class="btn ghost" id="leave" type="button">Leave this class</button></div>`);
    $('#crumb').onclick = () => Edu.go('home');
    const m = $('#mods'); if (m) m.onclick = () => Edu.go('modules');
    $$('[data-open]').forEach(b => b.onclick = () => Edu.go('workspace', { id: b.dataset.open, classId: p.id }));
    $('#leave').onclick = async () => {
      if (!(await Edu.confirm('Leave class', `Leave ${c.name}? Your submitted work stays with your teacher until the retention period ends.`, 'Leave class', true))) return;
      try { await Edu.del('/classes/' + p.id + '/members/' + Edu.me.user.id); Edu.go('home'); } catch (e) { Edu.toast(e.message, true); }
    };
  };

  // ── Investigation Workspace ────────────────────────────────────────────────
  V.workspace = async function (p) {
    const [ad, md] = await Promise.all([Edu.get('/assignments/' + p.id), Edu.get('/assignments/' + p.id + '/mine')]);
    const a = ad.assignment;
    const sub = md.submission;
    if (sub && sub.status !== 'draft') return V.result({ id: sub.id, assignmentId: a.id, classId: a.class_id });

    const saved = (sub && sub.work && sub.work.claims) || [];
    const state = {
      claims: a.claims.map(k => {
        const w = saved.find(x => x.claim_id === k.id) || {};
        return { claim_id: k.id, text: k.text, conclusion: w.conclusion || '', confidence: w.confidence || '', reasoning: w.reasoning || '', unresolved: w.unresolved || '', evidence: (w.evidence || []).map(e => ({ ...e })) };
      }),
      disc: (sub && sub.ai_disclosure) || { used: null, tool: '', purpose: '', verified: '', revised: '' },
      active: 0,
    };
    let dirty = false, timer = null, saving = false;
    const payload = () => ({ work: { claims: state.claims, summary: '' }, ai_disclosure: state.disc });
    const setSaveNote = t => { const n = $('#save-note'); if (n) n.textContent = t; };
    async function save(quiet) {
      if (saving || !dirty) return;
      saving = true; dirty = false; setSaveNote('Saving');
      try { await Edu.put('/assignments/' + a.id + '/mine', payload()); setSaveNote('Draft saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); }
      catch (e) { dirty = true; setSaveNote('Could not save. Your work is still on screen.'); if (!quiet) Edu.toast(e.message, true); }
      saving = false;
    }
    const touch = () => { dirty = true; setSaveNote('Unsaved changes'); clearTimeout(timer); timer = setTimeout(() => save(true), 1800); };
    Edu._leaveWorkspace = () => { clearTimeout(timer); return save(true); };

    const d0 = Edu.dueInfo(a.due_at);
    Edu.render(a.title, `
      <div class="crumbs"><button type="button" id="crumb">${esc(a.class_name)}</button> / ${esc(a.title)}</div>
      <div class="page-head"><div><h1>${esc(a.title)}</h1><p class="lead">${esc(a.objective || 'Investigate each claim, collect evidence, and explain your conclusion.')}</p></div>
        <div class="col" style="align-items:flex-end;gap:6px">${Edu.chip(d0.text, d0.cls)}<span class="small muted" id="save-note" role="status"></span></div></div>
      <details class="card" ${a.instructions || a.source_url || a.source_text ? 'open' : ''}><summary><b>Instructions and material</b></summary>
        ${a.instructions ? `<p class="mt">${esc(a.instructions)}</p>` : ''}
        ${a.source_url ? `<p><button class="link" id="open-src" type="button">Open the material in your browser</button></p>` : ''}
        ${a.source_text ? `<div class="claim-box mt" style="max-height:14rem;overflow:auto;white-space:pre-wrap">${esc(a.source_text)}</div>` : ''}
        <p class="small muted mt">${esc(POLICY_TEXT[a.ai_policy] || '')}</p>
        ${a.module_id ? `<p class="small mt">Suggested module: <button class="link" id="open-mod" type="button">${esc((Edu.ref.modules.find(m => m.id === a.module_id) || {}).title || 'Open module')}</button></p>` : ''}
      </details>
      <div class="tabs mt" role="tablist" aria-label="Claims" id="ctabs"></div>
      <div id="claim-panel"></div>
      <div class="card mt" id="disc-card"></div>
      <div class="sticky-bar"><button class="btn" id="submit" type="button">Submit my investigation</button><button class="btn ghost" id="save-btn" type="button">Save draft</button><button class="btn ghost" id="exit" type="button">Close</button></div>`);
    setSaveNote(sub ? 'Draft loaded' : '');

    const exit = async () => { await Edu._leaveWorkspace(); Edu.go('sclass', { id: a.class_id }); };
    $('#crumb').onclick = $('#exit').onclick = exit;
    $('#save-btn').onclick = async () => { dirty = true; await save(false); Edu.toast('Draft saved'); };
    const src = $('#open-src'); if (src) src.onclick = () => fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url: a.source_url });
    const om = $('#open-mod'); if (om) om.onclick = async () => { await Edu._leaveWorkspace(); Edu.go('module', { id: a.module_id, classId: a.class_id }); };

    function claimDone(c) { return !!c.conclusion && Edu.words(c.reasoning) >= 8; }
    function paintTabs() {
      $('#ctabs').innerHTML = state.claims.map((c, i) => `<button role="tab" type="button" data-t="${i}" aria-selected="${i === state.active}">Claim ${i + 1} ${claimDone(c) ? '<span aria-label="complete">✔</span>' : ''}</button>`).join('');
      $$('[data-t]').forEach(b => b.onclick = () => { state.active = Number(b.dataset.t); paintTabs(); paintClaim(); });
    }

    function evidenceHtml(e, j) {
      return `<div class="evidence" data-ev="${j}">
        <div class="row"><b class="spacer">Evidence ${j + 1}</b><button class="btn ghost small" type="button" data-rm-ev="${j}">Remove</button></div>
        <div class="cols3 mt">
          <div class="field"><label for="ev-k-${j}">What does it show?</label><select id="ev-k-${j}" data-ef="kind">${Edu.ref.evidence_kinds.map(k => `<option value="${k}" ${e.kind === k ? 'selected' : ''}>${esc(KIND_LABELS[k] || k)}</option>`).join('')}</select></div>
          <div class="field"><label for="ev-s-${j}">Type of source</label><select id="ev-s-${j}" data-ef="source_type">${Edu.ref.evidence_source_types.map(k => `<option value="${k}" ${e.source_type === k ? 'selected' : ''}>${esc(SRC_LABELS[k] || k)}</option>`).join('')}</select></div>
          <div class="field"><label for="ev-r-${j}">How reliable is it?</label><select id="ev-r-${j}" data-ef="reliability">${Object.entries(REL_LABELS).map(([k, l]) => `<option value="${k}" ${e.reliability === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="cols2">
          <div class="field"><label for="ev-t-${j}">Title or name of the source</label><input id="ev-t-${j}" data-ef="title" type="text" maxlength="200" value="${esc(e.title)}"></div>
          <div class="field"><label for="ev-u-${j}">Link</label><input id="ev-u-${j}" data-ef="url" type="url" placeholder="https://" value="${esc(e.url)}"></div>
        </div>
        <div class="cols2">
          <div class="field"><label for="ev-o-${j}">Who owns or funds it, or what is its purpose?</label><input id="ev-o-${j}" data-ef="ownership" type="text" maxlength="300" value="${esc(e.ownership)}"></div>
          <div class="field"><label for="ev-p-${j}">Date published</label><input id="ev-p-${j}" data-ef="published" type="text" maxlength="40" placeholder="For example 2026-03-14" value="${esc(e.published)}"></div>
        </div>
        <div class="field"><label for="ev-n-${j}">Why does this matter for the claim?</label><textarea id="ev-n-${j}" data-ef="note" maxlength="800" style="min-height:3.5rem">${esc(e.note)}</textarea></div>
      </div>`;
    }

    function paintClaim() {
      const c = state.claims[state.active];
      const concl = Edu.ref.conclusions;
      $('#claim-panel').innerHTML = `
        <div class="card">
          <h2>Claim ${state.active + 1} of ${state.claims.length}</h2>
          <div class="claim-box">${esc(c.text)}</div>
          <h3 class="mt">1. Gather evidence</h3>
          <p class="small muted">Look for evidence that supports the claim and evidence that challenges it. Note where each piece comes from and who stands behind it.</p>
          <div id="evlist">${c.evidence.map(evidenceHtml).join('')}</div>
          ${c.evidence.length < 12 ? '<button class="btn ghost" type="button" id="add-ev">+ Add evidence</button>' : '<p class="small muted">You reached the limit of 12 pieces of evidence for this claim.</p>'}
          <h3 class="mt">2. Reach a conclusion</h3>
          <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="sr-only">Conclusion for this claim</legend>
            ${concl.map(x => `<label class="radio"><input type="radio" name="concl" value="${x.key}" ${c.conclusion === x.key ? 'checked' : ''}> <span><b>${esc(x.label)}</b><br><span class="small muted">${esc(x.help || '')}</span></span></label>`).join('')}</fieldset>
          <div class="field"><label for="conf">How confident are you?</label>
            <select id="conf"><option value="">Choose</option>${['low', 'medium', 'high'].map(k => `<option value="${k}" ${c.confidence === k ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></div>
          <div class="field"><label for="reas">Explain your reasoning <span class="hint">(how does the evidence lead to your conclusion?)</span></label>
            <textarea id="reas" maxlength="4000">${esc(c.reasoning)}</textarea><div class="small muted" id="reas-count"></div></div>
          <div class="field"><label for="unres">What is still uncertain? <span class="hint">(optional, but good practice)</span></label>
            <textarea id="unres" maxlength="800" style="min-height:3.5rem">${esc(c.unresolved)}</textarea></div>
          <div class="row">${state.active > 0 ? '<button class="btn ghost" type="button" id="prev">Previous claim</button>' : ''}${state.active < state.claims.length - 1 ? '<button class="btn" type="button" id="next">Next claim</button>' : ''}</div>
        </div>`;
      const count = () => { const w = Edu.words($('#reas').value); $('#reas-count').textContent = w + ' word' + (w === 1 ? '' : 's') + (w < 8 ? ', write at least a short paragraph' : ''); };
      count();
      $$('#evlist [data-ef]').forEach(el => el.oninput = el.onchange = () => { c.evidence[Number(el.closest('[data-ev]').dataset.ev)][el.dataset.ef] = el.value; touch(); });
      $$('[data-rm-ev]').forEach(b => b.onclick = () => { c.evidence.splice(Number(b.dataset.rmEv), 1); touch(); paintClaim(); });
      const add = $('#add-ev'); if (add) add.onclick = () => {
        c.evidence.push({ kind: 'supporting', title: '', url: '', source_type: 'news', reliability: '', ownership: '', published: '', note: '' });
        touch(); paintClaim(); const t = $$('#evlist [data-ef="title"]'); t[t.length - 1].focus();
      };
      $$('input[name="concl"]').forEach(r => r.onchange = () => { c.conclusion = r.value; touch(); paintTabs(); });
      $('#conf').onchange = e => { c.confidence = e.target.value; touch(); };
      $('#reas').oninput = e => { c.reasoning = e.target.value; touch(); count(); };
      $('#reas').onblur = paintTabs;
      $('#unres').oninput = e => { c.unresolved = e.target.value; touch(); };
      const go = n => { state.active = n; paintTabs(); paintClaim(); $('#ctabs').scrollIntoView({ block: 'start' }); };
      const pv = $('#prev'); if (pv) pv.onclick = () => go(state.active - 1);
      const nx = $('#next'); if (nx) nx.onclick = () => go(state.active + 1);
    }

    function paintDisc() {
      const dd = state.disc;
      const must = a.ai_policy === 'disclose';
      $('#disc-card').innerHTML = `
        <h2>Did you use an AI tool?</h2>
        <p class="small muted">${esc(POLICY_TEXT[a.ai_policy] || '')} Being open about it is part of good practice and is never treated as proof of anything.</p>
        <fieldset style="border:0;padding:0;margin:0"><legend class="sr-only">AI use</legend>
          <label class="radio"><input type="radio" name="aiuse" value="no" ${dd.used === false ? 'checked' : ''}> <span>No, I did not use an AI tool</span></label>
          ${a.ai_policy === 'not_allowed' ? '' : `<label class="radio"><input type="radio" name="aiuse" value="yes" ${dd.used === true ? 'checked' : ''}> <span>Yes, I used an AI tool</span></label>`}</fieldset>
        ${must && dd.used === null ? '<p class="small"><b>Please answer this before you submit.</b></p>' : ''}
        <div id="disc-more" ${dd.used === true ? '' : 'hidden'}>
          <div class="cols2"><div class="field"><label for="d-tool">Which tool?</label><input id="d-tool" type="text" maxlength="120" value="${esc(dd.tool)}"></div>
          <div class="field"><label for="d-purpose">What did you use it for?</label><input id="d-purpose" type="text" maxlength="500" value="${esc(dd.purpose)}"></div></div>
          <div class="field"><label for="d-ver">What did you check independently, and how?</label><textarea id="d-ver" maxlength="1000" style="min-height:3.5rem">${esc(dd.verified)}</textarea></div>
          <div class="field"><label for="d-rev">What did you change, correct or disagree with?</label><textarea id="d-rev" maxlength="1000" style="min-height:3.5rem">${esc(dd.revised)}</textarea></div>
        </div>`;
      $$('input[name="aiuse"]').forEach(r => r.onchange = () => { dd.used = r.value === 'yes'; touch(); $('#disc-more').hidden = !dd.used; });
      [['d-tool', 'tool'], ['d-purpose', 'purpose'], ['d-ver', 'verified'], ['d-rev', 'revised']].forEach(([id, k]) => { const el = document.getElementById(id); el.oninput = () => { dd[k] = el.value; touch(); }; });
    }

    paintTabs(); paintClaim(); paintDisc();

    $('#submit').onclick = async () => {
      const problems = [];
      state.claims.forEach((c, i) => {
        if (!c.conclusion) problems.push(`Claim ${i + 1}: choose a conclusion.`);
        if (Edu.words(c.reasoning) < 8) problems.push(`Claim ${i + 1}: explain your reasoning in a short paragraph.`);
      });
      if (a.ai_policy === 'disclose' && state.disc.used === null) problems.push('Say whether you used an AI tool.');
      if (problems.length) {
        await Edu.dialog({ title: 'Almost there', body: `<p>Finish these first:</p><ul style="padding-left:1.2rem">${problems.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`, actions: [{ label: 'OK', value: true }] });
        return;
      }
      const noEv = state.claims.map((c, i) => c.evidence.length ? null : i + 1).filter(Boolean);
      const msg = noEv.length ? `You have not added any evidence for claim ${noEv.join(', ')}. Your process scores will be low. Submit anyway? You cannot change your answers after you submit.` : 'You cannot change your answers after you submit. Ready?';
      if (!(await Edu.confirm('Submit your investigation', msg, 'Submit'))) return;
      clearTimeout(timer);
      $('#submit').disabled = true;
      try {
        const r = await Edu.post('/assignments/' + a.id + '/submit', payload());
        Edu._leaveWorkspace = null;
        if (r.badges && r.badges.length) Edu.toast('New badge: ' + r.badges.map(b => b.name).join(', '));
        Edu.go('result', { id: r.submission.id, assignmentId: a.id, classId: a.class_id, fresh: true });
      } catch (e) { $('#submit').disabled = false; Edu.toast(e.message, true); }
    };
  };

  // ── result after submitting ────────────────────────────────────────────────
  V.result = async function (p) {
    const { submission: s } = await Edu.get('/submissions/' + p.id);
    const as = s.assessment || { scores: {}, per_claim: [] };
    const comps = Edu.ref.competencies;
    const ts = s.teacher_scores || {};
    Edu.render('Your result', `
      <div class="crumbs"><button type="button" id="crumb">${esc(s.assignment_title)}</button></div>
      <div class="page-head"><div><h1>${p.fresh ? 'Submitted' : 'Your submitted investigation'}</h1>
        <p class="lead">${esc(s.assignment_title)} · ${Edu.statusChip(s.status)} ${s.late ? Edu.chip('Late', 'bad') : ''}</p></div></div>
      ${s.status === 'reviewed' ? `<div class="card"><h2>Teacher feedback</h2>
        ${s.feedback ? `<p>${esc(s.feedback)}</p>` : '<p class="muted">Your teacher scored your work but left no written comment.</p>'}
        ${Object.keys(ts).length ? `<div class="cols2 mt">${Object.entries(ts).map(([k, v]) => `<div><b>${esc(Edu.compName(k))}</b><br>${v} out of 4</div>`).join('')}</div>` : ''}</div>`
        : '<div class="note mb" role="status">Your teacher has not reviewed this yet. You will see their feedback here.</div>'}
      <div class="card mt"><h2>How your process looks</h2>
        <p class="muted small">${esc(as.note || '')}</p>
        ${comps.map(c => { const v = as.scores && as.scores[c.key]; return v == null ? '' : `<div class="comp"><div><b>${esc(c.name)}</b></div><div>${Edu.bar(v)}</div><div class="small">${v} of 100</div></div>`; }).join('')}
      </div>
      ${(s.work.claims || []).map((c, i) => {
        const pc = (as.per_claim || []).find(x => x.claim_id === c.claim_id);
        if (!pc) return '';
        const all = [...pc.reasons.evidence, ...pc.reasons.source, ...pc.reasons.verdict];
        return `<div class="card"><h3>Claim ${i + 1}</h3><div class="claim-box">${esc(c.text)}</div>
          <p class="mt">Your conclusion: ${Edu.chip(Edu.conclusionLabel(c.conclusion), 'info')}</p>
          <h4>What would make it stronger</h4><ul style="padding-left:1.2rem" class="small">${all.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
      }).join('')}
      <div class="card"><h2>Compare with FactChecker Pro</h2>
        <p class="muted small">Now that you have reasoned for yourself, you can see an automated second opinion. It can be wrong. If it differs from you, that is a good thing to investigate.</p>
        <div id="cmp"><button class="btn ghost" id="run-cmp" type="button">${s.comparison ? 'Show the comparison' : 'Compare my conclusions'}</button></div></div>
      <div class="row mt"><button class="btn" id="back" type="button">Back to class</button><button class="btn ghost" id="to-prof" type="button">My skills profile</button></div>`);
    const back = () => Edu.go('sclass', { id: p.classId || s.class_id });
    $('#crumb').onclick = $('#back').onclick = back;
    $('#to-prof').onclick = () => Edu.go('profile');
    $('#run-cmp').onclick = async () => {
      const box = $('#cmp');
      box.innerHTML = '<div class="loading" role="status">Comparing, this can take a few seconds</div>';
      try { const r = await Edu.post('/submissions/' + s.id + '/compare'); box.innerHTML = Edu.comparisonHtml(r.comparison); } catch (e) { box.innerHTML = `<div class="form-error" role="alert">${esc(e.message)}</div>`; }
    };
  };
})();
