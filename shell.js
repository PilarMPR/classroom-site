/* Classroom Portal: what every portal page does in the browser.
   Reading settings (same cfzlib.* keys as the library, so a choice follows you everywhere), read aloud,
   ticks and "continue", the intro page's year picker, header menus, course tabs (class type), footer panels,
   live toys and formulas, quizzes, flashcards and search.
   Everything is saved on this device only. */
(function () {
  "use strict";
  // never inside another site's frame (GitHub Pages sends no X-Frame-Options; security audit 2026-10-25).
  // Frames from this same site are fine: reading the top window's address only throws when it is another site.
  if (window.top !== window.self) { let foreign = false; try { void window.top.location.href; } catch (e) { foreign = true; } if (foreign) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.innerHTML = ""; } return; } }
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement, body = document.body;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\{\{(.+?)\}\}/g, "<code>$1</code>");
  const ls = {
    get: k => { try { return localStorage.getItem("cfzlib." + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem("cfzlib." + k, v); } catch (e) {} },
    json: (k, d) => { try { const v = JSON.parse(localStorage.getItem("cfzlib." + k)); return v == null ? d : v; } catch (e) { return d; } },
    put: (k, v) => { try { localStorage.setItem("cfzlib." + k, JSON.stringify(v)); } catch (e) {} }
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const dataEl = $("#ptdata");
  const DATA = dataEl ? JSON.parse(dataEl.textContent) : {};

  /* ---------- reading settings (as in library/cfz/assets/page.js) ---------- */
  const defaults = { size: "m", font: "lexend", spacing: "normal", tint: "none", theme: "auto" };
  function applySet(k, v, save) {
    if (k === "theme") { if (v === "auto") delete root.dataset.theme; else root.dataset.theme = v; }
    else root.dataset[k] = v;
    if (save) ls.set(k, v);
    $$(`.seg[data-set="${k}"] button`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  }
  const seg = (k, label, opts) => `<div class="setting"><span>${label}</span><div class="seg" data-set="${k}">${opts.map(([v, t, sw]) => `<button type="button" data-v="${v}">${sw ? `<i class="swatch" style="background:var(--tint-${v})"></i>` : ""}${t}</button>`).join("")}</div></div>`;
  const top = $(".pt-top");
  if (top) {
    top.insertAdjacentHTML("afterend", `<section class="settings" id="settings" hidden aria-label="Reading settings">
      ${seg("size", "Text size", [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Extra large"]])}
      ${seg("font", "Font", [["lexend", "Lexend"], ["atkinson", "Atkinson"]])}
      ${seg("spacing", "Spacing", [["normal", "Normal"], ["wide", "Extra wide"]])}
      ${seg("tint", "Background tint", [["none", "None", 1], ["cream", "Cream", 1], ["blue", "Blue", 1], ["mint", "Mint", 1], ["rose", "Rose", 1]])}
      ${seg("theme", "Light or dark", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]])}
    </section>`);
    $$(".seg[data-set]").forEach(s => s.addEventListener("click", e => { const b = e.target.closest("button"); if (b) applySet(s.dataset.set, b.dataset.v, true); }));
    const sb = $("#setBtn");
    if (sb) sb.onclick = () => { const s = $("#settings"); s.hidden = !s.hidden; sb.setAttribute("aria-expanded", String(!s.hidden)); };
  }
  Object.keys(defaults).forEach(k => applySet(k, ls.get(k) || defaults[k], false));

  /* ---------- read aloud ---------- */
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  const say = $("#sayBtn");
  if (say && canSpeak) {
    say.hidden = false;
    say.onclick = () => {
      try {
        if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
        const c = $("#main").cloneNode(true);
        $$("svg, script, button, input, .toy, .eqn, [data-noread]", c).forEach(n => n.remove());
        const u = new SpeechSynthesisUtterance(c.innerText.replace(/×/g, " times ").replace(/→/g, ", then ").replace(/\n+/g, ". "));
        u.rate = 0.9; u.lang = "en-GB"; speechSynthesis.speak(u);
      } catch (e) {}
    };
  }

  /* ---------- ticks: topics understood (library) and lessons done (portal) ---------- */
  const topicsDone = new Set(ls.json("done", []).map(Number));
  const lessonsDone = new Set(ls.json("portal.ldone", []));
  function paintTicks() {
    $$("[data-topic]").forEach(a => a.classList.toggle("pt-isdone", topicsDone.has(+a.dataset.topic)));
    $$("[data-lesson]").forEach(a => a.classList.toggle("pt-isdone", lessonsDone.has(a.dataset.lesson)));
    $$("[data-unit]").forEach(u => { const ids = u.dataset.unit.split(" "), n = ids.filter(i => lessonsDone.has(i)).length; const o = $("[data-uprog]", u); if (o) o.textContent = `${n} of ${ids.length} topics done`; });
    $$("[data-lessons]").forEach(c => { const ids = c.dataset.lessons.split(" ").filter(Boolean); if (!ids.length) return; const n = ids.filter(i => lessonsDone.has(i)).length; const p = $("[data-prog]", c), b = $("[data-bar]", c); if (p) p.textContent = `${n} of ${ids.length} topics done`; if (b) b.style.width = `${100 * n / ids.length}%`; });
    $$("[data-ldone]").forEach(b => { const on = lessonsDone.has(b.dataset.ldone); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "✓ Topic done" : "Mark this topic as done"; });
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-ldone]"); if (!b) return;
    const id = b.dataset.ldone; lessonsDone.has(id) ? lessonsDone.delete(id) : lessonsDone.add(id);
    ls.put("portal.ldone", [...lessonsDone]); paintTicks();
  });
  paintTicks();

  /* ---------- continue where you left off ---------- */
  if (DATA.lesson) { ls.put("portal.last", { h: location.pathname.split("/").pop(), t: DATA.lesson.t, y: DATA.lesson.y, n: DATA.lesson.n }); ls.set("portal.year", String(DATA.lesson.y)); }
  const cont = $("#continue"), last = ls.json("portal.last", null);
  if (cont && last && /^[\w-]+\.html$/.test(last.h)) cont.innerHTML = `<a class="pt-cont" href="${esc(last.h)}"><small class="muted">Continue where you left off · Year ${esc(last.y)}${last.n ? " · topic " + esc(last.n) : ""}</small><b>${esc(last.t)} →</b></a>`;

  /* ---------- intro page: select your year, then Start (the choice is remembered) ---------- */
  const opts = $$(".pt-yopt"), start = $("#startBtn");
  if (opts.length && start) {
    const choose = y => {
      const o = opts.find(x => x.dataset.year === String(y));
      opts.forEach(x => x.setAttribute("aria-pressed", String(x === o)));
      if (!o) return;
      start.href = o.getAttribute("href"); start.removeAttribute("aria-disabled");
      start.textContent = `Start: ${o.querySelector("span").textContent}`;
      const hint = $("#startHint"); if (hint) hint.textContent = o.dataset.soon ? "This year is coming soon." : "";
    };
    opts.forEach(o => o.addEventListener("click", e => { e.preventDefault(); choose(o.dataset.year); ls.set("portal.year", o.dataset.year); start.focus(); }));
    const saved = ls.get("portal.year"); if (saved) choose(saved);
  }
  if (body.classList.contains("pt-yearpage")) { const y = (location.pathname.match(/y(\d+)\.html$/) || [])[1]; if (y) ls.set("portal.year", y); }

  /* ---------- header menus (year, class type): one open at a time, closed by a click outside or Esc ---------- */
  const menus = $$(".pt-menu");
  menus.forEach(m => m.addEventListener("toggle", () => { if (m.open) menus.forEach(o => { if (o !== m) o.open = false; }); }));
  document.addEventListener("click", e => menus.forEach(m => { if (m.open && !m.contains(e.target)) m.open = false; }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") menus.forEach(m => { if (m.open) { m.open = false; $("summary", m).focus(); } }); });
  // a class-type link on a unit or topic page opens the year page on that course
  document.addEventListener("click", e => { const a = e.target.closest("[data-settrack]"); if (a) ls.set("portal.track", a.dataset.settrack); });

  /* ---------- topic footer: Material to study and Relevant artifacts open their panel ---------- */
  const pbtns = $$("[data-panel]");
  pbtns.forEach(b => { const p = document.getElementById(b.dataset.panel); if (p) p.hidden = true; });
  pbtns.forEach(b => b.addEventListener("click", () => {
    const p = document.getElementById(b.dataset.panel); if (!p) return;
    const show = p.hidden;
    pbtns.forEach(o => { const q = document.getElementById(o.dataset.panel); if (q) q.hidden = true; o.setAttribute("aria-expanded", "false"); });
    p.hidden = !show; b.setAttribute("aria-expanded", String(show));
    if (show) p.scrollIntoView({ block: "nearest" });
  }));

  /* ---------- course tabs (Years 10 and 11) ---------- */
  const tabs = $$(".pt-tracks [data-track]");
  if (tabs.length) {
    const pick = v => { tabs.forEach(t => t.setAttribute("aria-pressed", String(t.dataset.track === v))); $$("[data-trackbox]").forEach(x => x.hidden = !!v && x.dataset.trackbox !== v); ls.set("portal.track", v); };
    tabs.forEach(t => t.onclick = () => pick(t.dataset.track));
    const saved = ls.get("portal.track");
    pick(saved !== null && tabs.some(t => t.dataset.track === saved) ? saved : tabs[0].dataset.track);
  }
  // a link to a unit inside a hidden course opens that course (on load, and when only the #part changes)
  function openHash() {
    let id = ""; try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }   // a malformed #%E0 must not stop the page
    const el = id && document.getElementById(id);
    if (!el) return;
    // open what holds it: a unit row, a definition, a folded part
    for (let d = el; d; d = d.parentElement) if (d.tagName === "DETAILS" && !d.classList.contains("pt-menu")) d.open = true;
    const box = el.closest("[data-trackbox]");
    if (box && box.hidden) { const t = tabs.find(x => x.dataset.track === box.dataset.trackbox); if (t) t.click(); }
    el.scrollIntoView();
  }
  openHash();
  window.addEventListener("hashchange", openHash);

  /* ---------- "Simpler words": the plain-words version of the objectives and success criteria (remembered) ---------- */
  const simple = v => { root.classList.toggle("pt-simple", v); $$("[data-simple]").forEach(b => { b.setAttribute("aria-pressed", String(v)); b.textContent = v ? "Precise words" : "Simpler words"; }); ls.set("portal.simple", v ? "1" : ""); };
  if ($("[data-simple]")) { simple(ls.get("portal.simple") === "1"); $$("[data-simple]").forEach(b => b.addEventListener("click", () => simple(!root.classList.contains("pt-simple")))); }

  /* ---------- Board view: the topic page on the class board, one part at a time ----------
     Every part starts closed (only its heading shows). → / PageDown / Space (a clicker) opens the next part or the
     next explanation step or definition and closes the one before; ← / PageUp goes back; click any heading to jump;
     Esc leaves. Pupils see the same parts, in the same order, on their own page at home. */
  const boardBtns = $$("[data-board]");
  if (boardBtns.length) {
    // the pupils' page: the whole page on the pupil site, the Student view panel (#student) on the teacher site
    const pupilRoot = () => document.getElementById("student") || $("#main");
    let frames = [], cur = -1, bar = null;
    const build = () => {
      frames = [];
      for (const part of $$(".pt-part", pupilRoot())) {
        if (part.id === "definitions") { frames.push({ part }); $$(".pt-def1", part).forEach(def => frames.push({ part, def })); }
        else if (part.id === "steps") $$(".pt-step", part).forEach(step => frames.push({ part, step }));
        // diagrams one at a time, then the live toys
        else if (part.id === "diagram" && $(".pt-fig", part)) { $$(".pt-fig", part).forEach(fig => frames.push({ part, fig })); if ($(".pt-try", part)) frames.push({ part, fig: $(".pt-try", part) }); }
        else frames.push({ part });
      }
    };
    const label = p => ($(".pt-ph", p) || p).textContent.trim().replace(/\s+/g, " ");
    function show(i) {
      if (!frames.length) return;
      cur = Math.max(0, Math.min(frames.length - 1, i));
      const f = frames[cur], parts = [...new Set(frames.map(x => x.part))];
      for (const p of parts) {
        const on = p === f.part;
        p.classList.toggle("pt-bclosed", !on);
        if (p.tagName === "DETAILS") p.open = on;
      }
      if (f.part.id === "definitions") { const defs = $$(".pt-def1", f.part), k = f.def ? defs.indexOf(f.def) : -1; defs.forEach((d, j) => d.open = j <= k); }
      if (f.part.id === "steps") {
        $$(".pt-step", f.part).forEach(s => s.classList.toggle("pt-bhide", s !== f.step));
        // "Going further" shows only above the first step after it
        $$(".pt-further", f.part).forEach(h => { const first = $$(".pt-step", f.part).find(s => h.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); h.classList.toggle("pt-bhide", first !== f.step); });
      }
      if (f.fig) $$(".pt-fig, .pt-try", f.part).forEach(x => x.classList.toggle("pt-bhide", x !== f.fig));
      const pi = parts.indexOf(f.part);
      $$(".pt-bdot", bar).forEach((d, j) => { d.classList.toggle("on", j === pi); d.classList.toggle("done", j < pi); });
      $(".pt-bcount", bar).textContent = `${cur + 1} / ${frames.length}`;
      $(".pt-bnow", bar).textContent = label(f.part) + (f.step ? ` · ${$("h3", f.step) ? $("h3", f.step).textContent.trim() : ""}` : f.def ? ` · ${$("summary", f.def).textContent.trim()}` : f.fig ? (f.fig.classList.contains("pt-try") ? " · Try it" : ` · ${$$(".pt-fig", f.part).indexOf(f.fig) + 1} of ${$$(".pt-fig", f.part).length}`) : "");
      (f.step || f.def || f.part).scrollIntoView({ block: "start", behavior: "smooth" });
    }
    function enter() {
      build(); if (!frames.length) return;
      root.classList.add("pt-boarding"); body.classList.add("pt-board");
      const parts = [...new Set(frames.map(x => x.part))];
      bar = document.createElement("nav");
      bar.className = "pt-bbar"; bar.setAttribute("aria-label", "Board view");
      bar.innerHTML = `<button class="btn small" type="button" data-b="prev" aria-label="Back (←)">◀</button>
        <span class="pt-bdots">${parts.map((p, j) => `<button type="button" class="pt-bdot" data-b="part" data-i="${j}" title="${esc(label(p))}" aria-label="${esc(label(p))}"></button>`).join("")}</span>
        <span class="pt-bnow muted small"></span><span class="pt-bcount muted small"></span>
        <button class="btn small primary" type="button" data-b="next" aria-label="Next (→)">▶</button><button class="btn small" type="button" data-b="exit" aria-label="Leave Board view (Esc)">✕</button>`;
      document.body.append(bar);
      bar.addEventListener("click", e => {
        const b = e.target.closest("[data-b]"); if (!b) return;
        if (b.dataset.b === "next") show(cur + 1);
        if (b.dataset.b === "prev") show(cur - 1);
        if (b.dataset.b === "exit") leave();
        if (b.dataset.b === "part") show(frames.findIndex(f => f.part === parts[+b.dataset.i]));
      });
      try { if (document.fullscreenElement == null && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
      show(0);
    }
    function leave() {
      root.classList.remove("pt-boarding"); body.classList.remove("pt-board");
      $$(".pt-bclosed, .pt-bhide").forEach(x => x.classList.remove("pt-bclosed", "pt-bhide"));
      if (bar) { bar.remove(); bar = null; } cur = -1;
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) {}
    }
    boardBtns.forEach(b => b.addEventListener("click", enter));
    // a closed part's heading jumps to it
    document.addEventListener("click", e => {
      if (!body.classList.contains("pt-board")) return;
      const h = e.target.closest(".pt-bclosed > .pt-ph, .pt-bclosed > summary");
      if (!h) return;
      e.preventDefault();
      const part = h.parentElement, i = frames.findIndex(f => f.part === part);
      if (i >= 0) show(i);
    });
    document.addEventListener("keydown", e => {
      if (!body.classList.contains("pt-board")) return;
      const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if (e.key === "Escape") { leave(); return; }
      if (typing) return;
      if (["ArrowRight", "PageDown"].includes(e.key) || (e.key === " " && !(t && t.tagName === "BUTTON"))) { e.preventDefault(); show(cur + 1); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); show(cur - 1); }
      else if (e.key === "Home") { e.preventDefault(); show(0); }
      else if (e.key === "End") { e.preventDefault(); show(frames.length - 1); }
    });
    // leaving full screen with the browser's own Esc also leaves Board view
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && body.classList.contains("pt-board")) leave(); });
    if (location.hash === "#board") enter();
  }

  /* ---------- live toys and formulas (library engines) ---------- */
  if (window.TOYS) $$("[data-toy]").forEach(el => {
    const T = window.TOYS[el.dataset.toy]; if (!T) return;
    el.classList.add("toy");
    el.innerHTML = `<header><i>▶</i><h3>${esc(T.title)}</h3></header><div class="body"></div>`;
    try { T.mount($(".body", el)); } catch (e) { $(".body", el).innerHTML = '<p class="muted">This toy could not start in your browser.</p>'; }
  });
  if (window.FORMULAS) { $$("[data-formula]").forEach(el => { el.innerHTML = window.FORMULAS.html(el.dataset.formula); }); window.FORMULAS.mount(document); }

  /* ---------- quiz: one question at a time, the reason after each answer ---------- */
  $$(".pt-quiz[data-quiz]").forEach(box => {
    const key = box.dataset.quiz, size = +box.dataset.n || 5, pool = DATA.quiz || [];
    const topics = [...new Set(pool.map(q => q.t))];
    let only = "", deck = [], i = 0, score = 0, missed = [];
    const best = () => ls.json("quiz." + key, null);
    function start(from) {
      const src = from || (only ? pool.filter(q => q.t === only) : pool);
      deck = (box.dataset.pick || from ? shuffle(src) : src).slice(0, from ? from.length : size)
        .map(q => ({ ...q, opts: shuffle(q.o.map((t, k) => ({ t, ok: k === q.a }))) }));
      i = 0; score = 0; missed = []; draw();
    }
    function picker() {
      if (!box.dataset.pick || topics.length < 2) return "";
      return `<label class="pt-pick">Topic <select data-q="pick"><option value="">All topics</option>${topics.map(t => `<option${t === only ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    }
    function draw() {
      if (i >= deck.length) {
        const b = best(), pct = Math.round(100 * score / deck.length);
        if (!b || pct > b) ls.put("quiz." + key, pct);
        box.innerHTML = `<div class="pt-qend"><p class="big">${score} of ${deck.length}</p><p>${pct === 100 ? "All right. Well done." : pct >= 60 ? "Good. Look again at the ones you missed." : "Keep going: read the reasons, then try again."}</p>
          <p class="muted small">Best score on this device: ${Math.max(pct, b || 0)}%</p>
          <div class="row">${missed.length ? '<button class="btn primary" type="button" data-q="missed">Try the ones I missed</button>' : ""}<button class="btn" type="button" data-q="again">${box.dataset.pick ? "New questions" : "Start again"}</button></div>${picker()}</div>`;
        return;
      }
      const q = deck[i];
      box.innerHTML = `<div class="pt-qhead"><span class="muted small">Question ${i + 1} of ${deck.length}${q.t && box.dataset.pick ? ` · ${esc(q.t)}` : ""}</span>${i === 0 ? picker() : ""}</div>
        <p class="pt-qq">${md(q.q)}</p>
        <div class="pt-opts">${q.opts.map((o, k) => `<button class="btn pt-opt" type="button" data-k="${k}">${md(o.t)}</button>`).join("")}</div>
        <div class="pt-why" aria-live="polite"></div>`;
    }
    box.addEventListener("click", e => {
      const o = e.target.closest(".pt-opt");
      if (o && !box.dataset.answered) {
        const q = deck[i], pick = q.opts[+o.dataset.k];
        box.dataset.answered = "1";
        $$(".pt-opt", box).forEach((b, k) => { b.disabled = true; if (q.opts[k].ok) b.classList.add("pt-ok"); });
        if (pick.ok) score++; else { o.classList.add("pt-bad"); missed.push(q); }
        $(".pt-why", box).innerHTML = `<p><b>${pick.ok ? "Yes!" : "Not quite."}</b> ${md(q.w || "")}</p><button class="btn primary" type="button" data-q="next">${i + 1 < deck.length ? "Next question →" : "See my score"}</button>`;
        $('[data-q="next"]', box).focus();
        return;
      }
      const a = e.target.closest("[data-q]"); if (!a || a.tagName === "SELECT") return;
      if (a.dataset.q === "next") { delete box.dataset.answered; i++; draw(); }
      if (a.dataset.q === "again") { delete box.dataset.answered; start(); }
      if (a.dataset.q === "missed") { delete box.dataset.answered; start(missed); }
    });
    box.addEventListener("change", e => { if (e.target.dataset.q === "pick") { only = e.target.value; delete box.dataset.answered; start(); } });
    start();
  });

  /* ---------- flashcards ---------- */
  $$(".pt-cards[data-cards]").forEach(box => {
    const key = "cards." + box.dataset.cards, all = DATA.cards || [];
    const known = new Set(ls.json(key, []));
    let deck = [], i = 0, flipped = false, onlyNew = false;
    const build = () => { deck = shuffle(onlyNew ? all.filter(c => !known.has(c.t)) : all); i = 0; flipped = false; draw(); };
    function draw() {
      const c = deck[i];
      const head = `<div class="pt-qhead"><span class="muted small">${known.size} of ${all.length} known</span><label class="pt-pick"><input type="checkbox" data-c="new"${onlyNew ? " checked" : ""}> Only the ones I don't know yet</label></div>`;
      if (!c) { box.innerHTML = head + `<p>No cards left here. ${onlyNew ? "You know them all." : ""}</p><button class="btn" type="button" data-c="again">Shuffle again</button>`; return; }
      box.innerHTML = head + `<div class="pt-card${flipped ? " pt-flip" : ""}"><span class="muted small">Card ${i + 1} of ${deck.length}</span><p class="pt-term">${esc(c.t)}</p>${flipped ? `<p class="pt-def">${md(c.d)}</p>` : '<p class="muted">Say what it means, then turn the card.</p>'}</div>
        <div class="row">${flipped ? '<button class="btn primary" type="button" data-c="knew">I knew it</button><button class="btn" type="button" data-c="not">Not yet</button>' : '<button class="btn primary" type="button" data-c="flip">Turn over</button>'}<button class="btn" type="button" data-c="skip">Skip</button></div>`;
      const f = $('[data-c="flip"], [data-c="knew"]', box); if (f && box.contains(document.activeElement)) f.focus();
    }
    box.addEventListener("click", e => {
      const b = e.target.closest("[data-c]"); if (!b || b.type === "checkbox") return;
      const c = deck[i], a = b.dataset.c;
      if (a === "flip") { flipped = true; draw(); return; }
      if (a === "again") { build(); return; }
      if (a === "knew") known.add(c.t);
      if (a === "not") known.delete(c.t);
      ls.put(key, [...known]); i++; flipped = false; draw();
    });
    box.addEventListener("change", e => { if (e.target.dataset.c === "new") { onlyNew = e.target.checked; build(); } });
    build();
  });

  /* ---------- search ---------- */
  const results = $("#results"), qIn = $("#q");
  if (results && DATA.index) {
    const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const index = DATA.index.map(x => ({ ...x, n: norm(x.t), m: norm(x.s) }));
    const order = ["Year", "Unit", "Topic", "Study page", "IGCSE", "Word", "Step", "Revise", "Page", "Teacher"];
    function run(q) {
      const words = norm(q).split(/\s+/).filter(Boolean);
      if (!words.length) { results.innerHTML = '<p class="muted">Type a word: binary, network, Python, password…</p>'; return; }
      const hits = index.map(x => {
        if (!words.every(w => x.n.includes(w) || x.m.includes(w))) return null;
        const s = words.reduce((a, w) => a + (x.n.startsWith(w) ? 6 : x.n.includes(w) ? 3 : 1), 0) - order.indexOf(x.k) * 0.1;
        return [s, x];
      }).filter(Boolean).sort((a, b) => b[0] - a[0]).slice(0, 60);
      results.innerHTML = hits.length ? `<p class="muted small">${hits.length === 60 ? "The first 60 results" : hits.length + " result" + (hits.length > 1 ? "s" : "")}</p><ul class="pt-hits">${hits.map(([, x]) => `<li><a href="${esc(x.h)}"><span class="pt-hk">${esc(x.k)}</span><b>${esc(x.t)}</b><small class="muted">${esc(x.s)}</small></a></li>`).join("")}</ul>` : `<p>Nothing found for “${esc(q)}”. Try a shorter word.</p>`;
    }
    const q0 = new URLSearchParams(location.search).get("q") || "";
    if (qIn) { qIn.value = q0; qIn.addEventListener("input", () => run(qIn.value)); qIn.focus(); }
    run(q0);
  }
})();
