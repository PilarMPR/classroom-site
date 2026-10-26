/* Classroom Portal, published student site: the class codes (the gate). One code per year, written on the board.
   Only the published copy (dist/site) has it: tools/encrypt.mjs adds this script and gate-keys.js to the intro page
   (index.html) and to the "enter the code" page that every other student page becomes.
   A year's pages (y7.html, y7-u1.html, y7-u1-l1.html, slides-y7-…, revise-y7.html …) are encrypted with that year's
   key; shared pages (the study library, search) with a shared key that every year's code unlocks
   (gate-keys.js holds it wrapped under each year's key, so nothing secret is published).
   The code is turned into a key (PBKDF2-SHA-256; the salt is made from the code), checked by unwrapping the shared
   key, and the keys (never the code) are saved in IndexedDB. student-sw.js then decrypts every page on this device. */
(function () {
  "use strict";
  // never inside another site's frame (a meta CSP cannot set frame-ancestors)
  if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.innerHTML = ""; } return; }
  const ITER = 250000;   // must match tools/encrypt.mjs
  const MAX_AGE = 180 * 24 * 60 * 60 * 1000;   // must match student-sw.js
  const GK = window.GATEKEYS || { years: [], wrap: {} };
  const me = document.currentScript;
  const root = new URL(".", me.src);
  const $ = id => document.getElementById(id);
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  // what pupils type: "Tiger Lamp 42", "tiger-lamp-42 " and "TIGER_LAMP_42" are the same code (same rule in encrypt.mjs)
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const input = $("code"), msg = $("gateMsg");
  const say = (t, bad) => { if (msg) { msg.textContent = t; msg.className = bad ? "bad" : ""; } };
  const intro = !!document.querySelector("[data-gate]");
  const able = "serviceWorker" in navigator && window.crypto && crypto.subtle && window.indexedDB;

  function db() {
    return new Promise((res, rej) => { const r = indexedDB.open("classroom-student", 1); r.onupgradeneeded = () => r.result.createObjectStore("k"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function keyStore(mode, fn) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction("k", mode); const out = fn(tx.objectStore("k")); tx.oncomplete = () => res(out && out.result); tx.onerror = () => rej(tx.error); }); }
  // saved as { years: { 7: { key, at }, … }, common: { key, at } }: each year expires on its own, 180 days after its
  // code was typed (security audit 2026-10-25: one code must not keep the other years open). The codes are never saved.
  const fresh = e => e && e.key && typeof e.at === "number" && Date.now() - e.at < MAX_AGE;
  const loadRaw = async () => { const v = await keyStore("readonly", s => s.get("keys")); return v && v.years ? v : null; };
  // the keys still in date: { years: { 7: CryptoKey }, common: CryptoKey } (null when none)
  const loadKeys = async () => {
    const v = await loadRaw(); if (!v) return null;
    const years = Object.fromEntries(Object.entries(v.years).filter(([, e]) => fresh(e)).map(([y, e]) => [y, e.key]));
    return Object.keys(years).length && fresh(v.common) ? { years, common: v.common.key } : null;
  };
  const saveKeys = v => keyStore("readwrite", s => s.put(v, "keys"));

  async function derive(code) {
    const enc = new TextEncoder();
    const salt = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("classroom-portal/student/v2|" + code))).slice(0, 16);
    const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }
  const unwrap = async (key, w) => { const ct = b64(w); return crypto.subtle.decrypt({ name: "AES-GCM", iv: ct.slice(0, 12) }, key, ct.slice(12)); };
  // which year a code belongs to (null: none); unlocking the shared key proves it
  async function tryCode(code) {
    const K = await derive(code);
    for (const y of GK.years) {
      try { const raw = await unwrap(K, GK.wrap[y]); return { y, K, common: await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]) }; } catch (e) {}
    }
    return null;
  }
  async function remember(hit) {
    const cur = (await loadRaw().catch(() => null)) || { years: {} };
    for (const [y, e] of Object.entries(cur.years)) if (!fresh(e)) delete cur.years[y];   // drop expired years
    const now = Date.now();
    cur.years[hit.y] = { key: hit.K, at: now }; cur.common = { key: hit.common, at: now };
    await saveKeys(cur);
  }
  // does the key saved for this year still open it? (false after the year's code was changed)
  const stillOpens = async (keys, y) => { if (!keys || !keys.years[y]) return false; try { await unwrap(keys.years[y], GK.wrap[y]); return true; } catch (e) { return false; } };
  async function startWorker() {
    await navigator.serviceWorker.register(new URL("student-sw.js", root).href, { scope: root.pathname });
    await navigator.serviceWorker.ready;
  }
  // read the code box; true when it opens year `want` (any year when want is 0)
  async function enter(want) {
    const code = norm(input.value);
    if (!code) { say("Type the code from the board first.", true); input.focus(); return false; }
    say("Checking…");
    let hit = null;
    try { hit = await tryCode(code); } catch (e) { hit = null; }
    if (!hit) { say("That code does not open the site. Check it on the board and try again.", true); input.select(); return false; }
    await remember(hit);
    input.value = "";
    sessionStorage.removeItem("cls-restart");
    if (want && hit.y !== want) { say(`That is the Year ${hit.y} code. This is for Year ${want}: type the Year ${want} code.`, true); return false; }
    say("Opening…");
    await startWorker();
    return true;
  }

  // Housekeeping each time a gate page loads (security audit 2026-10-26): delete expired years from the store, not only
  // refuse them; and clear what the teacher site left on this address before it moved (its key and its worker).
  if (window.indexedDB) {
    loadRaw().then(v => {
      if (!v) return;
      let changed = false;
      for (const [y, e] of Object.entries(v.years)) if (!fresh(e)) { delete v.years[y]; changed = true; }
      if (!Object.keys(v.years).length) return keyStore("readwrite", s => s.delete("keys"));
      if (changed) return saveKeys(v);
    }).catch(() => {});
    try { indexedDB.deleteDatabase("classroom-teacher"); } catch (e) {}
  }
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => { if (/\/teacher\/$/.test(r.scope)) r.unregister(); })).catch(() => {});

  if (!able) {
    if (input) input.disabled = true;
    say("This browser cannot open the Classroom. Use an up-to-date Chrome, Edge, Firefox or Safari (a private window in Firefox does not work).", true);
    return;
  }

  if (intro) {
    // the intro page: the code box shows when the chosen year is not open on this device yet
    const box = document.querySelector("[data-gate]"), start = $("startBtn");
    const chosen = () => { const o = document.querySelector('.pt-yopt[aria-pressed="true"]'); return o ? +o.dataset.year : 0; };
    const coded = y => GK.years.includes(y);
    let keys = null;
    const paint = async () => {
      const y = chosen();
      if (!y) { box.hidden = !!(keys && keys.common); return; }   // nothing chosen yet: ask unless this device is already open
      const open = coded(y) ? await stillOpens(keys, y) : !!(keys && keys.common);
      box.hidden = open;
      if (!open && keys && keys.years[y]) say(`The Year ${y} code has changed. Type the new one from the board.`, true);
      else if (!open) say(coded(y) ? `Type the Year ${y} code from the board. You only type it once on this device.` : "Type your year's code from the board.");
      if (open && !navigator.serviceWorker.controller) startWorker().catch(() => {});
    };
    loadKeys().catch(() => null).then(k => { keys = k; paint(); });
    document.addEventListener("click", e => { if (e.target.closest(".pt-yopt")) setTimeout(paint, 0); });
    if (start) start.addEventListener("click", async e => {
      if (box.hidden) return;   // this year is already open on this device: Start just goes
      e.preventDefault();
      if (start.getAttribute("aria-disabled") === "true") return;
      const y = chosen();
      if (await enter(coded(y) ? y : 0)) location.href = start.href;
      else keys = await loadKeys().catch(() => null);
    });
    if (input) input.addEventListener("keydown", e => { if (e.key === "Enter" && start) { e.preventDefault(); start.click(); } });
    return;
  }

  // the code page that stands in for every other student page (data-year: the year it belongs to, or none: shared)
  const form = $("gateForm"), year = +(document.body.dataset.year || 0);
  if (document.body.dataset.state === "wrong") say(year ? `The Year ${year} code has changed. Type the new one from the board.` : "The code has changed. Type the new one from the board.", true);
  // keys are saved but no worker is running (a new tab, or the browser dropped it): start it once
  if (document.body.dataset.state !== "wrong" && !navigator.serviceWorker.controller) {
    loadKeys().then(k => {
      if (k && (year ? k.years[year] : k.common) && !sessionStorage.getItem("cls-restart")) { sessionStorage.setItem("cls-restart", "1"); say("Opening…"); startWorker().then(() => location.reload()); }
    }).catch(() => {});
  }
  if (form) form.addEventListener("submit", async e => { e.preventDefault(); if (await enter(year)) location.reload(); });
})();
