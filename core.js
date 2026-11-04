(function (root) {
  'use strict';
  var TOKEN = /--\[(=*)\[[\s\S]*?\]\1\]|--[^\n]*|\[(=*)\[[\s\S]*?\]\2\]|"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'/g;
  var STR = /"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'/g;

  function quote(s) {
    var r = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i], n = s.charCodeAt(i);
      if (c === '"') r += '\\"'; else if (c === '\\') r += '\\\\'; else if (c === '\n') r += '\\n';
      else if (c === '\r') r += '\\r'; else if (c === '\t') r += '\\t';
      else if (n < 32 || n === 127) r += '\\' + n; else r += c;
    }
    return '"' + r + '"';
  }

  function decodeLiteral(lit, ctr) {
    var q = lit[0];
    return q + lit.slice(1, -1).replace(/\\(?:(\d{1,3})|x([0-9a-fA-F]{2})|u\{([0-9a-fA-F]+)\}|([\s\S]))/g, function (m, d, x, u) {
      var c;
      if (d !== undefined) c = parseInt(d, 10); else if (x !== undefined) c = parseInt(x, 16);
      else if (u !== undefined) c = parseInt(u, 16); else return m;
      if (c > 1114111 || (d !== undefined && c > 255)) return m;
      var ch = String.fromCodePoint(c);
      if (c === 10) return '\\n';
      if (c < 32 || c === 127) return m;
      if (ch === '\\') return '\\\\';
      if (ch === q) return '\\' + q;
      ctr.n++; return ch;
    }) + q;
  }

  function format(code) {
    var saved = [];
    var t = code.replace(TOKEN, function (m) { saved.push(m); return '\u0001' + (saved.length - 1) + '\u0002'; });
    t = t.replace(/;/g, ';\n').replace(/\b(then|do|repeat)\b/g, '$1\n').replace(/\b(end)\b/g, '\n$1\n')
      .replace(/\b(else)\b(?!if)/g, '\n$1\n').replace(/\b(elseif|until)\b/g, '\n$1')
      .replace(/\b(local|return)\b/g, '\n$1').replace(/\n\s*(\)[\s,;)]*)/g, '$1');
    var L = 0, res = [];
    t.split('\n').forEach(function (raw) {
      var ln = raw.trim(); if (!ln) return;
      var p = ln.replace(/\u0001\d+\u0002/g, '""');
      var opens = (p.match(/\b(function|do|then|repeat)\b|\{/g) || []).length;
      var closes = (p.match(/\b(end|until)\b|\}/g) || []).length;
      var lead = /^(end|until|else|elseif|\})/.test(p);
      if (/^elseif\b/.test(p)) opens--;
      res.push('  '.repeat(Math.max(0, L - (lead ? 1 : 0))) + ln);
      L = Math.max(0, L + opens - closes);
    });
    return res.join('\n').replace(/\u0001(\d+)\u0002/g, function (m, i) { return saved[+i]; }).replace(/[ \t]+$/gm, '') + '\n';
  }

  function cleanup(src, o) {
    o = Object.assign({ chr: true, esc: true, cat: true, hex: true, fmt: true }, o || {});
    var s = String(src), st = { chr: 0, esc: 0, cat: 0, hex: 0 };
    if (o.chr) s = s.replace(/string\s*\.\s*char\s*\(\s*((?:(?:0[xX][0-9a-fA-F]+|\d+)\s*,\s*)*(?:0[xX][0-9a-fA-F]+|\d+))\s*\)/g, function (m, list) {
      var codes = list.split(',').map(function (v) { return Number(v.trim()); });
      if (codes.some(function (c) { return !(c >= 0 && c <= 255); })) return m;
      st.chr++; return quote(String.fromCharCode.apply(null, codes));
    });
    if (o.esc) { var ctr = { n: 0 }; s = s.replace(TOKEN, function (m) { return (m[0] === '"' || m[0] === "'") ? decodeLiteral(m, ctr) : m; }); st.esc = ctr.n; }
    if (o.cat) {
      var prev;
      do {
        prev = s;
        s = s.replace(/"((?:[^"\\\n]|\\[\s\S])*)"\s*\.\.\s*"((?:[^"\\\n]|\\[\s\S])*)"/g, function (m, a, b) {
          if (/\\$/.test(a.replace(/\\\\/g, ''))) return m; st.cat++; return '"' + a + b + '"';
        });
      } while (s !== prev);
    }
    if (o.hex) {
      var kept = [];
      s = s.replace(TOKEN, function (m) { kept.push(m); return '\u0001' + (kept.length - 1) + '\u0002'; })
        .replace(/\b0[xX][0-9a-fA-F]{1,13}\b/g, function (m) { st.hex++; return String(parseInt(m, 16)); })
        .replace(/\u0001(\d+)\u0002/g, function (m, i) { return kept[+i]; });
    }
    if (o.fmt) s = format(s);
    return { code: s, stats: st };
  }

  // level: 3 = serious, 2 = worth a look, 1 = good to know
  var RULES = [
    [3, /discord(?:app)?\.com\/api\/webhooks\/[\w\/-]+/, 'Sends data to a Discord webhook', 'Scripts that steal information often send it to a webhook like this. Only trust it if you know why it is there.'],
    [3, /\.ROBLOSECURITY|roblosecurity/, 'Mentions the Roblox login cookie', 'That cookie is the key to your account. No normal script needs it.'],
    [3, /\brequire\s*\(\s*\d{6,}\s*\)/, 'Loads a hidden module by asset ID', 'The real code lives somewhere else and can change at any time. This is a common backdoor trick.'],
    [3, /grabify|iplogger|api\.ipify|ip-api|ipinfo\.io/, 'Looks up or logs your IP address', 'Tracking links and IP lookups are used to find out where you are.'],
    [2, /\bloadstring\b/, 'Runs code from text (loadstring)', 'The script can build and run code you cannot see here, for example code it downloads.'],
    [2, /HttpGet(?:Async)?|HttpPost(?:Async)?|\bhttp_request\b|\bsyn\.request\b|\brequest\s*\(\s*\{/, 'Talks to the internet', 'It downloads or sends data. Check the links listed below.'],
    [2, /\b(?:writefile|readfile|appendfile|delfile|makefolder|listfiles)\s*\(/, 'Reads or writes files on your PC', 'These only work in script executors and can touch files outside the game.'],
    [2, /\bos\.execute|\bio\.popen|\bos\.getenv/, 'Runs system commands', 'This can run programs on your computer.'],
    [2, /Prompt(?:GamePass|Product|Bundle)?Purchase\s*\(|PromptPremiumPurchase/, 'Opens Robux purchase pop-ups', 'Make sure you read what you are asked to buy before you click.'],
    [2, /["'][A-Za-z0-9+\/=]{200,}["']/, 'Contains a very long encoded string', 'Large blocks of random-looking text usually hide more code.'],
    [1, /\b(?:getfenv|setfenv|getrawmetatable|setrawmetatable|hookfunction|hookmetamethod|newcclosure|checkcaller|getgc|getupvalues?)\b/, 'Uses advanced executor functions', 'Normal in exploits and anti-cheat tools, rare anywhere else.'],
    [1, /\b(?:setclipboard|toclipboard)\s*\(/, 'Copies text to your clipboard', 'Check what it copies before you paste anything.'],
    [1, /TeleportService|:Teleport(?:ToPlaceInstance)?\s*\(/, 'Can teleport you to another game', 'It may move you out of the game you are in.'],
    [1, /:Kick\s*\(/, 'Can kick players', 'Fine for admin tools, unexpected in anything else.'],
    [1, /\bbase64|b64decode|fromBase64/i, 'Decodes Base64 text', 'Often used to hide what a script really does.']
  ];

  function scan(src) {
    var d = cleanup(src, { fmt: false }).code, f = [];
    RULES.forEach(function (r) {
      var re = new RegExp(r[1].source, 'gi'), m, n = 0, first = null;
      while ((m = re.exec(d)) && n < 99) { if (!first) first = m; n++; if (!m[0]) re.lastIndex++; }
      if (n) f.push({ level: r[0], title: r[2], why: r[3], count: n, line: d.slice(0, first.index).split('\n').length,
        snippet: d.slice(Math.max(0, first.index - 25), first.index + 70).replace(/\s+/g, ' ').trim() });
    });
    var esc = (String(src).match(/\\\d{2,3}/g) || []).length;
    if (esc > 30) f.push({ level: 1, title: 'Script is obfuscated', why: 'It is written to be hard to read (' + esc + ' escape codes). Use Cleanup to make it readable first.', count: esc, line: 1, snippet: '' });
    f.sort(function (a, b) { return b.level - a.level; });
    var top = f.length ? f[0].level : 0;
    return { level: top === 3 ? 'high' : top === 2 ? 'medium' : 'none', findings: f, urls: inspect(src).urls };
  }

  function tally(list) {
    var m = {}; list.forEach(function (x) { m[x] = (m[x] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { text: k, count: m[k] }; }).sort(function (a, b) { return b.count - a.count; });
  }

  function inspect(src) {
    var d = cleanup(src, { fmt: false }).code, strings = [], calls = [];
    (d.match(STR) || []).forEach(function (s) { var v = s.slice(1, -1); if (v.length >= 3) strings.push(v); });
    var urls = tally(d.match(/https?:\/\/[^\s"'<>)\]\\]+/g) || []);
    var skip = /^(if|while|for|function|return|and|or|not|elseif|until|in|do|then)$/;
    d.replace(STR, '""').replace(/--[^\n]*/g, '').replace(/\b([A-Za-z_][\w]*(?:[.:][A-Za-z_]\w*)*)\s*\(/g, function (m, n) { if (!skip.test(n)) calls.push(n); return m; });
    return { strings: tally(strings), urls: urls, calls: tally(calls) };
  }

  var api = { cleanup: cleanup, scan: scan, inspect: inspect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LuaScriptFucker = api;
})(typeof window !== 'undefined' ? window : this);
