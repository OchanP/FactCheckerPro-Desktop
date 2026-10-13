/* FactChecker Pro Education: views used by both teachers and students.
   Onboarding, curriculum modules, competency profile and settings. */
(function () {
  'use strict';
  const { esc, $, $$ } = Edu;
  const V = Edu.views;

  // ── choose a role ──────────────────────────────────────────────────────────
  V.onboarding = async function () {
    Edu.render('Welcome', `
      <div class="welcome">
        <h1>Welcome to FactChecker Pro Education</h1>
        <p class="lead">Teach, assign, investigate, explain, assess and improve. Pick how you will use the app. You can change this later while you have no classes.</p>
        <div class="role-grid">
          <button class="role-card" type="button" data-role="teacher">
            <div class="big" aria-hidden="true">🍎</div>
            <h2>I am a teacher</h2>
            <p class="muted">Create classes, set fact-checking assignments, review student reasoning and see how skills develop.</p>
          </button>
          <button class="role-card" type="button" data-role="student">
            <div class="big" aria-hidden="true">🎓</div>
            <h2>I am a student</h2>
            <p class="muted">Join your class with a code, investigate claims, learn the skills and see your progress.</p>
          </button>
          <button class="role-card" type="button" data-role="journalist">
            <div class="big" aria-hidden="true">📰</div>
            <h2>I am a journalist</h2>
            <p class="muted">Build evidence boards, check sources, create citations and work with colleagues, without needing a class.</p>
          </button>
          <button class="role-card" type="button" data-role="researcher">
            <div class="big" aria-hidden="true">🔬</div>
            <h2>I am a researcher</h2>
            <p class="muted">Run studies with consent, groups and pre and post tests, build evidence boards and see privacy safe trends.</p>
          </button>
        </div>
        <p class="small muted mt">Your teacher only sees your work in their own classes. The app does not record your browsing. You can export or delete your education data at any time in Settings.</p>
      </div>`);
    $$('.role-card').forEach(b => b.onclick = async () => {
      const role = b.dataset.role;
      let org = null;
      if (role !== 'student') {
        const r = await Edu.dialog({
          title: 'Your school or organisation',
          body: `<div class="field"><label for="org">School, college, newsroom or organisation <span class="hint">(optional)</span></label><input id="org" type="text" maxlength="120"></div>`,
          actions: [{ label: 'Skip', value: '' }, { label: 'Continue', value: 'ok', validate: d => d.querySelector('#org').value.trim() || '' }],
        });
        if (r === null) return;
        org = r || null;
      }
      try {
        await Edu.post('/me/role', { role, org_name: org });
        await Edu.boot();
      } catch (e) { Edu.toast(e.message, true); }
    });
  };

  // ── curriculum ─────────────────────────────────────────────────────────────
  V.modules = async function () {
    const data = await Edu.get('/modules');
    const done = data.modules.filter(m => m.progress && m.progress.attempts > 0 && m.progress.best_score >= 75).length;
    Edu.render('Curriculum', `
      <div class="page-head"><div><h1>Critical-thinking curriculum</h1>
        <p class="lead">Short modules. Each has lessons, a guided practice task, a knowledge check and a reflection. ${Edu.role === 'student' ? `You have passed <b>${done}</b> of ${data.modules.length}.` : 'Preview them here and link one to an assignment.'}</p></div>
        ${['teacher', 'journalist', 'researcher'].includes(Edu.role) ? '<div class="row"><button class="btn ghost" id="go-builder" type="button">My modules</button><button class="btn ghost" id="go-market" type="button">Marketplace</button></div>' : ''}</div>
      <div class="grid">
        ${data.modules.map(m => {
          const p = m.progress;
          return `<button class="card tile" type="button" data-id="${esc(m.id)}" aria-label="${esc(m.title)}">
            <div class="row"><h3 class="spacer">${esc(m.title)}</h3>${m.custom ? Edu.chip(m.mine ? 'Mine' : 'Shared', 'purple') : ''}${p && p.attempts > 0 ? (p.best_score >= 75 ? Edu.chip('Passed ' + p.best_score + '%', 'ok', '✔') : Edu.chip('Best ' + p.best_score + '%', 'warn')) : Edu.chip('New', 'info')}</div>
            <p class="muted small">${esc(m.summary)}</p>
            <div class="row small muted mt"><span>${m.minutes} min</span><span aria-hidden="true">·</span><span>Builds: ${esc(Edu.compName(m.competency))}</span></div>
          </button>`;
        }).join('')}
      </div>`);
    $$('.tile').forEach(t => t.onclick = () => Edu.go('module', { id: t.dataset.id, classId: Edu.route.params && Edu.route.params.classId }));
    const gb = $('#go-builder'); if (gb) gb.onclick = () => Edu.go('my-modules');
    const gm = $('#go-market'); if (gm) gm.onclick = () => Edu.go('marketplace');
  };

  V.module = async function (p) {
    const data = await Edu.get('/modules/' + encodeURIComponent(p.id));
    const m = data.module;
    const canPre = !(data.progress && (data.progress.pre_score != null || data.progress.attempts > 0));
    const state = { step: canPre ? -1 : 0 };   // -1 optional pre-check, 0..lessons-1 lessons, then exercise, then check, then reflection
    const total = m.lessons.length + 3;
    const answers = new Array(m.checks.length).fill(-1);
    const preAnswers = new Array(m.checks.length).fill(-1);
    let reflection = (data.progress && data.progress.reflection) || '';
    let result = null;

    const stepTitle = () => state.step < 0 ? 'Pre-check' : state.step < m.lessons.length ? m.lessons[state.step].title : ['Guided practice', 'Knowledge check', 'Reflection'][state.step - m.lessons.length];

    function paint() {
      let body = '';
      if (state.step < 0) {
        body = `<div class="lesson"><h2>Optional pre-check</h2><p class="muted small mb">Answer ${m.checks.length} quick questions before you start so you can see how much you learn. It is not marked, and you do not see the answers yet. You can skip it.</p>
          ${m.checks.map((c, qi) => `<fieldset class="q"><legend>${qi + 1}. ${esc(c.q)}</legend><div class="opts">
            ${c.options.map((o, oi) => `<label class="radio"><input type="radio" name="q${qi}" value="${oi}" ${preAnswers[qi] === oi ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('')}</div></fieldset>`).join('')}</div>`;
      } else if (state.step < m.lessons.length) {
        const l = m.lessons[state.step];
        body = `<div class="lesson"><h2>${esc(l.title)}</h2><p>${esc(l.body)}</p>${l.example ? `<div class="example"><b>Example.</b> ${esc(l.example)}</div>` : ''}</div>`;
      } else if (state.step === m.lessons.length) {
        body = `<div class="lesson"><h2>${esc(m.exercise.title)}</h2><p>${esc(m.exercise.prompt)}</p>
          <p class="note mt">Practise this on your own with a real example. Your notes here are not saved or marked. When you have tried it, continue to the knowledge check. You can use the <button class="link" type="button" id="open-tools">classic tools</button> (Claim Check, FactNews) to find material.</p></div>`;
      } else if (state.step === m.lessons.length + 1) {
        body = `<div class="lesson"><h2>Knowledge check</h2><p class="muted small mb">Answer all ${m.checks.length} questions. You need 75% to pass. You can retry as often as you like.</p>
          ${m.checks.map((c, qi) => `<fieldset class="q"><legend>${qi + 1}. ${esc(c.q)}</legend><div class="opts">
            ${c.options.map((o, oi) => `<label class="radio"><input type="radio" name="q${qi}" value="${oi}" ${answers[qi] === oi ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('')}</div></fieldset>`).join('')}</div>`;
      } else if (!result) {
        body = `<div class="lesson"><h2>Reflection</h2><div class="field"><label for="refl">${esc(m.reflection)}</label><textarea id="refl" maxlength="3000">${esc(reflection)}</textarea></div>
          <p class="small muted">Your reflection is private to you. ${Edu.role === 'student' ? 'Your teacher does not see it unless you share it.' : ''}</p></div>`;
      } else {
        body = resultHtml();
      }
      const last = state.step === total - 1;
      Edu.render(m.title, `
        <div class="crumbs"><button type="button" id="back-mods">Curriculum</button> / ${esc(m.title)}</div>
        <div class="page-head"><div><h1>${esc(m.title)}</h1><p class="lead">${result ? 'Your result' : state.step < 0 ? 'Before you start' : `Step ${state.step + 1} of ${total}: ${esc(stepTitle())}`}</p></div></div>
        ${result ? '' : Edu.bar((Math.max(0, state.step) / total) * 100)}
        <div class="mt" id="step-body">${body}</div>
        ${result ? `<div class="row mt"><button class="btn" id="to-mods" type="button">Back to curriculum</button>${Edu.role === 'student' ? '<button class="btn ghost" id="to-profile" type="button">See my profile</button>' : ''}</div>` : `
        <div class="sticky-bar">
          ${state.step < 0 ? '<button class="btn ghost" id="skip-pre" type="button">Skip the pre-check</button>' : `<button class="btn ghost" id="prev" type="button" ${state.step === 0 ? 'disabled' : ''}>Back</button>`}
          <span class="spacer"></span>
          <button class="btn" id="next" type="button">${state.step < 0 ? 'Record my starting point' : last ? (Edu.role === 'student' ? 'Finish and save my result' : 'Finish check') : 'Continue'}</button>
        </div>`}`, { noFocus: false });
      $('#back-mods') && ($('#back-mods').onclick = () => Edu.go('modules'));
      $('#to-mods') && ($('#to-mods').onclick = () => Edu.go('modules'));
      $('#to-profile') && ($('#to-profile').onclick = () => Edu.go('profile'));
      $('#open-tools') && ($('#open-tools').onclick = () => fc.runtime.sendMessage({ type: 'FC_OPEN_HUB' }));
      if (result) return;
      if (state.step < 0) {
        $('#skip-pre').onclick = () => { state.step = 0; paint(); };
        $('#next').onclick = async () => {
          capture();
          if (preAnswers.some(a => a < 0)) { Edu.toast('Answer every question or skip the pre-check.', true); return; }
          try { await Edu.post('/modules/' + encodeURIComponent(m.id) + '/pretest', { answers: preAnswers }); Edu.toast('Starting point recorded.'); state.step = 0; paint(); } catch (e) { Edu.toast(e.message, true); }
        };
        return;
      }
      $('#prev').onclick = () => { capture(); state.step--; paint(); };
      $('#next').onclick = async () => {
        capture();
        if (state.step === m.lessons.length + 1 && answers.some(a => a < 0)) { Edu.toast('Answer every question before you continue.', true); return; }
        if (!last) { state.step++; paint(); return; }
        try {
          result = await Edu.post('/modules/' + encodeURIComponent(m.id) + '/complete', { answers, reflection, class_id: p.classId || null });
          paint();
          (result.badges || []).forEach(b => Edu.toast('New badge: ' + b.name));
        } catch (e) { Edu.toast(e.message, true); }
      };
    }
    function capture() {
      $$('input[type=radio]').forEach(r => { if (r.checked) (state.step < 0 ? preAnswers : answers)[Number(r.name.slice(1))] = Number(r.value); });
      const t = $('#refl'); if (t) reflection = t.value;
    }
    function resultHtml() {
      const pass = result.score >= 75;
      return `<div class="note ${pass ? 'ok' : 'warn'}" role="status"><b>${pass ? 'Passed' : 'Not yet'}: ${result.right} of ${result.total} correct (${result.score}%).</b> ${pass ? 'Well done. This counts towards your competency profile.' : 'Read the explanations below and try again. Your best score is kept.'}</div>
        <div class="mt">${result.feedback.map((f, i) => `<div class="card"><h3>${i + 1}. ${esc(f.question)}</h3>
          <p>${f.correct ? Edu.chip('Correct', 'ok', '✔') : Edu.chip('Incorrect', 'bad', '✖')}
          ${f.picked >= 0 ? ` Your answer: ${esc(m.checks[i].options[f.picked])}` : ''}</p>
          ${f.correct ? '' : `<p class="small"><b>Correct answer:</b> ${esc(m.checks[i].options[f.correctIndex])}</p>`}
          <p class="small muted mt">${esc(f.explanation)}</p></div>`).join('')}</div>
        ${(result.badges || []).length ? `<div class="note ok mt">New badge earned: ${result.badges.map(b => esc(b.name)).join(', ')}</div>` : ''}`;
    }
    paint();
  };

  // ── competency profile (student) ───────────────────────────────────────────
  V.profile = async function () {
    const [prof, me] = await Promise.all([Edu.get('/competencies/me'), Edu.get('/me')]);
    Edu.me = me;
    Edu.render('My profile', `
      <div class="page-head"><div><h1>My competency profile</h1><p class="lead">${esc(prof.note)}</p></div></div>
      <div class="card">
        <h2>Four core skills</h2>
        ${prof.competencies.map(c => `
          <div class="comp">
            <div><b>${esc(c.name)}</b><div class="small muted">${esc(c.blurb)}</div></div>
            <div>${c.current == null ? '<span class="muted">Complete a module or an investigation to measure this.</span>' : `${Edu.bar(c.current)}<div class="small mt"><b>${esc(c.level)}</b>, ${c.current} out of 100${c.change != null ? `, ${c.change >= 0 ? 'up' : 'down'} ${Math.abs(c.change)} since you started` : ''}</div>`}</div>
            <div class="row">${Edu.sparkline(c.history)}<span class="small muted">${c.evidence_count} result${c.evidence_count === 1 ? '' : 's'}</span></div>
          </div>`).join('')}
      </div>
      <div class="grid mt">
        <div class="card"><h2>Curriculum</h2><p><b>${prof.modules_done}</b> of ${prof.modules_total} modules passed.</p>
          ${prof.recommended_modules.length ? `<p class="small muted mt">Suggested next:</p><div class="row mt">${prof.recommended_modules.map(r => `<button class="btn ghost small" type="button" data-mod="${esc(r.id)}">${esc(r.title)}</button>`).join('')}</div>` : '<p class="small muted mt">You have passed every module so far.</p>'}</div>
        <div class="card"><h2>Badges</h2>${me.badges.length ? `<ul class="stack" style="list-style:none">${me.badges.map(b => `<li><b>🏅 ${esc(b.name)}</b><div class="small muted">${esc(b.desc || '')}</div></li>`).join('')}</ul>` : '<p class="muted">Badges are earned by showing real skill, for example passing a module or building strong evidence. None earned yet.</p>'}</div>
        <div class="card"><h2>Teacher feedback</h2>${prof.teacher_feedback.length ? `<ul class="stack" style="list-style:none">${prof.teacher_feedback.map(f => `<li><b>${esc(f.title)}</b><div class="small muted">${Edu.fmtDate(f.reviewed_at)}</div><p>${esc(f.feedback)}</p></li>`).join('')}</ul>` : '<p class="muted">Feedback from your teacher will show here after they review your work.</p>'}</div>
      </div>`);
    $$('[data-mod]').forEach(b => b.onclick = () => Edu.go('module', { id: b.dataset.mod }));
  };

  // ── settings and privacy ───────────────────────────────────────────────────
  V.settings = async function () {
    const me = await Edu.get('/me'); Edu.me = me;
    const p = me.profile || {};
    Edu.render('Settings', `
      <div class="page-head"><div><h1>Settings and privacy</h1><p class="lead">Display options, and control over your own education data.</p></div></div>
      <div class="card"><h2>Display</h2>
        <div class="cols2">
          <div class="field"><label for="scale">Text size: <span id="scale-val">${p.text_scale || 100}</span>%</label><input id="scale" type="range" min="85" max="160" step="5" value="${p.text_scale || 100}" style="width:100%"></div>
          <div class="field"><label class="radio"><input id="hc" type="checkbox" ${p.high_contrast ? 'checked' : ''}> <span><b>High contrast</b><br><span class="muted small">Stronger borders and plain colours.</span></span></label></div>
        </div>
        <div class="field"><label for="lang">Language</label><select id="lang"><option value="en" ${Edu.lang === 'en' ? 'selected' : ''}>English</option><option value="nl" ${Edu.lang === 'nl' ? 'selected' : ''}>Nederlands</option></select></div>
        <p class="small muted">Keyboard: use <kbd>Tab</kbd> to move, <kbd>Enter</kbd> or <kbd>Space</kbd> to activate. Press <kbd>Esc</kbd> to close a dialog.</p>
      </div>
      <div class="card"><h2>Your account</h2>
        <p><b>${esc(me.user.username)}</b> (${esc(me.user.email || '')})</p>
        <p class="muted small">Role: ${esc(p.role || 'not chosen')}${p.org_name ? ' at ' + esc(p.org_name) : ''}</p>
        ${p.role && !['teacher', 'student', 'journalist', 'researcher'].includes(p.role) ? '' : '<div class="row mt"><button class="btn ghost small" id="switch-role" type="button">Change my role</button></div>'}
      </div>
      <div class="card"><h2>Your data</h2>
        <p class="muted">What the education app stores about you: your role, the classes you belong to, ${Edu.role === 'student' ? 'your submitted work, module results, competency scores and badges' : Edu.role === 'teacher' ? 'the classes and assignments you create' : 'your evidence boards, modules and studies'}. It does not record your browsing history. ${Edu.role === 'teacher' ? 'Each class has its own retention period after which submitted work is removed automatically.' : Edu.role === 'student' ? 'Your teacher decides how long submitted work is kept, between 30 days and 5 years.' : 'Study responses follow the retention period set in the study consent text.'}</p>
        <div class="row mt"><button class="btn ghost" id="export" type="button">Download my education data</button>
        <button class="btn danger" id="wipe" type="button">Delete my education data</button></div>
        <p class="small muted mt">Deleting removes ${Edu.role === 'teacher' ? 'your classes, assignments and student submissions in them' : 'your class memberships, submissions, results and badges'}. Your FactChecker Pro account stays.</p>
      </div>`);
    const save = async () => {
      const scale = Number($('#scale').value), hc = $('#hc').checked;
      Edu.applyDisplay(scale, hc);
      try { await Edu.patch('/me/settings', { text_scale: scale, high_contrast: hc }); } catch (e) { Edu.toast(e.message, true); }
    };
    $('#scale').oninput = () => { $('#scale-val').textContent = $('#scale').value; Edu.applyDisplay($('#scale').value, $('#hc').checked); };
    $('#scale').onchange = save; $('#hc').onchange = save;
    $('#lang').onchange = e => Edu.setLang(e.target.value);
    $('#switch-role').onclick = async () => {
      const r = await Edu.dialog({ title: 'Change my role', body: '<p class="muted small">You can only change your role while you have no classes. A role changes which tools you see.</p><div class="field"><label for="nr">New role</label><select id="nr"><option value="teacher">Teacher</option><option value="student">Student</option><option value="journalist">Journalist</option><option value="researcher">Researcher</option></select></div>', actions: [{ label: 'Cancel', value: null }, { label: 'Change role', value: 'ok', validate: d => d.querySelector('#nr').value }] });
      if (!r) return;
      try { await Edu.post('/me/role', { role: r }); await Edu.boot(); } catch (e) { Edu.toast(e.message, true); }
    };
    $('#export').onclick = async () => {
      try { const d = await Edu.get('/me/export'); await Edu.saveFile('factchecker-education-data.json', JSON.stringify(d, null, 2)); } catch (e) { Edu.toast(e.message, true); }
    };
    $('#wipe').onclick = async () => {
      if (!(await Edu.confirmTyped('Delete my education data', 'This cannot be undone. Your education data will be removed.', 'DELETE'))) return;
      try { await Edu.del('/me', { confirm: 'DELETE' }); Edu.toast('Your education data was deleted.'); await Edu.boot(); } catch (e) { Edu.toast(e.message, true); }
    };
  };

  V.help = async function () {
    Edu.render('Help', `
      <div class="page-head"><div><h1>How it works</h1><p class="lead">The learning loop: Teach, Assign, Investigate, Explain, Assess, Improve.</p></div></div>
      <div class="grid">
        <div class="card"><h2>1. Teach</h2><p class="muted">Five curriculum modules cover sources, claims, bias, AI-generated content and images and video.</p></div>
        <div class="card"><h2>2. Assign</h2><p class="muted">Teachers set an article, site, image, video or claim, choose the claims to check and set a deadline and AI-use rule.</p></div>
        <div class="card"><h2>3. Investigate</h2><p class="muted">Students find evidence for and against, rate each source, record confidence and reach a conclusion.</p></div>
        <div class="card"><h2>4. Explain</h2><p class="muted">Students explain their reasoning and say whether they used AI and how they checked it.</p></div>
        <div class="card"><h2>5. Assess</h2><p class="muted">The app shows advisory process scores with reasons. The teacher gives the rubric scores and feedback. Nothing here sets a grade.</p></div>
        <div class="card"><h2>6. Improve</h2><p class="muted">Competency profiles show strengths and what to practise next.</p></div>
      </div>
      <div class="card mt"><h2>Fairness and privacy</h2>
        <ul class="stack" style="padding-left:1.2rem">
          <li>Scores describe process (evidence, sources, reasoning). They are advisory and always explained.</li>
          <li>The FactChecker Pro analysis of a claim stays hidden until the student has submitted their own conclusion.</li>
          <li>Teachers only see their own classes. Reports show assignment work, never browsing history.</li>
          <li>AI-detection style flags are never used as proof. Disclosure is built into the assignment instead.</li>
        </ul></div>`);
  };
})();
