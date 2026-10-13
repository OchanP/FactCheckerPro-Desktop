/* FactChecker Pro Education: app start up, navigation by role. */
(function () {
  'use strict';
  const { esc, $ } = Edu;

  const NAV = {
    teacher: [
      { id: 'home', label: 'Dashboard', ico: '🏫', also: 'class,assignment,assignment-edit,review,student-profile,classes' },
      { id: 'modules', label: 'Curriculum', ico: '📚', also: 'module,my-modules,module-edit,marketplace' },
      { id: 'boards', label: 'Evidence boards', ico: '🗂️', also: 'board' },
      { id: 'citations', label: 'Citation assistant', ico: '📎' },
      { id: 'institutions', label: 'Institution', ico: '🏛️', also: 'institution' },
      { id: 'settings', label: 'Settings', ico: '⚙️' },
      { id: 'help', label: 'Help', ico: '❓' },
    ],
    student: [
      { id: 'home', label: 'Home', ico: '🏠', also: 'sclass,workspace,result' },
      { id: 'modules', label: 'Curriculum', ico: '📚', also: 'module' },
      { id: 'boards', label: 'Evidence boards', ico: '🗂️', also: 'board' },
      { id: 'citations', label: 'Citation assistant', ico: '📎' },
      { id: 'my-studies', label: 'Research studies', ico: '🧪', also: 'study-run,studies' },
      { id: 'credentials', label: 'Certificates', ico: '🏅' },
      { id: 'profile', label: 'My profile', ico: '🎯' },
      { id: 'settings', label: 'Settings', ico: '⚙️' },
      { id: 'help', label: 'Help', ico: '❓' },
    ],
    journalist: [
      { id: 'home', label: 'Evidence boards', ico: '🗂️', also: 'board,boards' },
      { id: 'citations', label: 'Citation assistant', ico: '📎' },
      { id: 'modules', label: 'Curriculum', ico: '📚', also: 'module,my-modules,module-edit,marketplace' },
      { id: 'my-studies', label: 'Research studies', ico: '🧪', also: 'study-run,studies' },
      { id: 'credentials', label: 'Certificates', ico: '🏅' },
      { id: 'institutions', label: 'Newsroom or institution', ico: '🏛️', also: 'institution' },
      { id: 'settings', label: 'Settings', ico: '⚙️' },
      { id: 'help', label: 'Help', ico: '❓' },
    ],
    researcher: [
      { id: 'home', label: 'Studies', ico: '🧪', also: 'studies,study,my-studies,study-run' },
      { id: 'boards', label: 'Evidence boards', ico: '🗂️', also: 'board' },
      { id: 'trends', label: 'Trends', ico: '📈' },
      { id: 'citations', label: 'Citation assistant', ico: '📎' },
      { id: 'modules', label: 'Curriculum', ico: '📚', also: 'module,my-modules,module-edit,marketplace' },
      { id: 'institutions', label: 'Institution', ico: '🏛️', also: 'institution' },
      { id: 'settings', label: 'Settings', ico: '⚙️' },
      { id: 'help', label: 'Help', ico: '❓' },
    ],
  };

  // Save an open investigation draft before leaving the workspace.
  const rawGo = Edu.go;
  Edu.go = async function (name, params) {
    if (typeof Edu._leaveWorkspace === 'function' && name !== 'workspace') {
      const f = Edu._leaveWorkspace; Edu._leaveWorkspace = null;
      try { await f(); } catch (_) {}
    }
    rawGo(name, params);
  };

  function buildNav() {
    const items = NAV[Edu.role] || [];
    $('#nav').innerHTML = items.map(i => `<li><button class="nav-btn" type="button" data-nav="${i.id}" data-also="${i.also || ''}"><span class="ico" aria-hidden="true">${i.ico}</span> ${esc(i.label)}</button></li>`).join('');
    Edu.$$('#nav button').forEach(b => b.onclick = () => Edu.go(b.dataset.nav));
  }

  function fillWho() {
    const u = Edu.me.user;
    const name = u.display_name || u.username || u.email || '';
    $('#who').hidden = !Edu.role;
    $('#who-name').textContent = name;
    $('#who-avatar').textContent = (name[0] || '?').toUpperCase();
    $('#who-role').textContent = Edu.role === 'teacher' ? 'Teacher' : Edu.role === 'student' ? 'Student' : '';
  }

  /** Loads reference data and the profile, then opens the right first screen. */
  Edu.boot = async function () {
    Edu.loading('Loading your workspace');
    try {
      const [ref, me] = await Promise.all([Edu.get('/reference'), Edu.get('/me')]);
      Edu.ref = ref; Edu.me = me;
      Edu.role = me.profile ? me.profile.role : null;
      if (me.profile) Edu.applyDisplay(me.profile.text_scale, me.profile.high_contrast);
      fillWho();
      buildNav();
      $('#btn-tools').hidden = !Edu.role;
      if (!Edu.role) { Edu.go('onboarding'); return; }
      // invitations by email and joining by verified email domain (best effort, never blocks start up)
      try {
        if (Edu.role === 'student') { const r = await Edu.post('/me/accept-invites'); (r.joined || []).forEach(c => Edu.toast('You joined ' + c.name)); }
        const j = await Edu.post('/me/institutions/auto-join'); (j.joined || []).forEach(i => Edu.toast('You joined ' + i.name));
      } catch (_) {}
      Edu.go('home');
    } catch (err) {
      if (err && err.signedOut) return Edu.signOut(true);
      Edu.errorView(err, Edu.boot);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    Edu.restoreDisplay();
    $('#btn-signout').onclick = () => Edu.signOut(false);
    const ls = $('#lang-sel'); ls.value = Edu.lang; ls.onchange = () => Edu.setLang(ls.value);
    $('#btn-tools').onclick = () => fc.runtime.sendMessage({ type: 'FC_OPEN_HUB' });
    if (fc.onNavigate) {
      fc.onNavigate(view => {
        const known = { dashboard: 'home', home: 'home', modules: 'modules', boards: 'boards', citations: 'citations', profile: 'profile', settings: 'settings', help: 'help' };
        if (Edu.role && known[view]) Edu.go(known[view]);
      });
    }
    window.addEventListener('beforeunload', () => { if (typeof Edu._leaveWorkspace === 'function') Edu._leaveWorkspace(); });
    Edu.boot();
  });
})();
