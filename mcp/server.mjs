#!/usr/bin/env node
// creator-growth-intel MCP server.
//
//   claude mcp add creator-growth-intel -- node /path/to/creator-growth-intel/mcp/server.mjs
//
// Zero dependencies. MCP stdio is newline-delimited JSON-RPC 2.0 and node:sqlite ships in
// Node 22, so there is no install step to rot.
//
// THE CONTRACT THIS SERVER KEEPS: it never answers from nothing. Every result carries a
// verbatim quote and a permalink back to the person who said it, and when the corpus is
// silent it says so. corpus_stats and the silence table exist precisely so a caller can
// tell "nobody said this" apart from "I do not know", which is the difference between a
// useful tool and a confident liar.

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { open, ftsEscape, ftsAll } from "../lib/store.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = join(ROOT, "data", "intel.db");

// stdout is the JSON-RPC channel. Anything else written there corrupts the stream.
const logErr = (...a) => process.stderr.write(a.join(" ") + "\n");

let db = null;
function getDb() {
  if (db) return db;
  // The database is derived and gitignored, so a fresh clone has none. Build it here rather
  // than telling the caller to go run something: a cold build is a few seconds, once, and it
  // is far cheaper than someone concluding the knowledge base is broken on their first question.
  if (!existsSync(DB_PATH)) {
    const claims = join(ROOT, "data", "claims.jsonl");
    if (!existsSync(claims)) {
      throw new Error(`No claims data at ${claims}. This checkout at ${ROOT} looks incomplete; re-clone it.`);
    }
    logErr("data/intel.db missing, building it from the committed claims (a few seconds, once)");
    try {
      execFileSync(process.execPath, [join(ROOT, "bin", "build.mjs")], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: 300_000 });
    } catch (e) {
      throw new Error(`Automatic build failed: ${String(e.message).slice(0, 200)}\nRun it by hand: cd ${ROOT} && node bin/build.mjs`);
    }
    logErr("build complete, serving the corpus");
  }
  db = open(DB_PATH, { readOnly: true });
  return db;
}

const STOP = new Set(["the","a","an","of","to","for","in","on","is","are","do","does","what","how","and","or","we","you","i","it","that","this","with","at","be","can","should","my","our"]);

const fmtInt = (n) => (n == null ? "?" : Number(n).toLocaleString());

// Sources are working practitioners, and many of them sell something in this category:
// courses, agency services, SaaS. That is not a reason to discard them, it is a reason to
// read a rate they quote as an interested number. Stated once, generically, rather than as
// a judgement about any named person.
const STANDING_CAVEAT =
  "Sources are practitioners posting publicly. Many sell courses, services or software in " +
  "this category, so treat any rate or result they quote as an interested figure and weigh " +
  "it against the others rather than adopting it.";

function renderClaim(c) {
  const eng = [
    c.likes ? `${fmtInt(c.likes)} likes` : null,
    c.views ? `${fmtInt(c.views)} views` : null,
    c.bookmarks ? `${fmtInt(c.bookmarks)} bookmarks` : null,
  ].filter(Boolean).join(" / ") || "engagement n/a";
  const tags = [
    `type: ${c.claim_type}`,
    `topic: ${c.topic}`,
    c.rail ? `rail: ${c.rail}${c.buy_type ? `/${c.buy_type}` : ""}` : null,
  ].filter(Boolean).join(" | ");
  return [
    `### ${c.claim_text}`,
    `- ${tags}`,
    c.scope ? `- stated under: ${c.scope}` : null,
    `> "${c.quote}"`,
    `> - @${c.handle} - ${String(c.created_at ?? "").slice(0, 10)} - ${eng} - ${c.tweet_url}`,
  ].filter(Boolean).join("\n");
}

const TOOLS = [
  {
    name: "search_claims",
    description:
      "Search receipt-backed claims from operators who publicly describe how they run creator " +
      "programs, UGC, influencer buys and app growth. Use it for how to price a creator, where to " +
      "source them, how to brief them, what to test, what failed. Every result carries a verbatim " +
      "quote and a working permalink to the author. Returns an explicit no-coverage notice when the " +
      "corpus does not address the question, which you should relay rather than filling the gap.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language or keywords" },
        topic: { type: "string", description: "Restrict to one topic tag, e.g. pricing, sourcing, hooks-and-scripting" },
        operator: { type: "string", description: "Restrict to one handle, without the @" },
        claim_type: { type: "string", enum: ["tactic", "number", "heuristic", "warning", "tool", "opinion"] },
        rail: {
          type: "string",
          enum: ["BUY", "PLAT", "ADBENCH", "REV"],
          description:
            "THE MOST IMPORTANT FILTER FOR ANY RATE QUESTION. The word CPM names four unrelated " +
            "economies here and pooling them inverts the answer. BUY is a brand or agency paying a " +
            "creator per 1,000 delivered, and is the only set comparable to what a brand would pay. " +
            "PLAT is a PLATFORM paying a creator out of ad revenue (YouTube AdSense RPM, TikTok " +
            "Creator Fund, Reels bonuses), a different market entirely, and it is roughly a third of " +
            "all rate-bearing claims. ADBENCH is what Meta or programmatic ads cost per 1,000. REV is " +
            "revenue earned per 1,000, a ceiling on what you can afford to pay. Pass rail:'BUY' " +
            "whenever you are asking what someone pays a creator.",
        },
        buy_type: {
          type: "string",
          enum: ["KOL", "PROGRAM", "CLIP", "AMPLIFY", "AGENCY"],
          description:
            "Within the BUY rail, what kind of buy. This moves the median by more than an order of " +
            "magnitude, so a figure blended across buy types is meaningless. KOL is one sponsored " +
            "post from an existing audience, priced as a fee. PROGRAM is a managed roster of briefed " +
            "creators paid a set rate per thousand. CLIP is an open per-1,000 bounty on clips, " +
            "usually capped per post. AMPLIFY is whitelisting or spark ads. AGENCY is an " +
            "intermediary's pass-through price inclusive of margin.",
        },
        niche: {
          type: "string",
          enum: ["adjacent-niche", "creator-ops", "operator-timeline", "micro-pricing", "app-scaling"],
          description:
            "Which harvest sweep the evidence came from. This is PROVENANCE, not a content vertical: " +
            "'micro-pricing' is the rate and CPM sweep, not a finance sweep, and a claim about any " +
            "vertical can sit in any slice. 'adjacent-niche' is the fintech, investing, edtech and " +
            "gaming sweep. 'app-scaling' is the YouTube long-form sweep. 'creator-ops' and " +
            "'operator-timeline' are general creator-program evidence drawn mostly from health, " +
            "ecommerce and beauty.",
        },
        limit: { type: "number", description: "Default 12, capped at 50" },
      },
      required: ["query"],
    },
  },
  {
    name: "coverage_for",
    description:
      "Ask how well-evidenced a subject is BEFORE trusting an answer about it. Returns how many " +
      "claims touch it, how many distinct operators speak to it, and which sweeps they came from. " +
      "Call this first on any question where being wrong is expensive, and relay a thin result " +
      "rather than answering around it.",
    inputSchema: {
      type: "object",
      properties: { subject: { type: "string", description: "A topic, keyword, or question" } },
      required: ["subject"],
    },
  },
  {
    name: "corpus_stats",
    description:
      "What this corpus contains and, more importantly, what it does NOT. Call it when you are " +
      "about to say the corpus has no answer, so the claim of silence is itself evidenced.",
    inputSchema: { type: "object", properties: {} },
  },
];

const HANDLERS = {
  search_claims({ query, topic, operator, claim_type, rail, buy_type, niche, limit = 12 }) {
    const d = getDb();
    const total = d.prepare("SELECT COUNT(*) n FROM claims").get().n;

    // Matching is OR across terms, which is right for recall and wrong for honesty: almost any
    // string matches SOMETHING, so a nonsense question comes back with confident-looking
    // tangential claims and the no-coverage promise never fires. So run the STRICT reading
    // first, where every meaningful term must appear, and only fall back to the loose one if
    // that returns nothing. The fallback has to re-run the WHOLE query including the rail and
    // topic filters, because a strict match that survives FTS can still be emptied by them.
    const runQuery = (match) => {
      const where = [], args = [];
      let sql;
      if (match) {
        sql = "SELECT c.* FROM claims_fts f JOIN claims c ON c.claim_id = f.claim_id WHERE claims_fts MATCH ?";
        args.push(match);
      } else {
        sql = "SELECT c.* FROM claims c WHERE 1=1";
      }
      if (topic) { where.push("c.topic = ?"); args.push(topic); }
      if (operator) { where.push("c.handle = ?"); args.push(String(operator).replace(/^@/, "")); }
      if (claim_type) { where.push("c.claim_type = ?"); args.push(claim_type); }
      if (rail) { where.push("c.rail = ?"); args.push(rail); }
      if (buy_type) { where.push("c.buy_type = ?"); args.push(buy_type); }
      if (niche) { where.push("c.niche = ?"); args.push(niche); }
      if (where.length) sql += " AND " + where.join(" AND ");
      sql += match ? " ORDER BY rank LIMIT ?" : " ORDER BY c.claim_id LIMIT ?";
      args.push(Math.min(Number(limit) || 12, 50));
      return d.prepare(sql).all(...args);
    };

    const strict = ftsAll(query);
    const loose = ftsEscape(query);
    let rows = strict ? runQuery(strict) : [];
    if (!rows.length) rows = runQuery(loose);

    // Whether a hit is a real answer or a keyword collision is a question of how much of the
    // question it actually covers, not of which SQL branch ran. "why creators ghost" collides
    // with "hire 50 ghost creators" on one word and should say so; a strict-AND flag fires on
    // almost every natural sentence and becomes noise nobody reads. So measure term coverage on
    // the best row and warn only when it is genuinely thin.
    const terms = (String(query ?? "").toLowerCase().match(/[a-z0-9_']+/g) ?? [])
      .filter((t) => t.length > 2 && !STOP.has(t));
    const covered = (r) => {
      if (!terms.length) return 1;
      const hay = `${r.claim_text} ${r.quote} ${r.topic}`.toLowerCase();
      return terms.filter((t) => hay.includes(t)).length / terms.length;
    };
    const best = rows.length ? Math.max(...rows.map(covered)) : 0;
    const looseFallback = rows.length > 0 && best < 0.5;

    if (!rows.length) {
      return `NO COVERAGE. ${fmtInt(total)} claims are indexed and none match "${query}"` +
        `${topic ? ` in topic ${topic}` : ""}${rail ? ` on the ${rail} rail` : ""}.\n\n` +
        "Say so plainly rather than answering from general knowledge. Absence here means no " +
        "operator in this corpus said it publicly, which is not the same as it being false.";
    }

    const railed = d.prepare("SELECT COUNT(*) n FROM claims WHERE rail IS NOT NULL").get().n;
    const unrailed = rows.filter((r) => !r.rail).length;
    const railNote = (rail || buy_type)
      ? `\n---\nRail filter applied. Only ${railed} of ${fmtInt(total)} claims are rail-adjudicated, so ` +
        "this is a high-confidence slice and NOT the full corpus. Absence here is not absence of evidence."
      : (unrailed && /\b(cpm|rpm|rate|pay|paid|price|pricing|cost|per 1|per thousand)\b/i.test(String(query)))
        ? `\n---\nThis looks like a rate question and ${unrailed} of these ${rows.length} results have no ` +
          "adjudicated rail. CPM names four unrelated economies in this corpus: a brand paying a creator, " +
          "a PLATFORM paying a creator out of ad revenue, the cost of buying ads, and revenue earned. " +
          "Pooling them inverts the answer. Pass rail:'BUY' for the brand-buy slice."
        : "";

    return [
      `${rows.length} claim(s) of ${fmtInt(total)} indexed.`,
      looseFallback
        ? "\n**WEAK MATCH.** These results cover less than half of what you asked about, so they may be " +
          "keyword collisions rather than answers. Say so rather than presenting them as an answer, " +
          "and try narrower terms or `coverage_for` to check the subject exists here at all.\n"
        : "",
      rows.map(renderClaim).join("\n\n"),
      `\n---\n${STANDING_CAVEAT}`,
      railNote,
    ].join("\n");
  },

  coverage_for({ subject }) {
    const d = getDb();
    const match = ftsEscape(subject);
    if (!match) return "Subject has no searchable terms.";
    const rows = d.prepare(
      `SELECT c.niche, COUNT(*) n, COUNT(DISTINCT c.handle) ops
       FROM claims_fts f JOIN claims c ON c.claim_id = f.claim_id
       WHERE claims_fts MATCH ? GROUP BY c.niche`).all(match);
    const n = rows.reduce((a, r) => a + r.n, 0);
    if (!n) return `# Coverage for "${subject}"\n\nNO COVERAGE. Nothing in this corpus addresses it. Say that rather than answering around it.`;
    const ops = rows.reduce((a, r) => a + r.ops, 0);
    const thin = n < 5 || ops < 3;
    return [
      `# Coverage for "${subject}"`, "",
      `${n} claim(s) across ${ops} operator-slots.`, "",
      "| evidence slice | claims | distinct operators |", "|---|---|---|",
      ...rows.sort((a, b) => b.n - a.n).map((r) => `| ${r.niche ?? "unclassified"} | ${r.n} | ${r.ops} |`),
      "",
      thin
        ? "**THIN.** Fewer than 5 claims or fewer than 3 distinct operators. Lead with that caveat; do not present this as settled."
        : "Reasonably evidenced. Still check whether the operators agree or are all saying it from the same vantage point.",
      "",
      "Remember that the slice names are HARVEST PROVENANCE, not content verticals.",
    ].join("\n");
  },

  corpus_stats() {
    const d = getDb();
    const g = (q) => d.prepare(q).get();
    const built = g("SELECT v FROM meta WHERE k='built_at'")?.v ?? "unknown";
    const topics = d.prepare("SELECT topic, COUNT(*) n, COUNT(DISTINCT handle) ops FROM claims GROUP BY 1 ORDER BY 2 DESC LIMIT 20").all();
    const rails = d.prepare("SELECT COALESCE(rail,'unadjudicated') r, COUNT(*) n FROM claims GROUP BY 1 ORDER BY 2 DESC").all();
    const silence = d.prepare("SELECT topic, note FROM silence").all();
    return [
      "# Corpus coverage", "",
      `${fmtInt(g("SELECT COUNT(*) n FROM claims").n)} claims from ` +
      `${fmtInt(g("SELECT COUNT(DISTINCT handle) n FROM claims").n)} distinct authors. Built ${built}.`,
      "",
      "## Claims by topic", "", "| topic | claims | distinct operators |", "|---|---|---|",
      ...topics.map((t) => `| ${t.topic} | ${t.n} | ${t.ops}${t.ops < 3 ? " **THIN**" : ""} |`),
      "",
      "## Rate claims by rail", "", "| rail | claims |", "|---|---|",
      ...rails.map((r) => `| ${r.r} | ${r.n} |`),
      "",
      "Rail is hand adjudicated and deliberately partial. An unadjudicated claim carries no rail " +
      "rather than a guessed one.",
      "",
      "## What this corpus does NOT contain", "",
      ...(silence.length
        ? silence.map((s) => `- **${s.topic}**: ${s.note}`)
        : ["- No silence entries recorded, which is itself a gap."]),
      "",
      "Absence of a claim here is evidence that these operators did not say it publicly. It is not " +
      "evidence that it is false.",
    ].join("\n");
  },
};

// --- JSON-RPC 2.0 over stdio ------------------------------------------------

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;

  if (method === "initialize") {
    return send({ jsonrpc: "2.0", id, result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "creator-growth-intel", version: "1.0.0" },
    }});
  }
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  if (method === "tools/call") {
    const fn = HANDLERS[params?.name];
    if (!fn) return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool ${params?.name}` } });
    try {
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: fn(params.arguments ?? {}) }] } });
    } catch (e) {
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Tool error: ${e.message}` }], isError: true } });
    }
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` } });
});

logErr("creator-growth-intel MCP server ready on stdio");
