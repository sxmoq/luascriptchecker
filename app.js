(function () {
  'use strict';
  var L = window.LuaScriptFucker, $ = function (id) { return document.getElementById(id); };
  var REPO = 'https://github.com/sxmoq/luascriptchecker';
  var src = '', fname = '', lastReport = '';
  var VIEWS = {
    dump: ['Dumper', 'See what a script really does: risky behavior, links, text and function calls.'],
    clean: ['Deobfuscator', 'Turn an unreadable script into something you can read.'],
    byte: ['Bytecode', 'Read the text hidden inside compiled Luau or Lua files.'],
    api: ['API', 'Use the same tools from your own JavaScript.'],
    hist: ['History', 'Scripts you recently dumped, cleaned or checked.'],
    give: ['Contribute', 'Help make the scanner smarter.']
  };
  var NEEDS = { dump: 1, clean: 1 };
  var SAMPLE = 'local a=string.char(112,114,105,110,116);local b="\\72\\101\\108\\108\\111".." ".."\\87\\111\\114\\108\\100";local _0x1a2b=0x2A;local hook="https://discord.com/api/webhooks/123/abc";for i=1,3 do if i==2 then local f=function()return _0x1a2b end else warn("\\x74\\x69\\x63\\x6B") end end loadstring(game:HttpGet("https://example.com/run.lua"))() print(b,_0x1a2b)';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function msg(t) { $('msg').textContent = t || ''; }
  function need() { if (!src.trim()) { msg('Add a script first: drop a file or paste code above.'); return false; } msg(''); return true; }
  function dl(name, text) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function setSrc(text, name) {
    src = text; fname = name || ''; $('inp').value = text;
    $('count').textContent = text ? text.split('\n').length + ' lines' : '';
    $('dropTxt').textContent = name ? 'Loaded ' + name + '. Drop another file to replace it.' : 'Drop a .lua or .luau file here, or click to browse';
  }
  function bump(k) { var s = store('lsf_stats') || { scans: 0, risky: 0, cleans: 0 }; s[k]++; store('lsf_stats', s); }
  function addHist(kind, summary, text, name) {
    var h = store('lsf_hist') || [];
    h.unshift({ t: Date.now(), kind: kind, name: name || fname || 'Pasted script', summary: summary, src: (text !== undefined ? text : src).slice(0, 30000) });
    h = h.slice(0, 20);
    if (store('lsf_hist', h) === null && !store('lsf_hist')) store('lsf_hist', h.slice(0, 5));
  }

  var view = 'dump';
  function show(v) {
    view = v;
    document.querySelectorAll('.side button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    document.querySelectorAll('.view').forEach(function (s) { s.hidden = s.id !== 'v-' + v; });
    $('inputCard').hidden = !NEEDS[v];
    $('title').textContent = VIEWS[v][0]; $('sub').textContent = VIEWS[v][1];
    msg('');
    if (v === 'dump') stats(); if (v === 'hist') hist();
  }
  function stats() {
    var s = store('lsf_stats') || { scans: 0, risky: 0, cleans: 0 };
    $('statCards').innerHTML = [['Scripts dumped', s.scans], ['Flagged as risky', s.risky], ['Cleanups done', s.cleans]]
      .map(function (c) { return '<div class="stat"><b>' + c[1] + '</b><span>' + c[0] + '</span></div>'; }).join('') + '<p class="muted full">Counted on this device only.</p>';
  }

  function verdictHtml(r) {
    var v = { high: ['bad', 'Looks risky', 'Found serious warning signs. Do not run this script unless you fully trust where it came from.'],
      medium: ['warn', 'Be careful', 'Found things worth checking before you run this script.'],
      none: ['ok', 'Nothing alarming found', 'This only checks the text. It does not run the script, so it can’t prove a script is safe.'] }[r.level];
    return { title: v[1], html: '<div class="verdict ' + v[0] + '"><h2>' + v[1] + '</h2><p>' + v[2] + '</p><div class="meter"><i style="width:' + Math.max(r.score, 3) + '%"></i></div><span class="muted">Risk score ' + r.score + ' out of 100</span></div>' };
  }
  function findingsHtml(r) {
    if (!r.findings.length) return '';
    return '<h3>What was found</h3>' + r.findings.map(function (f) {
      return '<article class="find l' + f.level + '"><div class="fh"><b>' + esc(f.title) + '</b><span class="muted">' + (f.count > 1 ? f.count + ' times, ' : '') + 'first on line ' + f.line + '</span></div><p>' + esc(f.why) + '</p>' +
        (f.snippet ? '<code>' + esc(f.snippet) + '</code>' : '') + '</article>';
    }).join('');
  }
  function det(title, items, cap, open) {
    var body = items.length ? '<ul class="plain">' + items.slice(0, cap).map(function (i) {
      return '<li><code>' + esc(i.text.length > 140 ? i.text.slice(0, 140) + '…' : i.text) + '</code>' + (i.count > 1 ? '<span class="muted"> ×' + i.count + '</span>' : '') + '</li>';
    }).join('') + '</ul>' + (items.length > cap ? '<p class="muted">Showing the first ' + cap + '.</p>' : '') : '<p class="muted">None found.</p>';
    return '<details' + (open ? ' open' : '') + '><summary>' + title + ' <span class="muted">(' + items.length + ')</span></summary>' + body + '</details>';
  }

  function dump() {
    if (!need()) return;
    var r = L.scan(src), i = L.inspect(src), v = verdictHtml(r);
    $('dumpOut').innerHTML = v.html + findingsHtml(r) + '<h3>Everything inside</h3>' + det('Links', i.urls, 100, true) + det('Text strings', i.strings, 150, false) + det('Function calls', i.calls, 100, false) +
      '<div class="row"><button class="ghost sm" data-act="report">Save report (.txt)</button></div>';
    lastReport = ['LuaScriptFucker report', 'File: ' + (fname || 'pasted script'), 'Verdict: ' + v.title + ' (risk score ' + r.score + '/100)', '',
      'Findings:'].concat(r.findings.length ? r.findings.map(function (f) { return '- ' + f.title + ' (line ' + f.line + '): ' + f.why; }) : ['- none'])
      .concat(['', 'Links:'], i.urls.length ? i.urls.map(function (u) { return '- ' + u.text; }) : ['- none']).join('\n');
    bump('scans'); if (r.level === 'high') bump('risky'); stats();
    addHist('Dump', v.title + (r.findings.length ? ', ' + r.findings.length + ' finding' + (r.findings.length > 1 ? 's' : '') : ''));
  }
  $('dumpOut').addEventListener('click', function (e) { if (e.target.dataset.act === 'report') dl('report.txt', lastReport); });

  function opts() { return { chr: $('oChar').checked, esc: $('oEsc').checked, cat: $('oCat').checked, hex: $('oHex').checked, ren: $('oRen').checked, b64: $('oB64').checked, fmt: $('oFmt').checked }; }
  function clean(log) {
    if (!need()) return;
    var r = L.cleanup(src, opts()), st = r.stats, p = [];
    $('out').value = r.code;
    if (st.chr) p.push(st.chr + ' string.char folded'); if (st.esc) p.push(st.esc + ' escapes decoded');
    if (st.cat) p.push(st.cat + ' strings joined'); if (st.hex) p.push(st.hex + ' hex numbers converted');
    if (st.ren) p.push(st.ren + ' names renamed'); if (st.b64) p.push(st.b64 + ' Base64 strings decoded');
    $('cleanStats').textContent = p.length ? p.join(', ') + '.' : 'Nothing to simplify with the selected steps.';
    if (log) { bump('cleans'); addHist('Cleanup', p.length ? p.join(', ') : 'No changes'); }
  }

  function readBytes(f) {
    if (!f) return; var fr = new FileReader();
    fr.onload = function () {
      var res = L.bytecode(new Uint8Array(fr.result)), html = '', texts = res.strings.join('\n');
      html += '<dl class="kv"><dt>File</dt><dd>' + esc(f.name) + '</dd><dt>Type</dt><dd>' + esc(res.kind) + '</dd><dt>Size</dt><dd>' + (res.size / 1024).toFixed(1) + ' KB</dd>' +
        (res.version ? '<dt>Bytecode version</dt><dd>' + res.version + '</dd>' : '') +
        '<dt>How text was found</dt><dd>' + (res.parsed ? 'Read from the bytecode’s string table' : 'Scanned the file for readable text') + '</dd></dl>';
      var title = res.kind;
      if (res.strings.length) {
        var r = L.scan(texts), v = verdictHtml(r); title = v.title;
        html += v.html + findingsHtml(r) + '<h3>Text found</h3>' + det('Strings', res.strings.map(function (t) { return { text: t, count: 1 }; }), 300, true);
      } else html += '<p class="empty">No readable text found in this file.</p>';
      $('byteOut').innerHTML = html;
      addHist('Bytecode', title, texts, f.name);
    };
    fr.readAsArrayBuffer(f);
  }

  function hist() {
    var h = store('lsf_hist') || [];
    $('histOut').innerHTML = h.length ? h.map(function (e, i) {
      return '<div class="hrow"><span class="tag">' + esc(e.kind) + '</span><div class="grow"><b>' + esc(e.name) + '</b><div class="muted">' + esc(e.summary) + ' · ' + new Date(e.t).toLocaleString() + '</div></div><button class="ghost sm" data-i="' + i + '">Open</button></div>';
    }).join('') : '<p class="empty">Nothing here yet. Dump or clean a script and it shows up here.</p>';
  }

  document.querySelectorAll('.side button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.v); }); });
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.seg button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('tUp').hidden = b.dataset.t !== 'up'; $('inp').hidden = b.dataset.t === 'up';
      if (b.dataset.t === 'paste') $('inp').focus();
    });
  });
  $('inp').addEventListener('input', function () { setSrc($('inp').value, ''); });
  $('bSample').addEventListener('click', function () { setSrc(SAMPLE, 'example'); msg('Example loaded. Pick a tool on the left, then press its button.'); });
  $('bClear').addEventListener('click', function () {
    setSrc('', ''); $('out').value = ''; $('dumpOut').innerHTML = ''; $('cleanStats').textContent = ''; msg('');
  });

  function wireDrop(zone, input, handler) {
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function (e) { handler(e.target.files[0]); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('drag'); }); });
    zone.addEventListener('drop', function (e) { handler(e.dataTransfer.files[0]); });
  }
  function readText(f) { if (!f) return; var r = new FileReader(); r.onload = function () { setSrc(String(r.result), f.name); msg(''); }; r.readAsText(f); }
  wireDrop($('tUp'), $('file'), readText);
  wireDrop($('bDrop'), $('bFile'), readBytes);

  $('bDump').addEventListener('click', dump);
  $('bClean').addEventListener('click', function () { clean(true); });
  ['oChar', 'oEsc', 'oCat', 'oHex', 'oRen', 'oB64', 'oFmt'].forEach(function (id) { $(id).addEventListener('change', function () { if ($('out').value) clean(false); }); });
  $('bUse').addEventListener('click', function () { if ($('out').value) { setSrc($('out').value, fname); msg('The cleaned script is now your input.'); } });
  $('bCopy').addEventListener('click', function () {
    var b = $('bCopy'), done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1200); };
    if (navigator.clipboard) navigator.clipboard.writeText($('out').value).then(done); else { $('out').select(); document.execCommand('copy'); done(); }
  });
  $('bSave').addEventListener('click', function () { dl('cleaned.lua', $('out').value); });
  $('histOut').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    var h = (store('lsf_hist') || [])[+b.dataset.i]; if (!h) return;
    setSrc(h.src, h.name); show(h.kind === 'Cleanup' ? 'clean' : 'dump');
  });
  $('bWipe').addEventListener('click', function () { store('lsf_hist', []); hist(); });

  $('gSend').addEventListener('click', function () {
    var t = $('gType').value, title = $('gTitle').value.trim(), body = $('gBody').value.trim();
    if (!title) { msg('Give your suggestion a short title first.'); return; }
    msg('');
    window.open(REPO + '/issues/new?title=' + encodeURIComponent('[' + t + '] ' + title) + '&body=' + encodeURIComponent('**Type:** ' + t + '\n\n' + (body || '(no details)') + '\n\n_Sent from the LuaScriptFucker website._'), '_blank', 'noopener');
  });

  show('dump');
})();
