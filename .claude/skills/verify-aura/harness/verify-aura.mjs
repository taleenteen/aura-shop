#!/usr/bin/env node
// verify-aura: launch an isolated Aura Tech stack (Postgres container + Go API + Vite web),
// drive it with Playwright (system Chrome/Edge), capture evidence, and tear it down.
// Usage: node .claude/skills/verify-aura/harness/verify-aura.mjs <command> [args]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync, cpSync, appendFileSync } from "node:fs";
import { dirname, join, resolve, basename, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(HERE, "..");
const ROOT = resolve(SKILL, "..", "..", "..");
const API_DIR = join(ROOT, "apps", "api");
const WEB_DIR = join(ROOT, "apps", "web");
const WORK = join(ROOT, ".verify-aura");
const STATE_FILE = join(WORK, "state.json");
const IS_WIN = process.platform === "win32";

const PORTS = {
  pg: Number(process.env.VERIFY_PG_PORT || 55432),
  api: Number(process.env.VERIFY_API_PORT || 18080),
  web: Number(process.env.VERIFY_WEB_PORT || 15173),
  minio: Number(process.env.VERIFY_MINIO_PORT || 19000),
};
const MINIO = { user: "verifyminio", password: "verifyminio-secret", bucket: "aura-assets" };
const PG = { user: "aura_admin", password: "verify_pw", db: "aura_ecommerce" };
// Seeded product images are absolute URLs into the developer's MinIO (read-only for us).
// Uploads made during a run go to this run's own MinIO container, never the developer's bucket.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[verify-aura]", ...a);
const die = (msg, code = 1) => { console.error("[verify-aura] ERROR:", msg); process.exit(code); };

function readState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
}
function writeState(s) { mkdirSync(WORK, { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function killTree(pid) {
  if (!pid || !pidAlive(pid)) return;
  if (IS_WIN) sh("taskkill", ["/PID", String(pid), "/T", "/F"]);
  else { try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch {} } }
}
function listeningPid(port) {
  if (IS_WIN) {
    // netstat can omit listeners and localizes state names, so ask the TCP table directly:
    // a listener is the row on this local port with remote port 0. Covers IPv4 and IPv6.
    const ps = sh("powershell", ["-NoProfile", "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object { $_.RemotePort -eq 0 -and $_.OwningProcess -gt 0 } | Select-Object -First 1 -ExpandProperty OwningProcess`]);
    if (ps.code === 0 && /^\d+$/.test(ps.out)) return Number(ps.out);
    const r = sh("netstat", ["-ano"]);
    for (const line of r.out.split(/\r?\n/)) {
      const p = line.trim().split(/\s+/);
      if (p[0] === "TCP" && p[1]?.endsWith(`:${port}`) && /^(0\.0\.0\.0|\[::\]):0$/.test(p[2]) && Number(p.at(-1)) > 0) return Number(p.at(-1));
    }
    return null;
  }
  const r = sh("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return r.out ? Number(r.out.split("\n")[0]) : null;
}
async function http(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, text, json };
  } catch (e) { return { status: 0, text: String(e), json: null }; }
}
async function waitFor(label, fn, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) { log(`${label}: ready (${((Date.now() - t0) / 1000).toFixed(1)}s)`); return; }
    await sleep(1000);
  }
  throw new Error(`${label}: not ready after ${timeoutMs / 1000}s`);
}
function spawnDetached(cmd, args, { env, cwd, logFile }) {
  const fd = openSync(logFile, "a");
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", fd, fd], windowsHide: true });
  child.unref();
  return child.pid;
}
function gitRev() { return sh("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).out + (sh("git", ["status", "--porcelain"], { cwd: ROOT }).out ? "+dirty" : ""); }
const apiBase = (s) => `http://127.0.0.1:${s.ports.api}/api/v1`;
const webBase = (s) => `http://localhost:${s.ports.web}`;
const requireState = () => readState() || die("no active run. Start one with: verify-aura up");

// ---------------------------------------------------------------- up
async function up() {
  const prev = readState();
  if (prev) die(`run ${prev.runId} is already active (started ${prev.startedAt}). Run 'verify-aura doctor' or 'verify-aura down' first.`);
  for (const [k, port] of Object.entries(PORTS)) {
    const owner = listeningPid(port);
    if (owner) die(`port ${port} (${k}) is already in use by PID ${owner}. Refusing to share an instance; set VERIFY_${k.toUpperCase()}_PORT to another port.`);
  }
  if (sh("docker", ["info", "--format", "{{.ServerVersion}}"]).code !== 0) die("docker is not running");

  const runId = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const runDir = join(WORK, "runs", runId);
  const evidenceDir = join(WORK, "evidence", runId);
  mkdirSync(runDir, { recursive: true }); mkdirSync(evidenceDir, { recursive: true });
  const state = { runId, startedAt: new Date().toISOString(), rev: gitRev(), ports: PORTS, runDir, evidenceDir,
    container: `aura_verify_pg_${runId}`, minioContainer: `aura_verify_minio_${runId}`, apiPid: null, webPid: null };
  writeState(state);

  try {
    log(`run ${runId}: building API binary`);
    const exe = join(runDir, IS_WIN ? "aura-api.exe" : "aura-api");
    const b = sh("go", ["build", "-o", exe, "./cmd/server"], { cwd: API_DIR });
    if (b.code !== 0) throw new Error(`go build failed:\n${b.err}`);

    log(`starting Postgres container ${state.container} on :${PORTS.pg}`);
    const d = sh("docker", ["run", "-d", "--name", state.container, "--label", "verify-aura=1",
      "-e", `POSTGRES_USER=${PG.user}`, "-e", `POSTGRES_PASSWORD=${PG.password}`, "-e", `POSTGRES_DB=${PG.db}`,
      "-p", `127.0.0.1:${PORTS.pg}:5432`,
      "-v", `${join(ROOT, "infra", "postgres", "init.sql")}:/docker-entrypoint-initdb.d/init.sql:ro`,
      "postgres:16-alpine"]);
    if (d.code !== 0) throw new Error(`docker run failed: ${d.err}`);
    // pg_isready over TCP only succeeds once the init-script phase (unix-socket-only temp server) is over.
    await waitFor("postgres", async () => sh("docker", ["exec", state.container, "pg_isready", "-h", "127.0.0.1", "-U", PG.user, "-d", PG.db]).code === 0
      && sh("docker", ["exec", state.container, "psql", "-h", "127.0.0.1", "-U", PG.user, "-d", PG.db, "-tAc", "select 1 from pg_extension where extname='pg_trgm'"]).out === "1", 90000);

    log(`starting MinIO ${state.minioContainer} on :${PORTS.minio}`);
    const mi = sh("docker", ["run", "-d", "--name", state.minioContainer, "--label", "verify-aura=1",
      "-e", `MINIO_ROOT_USER=${MINIO.user}`, "-e", `MINIO_ROOT_PASSWORD=${MINIO.password}`,
      "-p", `127.0.0.1:${PORTS.minio}:9000`, "pgsty/minio:latest", "server", "/data"]);
    if (mi.code !== 0) throw new Error(`docker run minio failed: ${mi.err}`);
    await waitFor("minio", async () => (await http(`http://127.0.0.1:${PORTS.minio}/minio/health/live`)).status === 200, 60000);

    log(`starting API on :${PORTS.api} (migrates + auto-seeds empty DB)`);
    state.apiPid = spawnDetached(exe, [], { cwd: API_DIR, logFile: join(runDir, "api.log"), env: {
      DATABASE_URL: `postgres://${PG.user}:${PG.password}@127.0.0.1:${PORTS.pg}/${PG.db}?sslmode=disable`,
      API_PORT: String(PORTS.api), GEMINI_API_KEY: "",
      MINIO_ENDPOINT: `127.0.0.1:${PORTS.minio}`, MINIO_ROOT_USER: MINIO.user, MINIO_ROOT_PASSWORD: MINIO.password,
      MINIO_BUCKET_NAME: MINIO.bucket, MINIO_PUBLIC_URL: `http://localhost:${PORTS.minio}/${MINIO.bucket}` } });
    writeState(state);
    await waitFor("api seeded", async () => {
      if (!pidAlive(state.apiPid)) throw new Error(`API exited; see ${join(runDir, "api.log")}`);
      const h = await http(`http://127.0.0.1:${PORTS.api}/health`);
      if (h.status !== 200) return false;
      const c = await http(`${apiBase(state)}/catalog?limit=1`);
      const login = await http(`${apiBase(state)}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@auratech.co.th", password: "password123" }) });
      return c.json?.data?.length > 0 && login.status === 200;
    }, 120000);

    log(`starting web (Vite) on :${PORTS.web}, proxying /api -> :${PORTS.api}`);
    state.webPid = spawnDetached(process.execPath, [fileURLToPath(import.meta.url), "_serve-web"], { cwd: WEB_DIR,
      logFile: join(runDir, "web.log"), env: { VERIFY_WEB_PORT: String(PORTS.web), VERIFY_API_PORT: String(PORTS.api) } });
    writeState(state);
    await waitFor("web", async () => {
      if (!pidAlive(state.webPid)) throw new Error(`web server exited; see ${join(runDir, "web.log")}`);
      const page = await http(webBase(state));
      const viaProxy = await http(`${webBase(state)}/api/v1/categories`);
      return page.status === 200 && viaProxy.status === 200;
    }, 90000);

    log(`READY  web=${webBase(state)}  api=${apiBase(state)}  evidence=${evidenceDir}`);
  } catch (e) {
    console.error(String(e.message || e));
    log("startup failed; tearing down what this run started");
    await down({ quiet: true });
    process.exit(1);
  }
}

// Long-running child: Vite dev server using the project's own config + a same-origin /api proxy.
async function serveWeb() {
  const { createServer } = await import(pathToFileURL(join(WEB_DIR, "node_modules", "vite", "dist", "node", "index.js")).href);
  process.env.VITE_API_BASE_URL = "/api/v1";
  const server = await createServer({
    root: WEB_DIR, configFile: join(WEB_DIR, "vite.config.ts"), clearScreen: false,
    server: { port: Number(process.env.VERIFY_WEB_PORT), strictPort: true, host: "localhost",
      proxy: { "/api": { target: `http://127.0.0.1:${process.env.VERIFY_API_PORT}`, changeOrigin: true } } },
  });
  await server.listen();
  server.printUrls();
}

// ---------------------------------------------------------------- doctor
async function doctor() {
  const s = readState();
  if (!s) { console.log("NO ACTIVE RUN (state file absent). Nothing to drive; run 'verify-aura up'."); process.exit(2); }
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  add("api process alive", pidAlive(s.apiPid), `pid ${s.apiPid}`);
  add("web process alive", pidAlive(s.webPid), `pid ${s.webPid}`);
  const insp = sh("docker", ["inspect", "-f", "{{.State.Running}}", s.container]);
  add("postgres container running", insp.out === "true", s.container);
  // On Windows the listening PID of the API is the exe itself; for web it is our node child.
  const apiOwner = listeningPid(s.ports.api), webOwner = listeningPid(s.ports.web);
  add(`port ${s.ports.api} owned by this run`, apiOwner === s.apiPid, `owner pid ${apiOwner}`);
  add(`port ${s.ports.web} owned by this run`, webOwner === s.webPid, `owner pid ${webOwner}`);
  const h = await http(`http://127.0.0.1:${s.ports.api}/health`);
  add("api /health", h.status === 200, h.text.slice(0, 80));
  const p = await http(`${webBase(s)}/api/v1/catalog?limit=1`);
  add("web proxy -> api catalog has products", p.json?.data?.length > 0, `status ${p.status}`);
  const login = await http(`${apiBase(s)}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@auratech.co.th", password: "password123" }) });
  add("seed admin can log in", login.status === 200, `status ${login.status}`);
  const rev = gitRev();
  add("build matches checkout", rev === s.rev, `built ${s.rev}, now ${rev}${rev === s.rev ? "" : " (restart: down && up)"}`);
  const img = await http("http://localhost:9000/minio/health/live");
  checks.push({ name: "dev MinIO reachable for product images (non-fatal)", ok: img.status === 200, detail: "images render blank if down", warn: true });
  let fatal = false;
  for (const c of checks) {
    console.log(`${c.ok ? "OK  " : c.warn ? "WARN" : "FAIL"}  ${c.name}  (${c.detail})`);
    if (!c.ok && !c.warn) fatal = true;
  }
  console.log(`run=${s.runId} web=${webBase(s)} api=${apiBase(s)} evidence=${s.evidenceDir}`);
  process.exit(fatal ? 1 : 0);
}

// ---------------------------------------------------------------- down
async function down({ quiet = false } = {}) {
  const s = readState();
  if (!s) { if (!quiet) log("no active run"); return; }
  killTree(s.webPid); killTree(s.apiPid);
  sh("docker", ["rm", "-f", "-v", s.container]);
  if (s.minioContainer) sh("docker", ["rm", "-f", "-v", s.minioContainer]);
  // Keep server logs with the evidence, then drop scratch state (binary, logs).
  for (const f of ["api.log", "web.log"]) {
    const src = join(s.runDir, f);
    if (existsSync(src)) { mkdirSync(join(s.evidenceDir, "server-logs"), { recursive: true }); cpSync(src, join(s.evidenceDir, "server-logs", f)); }
  }
  await sleep(500);
  try { rmSync(s.runDir, { recursive: true, force: true }); } catch (e) { log(`could not remove ${s.runDir}: ${e.message}`); }
  rmSync(STATE_FILE, { force: true });
  log(`run ${s.runId} torn down. Evidence kept at ${s.evidenceDir}`);
}

// ---------------------------------------------------------------- browser
async function launchBrowser(headed) {
  const { chromium } = await import("playwright-core");
  for (const channel of ["chrome", "msedge"]) {
    try { return await chromium.launch({ channel, headless: !headed }); } catch {}
  }
  die("could not launch Chrome or Edge via playwright-core");
}

async function snapshot(path = "/", { headed = false } = {}) {
  const s = requireState();
  // Git Bash rewrites a leading "/" into a Windows path; accept "catalog" or "home" instead.
  if (/^[A-Za-z]:[\\/]/.test(path)) die(`path was rewritten by the shell (${path}). Pass it without the leading slash, e.g. 'snapshot catalog', or set MSYS_NO_PATHCONV=1.`);
  path = path === "home" ? "/" : path.startsWith("/") ? path : `/${path}`;
  const browser = await launchBrowser(headed);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(webBase(s) + path, { waitUntil: "networkidle" });
  const dir = join(s.evidenceDir, "snapshots"); mkdirSync(dir, { recursive: true });
  const name = (path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root") + `-${Date.now()}`;
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
  const aria = await page.locator("body").ariaSnapshot();
  writeFileSync(join(dir, `${name}.aria.yml`), aria);
  console.log(aria);
  console.log(`\n[verify-aura] saved ${join(dir, name)}.{png,aria.yml}`);
  await browser.close();
}

async function journey(target, { headed = false } = {}) {
  const s = requireState();
  const file = existsSync(join(SKILL, "journeys", `${target}.mjs`)) ? join(SKILL, "journeys", `${target}.mjs`)
    : isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (!existsSync(file)) die(`journey not found: ${target} (looked in ${join(SKILL, "journeys")})`);
  const name = basename(file, ".mjs");
  const outDir = join(s.evidenceDir, `${name}-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser(headed);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: webBase(s) });
  const page = await context.newPage();
  const consoleLog = join(outDir, "console.log");
  page.on("console", (m) => appendFileSync(consoleLog, `[${m.type()}] ${m.text()}\n`));
  page.on("pageerror", (e) => appendFileSync(consoleLog, `[pageerror] ${e.message}\n`));
  const network = [];
  page.on("response", (r) => { if (r.url().includes("/api/v1/")) network.push({ status: r.status(), method: r.request().method(), url: r.url().replace(webBase(s), "") }); });

  const steps = [];
  let n = 0;
  const step = async (label, fn) => {
    n += 1; const id = String(n).padStart(2, "0");
    const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
    try {
      const detail = await fn();
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.screenshot({ path: join(outDir, `${id}-${slug}.png`) });
      writeFileSync(join(outDir, `${id}-${slug}.aria.yml`), await page.locator("body").ariaSnapshot().catch(() => ""));
      steps.push({ id, label, ok: true, detail: detail ?? null });
      log(`PASS ${id} ${label}${detail ? ` -> ${JSON.stringify(detail)}` : ""}`);
      return detail;
    } catch (e) {
      await page.screenshot({ path: join(outDir, `${id}-${slug}-FAILED.png`) }).catch(() => {});
      writeFileSync(join(outDir, `${id}-${slug}-FAILED.aria.yml`), await page.locator("body").ariaSnapshot().catch(() => ""));
      steps.push({ id, label, ok: false, error: String(e.message || e) });
      log(`FAIL ${id} ${label}: ${e.message || e}`);
      throw e;
    }
  };
  const api = async (method, path, body, token) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return http(apiBase(s) + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  };
  const sql = (query) => sqlQuery(s, query);
  const check = (cond, msg) => { if (!cond) throw new Error(`assertion failed: ${msg}`); };

  let ok = true, error = null;
  try {
    const mod = await import(pathToFileURL(file).href);
    await mod.default({ page, context, step, api, sql, check, base: webBase(s), outDir });
  } catch (e) { ok = false; error = String(e.message || e); }
  writeFileSync(join(outDir, "network.json"), JSON.stringify(network, null, 2));
  const result = { journey: name, ok, error, run: s.runId, rev: s.rev, at: new Date().toISOString(), steps };
  writeFileSync(join(outDir, "result.json"), JSON.stringify(result, null, 2));
  await browser.close();
  log(`${ok ? "JOURNEY PASSED" : "JOURNEY FAILED"}: ${name}. Evidence: ${outDir}`);
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------- api / sql
function sqlQuery(s, query) {
  const r = sh("docker", ["exec", s.container, "psql", "-h", "127.0.0.1", "-U", PG.user, "-d", PG.db, "-At", "-F", "\t", "-c", query]);
  if (r.code !== 0) throw new Error(`sql failed: ${r.err}`);
  return r.out;
}
async function apiCmd(method, path, body) {
  const s = requireState();
  const headers = { "Content-Type": "application/json" };
  if (process.env.VERIFY_TOKEN) headers.Authorization = `Bearer ${process.env.VERIFY_TOKEN}`;
  if (process.env.VERIFY_GUEST) headers["X-Guest-Session-ID"] = process.env.VERIFY_GUEST;
  const r = await http(apiBase(s) + path, { method: method.toUpperCase(), headers, body });
  console.log(`HTTP ${r.status}`);
  console.log(r.json ? JSON.stringify(r.json, null, 2) : r.text);
  process.exit(r.status >= 200 && r.status < 300 ? 0 : 1);
}

// ---------------------------------------------------------------- main
const [cmd, ...rest] = process.argv.slice(2);
const headed = rest.includes("--headed");
const args = rest.filter((a) => a !== "--headed");
const HELP = `verify-aura <command>
  up                       start isolated Postgres + API + web; prints READY line
  doctor                   read-only health check of the active run (exit 0 = drivable)
  journey <name|file.mjs>  run a Playwright journey from journeys/ and capture evidence [--headed]
  snapshot [path]          print ARIA snapshot of a page and save a screenshot [--headed]
  api <METHOD> <path> [json]  call the isolated API (env VERIFY_TOKEN, VERIFY_GUEST)
  sql "<query>"            run SQL against the isolated database
  down                     tear down this run; evidence is kept`;
switch (cmd) {
  case "up": await up(); break;
  case "_serve-web": await serveWeb(); break;
  case "doctor": await doctor(); break;
  case "down": await down(); break;
  case "snapshot": await snapshot(args[0] || "/", { headed }); break;
  case "journey": if (!args[0]) die("usage: journey <name>"); await journey(args[0], { headed }); break;
  case "api": if (args.length < 2) die("usage: api <METHOD> <path> [json]"); await apiCmd(args[0], args[1], args[2]); break;
  case "sql": console.log(sqlQuery(requireState(), args[0])); break;
  default: console.log(HELP); process.exit(cmd ? 1 : 0);
}
