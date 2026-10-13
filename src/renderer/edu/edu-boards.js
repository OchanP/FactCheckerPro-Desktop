/* FactChecker Pro Education: evidence boards, peer review, citation assistant, credentials.
   Used by students (class and team boards), journalists and researchers (personal boards). */
(function () {
  'use strict';
  const { esc, $, $$ } = Edu;
  const V = Edu.views;
  const RUBRIC = ['Not shown', 'Emerging', 'Developing', 'Secure', 'Excellent'];

  // ── evidence dialog, shared ────────────────────────────────────────────────
  Edu.evidenceDialog = function (it) {
    it = it || { kind: 'supporting', source_type: 'news', reliability: '' };
    return Edu.dialog({
      title: it.id ? 'Edit evidence' : 'Add evidence',
      body: `<div class="cols3">
          <div class="field"><label for="e-kind">What does it show?</label><select id="e-kind">${Edu.opts(Edu.KIND_LABELS, it.kind)}</select></div>
          <div class="field"><label for="e-st">Type of source</label><select id="e-st">${Edu.opts(Edu.SRC_LABELS, it.source_type)}</select></div>
          <div class="field"><label for="e-rel">How reliable is it?</label><select id="e-rel">${Edu.opts(Edu.REL_LABELS, it.reliability || '')}</select></div></div>
        <div class="cols2"><div class="field"><label for="e-title">Title of the source</label><input id="e-title" type="text" maxlength="200" value="${esc(it.title || '')}"></div>
          <div class="field"><label for="e-url">Link</label><input id="e-url" type="url" placeholder="https://" value="${esc(it.url || '')}"></div></div>
        <div class="cols2"><div class="field"><label for="e-auth">Author or responsible body</label><input id="e-auth" type="text" maxlength="200" value="${esc(it.author_name || '')}"></div>
          <div class="field"><label for="e-pub">Publisher or outlet</label><input id="e-pub" type="text" maxlength="200" value="${esc(it.publisher || '')}"></div></div>
        <div class="cols3"><div class="field"><label for="e-date">Date published</label><input id="e-date" type="text" maxlength="40" placeholder="2026-03-14" value="${esc(it.published || '')}"></div>
          <div class="field"><label for="e-acc">Date you read it</label><input id="e-acc" type="text" maxlength="40" placeholder="2026-10-13" value="${esc(it.accessed || '')}"></div>
          <div class="field"><label for="e-doi">DOI <span class="hint">(if any)</span></label><input id="e-doi" type="text" maxlength="120" value="${esc(it.doi || '')}"></div></div>
        <div class="field"><label for="e-own">Who owns or funds it, or what is its purpose?</label><input id="e-own" type="text" maxlength="300" value="${esc(it.ownership || '')}"></div>
        <div class="field"><label for="e-note">Why does this matter for the claim?</label><textarea id="e-note" maxlength="1500" style="min-height:4rem">${esc(it.note || '')}</textarea></div>`,
      actions: [{ label: 'Cancel', value: null }, {
        label: it.id ? 'Save' : 'Add evidence', value: 'ok', validate: d => {
          const v = id => d.querySelector(id).value.trim();
          if (!v('#e-title') && !v('#e-url')) { d.querySelector('#e-title').focus(); return false; }
          return { kind: v('#e-kind'), source_type: v('#e-st'), reliability: v('#e-rel'), title: v('#e-title'), url: v('#e-url'), author_name: v('#e-auth'), publisher: v('#e-pub'), published: v('#e-date'), accessed: v('#e-acc'), doi: v('#e-doi'), ownership: v('#e-own'), note: v('#e-note') };
        },
      }],
    });
  };

  Edu.analysisHtml = a => `
    <div class="row">${Edu.chip({ primary: 'Primary source', secondary: 'Secondary source', tertiary: 'Tertiary source', unknown: 'Type unknown' }[a.classification] || a.classification, 'purple')}
      ${Edu.chip('Documentation: ' + { strong: 'strong', adequate: 'adequate', weak: 'weak' }[a.quality.label] + ' (' + a.quality.score + ')', a.quality.label === 'strong' ? 'ok' : a.quality.label === 'weak' ? 'bad' : 'warn')}</div>
    <p class="small mt">${esc(a.classification_reason)}</p>
    <ul class="stack small mt" style="list-style:none;padding:0">${a.indicators.map(i => `<li>${i.ok ? '✔' : '✖'} ${esc(i.text)}</li>`).join('')}</ul>
    ${a.suggestions.length ? `<h4 class="mt">How to strengthen it</h4><ul class="small" style="padding-left:1.2rem">${a.suggestions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${a.corrections ? `<div class="note ${a.corrections.retracted ? 'warn' : ''} mt">${a.corrections.checked ? (a.corrections.found === false ? 'Crossref has no record for this DOI.' : a.corrections.retracted ? '<b>Warning: this work has a retraction notice.</b>' : a.corrections.corrected ? 'This work has a correction or expression of concern. Read it before relying on the source.' : 'No retraction or correction found in Crossref.') : 'Could not check Crossref right now.'}</div>` : ''}
    <p class="small muted mt">${esc(a.quality.note)}</p>`;

  // ── boards list ────────────────────────────────────────────────────────────
  V.boards = async function () {
    const [d, cl] = await Promise.all([Edu.get('/boards'), Edu.get('/classes').catch(() => ({ classes: [] }))]);
    const rows = list => list.map(b => `<tr><td><b>${esc(b.title)}</b><div class="small muted">${esc(b.claim_text ? b.claim_text.slice(0, 90) : '')}</div></td>
      <td>${b.class_name ? esc(b.class_name) : '<span class="muted">Personal</span>'}</td><td>${Edu.chip(b.role === 'owner' ? 'Owner' : b.role === 'editor' ? 'Editor' : b.role === 'viewer' ? 'Viewer' : 'Peer reviewer')}</td>
      <td>${b.items}</td><td>${b.status === 'reviewed' ? Edu.chip('Reviewed', 'ok', '✔') : b.status === 'submitted' ? Edu.chip('Submitted', 'info', '➜') : Edu.chip('Open', 'warn', '✎')}</td>
      <td><button class="btn small" type="button" data-b="${esc(b.id)}">Open</button></td></tr>`).join('');
    Edu.render('Evidence boards', `
      <div class="page-head"><div><h1>Evidence boards</h1><p class="lead">One board per investigation: the claim, where it came from, evidence for and against, confidence, open questions and a conclusion.</p></div>
        <button class="btn" id="new-board" type="button">+ New board</button></div>
      ${d.boards.length ? `<div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Your boards</caption><thead><tr><th scope="col">Board</th><th scope="col">Class</th><th scope="col">Your role</th><th scope="col">Evidence</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead><tbody>${rows(d.boards)}</tbody></table></div>`
        : Edu.empty('🗂️', 'No boards yet', 'Create a board for a claim you want to investigate. Add evidence as you find it.', '')}
      ${d.peer_boards.length ? `<h2 class="mt">Boards open for your review</h2><p class="muted small">Classmates asked for feedback. Challenge weak points and suggest better sources.</p><div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Boards to review</caption><thead><tr><th scope="col">Board</th><th scope="col">Class</th><th scope="col">Your role</th><th scope="col">Evidence</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead><tbody>${rows(d.peer_boards)}</tbody></table></div>` : ''}`);
    $$('[data-b]').forEach(b => b.onclick = () => Edu.go('board', { id: b.dataset.b }));
    $('#new-board').onclick = async () => {
      const classes = (cl.classes || []).filter(c => !c.archived && (Edu.role === 'student' || c.is_owner !== false));
      const r = await Edu.dialog({
        title: 'New evidence board',
        body: `<div class="field"><label for="b-title">Board title</label><input id="b-title" type="text" maxlength="160"></div>
          <div class="field"><label for="b-claim">The claim you are checking</label><textarea id="b-claim" maxlength="1500" style="min-height:4rem"></textarea></div>
          <div class="field"><label for="b-origin">Where did the claim come from? <span class="hint">(optional)</span></label><input id="b-origin" type="text" maxlength="500" placeholder="For example: a viral post, a press release, a speech"></div>
          ${classes.length ? `<div class="field"><label for="b-class">For a class? <span class="hint">(optional)</span></label><select id="b-class"><option value="">No, a personal board</option>${classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>` : ''}`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Create board', value: 'ok', validate: d => { const t = d.querySelector('#b-title').value.trim(); if (t.length < 3) { d.querySelector('#b-title').focus(); return false; } const c = d.querySelector('#b-class'); return { title: t, claim_text: d.querySelector('#b-claim').value.trim(), claim_origin: d.querySelector('#b-origin').value.trim(), class_id: c ? c.value || null : null }; } }],
      });
      if (!r) return;
      try { const out = await Edu.post('/boards', r); Edu.go('board', { id: out.board.id }); } catch (e) { Edu.toast(e.message, true); }
    };
  };

  // ── one board ──────────────────────────────────────────────────────────────
  V.board = async function (p) {
    const draw = async (keep) => {
      const d = await Edu.get('/boards/' + p.id);
      paint(d, keep);
    };
    function paint(d, keep) {
      const b = d.board, can = d.can_edit, role = d.role;
      const cred = d.credibility;
      const isOwner = role === 'owner' || (role === 'teacher' && b.owner_id === Edu.me.user.id);
      const itemCard = i => `<div class="evidence" data-i="${esc(i.id)}">
          <div class="head"><b>${esc(i.title || i.url)}</b> ${Edu.chip(Edu.SRC_LABELS[i.source_type] || i.source_type)} ${i.reliability ? Edu.chip('Reliability: ' + i.reliability, i.reliability === 'high' ? 'ok' : i.reliability === 'low' ? 'bad' : 'warn') : ''}</div>
          ${i.url ? `<div class="small"><button class="link" type="button" data-url="${esc(i.url)}">${esc(i.url)}</button></div>` : ''}
          <div class="small mt">${[i.author_name, i.publisher, i.published].filter(Boolean).map(esc).join(' · ')}</div>
          ${i.ownership ? `<div class="small"><b>Owner or purpose:</b> ${esc(i.ownership)}</div>` : ''}
          ${i.note ? `<div class="small"><b>Why it matters:</b> ${esc(i.note)}</div>` : ''}
          <div class="small muted">Added by ${esc(i.author || 'someone')}</div>
          <div class="row mt"><button class="btn ghost small" type="button" data-check="${esc(i.id)}">Check source</button>
            <button class="btn ghost small" type="button" data-cm="${esc(i.id)}">Comment</button>
            ${can ? `<button class="btn ghost small" type="button" data-edit="${esc(i.id)}">Edit</button><button class="btn ghost small" type="button" data-rm="${esc(i.id)}">Remove</button>` : ''}</div>
          ${d.comments.filter(c => c.item_id === i.id).map(c => `<div class="small mt" style="border-left:3px solid var(--line,#ccc);padding-left:.6rem"><b>${esc(c.author)}</b>: ${esc(c.text)}</div>`).join('')}
        </div>`;
      const col = (kind, title) => `<div><h3>${title}</h3>${d.items.filter(i => i.kind === kind).map(itemCard).join('') || '<p class="muted small">Nothing yet.</p>'}</div>`;
      const peerForm = role === 'peer' || role === 'viewer';
      Edu.render(b.title, `
        <div class="crumbs"><button type="button" id="crumb">Boards</button> / ${esc(b.title)}</div>
        <div class="page-head"><div><h1>${esc(b.title)}</h1>
          <p class="lead">${Edu.chip(role === 'peer' ? 'Peer reviewer' : role)} ${b.status === 'reviewed' ? Edu.chip('Reviewed', 'ok', '✔') : b.status === 'submitted' ? Edu.chip('Submitted', 'info', '➜') : Edu.chip('Open', 'warn', '✎')} ${b.class_id ? '' : Edu.chip('Personal board')} ${d.owner ? '· Owner: ' + esc(d.owner) : ''}</p></div>
          <div class="row"><button class="btn ghost" id="export" type="button">Export report</button>
            ${isOwner ? '<button class="btn ghost" id="share" type="button">Share</button>' : ''}
            ${isOwner && b.class_id ? `<button class="btn ghost" id="peer-toggle" type="button">${b.peer_open ? 'Close peer review' : 'Open for peer review'}</button>` : ''}
            ${isOwner ? '<button class="btn ghost" id="del-board" type="button">Delete</button>' : ''}</div></div>
        ${b.status === 'submitted' && role !== 'teacher' ? '<div class="note mb" role="status">This board was submitted and is locked. Your teacher will review it.</div>' : ''}
        ${b.status === 'reviewed' && b.feedback ? `<div class="note ok mb"><b>Teacher feedback:</b> ${esc(b.feedback)}${b.teacher_scores ? '<br>' + Object.entries(b.teacher_scores).map(([k, v]) => esc(Edu.compName(k)) + ': ' + v + ' of 4').join(' · ') : ''}</div>` : ''}
        <div class="card"><h2>1. The claim</h2>
          <div class="field"><label for="f-claim">The claim</label><textarea id="f-claim" maxlength="1500" ${can ? '' : 'readonly'} style="min-height:4rem">${esc(b.claim_text || '')}</textarea></div>
          <div class="field"><label for="f-origin">Where did it come from?</label><input id="f-origin" type="text" maxlength="1500" ${can ? '' : 'readonly'} value="${esc(b.claim_origin || '')}"></div></div>
        <div class="card"><h2>2. Evidence</h2>
          ${can ? '<div class="row mb"><button class="btn" id="add-ev" type="button">+ Add evidence</button></div>' : ''}
          <div class="cols2">${col('supporting', 'Supporting')}${col('contradicting', 'Contradicting')}</div>
          ${d.items.some(i => i.kind === 'context') ? col('context', 'Context') : ''}</div>
        <div class="card"><h2>3. Conclusion</h2>
          <div class="cols2"><div class="field"><label for="f-concl">Conclusion</label><select id="f-concl" ${can ? '' : 'disabled'}><option value="">Not decided yet</option>${Edu.ref.conclusions.map(c => `<option value="${c.key}" ${b.conclusion === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
            <div class="field"><label for="f-conf">Confidence</label><select id="f-conf" ${can ? '' : 'disabled'}><option value="">Choose</option>${['low', 'medium', 'high'].map(k => `<option value="${k}" ${b.confidence === k ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></div></div>
          <div class="field"><label for="f-sum">Reasoning: how does the evidence lead to your conclusion?</label><textarea id="f-sum" maxlength="6000" ${can ? '' : 'readonly'}>${esc(b.summary || '')}</textarea></div>
          <div class="field"><label for="f-unres">What is still unresolved?</label><textarea id="f-unres" maxlength="2000" ${can ? '' : 'readonly'} style="min-height:4rem">${esc(b.unresolved || '')}</textarea></div>
          ${can ? '<div class="row"><button class="btn" id="save" type="button">Save board</button>' + (b.class_id && (role === 'owner' || role === 'editor') ? '<button class="btn ghost" id="submit" type="button">Submit for review</button>' : '') + '</div>' : ''}</div>
        <div class="card"><h2>Evidence credibility <span class="small muted">(advisory)</span></h2>
          ${cred.score == null ? `<p class="muted">${esc(cred.summary)}</p>` : `<div class="comp"><div><b>Overall</b></div><div>${Edu.bar(cred.score)}</div><div class="small">${cred.score} of 100</div></div>
          <p class="small">${esc(cred.summary)}</p>
          <details><summary><b>Why this score</b></summary><ul class="small mt" style="padding-left:1.2rem">${cred.factors.map(f => `<li><b>${esc(f.key.replace(/_/g, ' '))}</b>: ${f.score}. ${esc(f.reason)}</li>`).join('')}</ul></details>`}
          <p class="small muted mt">${esc(cred.note)}</p></div>
        <div class="card"><h2>References</h2><div class="row mb"><label for="style" class="small">Style</label><select id="style"><option value="apa">APA 7</option><option value="mla">MLA 9</option><option value="chicago">Chicago</option></select><button class="btn ghost small" id="refs" type="button">Show references</button></div><div id="refs-out"></div></div>
        <div class="card"><h2>Discussion</h2>
          ${d.comments.filter(c => !c.item_id).map(c => `<p class="small"><b>${esc(c.author)}</b> <span class="muted">${Edu.fmtDateTime(c.created_at)}</span><br>${esc(c.text)}</p>`).join('') || '<p class="muted small">No comments yet.</p>'}
          ${role === 'peer' ? '' : '<div class="field"><label for="cm-text">Add a comment</label><textarea id="cm-text" maxlength="1000" style="min-height:3rem"></textarea></div><button class="btn ghost" id="cm-add" type="button">Post comment</button>'}</div>
        <div class="card"><h2>Peer review</h2>
          ${d.peer_reviews.length ? d.peer_reviews.map(r => `<div class="evidence"><div class="head"><b>${esc(r.reviewer)}</b> ${Edu.chip('Evidence relevance: ' + r.relevance + ' of 5')}</div>
            ${r.challenges ? `<p class="small"><b>Challenges:</b> ${esc(r.challenges)}</p>` : ''}${r.additional_sources ? `<p class="small"><b>Suggested sources:</b> ${esc(r.additional_sources)}</p>` : ''}${r.alternative ? `<p class="small"><b>Another reading:</b> ${esc(r.alternative)}</p>` : ''}
            ${r.response ? `<p class="small"><b>Reply${r.revised ? ' (board revised)' : ''}:</b> ${esc(r.response)}</p>` : (can || role === 'editor' || role === 'owner') && role !== 'peer' ? `<button class="btn ghost small" type="button" data-reply="${esc(r.id)}">Reply and revise</button>` : ''}</div>`).join('') : '<p class="muted small">No peer reviews yet.</p>'}
          ${peerForm ? '<button class="btn" id="peer" type="button">Write a peer review</button>' : ''}</div>
        ${isOwner || d.members.length ? `<div class="card"><h2>People</h2><ul class="stack" style="list-style:none;padding:0">${d.members.map(m => `<li>${esc(m.name)} ${Edu.chip(m.role)} ${isOwner ? `<button class="btn ghost small" type="button" data-rmm="${esc(m.user_id)}">Remove</button>` : ''}</li>`).join('') || '<li class="muted small">Only you.</li>'}</ul></div>` : ''}
        ${role === 'teacher' && b.status !== 'open' ? `<div class="card"><h2>Review this board</h2><p class="muted small">Process scores found automatically: ${b.assessment ? Object.entries(b.assessment.scores || {}).filter(([, v]) => v != null).map(([k, v]) => esc(Edu.compName(k)) + ' ' + v).join(', ') : 'none'}. Your rubric scores replace them for every member.</p>
          <div class="cols2">${Edu.ref.competencies.filter(c => c.key !== 'ai_recognition').map(c => `<div class="field"><label for="rs-${c.key}">${esc(c.name)}</label><select id="rs-${c.key}"><option value="">Keep automatic</option>${RUBRIC.map((l, i) => `<option value="${i}" ${b.teacher_scores && b.teacher_scores[c.key] === i ? 'selected' : ''}>${i}: ${l}</option>`).join('')}</select></div>`).join('')}</div>
          <div class="field"><label for="fb">Feedback</label><textarea id="fb" maxlength="4000">${esc(b.feedback || '')}</textarea></div>
          <div class="row"><button class="btn" id="review" type="button">Save review</button><button class="btn ghost" id="reopen" type="button">Reopen for changes</button></div></div>` : ''}`, keep ? { keepScroll: true, noFocus: true } : undefined);

      $('#crumb').onclick = () => Edu.go(b.class_id && role === 'teacher' ? 'class' : 'boards', b.class_id && role === 'teacher' ? { id: b.class_id, tab: 'boards' } : {});
      $$('[data-url]').forEach(x => x.onclick = () => Edu.openExternal(x.dataset.url));
      const find = id => d.items.find(i => i.id === id);
      const act = async (fn) => { try { await fn(); await draw(true); } catch (e) { Edu.toast(e.message, true); } };
      const save = async () => { await Edu.patch('/boards/' + b.id, { claim_text: $('#f-claim').value, claim_origin: $('#f-origin').value, conclusion: $('#f-concl').value, confidence: $('#f-conf').value, summary: $('#f-sum').value, unresolved: $('#f-unres').value }); };
      if ($('#add-ev')) $('#add-ev').onclick = async () => { const r = await Edu.evidenceDialog(); if (r) act(() => Edu.post(`/boards/${b.id}/items`, r)); };
      $$('[data-edit]').forEach(x => x.onclick = async () => { const r = await Edu.evidenceDialog(find(x.dataset.edit)); if (r) act(() => Edu.patch(`/boards/${b.id}/items/${x.dataset.edit}`, r)); });
      $$('[data-rm]').forEach(x => x.onclick = async () => { if (await Edu.confirm('Remove evidence', 'Remove this evidence from the board?', 'Remove', true)) act(() => Edu.del(`/boards/${b.id}/items/${x.dataset.rm}`)); });
      $$('[data-check]').forEach(x => x.onclick = async () => {
        const i = find(x.dataset.check);
        try {
          const a = await Edu.post('/citations/analyze', { source: i, check_updates: !!i.doi });
          await Edu.dialog({ title: 'Source check: ' + (i.title || i.url), body: Edu.analysisHtml(a) + `<h4 class="mt">Citation</h4><p class="small">${esc(a.citations.apa)}</p>`, actions: [{ label: 'Close', value: true }] });
        } catch (e) { Edu.toast(e.message, true); }
      });
      $$('[data-cm]').forEach(x => x.onclick = async () => {
        const t = await Edu.prompt('Comment on this evidence', 'Your comment'); if (t) act(() => Edu.post(`/boards/${b.id}/comments`, { text: t, item_id: x.dataset.cm }));
      });
      if ($('#save')) $('#save').onclick = () => act(async () => { await save(); Edu.toast('Board saved'); });
      if ($('#submit')) $('#submit').onclick = async () => {
        if (!(await Edu.confirm('Submit for review', 'The board is locked after you submit. Make sure your conclusion and reasoning are complete.', 'Submit'))) return;
        act(async () => { await save(); const r = await Edu.post(`/boards/${b.id}/submit`); Edu.toast('Submitted. Process scores are advisory.'); });
      };
      $('#cm-add') && ($('#cm-add').onclick = () => { const t = $('#cm-text').value.trim(); if (t) act(() => Edu.post(`/boards/${b.id}/comments`, { text: t })); });
      $('#refs').onclick = async () => {
        try {
          const r = await Edu.get(`/boards/${b.id}/references?style=${$('#style').value}`);
          $('#refs-out').innerHTML = r.references.length ? `<ul class="stack small" style="padding-left:1.2rem">${r.references.map(x => `<li>${esc(x.citation)}</li>`).join('')}</ul><button class="btn ghost small mt" id="refs-copy" type="button">Copy all</button>` : '<p class="muted small">Add evidence first.</p>';
          const cp = $('#refs-copy'); if (cp) cp.onclick = () => Edu.copy(r.references.map(x => x.citation).sort().join('\n'), 'References copied');
        } catch (e) { Edu.toast(e.message, true); }
      };
      $('#export').onclick = async () => {
        try { const r = await Edu.get(`/boards/${b.id}/export?style=${$('#style').value}`); await Edu.saveFile(r.filename, r.content); } catch (e) { Edu.toast(e.message, true); }
      };
      if ($('#share')) $('#share').onclick = async () => {
        const r = await Edu.dialog({ title: 'Share this board', body: `<div class="field"><label for="sh-id">Username or email of a FactChecker Pro user</label><input id="sh-id" type="text"></div>
          <div class="field"><label for="sh-role">They can</label><select id="sh-role"><option value="editor">Edit and add evidence</option><option value="viewer">Read, comment and write a peer review</option></select></div>`,
          actions: [{ label: 'Cancel', value: null }, { label: 'Share', value: 'ok', validate: dd => { const v = dd.querySelector('#sh-id').value.trim(); return v.length < 3 ? false : { identifier: v, role: dd.querySelector('#sh-role').value }; } }] });
        if (r) act(async () => { await Edu.post(`/boards/${b.id}/members`, r); Edu.toast('Shared'); });
      };
      $$('[data-rmm]').forEach(x => x.onclick = () => act(() => Edu.del(`/boards/${b.id}/members/${x.dataset.rmm}`)));
      if ($('#peer-toggle')) $('#peer-toggle').onclick = () => act(() => Edu.post(`/boards/${b.id}/peer-open`, { open: !b.peer_open }));
      if ($('#del-board')) $('#del-board').onclick = async () => { if (await Edu.confirmTyped('Delete board', 'Delete this board and all its evidence?', 'DELETE')) { try { await Edu.del('/boards/' + b.id); Edu.go('boards'); } catch (e) { Edu.toast(e.message, true); } } };
      if ($('#peer')) $('#peer').onclick = async () => {
        const r = await Edu.dialog({ title: 'Peer review', body: `<div class="field"><label for="pr-rel">How relevant is the evidence to the claim? (1 to 5)</label><select id="pr-rel">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="field"><label for="pr-ch">What is not supported or too weak?</label><textarea id="pr-ch" maxlength="2000" style="min-height:3.5rem"></textarea></div>
          <div class="field"><label for="pr-src">Other sources worth checking</label><textarea id="pr-src" maxlength="2000" style="min-height:3.5rem"></textarea></div>
          <div class="field"><label for="pr-alt">Another way to read the evidence</label><textarea id="pr-alt" maxlength="2000" style="min-height:3.5rem"></textarea></div>`,
          actions: [{ label: 'Cancel', value: null }, { label: 'Send review', value: 'ok', validate: dd => { const g = i => dd.querySelector(i).value.trim(); if (!g('#pr-ch') && !g('#pr-src') && !g('#pr-alt')) { dd.querySelector('#pr-ch').focus(); return false; } return { relevance: Number(g('#pr-rel')), challenges: g('#pr-ch'), additional_sources: g('#pr-src'), alternative: g('#pr-alt') }; } }] });
        if (r) act(async () => { await Edu.post(`/boards/${b.id}/peer-reviews`, r); Edu.toast('Review sent'); });
      };
      $$('[data-reply]').forEach(x => x.onclick = async () => {
        const t = await Edu.prompt('Reply to the review', 'What did you change or why did you keep it?'); if (t) act(() => Edu.post(`/boards/${b.id}/peer-reviews/${x.dataset.reply}/respond`, { response: t, revised: true }));
      });
      if ($('#review')) $('#review').onclick = () => act(async () => {
        const scores = {}; Edu.ref.competencies.forEach(c => { const el = $('#rs-' + c.key); if (el && el.value !== '') scores[c.key] = Number(el.value); });
        await Edu.post(`/boards/${b.id}/review`, { scores, feedback: $('#fb').value }); Edu.toast('Review saved');
      });
      if ($('#reopen')) $('#reopen').onclick = () => act(async () => { await Edu.post(`/boards/${b.id}/reopen`); });
    }
    await draw(false);
  };

  // ── citation assistant ─────────────────────────────────────────────────────
  V.citations = async function () {
    Edu.render('Citation assistant', `
      <div class="page-head"><div><h1>Citation assistant</h1><p class="lead">Check how well a source is documented, see whether it is a primary or secondary source, and create the citation. Ratings are advisory and always explained.</p></div></div>
      <div class="card"><div class="cols2">
        <div class="field"><label for="c-title">Title</label><input id="c-title" type="text" maxlength="300"></div>
        <div class="field"><label for="c-url">Link</label><input id="c-url" type="url" placeholder="https://"></div></div>
        <div class="cols3"><div class="field"><label for="c-auth">Author or responsible body</label><input id="c-auth" type="text" maxlength="200"></div>
          <div class="field"><label for="c-pub">Publisher or outlet</label><input id="c-pub" type="text" maxlength="200"></div>
          <div class="field"><label for="c-type">Type of source</label><select id="c-type">${Edu.opts(Edu.SRC_LABELS, 'news')}</select></div></div>
        <div class="cols3"><div class="field"><label for="c-date">Date published</label><input id="c-date" type="text" placeholder="2026-03-14"></div>
          <div class="field"><label for="c-acc">Date you read it</label><input id="c-acc" type="text" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="field"><label for="c-doi">DOI <span class="hint">(if any)</span></label><input id="c-doi" type="text"></div></div>
        <div class="row"><button class="btn" id="go" type="button">Check source</button>
          <label class="radio"><input id="c-chk" type="checkbox"> <span>Also look for retractions and corrections (needs a DOI)</span></label></div></div>
      <div id="out" class="mt"></div>`);
    $('#go').onclick = async () => {
      const src = { title: $('#c-title').value, url: $('#c-url').value, author_name: $('#c-auth').value, publisher: $('#c-pub').value, source_type: $('#c-type').value, published: $('#c-date').value, accessed: $('#c-acc').value, doi: $('#c-doi').value };
      if (!src.title.trim() && !src.url.trim()) { Edu.toast('Add a title or a link first.', true); return; }
      $('#out').innerHTML = '<div class="loading" role="status">Checking</div>';
      try {
        const a = await Edu.post('/citations/analyze', { source: src, check_updates: $('#c-chk').checked });
        $('#out').innerHTML = `<div class="card"><h2>Result</h2>${Edu.analysisHtml(a)}</div>
          <div class="card"><h2>Citation</h2>${[['APA 7', a.citations.apa], ['MLA 9', a.citations.mla], ['Chicago', a.citations.chicago]].map(([n, t], i) => `<p><b>${n}</b><br><span id="cit-${i}">${esc(t)}</span><br><button class="btn ghost small mt" type="button" data-cp="${i}">Copy</button></p>`).join('')}</div>`;
        $$('[data-cp]').forEach(b => b.onclick = () => Edu.copy(document.getElementById('cit-' + b.dataset.cp).textContent, 'Citation copied'));
      } catch (e) { $('#out').innerHTML = `<div class="form-error" role="alert">${esc(e.message)}</div>`; }
    };
  };

  // ── certificates ───────────────────────────────────────────────────────────
  V.credentials = async function () {
    const d = await Edu.get('/credentials/me');
    const p = d.pathway;
    Edu.render('Certificates', `
      <div class="page-head"><div><h1>Certificates</h1><p class="lead">Certificates show demonstrated skill. Anyone you share the code with can verify one.</p></div></div>
      <div class="card"><h2>Media Literacy Foundations</h2>
        <p class="muted">Pass all ${p.modules_total} curriculum modules with 75 or more and submit ${p.investigations_needed} investigations (assignments or boards).</p>
        <div class="comp"><div><b>Modules passed</b></div><div>${Edu.bar(100 * p.modules_passed / p.modules_total)}</div><div class="small">${p.modules_passed} of ${p.modules_total}</div></div>
        <div class="comp"><div><b>Investigations submitted</b></div><div>${Edu.bar(Math.min(100, 100 * p.investigations / p.investigations_needed))}</div><div class="small">${Math.min(p.investigations, p.investigations_needed)} of ${p.investigations_needed}</div></div>
        ${d.credentials.some(c => c.kind === 'media_literacy_foundations') ? '<p class="mt">You already earned this certificate.</p>' : `<button class="btn mt" id="claim" type="button" ${p.eligible ? '' : 'disabled'}>Claim my certificate</button>${p.eligible ? '' : '<span class="small muted"> Not yet available.</span>'}`}</div>
      <h2 class="mt">My certificates</h2>
      ${d.credentials.length ? d.credentials.map(c => `<div class="card"><div class="row"><h3 class="spacer">${esc(c.title)}</h3>${c.revoked ? Edu.chip('Withdrawn', 'bad') : Edu.chip('Valid', 'ok', '✔')}</div>
        <p class="small muted">Issued by ${esc(c.issuer || '')} on ${Edu.fmtDate(c.issued_at)}. Code <b>${esc(c.code)}</b></p>
        <label class="radio"><input type="checkbox" data-name="${esc(c.id)}" ${c.show_name ? 'checked' : ''}> <span>Show my name when someone verifies this certificate</span></label>
        <div class="row mt"><button class="btn small" type="button" data-save="${esc(c.id)}" ${c.revoked ? 'disabled' : ''}>Save printable certificate</button><button class="btn ghost small" type="button" data-link="${esc(c.code)}">Copy verification link</button></div></div>`).join('')
        : Edu.empty('🏅', 'No certificates yet', 'Finish the pathway above or ask your teacher for a class certificate.', '')}`);
    const claim = $('#claim'); if (claim) claim.onclick = async () => { try { await Edu.post('/credentials/claim'); Edu.toast('Certificate issued'); Edu.go('credentials'); } catch (e) { Edu.toast(e.message, true); } };
    $$('[data-name]').forEach(x => x.onchange = async () => { try { await Edu.post(`/credentials/${x.dataset.name}/visibility`, { show_name: x.checked }); Edu.toast('Saved'); } catch (e) { Edu.toast(e.message, true); } });
    $$('[data-save]').forEach(x => x.onclick = async () => { try { const r = await Edu.get(`/credentials/${x.dataset.save}/certificate`); await Edu.saveFile(r.filename, r.content); } catch (e) { Edu.toast(e.message, true); } });
    $$('[data-link]').forEach(x => x.onclick = () => Edu.copy(d.verify_base + x.dataset.link + '?format=html', 'Verification link copied'));
  };
})();
