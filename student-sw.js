/* Classroom Portal, published student site: the service worker behind the class codes.
   Every student file is stored encrypted (AES-256-GCM) except the intro page, the legal pages and the styles,
   fonts and shell they need (PLAIN_FILES, filled in by tools/encrypt.mjs). A year's own pages (y7.html,
   y7-u1-l1.html, slides-y7-…, revise-y7.html, artifacts-y7.html, study-y7.html, board-y7.html) use that year's
   key; everything else uses the shared key. Pages are small "enter the code" pages carrying the encrypted page;
   every other file is iv + ciphertext. The keys (never the codes) are saved by gate.js in IndexedDB.
   It never touches teacher/: the teacher site has its own worker and passkey. */
"use strict";
const SCOPE = new URL("./", self.location).pathname;
const PLAIN_FILES = ["index.html","legal.html","privacy.html","storage.html","terms.html","accessibility.html","portal.css","shell.js","lib/cfz/assets/cfz.css","gate.js","gate-keys.js","student-sw.js"];   // filled in by tools/encrypt.mjs
const CODED_YEARS = [7,8,9,10,11];   // filled in by tools/encrypt.mjs: the years that have their own code
const PLAIN = new Set(PLAIN_FILES.map(p => SCOPE + p));
const PLAIN_DIRS = [SCOPE + "vendor/"];
const TEACHER = SCOPE + "teacher/";
const TYPES = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", ico: "image/x-icon", woff2: "font/woff2", woff: "font/woff", pdf: "application/pdf"
};
// the year a file belongs to (same rule as tools/encrypt.mjs), or 0 for a shared file
const YEAR_FILE = /^(?:y|revise-y|artifacts-y|study-y|board-y|slides-y)(\d+)(?=[-.])/;
const yearOf = path => { const m = path.slice(SCOPE.length).match(YEAR_FILE); return m && CODED_YEARS.includes(+m[1]) ? +m[1] : 0; };

// The keys are kept as { years: { 7: { key, at }, … }, common: { key, at } }. Each year expires 180 days after its code
// was typed, and the code page asks again (must match gate.js). The shared key lives as long as the newest year.
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
const fresh = e => e && e.key && typeof e.at === "number" && Date.now() - e.at < MAX_AGE;
function getKeys() {
  return new Promise(res => {
    const r = indexedDB.open("classroom-student", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("k");
    r.onerror = () => res(null);
    r.onsuccess = () => {
      try {
        const g = r.result.transaction("k").objectStore("k").get("keys");
        g.onsuccess = () => {
          const v = g.result;
          if (!v || !v.years) return res(null);
          const years = Object.fromEntries(Object.entries(v.years).filter(([, e]) => fresh(e)).map(([y, e]) => [y, e.key]));
          if (Object.keys(years).length && fresh(v.common)) return res({ years, common: v.common.key });
          try { r.result.transaction("k", "readwrite").objectStore("k").delete("keys"); } catch (e) {}   // all expired, or the old format
          res(null);
        };
        g.onerror = () => res(null);
      }
      catch (e) { res(null); }
    };
  });
}
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const dec = (key, bytes) => crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
// every page this worker serves refuses to sit in another site's frame (GitHub Pages sends no such header)
const HTML = { "Content-Type": TYPES.html, "Cache-Control": "no-store", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'" };
const page = (text, status = 200) => new Response(text, { status, headers: HTML });
const isPlain = p => PLAIN.has(p) || PLAIN_DIRS.some(d => p.startsWith(d));

self.addEventListener("install", () => self.skipWaiting());
// on activation, also clear what the teacher site left on this address before it moved to its own (audit 2026-10-26)
self.addEventListener("activate", e => e.waitUntil(Promise.all([self.clients.claim(), new Promise(r => { try { const q = indexedDB.deleteDatabase("classroom-teacher"); q.onsuccess = q.onerror = q.onblocked = () => r(); } catch (x) { r(); } })])));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  let path = url.pathname;
  if (path.endsWith("/")) path += "index.html";
  if (e.request.method !== "GET" || url.origin !== self.location.origin || !path.startsWith(SCOPE) || path.startsWith(TEACHER) || path === TEACHER.slice(0, -1) || isPlain(path)) return;
  e.respondWith(serve(path));
});

async function serve(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) return res;
  const keys = await getKeys(), y = yearOf(path);
  const key = keys ? (y ? keys.years[y] : keys.common) : null;
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "html") {
    const text = await res.text();
    const m = text.match(/<script type="text\/plain" id="ct">([A-Za-z0-9+/=]+)<\/script>/);
    if (!key || !m) return page(text);
    try { return new Response(await dec(key, b64(m[1])), { headers: HTML }); }
    catch (e) { return page(text.replace('data-state="locked"', 'data-state="wrong"')); }   // the code changed since this device opened the site
  }
  if (!key) return new Response("Locked", { status: 403 });
  try { return new Response(await dec(key, new Uint8Array(await res.arrayBuffer())), { headers: { "Content-Type": TYPES[ext] || "application/octet-stream" } }); }
  catch (e) { return new Response("Locked", { status: 403 }); }
}
