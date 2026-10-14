/* FactChecker Pro Education: institution administration, reports, API keys, audit log and trends. */
(function () {
  'use strict';
  const { esc, $, $$ } = Edu;
  const V = Edu.views;
  const ROLE_LABELS = { inst_admin: 'Institution administrator', faculty_admin: 'Faculty or unit administrator', research_admin: 'Research administrator', teacher: 'Teacher or lecturer', ta: 'Teaching assistant', student: 'Student', external_researcher: 'External researcher' };
  const KIND_LABELS = { campus: 'Campus', faculty: 'Faculty', department: 'Department', program: 'Programme', course: 'Course' };
  const TOPIC_LABELS = { elections: 'Elections and politics', health: 'Public health', climate_energy: 'Climate and energy', economy: 'Economy and prices', war_security: 'War and security', technology_ai: 'Technology and AI', migration: 'Migration' };
  const ACTION_LABELS = {
    'institution.create': 'Institution created', 'institution.update': 'Settings changed', 'domain.add': 'Domain added', 'domain.verify': 'Domain verified', 'domain.remove': 'Domain removed', 'member.domain_join': 'Joined by email domain',
    'unit.create': 'Unit created', 'unit.rename': 'Unit renamed', 'unit.delete': 'Unit deleted', 'member.add': 'Member added', 'member.update': 'Member changed', 'member.remove': 'Member removed',
    'class.attach': 'Class attached', 'class.staff_add': 'Assistant added to class', 'apikey.create': 'API key created', 'apikey.revoke': 'API key revoked',
  };
  const unitName = (units, id) => (units.find(u => u.id === id) || {}).name || '';

  // ── list ───────────────────────────────────────────────────────────────────
  V.institutions = async function () {
    const d = await Edu.get('/institutions');
    Edu.render('Institution', `
      <div class="page-head"><div><h1>Institution</h1><p class="lead">Organise your school, faculty or newsroom: structure, people, roles, reports and settings in one place.</p></div>
        ${['teacher', 'researcher'].includes(Edu.role) ? '<button class="btn" id="new" type="button">+ New institution</button>' : ''}</div>
      ${d.institutions.length ? `<div class="grid">${d.institutions.map(i => `<button class="card tile" type="button" data-id="${esc(i.id)}"><h3>${esc(i.name)}</h3><p class="muted small">${esc(ROLE_LABELS[i.role] || i.role)}</p></button>`).join('')}</div>`
        : Edu.empty('🏛️', 'You are not in an institution yet', 'An administrator can add you by email or username, or you can create one. If your school verified its email domain you join automatically when you sign in.', '')}`);
    $$('[data-id]').forEach(b => b.onclick = () => Edu.go('institution', { id: b.dataset.id }));
    const n = $('#new'); if (n) n.onclick = async () => {
      const name = await Edu.prompt('New institution', 'Name of the institution', '', '(school, university, newsroom)');
      if (!name) return;
      try { const r = await Edu.post('/institutions', { name }); Edu.go('institution', { id: r.institution.id }); } catch (e) { Edu.toast(e.message, true); }
    };
  };

  // ── one institution ────────────────────────────────────────────────────────
  V.institution = async function (p) {
    const d = await Edu.get('/institutions/' + p.id);
    const inst = d.institution, role = d.role;
    const admin = role === 'inst_admin', unitAdmin = admin || role === 'faculty_admin';
    const tabs = [['overview', 'Overview']];
    if (unitAdmin) tabs.push(['structure', 'Structure'], ['members', 'People']);
    if (admin) tabs.push(['license', 'License']);
    if (admin) tabs.push(['domains', 'Email domains']);
    if (['inst_admin', 'faculty_admin', 'research_admin'].includes(role)) tabs.push(['report', 'Reports']);
    if (admin) tabs.push(['api', 'API keys'], ['audit', 'Audit log']);
    const tab = tabs.some(t => t[0] === p.tab) ? p.tab : 'overview';
    Edu.render(inst.name, `
      <div class="crumbs"><button type="button" id="crumb">Institutions</button> / ${esc(inst.name)}</div>
      <div class="page-head"><div><h1>${esc(inst.name)}</h1><p class="lead">${esc(ROLE_LABELS[role] || role)}</p></div></div>
      ${licenseBanner(d.license, admin)}
      <div class="tabs" role="tablist" aria-label="Institution sections">${tabs.map(([k, l]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
      <div id="tab-body"></div>`);
    $('#crumb').onclick = () => Edu.go('institutions');
    $$('[data-tab]').forEach(b => b.onclick = () => Edu.go('institution', { id: p.id, tab: b.dataset.tab }));
    const body = $('#tab-body');
    const reload = (t) => Edu.go('institution', { id: p.id, tab: t || tab });
    if (tab === 'overview') return overview(body, d, reload);
    if (tab === 'structure') return structure(body, d, reload);
    if (tab === 'members') return members(body, d, reload);
    if (tab === 'license') return licenseTab(body, d, reload);
    if (tab === 'domains') return domains(body, d, reload);
    if (tab === 'report') return report(body, d);
    if (tab === 'api') return apiKeys(body, d, reload);
    return auditLog(body, d);
  };

  function overview(body, d, reload) {
    const i = d.institution, admin = d.role === 'inst_admin';
    body.innerHTML = `
      <div class="stats">${Object.entries(d.member_counts).map(([k, n]) => `<div class="card stat"><b>${n}</b><span class="muted small">${esc(ROLE_LABELS[k] || k)}</span></div>`).join('') || '<div class="card stat"><b>0</b><span class="muted small">People</span></div>'}</div>
      ${admin ? `<div class="card"><h2>Settings</h2>
        <div class="field"><label for="i-name">Name</label><input id="i-name" type="text" maxlength="160" value="${esc(i.name)}"></div>
        <div class="cols3">
          <div class="field"><label for="i-seats">License seats <span class="hint">(0 means unlimited, ${i.seats_used} in use)</span></label><input id="i-seats" type="number" min="0" value="${esc(i.license_seats)}" ${d.license && d.license.status !== 'free' ? 'disabled title="Set by your license"' : ''}></div>
          <div class="field"><label for="i-ret">Longest time student work is kept</label><select id="i-ret">${[[90, '90 days'], [180, '6 months'], [365, '1 year'], [730, '2 years'], [1825, '5 years']].map(([v, l]) => `<option value="${v}" ${i.default_retention_days === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="i-color">Brand colour</label><input id="i-color" type="text" placeholder="#1f5f8b" maxlength="7" value="${esc(i.brand_color || '')}"></div></div>
        <label class="radio"><input id="i-join" type="checkbox" ${i.domain_join ? 'checked' : ''}> <span><b>Join automatically by email domain</b><br><span class="muted small">People who sign in with an email on a verified domain join as teacher or student, as chosen in their profile. Seats still apply.</span></span></label>
        <div class="row mt"><button class="btn" id="save" type="button">Save settings</button></div>
        <p class="small muted mt">The retention limit applies to every class attached to this institution. A class can keep work for a shorter time, never longer.</p></div>` : `<div class="card"><h2>Privacy settings</h2><p>Student work in this institution is kept at most ${i.default_retention_days} days.</p></div>`}
      <div class="card"><h2>Your classes</h2><p class="muted small">Attach a class to a unit from the class settings tab. Reports group classes by unit.</p></div>`;
    const s = $('#save'); if (s) s.onclick = async () => {
      try { await Edu.patch('/institutions/' + i.id, { name: $('#i-name').value, license_seats: d.license && d.license.status !== 'free' ? i.license_seats : Number($('#i-seats').value) || 0, default_retention_days: Number($('#i-ret').value), brand_color: $('#i-color').value.trim() || null, domain_join: $('#i-join').checked }); Edu.toast('Saved'); reload(); } catch (e) { Edu.toast(e.message, true); }
    };
  }

  // ── license ───────────────────────────────────────────────────────────────
  function licenseBanner(l, admin) {
    if (!l) return '';
    let msg = '', cls = 'warn';
    if (l.status === 'expired') { msg = 'The license has ended. Everything stays readable, but nobody can be added and the structure cannot change until it is renewed.'; cls = 'bad'; }
    else if (l.status === 'grace') msg = 'The license has ended and is in a short grace period. Renew it to avoid the institution becoming read only.';
    else if (l.status === 'active' && l.days_left != null && l.days_left <= 30) msg = 'The license ends in ' + l.days_left + ' days. Renew it to keep adding people.';
    if (!msg) return '';
    return `<div class="note ${cls}" role="status" style="margin-bottom:14px"><b>${Edu.t('License')}:</b> ${Edu.t(msg)}${admin ? ' <button class="link" type="button" data-tab="license">' + Edu.t('Open license') + '</button>' : ''}</div>`;
  }
  const PLAN_LABELS = { free: 'Free', pilot: 'Pilot', school: 'School', campus: 'Campus' };
  const STATUS_LABELS = { free: 'Free tier', active: 'Active', grace: 'Grace period', expired: 'Ended' };
  const fmtDate = x => x ? new Date(x).toLocaleDateString(Edu.lang === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  async function licenseTab(body, d, reload) {
    const id = d.institution.id;
    const { license: l } = await Edu.get(`/institutions/${id}/license`);
    const tone = { active: 'ok', free: '', grace: 'warn', expired: 'bad' }[l.status];
    const pct = l.seats ? Math.min(100, Math.round(100 * l.seats_used / l.seats)) : 0;
    body.innerHTML = `
      <div class="card"><div class="row"><h2 class="spacer" style="margin:0">License</h2>${Edu.chip(STATUS_LABELS[l.status], tone)}</div>
        <div class="cols3 mt">
          <div><div class="muted small">Plan</div><b>${esc(Edu.t(PLAN_LABELS[l.plan] || l.plan))}</b></div>
          <div><div class="muted small">${l.status === 'free' ? 'Ends' : l.status === 'active' ? 'Ends on' : 'Ended on'}</div><b>${l.expires_at ? esc(fmtDate(l.expires_at)) : esc(Edu.t('No end date'))}</b>${l.status === 'active' ? `<div class="muted small">${l.days_left + ' days left'}</div>` : ''}${l.status === 'grace' ? `<div class="muted small">${l.grace_days_left + ' days of grace left'}</div>` : ''}</div>
          <div><div class="muted small">Seats</div><b>${l.seats_used}${l.seats ? ' / ' + l.seats : ''}</b>${l.seats ? `<div class="bar mt" aria-hidden="true"><span style="width:${pct}%"></span></div>` : `<div class="muted small">${Edu.t('Unlimited on the free tier')}</div>`}</div>
        </div>
        <p class="muted small mt">${'A seat is one person in the institution: teacher, student or administrator. When a license ends, nothing is deleted. After a grace period of ' + l.grace_days + ' days the institution becomes read only until it is renewed.'}</p>
        <div class="row mt">
          ${l.pilot_available ? `<button class="btn" id="lic-pilot" type="button">${Edu.t('Start a free pilot')}</button>` : ''}
          <button class="btn ${l.pilot_available ? 'ghost' : ''}" id="lic-redeem" type="button">${Edu.t('Enter a license key')}</button>
          <a class="btn ghost" href="mailto:info@factcheckerpro.net?subject=${encodeURIComponent('License request: ' + d.institution.name)}" id="lic-mail">${Edu.t('Request a license')}</a>
        </div>
        ${l.pilot_available ? `<p class="small muted mt">${Edu.t('The free pilot gives 50 seats for 60 days. It can be started once.')}</p>` : ''}
      </div>
      <div id="owner-box"></div>`;
    const pilot = $('#lic-pilot'); if (pilot) pilot.onclick = async () => {
      if (!(await Edu.confirm('Start a free pilot', 'This gives 50 seats for 60 days. It can only be started once for this institution.', 'Start pilot'))) return;
      try { await Edu.post(`/institutions/${id}/license/pilot`, {}); Edu.toast('Pilot started'); reload('license'); } catch (e) { Edu.toast(e.message, true); }
    };
    $('#lic-redeem').onclick = async () => {
      const code = await Edu.prompt('Enter a license key', 'Key', '');
      if (!code) return;
      try { await Edu.post(`/institutions/${id}/license/redeem`, { code: code.trim() }); Edu.toast('License activated'); reload('license'); } catch (e) { Edu.toast(e.message, true); }
    };
    const mail = $('#lic-mail'); if (mail) mail.onclick = e => { e.preventDefault(); try { window.open(mail.href); } catch (_) {} };
    ownerTools($('#owner-box'), d, reload);
  }

  /** Shown only to the FactChecker Pro owner: the server answers 403 to everyone else. */
  async function ownerTools(box, d, reload) {
    let keys; try { keys = (await Edu.get('/license/admin/keys')).keys; } catch (_) { return; }
    const id = d.institution.id;
    box.innerHTML = `<div class="card"><h2>Owner tools</h2>
      <p class="muted small">Only you can see this. Issue keys for institutions, or set the license on this institution directly after an invoice is paid.</p>
      <div class="row"><button class="btn" id="own-key" type="button">Create license keys</button><button class="btn ghost" id="own-set" type="button">Set license on this institution</button><button class="btn ghost" id="own-end" type="button">End license now</button></div>
      <div class="mt" id="own-new"></div>
      ${keys.length ? `<table class="tbl mt"><thead><tr><th>Key</th><th>Plan</th><th>Seats</th><th>Days</th><th>Status</th><th></th></tr></thead><tbody>${keys.map(k => `<tr><td><code>${esc(k.code)}</code></td><td>${esc(k.plan)}</td><td>${k.seats}</td><td>${k.days}</td><td>${k.revoked ? 'Revoked' : k.redeemed_at ? 'Used by ' + esc(k.institution || 'an institution') : 'Unused'}</td><td>${!k.revoked && !k.redeemed_at ? `<button class="btn ghost small" type="button" data-rev="${esc(k.code)}">Revoke</button>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>`;
    const planSel = `<div class="field"><label for="o-plan">Plan</label><select id="o-plan"><option value="school">School</option><option value="campus">Campus</option><option value="pilot">Pilot</option></select></div>`;
    const form = (extra) => `${planSel}<div class="cols3"><div class="field"><label for="o-seats">Seats</label><input id="o-seats" type="number" min="1" value="100"></div><div class="field"><label for="o-days">Days</label><input id="o-days" type="number" min="1" value="365"></div>${extra}</div>`;
    const read = dd => ({ plan: dd.querySelector('#o-plan').value, seats: Number(dd.querySelector('#o-seats').value), days: Number(dd.querySelector('#o-days').value) });
    $('#own-key').onclick = async () => {
      const r = await Edu.dialog({ title: 'Create license keys', body: form('<div class="field"><label for="o-count">How many keys</label><input id="o-count" type="number" min="1" max="50" value="1"></div>') + '<div class="field"><label for="o-note">Note (who it is for)</label><input id="o-note" type="text" maxlength="200"></div>', actions: [{ label: 'Cancel', value: null }, { label: 'Create', value: 'ok', validate: dd => Object.assign(read(dd), { count: Number(dd.querySelector('#o-count').value), note: dd.querySelector('#o-note').value.trim() }) }] });
      if (!r) return;
      try { const o = await Edu.post('/license/admin/keys', r); $('#own-new').innerHTML = `<div class="note ok"><b>New keys</b> (copy them now, send one to the institution)<br>${o.keys.map(k => '<code>' + esc(k.code) + '</code>').join('<br>')}</div>`; } catch (e) { Edu.toast(e.message, true); }
    };
    $('#own-set').onclick = async () => {
      const r = await Edu.dialog({ title: 'Set license on this institution', body: form('<div class="field"><label for="o-contact">Contact email</label><input id="o-contact" type="text" maxlength="255"></div>'), actions: [{ label: 'Cancel', value: null }, { label: 'Set license', value: 'ok', validate: dd => Object.assign(read(dd), { contact: dd.querySelector('#o-contact').value.trim() || undefined }) }] });
      if (!r) return;
      try { await Edu.post(`/license/admin/institutions/${id}`, r); Edu.toast('License set'); reload('license'); } catch (e) { Edu.toast(e.message, true); }
    };
    $('#own-end').onclick = async () => {
      if (!(await Edu.confirm('End license now', 'The institution goes into the grace period and then becomes read only.', 'End license', true))) return;
      try { await Edu.post(`/license/admin/institutions/${id}/end`, {}); reload('license'); } catch (e) { Edu.toast(e.message, true); }
    };
    $$('[data-rev]').forEach(b => b.onclick = async () => { try { await Edu.post(`/license/admin/keys/${b.dataset.rev}/revoke`, {}); reload('license'); } catch (e) { Edu.toast(e.message, true); } });
  }

  function structure(body, d, reload) {
    const units = d.units, id = d.institution.id;
    const kids = pid => units.filter(u => (u.parent_id || null) === (pid || null));
    const tree = (pid, depth) => kids(pid).map(u => `<li style="margin-left:${depth * 1.4}rem"><div class="row"><b>${esc(u.name)}</b>${Edu.chip(KIND_LABELS[u.kind] || u.kind)}
      <button class="btn ghost small" type="button" data-add="${esc(u.id)}">+ Sub-unit</button><button class="btn ghost small" type="button" data-ren="${esc(u.id)}" data-name="${esc(u.name)}">Rename</button>
      ${d.role === 'inst_admin' ? `<button class="btn ghost small" type="button" data-del="${esc(u.id)}" data-name="${esc(u.name)}">Delete</button>` : ''}</div></li>${tree(u.id, depth + 1)}`).join('');
    body.innerHTML = `<div class="row mb"><h2 class="spacer" style="margin:0">Structure</h2>${d.role === 'inst_admin' ? '<button class="btn" id="add-top" type="button">+ Add a unit</button>' : ''}</div>
      <p class="muted small">Campus, faculty, department, programme and course. Reports roll up along this structure.</p>
      ${units.length ? `<div class="card"><ul class="stack" style="list-style:none;padding:0">${tree(null, 0)}</ul></div>` : Edu.empty('🏗️', 'No units yet', 'Add a faculty or department to start.', '')}`;
    const unitDialog = async (parent) => {
      const r = await Edu.dialog({ title: parent ? 'New sub-unit' : 'New unit', body: `<div class="field"><label for="u-kind">Type</label><select id="u-kind">${Edu.opts(KIND_LABELS, parent ? 'department' : 'faculty')}</select></div><div class="field"><label for="u-name">Name</label><input id="u-name" type="text" maxlength="120"></div>`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'ok', validate: dd => { const n = dd.querySelector('#u-name').value.trim(); return n.length < 2 ? false : { kind: dd.querySelector('#u-kind').value, name: n, parent_id: parent || null }; } }] });
      if (!r) return;
      try { await Edu.post(`/institutions/${id}/units`, r); reload('structure'); } catch (e) { Edu.toast(e.message, true); }
    };
    const t = $('#add-top'); if (t) t.onclick = () => unitDialog(null);
    $$('[data-add]').forEach(b => b.onclick = () => unitDialog(b.dataset.add));
    $$('[data-ren]').forEach(b => b.onclick = async () => { const n = await Edu.prompt('Rename unit', 'Name', b.dataset.name); if (n) try { await Edu.patch(`/institutions/${id}/units/${b.dataset.ren}`, { name: n }); reload('structure'); } catch (e) { Edu.toast(e.message, true); } });
    $$('[data-del]').forEach(b => b.onclick = async () => { if (await Edu.confirm('Delete unit', `Delete "${b.dataset.name}" and everything below it? Classes stay but lose their unit.`, 'Delete', true)) try { await Edu.del(`/institutions/${id}/units/${b.dataset.del}`); reload('structure'); } catch (e) { Edu.toast(e.message, true); } });
  }

  async function members(body, d, reload) {
    const id = d.institution.id;
    const m = await Edu.get(`/institutions/${id}/members`);
    body.innerHTML = `<div class="row mb"><h2 class="spacer" style="margin:0">People (${m.members.length})</h2><button class="btn" id="add" type="button">+ Add a person</button></div>
      <div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Institution members</caption><thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Unit</th><th scope="col">Added</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${m.members.map(x => `<tr><td><b>${esc(x.display_name || x.username)}</b><div class="small muted">${esc(x.email || '')}</div></td><td>${esc(ROLE_LABELS[x.role] || x.role)}</td><td>${esc(x.unit_name || '')}</td><td>${Edu.fmtDate(x.added_at)}</td>
        <td><button class="btn ghost small" type="button" data-rm="${esc(x.user_id)}" data-name="${esc(x.display_name || x.username)}">Remove</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#add').onclick = async () => {
      const roles = d.role === 'inst_admin' ? ROLE_LABELS : Object.fromEntries(Object.entries(ROLE_LABELS).filter(([k]) => !['inst_admin', 'faculty_admin', 'research_admin'].includes(k)));
      const r = await Edu.dialog({ title: 'Add a person', body: `<div class="field"><label for="a-id">Username or email of a FactChecker Pro user</label><input id="a-id" type="text"></div>
        <div class="field"><label for="a-role">Role</label><select id="a-role">${Edu.opts(roles, 'teacher')}</select></div>
        <div class="field"><label for="a-unit">Unit <span class="hint">(required for faculty administrators)</span></label><select id="a-unit"><option value="">None</option>${d.units.map(u => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(KIND_LABELS[u.kind] || u.kind)})</option>`).join('')}</select></div>`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'ok', validate: dd => { const v = dd.querySelector('#a-id').value.trim(); return v.length < 3 ? false : { identifier: v, role: dd.querySelector('#a-role').value, unit_id: dd.querySelector('#a-unit').value || null }; } }] });
      if (!r) return;
      try { await Edu.post(`/institutions/${id}/members`, r); Edu.toast('Added'); reload('members'); } catch (e) { Edu.toast(e.message, true); }
    };
    $$('[data-rm]').forEach(b => b.onclick = async () => { if (await Edu.confirm('Remove person', `Remove ${b.dataset.name} from the institution?`, 'Remove', true)) try { await Edu.del(`/institutions/${id}/members/${b.dataset.rm}`); reload('members'); } catch (e) { Edu.toast(e.message, true); } });
  }

  function domains(body, d, reload) {
    const i = d.institution;
    body.innerHTML = `<div class="row mb"><h2 class="spacer" style="margin:0">Email domains</h2><button class="btn" id="add" type="button">+ Add a domain</button></div>
      <p class="muted small">Prove that you own a domain by adding a DNS TXT record. Once verified you can switch on automatic joining in the overview.</p>
      ${i.domains.length ? i.domains.map(x => `<div class="card"><div class="row"><h3 class="spacer">${esc(x.domain)}</h3>${x.verified ? Edu.chip('Verified', 'ok', '✔') : Edu.chip('Not verified yet', 'warn')}</div>
        ${x.verified ? '' : `<p class="small">Create a TXT record named <b>_factchecker-edu.${esc(x.domain)}</b> with the value <b>factchecker-edu-verify=${esc(x.token)}</b>, then press Verify. DNS changes can take a few hours.</p><div class="row"><button class="btn small" type="button" data-verify="${esc(x.domain)}">Verify</button><button class="btn ghost small" type="button" data-copy="factchecker-edu-verify=${esc(x.token)}">Copy value</button></div>`}
        <div class="row mt"><button class="btn ghost small" type="button" data-rm="${esc(x.domain)}">Remove</button></div></div>`).join('') : Edu.empty('🌐', 'No domains yet', 'Add the domain your staff and students use for email.', '')}`;
    $('#add').onclick = async () => {
      const dom = await Edu.prompt('Add a domain', 'Domain', '', 'for example school.nl');
      if (!dom) return;
      try { const r = await Edu.post(`/institutions/${i.id}/domains`, { domain: dom }); await Edu.dialog({ title: 'Verify ' + r.domain, body: `<p>Create this DNS record:</p><p class="small">Type: <b>TXT</b><br>Name: <b>${esc(r.record_name)}</b><br>Value: <b>${esc(r.record_value)}</b></p>`, actions: [{ label: 'OK', value: true }] }); reload('domains'); } catch (e) { Edu.toast(e.message, true); }
    };
    $$('[data-verify]').forEach(b => b.onclick = async () => { try { await Edu.post(`/institutions/${i.id}/domains/verify`, { domain: b.dataset.verify }); Edu.toast('Domain verified'); reload('domains'); } catch (e) { Edu.toast(e.message, true); } });
    $$('[data-copy]').forEach(b => b.onclick = () => Edu.copy(b.dataset.copy));
    $$('[data-rm]').forEach(b => b.onclick = async () => { if (await Edu.confirm('Remove domain', `Remove ${b.dataset.rm}?`, 'Remove', true)) try { await Edu.del(`/institutions/${i.id}/domains/${encodeURIComponent(b.dataset.rm)}`); reload('domains'); } catch (e) { Edu.toast(e.message, true); } });
  }

  async function report(body, d) {
    const id = d.institution.id;
    const draw = async (unit) => {
      body.innerHTML = '<div class="loading" role="status">Building the report</div>';
      const r = await Edu.get(`/institutions/${id}/report` + (unit ? '?unit_id=' + unit : ''));
      body.innerHTML = `
        <div class="row mb"><h2 class="spacer" style="margin:0">Reports</h2>
          <label for="unit" class="small">Unit</label><select id="unit"><option value="">${d.role === 'faculty_admin' ? 'My unit' : 'Whole institution'}</option>${d.units.map(u => `<option value="${esc(u.id)}" ${unit === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
          <button class="btn ghost" id="csv" type="button">Download CSV</button><button class="btn ghost" id="print" type="button">Print</button></div>
        <div class="stats"><div class="card stat"><b>${r.summary.classes}</b><span class="muted small">Classes</span></div><div class="card stat"><b>${r.summary.students}</b><span class="muted small">Students</span></div><div class="card stat"><b>${r.summary.submissions}</b><span class="muted small">Submissions</span></div></div>
        ${r.summary.common_difficulty ? `<div class="note mb"><b>Common difficulty:</b> ${esc(r.summary.common_difficulty)} has the lowest average. Consider the matching curriculum module.</div>` : ''}
        <div class="card"><h3>Competencies</h3>${r.competency.map(c => `<div class="comp"><div><b>${esc(c.name)}</b></div><div>${c.average == null ? '<span class="muted small">Not enough students yet</span>' : Edu.bar(c.average)}</div><div class="small">${c.average == null ? '' : c.average + ' of 100'}</div></div>`).join('')}</div>
        <div class="card mt tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption>By unit</caption><thead><tr><th scope="col">Unit</th><th scope="col">Type</th><th scope="col">Classes</th><th scope="col">Students</th><th scope="col">Completion</th></tr></thead>
          <tbody>${r.units.map(u => `<tr><td>${esc(u.unit)}</td><td>${esc(KIND_LABELS[u.kind] || '')}</td><td>${u.classes}</td><td>${u.students}</td><td>${u.suppressed ? '<span class="muted">hidden, fewer than 5 students</span>' : (u.completion_percent == null ? '' : u.completion_percent + '%')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No classes attached yet.</td></tr>'}</tbody></table></div>
        <div class="card mt tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption>By class</caption><thead><tr><th scope="col">Class</th><th scope="col">Unit</th><th scope="col">Students</th><th scope="col">Assignments</th><th scope="col">Completion</th>${Edu.ref.competencies.map(c => `<th scope="col">${esc(c.name)}</th>`).join('')}</tr></thead>
          <tbody>${r.classes.map(c => `<tr><td>${esc(c.class)}</td><td>${esc(c.unit || '')}</td><td>${c.students}</td><td>${c.assignments}</td><td>${c.completion_percent == null ? '' : c.completion_percent + '%'}</td>${Edu.ref.competencies.map(k => `<td>${c.competency_averages[k.key] == null ? '<span class="muted">n/a</span>' : c.competency_averages[k.key]}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="9" class="muted">No classes.</td></tr>'}</tbody></table></div>
        <div class="cols2 mt"><div class="card"><h3>Module results</h3>${r.modules.length ? `<ul class="stack" style="list-style:none;padding:0">${r.modules.map(m => `<li>${esc(m.title)}: <b>${m.average}</b> average (${m.students} students)</li>`).join('')}</ul>` : '<p class="muted small">Shown once at least 5 students completed a module.</p>'}</div>
          <div class="card"><h3>Teacher adoption</h3><ul class="stack" style="list-style:none;padding:0"><li>Teachers in the institution: <b>${r.teacher_adoption.teachers_in_institution}</b></li><li>With a class: <b>${r.teacher_adoption.teachers_with_class}</b></li><li>Created an assignment: <b>${r.teacher_adoption.teachers_with_assignment}</b></li><li>Created two or more: <b>${r.teacher_adoption.teachers_with_two_or_more}</b></li></ul></div></div>
        <div class="card mt"><h3>Submissions per week (last 12 weeks)</h3>${r.engagement_trend.length ? `<div class="row" style="align-items:flex-end;gap:6px">${r.engagement_trend.map(w => `<div style="text-align:center"><div style="background:var(--accent,#1f5f8b);width:22px;height:${Math.max(4, w.n * 6)}px"></div><div class="small">${w.n}</div><div class="small muted">${esc(w.week.slice(5))}</div></div>`).join('')}</div>` : '<p class="muted small">No submissions yet.</p>'}</div>
        <p class="small muted mt">${esc(r.privacy_note)}</p>`;
      $('#unit').onchange = e => draw(e.target.value);
      $('#print').onclick = () => window.print();
      $('#csv').onclick = () => {
        const head = ['Class', 'Unit', 'Students', 'Assignments', 'Completion %', ...Edu.ref.competencies.map(c => c.name + ' (0-100)')];
        Edu.saveFile('institution-report.csv', '﻿' + Edu.csv([head, ...r.classes.map(c => [c.class, c.unit, c.students, c.assignments, c.completion_percent, ...Edu.ref.competencies.map(k => c.competency_averages[k.key])])]));
      };
    };
    await draw('');
  }

  async function apiKeys(body, d, reload) {
    const id = d.institution.id;
    const k = await Edu.get(`/institutions/${id}/api-keys`);
    body.innerHTML = `<div class="row mb"><h2 class="spacer" style="margin:0">API keys</h2><button class="btn" id="new" type="button">+ New key</button></div>
      <p class="muted small">Keys let your learning management system or a partner read class lists and progress. Keys are read only except for linking a class to an external course id. Send the key in the <b>X-API-Key</b> header.</p>
      <div class="card"><h3>Endpoints</h3><ul class="small" style="padding-left:1.2rem"><li><b>GET /api/edu/v1/classes</b>: classes of the institution</li><li><b>GET /api/edu/v1/classes/{id}/progress</b>: students, submissions and competency indicators</li><li><b>PATCH /api/edu/v1/classes/{id}</b> with external_ref: link to an external course</li><li><b>GET /api/edu/v1/credentials</b>: certificates of members</li></ul><p class="small muted">Limit: 120 requests per minute per key.</p></div>
      ${k.keys.length ? `<div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">API keys</caption><thead><tr><th scope="col">Name</th><th scope="col">Key starts with</th><th scope="col">Created</th><th scope="col">Last used</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${k.keys.map(x => `<tr><td>${esc(x.name)}</td><td><code>${esc(x.prefix)}</code></td><td>${Edu.fmtDate(x.created_at)}</td><td>${x.last_used_at ? Edu.fmtDate(x.last_used_at) : 'Never'}</td><td>${x.revoked ? Edu.chip('Revoked', 'bad') : Edu.chip('Active', 'ok', '✔')}</td><td>${x.revoked ? '' : `<button class="btn ghost small" type="button" data-rev="${esc(x.id)}">Revoke</button>`}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
    $('#new').onclick = async () => {
      const name = await Edu.prompt('New API key', 'What will it be used for?', '', 'for example Moodle sync'); if (!name) return;
      try { const r = await Edu.post(`/institutions/${id}/api-keys`, { name }); await Edu.dialog({ title: 'Copy your key now', body: `<p class="small">${esc(r.note)}</p><p><code data-notr style="word-break:break-all">${esc(r.key)}</code></p>`, actions: [{ label: 'Copy key', value: 'copy' }, { label: 'Done', value: true }] }).then(v => { if (v === 'copy') Edu.copy(r.key, 'Key copied'); }); reload('api'); } catch (e) { Edu.toast(e.message, true); }
    };
    $$('[data-rev]').forEach(b => b.onclick = async () => { if (await Edu.confirm('Revoke key', 'Systems using this key stop working immediately.', 'Revoke', true)) try { await Edu.del(`/institutions/${id}/api-keys/${b.dataset.rev}`); reload('api'); } catch (e) { Edu.toast(e.message, true); } });
  }

  async function auditLog(body, d) {
    const a = await Edu.get(`/institutions/${d.institution.id}/audit`);
    body.innerHTML = `<h2>Audit log</h2><p class="muted small">The last 200 administrative actions.</p>
      <div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Audit log</caption><thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Detail</th></tr></thead>
      <tbody>${a.entries.map(e => `<tr><td>${Edu.fmtDateTime(e.created_at)}</td><td>${esc(e.actor || '')}</td><td>${esc(ACTION_LABELS[e.action] || e.action)}</td><td>${esc(e.target || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>'}</tbody></table></div>`;
  }

  // ── trends ─────────────────────────────────────────────────────────────────
  V.trends = async function () {
    const t = await Edu.get('/trends');
    Edu.render('Trends', `
      <div class="page-head"><div><h1>Misinformation trends</h1><p class="lead">Which topics people are investigating most, over the last ${t.window_weeks} weeks. Aggregated and privacy safe.</p></div></div>
      <div class="note mb">${esc(t.privacy_note)}</div>
      ${t.series.some(s => s.alert) ? `<div class="note warn mb" role="status"><b>Rising now:</b> ${t.series.filter(s => s.alert).map(s => esc(TOPIC_LABELS[s.topic] || s.topic)).join(', ')}.</div>` : ''}
      ${t.series.length ? `<div class="card tbl-wrap" style="padding:6px 10px"><table class="tbl"><caption class="sr-only">Topic trends</caption><thead><tr><th scope="col">Topic</th><th scope="col">Last 4 weeks</th><th scope="col">Trend</th><th scope="col">Weekly (people)</th></tr></thead>
        <tbody>${t.series.map(s => `<tr><td><b>${esc(TOPIC_LABELS[s.topic] || s.topic)}</b></td><td>${s.last4weeks == null ? '<span class="muted">hidden</span>' : s.last4weeks}</td><td>${s.rising ? Edu.chip('Rising', s.alert ? 'bad' : 'warn', '▲') : Edu.chip('Steady')}</td>
          <td><span class="spark" aria-hidden="true">${s.points.map(p => `<i style="height:${p.people == null ? 3 : Math.max(4, Math.min(40, p.people * 2))}px"></i>`).join('')}</span></td></tr>`).join('')}</tbody></table></div>` : Edu.empty('📈', 'Not enough data yet', 'Topics appear when at least 5 different people worked on them in a week.', '')}
      ${t.common_claims.length ? `<h2 class="mt">Claims investigated in several classes</h2><div class="card"><ul class="stack" style="padding-left:1.2rem">${t.common_claims.map(c => `<li>${esc(c.claim)} <span class="muted small">(${c.teachers} teachers, ${c.people} students)</span></li>`).join('')}</ul></div>` : ''}`);
  };
})();
