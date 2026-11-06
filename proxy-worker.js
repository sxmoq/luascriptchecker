// OPTIONAL download helper for LuaScriptFucker (Cloudflare Workers, free plan is enough).
//
// Why: script sites like ScriptBlox often refuse downloads made straight from a web page
// (the browser blocks it). This tiny helper downloads the text for the page and hands it back.
// It only ever returns text. Nothing is run.
//
// Setup: Cloudflare dashboard > Workers & Pages > Create > paste this file > Deploy.
// Then put the worker address in app.js:   var PROXY_URL = 'https://your-worker.your-name.workers.dev';

var ALLOWED = [
  'scriptblox.com', 'rscripts.net', 'pastebin.com',
  'raw.githubusercontent.com', 'gist.githubusercontent.com'
];
var MAX_BYTES = 3000000;

export default {
  async fetch(request) {
    var cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Cache-Control': 'no-store' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });

    var target;
    try { target = new URL(new URL(request.url).searchParams.get('url')); }
    catch (e) { return new Response('Missing or bad url', { status: 400, headers: cors }); }

    var host = target.hostname.toLowerCase();
    var ok = target.protocol === 'https:' && ALLOWED.some(function (d) { return host === d || host.endsWith('.' + d); });
    if (!ok) return new Response('This site is not on the allowed list', { status: 403, headers: cors });

    var res = await fetch(target.toString(), { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 LuaScriptFucker' } });
    var final = new URL(res.url).hostname.toLowerCase();
    if (!ALLOWED.some(function (d) { return final === d || final.endsWith('.' + d); }))
      return new Response('Redirected to a site that is not allowed', { status: 403, headers: cors });

    var text = await res.text();
    if (text.length > MAX_BYTES) return new Response('Too big', { status: 413, headers: cors });
    return new Response(text, { status: res.status, headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, cors) });
  }
};
