# creator-growth-intel

An MCP server that answers questions about **creator marketing, UGC programs, influencer pricing
and app growth** from what working operators actually said in public, with a verbatim quote and a
permalink on every answer.

It is built to be boring in one specific way: **it never answers from nothing.** When the corpus
does not cover something, it says so instead of filling the gap.

```
7,111 claims  ·  926 operators  ·  1,989 of them contain a hard number
82% posted in the last two years  ·  every claim carries a quote and a link
```

## Install

Two steps, and there is no third:

```bash
git clone https://github.com/dylanpakd-cyber/creator-growth-intel.git
claude mcp add creator-growth-intel -- node "$(pwd)/creator-growth-intel/mcp/server.mjs"
```

Clone it wherever you like; nothing is hardcoded to a path. `data/intel.db` is gitignored because
it is derived, and the server **builds it on first use** in a few seconds. You never run a build by
hand.

Requires **Node 22+** (the server opens `node:sqlite`). No dependencies, no install step. Works
with any MCP client, not just Claude Code.

---

## What it is good at

Ranked by how many **distinct operators** speak to each subject, which matters more than claim
count: twenty people independently saying a thing is evidence, one person saying it twenty times is
a hobby horse.

| subject | operators | claims | ask it |
|---|---:|---:|---|
| **pricing** | 229 | 544 | what a creator costs, per post or per thousand, and how deals get structured |
| **measurement** | 200 | 669 | what to track, what people actually saw, where attribution breaks |
| **angle-testing** | 199 | 976 | how many creatives to run, how to find a winner, when to kill one |
| **platform-tactics** | 182 | 659 | what works on TikTok vs Reels vs Shorts, and what stopped working |
| **briefing-and-creative** | 157 | 715 | what to put in a brief, how much to script, how much to leave alone |
| **volume-and-cadence** | 137 | 439 | how many posts, how often, over how long |
| **hooks-and-scripting** | 132 | 720 | first three seconds, retention, how people open |
| **deal-terms** | 126 | 285 | exclusivity, usage rights, revisions, kill fees, who owns what |
| **creator-side-view** | 122 | 163 | what makes creators say yes, ghost, or walk. The other side of the table |
| **sourcing** | 109 | 238 | where people find creators and how they filter them |

Good questions to open with:

- *"How much do brands pay creators per thousand views for a managed program?"*
- *"How many creatives do people test before finding a winner?"*
- *"What do operators say about paying creators upfront?"*
- *"How much extra do people pay for usage rights or whitelisting?"*
- *"What stopped working on TikTok in the last year?"*
- *"What makes UGC creators walk away from a deal?"*

**The single most useful habit:** call `coverage_for` *before* you trust an answer. It tells you how
many operators actually speak to a subject, and flags it as THIN when the answer would be one
person's opinion wearing a corpus costume.

## What it does that nothing else does

Rate questions, because it refuses to pool four different economies into one number.

**"CPM" names four unrelated markets in this corpus.** About a third of rate-bearing claims are a
*platform* paying a creator out of ad revenue, not a brand buying one. Their medians sit an order of
magnitude apart. Pool them and the answer inverts. So on any rate question, pass `rail`:

| rail | what it is | is it what a brand pays? |
|---|---|---|
| `BUY` | a brand or agency pays a creator per 1,000 delivered | **yes, this is the one you want** |
| `PLAT` | a platform pays a creator out of ad revenue (AdSense RPM, Creator Fund, Reels bonuses) | no, a different market |
| `ADBENCH` | what Meta or programmatic ads cost per 1,000 | no, an alternative-channel anchor |
| `REV` | revenue earned per 1,000 views | no, a ceiling on what you can afford |

Inside `BUY`, pass `buy_type` too, because it moves the median by more than an order of magnitude
and a figure blended across types is meaningless:

| buy_type | claims | operators | what it is |
|---|---:|---:|---|
| `PROGRAM` | 44 | 28 | a managed roster of briefed creators paid a set rate per thousand |
| `CLIP` | 24 | 15 | an open per-1,000 bounty on clips, usually capped per post |
| `KOL` | 13 | 10 | one sponsored post from an existing audience, priced as a fee |
| `AMPLIFY` / `AGENCY` | 1 each | 1 | whitelisting; and an intermediary's pass-through price |

Rail is **hand adjudicated and deliberately partial** (128 of 7,111 claims). A regex classifier was
written for it and reproduced the hand labels on **22%** of the set, because the split turns on
meaning rather than vocabulary: *"an RPM is set at $1.50"* is a brand paying, *"at a $10 RPM a
creator earns"* is a platform paying. It was deleted rather than shipped behind a confident
interface. Unadjudicated claims carry a null rail, never a guess, and the server tells you when you
are looking at the adjudicated slice.

## What it is weak at, stated plainly

| subject | operators | why it is thin |
|---|---:|---|
| agency-vs-inhouse | 22 | barely discussed publicly, and the people who know are selling one of the two |
| attribution | 33 | the hardest problem in the space and the least honestly written about |
| failure-modes | 45 | survivorship. People post what worked |

Also true, and worth knowing before you rely on it:

- **It is keyword search, not semantic.** *"Why creators ghost"* will surface *"hire 50 ghost
  creators"*. Results covering less than half your question are labelled **WEAK MATCH**, but read
  the quote, not just the summary.
- **`claim_text` is a machine-written summary. The quote is the authority.** Claims were extracted
  by a language model behind a fabrication gate that rejects roughly 2% of candidates, so some slip
  through. If the summary and the quote disagree, the quote wins, and please open an issue.
- **Self-selected sources.** Operators who post publicly are not a random sample, and many sell
  courses, services or software in this category. A rate they quote is an interested number.
- **Some concentration.** The largest single contributor is 9.5% of claims and the top six are about
  a third. `coverage_for` exists so you can see whether a subject rests on many people or a few.
- **Known blind spots ship with it.** `corpus_stats` lists them. The headline one: brand-buy rates
  in **traditional finance are n=0**. Absence here means these operators did not say it publicly,
  not that it is false.

## The three tools

| tool | use it for |
|---|---|
| `search_claims` | the main one. Filters: `topic`, `operator`, `claim_type`, `rail`, `buy_type`, `niche`, `limit` |
| `coverage_for` | how well-evidenced a subject is, BEFORE you trust an answer about it |
| `corpus_stats` | what is in here and, more usefully, what is missing |

`claim_type` is worth filtering on: `number` (1,989) for hard figures, `tactic` (2,392) for how-to,
`heuristic` (1,755) for rules of thumb, `warning` (566) for what went wrong, `tool` (273),
`opinion` (136).

`niche` is **harvest provenance, not a content vertical.** `micro-pricing` is the rate sweep, not a
finance sweep, and a claim about any vertical can sit in any slice.

## Attribution and removal

Every claim links to the original public post. Credit belongs to the authors, who did the work and
wrote it down. Only extracted claims ship here, each as a quote plus a link; no raw archives are
redistributed.

**If you are quoted here and want your material removed, open an issue and it will be taken out, no
argument, no questions.**

## Layout

```
mcp/server.mjs      the server. three tools, zero dependencies
lib/store.mjs       schema and query escaping
bin/build.mjs       rebuilds data/intel.db. the server calls this for you
data/claims.jsonl   source of truth. if the db and this disagree, this is right
data/rails.jsonl    hand adjudications for rail and buy type
data/silence.jsonl  what the corpus is known NOT to contain
```

MIT licensed.
