#!/usr/bin/env node
// Opens the page in headless Chrome, lets it run, and saves a screenshot;
// prints what the page logged and any errors. For the store's screenshots,
// and for checking the page runs.
//
//   node tools/shoot.mjs http://localhost:8099/?demo out.png [--wait 8] [--size 1280x800] [--eval "js"] [--dark]
//                        [--count 4 --every 2]
//
// --eval runs in the page after half the wait (open a panel, press a key…).

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [url, out] = args;
const wait = Number(opt("wait", 8)) * 1000;
const [w, h] = opt("size", "1280x800").split("x").map(Number);
const scale = Number(opt("scale", 1));
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "tc2k-"))}`, "--no-first-run", "--hide-scrollbars", `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
let errors = 0;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) return pending.get(m.id)(m.result ?? m.error), pending.delete(m.id);
  if (m.method === "Runtime.consoleAPICalled") console.log(`[${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown") {
    errors++;
    console.log("[exception]", m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") console.log("[log]", m.params.entry.text, m.params.entry.url ?? "");
};
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile: w < 600 });
if (args.includes("--dark")) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await send("Page.navigate", { url });
await sleep(wait / 2);
if (opt("eval")) {
  const r = await send("Runtime.evaluate", { expression: opt("eval"), awaitPromise: true, returnByValue: true, userGesture: true });
  if (r?.exceptionDetails) console.log("[eval error]", r.exceptionDetails.exception?.description);
  else if (r?.result?.value !== undefined) console.log("[eval]", JSON.stringify(r.result.value));
}
await sleep(wait / 2);
// --count n --every s: n screenshots s seconds apart (out-1.png, out-2.png…), to see motion.
const count = Number(opt("count", 1)),
  every = Number(opt("every", 2)) * 1000;
for (let n = 1; out && n <= count; n++) {
  const file = count > 1 ? out.replace(/\.png$/, `-${n}.png`) : out;
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  console.log(`saved ${file}`);
  if (n < count) await sleep(every);
}
ws.close();
chrome.kill();
process.exit(errors ? 1 : 0);
