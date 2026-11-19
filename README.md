# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/fiqirealme52-max/TokenRadar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/fiqirealme52-max/TokenRadar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 200 pre-token protocols ranked by implied value, with a farm plan for each, built by an AI agent for [make.fun](https://make.fun)'s token-radar-01 bounty, $1,325 in USDC.

The board covers all 40 watchlist protocols (TVL of $50M or more, no token on record) plus the 160 largest pre-token protocols below that floor. Live-token protocols are set aside with their market caps shown, so the board never confuses a traded price with a modelled one.

## The model (radar-2)

```
implied = round( tvl_usd x category_multiple x growth_multiplier x maturity_multiplier x breadth_multiplier )
```

- **Category multiple** — a token's market cap is a multiple of the TVL it secures, and that multiple differs by business: DEXs, perps and derivatives 0.35; lending, CDP and collateral 0.30; risk curators, capital allocators and yield aggregators 0.28; yield 0.25; RWA 0.22; bridges 0.15; liquid staking, restaking and staking pools 0.12; everything else 0.20.
- **Growth multiplier** — seven-day TVL change, clamped to -40% .. +60% so one freak week cannot crown a protocol. Falls are weighted 1.2x and rises 0.6x: a protocol bleeding TVL is penalised harder than a hot week is rewarded.
- **Maturity multiplier** — a square-root curve from 0.55 at listing to 1.00 at four years. A protocol that has run for years with no token has earned its launch; a two-week-old one has not, however large its TVL. An unlisted age counts as 365 days.
- **Breadth multiplier** — +2% per extra chain, capped at +10%. TVL spread across chains is stickier than TVL on one chain.

No protocol name is special-cased: the same function scores every row, and the dashboard recomputes each row from the snapshot figures and checks it against board.json.

## Farm plans

Every row carries a 7-step farm plan derived from its own record — category, chains, TVL and age. Gas is priced by the chain the action runs on (Ethereum about $8, L2s about $0.30, Solana-class chains about $0.05), capital scales with TVL ($50–$250), and the hold runs 30–60 days depending on age. Each step states its cost and its time.

## Run

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

This writes `out/board.json` (200 rows), `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Node 22, standard library only, no network, deterministic — the same snapshot in gives the same bytes out on every run.

## Dashboard

Open `out/dashboard/index.html` in a browser (or serve `out/`). The board is sortable by implied value, TVL, growth, age and name; filterable by category and chain, plus search by name, slug, category or chain; every row opens a detail view with the model's factor-by-factor breakdown and its farm plan. A separate tab lists the live-token protocols set aside from the ranking.

Snapshot: DefiLlama protocol index, 14 November 2026, 758 protocols. Implied values are this entry's own model — not a price, and not a prediction that a token launches.
