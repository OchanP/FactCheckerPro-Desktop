/* FactChecker Pro Education: translation engine.
   Source strings are English. Edu.NL maps English text to Dutch. Entries may contain {0}, {1}
   placeholders that capture numbers or names. The page is translated as it is built, so
   views do not need to know about languages. Add text to edu-nl.js to translate it. */
(function () {
  'use strict';
  const NL = (window.Edu && Edu.NL) || {};
  const exact = new Map();
  const patterns = [];
  const esc = s => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  Object.keys(NL).forEach(k => {
    if (/\{\d+\}/.test(k)) {
      const re = new RegExp('^' + esc(k).replace(/\\?\{(\d+)\\?\}/g, '(.+?)').replace(/\{(\d+)\}/g, '(.+?)') + '$');
      patterns.push({ re, to: NL[k] });
    } else exact.set(k, NL[k]);
  });
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  Edu.missing = new Set();

  const norm = s => s.replace(/\s+/g, ' ').trim();
  function lookup(text) {
    const key = norm(text);
    if (!key) return null;
    if (exact.has(key)) return exact.get(key);
    for (const p of patterns) {
      const m = key.match(p.re);
      if (m) return p.to.replace(/\{(\d+)\}/g, (_, i) => { const v = m[Number(i) + 1] || ''; return exact.get(v) || v; });
    }
    return null;
  }
  /** Translate one string in code. English passes through. */
  Edu.t = function (s) {
    if (Edu.lang !== 'nl' || s == null) return s;
    const r = lookup(String(s));
    return r == null ? s : r;
  };

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  function tx(node) {
    if (node.nodeType === 3) {
      const raw = node.nodeValue;
      const key = norm(raw);
      if (!key || /^[\d\s.,:;%·()/+\-–|•✔✎➜○✕×]+$/.test(key)) return;
      const r = lookup(raw);
      if (r != null) {
        const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
        const nv = lead + r + trail;
        if (nv !== raw) node.nodeValue = nv;
      } else if (/[A-Za-z]{3}/.test(key)) Edu.missing.add(key);
      return;
    }
    if (node.nodeType !== 1 || node.hasAttribute('data-notr') || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    ATTRS.forEach(a => {
      if (node.hasAttribute(a)) {
        const v = node.getAttribute(a), r = lookup(v);
        if (r != null) { if (r !== v) node.setAttribute(a, r); } else if (/[A-Za-z]{3}/.test(v)) Edu.missing.add(norm(v));
      }
    });
    if (!SKIP.has(node.tagName)) node.childNodes.forEach(tx);
  }
  Edu.translateDom = function (root) { if (Edu.lang === 'nl') tx(root || document.body); };

  // Page title and static parts.
  function start() {
    if (Edu.lang !== 'nl') return;
    let busy = false;
    const obs = new MutationObserver(muts => {
      if (busy) return;
      busy = true;
      try {
        muts.forEach(m => {
          if (m.type === 'childList') m.addedNodes.forEach(n => tx(n));
          else if (m.type === 'characterData') tx(m.target);
          else if (m.type === 'attributes') tx(m.target);
        });
      } finally { busy = false; }
    });
    tx(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    const t = document.querySelector('title');
    const setTitle = () => { const r = lookup(document.title.replace(/ \| FactChecker Pro Education$/, '')); if (r != null) { const nt = r + ' | FactChecker Pro Education'; if (nt !== document.title) document.title = nt; } };
    new MutationObserver(setTitle).observe(t, { childList: true, characterData: true, subtree: true });
  }
  Edu._i18nStart = start;
  start();
})();
