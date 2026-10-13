/* FactChecker Pro Education: learning platform connections (Google Classroom).
   Tokens stay on the server. This file only starts the sign in, lists courses and asks the server to import, publish and send scores. */
(function () {
  'use strict';
  const { esc, $ } = Edu;
  const V = Edu.views;

  /** Opens the provider sign in in the system browser, then waits for the server to report the connection. */
  Edu.connectProvider = async function (id, label, onDone) {
    try {
      const r = await Edu.post('/connectors/' + id + '/start', { lang: Edu.lang });
      Edu.openExternal(r.url);
      Edu.toast('Finish signing in to ' + label + ' in your browser.');
      for (let i = 0; i < 72; i++) {
        await new Promise(res => setTimeout(res, 2500));
        if (!document.body.contains($('#view'))) return;
        const list = (await Edu.get('/connectors')).connectors;
        const c = list.find(x => x.id === id);
        if (c && c.connected) { Edu.toast('Connected to ' + label + '.'); if (onDone) onDone(c); return; }
      }
      Edu.toast('The connection was not completed. Try again.', true);
    } catch (e) { Edu.toast(e.message, true); }
  };

  /** Shows the courses of the connected account and imports the one the teacher picks. */
  Edu.importCourse = async function (id, label) {
    let courses;
    try { courses = (await Edu.get('/connectors/' + id + '/courses')).courses; } catch (e) { Edu.toast(e.message, true); return; }
    if (!courses.length) { Edu.toast('No active courses were found in ' + label + '.', true); return; }
    const pick = await Edu.dialog({
      title: 'Import from ' + label,
      body: `<p class="muted small">Choose a course. The class and its student list are copied. People with a FactChecker Pro account and the same email address join now, the others are invited.</p>
        <ul class="stack" style="list-style:none;padding:0">${courses.map(c => `<li><label class="radio"><input type="radio" name="course" value="${esc(c.id)}"> <span><b>${esc(c.name)}</b>${c.section ? ' · ' + esc(c.section) : ''}${c.class_id ? ' ' + Edu.chip('Already imported', 'info') : ''}</span></label></li>`).join('')}</ul>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Import', value: 'ok', validate: d => { const x = d.querySelector('input[name=course]:checked'); if (!x) { Edu.toast('Choose a course first.', true); return false; } return x.value; } }],
    });
    if (!pick) return;
    try {
      const r = await Edu.post('/connectors/' + id + '/import', { course_id: pick });
      const s = r.roster;
      Edu.toast(`${r.created ? 'Class created' : 'Class updated'}: ${s.added} joined, ${s.invited} invited${s.no_email ? ', ' + s.no_email + ' without an email address' : ''}.`);
      Edu.go('class', { id: r.class.id });
    } catch (e) { Edu.toast(e.message, true); }
  };

  /** A card listing each platform with connect, import and disconnect. */
  async function connectorsCard(box) {
    let list;
    try { list = (await Edu.get('/connectors')).connectors; } catch (e) { box.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; return; }
    box.innerHTML = list.map(c => `<div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line,#e3e8f0);padding:10px 0">
        <div><b>${esc(c.label)}</b><div class="small muted">${c.connected ? 'Connected as ' + esc(c.account || 'your account') : c.available ? 'Not connected' : 'Not switched on for this server yet'}</div></div>
        <div class="row">${c.connected
          ? `<button class="btn small" type="button" data-imp="${esc(c.id)}" data-label="${esc(c.label)}">Import a course</button><button class="btn ghost small" type="button" data-off="${esc(c.id)}">Disconnect</button>`
          : `<button class="btn small" type="button" data-on="${esc(c.id)}" data-label="${esc(c.label)}" ${c.available ? '' : 'disabled'}>Connect</button>`}</div></div>`).join('');
    Edu.$$('[data-on]', box).forEach(b => b.onclick = () => Edu.connectProvider(b.dataset.on, b.dataset.label, () => connectorsCard(box)));
    Edu.$$('[data-imp]', box).forEach(b => b.onclick = () => Edu.importCourse(b.dataset.imp, b.dataset.label));
    Edu.$$('[data-off]', box).forEach(b => b.onclick = async () => {
      if (!(await Edu.confirm('Disconnect', 'The stored sign in for this platform is deleted. Imported classes stay.', 'Disconnect'))) return;
      try { await Edu.del('/connectors/' + b.dataset.off); connectorsCard(box); } catch (e) { Edu.toast(e.message, true); }
    });
  }

  const cardHtml = `<div class="card mt" id="lms-card"><h2>Learning platforms</h2>
      <p class="muted">Connect Google Classroom to import a course with its students, publish assignments there, and send your reviewed scores back as draft grades. Sign in happens in your browser. We never see your password and the app never holds the access token.</p>
      <div id="lms-list"><div class="loading" role="status">Loading</div></div></div>`;

  // Teacher dashboard and settings get the card.
  const homeV = V.home;
  V.home = async function (p) {
    await homeV.call(this, p);
    if (Edu.role !== 'teacher') return;
    const anchor = $('#see-mods');
    if (anchor && anchor.closest('.card') && !$('#lms-card')) { anchor.closest('.card').insertAdjacentHTML('beforebegin', cardHtml); connectorsCard($('#lms-list')); }
  };
  const settingsV = V.settings;
  V.settings = async function (p) {
    await settingsV.call(this, p);
    if (Edu.role !== 'teacher') return;
    const anchor = $('#export');
    if (anchor && anchor.closest('.card') && !$('#lms-card')) { anchor.closest('.card').insertAdjacentHTML('beforebegin', cardHtml); connectorsCard($('#lms-list')); }
  };

  /** Box on the class settings tab. */
  Edu.lmsClassBox = function (box, c) {
    const linked = /^google:/.test(c.external_ref || '');
    box.innerHTML = linked
      ? `<p class="muted small">This class is linked to a Google Classroom course. Sync adds students who joined the course since the last time.</p><button class="btn" id="lms-sync" type="button">Sync student list</button>`
      : '<p class="muted small">Not linked. Import a course from the dashboard or from Settings to link a class to Google Classroom.</p>';
    const b = $('#lms-sync');
    if (b) b.onclick = async () => {
      try { const r = await Edu.post('/classes/' + c.id + '/lms/sync'); const s = r.roster; Edu.toast(`Synced: ${s.added} joined, ${s.invited} invited.`); } catch (e) { Edu.toast(e.message, true); }
    };
  };

  /** Dialog on an assignment: publish into the course and send scores. */
  Edu.lmsAssignmentDialog = async function (a) {
    const published = /^google:[^:]+:[^:]+/.test(a.external_ref || '');
    const r = await Edu.dialog({
      title: 'Learning platform',
      body: `<p class="muted small">${published ? 'This assignment is in the course.' : 'Publish this assignment as coursework in the linked course.'} Scores are sent as <b>drafts</b>. You return the work in the platform, so students only see grades when you decide. Only your own rubric scores are sent, never the automatic indicators.</p>
        ${published ? '<label class="radio"><input type="checkbox" id="lms-rel"> <span>Also set as final grade (skip the draft step)</span></label>' : ''}`,
      actions: [{ label: 'Close', value: null }, ...(published ? [{ label: 'Send reviewed scores', value: 'push' }] : [{ label: 'Publish to the course', value: 'pub' }])],
    });
    if (!r) return;
    try {
      if (r === 'pub') {
        const x = await Edu.post('/assignments/' + a.id + '/lms/publish', { lang: Edu.lang });
        a.external_ref = x.external_ref; Edu.toast('Published in the course.');
      } else {
        const rel = !!(document.getElementById('lms-rel') && document.getElementById('lms-rel').checked);
        const x = await Edu.post('/assignments/' + a.id + '/lms/push-grades', { release: rel });
        Edu.toast(`${x.pushed} score${x.pushed === 1 ? '' : 's'} sent. ${x.not_reviewed ? x.not_reviewed + ' not reviewed yet. ' : ''}${x.unmatched ? x.unmatched + ' not matched by email.' : ''}`);
      }
    } catch (e) { Edu.toast(e.message, true); }
  };
})();
