// The settings page ("City Planning"): which systems get a city, and for
// each, which of its talkgroups count and what kind of thing each one is.
// What's chosen is kept in this browser (settings.js).

import { TYPES, TYPE_NAMES } from "./classify.js";
import * as Store from "./settings.js";

const PAGE = 150;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Opens the page. getSystems() → the systems as app.js has them; onChange() after every change. */
export function openSettings({ getSystems, settings, onChange, onClose }) {
  const root = $("settings");
  const open = new Set(); // systems shown open
  const filter = new Map(); // short → { text, type, page }
  let timer = null;
  const changed = (now) => {
    clearTimeout(timer);
    // Rebuilding a city is quick, but not per click: wait for a pause.
    timer = setTimeout(onChange, now ? 0 : 450);
  };

  const close = () => {
    clearTimeout(timer);
    onChange();
    root.hidden = true;
    document.removeEventListener("keydown", key);
    onClose?.();
  };
  const key = (e) => {
    if (e.key === "Escape") close();
  };

  function draw() {
    const systems = getSystems();
    root.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="planning-title">
        <header class="panel-head">
          <h2 id="planning-title">City Planning</h2>
          <button type="button" class="bevel" id="planning-close">Close</button>
        </header>
        <div class="panel-body">
          <section class="group">
            <h3>Ordinances</h3>
            <label class="check"><input type="checkbox" id="opt-whimsy" ${settings.whimsy ? "checked" : ""}> Unexplained phenomena (saucers, balloons, the occasional Bigfoot)</label>
            <label class="check"><input type="checkbox" id="opt-unknown" ${settings.unknown ? "checked" : ""}> Show calls on talkgroups that aren't in the talkgroup file</label>
            <label class="check">Background traffic <select id="opt-traffic">${[["none", "None"], ["light", "Light"], ["normal", "Busy"]].map(([v, l]) => `<option value="${v}" ${settings.traffic === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
            <label class="check"><input type="checkbox" id="opt-dim" ${settings.dim ? "checked" : ""}> Quiet the city, so what's on the radio stands out</label>
            <label class="check"><input type="checkbox" id="opt-ids" ${settings.unitIds ? "checked" : ""}> Label radios that have no name with their ID</label>
            <p class="hint">Talkgroups are sorted by their Tag, Category, Alpha Tag and Description, as RadioReference has them. Change any of them below; your choices are kept in this browser.</p>
          </section>
          <section class="group">
            <h3>Cities</h3>
            ${systems.length ? systems.map(systemHtml).join("") : `<p class="hint">The recorder has no systems yet.</p>`}
          </section>
        </div>
      </div>`;
    root.hidden = false;
    $("planning-close").onclick = close;
    $("opt-whimsy").onchange = (e) => {
      settings.whimsy = e.target.checked;
      Store.save(settings);
    };
    $("opt-unknown").onchange = (e) => {
      settings.unknown = e.target.checked;
      changed(true);
    };
    $("opt-traffic").onchange = (e) => {
      settings.traffic = e.target.value;
      changed(true);
    };
    $("opt-dim").onchange = (e) => {
      settings.dim = e.target.checked;
      changed(true);
    };
    $("opt-ids").onchange = (e) => {
      settings.unitIds = e.target.checked;
      Store.save(settings);
    };
    for (const el of root.querySelectorAll("[data-sys]")) wire(el, systems.find((s) => s.short === el.dataset.sys));
  }

  function systemHtml(s) {
    const tgs = [...s.tgs.values()];
    const on = tgs.filter((t) => t.on).length;
    const note = !tgs.length ? "No talkgroup file" : s.good ? "" : "Few talkgroups say what they are";
    return `<div class="sys" data-sys="${esc(s.short)}">
      <div class="sys-head">
        <label class="check"><input type="checkbox" class="sys-on" ${s.on ? "checked" : ""} ${tgs.length ? "" : "disabled"}> <b>${esc(s.name)}</b></label>
        <span class="sys-meta">${esc(s.kind)} · ${on} of ${tgs.length} talkgroups${note ? ` · <i>${esc(note)}</i>` : ""}</span>
        ${tgs.length ? `<button type="button" class="bevel sys-open" aria-expanded="${open.has(s.short)}">${open.has(s.short) ? "Hide talkgroups" : "Talkgroups…"}</button>` : ""}
      </div>
      ${open.has(s.short) ? `<div class="sys-body">${bodyHtml(s)}</div>` : ""}
    </div>`;
  }

  function bodyHtml(s) {
    const f = filter.get(s.short) ?? { text: "", type: "", page: 0 };
    const tgs = [...s.tgs.values()];
    const counts = {};
    for (const t of tgs) {
      const c = (counts[t.type] ??= { all: 0, on: 0 });
      c.all++;
      if (t.on) c.on++;
    }
    const chips = TYPES.filter((t) => counts[t])
      .map((t) => `<button type="button" class="chip t-${t} ${f.type === t ? "picked" : ""}" data-type="${t}" title="Show only these">${esc(TYPE_NAMES[t])} <b>${counts[t].on}/${counts[t].all}</b></button>`)
      .join("");
    const groups = [...new Set(tgs.map((t) => t.group).filter(Boolean))].sort();
    const needle = f.text.trim().toLowerCase();
    const rows = tgs.filter((t) => (!f.type || t.type === f.type) && (!needle || `${t.talkgroup} ${t.alphaTag} ${t.description} ${t.tag} ${t.group}`.toLowerCase().includes(needle)));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    const page = Math.min(f.page, pages - 1);
    const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
    const opts = (t) =>
      TYPES.map((x) => `<option value="${x}" ${x === t.type ? "selected" : ""}>${esc(TYPE_NAMES[x])}${x === t.auto.type ? " (auto)" : ""}</option>`).join("");
    return `
      <div class="chips">${chips}</div>
      <div class="tools">
        <input type="search" class="tg-find" placeholder="Find a talkgroup" value="${esc(f.text)}" aria-label="Find a talkgroup">
        <button type="button" class="bevel tg-all" data-on="1">All on</button>
        <button type="button" class="bevel tg-all" data-on="0">All off</button>
        ${groups.length ? `<span class="regroup"><select class="tg-group" aria-label="A group"><option value="">Group…</option>${groups.map((g) => `<option>${esc(g)}</option>`).join("")}</select> is <select class="tg-group-type" aria-label="Its type"><option value="">…</option>${TYPES.map((x) => `<option value="${x}">${esc(TYPE_NAMES[x])}</option>`).join("")}</select></span>` : ""}
        <button type="button" class="bevel tg-reset">Back to automatic</button>
      </div>
      <p class="hint">${rows.length === tgs.length ? `${tgs.length} talkgroups.` : `${rows.length} of ${tgs.length} talkgroups shown; All on, All off and Back to automatic change just these.`}</p>
      <div class="tg-wrap"><table class="tgs">
        <thead><tr><th scope="col">On</th><th scope="col">TG</th><th scope="col">Name</th><th scope="col" class="wide">Description</th><th scope="col" class="wide">Tag</th><th scope="col" class="wide">Group</th><th scope="col">Is</th></tr></thead>
        <tbody>${shown
          .map(
            (t) => `<tr data-tg="${t.talkgroup}" class="${t.on ? "" : "off"}">
          <td><input type="checkbox" class="tg-on" ${t.on ? "checked" : ""} aria-label="${esc(t.alphaTag)} on"></td>
          <td class="num">${t.talkgroup}</td>
          <td>${esc(t.alphaTag)}</td>
          <td class="wide">${esc(t.description)}</td>
          <td class="wide">${esc(t.tag)}</td>
          <td class="wide">${esc(t.group)}</td>
          <td><select class="tg-type" aria-label="${esc(t.alphaTag)} is" title="${esc(`Automatic: ${TYPE_NAMES[t.auto.type]}, from ${t.auto.why}`)}">${opts(t)}</select></td>
        </tr>`,
          )
          .join("")}</tbody>
      </table></div>
      ${pages > 1 ? `<div class="pager"><button type="button" class="bevel pg" data-p="${page - 1}" ${page ? "" : "disabled"}>◀</button> Page ${page + 1} of ${pages} <button type="button" class="bevel pg" data-p="${page + 1}" ${page < pages - 1 ? "" : "disabled"}>▶</button></div>` : ""}`;
  }

  function wire(el, s) {
    const mine = Store.sys(settings, s.short);
    const f = filter.get(s.short) ?? { text: "", type: "", page: 0 };
    filter.set(s.short, f);
    const redraw = () => {
      const body = el.querySelector(".sys-body");
      if (body) body.innerHTML = bodyHtml(s);
      const head = el.querySelector(".sys-meta");
      if (head) {
        const tgs = [...s.tgs.values()];
        head.innerHTML = `${esc(s.kind)} · ${tgs.filter((t) => t.on).length} of ${tgs.length} talkgroups`;
      }
      wireBody();
    };
    const rows = () => {
      const needle = f.text.trim().toLowerCase();
      return [...s.tgs.values()].filter((t) => (!f.type || t.type === f.type) && (!needle || `${t.talkgroup} ${t.alphaTag} ${t.description} ${t.tag} ${t.group}`.toLowerCase().includes(needle)));
    };
    const setOn = (t, on) => {
      t.on = on;
      const o = (mine.tgs[t.talkgroup] ??= {});
      if (on === t.auto.enabled) delete o.on;
      else o.on = on;
      tidy(t);
    };
    const setType = (t, type) => {
      t.type = type;
      t.flavor = type === t.auto.type ? t.auto.flavor : null;
      const o = (mine.tgs[t.talkgroup] ??= {});
      if (type === t.auto.type) delete o.type;
      else o.type = type;
      tidy(t);
    };
    const tidy = (t) => {
      if (mine.tgs[t.talkgroup] && !Object.keys(mine.tgs[t.talkgroup]).length) delete mine.tgs[t.talkgroup];
    };

    el.querySelector(".sys-on").onchange = (e) => {
      mine.on = e.target.checked;
      s.on = e.target.checked;
      changed(true);
    };
    const toggle = el.querySelector(".sys-open");
    if (toggle)
      toggle.onclick = () => {
        open.has(s.short) ? open.delete(s.short) : open.add(s.short);
        const fresh = document.createElement("div");
        fresh.innerHTML = systemHtml(s);
        const next = fresh.firstElementChild;
        el.replaceWith(next);
        wire(next, s);
      };

    function wireBody() {
      const body = el.querySelector(".sys-body");
      if (!body) return;
      for (const c of body.querySelectorAll(".chip"))
        c.onclick = () => {
          f.type = f.type === c.dataset.type ? "" : c.dataset.type;
          f.page = 0;
          redraw();
        };
      const find = body.querySelector(".tg-find");
      find.oninput = () => {
        f.text = find.value;
        f.page = 0;
        const at = find.selectionStart;
        redraw();
        const again = el.querySelector(".tg-find");
        again.focus();
        again.setSelectionRange(at, at);
      };
      for (const b of body.querySelectorAll(".tg-all"))
        b.onclick = () => {
          for (const t of rows()) setOn(t, b.dataset.on === "1");
          redraw();
          changed();
        };
      const group = body.querySelector(".tg-group"),
        groupType = body.querySelector(".tg-group-type");
      if (groupType)
        groupType.onchange = () => {
          if (!group.value || !groupType.value) return;
          for (const t of s.tgs.values()) if (t.group === group.value) setType(t, groupType.value);
          redraw();
          changed();
        };
      body.querySelector(".tg-reset").onclick = () => {
        for (const t of rows()) {
          delete mine.tgs[t.talkgroup];
          t.on = t.auto.enabled;
          t.type = t.auto.type;
          t.flavor = t.auto.flavor;
        }
        redraw();
        changed();
      };
      for (const b of body.querySelectorAll(".pg"))
        b.onclick = () => {
          f.page = Number(b.dataset.p);
          redraw();
        };
      body.querySelector("tbody").onchange = (e) => {
        const tr = e.target.closest("tr");
        const t = s.tgs.get(Number(tr.dataset.tg));
        if (!t) return;
        if (e.target.classList.contains("tg-on")) {
          setOn(t, e.target.checked);
          tr.classList.toggle("off", !t.on);
        } else if (e.target.classList.contains("tg-type")) setType(t, e.target.value);
        changed();
        const head = el.querySelector(".sys-meta");
        const tgs = [...s.tgs.values()];
        if (head) head.innerHTML = `${esc(s.kind)} · ${tgs.filter((x) => x.on).length} of ${tgs.length} talkgroups`;
      };
    }
    wireBody();
  }

  document.addEventListener("keydown", key);
  draw();
  $("planning-close").focus();
}
