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
    o = Object.assign({ chr: true, esc: true, cat: true, hex: true, fmt: true, b64: false, ren: true }, o || {});
    var s = String(src), st = { chr: 0, esc: 0, cat: 0, hex: 0, b64: 0, ren: 0 };
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
    if (o.b64) {
      s = s.replace(/"([A-Za-z0-9+\/]{16,}={0,2})"/g, function (m, b) {
        try { var d = atob(b); if (d.length >= 8 && /^[\t\n\r\x20-\x7e]+$/.test(d)) { st.b64++; return quote(d); } } catch (e) {}
        return m;
      });
    }
    if (o.ren) {
      var keep = [], map = {}, n = 0;
      s = s.replace(TOKEN, function (m) { keep.push(m); return '\u0001' + (keep.length - 1) + '\u0002'; })
        .replace(/\b(?:_0x[0-9a-fA-F]+|[Il][IlO01]{4,})\b/g, function (m) { if (!map[m]) { map[m] = 'var' + (++n); } return map[m]; })
        .replace(/\u0001(\d+)\u0002/g, function (m, i) { return keep[+i]; });
      st.ren = n;
    }
    if (o.fmt) s = format(s);
    return { code: s, stats: st };
  }

  /* ------------------------------------------------------------------ *
   *  Known places a script can load code from
   * ------------------------------------------------------------------ */
  var HOSTS = [
    // well-known libraries and tools: loading these is normal
    { re: /sirius\.menu\/rayfield|SiriusSoftwareLtd\/Rayfield/i, name: 'Rayfield', cls: 'lib' },
    { re: /shlexware\/Orion\b/i, name: 'Orion', cls: 'lib' },
    { re: /xHeptc\/Kavo-UI-Library/i, name: 'Kavo UI', cls: 'lib' },
    { re: /EdgeIY\/infiniteyield/i, name: 'Infinite Yield', cls: 'lib' },
    { re: /dawid-scripts\/Fluent/i, name: 'Fluent', cls: 'lib' },
    { re: /(?:violin-suzutsuki|wally-rblx)\/LinoriaLib/i, name: 'Linoria', cls: 'lib' },
    { re: /Footagesus\/WindUI/i, name: 'WindUI', cls: 'lib' },
    { re: /infyiff\/backup\/[^\s"']*dex/i, name: 'Dex Explorer', cls: 'lib' },
    // protected loaders and key systems: the real script is delivered after a key check
    { re: /luarmor\.net/i, name: 'Luarmor', cls: 'gate' },
    { re: /jnkie\.com|junkie-development/i, name: 'Jnkie', cls: 'gate' },
    { re: /platoboost/i, name: 'Platoboost', cls: 'gate' },
    { re: /pandadevelopment/i, name: 'Panda Development', cls: 'gate' },
    // script hubs
    { re: /scriptblox\.com/i, name: 'ScriptBlox', cls: 'hub' },
    { re: /rscripts\.net/i, name: 'RScripts', cls: 'hub' },
    { re: /discord(?:app)?\.com\/api\/webhooks/i, name: 'Discord webhook', cls: 'exfil' },
    { re: /discord\.gg\/|discord\.com\/invite\//i, name: 'Discord invite', cls: 'invite' },
    { re: /cdn\.discordapp\.com|media\.discordapp\.net/i, name: 'Discord file', cls: 'file' },
    { re: /grabify|iplogger|2no\.co|yip\.su|blasze|api\.ipify|ip-api|ipinfo\.io|ifconfig\.me|ipapi/i, name: 'IP logger or lookup', cls: 'tracker' },
    { re: /pastebin\.com/i, name: 'Pastebin', cls: 'paste' },
    { re: /raw\.githubusercontent\.com|gist\.githubusercontent\.com|gist\.github\.com|\/\/github\.com\/[^\/]+\/[^\/]+\/(?:blob|raw)\//i, name: 'GitHub raw file', cls: 'paste' },
    { re: /hastebin|paste\.ee|rentry\.co|pastefy|controlc\.com|ghostbin|privatebin|justpaste\.it|paste\.gg|pastes\.io/i, name: 'Paste site', cls: 'paste' },
    { re: /ngrok|trycloudflare|loca\.lt|serveo|duckdns|no-ip|hopto\.org|ddns\.net|zapto\.org|sytes\.net/i, name: 'Temporary tunnel server', cls: 'tunnel' },
    { re: /\.workers\.dev|glitch\.me|repl\.co|replit\.app|herokuapp|vercel\.app|onrender\.com|netlify\.app|pages\.dev/i, name: 'Free hosting', cls: 'hosting' },
    { re: /\/\/(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd|rb\.gy|ow\.ly|v\.gd|tiny\.cc|shorturl\.at)\//i, name: 'Link shortener', cls: 'short' },
    { re: /linkvertise|work\.ink|workink|lootlabs|loot-link/i, name: 'Ad or key page', cls: 'key' },
    { re: /\/\/(?:[\w-]+\.)*(?:roblox\.com|rbxcdn\.com|robloxlabs\.com)(?:[\/:?#]|$)/i, name: 'Roblox', cls: 'roblox' }
  ];
  function classify(url) {
    for (var i = 0; i < HOSTS.length; i++) if (HOSTS[i].re.test(url)) return HOSTS[i];
    return { name: 'Other site', cls: 'other' };
  }
  function hostOf(url) { var m = /^https?:\/\/([^\/:?#\s]+)/i.exec(url); return m ? m[1].toLowerCase() : url; }

  /* ------------------------------------------------------------------ *
   *  Behavior rules.  level: 3 = serious, 2 = worth a look, 1 = good to know
   * ------------------------------------------------------------------ */
  var RULES = [
    // 3 = serious, 2 = worth checking, 1 = good to know (normal in many scripts, never changes the verdict)
    [3, /discord(?:app)?\.com\/api\/webhooks\/[\w\/-]+/, 'Sends data to a Discord webhook', 'Scripts that steal information send it to a webhook like this. Even if the author calls it “just logging”, it sends details about you to them.'],
    [2, /\.ROBLOSECURITY|roblosecurity/, 'Mentions the Roblox login cookie', 'That cookie is the key to your account. No normal script needs it.'],
    [2, /\brequire\s*\(\s*\d{6,}\s*\)/, 'Loads a hidden module by ID', 'The real code lives on Roblox under that number and can change at any time. This is the most common backdoor trick in free models.'],
    [3, /grabify|iplogger|2no\.co|yip\.su|blasze/, 'Uses an IP-logging link', 'Tracking links like this exist to find out where you are.'],
    [2, /api\.ipify|ip-api|ipinfo\.io|ifconfig\.me|ipapi/, 'Looks up your IP address', 'Scripts that check your IP are often sending it somewhere. Normal scripts do not need it.'],
    [3, /(?:auth|accountsettings|billing|trades)\.roblox\.com/, 'Talks to Roblox account or trade pages', 'These addresses handle logins, settings and trades. Account stealers use them. Normal scripts do not.'],
    [3, /Headers\s*=\s*\{[^}]*Cookie/, 'Sends a login cookie with a web request', 'A cookie proves who you are. Sending one to a website can hand over your account.'],
    [2, /(?:economy|inventory)\.roblox\.com/, 'Looks at your Robux or inventory', 'Scripts that check what you own can be looking for things to steal.'],
    [2, /\b(?:SendMail|GiftAll|TradeAll|SendTrade|MailboxService)\b/, 'Touches mailbox or trading', 'Item stealers use these to send your things to another player.'],
    [2, /\bos\.execute|\bio\.popen|\bos\.getenv/, 'Runs system commands', 'This can run programs on your computer. Roblox scripts have no reason to.'],
    [2, /HttpGet(?:Async)?\s*\(\s*(?:["'][^"'\n]*["']\s*\.\.\s*[A-Za-z_]|(?!["'(])[A-Za-z_])/, 'Downloads from a link built while running', 'The address is not written out in the text, so you cannot see where the code comes from by reading it.'],
    [1, /\bloadstring\b/, 'Runs code from text (loadstring)', 'Normal in many scripts. It runs text as a program, so what matters is where that text comes from.'],
    [1, /HttpGet(?:Async)?|HttpPost(?:Async)?|\bhttp_request\b|\bsyn\.request\b|\brequest\s*\(\s*\{/, 'Uses the internet', 'It downloads or sends data. The links are listed below.'],
    [1, /RequestAsync|PostAsync|GetAsync/, 'Makes web requests (HttpService)', 'It talks to a server. The links are listed below.'],
    [1, /\b(?:writefile|readfile|appendfile|delfile|makefolder|listfiles)\s*\(/, 'Saves or reads files', 'Usually used to save settings. Only a concern if it also sends data out.'],
    [1, /Prompt(?:GamePass|Product|Bundle)?Purchase\s*\(|PromptPremiumPurchase/, 'Opens Robux purchase pop-ups', 'Read what you are asked to buy before you click.'],
    [1, /["'][A-Za-z0-9+\/=]{200,}["']/, 'Contains a very long encoded string', 'Big blocks of random-looking text often hide more code.'],
    [1, /queue_on_teleport|queueonteleport/, 'Re-runs itself after you teleport', 'Keeps the script active in the next server.'],
    [1, /GetObjects\s*\(/, 'Loads a model by asset ID', 'Models can carry extra scripts. Common for loading menus.'],
    [1, /\bscript_key\b/, 'Uses a script key', 'Protected scripts ask for a key this way. The key itself is not a danger.'],
    [1, /\b(?:getfenv\(\s*\d*\s*\)|_G|_ENV|getgenv\(\s*\))\s*\[\s*["'][A-Za-z_]+["']\s*\]/, 'Looks up functions by name', 'Calling functions through a text name is a common way to hide what a script uses.'],
    [1, /\bgetgenv\b/, 'Uses the executor global table', 'Only exists in script executors, so this script is made for an executor. Very common.'],
    [1, /\b(?:getfenv|setfenv|getrawmetatable|setrawmetatable|hookfunction|hookmetamethod|newcclosure|checkcaller|getgc|getupvalues?)\b/, 'Uses advanced executor functions', 'Normal in exploit scripts and anti-cheat tools, rare anywhere else.'],
    [1, /identifyexecutor|getexecutorname/, 'Checks which executor you use', 'Some scripts change behavior, or log this, depending on your executor.'],
    [1, /\bfiresignal\b|\bfireclickdetector\b|\bfiretouchinterest\b|\bfireproximityprompt\b/, 'Triggers game events directly', 'Common in auto-farm scripts.'],
    [1, /\b(?:setclipboard|toclipboard)\s*\(/, 'Copies text to your clipboard', 'Check what it copies before you paste it anywhere.'],
    [1, /TeleportService|:Teleport(?:ToPlaceInstance)?\s*\(/, 'Can teleport you to another game', 'It may move you out of the game you are in.'],
    [1, /:Kick\s*\(/, 'Can kick players', 'Fine for admin tools.'],
    [1, /:Shutdown\s*\(/, 'Can close the game', 'It can shut down the server or your game window.'],
    [1, /\bbase64|b64decode|fromBase64/i, 'Decodes Base64 text', 'Sometimes used to hide what a script really does.']
  ];

  /* ------------------------------------------------------------------ *
   *  Obfuscation fingerprints
   * ------------------------------------------------------------------ */
  var OBF_NAMES = [
    ['Luraph', /luraph|lura\.ph/i],
    ['MoonSec', /moon-?sec/i],
    ['IronBrew', /iron\s?brew/i],
    ['WeAreDevs', /wearedevs/i],
    ['Prometheus', /obfuscat\w*\s+(?:using|with|by)\s+prometheus|prometheus\s+obfuscator/i],
    ['Hercules', /hercules\s+obfuscator/i],
    ['Synapse Xen', /synapse\s*xen|\bxen\s+obfuscator/i],
    ['PSU', /psu\.dev|\bPSU\s+(?:obfuscator|protect)/i],
    ['Marked as obfuscated', /obfuscated\s+(?:by|with|using)|protected\s+(?:by|using|with)/i]
  ];

  function obfuscation(raw) {
    var sig = [], fam = [], score = 0;
    function add(p, t) { score += p; sig.push(t); }
    OBF_NAMES.forEach(function (n) { if (n[1].test(raw)) { fam.push(n[0]); } });
    if (fam.length) add(40, 'Header or text names the tool: ' + fam.join(', '));
    var lines = raw.split('\n'), max = 0;
    lines.forEach(function (l) { if (l.length > max) max = l.length; });
    if (raw.length > 4000 && lines.length <= 3) add(15, 'The whole script sits on a few very long lines');
    else if (max > 3000) add(8, 'Contains a line over ' + max + ' characters long');
    var esc = (raw.match(/\\\d{2,3}|\\x[0-9a-fA-F]{2}/g) || []).length;
    if (esc > 300) add(20, esc + ' escape codes hide the text');
    else if (esc > 30) add(10, esc + ' escape codes hide the text');
    var mang = (raw.match(/\b(?:_0x[0-9a-fA-F]+|[Il]{6,}|[Il1O0]{8,})\b/g) || []).length;
    if (mang >= 10) add(15, 'Names look machine-made (like _0x1a2b or IIllIl)');
    var vn = {}; (raw.match(/\b[vV]\d{1,5}\b/g) || []).forEach(function (x) { vn[x] = 1; });
    if (Object.keys(vn).length >= 40) add(10, 'Hundreds of names like v12, v13, v14 (typical of generated code)');
    var al = (raw.match(/local\s+\w+\s*=\s*(?:string\.(?:char|byte|sub|rep)|table\.(?:concat|insert|remove|unpack)|bit32\.\w+|math\.\w+)\s*[;,]/g) || []).length;
    if (al >= 2) add(15, 'Standard functions are copied into short variables first');
    var br = (raw.match(/\bif\s+\w+\s*[<>=~]=?\s*\d+\s+then\b/g) || []).length;
    if (br >= 40) add(20, br + ' numbered branches in a row (a script-in-a-script engine)');
    if (/(?:\d+\s*,\s*){200,}\d+/.test(raw)) add(15, 'A very large list of numbers (packed code)');
    if (/(["'])[^"'\n]{2000,}\1/.test(raw)) add(10, 'Contains a single text string over 2000 characters');
    if (/^\s*(?:--[^\n]*\n\s*)*return\s*\(\s*function\s*\(\s*\.\.\.\s*\)/.test(raw)) add(10, 'Everything is wrapped in one big function');
    var vm = 0; ['select\\s*\\(\\s*["\']#["\']', 'getfenv', 'bit32', 'string\\.byte', 'unpack'].forEach(function (p) { if (new RegExp(p).test(raw)) vm++; });
    if (vm >= 4) add(10, 'Uses the helper functions these protectors rely on');
    score = Math.min(100, score);
    var label = score >= 70 ? 'Packed or virtualized' : score >= 40 ? 'Heavily obfuscated' : score >= 15 ? 'Lightly obfuscated' : 'Readable';
    var guess = fam.filter(function (f) { return f !== 'Marked as obfuscated'; });
    if (!guess.length && br >= 40 && al >= 2) guess.push('IronBrew or MoonSec style');
    return { score: score, label: label, families: guess, signals: sig };
  }

  /* ------------------------------------------------------------------ *
   *  Hidden layers: code stored inside loadstring("...") or encoded strings
   * ------------------------------------------------------------------ */
  function unquote(lit) {
    var m = /^\[(=*)\[\r?\n?([\s\S]*)\]\1\]$/.exec(lit);
    if (m) return m[2];
    return lit.slice(1, -1).replace(/\\(?:(\d{1,3})|x([0-9a-fA-F]{2})|z\s*|([\s\S]))/g, function (_, d, x, e) {
      if (d !== undefined) return String.fromCharCode(Math.min(255, +d));
      if (x !== undefined) return String.fromCharCode(parseInt(x, 16));
      if (e === undefined) return '';
      return { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v' }[e] || e;
    });
  }
  function fromBytes(s) {
    if (!/[\x80-\xff]/.test(s)) return s;
    try {
      var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
      return new TextDecoder('utf-8').decode(u);
    } catch (e) { return s; }
  }
  function looksLikeCode(t) {
    if (t.length < 12) return false;
    var bad = 0, n = Math.min(t.length, 2000);
    for (var i = 0; i < n; i++) { var c = t.charCodeAt(i); if (c < 9 || (c > 13 && c < 32) || c === 65533) bad++; }
    return bad / n < 0.05 && /\b(?:local|function|end|game|return|print|warn|workspace|script|if|then|for|while)\b/.test(t);
  }
  var LS = /\b(?:loadstring|load)\s*\(\s*(?:\(\s*)?("(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'|\[(=*)\[[\s\S]*?\]\2\])/g;
  function peel(code, depth, out, seen) {
    if (depth >= 6 || out.length >= 25) return;
    var cl = cleanup(code, { fmt: false }).code, found = [], m;
    LS.lastIndex = 0;
    while ((m = LS.exec(cl)) && found.length < 40) found.push({ via: 'loadstring', text: fromBytes(unquote(m[1])) });
    (cl.match(STR) || []).forEach(function (lit) {
      var v = lit.slice(1, -1);
      if (v.length >= 48 && /^[A-Za-z0-9+\/]+={0,2}$/.test(v)) {
        try { found.push({ via: 'Base64 string', text: fromBytes(atob(v)) }); } catch (e) {}
      } else if (v.length >= 48 && /^(?:[0-9a-fA-F]{2})+$/.test(v)) {
        var s = ''; for (var i = 0; i < v.length; i += 2) s += String.fromCharCode(parseInt(v.substr(i, 2), 16));
        found.push({ via: 'Hex string', text: fromBytes(s) });
      }
    });
    found.forEach(function (f) {
      if (out.length >= 25 || !looksLikeCode(f.text)) return;
      var key = f.text.length + ':' + f.text.slice(0, 120);
      if (seen[key]) return; seen[key] = 1;
      out.push({ depth: depth + 1, via: f.via, code: f.text });
      peel(f.text, depth + 1, out, seen);
    });
  }

  /* ------------------------------------------------------------------ */
  function blankComments(d) {
    return d.replace(TOKEN, function (m) { return m.charAt(0) === '-' ? m.replace(/[^\n]/g, ' ') : m; });
  }
  function tally(list) {
    var m = {}; list.forEach(function (x) { m[x] = (m[x] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { text: k, count: m[k] }; }).sort(function (a, b) { return b.count - a.count; });
  }
  function lineAt(d, i) { var n = 1; for (var k = 0; k < i; k++) if (d.charCodeAt(k) === 10) n++; return n; }

  var CALLCATS = [
    ['money', /Prompt\w*Purchase|PerformPurchase/],
    ['network', /Http(?:Get|Post)(?:Async)?$|^(?:http_request|request|http\.request|syn\.request)$|RequestAsync$|PostAsync$|GetAsync$|WebSocket/],
    ['code', /^(?:loadstring|load|require|dofile|loadfile|getfenv|setfenv|getrawmetatable|setrawmetatable)$|GetObjects$/],
    ['files', /^(?:readfile|writefile|appendfile|delfile|delfolder|makefolder|listfiles|isfile|isfolder)$/],
    ['system', /^(?:os|io)\./],
    ['executor', /^(?:hookfunction|hookmetamethod|newcclosure|checkcaller|getgc|getupvalues?|getconnections|firesignal|fireclickdetector|firetouchinterest|fireproximityprompt|setclipboard|toclipboard|queue_on_teleport|queueonteleport|identifyexecutor|getexecutorname|getgenv|getrenv|getreg|setfpscap|cloneref|clonefunction|decompile|getscripts|getloadedmodules|Drawing\.new)$/],
    ['roblox', /^game[:.]|GetService|FindFirstChild|WaitForChild|Instance\.new|FireServer|InvokeServer|Teleport|:Kick|Destroy|Clone$|^(?:workspace|Players)/]
  ];
  var CAT_LABEL = { money: 'Purchases', network: 'Network', code: 'Runs code', files: 'Files', system: 'System', executor: 'Executor', roblox: 'Roblox', other: 'Other' };
  function callCat(n) { for (var i = 0; i < CALLCATS.length; i++) if (CALLCATS[i][1].test(n)) return CALLCATS[i][0]; return 'other'; }

  var ROLE_RANK = { send: 0, run: 1, fetch: 2, mention: 3 };
  var MAXL = 25;
  var NEVER_FETCH = { exfil: 1, tracker: 1, short: 1, key: 1, invite: 1, roblox: 1, file: 1, gate: 1, lib: 1 };
  // Protected-loader services can also be recognised by their code, not only by a link.
  var GATE_TEXT = [
    ['Luarmor', /luarmor|\bapi\.load_script\b|\bapi\.script_id\b/i],
    ['Jnkie', /jnkie|junkie-development/i],
    ['Platoboost', /platoboost/i]
  ];
  var EXEC_RULES = ['Uses the executor global table', 'Uses advanced executor functions', 'Triggers game events directly', 'Checks which executor you use'];

  // Turn a link to a script's web page into the link of its raw text, when we know how.
  function toRaw(u) {
    var m;
    if ((m = /^(https?:\/\/(?:www\.)?(?:scriptblox\.com|rscripts\.net))\/script\/([^\/?#]+)/i.exec(u))) return m[1] + '/raw/' + m[2];
    if ((m = /^https?:\/\/(?:www\.)?pastebin\.com\/(?!raw\/)([A-Za-z0-9]{6,})(?:[?#].*)?$/i.exec(u))) return 'https://pastebin.com/raw/' + m[1];
    if ((m = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+?)(?:[?#].*)?$/i.exec(u))) return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] + '/' + m[4];
    return u;
  }

  // Every link in a piece of code, with what the script does with it.
  function urlsIn(d, bare) {
    var out = [], re = /https?:\/\/[^\s"'<>)\]\\]+/g, m;
    var dynRun = /\bloadstring\b/.test(d) && /HttpGet(?:Async)?\s*\(\s*(?:["'][^"'\n]*["']\s*\.\.\s*[A-Za-z_]|(?!["'(])[A-Za-z_])/.test(d);
    while ((m = re.exec(d))) {
      var url = m[0].replace(/[.,;]+$/, ''), w = d.slice(Math.max(0, m.index - 200), m.index).split(/[;\n]/).pop(), role = 'mention';
      if (/HttpPost|PostAsync|["']POST["']/i.test(w)) role = 'send';
      else if (/\b(?:loadstring|load)\b/.test(w) && /Http|request|Get/i.test(w)) role = 'run';
      else if (/Http(?:Get|Post)?|GetAsync|\brequest\b|RequestAsync/i.test(w)) role = 'fetch';
      var h = classify(url);
      if (h.cls === 'exfil') role = 'send';
      // the link sits in a variable that is later passed to HttpGet and loadstring
      if (role === 'mention' && dynRun && /^(?:hub|paste|tunnel|hosting|other|gate)$/.test(h.cls)) role = 'run';
      // the whole input is just a link
      if (bare && out.length === 0 && role === 'mention') role = 'fetch';
      out.push({ url: url, role: role, index: m.index, host: h });
    }
    return out;
  }

  var GENERIC = /^(?:Hidden behavior|Script is obfuscated|Downloads from a link built|Sends data to a Discord webhook|Loads a script from|Loads from a paste|Loads a hidden module|Protected loader)/;

  function dump(src, opts) {
    opts = opts || {};
    var remote = opts.remote || {};
    var raw = String(src), seen = {}, bare = /^\s*https?:\/\/\S+\s*$/.test(raw);
    var layers = [{ depth: 0, via: 'Original script', code: raw }];
    peel(raw, 0, layers, seen);

    // Scripts we were given for the links found so far (downloaded or pasted) become layers too.
    var resolvedKeys = {};
    for (var i = 0; i < layers.length && layers.length < MAXL; i++) {
      var dd = blankComments(cleanup(layers[i].code, { fmt: false }).code);
      urlsIn(dd, bare && i === 0).forEach(function (u) {
        if ((u.role !== 'run' && u.role !== 'fetch') || layers.length >= MAXL) return;
        var key = toRaw(u.url), txt = remote[u.url] != null ? remote[u.url] : remote[key];
        if (txt == null || resolvedKeys[key]) return;
        resolvedKeys[key] = u.url;
        var ly = { depth: layers[i].depth + 1, via: 'Downloaded from ' + u.host.name, code: String(txt), url: u.url };
        layers.push(ly);
        peel(ly.code, ly.depth, layers, seen);
      });
    }

    var merged = {}, loaders = {}, strings = {}, calls = {}, ips = {}, assets = {};
    var cleanedLayers = [];

    layers.forEach(function (ly, li) {
      var cl = cleanup(ly.code, { fmt: false }).code, d = blankComments(cl);
      cleanedLayers.push(cl);
      RULES.forEach(function (r) {
        var re = new RegExp(r[1].source, 'gi'), m, n = 0, first = null;
        while ((m = re.exec(d)) && n < 99) { if (!first) first = m; n++; if (!m[0]) re.lastIndex++; }
        if (!n) return;
        var key = r[2], f = merged[key];
        // the same text shows up in a parent layer (inside a string) and in the unpacked layer: keep the deepest one, count it once
        if (f && f.layer >= li) { f.count = Math.max(f.count, n); return; }
        merged[key] = { level: r[0], title: r[2], why: r[3], count: Math.max(n, f ? f.count : 0), line: lineAt(d, first.index), layer: li, via: ly.via,
          snippet: d.slice(Math.max(0, first.index - 25), first.index + 70).replace(/\s+/g, ' ').trim() };
      });
      urlsIn(d, bare && li === 0).forEach(function (u) {
        var url = u.url, role = u.role, h = u.host, e = loaders[url];
        if (!e) loaders[url] = { url: url, host: hostOf(url), name: h.name, cls: h.cls, role: role, layer: li, line: lineAt(d, u.index), count: 1 };
        else if (li > e.layer) { e.layer = li; e.line = lineAt(d, u.index); e.count = 1; if (ROLE_RANK[role] < ROLE_RANK[e.role]) e.role = role; }
        else if (li === e.layer) { e.count++; if (ROLE_RANK[role] < ROLE_RANK[e.role]) e.role = role; }
        else if (ROLE_RANK[role] < ROLE_RANK[e.role]) e.role = role;
      });
      (d.match(/(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w]|\.\d)/g) || []).forEach(function (ip) {
        if (!/^(?:0\.0\.0\.0|127\.0\.0\.1|255\.255\.255\.255)$/.test(ip)) ips[ip] = 1;
      });
      var am, ar = /\brequire\s*\(\s*(\d{6,})\s*\)/g; while ((am = ar.exec(d))) assets[am[1]] = 'Module loaded with require';
      ar = /rbxassetid:\/\/(\d+)/g; while ((am = ar.exec(d))) { if (!assets[am[1]]) assets[am[1]] = 'Asset reference'; }
      ar = /GetObjects\s*\(\s*["']rbxassetid:\/\/(\d+)/g; while ((am = ar.exec(d))) assets[am[1]] = 'Model loaded with GetObjects';
      (d.match(STR) || []).forEach(function (s) {
        var v = s.slice(1, -1);
        if (v.length >= 3 && Object.keys(strings).length < 4000) {
          var x = strings[v]; if (x) x.count++; else strings[v] = { text: v, count: 1, hidden: li > 0 || raw.indexOf(v) < 0, layer: li };
        }
      });
      var skip = /^(if|while|for|function|return|and|or|not|elseif|until|in|do|then)$/;
      d.replace(STR, '""').replace(/\b([A-Za-z_][\w]*(?:[.:][A-Za-z_]\w*)*)\s*\(/g, function (mm, n) {
        if (!skip.test(n)) calls[n] = (calls[n] || 0) + 1; return mm;
      });
    });

    var ldList = Object.keys(loaders).map(function (k) { return loaders[k]; });
    ldList.forEach(function (l) { l.resolved = !!resolvedKeys[toRaw(l.url)]; l.known = l.cls === 'lib'; l.gated = l.cls === 'gate'; });

    // Protected loaders (Luarmor, Jnkie, ...): recognised by link or by their code.
    var gates = {};
    ldList.forEach(function (l) { if (l.gated && !gates[l.name]) gates[l.name] = { service: l.name, url: l.url, layer: l.layer, line: l.line }; });
    GATE_TEXT.forEach(function (g) {
      if (gates[g[0]]) return;
      for (var k = 0; k < cleanedLayers.length; k++) if (g[1].test(blankComments(cleanedLayers[k]))) { gates[g[0]] = { service: g[0], url: '', layer: k, line: 1 }; return; }
    });
    var gateList = Object.keys(gates).map(function (k) { return gates[k]; });

    function M(t) { return merged[t]; }
    function addF(level, title, why, ld) {
      if (merged[title]) { merged[title].count += ld.count; return; }
      merged[title] = { level: level, title: title, why: why, count: ld.count, line: ld.line, layer: ld.layer, via: layers[ld.layer].via, snippet: ld.url };
    }
    ldList.forEach(function (ld) {
      if (ld.cls === 'hub') addF(1, 'Loads a script from ' + ld.name,
        'The real code lives on a public script hub, and its author can change it at any time. What is safe today may not be safe tomorrow.', ld);
      else if (ld.cls === 'paste') addF(1, 'Loads from a paste or raw-file site (' + ld.name + ')',
        'Code fetched from here can be swapped out at any time, so what you see today may not be what runs tomorrow.', ld);
      else if (ld.cls === 'tunnel') addF(2, 'Talks to a temporary tunnel server',
        'Tunnels like ngrok are cheap throwaway servers. They are often used for stealers and tracking.', ld);
      else if (ld.cls === 'hosting') addF(1, 'Talks to a free-hosting site',
        'Free hosting is used by honest hobby projects and by throwaway scams. The link alone does not tell which.', ld);
      else if (ld.cls === 'short') addF(2, 'Uses a shortened link',
        'A shortened link hides the real destination. Open it carefully before trusting it.', ld);
      else if (ld.cls === 'key') addF(1, 'Key system or ad link',
        'The script sends you through a key or ad page. That page, not this script, decides what gets loaded next.', ld);
      else if (ld.cls === 'invite') addF(1, 'Discord invite', 'Just a community link, but check it matches who published the script.', ld);
      else if (ld.cls === 'other' && /r[o0]b[l1I][o0x]x|rblx/i.test(ld.host)) {
        if (/login|log-in|verify|auth|account|secure|free-?robux|robux|trade|reward|gift/i.test(ld.host))
          addF(3, 'Link pretends to be Roblox', 'The address looks like Roblox but is not. Fake Roblox pages are used to steal logins.', ld);
        else addF(1, 'Link has “Roblox” in its name but is not Roblox', 'Plenty of script sites do this. Just don’t type your Roblox login into it.', ld);
      }
    });
    gateList.forEach(function (g) {
      merged['Protected loader (' + g.service + ')'] = { level: 1, title: 'Protected loader (' + g.service + ')',
        why: g.service + ' hands out the real script only after a key check, so nobody can read it from outside. Many paid and key hubs do this on purpose. It is not a sign of a virus, and it does not prove the script is safe.',
        count: 1, line: g.line, layer: g.layer, via: layers[g.layer].via, snippet: g.url };
    });

    // Rules that only matter in combination
    var sends = M('Sends data to a Discord webhook') || ldList.some(function (l) { return l.role === 'send'; });
    var net = M('Uses the internet') || M('Makes web requests (HttpService)') || M('Sends data to a Discord webhook');
    if (M('Mentions the Roblox login cookie') && net) { var ck = M('Mentions the Roblox login cookie'); ck.level = 3; ck.why = 'That cookie is the key to your account, and this script also talks to the internet. Together that is how account stealers work.'; }
    if (M('Saves or reads files') && sends) merged['Reads files and sends data out'] = { level: 2, title: 'Reads files and sends data out', why: 'It can read files on your PC and it also sends data to a server. Check what it reads.', count: 1, line: M('Saves or reads files').line, layer: M('Saves or reads files').layer, via: M('Saves or reads files').via, snippet: '' };
    if (M('Opens Robux purchase pop-ups') && (M('Uses the executor global table') || M('Uses advanced executor functions'))) { var pp = M('Opens Robux purchase pop-ups'); pp.level = 2; pp.why = 'A script run from an executor has no business opening purchase pop-ups. Read what you are asked to buy before you click.'; }
    if (M('Sends data to a Discord webhook') && cleanedLayers.some(function (c) { return /UserId|DisplayName|AccountAge|MembershipType|GetRobuxBalance|LocalPlayer/.test(c); }))
      merged['Collects player info and sends it out'] = { level: 3, title: 'Collects player info and sends it out',
        why: 'The script reads details about your account or character and also contains a webhook. That combination is how most account loggers work.', count: 1, line: M('Sends data to a Discord webhook').line, layer: M('Sends data to a Discord webhook').layer, via: M('Sends data to a Discord webhook').via, snippet: '' };

    var obf = obfuscation(raw);
    var innerLayers = layers.filter(function (l) { return !l.url && l.depth > 0; }).length;
    if (innerLayers) { obf.score = Math.min(100, obf.score + 10); obf.signals.push(innerLayers + ' hidden layer' + (innerLayers > 1 ? 's' : '') + ' unpacked from inside the script'); }
    var anyHigh = Object.keys(merged).some(function (k) { return merged[k].level >= 3; });
    if (obf.score >= 40 && !anyHigh)
      merged['Hidden behavior'] = { level: 2, title: 'Hidden behavior', why: 'The script is scrambled so well that we cannot see what it does. Paid hubs do this to stop copying, and so do stealers. A text check cannot tell which.', count: 1, line: 1, layer: 0, via: layers[0].via, snippet: '' };
    else if (obf.score >= 15) merged['Script is obfuscated'] = { level: 1, title: 'Script is obfuscated', why: 'It is written to be hard to read. We still checked everything that could be decoded.', count: 1, line: 1, layer: 0, via: layers[0].via, snippet: '' };

    // Which loaders still point at code we have not read?
    var pending = [], pk = {};
    ldList.forEach(function (l) {
      if (l.resolved || l.gated || l.known) return;
      var needs = l.role === 'run' || (l.role === 'fetch' && (l.cls === 'hub' || l.cls === 'paste' || bare));
      var key = toRaw(l.url);
      if (!needs || pk[key]) return; pk[key] = 1;
      pending.push({ url: l.url, fetchUrl: key, name: l.name, cls: l.cls, role: l.role, layer: l.layer,
        blocked: !!NEVER_FETCH[l.cls], auto: l.cls === 'hub' || l.cls === 'paste' });
    });
    var dynamic = !!M('Downloads from a link built while running');
    var hiddenMod = !!M('Loads a hidden module by ID');
    var hiddenObf = !!M('Hidden behavior');

    var f = Object.keys(merged).map(function (k) { return merged[k]; }).sort(function (a, b) { return b.level - a.level || a.layer - b.layer; });
    var n3 = 0, n2 = 0, n1 = 0; f.forEach(function (x) { if (x.level === 3) n3++; else if (x.level === 2) n2++; else n1++; });
    var score = Math.min(100, n3 * 40 + n2 * 15 + Math.min(10, n1 * 2));
    var top = n3 ? 3 : n2 ? 2 : n1 ? 1 : 0;
    var level = top === 3 ? 'high' : top === 2 ? 'medium' : 'none';
    var gnames = gateList.map(function (g) { return g.service; }).join(' and ');

    var verdict;
    if (level === 'high') verdict = { state: 'bad', kind: 'bad', title: 'Don’t run this script',
      advice: 'It does things that account stealers and loggers do. If you already ran it, change your Roblox password and log out of all devices.' };
    else if (pending.length || dynamic || hiddenMod || hiddenObf) {
      var adv = pending.length ? 'This script mostly loads other code, and we have not read that code. The real script is behind the link, not in this file. Download it below, or paste what the link returns, and we will check it too.'
        : dynamic ? 'This script builds its download link while it runs, so we can’t see where its code comes from. Don’t run it unless you trust who made it.'
        : hiddenMod ? 'This script loads a hidden module by number. We can’t read it from here. Free models that do this are a common backdoor, so only use it if you trust the maker.'
        : 'This script is scrambled so well that nothing readable came out. Paid hubs do this to stop copying, and so do stealers. Only run it if you trust who made it.';
      if (gateList.length) adv += ' It is also protected by ' + gnames + '.';
      verdict = { state: 'unknown', kind: pending.length ? 'pending' : dynamic ? 'dynamic' : 'hidden', title: pending.length || dynamic ? 'Can’t tell yet' : 'Can’t see inside', advice: adv };
    }
    else if (gateList.length) verdict = { state: 'unknown', kind: 'protected', title: 'Protected script',
      advice: 'This script is protected by ' + gnames + '. Its real code is sent to you privately after a key check, so no website can read it. That is normal for paid and key hubs, and it is not a sign of a virus. It does mean we can’t vouch for it. Only use it if you trust who made it, and try it on an alt account first, never your main.' };
    else if (level === 'medium') verdict = { state: 'warn', kind: 'warn', title: 'Be careful',
      advice: 'It does things worth a second look. The details below explain each one. Only run it if you trust who made it.' };
    else verdict = { state: 'ok', kind: 'ok', title: 'No warning signs found',
      advice: 'We found nothing suspicious in everything we could read. No check is perfect, so only run scripts from people you trust.' };

    // Plain-English list of what the script does
    var says = [], sk = {};
    function say(kind, t) { if (!sk[t]) { sk[t] = 1; says.push({ kind: kind, text: t }); } }
    function nm(l) { return l.cls === 'hub' || l.cls === 'paste' || l.cls === 'gate' || l.cls === 'lib' ? l.name : l.host; }
    ldList.forEach(function (l) {
      if (l.cls === 'lib') say('check', 'Loads ' + l.name + ', a well-known script that many people use.');
      else if (l.gated) say('lock', 'Gets its real code from ' + l.name + ', a protection and key service. That code can’t be read from outside.');
      else if (l.role === 'run') say('down', 'Downloads code from ' + nm(l) + ' and runs it. ' + (l.resolved ? 'We read that code too.' : 'We have not read that code yet.'));
      else if (l.role === 'fetch' && (l.cls === 'hub' || l.cls === 'paste' || bare)) say('down', bare ? 'This is a link to a script on ' + nm(l) + '. ' + (l.resolved ? 'We read it.' : 'We have not read it yet.')
        : 'Downloads a script from ' + nm(l) + '. ' + (l.resolved ? 'We read it too.' : 'We have not read it yet.'));
      else if (l.role === 'send') say('up', 'Sends data to ' + (l.cls === 'exfil' ? 'a Discord webhook' : nm(l)) + '.');
    });
    gateList.forEach(function (g) { if (!g.url) say('lock', 'Is protected by ' + g.service + '. The real code can’t be read from outside.'); });
    if (dynamic) say('hidden', 'Downloads code from a link it builds while running, so we can’t see where from.');
    if (hiddenMod) say('hidden', 'Loads a hidden module by number. We can’t read it.');
    if (innerLayers) say('hidden', 'Hides code inside itself and runs it. We unpacked it and checked it.');
    f.forEach(function (x) { if (x.level >= 2 && !GENERIC.test(x.title)) say('warn', x.title + '.'); });
    if (obf.score >= 40) say('hidden', 'Is scrambled on purpose so you can’t read it.');
    else if (obf.score >= 15) say('hidden', 'Is partly scrambled to make it harder to read.');
    if (EXEC_RULES.some(function (t) { return M(t); })) say('info', 'Needs a script executor to run. It uses functions that only exist there.');
    if (!says.length) say('check', 'Nothing unusual in the text we could read.');

    var callList = Object.keys(calls).map(function (k) { return { text: k, count: calls[k], cat: callCat(k) }; }).sort(function (a, b) { return b.count - a.count; });
    var strList = Object.keys(strings).map(function (k) { return strings[k]; }).sort(function (a, b) { return (b.hidden - a.hidden) || (b.count - a.count); });
    ldList.sort(function (a, b) { return ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.layer - b.layer; });

    var out = layers.map(function (ly, i) {
      var base = cleanedLayers[i], view = base.length <= 300000 ? cleanup(ly.code, { fmt: true }).code : base;
      return { depth: ly.depth, via: ly.via, url: ly.url || null, size: ly.code.length, lines: ly.code.split('\n').length, code: view };
    });
    return {
      level: level, score: score, verdict: verdict, says: says, pending: pending, gates: gateList, findings: f,
      urls: tally(ldList.map(function (l) { return l.url; })),
      loaders: ldList, obfuscation: obf, layers: out, strings: strList, calls: callList, catLabels: CAT_LABEL,
      iocs: { webhooks: ldList.filter(function (l) { return l.cls === 'exfil'; }), ips: Object.keys(ips),
        assets: Object.keys(assets).map(function (id) { return { id: id, kind: assets[id] }; }) },
      meta: { bytes: raw.length, lines: raw.split('\n').length, layers: layers.length - 1 }
    };
  }

  function scan(src) { var d = dump(src); return { level: d.level, score: d.score, findings: d.findings, urls: d.urls }; }

  function inspect(src) {
    var d = cleanup(src, { fmt: false }).code, strings = [], calls = [];
    (d.match(STR) || []).forEach(function (s) { var v = s.slice(1, -1); if (v.length >= 3) strings.push(v); });
    var urls = tally(d.match(/https?:\/\/[^\s"'<>)\]\\]+/g) || []);
    var skip = /^(if|while|for|function|return|and|or|not|elseif|until|in|do|then)$/;
    d.replace(STR, '""').replace(/--[^\n]*/g, '').replace(/\b([A-Za-z_][\w]*(?:[.:][A-Za-z_]\w*)*)\s*\(/g, function (m, n) { if (!skip.test(n)) calls.push(n); return m; });
    return { strings: tally(strings), urls: urls, calls: tally(calls) };
  }

  function bytecode(b) {
    var out = { kind: 'Unknown binary data', version: null, size: b.length, parsed: false, strings: [] }, seen = {};
    function add(t) { if (t.length >= 3 && !seen[t] && out.strings.length < 3000) { seen[t] = 1; out.strings.push(t); } }
    var head = 0, lim = Math.min(b.length, 512);
    for (var i = 0; i < lim; i++) if (b[i] === 9 || b[i] === 10 || b[i] === 13 || (b[i] >= 32 && b[i] < 127)) head++;
    if (lim && head / lim > 0.97) { out.kind = 'Plain text. This is source code, so use the Dumper instead.'; return out; }
    if (b[0] === 27 && b[1] === 76 && b[2] === 117 && b[3] === 97) out.kind = 'Lua bytecode (standard Lua)';
    else if (b[0] >= 3 && b[0] <= 9) { out.kind = 'Luau bytecode (Roblox)'; out.version = b[0]; }
    if (out.version) {
      try {
        var p = out.version >= 4 ? 2 : 1;
        var rv = function () { var r = 0, sh = 0, x; do { if (p >= b.length) throw 0; x = b[p++]; r += (x & 127) * Math.pow(2, sh); sh += 7; } while (x & 128); return r; };
        var n = rv(); if (n > 200000) throw 0;
        var dec = new TextDecoder('utf-8'), tmp = [];
        for (var k = 0; k < n; k++) { var len = rv(); if (p + len > b.length) throw 0; tmp.push(dec.decode(b.subarray(p, p + len))); p += len; }
        tmp.forEach(add); out.parsed = true;
      } catch (e) { out.strings = []; seen = {}; }
    }
    if (!out.parsed) {
      var run = '';
      for (var j = 0; j <= b.length; j++) {
        var c = b[j];
        if (j < b.length && (c === 9 || (c >= 32 && c < 127))) run += String.fromCharCode(c); else { if (run.length >= 5) add(run); run = ''; }
      }
    }
    return out;
  }

  var api = { cleanup: cleanup, scan: scan, dump: dump, inspect: inspect, bytecode: bytecode, toRaw: toRaw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LuaScriptFucker = api;
})(typeof window !== 'undefined' ? window : this);
