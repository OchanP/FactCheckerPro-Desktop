/* FactChecker Pro Education: open the classic tools with context.
   The classic hub opens in its own window with the claim or link already filled in.
   Nothing is sent to the education server from here. */
(function () {
  'use strict';
  const { esc } = Edu;

  Edu.TOOLS = [
    { key: 'check', label: 'Claim Check', help: 'Run the claim through the FactChecker Pro checker.' },
    { key: 'social', label: 'Social Intel and research tools', help: 'Search platforms and open reverse image, archive and fact check sites.' },
    { key: 'newsfeed', label: 'FactNews', help: 'Find related reporting and credibility ratings.' },
  ];

  Edu.openTool = function (tool, ctx) {
    ctx = ctx || {};
    const msg = { type: 'FC_OPEN_HUB', tab: { tab: tool, text: ctx.text || '', url: ctx.url || '', sitab: ctx.sitab || (tool === 'social' ? 'research' : '') } };
    return fc.runtime.sendMessage(msg);
  };

  /** Ask which tool to open, then open it. ctx = { text, url } */
  Edu.openToolsDialog = async function (ctx) {
    ctx = ctx || {};
    const body = `
      <p class="muted small">The classic tools open in a separate window. ${ctx.text ? 'Your claim is filled in for you.' : ''}</p>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="sr-only">Tool</legend>
        ${Edu.TOOLS.map((t, i) => `<label class="radio"><input type="radio" name="tool" value="${t.key}" ${i === 0 ? 'checked' : ''}> <span><b>${esc(t.label)}</b><br><span class="small muted">${esc(t.help)}</span></span></label>`).join('')}
      </fieldset>
      <p class="note mt small">The tools can show an automatic verdict. Follow the rules your teacher set for this assignment, and reach your own conclusion first.</p>`;
    const r = await Edu.dialog({ title: 'Open in classic tools', body, actions: [{ label: 'Cancel', value: null }, { label: 'Open', value: 'ok', validate: d => (d.querySelector('input[name="tool"]:checked') || {}).value || '' }] });
    if (!r) return;
    await Edu.openTool(r, ctx);
  };
})();
