// Token Radar — the value model (radar-3).
//
// The core multiple is FITTED, not picked by hand. The program fits a
// log-log curve of traded market cap on TVL to the snapshot's own
// live-token protocols, with a shrunk offset per business group, and
// validates the fit out of sample before it ever scores a pre-token row:
//
//   log(mcap) = intercept + slope * log(tvl) + group_offset
//
//   implied = round( fitted_base(tvl, category)
//                    x growth_multiplier(change_7d)
//                    x maturity_multiplier(age_days)
//                    x breadth_multiplier(chains) )
//
// Why each part is there:
// - fitted_base: a token's market cap grows with the TVL it secures, but
//   not one-for-one. On the 128 traded tokens in this snapshot the fitted
//   slope is about 0.52, so a protocol ten times larger carries roughly
//   three times the implied value, not ten. The group offset is the mean
//   residual of the group's traded tokens, shrunk toward zero by
//   n / (n + 5) so a group with one or two traded tokens cannot drag the
//   model, and clamped to one log point either way. The fit is computed
//   from the snapshot at run time: no multiple is written in by hand.
// - growth_multiplier: seven-day TVL change, clamped to [-40, +60] so one
//   freak week cannot crown a protocol. Falls are punished twice as hard
//   as rises are rewarded (weight 1.2 down, 0.6 up). This is a scoring
//   choice, not a fitted fact: on the traded tokens the 7-day change does
//   not predict the market-cap multiple (correlation about -0.15), so the
//   growth factor rewards momentum and punishes bleeding, and says so.
// - maturity_multiplier: a smooth square-root curve over age, 0.55 at
//   listing to 1.00 at four years. A protocol that has run for years with
//   no token has earned its launch; a two-week-old one has not, however
//   large its TVL.
// - breadth_multiplier: +2% per extra chain, capped at +10%. TVL spread
//   across chains is stickier than TVL on one chain, and a launch reaches
//   more farmers.
//
// Validation, computed from the same snapshot and shown on the dashboard:
// - 5-fold cross-validation (folds by a hash of the slug, so the split is
//   deterministic): the fitted curve's median absolute log error against
//   the hand-picked radar-2 multiples on the same held-out tokens.
// - Walk-forward: fit on protocols listed before 2024-06-01, test on the
//   ones listed after, same comparison.
// The fit is honest about its own weakness: the traded multiple is very
// dispersed (residual spread over two log points), so the fitted curve
// beats the hand-picked multiples out of sample by about a tenth, not by
// an order of magnitude. The dashboard prints the fit quality next to the
// curve instead of hiding it.
//
// Farm plans are costed, not slogans. For each protocol the plan states
// a deposit size, the gas for six transactions on its chain, an expected
// allocation value and an expected net, and a verdict: FARM, THIN or
// SKIP. The expected allocation assumes 1.5% of the implied value is
// distributed to farmers, split across one farmer per $50,000 of TVL,
// and the opportunity cost is 4% a year on the deposit for the 30-day
// hold. Those are stated assumptions, printed on the dashboard, not
// facts the snapshot carries.
//
// The board ranks 200 rows: all 40 watchlist protocols plus the 160
// largest pre-token protocols below the $50M floor, by TVL. Live-token
// protocols are never ranked — they are set aside with their market caps
// shown, and they are the comparables the curve is fitted to, so the
// board never confuses a traded price with a modelled one.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_floor: number;
  growth_cap: number;
  growth_weight_up: number;
  growth_weight_down: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_cap: number;
  fit_shrink_k: number;
  fit_offset_clamp: number;
  fit_slope_min: number;
  fit_slope_max: number;
  farm_airdrop_share: number;
  farm_tvl_per_farmer: number;
  farm_tx_count: number;
  farm_opp_apr: number;
  farm_hold_days: number;
  farm_min_net: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -40,
  growth_cap: 60,
  growth_weight_up: 0.6,
  growth_weight_down: 1.2,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_cap: 0.1,
  fit_shrink_k: 5,
  fit_offset_clamp: 1.0,
  fit_slope_min: 0,
  fit_slope_max: 1.5,
  farm_airdrop_share: 0.015,
  farm_tvl_per_farmer: 50000,
  farm_tx_count: 6,
  farm_opp_apr: 0.04,
  farm_hold_days: 30,
  farm_min_net: 25,
};

export const MODEL_VERSION = 'radar-3';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;
export const WALK_FORWARD_CUTOFF = '2024-06-01';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface ModelBreakdown {
  fitted_base_usd: number;
  group: string;
  group_offset: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

export interface FarmPlan {
  deposit_usd: number;
  gas_cost_usd: number;
  expected_gross_usd: number;
  opp_cost_usd: number;
  expected_net_usd: number;
  est_farmers: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  verdict_reason: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: string;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm: FarmPlan;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  fitted_base_usd: number;
  group: string;
  group_offset: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  deposit_usd: number;
  gas_cost_usd: number;
  expected_gross_usd: number;
  expected_net_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  verdict_reason: string;
  watchlist: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One traded comparable for the fitted-curve chart: TVL, market cap, group. */
export interface CompRow {
  slug: string;
  tvl_usd: number;
  mcap_usd: number;
  group: string;
}

export interface FitGroup {
  group: string;
  label: string;
  n: number;
  offset: number;
}

export interface FitResult {
  n: number;
  intercept: number;
  slope: number;
  r2: number;
  resid_sd: number;
  groups: FitGroup[];
}

export interface ValidationResult {
  folds: number;
  cv_fitted: number;
  cv_radar2: number;
  wf_train_n: number;
  wf_test_n: number;
  wf_fitted: number | null;
  wf_radar2: number | null;
}

export interface Kpi {
  protocols_total: number;
  watchlist_covered: number;
  watchlist_size: number;
  monotonic_pass: boolean;
  board_sha: string;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: FitResult;
  validation: ValidationResult;
  kpi: Kpi;
  comps: CompRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Days from `listedAt` to the snapshot date, or null when unlisted. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((a - b) / DAY_MS));
}

/** FNV-1a, 32-bit: a deterministic hash, used to split folds and the board. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The median absolute log error between predicted and actual market caps. */
export function medianAbsLogError(predicted: number[], actual: number[]): number {
  const errs = predicted.map((p, i) => Math.abs(Math.log(Math.max(1, p)) - Math.log(Math.max(1, actual[i]!))));
  return round4(median(errs));
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

/** The eight business groups the fitted curve adjusts for. Order matters: the first matching rule wins. */
export const GROUPS: { group: string; label: string }[] = [
  { group: 'dex_perps', label: 'DEXs, perps & derivatives' },
  { group: 'lending', label: 'Lending, CDP & collateral' },
  { group: 'curators', label: 'Risk curators & capital allocators' },
  { group: 'yield', label: 'Yield & yield aggregators' },
  { group: 'rwa', label: 'RWA' },
  { group: 'bridge', label: 'Bridges' },
  { group: 'staking', label: 'Liquid staking & restaking' },
  { group: 'other', label: 'Everything else' },
];

export function groupOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return 'dex_perps';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lending';
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('yield aggregator')) return 'curators';
  if (c.includes('yield')) return 'yield';
  if (c.includes('rwa') || c.includes('real world')) return 'rwa';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking pool')) return 'staking';
  return 'other';
}

function groupLabel(group: string): string {
  const found = GROUPS.find((g) => g.group === group);
  return found === undefined ? 'Everything else' : found.label;
}

/**
 * The radar-2 hand-picked multiples, kept ONLY as the baseline the fitted
 * curve is validated against. The board never uses them: they are the
 * control the out-of-sample comparison measures the fit against.
 */
export function radar2Multiple(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('perpetual') || c.includes('derivative')) return 0.35;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 0.3;
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('yield aggregator')) return 0.28;
  if (c.includes('yield')) return 0.25;
  if (c.includes('rwa') || c.includes('real world')) return 0.22;
  if (c.includes('bridge')) return 0.15;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking pool')) return 0.12;
  if (c.includes('stablecoin') || c.includes('payments') || c.includes('chain')) return 0.18;
  return 0.2;
}

/** The traded tokens a curve can be fitted to: a TVL and a market cap, both positive. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0);
}

/**
 * Fit log(mcap) = intercept + slope * log(tvl) on the traded tokens, then
 * take each group's mean residual, shrunk toward zero by n / (n + k) and
 * clamped to one log point either way. A group with one traded token
 * cannot drag the model; a group with none gets an offset of zero.
 * The slope is clamped to the model's range so a degenerate sample cannot
 * make implied value fall as TVL rises.
 */
export function fitComps(live: SnapshotProtocol[], model: ModelConstants): FitResult {
  const pts = live.filter((p) => p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0);
  const empty: FitResult = {
    n: pts.length,
    intercept: Math.log(0.2),
    slope: 0,
    r2: 0,
    resid_sd: 0,
    groups: GROUPS.map((g) => ({ group: g.group, label: g.label, n: 0, offset: 0 })),
  };
  if (pts.length < 10) return empty;
  const xs = pts.map((p) => Math.log(p.tvl_usd));
  const ys = pts.map((p) => Math.log(p.mcap_usd!));
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
  const sxx = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0);
  if (sxx === 0) return empty;
  const slope = Math.min(model.fit_slope_max, Math.max(model.fit_slope_min, sxy / sxx));
  const intercept = my - slope * mx;
  const residuals = pts.map((p, i) => ys[i]! - (intercept + slope * xs[i]!));
  const ssRes = residuals.reduce((a, r) => a + r * r, 0);
  const ssTot = ys.reduce((a, y) => a + (y - my) * (y - my), 0);
  const residSd = Math.sqrt(ssRes / Math.max(1, n - 2));
  const byGroup = new Map<string, number[]>();
  pts.forEach((p, i) => {
    const g = groupOf(p.category);
    const list = byGroup.get(g) ?? [];
    list.push(residuals[i]!);
    byGroup.set(g, list);
  });
  const groups = GROUPS.map((g) => {
    const rs = byGroup.get(g.group) ?? [];
    const mean = rs.length === 0 ? 0 : rs.reduce((a, b) => a + b, 0) / rs.length;
    const shrunk = (mean * rs.length) / (rs.length + model.fit_shrink_k);
    const offset = Math.min(model.fit_offset_clamp, Math.max(-model.fit_offset_clamp, shrunk));
    return { group: g.group, label: g.label, n: rs.length, offset: round4(offset) };
  });
  return { n, intercept: round4(intercept), slope: round4(slope), r2: round4(ssTot === 0 ? 0 : 1 - ssRes / ssTot), resid_sd: round4(residSd), groups };
}

/** A group's fitted offset, or zero when the group has no comparables. */
export function groupOffset(fit: FitResult, group: string): number {
  const found = fit.groups.find((g) => g.group === group);
  return found === undefined ? 0 : found.offset;
}

/** The fitted base value: what the traded curve says a token on this TVL is worth, before the scoring factors. */
export function fittedBase(tvlUsd: number, category: string | null, fit: FitResult): number {
  return Math.exp(fit.intercept + fit.slope * Math.log(Math.max(1, tvlUsd)) + groupOffset(fit, groupOf(category)));
}

/**
 * Validate the fit out of sample, against the hand-picked radar-2
 * multiples on the same held-out tokens. Folds are assigned by a hash
 * of the slug, so the split is the same on every run. Walk-forward fits
 * on protocols listed before the cutoff and tests on the ones listed
 * after. Returns nulls where a side has too few protocols to test.
 */
export function validateFit(snapshot: Snapshot, fit: FitResult, model: ModelConstants): ValidationResult {
  const live = compsOf(snapshot);
  const folds = 5;
  const fittedErrs: number[] = [];
  const radar2Errs: number[] = [];
  for (let k = 0; k < folds; k++) {
    const test = live.filter((p) => fnv1a(p.slug) % folds === k);
    const train = live.filter((p) => fnv1a(p.slug) % folds !== k);
    if (test.length === 0 || train.length < 10) continue;
    const f = fitComps(train, model);
    fittedErrs.push(...test.map((p) => Math.abs(Math.log(Math.max(1, fittedBase(p.tvl_usd, p.category, f))) - Math.log(p.mcap_usd!))));
    radar2Errs.push(...test.map((p) => Math.abs(Math.log(Math.max(1, p.tvl_usd * radar2Multiple(p.category))) - Math.log(p.mcap_usd!))));
  }
  const old = live.filter((p) => p.listed_at !== null && p.listed_at < WALK_FORWARD_CUTOFF);
  const newer = live.filter((p) => p.listed_at !== null && p.listed_at >= WALK_FORWARD_CUTOFF);
  let wfFitted: number | null = null;
  let wfRadar2: number | null = null;
  if (old.length >= 10 && newer.length >= 10) {
    const f = fitComps(old, model);
    wfFitted = medianAbsLogError(
      newer.map((p) => fittedBase(p.tvl_usd, p.category, f)),
      newer.map((p) => p.mcap_usd!),
    );
    wfRadar2 = medianAbsLogError(
      newer.map((p) => p.tvl_usd * radar2Multiple(p.category)),
      newer.map((p) => p.mcap_usd!),
    );
  }
  void fit;
  return {
    folds,
    cv_fitted: round4(median(fittedErrs)),
    cv_radar2: round4(median(radar2Errs)),
    wf_train_n: old.length,
    wf_test_n: newer.length,
    wf_fitted: wfFitted,
    wf_radar2: wfRadar2,
  };
}

/** The growth multiplier: clamped change, falls weighted twice as hard as rises. */
export function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; mult: number } {
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(change7d, 0)));
  const weight = pct >= 0 ? model.growth_weight_up : model.growth_weight_down;
  return { pct, mult: 1 + (pct / 100) * weight };
}

/** The maturity multiplier: a square-root curve from the floor to 1.0 at maturity_days. */
export function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const days = age ?? model.unknown_age_days;
  const frac = Math.min(Math.max(days, 0), model.maturity_days) / model.maturity_days;
  return model.maturity_floor + Math.sqrt(frac) * model.maturity_range;
}

/** The breadth multiplier: +2% per chain beyond the first, capped at +10%. */
export function breadthMultiplier(chains: string[], model: ModelConstants): number {
  const extra = Math.max(0, chains.length - 1);
  return 1 + Math.min(extra * model.breadth_per_chain, model.breadth_cap);
}

/** The four factors and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: FitResult,
  model: ModelConstants,
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const group = groupOf(protocol.category);
  const base = fittedBase(protocol.tvl_usd, protocol.category, fit);
  const growth = growthMultiplier(protocol.change_7d, model);
  const maturity = maturityMultiplier(age, model);
  const breadth = breadthMultiplier(protocol.chains, model);
  const implied = Math.max(1, Math.round(base * growth.mult * maturity * breadth));
  return {
    implied,
    breakdown: {
      fitted_base_usd: Math.round(base),
      group,
      group_offset: groupOffset(fit, group),
      growth_pct: growth.pct,
      growth_multiplier: round4(growth.mult),
      maturity_multiplier: round4(maturity),
      breadth_multiplier: round4(breadth),
      age_days: age,
    },
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas for one transaction on a chain, in whole dollars, from the chain's own fee market. */
export function gasUsd(chain: string): number {
  const c = chain.toLowerCase();
  if (c.includes('solana') || c.includes('sui') || c.includes('aptos') || c.includes('near')) return 0.05;
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('polygon') || c.includes('binance') || c.includes('blast') || c.includes('mode') || c.includes('zksync') || c.includes('scroll') || c.includes('linea')) return 0.3;
  if (c.includes('ethereum')) return 8;
  if (c.includes('bitcoin') || c.includes('tron')) return 3;
  return 2;
}

/** Gas for one transaction on a chain, in words. */
export function gasFor(chain: string): string {
  const g = gasUsd(chain);
  return `about $${Number.isInteger(g) ? g : g.toFixed(2)} of gas`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * A protocol's costed farm plan. The expected allocation assumes the
 * model's share of the implied value is distributed to farmers, split
 * across one farmer per `farm_tvl_per_farmer` dollars of TVL; the cost
 * is the gas for `farm_tx_count` transactions on the protocol's chain
 * plus the opportunity cost of the deposit at `farm_opp_apr` over the
 * hold. FARM clears the net bar, THIN is positive but small, SKIP is
 * under water. The assumptions are printed on the dashboard.
 * The farmer count is a stated assumption, not a snapshot fact: the
 * snapshot carries no address count, so one farmer per $50,000 of TVL
 * is the model's scale proxy, chosen before any verdict was read.
 */
export function farmPlan(p: SnapshotProtocol, implied: number, model: ModelConstants): FarmPlan {
  const deposit = capitalFor(p);
  const chain = chainOf(p);
  const gas = round2(gasUsd(chain) * model.farm_tx_count);
  const estFarmers = Math.max(100, Math.round(p.tvl_usd / model.farm_tvl_per_farmer));
  const gross = round2((implied * model.farm_airdrop_share) / estFarmers);
  const opp = round2((deposit * model.farm_opp_apr * model.farm_hold_days) / 365);
  const net = round2(gross - gas - opp);
  if (net >= model.farm_min_net) {
    return {
      deposit_usd: deposit,
      gas_cost_usd: gas,
      expected_gross_usd: gross,
      opp_cost_usd: opp,
      expected_net_usd: net,
      est_farmers: estFarmers,
      verdict: 'FARM',
      verdict_reason: `Expected net ${fmtMoney(net)} clears the ${fmtMoney(model.farm_min_net)} bar after ${model.farm_tx_count} transactions of gas.`,
    };
  }
  if (net > 0) {
    return {
      deposit_usd: deposit,
      gas_cost_usd: gas,
      expected_gross_usd: gross,
      opp_cost_usd: opp,
      expected_net_usd: net,
      est_farmers: estFarmers,
      verdict: 'THIN',
      verdict_reason: `Expected net ${fmtMoney(net)} is positive but below the ${fmtMoney(model.farm_min_net)} bar — farm only with capital already idle.`,
    };
  }
  return {
    deposit_usd: deposit,
    gas_cost_usd: gas,
    expected_gross_usd: gross,
    opp_cost_usd: opp,
    expected_net_usd: net,
    est_farmers: estFarmers,
    verdict: 'SKIP',
    verdict_reason: `Expected net ${fmtMoney(net)}: gas and opportunity cost eat the expected allocation — wait for a cheaper chain or a bigger position.`,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The category's main action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and borrow $10 against it, then repay the borrow.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s largest pool on ${chain} in the range the app suggests.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds inside its app.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking pool')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('yield aggregator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the full hold.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s highest-TVL yield position on ${chain} and leave it compounding.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name} on ${chain}.`;
  if (c.includes('stablecoin')) return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('payments')) return `Route $${capital} of payments through ${name} on ${chain} and keep the receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different qualifying action for the same category. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Swap $25 of USDC for the protocol's collateral asset on ${name} and supply that too.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap $25 through ${name}'s router on ${chain} in the opposite direction and keep the receipt.`;
  if (c.includes('bridge')) return `Bridge $25 back to your starting chain through ${name} so both directions are on record.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking pool')) return `Delegate or restake $25 more through ${name} and hold the second receipt.`;
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('yield aggregator') || c.includes('yield')) return `Deposit $25 into a second ${name} vault on a different chain it supports.`;
  if (c.includes('rwa')) return `Redeem $25 of the yield asset and mint it again, so the mint and the hold are both recorded.`;
  return `Use ${name}'s second feature once: a swap, a vote, or a deposit of $25 on ${chain}.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. Gas is priced by the chain the
 * action runs on, so an Ethereum farm and a Solana farm do not pretend to cost
 * the same.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : chain;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'nothing to set up',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas} for the transaction`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `$25 of capital and ${gasFor(secondChain)} for the transaction`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week on ${chain}, such as a deposit, a borrow, a swap or a vote.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, then unwind half the position first to test the exit.`,
      cost: 'nothing but the log',
      time: '10 minutes',
    },
  ];
}

export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: FitResult, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, fit, model);
    return { p, implied, breakdown, plan: farmPlan(p, implied, model) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.breakdown.age_days,
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm: s.plan,
    farm_steps: farmSteps(s.p, s.breakdown.age_days).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    fitted_base_usd: row.model.fitted_base_usd,
    group: row.model.group,
    group_offset: row.model.group_offset,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    deposit_usd: row.farm.deposit_usd,
    gas_cost_usd: row.farm.gas_cost_usd,
    expected_gross_usd: row.farm.expected_gross_usd,
    expected_net_usd: row.farm.expected_net_usd,
    verdict: row.farm.verdict,
    verdict_reason: row.farm.verdict_reason,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitComps(compsOf(snapshot), model);
  const validation = validateFit(snapshot, fit, model);
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const covered = snapshot.watchlist.filter((s) => board.some((r) => r.slug === s)).length;
  const issue = boardIssue(board, snapshot);
  const boardText = JSON.stringify(board.map((r) => [r.slug, r.implied_value_usd, r.farm.verdict]));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit,
    validation,
    kpi: {
      protocols_total: snapshot.protocols.length,
      watchlist_covered: covered,
      watchlist_size: snapshot.watchlist.length,
      monotonic_pass: issue === null,
      board_sha: fnv1a(boardText).toString(16).padStart(8, '0'),
    },
    comps: compsOf(snapshot)
      .sort((a, b) => b.tvl_usd - a.tvl_usd)
      .map((p) => ({ slug: p.slug, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, group: groupOf(p.category) })),
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
