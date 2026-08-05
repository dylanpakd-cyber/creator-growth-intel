#!/usr/bin/env node
// Rebuild data/intel.db from the committed JSONL. Idempotent, and safe to re-run.
// You normally never call this: the MCP server runs it on first use.

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "../lib/store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const DB_PATH = join(DATA, "intel.db");

function* readJsonl(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* a truncated tail is not worth dying over */ }
  }
}

mkdirSync(DATA, { recursive: true });
const db = open(DB_PATH);

// Rail and buy type are hand adjudicated, not inferred. A regex classifier was tried and
// reproduced the hand calls on 22% of the set, because the split turns on meaning rather than
// vocabulary, so it was dropped. Coverage is partial on purpose and an unadjudicated claim
// carries a null rail rather than a guess.
const railOf = new Map();
for (const r of readJsonl(join(DATA, "rails.jsonl"))) {
  if (r?.claim_id) railOf.set(r.claim_id, r);
}

db.exec("BEGIN");
db.exec("DELETE FROM claims");
db.exec("DELETE FROM claims_fts");
const ins = db.prepare(`
  INSERT OR REPLACE INTO claims
    (claim_id,claim_text,claim_type,topic,scope,quote,tweet_url,handle,created_at,
     likes,views,bookmarks,followers,strength,niche,rail,buy_type)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insFts = db.prepare("INSERT INTO claims_fts(claim_text,quote,topic,claim_id) VALUES (?,?,?,?)");

let n = 0;
for (const c of readJsonl(join(DATA, "claims.jsonl"))) {
  if (!c?.claim_id) continue;
  // Fields may be flat (the shipped export) or nested under `evidence` (the upstream shape).
  // Accept both so a hand-assembled file still builds.
  const e = c.evidence ?? {};
  const pick = (k) => c[k] ?? e[k];
  const r = railOf.get(c.claim_id);
  const quote = pick("quote") ?? "";
  ins.run(
    c.claim_id, c.claim_text ?? "", c.claim_type ?? "heuristic", c.topic ?? "unsorted",
    c.scope ?? null, quote, pick("tweet_url") ?? "", String(pick("handle") ?? "").replace(/^@/, ""),
    pick("created_at") ?? null, pick("likes") ?? 0, pick("views") ?? null,
    pick("bookmarks") ?? 0, pick("followers") ?? null,
    c.strength ?? "medium", c.niche ?? null,
    r?.rail && r.rail !== "DROP" ? r.rail : (c.rail ?? null), r?.buy_type ?? c.buy_type ?? null,
  );
  insFts.run(c.claim_text ?? "", quote, c.topic ?? "", c.claim_id);
  n += 1;
}
db.exec("COMMIT");

// The silence table is the point, not a footnote. An empty one reads as "no known gaps",
// which is the most confident possible lie for an evidence corpus to tell.
db.exec("BEGIN");
db.exec("DELETE FROM silence");
const insSil = db.prepare("INSERT INTO silence (topic,note) VALUES (?,?)");
let s = 0;
for (const r of readJsonl(join(DATA, "silence.jsonl"))) {
  if (r?.topic && r?.note) { insSil.run(r.topic, r.note); s += 1; }
}
db.exec("COMMIT");

db.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('built_at',?)").run(new Date().toISOString());
const rails = db.prepare("SELECT COUNT(*) n FROM claims WHERE rail IS NOT NULL").get().n;
const ops = db.prepare("SELECT COUNT(DISTINCT handle) n FROM claims").get().n;
console.log(`intel.db built: ${n} claims from ${ops} authors, ${rails} rail-adjudicated, ${s} silence entries`);
