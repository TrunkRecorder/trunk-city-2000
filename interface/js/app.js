// Trunk City 2000: a city for each radio system, where every call sets
// something going. This file is the page: the systems and their cities, the
// single and quad views, calls from the recorder to the cities they belong
// to, live audio, and the news ticker.
//
// The recorder serves its client library at /api/client.js. ?demo runs on
// made-up systems instead (demo.js), and so does a page with no recorder
// behind it.

import { classify, wellDefined, TYPE_NAMES } from "./classify.js";
import { generateCity } from "./citygen.js";
import { CityView } from "./city.js";
import { DemoClient } from "./demo.js";
import { Pix, bitmapText, textWidth } from "./pixel.js";
import { hash } from "./rng.js";
import * as Store from "./settings.js";
import { openSettings } from "./panel.js";

let api = null;
try {
  api = await import("/api/client.js");
} catch {
  // Not served by a recorder: the demo is all there is.
}
const demo = !api || new URLSearchParams(location.search).has("demo");
const esc = api?.escapeHtml ?? ((s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]));
const $ = (id) => document.getElementById(id);

const rec = demo ? new DemoClient(api?.parseTalkgroups ?? parseCsv) : new api.TrunkClient();
const settings = Store.load();
const player = !demo && api ? new api.LivePlayer() : null;
let live = false;

// ── Systems ──────────────────────────────────────────────────────────────────
//
// Each system: { short, name, kind, tgs: Map talkgroup → { …the file's row,
// auto (what classify says), type, flavor, on }, good (its file is good
// enough), on }.

let systems = [];
const bySystem = new Map();
const classified = new Map(); // short → { csv, map }: classify once per file

function loadSystems() {
  const cfg = rec.config;
  if (!cfg) return;
  const list = [
    ...(cfg.systems ?? []).map((s) => ({ short: s.shortName, name: s.name || s.shortName, kind: s.type, enabled: s.enabled !== false, csv: s.talkgroupsCsv ?? "" })),
    ...(cfg.conventional ?? []).map((s) => ({ short: s.shortName, name: s.name || s.shortName, kind: "conventional", enabled: s.enabled !== false, csv: JSON.stringify(s.channels ?? []) })),
  ];
  systems = list.map((s) => {
    let c = classified.get(s.short);
    if (!c || c.csv !== s.csv) {
      const map = new Map();
      for (const [num, tg] of rec.talkgroups(s.short)) map.set(num, { ...tg, auto: classify(tg) });
      classified.set(s.short, (c = { csv: s.csv, map }));
    }
    const mine = Store.sys(settings, s.short);
    for (const [num, tg] of c.map) {
      const o = mine.tgs[num] ?? {};
      tg.type = o.type ?? tg.auto.type;
      tg.flavor = o.type && o.type !== tg.auto.type ? null : tg.auto.flavor;
      tg.on = o.on ?? tg.auto.enabled;
    }
    const good = wellDefined([...c.map.values()].map((t) => t.auto));
    return { ...s, tgs: c.map, good, on: mine.on ?? (good && s.enabled) };
  });
  bySystem.clear();
  for (const s of systems) bySystem.set(s.short, s);
}

const enabled = () => systems.filter((s) => s.on && [...s.tgs.values()].some((t) => t.on));

// ── Cities: one per system, rebuilt when its talkgroups change ──────────────

const cities = new Map(); // short → { key, city, view, canvas }

function cityFor(short) {
  const sys = bySystem.get(short);
  if (!sys) return null;
  const tgs = [...sys.tgs.values()].filter((t) => t.on).map((t) => ({ talkgroup: t.talkgroup, alphaTag: t.alphaTag || `Talkgroup ${t.talkgroup}`, type: t.type, flavor: t.flavor, group: t.group }));
  const key = hash(tgs.map((t) => `${t.talkgroup}:${t.type}:${t.flavor}`).join(","));
  let c = cities.get(short);
  if (c && c.key === key) return c;
  c?.view.destroy();
  const city = generateCity(short, tgs);
  const canvas = c?.canvas ?? document.createElement("canvas");
  canvas.className = "city";
  const view = new CityView(canvas, city, {
    onNews: (item) => news(short, item),
    onHover: (info, x, y) => hover(short, info, x, y),
    whimsy: () => settings.whimsy,
    whimsyEvery: demo ? [30, 90] : [90, 300],
    whimsyFirst: demo ? [6, 20] : [25, 80],
  });
  cities.set(short, (c = { key, city, view, canvas, last: performance.now() }));
  return c;
}

// ── Calls → cities ───────────────────────────────────────────────────────────

const onAir = new Map(); // "short:callId" → { short, ev } (null: a call we don't show)
const today = new Map(); // short → calls today
let day = new Date().toDateString();

const TAC = /\b(tac|fg|fireground|inc|ops|cmd|command|scene|talk)\b|\btac\d/i;

function syncCalls() {
  if (new Date().toDateString() !== day) {
    day = new Date().toDateString();
    today.clear();
  }
  const now = new Set();
  for (const c of rec.calls ?? []) {
    const key = `${c.systemName}:${c.id}`;
    now.add(key);
    if (onAir.has(key)) continue;
    const sys = bySystem.get(c.systemName);
    const tg = sys?.tgs.get(c.talkgroup);
    if (!sys?.on || (tg ? !tg.on : !settings.unknown)) {
      onAir.set(key, null);
      continue;
    }
    const ev = {
      tg: c.talkgroup,
      callId: c.id,
      alphaTag: c.alphaTag || tg?.alphaTag || `Talkgroup ${c.talkgroup}`,
      type: tg?.type ?? "other",
      flavor: tg?.flavor ?? null,
      encrypted: c.encrypted && !c.decrypted,
      emergency: c.emergency,
      tac: !!tg && TAC.test(`${tg.tag} ${tg.alphaTag}`) && !/dispatch|disp\b/i.test(`${tg.tag} ${tg.alphaTag}`),
    };
    onAir.set(key, { short: c.systemName, ev });
    today.set(c.systemName, (today.get(c.systemName) ?? 0) + 1);
    cityFor(c.systemName)?.view.callStart(ev);
  }
  for (const [key, v] of onAir)
    if (!now.has(key)) {
      onAir.delete(key);
      if (v) cities.get(v.short)?.view.callEnd(v.ev);
    }
}

// ── News ─────────────────────────────────────────────────────────────────────

const NEWS_KEEP = 40;
const newsBy = new Map(); // short → [{ text, src, type, at }]

function news(short, item) {
  const ev = item.ev;
  const src = ev ? `${ev.alphaTag}${ev.encrypted ? " · encrypted" : ""}${ev.emergency ? " · emergency" : ""}` : "";
  const list = newsBy.get(short) ?? [];
  list.unshift({ text: item.text, src, type: item.type, at: Date.now() });
  newsBy.set(short, list.slice(0, NEWS_KEEP));
  drawNews();
}

function newsHtml(n) {
  return n ? `<span class="headline">${esc(n.text)}</span>${n.src ? ` <span class="src">${esc(n.src)}</span>` : ""}` : `<span class="quiet">All quiet in town.</span>`;
}

function drawNews() {
  if (settings.view === "single") {
    const n = newsBy.get(current())?.[0];
    const el = $("news");
    const html = newsHtml(n);
    if (el.dataset.html !== html) {
      el.dataset.html = html;
      el.innerHTML = html;
      el.classList.remove("fresh");
      void el.offsetWidth;
      el.classList.add("fresh");
    }
  }
  for (const slot of slots) slot.news.innerHTML = newsHtml(newsBy.get(slot.short)?.[0]);
  if (!$("newslog").hidden) drawNewsLog();
}

function drawNewsLog() {
  const shorts = settings.view === "single" ? [current()] : slots.map((s) => s.short);
  const all = shorts.flatMap((s) => (newsBy.get(s) ?? []).map((n) => ({ ...n, short: s }))).sort((a, b) => b.at - a.at);
  $("newslog-list").innerHTML = all.length
    ? all
        .map((n) => {
          const time = new Date(n.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const where = shorts.length > 1 ? ` · ${esc(bySystem.get(n.short)?.name ?? n.short)}` : "";
          return `<li class="t-${esc(n.type)}"><time>${esc(time)}</time> ${newsHtml(n)}<span class="src">${where}</span></li>`;
        })
        .join("")
    : `<li class="quiet">Nothing yet. Headlines appear here as calls come in.</li>`;
}

$("news-more").addEventListener("click", () => {
  const log = $("newslog");
  log.hidden = !log.hidden;
  $("news-more").setAttribute("aria-expanded", String(!log.hidden));
  if (!log.hidden) drawNewsLog();
});
$("newslog-close").addEventListener("click", () => {
  $("newslog").hidden = true;
  $("news-more").setAttribute("aria-expanded", "false");
});

// ── Hover ────────────────────────────────────────────────────────────────────

function hover(short, info, x, y) {
  const tip = $("tip");
  if (!info) {
    tip.hidden = true;
    return;
  }
  const view = cities.get(short)?.view;
  let html = "";
  if (info.incident) {
    const inc = info.incident;
    const n = (newsBy.get(short) ?? []).find((m) => m.text && inc.ev && m.src.startsWith(inc.ev.alphaTag));
    html = `<b>${esc(n?.text ?? TYPE_NAMES[inc.type])}</b><br><span class="src">${esc(inc.ev?.alphaTag ?? "")}${inc.ev?.encrypted ? " · encrypted" : ""} · ${inc.live ? "on the air" : "quiet now"}</span>`;
  } else if (info.facility) {
    const f = info.facility;
    const talking = new Set();
    for (const [tg, t] of view?.talk ?? []) if (t.calls.size) talking.add(tg);
    const tgs = f.tgs ?? [];
    const shown = tgs.slice(0, 12);
    html = `<b>${esc(f.name ?? "")}</b>${f.type && TYPE_NAMES[f.type] ? `<br><span class="src">${esc(TYPE_NAMES[f.type])}</span>` : ""}`;
    if (tgs.length)
      html += `<ul>${shown.map((t) => `<li class="${talking.has(t.talkgroup) ? "talking" : ""}">${esc(t.alphaTag)}</li>`).join("")}${tgs.length > shown.length ? `<li class="more">and ${tgs.length - shown.length} more</li>` : ""}</ul>`;
  }
  if (!html) {
    tip.hidden = true;
    return;
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - r.width - 8, x + 14)}px`;
  tip.style.top = `${Math.min(window.innerHeight - r.height - 8, y + 14)}px`;
}

// ── Views: one city, or four ─────────────────────────────────────────────────

let slots = []; // { el, short, news, place }

function current() {
  const list = enabled();
  if (!list.some((s) => s.short === settings.current)) settings.current = list[0]?.short ?? null;
  return settings.current;
}

function quadShorts() {
  const list = enabled().map((s) => s.short);
  const picked = [];
  for (const s of settings.quad) if (s && list.includes(s) && !picked.includes(s)) picked.push(s);
  for (const s of list) if (picked.length < Math.min(4, list.length) && !picked.includes(s)) picked.push(s);
  return picked.slice(0, 4);
}

function layout() {
  const stage = $("stage");
  const single = settings.view === "single";
  const shorts = single ? [current()].filter(Boolean) : quadShorts();
  document.body.dataset.view = settings.view;
  $("v1").setAttribute("aria-pressed", String(single));
  $("v4").setAttribute("aria-pressed", String(!single));
  $("empty").hidden = shorts.length > 0;
  stage.hidden = !shorts.length;
  $("ticker").hidden = !single || !shorts.length;
  stage.dataset.count = String(shorts.length);
  // Keep tiles that still show the same city, so nothing jumps.
  const same = slots.length === shorts.length && slots.every((s, k) => s.short === shorts[k]);
  if (!same) {
    stage.replaceChildren();
    slots = shorts.map((short, k) => {
      const el = document.createElement("section");
      el.className = "tile";
      el.innerHTML = `<header class="tile-head">
          <button type="button" class="bevel tile-prev" aria-label="Previous system">◀</button>
          <span class="tile-name"></span>
          <span class="tile-air"></span>
          <button type="button" class="bevel tile-next" aria-label="Next system">▶</button>
        </header>
        <div class="viewport"></div>
        <footer class="tile-news"></footer>`;
      const c = cityFor(short);
      el.querySelector(".viewport").append(c.canvas);
      el.querySelector(".tile-prev").addEventListener("click", () => shiftSlot(k, -1));
      el.querySelector(".tile-next").addEventListener("click", () => shiftSlot(k, 1));
      el.querySelector(".viewport").addEventListener("dblclick", () => {
        if (settings.view === "quad") {
          settings.current = short;
          setView("single");
        }
      });
      stage.append(el);
      return { el, short, news: el.querySelector(".tile-news"), name: el.querySelector(".tile-name"), air: el.querySelector(".tile-air") };
    });
  }
  for (const s of slots) s.name.textContent = bySystem.get(s.short)?.name ?? s.short;
  drawPicker();
  drawStats();
  drawNews();
  relisten();
}

function shiftSlot(k, step) {
  const list = enabled().map((s) => s.short);
  const shown = quadShorts();
  let i = list.indexOf(shown[k]);
  for (let n = 0; n < list.length; n++) {
    i = (i + step + list.length) % list.length;
    if (!shown.includes(list[i]) || list.length <= shown.length) break;
  }
  const next = [...shown];
  next[k] = list[i];
  settings.quad = [0, 1, 2, 3].map((n) => next[n] ?? null);
  Store.save(settings);
  layout();
}

function step(dir) {
  const list = enabled();
  if (!list.length) return;
  const i = list.findIndex((s) => s.short === current());
  settings.current = list[(i + dir + list.length) % list.length].short;
  Store.save(settings);
  layout();
}

function setView(v) {
  settings.view = v;
  Store.save(settings);
  $("tip").hidden = true;
  layout();
}

function drawPicker() {
  const sel = $("pick");
  const list = enabled();
  const html = list.map((s) => `<option value="${esc(s.short)}">${esc(s.name)}</option>`).join("");
  if (sel.dataset.html !== html) {
    sel.dataset.html = html;
    sel.innerHTML = html;
  }
  sel.value = current() ?? "";
  const many = list.length > 1;
  $("prev").disabled = $("next").disabled = !many;
  $("v4").disabled = !many;
}

$("prev").addEventListener("click", () => step(-1));
$("next").addEventListener("click", () => step(1));
$("pick").addEventListener("change", (e) => {
  settings.current = e.target.value;
  Store.save(settings);
  layout();
});
$("v1").addEventListener("click", () => setView("single"));
$("v4").addEventListener("click", () => setView("quad"));
$("zin").addEventListener("click", () => zoom(1));
$("zout").addEventListener("click", () => zoom(-1));
$("zfit").addEventListener("click", () => {
  for (const s of slots) cities.get(s.short)?.view.fit();
});
function zoom(d) {
  for (const s of slots) cities.get(s.short)?.view.zoomBy(d);
}

// ── Status and figures ───────────────────────────────────────────────────────

function drawState() {
  const s = $("state");
  if (demo) {
    s.textContent = "Demo";
    s.dataset.state = "on";
  } else if (!rec.connected) {
    s.textContent = rec.exited ? "The recorder stopped; waiting for it" : "Connecting…";
    s.dataset.state = "off";
  } else if (rec.phase.phase === "running") {
    s.textContent = "On the air";
    s.dataset.state = "on";
  } else {
    s.textContent = rec.phase.phase === "starting" ? "Starting…" : "Not recording";
    s.dataset.state = "idle";
  }
  const asleep = !demo && rec.connected && rec.phase.phase !== "running";
  $("asleep").hidden = !asleep;
  $("asleep").textContent = rec.phase.error ? `The recorder isn't recording (${rec.phase.error}). The city sleeps.` : "The recorder isn't recording, so the city is asleep. Calls will wake it up.";
}

const fmt = (n) => n.toLocaleString();

function airCount(short) {
  let n = 0;
  for (const v of onAir.values()) if (v?.short === short) n++;
  return n;
}

function drawStats() {
  const short = current();
  const c = short && cities.get(short);
  const sys = short && bySystem.get(short);
  if (settings.view === "single" && c && sys) {
    const on = [...sys.tgs.values()].filter((t) => t.on).length;
    $("stats").innerHTML = [
      `<span><b>${esc(sys.name)}</b></span>`,
      `<span>Pop. <b>${fmt(c.city.population)}</b></span>`,
      `<span>Talkgroups <b>${fmt(on)}</b></span>`,
      `<span>Calls today <b>${fmt(today.get(short) ?? 0)}</b></span>`,
      `<span>On the air <b>${fmt(airCount(short))}</b></span>`,
      `<span class="date">${esc(new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }))}</span>`,
    ].join("");
  } else $("stats").innerHTML = `<span class="date">${esc(new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }))}</span>`;
  for (const s of slots) {
    const n = airCount(s.short);
    s.air.textContent = n ? `${n} on the air` : "";
  }
}

// ── Live audio ───────────────────────────────────────────────────────────────

$("live").hidden = !player;
$("live").addEventListener("click", async () => {
  live = !live;
  if (live) await player.resume();
  else player.stop();
  relisten();
  $("live").setAttribute("aria-pressed", String(live));
  $("live").textContent = live ? "■ Stop" : "🔊 Listen";
});

function relisten() {
  if (!player) return;
  if (!live) return rec.listen(false);
  if (settings.view === "single" && current()) rec.listen({ system: current() });
  else rec.listen();
}

rec.on?.("audio", (chunk) => {
  if (!live || !player) return;
  // Only the talkgroups that are on, on the systems in view.
  const short = shortOf(chunk.system);
  if (!slots.some((s) => s.short === short)) return;
  const tg = bySystem.get(short)?.tgs.get(chunk.talkgroup);
  if (tg ? !tg.on : !settings.unknown) return;
  player.play(chunk);
});

function shortOf(system) {
  const k = api?.conventionalIndex?.(system);
  if (k != null) return rec.config?.conventional?.[k]?.shortName;
  return rec.status?.systems?.find((s) => s.index === system)?.shortName;
}

// ── Full screen ──────────────────────────────────────────────────────────────
//
// The whole page, for a wall or a spare monitor. In full screen the bars
// and the pointer get out of the way after a few seconds without a move,
// and come back with one.

const IDLE_MS = 3000;
const canFull = document.fullscreenEnabled || document.webkitFullscreenEnabled;
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
let idleTimer = null;

$("full").hidden = !canFull;
$("full").addEventListener("click", toggleFull);

function toggleFull() {
  if (isFull()) (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
  else {
    const el = document.documentElement;
    // Safari's older API returns nothing; the others a promise that fails when the browser says no.
    (el.requestFullscreen ?? el.webkitRequestFullscreen).call(el)?.catch?.(() => {});
  }
}

function onFull() {
  const full = isFull();
  document.body.classList.toggle("full", full);
  $("full").setAttribute("aria-pressed", String(full));
  $("full").textContent = full ? "⛶ Exit full screen" : "⛶ Full screen";
  wake();
}
document.addEventListener("fullscreenchange", onFull);
document.addEventListener("webkitfullscreenchange", onFull);

function wake() {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  if (!isFull()) return;
  idleTimer = setTimeout(() => {
    // Not while City Planning or the paper is open.
    if (!$("settings").hidden || !$("newslog").hidden) return wake();
    document.body.classList.add("idle");
    $("tip").hidden = true;
  }, IDLE_MS);
}
for (const type of ["pointermove", "pointerdown", "keydown", "wheel"]) document.addEventListener(type, wake, { passive: true });

// ── Settings ─────────────────────────────────────────────────────────────────

$("settings-btn").addEventListener("click", () => {
  openSettings({
    getSystems: () => systems,
    settings,
    onChange: () => {
      Store.save(settings);
      loadSystems();
      onAir.clear();
      layout();
    },
    onClose: () => $("settings-btn").focus(),
  });
});
$("empty-settings").addEventListener("click", () => $("settings-btn").click());

// ── Keys ─────────────────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, select, textarea") || !$("settings").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
  else if (e.key === "1") setView("single");
  else if (e.key === "4") setView("quad");
  else if (e.key === "+" || e.key === "=") zoom(1);
  else if (e.key === "-") zoom(-1);
  else if (e.key === "0") $("zfit").click();
  else if (e.key === "u" && slots[0]) cities.get(slots[0].short)?.view.whimsy("ufo");
  else if ((e.key === "f" || e.key === "F") && canFull) toggleFull();
  else return;
  e.preventDefault();
});

// ── The logo ─────────────────────────────────────────────────────────────────

function drawLogo() {
  const words = [
    ["TRUNK CITY", 0xffe060],
    [" 2000", 0x80e0ff],
  ];
  const w = textWidth("TRUNK CITY 2000", 1) + 3;
  const p = new Pix(w, 9);
  let x = 1;
  for (const [t, c] of words) {
    bitmapText(p, t, x, 1, c, 1, 0x202040);
    x += t.length * 6;
  }
  const c = $("logo");
  c.width = p.w;
  c.height = p.h;
  c.style.width = `${p.w * 2}px`;
  c.style.height = `${p.h * 2}px`;
  c.getContext("2d").putImageData(new ImageData(p.data, p.w, p.h), 0, 0);
}
drawLogo();

// ── Running ──────────────────────────────────────────────────────────────────

let configSeen = null;
function onChange() {
  if (rec.config && rec.config !== configSeen) {
    configSeen = rec.config;
    loadSystems();
    layout();
  }
  syncCalls();
  drawState();
}
rec.on("change", onChange);
rec.on("hello", () => {
  // Count today's calls from the history the recorder sent.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  today.clear();
  for (const e of rec.history ?? []) {
    const r = e.record;
    if (r.start_time * 1000 >= start.getTime()) today.set(r.short_name, (today.get(r.short_name) ?? 0) + 1);
  }
});

let lastStats = 0,
  lastHidden = 0;
function loop(now) {
  for (const s of slots) cities.get(s.short)?.view.frame(now);
  // Cities out of view keep going, slowly, so they're as busy as their radio when you look.
  if (now - lastHidden > 500) {
    lastHidden = now;
    for (const [short, c] of cities) {
      if (slots.some((s) => s.short === short)) {
        c.last = now;
        continue;
      }
      c.view.update(Math.min(0.5, (now - c.last) / 1000));
      c.view.last = null;
      c.last = now;
    }
  }
  if (now - lastStats > 1000) {
    lastStats = now;
    drawStats();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
drawState();
// For poking at from the console: trunkCity.cities.get("short").view.whimsy("ufo").
window.trunkCity = { cities, systems: () => systems, settings };
if (demo) $("demo-note").hidden = false;

/** A talkgroup CSV, for the demo when there's no recorder to lend its parser. */
function parseCsv(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split(",");
  const map = new Map();
  for (const line of lines) {
    const f = line.split(",");
    const get = (n) => f[head.indexOf(n)] ?? "";
    const talkgroup = parseInt(f[0], 10);
    map.set(talkgroup, { talkgroup, alphaTag: get("Alpha Tag"), description: get("Description"), tag: get("Tag"), group: get("Category"), mode: get("Mode") });
  }
  return map;
}
