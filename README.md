# creator-growth-intel

An MCP server that answers questions about creator marketing, UGC programs, influencer pricing
and app growth **from what working operators actually said in public**, with a verbatim quote and
a permalink on every answer.

It is built to be boring in one specific way: it never answers from nothing. When the corpus does
not cover something, it says so instead of filling the gap.

```
7,111 claims  |  926 distinct authors  |  every claim carries a quote and a link
```

## Install

Two steps, and there is no third:

```bash
git clone https://github.com/dylanpakd-cyber/creator-growth-intel.git
claude mcp add creator-growth-intel -- node "$(pwd)/creator-growth-intel/mcp/server.mjs"
```

Clone it wherever you like; nothing is hardcoded to a path. `data/intel.db` is gitignored because
it is derived, and the server **builds it on first use**, which takes a few seconds, once. You do
not need to run a build by hand.

Requires **Node 22 or newer**, because the server opens `node:sqlite`. No dependencies, no install
step. Works with any MCP client, not just Claude Code.

## The three tools

| tool | use it for |
|---|---|
| `search_claims` | the main one. What do operators say about pricing, sourcing, briefing, testing, what failed |
| `coverage_for` | ask how well-evidenced a subject is BEFORE trusting an answer about it |
| `corpus_stats` | what is in here and, more usefully, what is missing |

## Read this before asking about rates

**The word CPM names four unrelated economies in this corpus, and pooling them inverts the
answer.** Roughly a third of all rate-bearing claims are a *platform* paying a creator out of ad
revenue, not a brand buying one. Those are different markets with medians an order of magnitude
apart.

So on any rate question, pass `rail`:

| rail | what it is | comparable to a brand's cost? |
|---|---|---|
| `BUY` | a brand or agency pays a creator per 1,000 delivered | **yes, this is the one you want** |
| `PLAT` | a platform pays a creator out of ad revenue (AdSense RPM, Creator Fund, Reels bonuses) | no, different market |
| `ADBENCH` | what Meta or programmatic ads cost per 1,000 | no, alternative-channel anchor |
| `REV` | revenue earned per 1,000 views | no, a ceiling on what you can afford |

Within `BUY`, pass `buy_type` too. It moves the median by more than an order of magnitude, so a
figure blended across buy types is meaningless: a `KOL` sponsored post, a managed `PROGRAM` roster,
an open `CLIP` bounty, `AMPLIFY` whitelisting and an `AGENCY` pass-through are five different prices
for five different things.

Rail is **hand adjudicated and deliberately partial**. A regex classifier was written for it and
reproduced the hand labels on 22% of the set, because the distinction turns on meaning rather than
vocabulary: "an RPM is set at $1.50" is a brand paying, "at a $10 RPM a creator earns" is a platform
paying. It was deleted rather than shipped behind a confident interface. Unadjudicated claims carry
a null rail, never a guess, and the server tells you when you are looking at the adjudicated slice.

## How to read a claim

Every result has two parts and they are not equal:

- **`claim_text` is a machine-written summary.** It is a convenience for search and it can be
  wrong. Do not quote it as if the person said it.
- **The blockquote is verbatim**, byte-exact from the source post, with a permalink. **That is the
  authority.** If the summary and the quote disagree, the quote wins, and please open an issue.

Claims were extracted by a language model and passed a fabrication gate that rejects roughly 2% of
candidates, so some slip through. The quote and the link exist so you never have to take the
summary's word for it.

## What this is not

- **Not advice.** It reports what named operators claimed, including where they contradict each
  other. It does not resolve disagreements or tell you what to do.
- **Not a survey.** Operators who post publicly are a self-selected group. Many sell courses,
  services or software in this category, so a rate they quote is an interested number.
- **Not complete.** `corpus_stats` lists known gaps explicitly, and the honest headline is that
  traditional-finance brand-buy rates are **n=0** here. Absence is evidence that these operators did
  not say it publicly, not evidence that it is false.
- **Not a data dump.** Only extracted claims ship, each as a quote plus a link back to its author.
  Raw archives are not redistributed.

## Attribution and removal

Every claim links to the original public post. Credit belongs to the authors, who did the work and
wrote it down. If you are quoted here and want your material removed, open an issue and it will be
taken out, no argument.

## Layout

```
mcp/server.mjs    the server. three tools, no dependencies
lib/store.mjs     schema and FTS escaping
bin/build.mjs     rebuilds data/intel.db from the JSONL. the server calls this for you
data/claims.jsonl the source of truth. if the db and this disagree, this is right
data/rails.jsonl  hand adjudications for rail and buy type
data/silence.jsonl what the corpus is known not to contain
```

MIT licensed.
