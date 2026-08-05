// SQLite schema and open(). The database is derived: it is rebuilt from data/*.jsonl,
// which are the source of truth. If the two ever disagree, the JSONL is right.

import { DatabaseSync } from "node:sqlite";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS claims (
  claim_id    TEXT PRIMARY KEY,
  claim_text  TEXT NOT NULL,   -- machine-written summary. The quote is the authority, not this.
  claim_type  TEXT NOT NULL,   -- tactic|number|heuristic|warning|tool|opinion
  topic       TEXT NOT NULL,
  scope       TEXT,            -- the conditions the operator stated it under
  quote       TEXT NOT NULL,   -- verbatim, byte-exact from the source post
  tweet_url   TEXT NOT NULL,   -- permalink back to the author
  handle      TEXT NOT NULL,
  created_at  TEXT,
  likes       INTEGER DEFAULT 0,
  views       INTEGER,
  bookmarks   INTEGER DEFAULT 0,
  followers   INTEGER,         -- the AUTHOR's followers at capture, not any creator they discuss
  strength    TEXT,
  niche       TEXT,            -- which harvest sweep it came from. Provenance, not a content vertical.
  rail        TEXT,            -- BUY|PLAT|ADBENCH|REV, null unless the claim states a per-thousand rate
  buy_type    TEXT             -- KOL|PROGRAM|CLIP|AMPLIFY|AGENCY, only when rail is BUY
);
CREATE INDEX IF NOT EXISTS idx_topic  ON claims(topic);
CREATE INDEX IF NOT EXISTS idx_handle ON claims(handle);
CREATE INDEX IF NOT EXISTS idx_rail   ON claims(rail);

CREATE VIRTUAL TABLE IF NOT EXISTS claims_fts USING fts5(
  claim_text, quote, topic UNINDEXED, claim_id UNINDEXED, tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS silence (
  topic TEXT NOT NULL,
  note  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`;

export function open(path, { readOnly = false } = {}) {
  const db = new DatabaseSync(path, readOnly ? { readOnly: true } : {});
  if (!readOnly) db.exec(SCHEMA);
  return db;
}

/**
 * FTS5 treats a lot of punctuation as syntax, so a natural-language question thrown
 * straight at MATCH throws rather than returning nothing. Quote every bare term.
 */
export function ftsEscape(q) {
  const terms = String(q ?? "").match(/[A-Za-z0-9_']+/g) ?? [];
  return terms.length ? terms.map((t) => `"${t}"`).join(" OR ") : "";
}

/**
 * The strict reading of a query: every meaningful term must appear. Used to decide whether a
 * result set is a real answer or a loose keyword collision, so that "no coverage" can mean it.
 * Very short words are dropped because requiring "of" and "the" would reject everything.
 */
export function ftsAll(q) {
  const stop = new Set(["the","a","an","of","to","for","in","on","is","are","do","does","what","how","and","or","we","you","i","it","that","this","with","at","be","can","should","my","our"]);
  const terms = (String(q ?? "").toLowerCase().match(/[a-z0-9_']+/g) ?? [])
    .filter((t) => t.length > 2 && !stop.has(t));
  return terms.length ? terms.map((t) => `"${t}"`).join(" AND ") : "";
}
