/* FactChecker Pro Education: teacher views.
   Dashboard, classes, assignments, submission review, class reports. */
(function () {
  'use strict';
  const { esc, $, $$ } = Edu;
  const V = Edu.views;

  const LEVEL_LABELS = { secondary: 'Secondary school', vocational: 'Vocational education', undergraduate: 'Undergraduate', postgraduate: 'Postgraduate', teacher_training: 'Teacher training' };
  const POLICY_LABELS = { allowed: 'AI tools allowed', disclose: 'AI allowed if disclosed', not_allowed: 'No AI tools' };
  const SOURCE_LABELS = { article: 'News article', website: 'Website', image: 'Image', video: 'Video', claim: 'Single claim', social_post: 'Social media post', document: 'Document' };
  const RUBRIC = ['Not shown', 'Emerging', 'Developing', 'Secure', 'Excellent'];

  // ── dashboard ──────────────────────────────────────────────────────────────
  V.home = async function () {
    if (Edu.role === 'student') return V.studentHome();
    if (Edu.role === 'journalist') return V.boards();
    if (Edu.role === 'researcher') return V.studies();
    const data = await Edu.get('/classes');
    const active = data.classes.filter(c => !c.archived);
    const toReview = active.reduce((a, c) => a + c.to_review, 0);
    const students = active.reduce((a, c) => a + c.students, 0);
    Edu.render('Teacher dashboard', `
      <div class="page-head">
        <div><h1>Teacher dashboard</h1><p class="lead">Your classes, work waiting for review, and the curriculum.</p></div>
        <button class="btn" id="new-class" type="button">+ New class</button>
      </div>
      <div class="stats">
        <div class="card stat"><b>${active.length}</b><span class="muted small">Active classes</span></div>
        <div class="card stat"><b>${students}</b><span class="muted small">Students</span></div>
        <div class="card stat"><b>${toReview}</b><span class="muted small">Submissions to review</span></div>
      </div>
      ${toReview ? `<div class="note warn mb" role="status"><b>${toReview} submission${toReview === 1 ? '' : 's'}</b> waiting for your review. Open a class to see them.</div>` : ''}
      ${data.classes.length ? `<div class="grid">${data.classes.map(c => `
        <button class="card tile" type="button" data-class="${esc(c.id)}" aria-label="Open class ${esc(c.name)}">
          <div class="row"><h3 class="spacer">${esc(c.name)}</h3>${c.archived ? Edu.chip('Archived') : ''}${c.to_review ? Edu.chip(c.to_review + ' to review', 'warn', '✎') : ''}</div>
          <p class="muted small">${esc([c.subject, LEVEL_LABELS[c.level]].filter(Boolean).join(' · ') || 'No subject set')}</p>
          <div class="row small mt"><span>${c.students} student${c.students === 1 ? '' : 's'}</span><span aria-hidden="true">·</span><span>${c.assignments} assignment${c.assignments === 1 ? '' : 's'}</span></div>
          <div class="small muted mt">Join code <b style="letter-spacing:.15em">${esc(c.join_code)}</b></div>
        </button>`).join('')}</div>` :
        Edu.empty('🏫', 'Create your first class', 'A class gets a join code. Students enter it to join. Then you can set a first assignment.', '<button class="btn" id="new-class-2" type="button">Create a class</button>')}
      <div class="card mt"><h2>Not sure where to start?</h2>
        <p class="muted">Try the curriculum yourself first, then create a class and set a short assignment on one claim from today's news. Ten minutes is enough.</p>
        <div class="row mt"><button class="btn ghost" id="see-mods" type="button">Preview the curriculum</button><button class="btn ghost" id="see-help" type="button">How the app works</button></div></div>`);
    $$('[data-class]').forEach(t => t.onclick = () => Edu.go('class', { id: t.dataset.class }));
    ['new-class', 'new-class-2'].forEach(id => { const b = document.getElementById(id); if (b) b.onclick = createClassDialog; });
    $('#see-mods').onclick = () => Edu.go('modules');
    $('#see-help').onclick = () => Edu.go('help');
  };

  V.classes = V.home;

  async function createClassDialog() {
    const lv = Object.entries(LEVEL_LABELS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    const r = await Edu.dialog({
      title: 'New class',
      body: `<div class="field"><label for="cn">Class name</label><input id="cn" type="text" maxlength="120" placeholder="For example: Media Literacy 1A"></div>
        <div class="cols2"><div class="field"><label for="cs">Subject <span class="hint">(optional)</span></label><input id="cs" type="text" maxlength="120"></div>
        <div class="field"><label for="cl">Level</label><select id="cl"><option value="">Not set</option>${lv}</select></div></div>
        <div class="field"><label for="cr">Keep submitted work for</label><select id="cr"><option value="90">90 days</option><option value="180">6 months</option><option value="365" selected>1 year</option><option value="730">2 years</option></select></div>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Create class', value: 'ok', validate: d => {
        const name = d.querySelector('#cn').value.trim();
        if (name.length < 2) { d.querySelector('#cn').focus(); return false; }
        return { name, subject: d.querySelector('#cs').value.trim(), level: d.querySelector('#cl').value, retention_days: Number(d.querySelector('#cr').value) };
      } }],
    });
    if (!r) return;
    try {
      const out = await Edu.post('/classes', r);
      Edu.toast('Class created. Share the join code with your students.');
      Edu.go('class', { id: out.class.id });
    } catch (e) { Edu.toast(e.message, true); }
  }

  // ── one class ──────────────────────────────────────────────────────────────
  V.class = async function (p) {
    const tab = p.tab || 'assignments';
    const [cd, ad] = await Promise.all([Edu.get('/classes/' + p.id), Edu.get('/classes/' + p.id + '/assignments')]);
    const c = cd.class;
    const head = `
      <div class="crumbs"><button type="button" id="crumb-home">Dashboard</button> / ${esc(c.name)}</div>
      <div class="page-head">
        <div><h1>${esc(c.name)}</h1><p class="lead">${esc([c.subject, LEVEL_LABELS[c.level]].filter(Boolean).join(' · '))}</p></div>
        <div class="row"><span class="small muted">Join code</span><span class="code-box" aria-label="Join code ${esc(c.join_code.split('').join(' '))}">${esc(c.join_code)}</span>
          <button class="btn ghost small" id="copy-code" type="button">Copy</button></div>
      </div>
      <div class="tabs" role="tablist" aria-label="Class sections">
        ${[['assignments', 'Assignments'], ['students', 'Students (' + cd.students.length + ')'], ['boards', 'Boards and groups'], ['report', 'Progress report'], ...(c.is_owner === false ? [] : [['settings', 'Class settings']])].map(([k, l]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}
      </div>
      <div id="tab-body"></div>`;
    Edu.render(c.name, head);
    $('#crumb-home').onclick = () => Edu.go('home');
    $('#copy-code').onclick = () => { navigator.clipboard.writeText(c.join_code).then(() => Edu.toast('Join code copied'), () => Edu.toast(c.join_code)); };
    $$('[data-tab]').forEach(b => b.onclick = () => Edu.go('class', { id: p.id, tab: b.dataset.tab }));
    const body = $('#tab-body');
    if (tab === 'assignments') return tabAssignments(body, c, ad.assignments);
    if (tab === 'students') return tabStudents(body, c, cd.students);
    if (tab === 'boards') return tabBoards(body, c, cd.students);
    if (tab === 'report') return tabReport(body, c);
    return tabSettings(body, c);
  };

  function tabAssignments(body, c, list) {
    body.innerHTML = `
      <div class="row mb"><h2 class="spacer" style="margin:0">Assignments</h2><button class="btn" id="new-asg" type="button">+ New assignment</button></div>
      ${list.length ? `<div class="tbl-wrap card" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Assignments in ${esc(c.name)}</caption>
        <thead><tr><th scope="col">Title</th><th scope="col">Type</th><th scope="col">Deadline</th><th scope="col">Submitted</th><th scope="col">Reviewed</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${list.map(a => { const d = Edu.dueInfo(a.due_at); return `<tr>
          <td><b>${esc(a.title)}</b> ${a.published ? '' : Edu.chip('Draft, hidden from students', 'warn')}<div class="small muted">${a.claim_count} claim${a.claim_count === 1 ? '' : 's'}</div></td>
          <td>${esc(SOURCE_LABELS[a.source_type] || a.source_type)}</td>
          <td>${Edu.chip(d.text, d.cls)}</td>
          <td>${a.submitted} of ${a.students}</td><td>${a.reviewed} of ${a.submitted}</td>
          <td class="row"><button class="btn small" type="button" data-open="${esc(a.id)}">Open</button>
            <button class="btn ghost small" type="button" data-edit="${esc(a.id)}">Edit</button>
            <button class="btn ghost small" type="button" data-dup="${esc(a.id)}">Copy</button></td></tr>`; }).join('')}</tbody></table></div>` :
        Edu.empty('📝', 'No assignments yet', 'Create an assignment around an article, image, video or claim.', '')}`;
    $('#new-asg').onclick = () => Edu.go('assignment-edit', { classId: c.id });
    $$('[data-open]', body).forEach(b => b.onclick = () => Edu.go('assignment', { id: b.dataset.open, classId: c.id }));
    $$('[data-edit]', body).forEach(b => b.onclick = () => Edu.go('assignment-edit', { id: b.dataset.edit, classId: c.id }));
    $$('[data-dup]', body).forEach(b => b.onclick = async () => {
      try { const r = await Edu.post('/assignments/' + b.dataset.dup + '/duplicate', {}); Edu.toast('Copied as a hidden draft. Edit it and publish when ready.'); Edu.go('assignment-edit', { id: r.assignment.id, classId: c.id }); } catch (e) { Edu.toast(e.message, true); }
    });
  }

  function tabStudents(body, c, students) {
    body.innerHTML = `
      <div class="row mb"><h2 class="spacer" style="margin:0">Students</h2>${c.is_owner === false ? '' : '<button class="btn ghost" id="import" type="button">Import a roster</button>'}<button class="btn ghost" id="gradebook" type="button">Gradebook CSV</button></div>
      <div class="note mb">Students join by entering the code <b>${esc(c.join_code)}</b> in their app under <b>Join a class</b>. If the code is shared more widely than you want, regenerate it in Class settings.</div>
      ${students.length ? `<div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Students in ${esc(c.name)}</caption>
        <thead><tr><th scope="col">Student</th><th scope="col">Joined</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${students.map(s => `<tr><td><b>${esc(s.display_name || s.username)}</b><div class="small muted">@${esc(s.username)}</div></td><td>${Edu.fmtDate(s.joined_at)}</td>
          <td class="row"><button class="btn small ghost" type="button" data-prof="${esc(s.id)}">Skills profile</button>${c.is_owner === false ? '' : `<button class="btn small ghost" type="button" data-cert="${esc(s.id)}" data-name="${esc(s.display_name || s.username)}">Certificate</button><button class="btn small ghost" type="button" data-rm="${esc(s.id)}" data-name="${esc(s.display_name || s.username)}">Remove</button>`}</td></tr>`).join('')}</tbody></table></div>` :
        Edu.empty('🎓', 'No students yet', 'Share the join code. They will appear here.', '')}`;
    $$('[data-prof]', body).forEach(b => b.onclick = () => Edu.go('student-profile', { classId: c.id, userId: b.dataset.prof }));
    const imp = $('#import', body); if (imp) imp.onclick = async () => {
      const r = await Edu.dialog({ title: 'Import a roster', body: `<p class="small muted">Paste one student email address per line, or a column copied from a spreadsheet. People with an account join now. The others are invited and join when they sign up with that address.</p><div class="field"><label for="emails">Email addresses</label><textarea id="emails" style="min-height:9rem"></textarea></div>`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Import', value: 'ok', validate: dd => { const l = dd.querySelector('#emails').value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean); return l.length ? l : false; } }] });
      if (!r) return;
      try {
        const o = await Edu.post('/classes/' + c.id + '/import-roster', { emails: r });
        await Edu.dialog({ title: 'Roster imported', body: `<ul class="stack"><li>Added now: <b>${o.added}</b></li><li>Invited: <b>${o.invited}</b></li><li>Already in the class or invited: <b>${o.already}</b></li><li>Not added because they are not students: <b>${o.skipped.length}</b>${o.skipped.length ? ' (' + o.skipped.map(esc).join(', ') + ')' : ''}</li><li>Not valid email addresses: <b>${o.invalid}</b></li></ul><p class="small muted">${esc(o.note)}</p>`, actions: [{ label: 'OK', value: true }] });
        Edu.go('class', { id: c.id, tab: 'students' });
      } catch (e) { Edu.toast(e.message, true); }
    };
    $('#gradebook', body).onclick = async () => {
      try {
        const g = await Edu.get('/classes/' + c.id + '/gradebook');
        const head = ['Student', 'Username', 'Email', ...g.assignments.flatMap(a => [a.title + ' (status)', a.title + ' (reviewed %)', a.title + ' (late)'])];
        const rows = g.rows.map(r => [r.student, r.username, r.email, ...g.assignments.flatMap(a => { const x = r.assignments[a.id]; return [x.status, x.reviewed_percent, x.late ? 'yes' : '']; })]);
        await Edu.saveFile((c.name.replace(/[^\w\- ]/g, '') || 'class') + '-gradebook.csv', '\ufeff' + Edu.csv([head, ...rows]));
      } catch (e) { Edu.toast(e.message, true); }
    };
    $$('[data-cert]', body).forEach(b => b.onclick = async () => {
      const t = await Edu.prompt('Certificate for ' + b.dataset.name, 'Title of the certificate', '', 'for example Best source evaluation');
      if (!t) return;
      try { await Edu.post('/classes/' + c.id + '/credentials', { user_id: b.dataset.cert, title: t }); Edu.toast('Certificate issued'); } catch (e) { Edu.toast(e.message, true); }
    });
    $$('[data-rm]', body).forEach(b => b.onclick = async () => {
      if (!(await Edu.confirm('Remove student', `Remove ${b.dataset.name} from ${c.name}? Their work stays in the class records until the retention period ends.`, 'Remove', true))) return;
      try { await Edu.del('/classes/' + c.id + '/members/' + b.dataset.rm); Edu.go('class', { id: c.id, tab: 'students' }); } catch (e) { Edu.toast(e.message, true); }
    });
  }

  async function tabBoards(body, c, students) {
    body.innerHTML = '<div class="loading" role="status">Loading</div>';
    const [g, b] = await Promise.all([Edu.get('/classes/' + c.id + '/groups'), Edu.get('/classes/' + c.id + '/boards')]);
    body.innerHTML = `
      <div class="row mb"><h2 class="spacer" style="margin:0">Groups</h2>${c.is_owner === false ? '' : '<button class="btn" id="new-group" type="button">+ New group</button>'}</div>
      <p class="muted small">Make groups for team investigations. Then open an assignment and create team boards: every group gets one shared evidence board per claim.</p>
      ${g.groups.length ? `<div class="grid">${g.groups.map(x => `<div class="card"><div class="row"><h3 class="spacer">${esc(x.name)}</h3>${c.is_owner === false ? '' : `<button class="btn ghost small" type="button" data-rmg="${esc(x.id)}">Remove</button>`}</div><p class="small">${x.members.length ? x.members.map(m => esc(m.name)).join(', ') : 'No members'}</p></div>`).join('')}</div>` : '<p class="muted">No groups yet.</p>'}
      <h2 class="mt">Boards in this class</h2>
      ${b.boards.length ? `<div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Class boards</caption><thead><tr><th scope="col">Board</th><th scope="col">Owner or group</th><th scope="col">Evidence</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead>
        <tbody>${b.boards.map(x => `<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.group_name || x.owner_name || x.owner_username)}</td><td>${x.items}</td><td>${x.status === 'reviewed' ? Edu.chip('Reviewed', 'ok', '✔') : x.status === 'submitted' ? Edu.chip('To review', 'warn', '✎') : Edu.chip('Open')}</td><td><button class="btn small" type="button" data-open="${esc(x.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No boards yet.</p>'}`;
    const ng = $('#new-group', body); if (ng) ng.onclick = async () => {
      const r = await Edu.dialog({ title: 'New group', body: `<div class="field"><label for="g-n">Group name</label><input id="g-n" type="text" maxlength="80"></div><fieldset class="field" style="border:0;padding:0"><legend>Members</legend>${students.map(s => `<label class="radio"><input type="checkbox" name="gm" value="${esc(s.id)}"> <span>${esc(s.display_name || s.username)}</span></label>`).join('') || '<p class="muted small">No students yet.</p>'}</fieldset>`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Create group', value: 'ok', validate: dd => { const n = dd.querySelector('#g-n').value.trim(); if (!n) { dd.querySelector('#g-n').focus(); return false; } return { name: n, member_ids: [...dd.querySelectorAll('input[name=gm]:checked')].map(x => x.value) }; } }] });
      if (!r) return;
      try { await Edu.post('/classes/' + c.id + '/groups', r); Edu.go('class', { id: c.id, tab: 'boards' }); } catch (e) { Edu.toast(e.message, true); }
    };
    $$('[data-rmg]', body).forEach(x => x.onclick = async () => { try { await Edu.del('/classes/' + c.id + '/groups/' + x.dataset.rmg); Edu.go('class', { id: c.id, tab: 'boards' }); } catch (e) { Edu.toast(e.message, true); } });
    $$('[data-open]', body).forEach(x => x.onclick = () => Edu.go('board', { id: x.dataset.open }));
  }

  async function tabReport(body, c) {
    body.innerHTML = '<div class="loading" role="status">Building the report</div>';
    const rep = await Edu.get('/classes/' + c.id + '/report');
    const s = rep.summary;
    const names = Edu.ref.competencies;
    body.innerHTML = `
      <div class="row mb"><h2 class="spacer" style="margin:0">Progress report</h2><button class="btn" id="dl-csv" type="button">Download CSV</button><button class="btn ghost" id="print" type="button">Print</button></div>
      <div class="stats">
        <div class="card stat"><b>${s.students}</b><span class="muted small">Students</span></div>
        <div class="card stat"><b>${s.assignments}</b><span class="muted small">Published assignments</span></div>
        <div class="card stat"><b>${s.average_completion_percent}%</b><span class="muted small">Average completion</span></div>
      </div>
      ${s.common_difficulty ? `<div class="note mb"><b>Common area to revisit:</b> ${esc(s.common_difficulty)} has the lowest class average. Consider a short lesson or the matching curriculum module.</div>` : ''}
      <div class="card"><h3>Class averages by competency</h3>
        ${names.map(n => `<div class="comp"><div><b>${esc(n.name)}</b></div><div>${s.competency_averages[n.key] == null ? '<span class="muted small">Not measured yet</span>' : Edu.bar(s.competency_averages[n.key])}</div><div class="small">${s.competency_averages[n.key] == null ? '' : s.competency_averages[n.key] + ' of 100'}</div></div>`).join('')}
      </div>
      <div class="card mt tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Per student progress</caption>
        <thead><tr><th scope="col">Student</th><th scope="col">Submitted</th><th scope="col">Late</th><th scope="col">Modules passed</th>${names.map(n => `<th scope="col">${esc(n.name)}</th>`).join('')}</tr></thead>
        <tbody>${rep.rows.length ? rep.rows.map(r => `<tr><td><b>${esc(r.student)}</b></td><td>${r.submitted} of ${r.assigned} (${r.completion_percent}%)</td><td>${r.late}</td><td>${r.modules_passed} of 5</td>${names.map(n => `<td>${r[n.key] == null ? '<span class="muted">n/a</span>' : r[n.key]}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="9" class="muted">No students yet.</td></tr>'}</tbody></table></div>
      <p class="small muted mt">Competency numbers are the average of each student's latest results (0 to 100). They are advisory process indicators, not grades. The report shows assignment work only and no browsing history.</p>`;
    try {
      const pp = await Edu.get('/classes/' + c.id + '/prepost');
      const box = document.createElement('div');
      box.className = 'card mt';
      box.innerHTML = `<h3>Before and after the modules</h3>${pp.rows.length ? `<table class="tbl"><thead><tr><th scope="col">Module</th><th scope="col">Students</th><th scope="col">Pre-check</th><th scope="col">Best result</th><th scope="col">Gain</th></tr></thead><tbody>${pp.rows.map(r => `<tr><td>${esc(r.title)}</td><td>${r.students}</td><td>${r.suppressed ? '<span class="muted">hidden</span>' : r.pre}</td><td>${r.suppressed ? '<span class="muted">hidden</span>' : r.post}</td><td>${r.suppressed ? '' : (r.gain >= 0 ? '+' : '') + r.gain}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Students can take an optional pre-check before a module. Results show here once three or more have done so.</p>'}<p class="small muted mt">${esc(pp.note)}</p>`;
      body.appendChild(box);
    } catch (_) { /* optional section */ }
    $('#dl-csv').onclick = () => {
      const head = ['Student', 'Username', 'Assignments published', 'Submitted', 'Reviewed', 'Late', 'Completion %', 'Modules passed (of 5)', ...names.map(n => n.name + ' (0-100)')];
      const rows = rep.rows.map(r => [r.student, r.username, r.assigned, r.submitted, r.reviewed, r.late, r.completion_percent, r.modules_passed, ...names.map(n => r[n.key])]);
      Edu.saveFile((c.name.replace(/[^\w\- ]/g, '') || 'class') + '-progress-report.csv', '﻿' + Edu.csv([head, ...rows]));
    };
    $('#print').onclick = () => window.print();
  }

  function tabSettings(body, c) {
    const lv = Object.entries(LEVEL_LABELS).map(([k, v]) => `<option value="${k}" ${c.level === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
    body.innerHTML = `
      <div class="card"><h2>Class details</h2>
        <div class="field"><label for="s-name">Class name</label><input id="s-name" type="text" maxlength="120" value="${esc(c.name)}"></div>
        <div class="cols2"><div class="field"><label for="s-sub">Subject</label><input id="s-sub" type="text" maxlength="120" value="${esc(c.subject || '')}"></div>
        <div class="field"><label for="s-lvl">Level</label><select id="s-lvl"><option value="">Not set</option>${lv}</select></div></div>
        <div class="field"><label for="s-ret">Keep submitted work for</label><select id="s-ret">${[[90, '90 days'], [180, '6 months'], [365, '1 year'], [730, '2 years'], [1825, '5 years']].map(([d, l]) => `<option value="${d}" ${c.retention_days === d ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <div class="small muted mt">After this time submitted work is deleted automatically. Competency scores stay on the student's own profile until they delete them.</div></div>
        <div class="row"><button class="btn" id="s-save" type="button">Save changes</button></div></div>
      <div class="card"><h2>Join code</h2><p class="muted">Anyone with the code can join as a student. Regenerate it to stop more people joining. Students already in the class stay.</p>
        <div class="row"><span class="code-box">${esc(c.join_code)}</span><button class="btn ghost" id="s-regen" type="button">Make a new code</button></div></div>
      <div class="card"><h2>${c.archived ? 'Unarchive' : 'Archive'} this class</h2><p class="muted">Archived classes are read only and do not accept new students.</p>
        <button class="btn ghost" id="s-arch" type="button">${c.archived ? 'Unarchive class' : 'Archive class'}</button></div>
      <div class="card"><h2>Delete this class</h2><p class="muted">Removes the class, its assignments and all student submissions in it. This cannot be undone.</p>
        <button class="btn danger" id="s-del" type="button">Delete class</button></div>
      <div class="card"><h2>Institution</h2><p class="muted">Attach this class to a unit of your institution. Its reports then include this class and the institution's retention limit applies.</p><div id="inst-box"><div class="loading" role="status">Loading</div></div></div>
      <div class="card"><h2>Learning platform</h2><div id="lms-box"></div></div>
      <div class="card"><h2>Teaching assistants</h2><p class="muted">Assistants can see the roster, submissions and reports, and review work. They cannot change the class or its assignments.</p><div id="staff-box"><div class="loading" role="status">Loading</div></div></div>`;
    if (Edu.lmsClassBox) Edu.lmsClassBox($('#lms-box'), c);
    (async () => {
      try {
        const [insts, staff] = await Promise.all([Edu.get('/institutions'), Edu.get('/classes/' + c.id + '/staff')]);
        const mine = insts.institutions.filter(i => ['inst_admin', 'faculty_admin', 'teacher', 'ta'].includes(i.role));
        const units = {};
        for (const i of mine) { try { units[i.id] = (await Edu.get('/institutions/' + i.id)).units; } catch (_) { units[i.id] = []; } }
        $('#inst-box').innerHTML = mine.length ? `<div class="cols2"><div class="field"><label for="i-sel">Institution</label><select id="i-sel"><option value="">None</option>${mine.map(i => `<option value="${esc(i.id)}" ${c.institution_id === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="u-sel">Unit</label><select id="u-sel"></select></div></div><button class="btn" id="i-save" type="button">Save</button>` : '<p class="muted small">You are not in an institution. Create or join one under Institution.</p>';
        if (mine.length) {
          const fill = () => { const id = $('#i-sel').value; $('#u-sel').innerHTML = '<option value="">No unit</option>' + (units[id] || []).map(u => `<option value="${esc(u.id)}" ${c.unit_id === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join(''); };
          fill(); $('#i-sel').onchange = fill;
          $('#i-save').onclick = async () => { try { const r = await Edu.post('/classes/' + c.id + '/institution', { institution_id: $('#i-sel').value || null, unit_id: $('#u-sel').value || null }); Edu.toast('Saved' + (r.retention_days ? '. Retention is now ' + r.retention_days + ' days at most.' : '')); Edu.go('class', { id: c.id, tab: 'settings' }); } catch (e) { Edu.toast(e.message, true); } };
        }
        $('#staff-box').innerHTML = `${staff.staff.length ? `<ul class="stack" style="list-style:none;padding:0">${staff.staff.map(x => `<li>${esc(x.name)} <button class="btn ghost small" type="button" data-rms="${esc(x.user_id)}">Remove</button></li>`).join('')}</ul>` : '<p class="muted small">None yet.</p>'}<button class="btn ghost" id="add-staff" type="button">+ Add an assistant</button>`;
        $('#add-staff').onclick = async () => { const v = await Edu.prompt('Add a teaching assistant', 'Username or email', '', 'they need a teacher account'); if (!v) return; try { await Edu.post('/classes/' + c.id + '/staff', { identifier: v }); Edu.go('class', { id: c.id, tab: 'settings' }); } catch (e) { Edu.toast(e.message, true); } };
        $$('[data-rms]').forEach(b => b.onclick = async () => { try { await Edu.del('/classes/' + c.id + '/staff/' + b.dataset.rms); Edu.go('class', { id: c.id, tab: 'settings' }); } catch (e) { Edu.toast(e.message, true); } });
      } catch (e) { $('#inst-box').textContent = e.message; $('#staff-box').textContent = ''; }
    })();
    $('#s-save').onclick = async () => {
      try { await Edu.patch('/classes/' + c.id, { name: $('#s-name').value, subject: $('#s-sub').value, level: $('#s-lvl').value, retention_days: Number($('#s-ret').value) }); Edu.toast('Saved'); Edu.go('class', { id: c.id, tab: 'settings' }); } catch (e) { Edu.toast(e.message, true); }
    };
    $('#s-regen').onclick = async () => {
      if (!(await Edu.confirm('New join code', 'The old code will stop working. Share the new code with students who still need to join.', 'Make a new code'))) return;
      try { await Edu.post('/classes/' + c.id + '/regenerate-code'); Edu.go('class', { id: c.id, tab: 'settings' }); } catch (e) { Edu.toast(e.message, true); }
    };
    $('#s-arch').onclick = async () => { try { await Edu.patch('/classes/' + c.id, { archived: !c.archived }); Edu.go('class', { id: c.id, tab: 'settings' }); } catch (e) { Edu.toast(e.message, true); } };
    $('#s-del').onclick = async () => {
      if (!(await Edu.confirmTyped('Delete class', `Delete "${c.name}" with all its assignments and submissions?`, 'DELETE'))) return;
      try { await Edu.del('/classes/' + c.id, { confirm: 'DELETE' }); Edu.toast('Class deleted'); Edu.go('home'); } catch (e) { Edu.toast(e.message, true); }
    };
  }

  // ── assignment editor ──────────────────────────────────────────────────────
  V['assignment-edit'] = async function (p) {
    let a = { title: '', instructions: '', objective: '', source_type: 'article', source_url: '', source_text: '', claims: [{ id: '', text: '', expected_conclusion: '' }], module_id: '', due_at: null, ai_policy: 'disclose', published: true };
    if (p.id) a = (await Edu.get('/assignments/' + p.id)).assignment;
    const claims = (a.claims && a.claims.length ? a.claims : [{ id: '', text: '', expected_conclusion: '' }]).map(c => ({ ...c }));
    const concl = Edu.ref.conclusions;
    const mods = (await Edu.get('/modules')).modules;

    function paintClaims() {
      $('#claims').innerHTML = claims.map((c, i) => `
        <div class="card" data-ci="${i}">
          <div class="row"><b class="spacer">Claim ${i + 1}</b>${claims.length > 1 ? `<button class="btn ghost small" type="button" data-rmc="${i}">Remove</button>` : ''}</div>
          <div class="field mt"><label for="cl-t-${i}">The checkable claim <span class="hint">(a statement that evidence can show true or false)</span></label><textarea id="cl-t-${i}" data-f="text" maxlength="600" style="min-height:4rem">${esc(c.text)}</textarea></div>
          <div class="field"><label for="cl-e-${i}">Your reference conclusion <span class="hint">(optional, never shown to students)</span></label>
            <select id="cl-e-${i}" data-f="expected_conclusion"><option value="">No reference conclusion</option>${concl.map(x => `<option value="${x.key}" ${c.expected_conclusion === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
        </div>`).join('') + (claims.length < 8 ? '<button class="btn ghost" type="button" id="add-claim">+ Add another claim</button>' : '<p class="small muted">Up to 8 claims per assignment.</p>');
      $$('[data-ci] [data-f]').forEach(el => el.oninput = el.onchange = () => { claims[Number(el.closest('[data-ci]').dataset.ci)][el.dataset.f] = el.value; });
      $$('[data-rmc]').forEach(b => b.onclick = () => { claims.splice(Number(b.dataset.rmc), 1); paintClaims(); });
      const add = $('#add-claim'); if (add) add.onclick = () => { claims.push({ id: '', text: '', expected_conclusion: '' }); paintClaims(); const t = $$('#claims textarea'); t[t.length - 1].focus(); };
    }

    Edu.render(p.id ? 'Edit assignment' : 'New assignment', `
      <div class="crumbs"><button type="button" id="crumb-class">Back to class</button></div>
      <div class="page-head"><div><h1>${p.id ? 'Edit assignment' : 'New assignment'}</h1><p class="lead">Choose what students investigate and what you expect. Ten minutes is enough for a first one.</p></div></div>
      <div id="form-err"></div>
      <div class="card"><h2>1. The material</h2>
        <div class="field"><label for="a-title">Assignment title</label><input id="a-title" type="text" maxlength="160" value="${esc(a.title)}"></div>
        <div class="cols2">
          <div class="field"><label for="a-type">What are students looking at?</label><select id="a-type">${Edu.ref.source_types.map(t => `<option value="${t}" ${a.source_type === t ? 'selected' : ''}>${esc(SOURCE_LABELS[t] || t)}</option>`).join('')}</select></div>
          <div class="field"><label for="a-url">Link to the material <span class="hint">(optional)</span></label><input id="a-url" type="url" placeholder="https://" value="${esc(a.source_url || '')}"></div>
        </div>
        <div class="field"><label for="a-text">Paste the text or a description <span class="hint">(optional, helps you pick claims)</span></label><textarea id="a-text" maxlength="20000">${esc(a.source_text || '')}</textarea></div>
      </div>
      <div class="card"><h2>2. Claims to investigate</h2>
        <p class="muted small">Students investigate each claim, collect evidence for and against, and reach a conclusion. Choose claims that can really be checked.</p>
        <div class="row mb"><button class="btn ghost small" id="suggest" type="button">Suggest claims from the pasted text</button><span class="small muted" id="suggest-note"></span></div>
        <div id="claims"></div>
      </div>
      <div class="card"><h2>3. Instructions and rules</h2>
        <div class="field"><label for="a-ins">Instructions for students <span class="hint">(optional)</span></label><textarea id="a-ins" maxlength="5000">${esc(a.instructions || '')}</textarea></div>
        <div class="field"><label for="a-obj">Learning objective <span class="hint">(optional)</span></label><input id="a-obj" type="text" maxlength="300" value="${esc(a.objective || '')}" placeholder="For example: Students compare two independent sources before concluding."></div>
        <div class="cols3">
          <div class="field"><label for="a-due">Deadline <span class="hint">(optional)</span></label><input id="a-due" type="datetime-local" value="${esc(Edu.toLocalInput(a.due_at))}"></div>
          <div class="field"><label for="a-ai">AI use in this assignment</label><select id="a-ai">${Edu.ref.ai_policies.map(k => `<option value="${k}" ${a.ai_policy === k ? 'selected' : ''}>${esc(POLICY_LABELS[k])}</option>`).join('')}</select></div>
          <div class="field"><label for="a-mod">Suggested module <span class="hint">(optional)</span></label><select id="a-mod"><option value="">None</option>${mods.map(m => `<option value="${esc(m.id)}" ${a.module_id === m.id ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></div>
        </div>
        <label class="radio"><input id="a-pub" type="checkbox" ${a.published !== false ? 'checked' : ''}> <span><b>Visible to students</b><br><span class="muted small">Untick to keep it as a hidden draft.</span></span></label>
      </div>
      <div class="sticky-bar"><button class="btn" id="save" type="button">${p.id ? 'Save changes' : 'Create assignment'}</button><button class="btn ghost" id="cancel" type="button">Cancel</button></div>`);
    paintClaims();
    const back = () => Edu.go('class', { id: p.classId || a.class_id });
    $('#crumb-class').onclick = $('#cancel').onclick = back;

    $('#suggest').onclick = async () => {
      const text = $('#a-text').value.trim();
      if (text.length < 40) { Edu.toast('Paste a few sentences of the material first.', true); $('#a-text').focus(); return; }
      $('#suggest').disabled = true; $('#suggest-note').textContent = 'Looking for checkable statements';
      try {
        const r = await Edu.post('/extract-claims', { text });
        if (!r.claims.length) { $('#suggest-note').textContent = 'No checkable statements found. Write the claims yourself.'; }
        else {
          const empty = claims.length === 1 && !claims[0].text.trim();
          if (empty) claims.length = 0;
          r.claims.forEach(t => { if (claims.length < 8) claims.push({ id: '', text: t, expected_conclusion: '' }); });
          paintClaims(); $('#suggest-note').textContent = r.note;
        }
      } catch (e) { $('#suggest-note').textContent = ''; Edu.toast(e.message, true); }
      $('#suggest').disabled = false;
    };

    $('#save').onclick = async () => {
      const errBox = $('#form-err'); errBox.innerHTML = '';
      const body = {
        title: $('#a-title').value.trim(), source_type: $('#a-type').value, source_url: $('#a-url').value.trim(), source_text: $('#a-text').value,
        claims: claims.filter(c => c.text.trim().length >= 5).map(c => ({ id: c.id || undefined, text: c.text.trim(), expected_conclusion: c.expected_conclusion })),
        instructions: $('#a-ins').value, objective: $('#a-obj').value.trim(), module_id: $('#a-mod').value || null,
        due_at: $('#a-due').value ? new Date($('#a-due').value).toISOString() : null, ai_policy: $('#a-ai').value, published: $('#a-pub').checked,
      };
      const fail = m => { errBox.innerHTML = `<div class="form-error" role="alert">${esc(m)}</div>`; errBox.scrollIntoView({ block: 'center' }); };
      if (body.title.length < 3) return fail('Give the assignment a title.');
      if (!body.claims.length) return fail('Add at least one claim (at least a short sentence).');
      if (body.source_url && !/^https?:\/\//i.test(body.source_url)) return fail('The link must start with http:// or https://');
      $('#save').disabled = true;
      try {
        if (p.id) await Edu.patch('/assignments/' + p.id, body); else await Edu.post('/classes/' + p.classId + '/assignments', body);
        Edu.toast(p.id ? 'Assignment saved' : 'Assignment created');
        back();
      } catch (e) { $('#save').disabled = false; fail(e.message); }
    };
  };

  // ── one assignment: who has submitted ──────────────────────────────────────
  V.assignment = async function (p) {
    const [ad, sd] = await Promise.all([Edu.get('/assignments/' + p.id), Edu.get('/assignments/' + p.id + '/submissions')]);
    const a = ad.assignment;
    const rows = sd.rows;
    const done = rows.filter(r => r.status === 'submitted' || r.status === 'reviewed').length;
    const d = Edu.dueInfo(a.due_at);
    Edu.render(a.title, `
      <div class="crumbs"><button type="button" id="crumb-class">${esc(a.class_name)}</button> / ${esc(a.title)}</div>
      <div class="page-head"><div><h1>${esc(a.title)}</h1>
        <p class="lead">${esc(SOURCE_LABELS[a.source_type] || '')}${a.source_url ? ` · <button class="link" id="open-src" type="button">Open the material</button>` : ''}</p></div>
        <div class="row">${a.is_owner === false ? '' : '<button class="btn ghost" id="team" type="button">Create team boards</button><button class="btn ghost" id="lms" type="button">Learning platform</button><button class="btn ghost" id="edit" type="button">Edit</button>'}</div></div>
      <div class="stats">
        <div class="card stat"><b>${done} of ${rows.length}</b><span class="muted small">Submitted</span></div>
        <div class="card stat"><b>${rows.filter(r => r.status === 'reviewed').length}</b><span class="muted small">Reviewed</span></div>
        <div class="card stat"><span>${Edu.chip(d.text, d.cls)}</span><span class="muted small mt">${esc(POLICY_LABELS[a.ai_policy])}</span></div>
      </div>
      ${a.instructions ? `<div class="card"><h3>Instructions</h3><p>${esc(a.instructions)}</p></div>` : ''}
      <div class="card mt"><h3>Claims</h3><ol style="padding-left:1.2rem">${a.claims.map(c => `<li>${esc(c.text)}${c.expected_conclusion ? ` <span class="chip purple">Reference: ${esc(Edu.conclusionLabel(c.expected_conclusion))}</span>` : ''}</li>`).join('')}</ol></div>
      <div class="card mt tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Student submissions</caption>
        <thead><tr><th scope="col">Student</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col">Process scores (advisory)</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.length ? rows.map(r => {
          const s = r.auto_scores || {};
          return `<tr><td><b>${esc(r.display_name || r.username)}</b></td><td>${Edu.statusChip(r.status)} ${r.late ? Edu.chip('Late', 'bad') : ''}</td><td>${r.submitted_at ? Edu.fmtDateTime(r.submitted_at) : ''}</td>
          <td class="small">${r.submission_id && r.status !== 'draft' ? `Evidence ${s.evidence_gathering ?? 'n/a'} · Sources ${s.source_evaluation ?? 'n/a'} · Reasoning ${s.claim_verification ?? 'n/a'}` : '<span class="muted">Not submitted</span>'}</td>
          <td>${r.submission_id && r.status !== 'draft' ? `<button class="btn small" type="button" data-rev="${esc(r.submission_id)}">${r.status === 'reviewed' ? 'View review' : 'Review'}</button>` : ''}</td></tr>`;
        }).join('') : '<tr><td colspan="5" class="muted">No students in this class yet.</td></tr>'}</tbody></table></div>`);
    $('#crumb-class').onclick = () => Edu.go('class', { id: a.class_id });
    const ed = $('#edit'); if (ed) ed.onclick = () => Edu.go('assignment-edit', { id: a.id, classId: a.class_id });
    const lm = $('#lms'); if (lm) lm.onclick = () => Edu.lmsAssignmentDialog(a);
    const tm = $('#team'); if (tm) tm.onclick = async () => { try { const r = await Edu.post('/assignments/' + a.id + '/team-boards'); Edu.toast(r.created ? r.created + ' team board(s) created. Groups find them under Boards.' : 'Every group already has its boards.'); } catch (e) { Edu.toast(e.message, true); } };
    const src = $('#open-src'); if (src) src.onclick = () => fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url: a.source_url });
    $$('[data-rev]').forEach(b => b.onclick = () => Edu.go('review', { id: b.dataset.rev, assignmentId: a.id }));
  };

  // ── review one submission ──────────────────────────────────────────────────
  V.review = async function (p) {
    const { submission: s } = await Edu.get('/submissions/' + p.id);
    const claims = (s.work && s.work.claims) || [];
    const keyById = Object.fromEntries((s.assignment_claims || []).map(c => [c.id, c]));
    const as = s.assessment || { scores: {}, per_claim: [] };
    const ts = s.teacher_scores || {};
    const disc = s.ai_disclosure;
    const comps = Edu.ref.competencies;

    Edu.render('Review ' + (s.display_name || s.username), `
      <div class="crumbs"><button type="button" id="crumb-asg">${esc(s.assignment_title)}</button> / ${esc(s.display_name || s.username)}</div>
      <div class="page-head"><div><h1>${esc(s.display_name || s.username)}</h1>
        <p class="lead">${esc(s.assignment_title)} · ${Edu.statusChip(s.status)} ${s.late ? Edu.chip('Late', 'bad') : ''} ${s.submitted_at ? '· Submitted ' + Edu.fmtDateTime(s.submitted_at) : ''}</p></div></div>
      <div class="note mb">The process scores below are automatic and advisory. They describe evidence, sources and reasoning, with the reasons shown. <b>They never set a grade.</b> Your rubric scores and feedback replace them in the student's profile.</div>
      ${claims.map((c, i) => {
        const pc = (as.per_claim || []).find(x => x.claim_id === c.claim_id) || { reasons: { evidence: [], source: [], verdict: [] } };
        const ref = keyById[c.claim_id];
        return `<div class="card"><h2>Claim ${i + 1}</h2>
          <div class="claim-box">${esc(c.text)}</div>
          <div class="row mt">${Edu.chip('Conclusion: ' + Edu.conclusionLabel(c.conclusion), 'info')} ${c.confidence ? Edu.chip('Confidence: ' + c.confidence) : ''} ${ref && ref.expected_conclusion ? Edu.chip('Your reference: ' + Edu.conclusionLabel(ref.expected_conclusion), 'purple') : ''}</div>
          <h3 class="mt">Reasoning</h3><p>${esc(c.reasoning) || '<span class="muted">None written</span>'}</p>
          ${c.unresolved ? `<h3 class="mt">Still uncertain</h3><p>${esc(c.unresolved)}</p>` : ''}
          <h3 class="mt">Evidence (${(c.evidence || []).length})</h3>
          ${(c.evidence || []).length ? (c.evidence || []).map(e => `<div class="evidence"><div class="head">${Edu.chip(e.kind === 'supporting' ? 'Supports' : e.kind === 'contradicting' ? 'Challenges' : 'Context', e.kind === 'supporting' ? 'ok' : e.kind === 'contradicting' ? 'bad' : 'info')} <b>${esc(e.title || 'Untitled source')}</b></div>
            ${e.url ? `<div class="small"><button class="link" type="button" data-url="${esc(e.url)}">${esc(e.url)}</button></div>` : '<div class="small muted">No link given</div>'}
            <div class="small mt">${esc((e.source_type || '').replace(/_/g, ' '))}${e.reliability ? ' · rated ' + esc(e.reliability) + ' reliability' : ''}${e.published ? ' · ' + esc(e.published) : ''}</div>
            ${e.ownership ? `<div class="small"><b>Owner or purpose:</b> ${esc(e.ownership)}</div>` : ''}
            ${e.note ? `<div class="small"><b>Why it matters:</b> ${esc(e.note)}</div>` : ''}</div>`).join('') : '<p class="muted">No evidence added.</p>'}
          <details class="mt"><summary><b>Why the automatic scores look like this</b></summary>
            <ul style="padding-left:1.2rem" class="small mt">${[...pc.reasons.evidence, ...pc.reasons.source, ...pc.reasons.verdict].map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>
        </div>`;
      }).join('')}
      <div class="card"><h2>AI use disclosure</h2>
        ${!disc || disc.used === null ? '<p class="muted">The student did not answer.</p>' : disc.used === false ? '<p>The student states that no AI tool was used.</p>' : `
          <dl class="stack"><div><b>Tool:</b> ${esc(disc.tool) || '<span class="muted">not named</span>'}</div><div><b>Used for:</b> ${esc(disc.purpose) || '<span class="muted">not explained</span>'}</div>
          <div><b>Checked independently:</b> ${esc(disc.verified) || '<span class="muted">not described</span>'}</div><div><b>Changed or challenged:</b> ${esc(disc.revised) || '<span class="muted">not described</span>'}</div></dl>`}
        ${as.ai_reasons && as.ai_reasons.length ? `<details class="mt"><summary><b>Disclosure completeness</b></summary><ul style="padding-left:1.2rem" class="small mt">${as.ai_reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>` : ''}
        <p class="small muted mt">Disclosure is a prompt for honest discussion. It is not a detector and not proof of anything.</p>
      </div>
      <div class="card"><h2>Optional: FactChecker Pro analysis</h2><p class="muted small">An automated second opinion on each claim, useful for discussion. It can be wrong.</p>
        <div id="cmp"><button class="btn ghost" id="run-cmp" type="button">${s.comparison ? 'Show the comparison' : 'Run comparison'}</button></div></div>
      <div class="card"><h2>Your review</h2>
        <p class="muted small">Score each competency from 0 to 4 for the quality of the process shown. Leave blank to keep the automatic score.</p>
        <div class="cols2">${comps.map(c => `<div class="field"><label for="rs-${c.key}">${esc(c.name)} <span class="hint">(automatic: ${as.scores && as.scores[c.key] != null ? as.scores[c.key] : 'n/a'})</span></label>
          <select id="rs-${c.key}"><option value="">Keep automatic</option>${RUBRIC.map((l, i) => `<option value="${i}" ${ts[c.key] === i ? 'selected' : ''}>${i}: ${l}</option>`).join('')}</select></div>`).join('')}</div>
        <div class="field"><label for="fb">Feedback for the student</label><textarea id="fb" maxlength="4000" placeholder="Name one strength and one next step.">${esc(s.feedback || '')}</textarea></div>
        <div class="row"><button class="btn" id="save-rev" type="button">${s.status === 'reviewed' ? 'Update review' : 'Save review'}</button><button class="btn ghost" id="back" type="button">Back</button></div>
      </div>`);
    $('#crumb-asg').onclick = $('#back').onclick = () => Edu.go('assignment', { id: s.assignment_id });
    $$('[data-url]').forEach(b => b.onclick = () => fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url: b.dataset.url }));
    $('#run-cmp').onclick = async () => {
      $('#cmp').innerHTML = '<div class="loading" role="status">Comparing, this can take a few seconds</div>';
      try { const r = await Edu.post('/submissions/' + s.id + '/compare'); $('#cmp').innerHTML = comparisonHtml(r.comparison); } catch (e) { $('#cmp').innerHTML = `<div class="form-error" role="alert">${esc(e.message)}</div>`; }
    };
    $('#save-rev').onclick = async () => {
      const scores = {}; comps.forEach(c => { const v = $('#rs-' + c.key).value; if (v !== '') scores[c.key] = Number(v); });
      try { await Edu.post('/submissions/' + s.id + '/review', { scores, feedback: $('#fb').value }); Edu.toast('Review saved'); Edu.go('assignment', { id: s.assignment_id }); } catch (e) { Edu.toast(e.message, true); }
    };
  };

  function comparisonHtml(cmp) {
    return `<div class="note warn">${esc(cmp.caution)}</div>` + cmp.claims.map(c => c.unavailable ? `<div class="card"><b>${esc(c.text)}</b><p class="muted">The analysis is not available right now.</p></div>` :
      `<div class="card"><b>${esc(c.text)}</b><div class="row mt">${Edu.chip('Student: ' + Edu.conclusionLabel(c.student_conclusion), 'info')} ${Edu.chip('FactChecker Pro: ' + String(c.verdict || 'unverifiable'), 'purple')}</div>
      <p class="mt">${esc(c.summary || '')}</p>${(c.red_flags || []).length ? `<ul class="small" style="padding-left:1.2rem">${c.red_flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>`).join('');
  }
  Edu.comparisonHtml = comparisonHtml;

  // ── student skills profile (teacher view) ──────────────────────────────────
  V['student-profile'] = async function (p) {
    const d = await Edu.get(`/classes/${p.classId}/students/${p.userId}/profile`);
    Edu.render('Skills profile', `
      <div class="crumbs"><button type="button" id="crumb">Back to class</button></div>
      <div class="page-head"><div><h1>${esc(d.student.display_name || d.student.username)}</h1><p class="lead">Competency profile for this class. Advisory, based on process indicators and your rubric scores.</p></div></div>
      <div class="card">${d.competencies.map(c => `<div class="comp"><div><b>${esc(c.name)}</b></div>
        <div>${c.current == null ? '<span class="muted small">Not measured yet</span>' : Edu.bar(c.current) + `<div class="small mt"><b>${esc(c.level)}</b>, ${c.current} of 100${c.change != null ? `, ${c.change >= 0 ? 'up' : 'down'} ${Math.abs(c.change)}` : ''}</div>`}</div>
        <div class="row">${Edu.sparkline(c.history)}<span class="small muted">${c.evidence_count} result${c.evidence_count === 1 ? '' : 's'}</span></div></div>`).join('')}</div>
      <div class="card mt"><h3>Curriculum modules</h3>${d.modules.length ? `<ul class="stack" style="list-style:none">${d.modules.map(m => `<li>${esc((Edu.ref.modules.find(x => x.id === m.module_id) || {}).title || m.module_id)}: ${m.best_score >= 75 ? Edu.chip('Passed ' + m.best_score + '%', 'ok', '✔') : Edu.chip('Best ' + m.best_score + '%', 'warn')}</li>`).join('')}</ul>` : '<p class="muted">No modules completed yet.</p>'}</div>`);
    $('#crumb').onclick = () => Edu.go('class', { id: p.classId, tab: 'students' });
  };
})();
