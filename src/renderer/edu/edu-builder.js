/* FactChecker Pro Education: curriculum builder and marketplace. */
(function () {
  'use strict';
  const { esc, $, $$ } = Edu;
  const V = Edu.views;
  const SHARING = { private: 'Only me', institution: 'My institution', public: 'Marketplace (everyone)' };

  V['my-modules'] = async function () {
    const [d, mods] = await Promise.all([Edu.get('/custom-modules'), Edu.get('/modules')]);
    Edu.render('My modules', `
      <div class="crumbs"><button type="button" id="crumb">Curriculum</button> / My modules</div>
      <div class="page-head"><div><h1>My modules</h1><p class="lead">Build your own lessons and knowledge checks, with examples from your own subject. Share them with your institution or the marketplace.</p></div>
        <div class="row"><button class="btn" id="new" type="button">+ New module</button><button class="btn ghost" id="copy" type="button">Start from a built-in module</button><button class="btn ghost" id="market" type="button">Marketplace</button></div></div>
      ${d.modules.length ? `<div class="grid">${d.modules.map(m => `<div class="card">
        <div class="row"><h3 class="spacer">${esc(m.title)}</h3>${Edu.chip(SHARING[m.sharing] || m.sharing, m.sharing === 'private' ? '' : 'purple')}</div>
        <p class="muted small">${esc(m.summary || '')}</p>
        <div class="small muted">${m.lessons} lesson${m.lessons === 1 ? '' : 's'} · ${m.checks} question${m.checks === 1 ? '' : 's'} · ${esc(m.lang === 'nl' ? 'Dutch' : 'English')}${m.copies ? ` · copied ${m.copies} time${m.copies === 1 ? '' : 's'}` : ''}</div>
        <div class="row mt"><button class="btn small" type="button" data-edit="${esc(m.id)}">Edit</button><button class="btn ghost small" type="button" data-view="${esc(m.id)}">Preview</button>
          <button class="btn ghost small" type="button" data-share="${esc(m.id)}" data-cur="${esc(m.sharing)}">Share</button><button class="btn ghost small" type="button" data-del="${esc(m.id)}" data-title="${esc(m.title)}">Delete</button></div></div>`).join('')}</div>`
        : Edu.empty('🛠️', 'No modules yet', 'Start from scratch or copy a built-in module and change it.', '')}`);
    $('#crumb').onclick = () => Edu.go('modules');
    $('#new').onclick = () => Edu.go('module-edit');
    $('#market').onclick = () => Edu.go('marketplace');
    $('#copy').onclick = async () => {
      const opts = mods.modules.filter(m => !m.custom).map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('');
      const r = await Edu.dialog({ title: 'Copy a built-in module', body: `<div class="field"><label for="src">Module</label><select id="src">${opts}</select></div><p class="small muted">The copy is yours to change. It is written in the app language you use now.</p>`, actions: [{ label: 'Cancel', value: null }, { label: 'Copy', value: 'ok', validate: dd => dd.querySelector('#src').value }] });
      if (!r) return;
      try { const out = await Edu.post('/custom-modules/copy', { source_id: r }); Edu.go('module-edit', { id: out.module.id }); } catch (e) { Edu.toast(e.message, true); }
    };
    $$('[data-edit]').forEach(b => b.onclick = () => Edu.go('module-edit', { id: b.dataset.edit }));
    $$('[data-view]').forEach(b => b.onclick = () => Edu.go('module', { id: b.dataset.view }));
    $$('[data-share]').forEach(b => b.onclick = async () => {
      const r = await Edu.dialog({ title: 'Share this module', body: `<div class="field"><label for="sh">Who can use it?</label><select id="sh">${Edu.opts(SHARING, b.dataset.cur)}</select></div>
        <p class="small muted">Institution: members of your institution can use and copy it. Marketplace: any teacher, journalist or researcher can copy it. A public module needs at least two lessons and three questions. Students use a module when it is linked to their assignment.</p>`, actions: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', validate: dd => dd.querySelector('#sh').value }] });
      if (!r) return;
      try { await Edu.post(`/custom-modules/${b.dataset.share}/share`, { sharing: r }); Edu.toast('Sharing updated'); Edu.go('my-modules'); } catch (e) { Edu.toast(e.message, true); }
    });
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!(await Edu.confirm('Delete module', `Delete "${b.dataset.title}"? Assignments that use it will lose the link.`, 'Delete', true))) return;
      try { await Edu.del('/custom-modules/' + b.dataset.del); Edu.go('my-modules'); } catch (e) { Edu.toast(e.message, true); }
    });
  };

  V['module-edit'] = async function (p) {
    let m = { title: '', summary: '', competency: 'source_evaluation', level: '', lang: Edu.lang, minutes: 20, lessons: [{ title: '', body: '', example: '' }], exercise: { title: '', prompt: '' }, checks: [], reflection: '' };
    if (p.id) m = (await Edu.get('/custom-modules/' + p.id)).module;
    const lessons = (m.lessons && m.lessons.length ? m.lessons : [{ title: '', body: '', example: '' }]).map(l => ({ ...l }));
    const checks = (m.checks || []).map(c => ({ q: c.q, options: [...c.options, '', '', '', ''].slice(0, Math.max(4, c.options.length)), answer: c.answer, explain: c.explain || '', competency: c.competency }));
    while (checks.length < 3) checks.push({ q: '', options: ['', '', '', ''], answer: 0, explain: '' });
    const ex = m.exercise || { title: '', prompt: '' };

    Edu.render(p.id ? 'Edit module' : 'New module', `
      <div class="crumbs"><button type="button" id="crumb">My modules</button> / ${p.id ? 'Edit' : 'New'}</div>
      <div class="page-head"><div><h1>${p.id ? 'Edit module' : 'New module'}</h1><p class="lead">Short lessons, a practice task, a knowledge check with explained answers, and a reflection.</p></div></div>
      <div id="form-err"></div>
      <div class="card"><h2>About the module</h2>
        <div class="field"><label for="m-title">Title</label><input id="m-title" type="text" maxlength="160" value="${esc(m.title)}"></div>
        <div class="field"><label for="m-sum">Summary</label><input id="m-sum" type="text" maxlength="400" value="${esc(m.summary || '')}"></div>
        <div class="cols3">
          <div class="field"><label for="m-comp">Skill it builds</label><select id="m-comp">${Edu.ref.competencies.map(c => `<option value="${c.key}" ${m.competency === c.key ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="m-lang">Language</label><select id="m-lang"><option value="en" ${m.lang === 'en' ? 'selected' : ''}>English</option><option value="nl" ${m.lang === 'nl' ? 'selected' : ''}>Nederlands</option></select></div>
          <div class="field"><label for="m-min">Minutes</label><input id="m-min" type="number" min="5" max="120" value="${esc(m.minutes || 20)}"></div></div></div>
      <div class="card"><h2>Lessons</h2><div id="lessons"></div><button class="btn ghost" id="add-l" type="button">+ Add a lesson</button></div>
      <div class="card"><h2>Practice task</h2>
        <div class="field"><label for="x-title">Title</label><input id="x-title" type="text" maxlength="160" value="${esc(ex.title || '')}"></div>
        <div class="field"><label for="x-prompt">What should the learner do?</label><textarea id="x-prompt" maxlength="1500">${esc(ex.prompt || '')}</textarea></div></div>
      <div class="card"><h2>Knowledge check</h2><p class="muted small">At least two questions. Give two to four options, mark the correct one and explain why.</p><div id="checks"></div><button class="btn ghost" id="add-c" type="button">+ Add a question</button></div>
      <div class="card"><h2>Reflection</h2><div class="field"><label for="m-refl">Question for the learner to think about</label><textarea id="m-refl" maxlength="800" style="min-height:4rem">${esc(m.reflection || '')}</textarea></div></div>
      <div class="sticky-bar"><button class="btn" id="save" type="button">Save module</button><button class="btn ghost" id="cancel" type="button">Cancel</button></div>`);

    const grab = () => {
      $$('#lessons [data-l]').forEach(el => { lessons[Number(el.dataset.l)][el.dataset.f] = el.value; });
      $$('#checks [data-c]').forEach(el => {
        const c = checks[Number(el.dataset.c)];
        if (el.dataset.f === 'opt') c.options[Number(el.dataset.o)] = el.value;
        else if (el.dataset.f === 'ans') { if (el.checked) c.answer = Number(el.value); }
        else c[el.dataset.f] = el.value;
      });
    };
    function paintLessons() {
      $('#lessons').innerHTML = lessons.map((l, i) => `<div class="evidence"><div class="row"><b class="spacer">Lesson ${i + 1}</b>${lessons.length > 1 ? `<button class="btn ghost small" type="button" data-rml="${i}">Remove</button>` : ''}</div>
        <div class="field"><label for="l-t-${i}">Title</label><input id="l-t-${i}" data-l="${i}" data-f="title" type="text" maxlength="120" value="${esc(l.title)}"></div>
        <div class="field"><label for="l-b-${i}">Explanation</label><textarea id="l-b-${i}" data-l="${i}" data-f="body" maxlength="3000">${esc(l.body)}</textarea></div>
        <div class="field"><label for="l-e-${i}">Example <span class="hint">(optional)</span></label><textarea id="l-e-${i}" data-l="${i}" data-f="example" maxlength="1000" style="min-height:3.5rem">${esc(l.example || '')}</textarea></div></div>`).join('');
      $$('[data-rml]').forEach(b => b.onclick = () => { grab(); lessons.splice(Number(b.dataset.rml), 1); paintLessons(); });
    }
    function paintChecks() {
      $('#checks').innerHTML = checks.map((c, i) => `<div class="evidence"><div class="row"><b class="spacer">Question ${i + 1}</b>${checks.length > 2 ? `<button class="btn ghost small" type="button" data-rmc="${i}">Remove</button>` : ''}</div>
        <div class="field"><label for="c-q-${i}">Question</label><input id="c-q-${i}" data-c="${i}" data-f="q" type="text" maxlength="400" value="${esc(c.q)}"></div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="small muted">Options (tick the correct one)</legend>
          ${c.options.map((o, oi) => `<div class="row" style="margin-bottom:6px"><input type="radio" name="ans-${i}" value="${oi}" data-c="${i}" data-f="ans" aria-label="Option ${oi + 1} is correct" ${c.answer === oi ? 'checked' : ''}><input type="text" data-c="${i}" data-f="opt" data-o="${oi}" aria-label="Option ${oi + 1}" maxlength="300" style="flex:1" value="${esc(o)}"></div>`).join('')}</fieldset>
        <div class="field"><label for="c-x-${i}">Why is it correct?</label><input id="c-x-${i}" data-c="${i}" data-f="explain" type="text" maxlength="600" value="${esc(c.explain)}"></div></div>`).join('');
      $$('[data-rmc]').forEach(b => b.onclick = () => { grab(); checks.splice(Number(b.dataset.rmc), 1); paintChecks(); });
    }
    paintLessons(); paintChecks();
    $('#add-l').onclick = () => { grab(); if (lessons.length < 8) lessons.push({ title: '', body: '', example: '' }); paintLessons(); };
    $('#add-c').onclick = () => { grab(); if (checks.length < 12) checks.push({ q: '', options: ['', '', '', ''], answer: 0, explain: '' }); paintChecks(); };
    $('#crumb').onclick = $('#cancel').onclick = () => Edu.go('my-modules');
    $('#save').onclick = async () => {
      grab();
      const fail = t => { $('#form-err').innerHTML = `<div class="form-error" role="alert">${esc(t)}</div>`; $('#form-err').scrollIntoView({ block: 'center' }); };
      const cleanChecks = [];
      for (const [i, c] of checks.entries()) {
        if (!c.q.trim() && c.options.every(o => !o.trim())) continue;
        const idx = c.options.map((o, oi) => o.trim() ? oi : -1).filter(x => x >= 0);
        if (!c.q.trim() || idx.length < 2) return fail(`Question ${i + 1} needs a question and at least two options.`);
        if (!idx.includes(c.answer)) return fail(`Question ${i + 1}: tick one of the filled-in options as the correct answer.`);
        cleanChecks.push({ q: c.q.trim(), options: idx.map(x => c.options[x].trim()), answer: idx.indexOf(c.answer), explain: c.explain.trim(), competency: $('#m-comp').value });
      }
      const ls = lessons.filter(l => l.title.trim() && l.body.trim());
      if ($('#m-title').value.trim().length < 3) return fail('Give the module a title.');
      if (!ls.length) return fail('Add at least one lesson with a title and an explanation.');
      if (cleanChecks.length < 2) return fail('Add at least two knowledge check questions.');
      const body = { title: $('#m-title').value.trim(), summary: $('#m-sum').value.trim(), competency: $('#m-comp').value, lang: $('#m-lang').value, minutes: Number($('#m-min').value) || 20, lessons: ls, exercise: { title: $('#x-title').value.trim(), prompt: $('#x-prompt').value.trim() }, checks: cleanChecks, reflection: $('#m-refl').value.trim() };
      try { if (p.id) await Edu.patch('/custom-modules/' + p.id, body); else await Edu.post('/custom-modules', body); Edu.toast('Module saved'); Edu.go('my-modules'); } catch (e) { fail(e.message); }
    };
  };

  V.marketplace = async function (p) {
    const q = (p && p.q) || '';
    const d = await Edu.get('/marketplace' + (q ? '?q=' + encodeURIComponent(q) : ''));
    Edu.render('Marketplace', `
      <div class="crumbs"><button type="button" id="crumb">Curriculum</button> / Marketplace</div>
      <div class="page-head"><div><h1>Module marketplace</h1><p class="lead">Ready made modules by FactChecker Pro on topics such as lateral reading, statistics, health, climate, elections, viral posts, scams and crisis news, in English and Dutch, plus modules shared by other teachers, journalists and researchers. Preview one, or copy it and change it for your group.</p></div></div>
      <div class="row mb"><label for="q" class="sr-only">Search</label><input id="q" type="search" placeholder="Search modules" value="${esc(q)}" style="flex:1"><button class="btn" id="go" type="button">Search</button></div>
      ${d.modules.length ? `<div class="grid">${d.modules.map(m => `<div class="card"><div class="row"><h3 class="spacer">${esc(m.title)}</h3>${m.featured ? Edu.chip('FactChecker Pro', 'purple') : ''}</div><p class="muted small">${esc(m.summary || '')}</p>
        <div class="small muted">By ${esc(m.author)} · ${m.lessons} lessons · ${m.checks} questions · ${esc(m.lang === 'nl' ? 'Dutch' : 'English')} · ${esc(Edu.compName(m.competency))}${m.minutes ? ` · ${m.minutes} min` : ''}${m.copies ? ` · copied ${m.copies}×` : ''}</div>
        <div class="row mt"><button class="btn small" type="button" data-copy="${esc(m.id)}">Copy to my modules</button><button class="btn ghost small" type="button" data-view="${esc(m.id)}">Preview</button></div></div>`).join('')}</div>` : Edu.empty('🛒', 'Nothing here yet', 'No public modules match. You can share your own from My modules.', '')}`);
    $('#crumb').onclick = () => Edu.go('modules');
    const search = () => Edu.go('marketplace', { q: $('#q').value.trim() });
    $('#go').onclick = search; $('#q').onkeydown = e => { if (e.key === 'Enter') search(); };
    $$('[data-view]').forEach(b => b.onclick = () => Edu.go('module', { id: b.dataset.view }));
    $$('[data-copy]').forEach(b => b.onclick = async () => {
      try { const out = await Edu.post('/custom-modules/copy', { source_id: b.dataset.copy }); Edu.toast('Copied to My modules'); Edu.go('module-edit', { id: out.module.id }); } catch (e) { Edu.toast(e.message, true); }
    });
  };
})();
