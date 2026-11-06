#!/usr/bin/env node
// Reset the database to a fresh install: drop and recreate the Postgres database, then let the
// API rebuild the schema and load the sample data on start-up.
//
// Only the database is touched. Product and banner images live in MinIO and are kept: they are
// not in the repository, so wiping MinIO (as `make reset` does) would lose them for good.
//
// Usage: npm run db:reset            (asks first)
//        npm run db:reset -- --yes   (no question, e.g. for scripts)

import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";

const yes = process.argv.includes("--yes") || process.argv.includes("-y");

function env(name, fallback) {
  try {
    const line = readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim();
  } catch {
    // no .env: use the defaults below
  }
  return fallback;
}

const compose = (...args) => execFileSync("docker", ["compose", ...args], { stdio: "inherit" });
const composeQuiet = (...args) => spawnSync("docker", ["compose", ...args], { encoding: "utf8" });
const psql = (db, ...sql) =>
  compose("exec", "-T", "postgres", "sh", "-c", `psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d ${db} ${sql.join(" ")}`);

const running = (service) => composeQuiet("ps", "--status", "running", "-q", service).stdout.trim() !== "";

if (!running("postgres")) {
  console.error("Postgres is not running. Start it with `npm run infra` (or `make up`) and try again.");
  process.exit(1);
}

const dbName = env("POSTGRES_DB", "aura_ecommerce");
if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This deletes every order, account, review and change in "${dbName}" and reloads the sample data.\n` +
      "Images in MinIO are kept. Type \"reset\" to continue: ",
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "reset") {
    console.log("Cancelled. Nothing was changed.");
    process.exit(0);
  }
}

const apiWasRunning = running("api");
if (apiWasRunning) {
  console.log("Stopping the API…");
  compose("stop", "api");
}

console.log(`Recreating database "${dbName}"…`);
psql("postgres", `-c 'DROP DATABASE IF EXISTS "'"$POSTGRES_DB"'" WITH (FORCE)'`, `-c 'CREATE DATABASE "'"$POSTGRES_DB"'"'`);
psql('"$POSTGRES_DB"', "-f /docker-entrypoint-initdb.d/init.sql");

if (!apiWasRunning) {
  console.log("\nDone. Start the API (`npm run dev:api` or `make up`); on start-up it creates the tables and loads the sample data.");
  process.exit(0);
}

console.log("Starting the API; it creates the tables and loads the sample data…");
compose("start", "api");

const url = `http://localhost:${env("API_PORT", "8080")}/api/v1/catalog?limit=1`;
const deadline = Date.now() + 180_000;
while (Date.now() < deadline) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const body = await res.json();
      const products = body?.meta?.total_items ?? "?";
      console.log(`\nDone. The database is fresh, with ${products} sample products.`);
      process.exit(0);
    }
  } catch {
    // API still starting
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.error("\nThe database was reset, but the API did not answer within 3 minutes. Check `docker compose logs api`.");
process.exit(1);
