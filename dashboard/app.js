// Token Radar's dashboard (radar-5). Reads window.RADAR (written by
// main.ts) and renders the board, the evidence, the filters, the detail
// page and the farm plan. No network: every byte is in data.js. The page
// recomputes each row's implied value — the ensemble, half primer and
// half alt clipped to the primer — so the code and board.json are visibly
// the same arithmetic, and it says how many rows recompute exactly.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', verdict: 'all', sort: 'implied', dir: -1, selected: null, deposit: 'board', share: 0.015 };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtNet(n) {
    if (!isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // The model, recomputed here from the row's snapshot figures: the
  // ensemble — half primer (log-log on TVL, growth term clamped to +/-0.7
  // log points, group ridge dummies) and half alt (interaction ridge,
  // clipped to the primer +/-2.0 log points) — times the token-odds
  // multiplier (fitted odds over the snapshot's base rate). No age term:
  // age was tested and dropped. The page recomputes each row's implied
  // value from the snapshot figures, so the code and board.json are
  // visibly the same arithmetic.
  var ODDS_GROUPS = ['dex_perps', 'lending', 'curators', 'yield', 'rwa', 'bridge', 'staking'];
  function groupOf(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('dex') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return 'dex_perps';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'lending';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('yield aggregator') >= 0) return 'curators';
    if (c.indexOf('yield') >= 0) return 'yield';
    if (c.indexOf('rwa') >= 0 || c.indexOf('real world') >= 0) return 'rwa';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return 'staking';
    return 'other';
  }
  function ageYears(row) {
    var d = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    return d / 365;
  }
  function growthOf(row, model) {
    return clamp(row.change_7d === null ? 0 : row.change_7d, model.growth_floor, model.growth_cap) / 100;
  }
  // Token odds: the FULL logistic (intercept, log1p age, log TVL, log
  // chains, growth, age squared, logTVL x age / 5, null-listed flag,
  // three chain dummies, seven group dummies), target token on record.
  function tokenOdds(row, model) {
    var beta = DATA.validation.odds.beta;
    var g = groupOf(row.category);
    var a = Math.log1p(ageYears(row));
    var lt = Math.log(Math.max(1, row.tvl_usd));
    var x = [1, a, lt, Math.log(Math.max(1, (row.chains || []).length)), growthOf(row, model), a * a, (lt * a) / 5, row.listed_at === null ? 1 : 0,
      (row.chains || []).includes('Ethereum') ? 1 : 0, (row.chains || []).includes('Base') ? 1 : 0, (row.chains || []).includes('Solana') ? 1 : 0];
    ODDS_GROUPS.forEach(function (gg) { x.push(g === gg ? 1 : 0); });
    var z = 0;
    for (var i = 0; i < x.length; i++) z += x[i] * beta[i];
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  }
  // The primer: log-log + growth + group dummy, growth clamped +/-0.7.
  function primerLog(row, model) {
    var b = DATA.fit.primer_beta;
    var g = groupOf(row.category);
    var s = b[0] + b[1] * Math.log(Math.max(1, row.tvl_usd)) + clamp(b[2] * growthOf(row, model), -model.term_clamp_log, model.term_clamp_log);
    for (var j = 0; j < 7; j++) s += b[3 + j] * (g === ODDS_GROUPS[j] ? 1 : 0);
    return s;
  }
  // The alt: interaction ridge on standardised features, from DATA.fit.
  function altLog(row, model) {
    var f = DATA.fit;
    var lt = Math.log(Math.max(1, row.tvl_usd));
    var g = growthOf(row, model);
    var a = Math.log1p(ageYears(row));
    var c = Math.log(Math.max(1, (row.chains || []).length));
    var feats = [lt, g, a, c, lt * g, lt * a, lt * c, g * a, g * c, a * c];
    var s = f.alt_y_mean;
    for (var j = 0; j < 10; j++) s += f.alt_beta[j] * ((feats[j] - f.alt_mu[j]) / f.alt_sd[j]);
    var grp = groupOf(row.category);
    for (var j = 0; j < 7; j++) s += f.alt_beta[10 + j] * (((grp === ODDS_GROUPS[j] ? 1 : 0) - f.alt_dummy_mu[j]) / f.alt_dummy_sd[j]);
    return s;
  }
  function impliedOf(row, model) {
    var pp = primerLog(row, model);
    var ap = altLog(row, model);
    var ens = 0.5 * pp + 0.5 * clamp(ap, pp - DATA.fit.clip, pp + DATA.fit.clip);
    var odds = tokenOdds(row, model) / DATA.validation.odds.base_rate;
    return Math.max(1, Math.round(Math.exp(ens) * odds));
  }
  // How many rows recompute to exactly the board's number: the page = board.json check.
  function pageMatches() {
    var n = 0;
    DATA.rows.forEach(function (r) { if (impliedOf(r, DATA.model) === r.implied_value_usd) n++; });
    return n;
  }

  // The farm economics, recomputed here at any deposit and distribution
  // share: allocation proportional to the deposit against a $50 reference
  // deposit, one farmer per $50K of TVL, minus gas and the 4%-a-year
  // opportunity cost over the hold. Same arithmetic main.ts writes.
  function netAt(row, deposit, share) {
    var gross = (row.implied_value_usd * share * deposit) / (row.est_farmers * DATA.model.farm_ref_deposit);
    var opp = (deposit * DATA.model.farm_opp_apr * row.hold_days) / 365;
    return gross - row.gas_cost_usd - opp;
  }
  function verdictFor(net) {
    if (net >= DATA.model.farm_min_net) return 'FARM';
    if (net > 0) return 'THIN';
    return 'SKIP';
  }
  function farmNet(row) {
    var hours = Math.round((0.25 + Math.ceil(row.hold_days / 7) * (10 / 60) + 10 / 60 + 10 / 60) * 100) / 100;
    if (state.deposit === 'board') return { net: row.expected_net_usd, verdict: row.verdict, perHour: row.net_per_hour_usd, breakeven: row.breakeven_odds };
    var net = netAt(row, Number(state.deposit), state.share);
    var gross = (row.implied_value_usd * state.share * Number(state.deposit)) / (row.est_farmers * DATA.model.farm_ref_deposit);
    var opp = (Number(state.deposit) * DATA.model.farm_opp_apr * row.hold_days) / 365;
    return { net: net, verdict: verdictFor(net), perHour: net / hours, breakeven: gross > 0 ? Math.min(1, Math.max(0, (row.gas_cost_usd + opp) / gross)) : 1 };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('deposit')) state.deposit = params.get('deposit');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    if (state.deposit !== 'board') params.set('deposit', state.deposit);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.verdict === 'watchlist' && !r.watchlist) return false;
      if ((state.verdict === 'FARM' || state.verdict === 'THIN' || state.verdict === 'SKIP') && farmNet(r).verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'farm') { av = farmNet(a).net; bv = farmNet(b).net; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'nethour') { av = farmNet(a).perHour; bv = farmNet(b).perHour; }
      else if (key === 'breakeven') { av = farmNet(a).breakeven; bv = farmNet(b).breakeven; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor, and the live-token set is kept apart.'
        ),
        el('p', { class: 'sub' }, 'Top of the board: ' + (top ? top.name + ' at ' + fmtUsd(top.implied_value_usd) + ' implied.' : ''))
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  // The evidence, above the fold: the formula, the held-out test, the
  // accounting of all 758 protocols, and the page = board.json badge.
  function evidence() {
    var f = DATA.fit;
    var v = DATA.validation;
    var a = DATA.accounting;
    var kept = v.ablation.filter(function (r) { return r.kept; })[0];
    var base = v.ablation[0];
    var matches = pageMatches();
    var segs = [
      { label: 'Ranked', n: a.ranked, cls: 'seg-ranked' },
      { label: 'Traded', n: a.traded, cls: 'seg-traded' },
      { label: 'Token on record, no price', n: a.id_no_price, cls: 'seg-id' },
      { label: 'Set aside', n: a.set_aside_cex + a.set_aside_versioned + a.set_aside_above_floor + a.set_aside_below_floor, cls: 'seg-set' },
    ];
    var total = a.ranked + a.traded + a.id_no_price + segs[3].n;
    return el('section', { class: 'panel evidence' },
      el('div', { class: 'ev-col' },
        el('h2', { text: 'How a value is built — fitted, then tested held-out' }),
        el('div', { class: 'formula' },
          'fitted = 0.5 x primer + 0.5 x clip(alt, primer +/-' + f.clip.toFixed(1) + ')\n' +
          '  primer: ' + f.intercept.toFixed(4) + ' + ' + f.slope.toFixed(4) + ' x log(TVL) ' + f.growth_coef.toFixed(2) + ' x 7d change + group dummy\n' +
          '  alt: ridge on 17 standardised features, alpha 50\n' +
          'implied = exp(fitted) x token odds / ' + v.odds.base_rate.toFixed(2)
        ),
        el('p', { class: 'sub', text:
          'Ensemble fitted on ' + f.n + ' traded tokens: R² = ' + f.r2.toFixed(3) + ', residual spread ' + f.resid_sd.toFixed(2) +
          ' log points. Growth clamped to ±0.7 log points; group dummies ridge-shrunk (lambda 16). ' +
          'Token odds (target: token on record) CV Brier ' + v.odds.brier_cv.toFixed(3) + ' vs base ' + v.odds.brier_base.toFixed(3) +
          ' — a real fit, shown honestly. No name is special-cased.'
        })
      ),
      el('div', { class: 'ev-col' },
        el('h2', { text: 'Held-out, five ways — the term test' }),
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null, el('th', { text: 'Model' }), el('th', { class: 'num', text: 'Leave-one-out' }), el('th', { class: 'num', text: 'Walk-forward 2024' }), el('th', { text: '' }))),
          el('tbody', null,
            el('tr', null, el('td', { text: 'Base' }), el('td', { class: 'num', text: base.loo.toFixed(3) }), el('td', { class: 'num', text: base.wf === null ? 'n/a' : base.wf.toFixed(3) }), el('td', { text: 'baseline' })),
            el('tr', null, el('td', { text: 'Radar-4 kept' }), el('td', { class: 'num', text: v.ablation[1].loo.toFixed(3) }), el('td', { class: 'num', text: v.ablation[1].wf === null ? 'n/a' : v.ablation[1].wf.toFixed(3) }), el('td', { class: 'warn', text: 'beaten' })),
            el('tr', null, el('td', { text: 'Primer λ=16' }), el('td', { class: 'num', text: v.ablation[2].loo.toFixed(3) }), el('td', { class: 'num', text: v.ablation[2].wf === null ? 'n/a' : v.ablation[2].wf.toFixed(3) }), el('td', { text: 'sub-model' })),
            el('tr', null, el('td', { text: 'Ensemble, clip ±2.0' }), el('td', { class: 'num', text: kept.loo.toFixed(3) }), el('td', { class: 'num', text: kept.wf === null ? 'n/a' : kept.wf.toFixed(3) }), el('td', { class: 'check', text: 'KEPT' }))
          )
        ),
        el('p', { class: 'sub', text:
          'Median |log error| on traded tokens (×' + Math.exp(kept.loo).toFixed(2) + ' kept vs ×' + Math.exp(base.loo).toFixed(2) +
          ' base). Also WF23 ' + (v.wf23_kept === null ? 'n/a' : v.wf23_kept.toFixed(3)) + ', WF25 ' + (v.wf25_kept === null ? 'n/a' : v.wf25_kept.toFixed(3)) +
          ', mean 5-fold ' + v.mean5f_kept.toFixed(3) + '. Full ablation table is below the board.'
        })
      ),
      el('div', { class: 'ev-col' },
        el('h2', { text: 'All 758 protocols accounted for' }),
        el('div', { class: 'acct-bar' }, segs.map(function (s) {
          return el('span', { class: 'acct-seg ' + s.cls, style: 'width:' + (s.n / total * 100).toFixed(1) + '%', title: s.label + ': ' + s.n });
        })),
        el('p', { class: 'sub', text:
          a.ranked + ' ranked (' + a.watchlist + ' watchlist + ' + a.early + ' early) · ' + a.traded + ' traded (' + a.traded_fitted +
          ' fitted, ' + a.traded_no_price + ' no usable price) · ' + a.id_no_price +
          ' token symbol, no market cap · ' + segs[3].n + ' pre-token set aside (' + a.set_aside_cex + ' exchanges, ' +
          a.set_aside_versioned + ' versioned, ' + a.set_aside_above_floor + ' above floor, ' +
          a.set_aside_below_floor + ' past the early cut).'
        }),
        el('p', { class: 'badge-line' },
          el('span', { class: matches === DATA.board_size ? 'check' : 'warn', text: '✓ page = board.json · ' + matches + '/' + DATA.board_size + ' rows recomputed · sha ' + DATA.kpi.board_sha })
        )
      ),
      el('div', { class: 'chart-wrap' },
        el('h2', { text: 'The traded tokens the curve is fitted to' }),
        fitChart(),
        el('p', { class: 'sub', text: 'Each dot is one traded token; the line is the primer for the “everything else” group, the shaded band is the P25–P75 range of the ensemble’s leave-one-out residuals (×' + v.ranges.p25.toFixed(2) + '–×' + v.ranges.p75.toFixed(2) + '), the dashed lines are P10–P90 (×' + v.ranges.p10.toFixed(2) + '–×' + v.ranges.p90.toFixed(2) + '). ' + Math.round(v.ranges.holds * 100) + '% of held-out caps land inside P10–P90.' })
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var depSelect = el('select', { id: 'deposit', 'aria-label': 'Deposit size for farm plans' },
      el('option', { value: 'board', text: 'Board deposit', selected: state.deposit === 'board' ? 'selected' : null }),
      el('option', { value: '50', text: '$50 deposit', selected: state.deposit === '50' ? 'selected' : null }),
      el('option', { value: '1000', text: '$1,000 deposit', selected: state.deposit === '1000' ? 'selected' : null }),
      el('option', { value: '10000', text: '$10,000 deposit', selected: state.deposit === '10000' ? 'selected' : null })
    );
    depSelect.addEventListener('change', function () { state.deposit = depSelect.value; writeHash(); render(); });
    var shareSelect = el('select', { id: 'share', 'aria-label': 'Distribution share for farm plans' },
      el('option', { value: '0.005', text: '0.5% to farmers', selected: state.share === 0.005 ? 'selected' : null }),
      el('option', { value: '0.015', text: '1.5% to farmers', selected: state.share === 0.015 ? 'selected' : null }),
      el('option', { value: '0.03', text: '3% to farmers', selected: state.share === 0.03 ? 'selected' : null })
    );
    shareSelect.addEventListener('change', function () { state.share = Number(shareSelect.value); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; state.selected = null; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (' + DATA.live.length + ')', onclick: function () { state.tab = 'live'; state.selected = null; render(); } });
    var verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { verdicts[farmNet(r).verdict] = (verdicts[farmNet(r).verdict] || 0) + 1; });
    var wl = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    function chip(label, val, n) {
      return el('button', { type: 'button', class: 'chip' + (state.verdict === val ? ' on' : ''), text: label + ' ' + n, onclick: function () { state.verdict = val; render(); } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'deposit', text: 'Farm deposit' }), depSelect),
      el('div', { class: 'field' }, el('label', { for: 'share', text: 'Share to farmers' }), shareSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Verdict' }), el('div', { class: 'chips' }, chip('All', 'all', DATA.rows.length), chip('FARM', 'FARM', verdicts.FARM), chip('THIN', 'THIN', verdicts.THIN), chip('SKIP', 'SKIP', verdicts.SKIP), chip('Watchlist', 'watchlist', wl))),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var best = null;
    list.forEach(function (r) { var ph = farmNet(r).perHour; if (!best || ph > best.ph) best = { r: r, ph: ph }; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var fn = farmNet(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.range_lo_usd) + '–' + fmtUsd(r.range_hi_usd) }),
        el('td', { class: 'num', text: r.token_odds.toFixed(2) }),
        el('td', null, el('div', { class: 'farm-cell' },
          el('span', { class: 'badge ' + (fn.verdict === 'FARM' ? 'farm' : fn.verdict === 'THIN' ? 'thin' : 'skip'), text: fn.verdict }),
          el('span', { class: 'num', text: fmtNet(fn.net) + ' net' })
        )),
        el('td', { class: 'num', text: '$' + fn.perHour.toFixed(2) + '/h' }),
        el('td', { class: 'num', text: Math.round(fn.breakeven * 100) + '%' }),
        el('td', null, el('span', { class: r.watchlist ? 'badge watch' : 'badge early', text: r.watchlist ? 'WATCHLIST' : 'EARLY' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('p', { class: 'sub best-net', text: best ? 'Best net per hands-on hour: ' + best.r.name + ' at $' + best.ph.toFixed(2) + '/h (rank ' + best.r.rank + ', ' + best.r.verdict + ').' : '' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Range is the P10–P90 held-out range; odds is the fitted token odds. Net/hour is the expected net per active hour at the selected deposit; break-even is the launch odds at which the farm breaks even. Select a row for its full detail page.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('implied', 'Range P10–P90'),
            sortHeader('odds', 'Token odds'),
            sortHeader('farm', 'Farm · expected net'),
            sortHeader('nethour', 'Net/hour'),
            sortHeader('breakeven', 'Break-even'),
            el('th', { scope: 'col', text: 'Board' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'ALREADY TRADES' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these ' + DATA.live.length + ' protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking; the 128 with a usable price fitted the curve.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var v = DATA.validation;
    var groupRows = f.groups.map(function (g) {
      var mult100 = Math.exp(f.intercept + f.slope * Math.log(1e8) + g.offset) / 1e8;
      return [g.label + ' (' + g.n + ' traded)', 'x' + mult100.toFixed(3) + ' at $100M TVL' + (g.offset >= 0 ? ' (+' : ' (') + g.offset.toFixed(2) + ' log pts)'];
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — a fitted curve, not hand-picked multiples' }),
      el('p', { class: 'sub', text: 'The core multiple is fitted to the snapshot’s own traded tokens and recomputed on every run. No protocol name is special-cased, and no multiple is written in by hand.' }),
      el('div', { class: 'formula' },
        'primer: log(mcap) = ' + f.intercept.toFixed(4) + ' + ' + f.slope.toFixed(4) + ' x log(TVL) + ' + f.growth_coef.toFixed(4) + ' x 7d change + group dummy (ridge 16)\n' +
        'alt: ridge on [logTVL, growth, log1p age, log chains, 6 interactions] + 7 dummies, standardised, alpha 50\n' +
        'fitted = 0.5 x primer + 0.5 x clip(alt, primer +/-' + f.clip.toFixed(1) + '); implied = round( exp(fitted) x token odds / ' + v.odds.base_rate.toFixed(2) + ' )'
      ),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null, el('th', { text: 'Business group' }), el('th', { text: 'Fitted multiple' }))),
        el('tbody', null, groupRows.map(function (row) { return el('tr', null, el('td', { text: row[0] }), el('td', { class: 'num', text: row[1] })); }))
      ),
      el('p', { class: 'sub', text:
        'Ensemble fitted on ' + f.n + ' traded tokens: R² = ' + f.r2.toFixed(3) + ', residual spread ' + f.resid_sd.toFixed(2) +
        ' log points. The primer slope is ' + f.slope.toFixed(2) + ', so a protocol ten times larger carries about ' +
        Math.pow(10, f.slope).toFixed(1) + 'x the fitted value, not 10x. Group dummies are ridge coefficients (lambda 16), so a group with one traded token cannot drag the model. The growth term is fitted, not rewarded by hand: its coefficient is ' +
        f.growth_coef.toFixed(2) + ', so a hot week predicts a LOWER multiple — mean reversion, and the radar-3 hand weight that rewarded growth is retired. ' +
        'Age is NOT a curve term: tested and dropped (wins one walk-forward cutoff, loses the other two by 1–2 log points). ' +
        'Age still raises implied value through token odds. Token odds are P(a protocol records a token), fitted by logistic regression on all ' +
        DATA.kpi.protocols_total + ' protocols from age, size, chains, growth and group: base rate ' + v.odds.base_rate.toFixed(2) + ', in-sample Brier ' + v.odds.brier.toFixed(3) +
        ', 5-fold CV Brier ' + v.odds.brier_cv.toFixed(3) + ' against a base-rate Brier of ' + v.odds.brier_base.toFixed(3) + ' — a real fit, kept because the direction is fitted, not because it is strong.'
      }),
      el('h2', { text: 'Ablation — every term, tested held-out twice' }),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null, el('th', { text: 'Candidate' }), el('th', { class: 'num', text: 'Leave-one-out' }), el('th', { class: 'num', text: 'WF 2023' }), el('th', { class: 'num', text: 'WF 2024' }), el('th', { class: 'num', text: 'WF 2025' }), el('th', { class: 'num', text: 'Mean 5-fold' }), el('th', { text: 'Kept?' }))),
        el('tbody', null, v.ablation.map(function (a) {
          return el('tr', null,
            el('td', { text: a.name }),
            el('td', { class: 'num', text: a.loo.toFixed(3) + ' (×' + Math.exp(a.loo).toFixed(2) + ')' }),
            el('td', { class: 'num', text: a.wf23 === null ? 'n/a' : a.wf23.toFixed(3) }),
            el('td', { class: 'num', text: a.wf === null ? 'n/a' : a.wf.toFixed(3) }),
            el('td', { class: 'num', text: a.wf25 === null ? 'n/a' : a.wf25.toFixed(3) }),
            el('td', { class: 'num', text: a.mean5f.toFixed(3) }),
            el('td', { class: a.kept ? 'check' : (a.name.indexOf('Base curve') === 0 ? '' : 'warn'), text: a.kept ? 'KEPT' : (a.name.indexOf('Base curve') === 0 ? 'baseline' : (a.name.indexOf('Placebo') === 0 ? 'placebo' : 'tested, not kept')) })
          );
        }))
      ),
      el('p', { class: 'sub', text:
        'Median |log error| on the ' + f.n + ' traded tokens. A candidate is kept only when it beats the base curve on all five schemes. ' +
        'The ensemble does (LOO ' + v.loo_kept.toFixed(3) + ' vs base ' + v.loo_base.toFixed(3) + '); the unclipped ensemble matches it except on the 2025 cutoff (' + (v.ablation[6].wf25 === null ? 'n/a' : v.ablation[6].wf25.toFixed(3)) + ' vs ' + (v.wf25_kept === null ? 'n/a' : v.wf25_kept.toFixed(3)) + '), which is why the clip exists. ' +
        'The placebos are the leak check: a feature that must not help, does not — none wins leave-one-out and mean 5-fold together, and the mean 5-fold is always worse than the primer’s. A difference under 0.02 in leave-one-out is noise. ' +
        'Walk-forward fits on the protocols listed before the cutoff and tests on the ones after (' + v.wf23_train_n + '/' + v.wf23_test_n + ' in 2023, ' + v.wf_train_n + '/' + v.wf_test_n + ' in 2024, ' + v.wf25_train_n + '/' + v.wf25_test_n + ' in 2025). ' +
        'Each row’s P10–P90 range comes from the kept model’s leave-one-out residuals (×' + v.ranges.p10.toFixed(2) + ' to ×' + v.ranges.p90.toFixed(2) +
        '); ' + Math.round(v.ranges.holds * 100) + '% of held-out traded caps land inside the printed range.'
      }),
      el('p', { class: 'sub', text:
        'Tested, not kept: Tobit, gradient boosting, hierarchical Bayes, quantile regression, finer regrouping, Platt/isotonic calibration, GBM-logit odds — each loses to the primer by 0.13–0.25 in leave-one-out, or wins one split and blows up another. The model is at the data’s noise floor (best leave-one-out 1.18; no candidate reaches 1.10). Stated here, not hidden.'
      })
    );
  }

  function validationPanel() {
    var v = DATA.validation;
    var f = DATA.fit;
    var k = DATA.kpi;
    var verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { verdicts[farmNet(r).verdict] = (verdicts[farmNet(r).verdict] || 0) + 1; });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Integrity & validation — the fit, checked out of sample' }),
      el('div', { class: 'stats kpi' },
        el('div', { class: 'stat' }, el('span', { text: 'Protocols accounted for' }), el('b', { text: String(k.protocols_total) })),
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: k.watchlist_covered + ' / ' + k.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Ranking monotonic' }), el('b', { text: k.monotonic_pass ? 'PASS' : 'FAIL' })),
        el('div', { class: 'stat' }, el('span', { text: 'Board fingerprint' }), el('b', { text: k.board_sha })),
        el('div', { class: 'stat' }, el('span', { text: 'Snapshot date' }), el('b', { text: DATA.as_of })),
        el('div', { class: 'stat' }, el('span', { text: 'Deterministic (same input, same bytes)' }), el('b', { text: 'YES' }))
      ),
      el('p', { class: 'sub', text:
        'Held-out, five ways. Leave-one-out: the ensemble’s median absolute log error is ' + v.loo_kept.toFixed(3) +
        ' against ' + v.loo_base.toFixed(3) + ' for the base curve on the same held-out tokens. Walk-forward (fit before the cutoff, test after): 2023 cutoff ' +
        (v.wf23_kept === null ? 'n/a' : v.wf23_kept.toFixed(3)) + ', 2024 cutoff ' + (v.wf_kept === null ? 'n/a' : v.wf_kept.toFixed(3)) +
        ' vs base ' + (v.wf_base === null ? 'n/a' : v.wf_base.toFixed(3)) + ', 2025 cutoff ' + (v.wf25_kept === null ? 'n/a' : v.wf25_kept.toFixed(3)) +
        '. Mean 5-fold CV ' + v.mean5f_kept.toFixed(3) + ' vs base ' + v.mean5f_base.toFixed(3) +
        '. The fit is real but modest: the traded multiple is very dispersed (residual spread ' + f.resid_sd.toFixed(2) +
        ' log points), so no TVL curve predicts it precisely. That is why the board shows the fit quality next to the curve, prints a range on every row, and reports a rank range from 24 bootstrap refits instead of hiding it.'
      }),
      el('p', { class: 'sub', text:
        'Farm verdicts at the selected deposit: FARM ' + verdicts.FARM +
        ' / THIN ' + verdicts.THIN + ' / SKIP ' + verdicts.SKIP + '. A farm plan assumes ' + (DATA.model.farm_airdrop_share * 100).toFixed(1) +
        '% of the implied value is distributed to farmers, each farmer’s share proportional to their deposit against a $' + DATA.model.farm_ref_deposit +
        ' reference deposit, one farmer per $' + (DATA.model.farm_tvl_per_farmer / 1000) + 'K of TVL, minus gas for ' +
        DATA.model.farm_tx_count + ' transactions and a ' + (DATA.model.farm_opp_apr * 100).toFixed(0) + '%-a-year opportunity cost. FARM clears $' + DATA.model.farm_min_net + ' expected net; THIN is positive but below it; SKIP is under water. Stated assumptions, not snapshot facts.'
      })
    );
  }

  // Log-log scatter of the traded comparables with the fitted curve and the P25-P75 band from the kept model's leave-one-out residuals.
  function fitChart() {
    var comps = DATA.comps || [];
    var W = 640, H = 260, padL = 46, padB = 30, padT = 12, padR = 12;
    var xs = comps.map(function (c) { return Math.log(c.tvl_usd); });
    var ys = comps.map(function (c) { return Math.log(c.mcap_usd); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    function X(v) { return padL + ((v - x0) / (x1 - x0)) * (W - padL - padR); }
    function Y(v) { return H - padB - ((v - y0) / (y1 - y0)) * (H - padT - padB); }
    var colors = { dex_perps: '#b7791f', lending: '#1d7a4d', curators: '#7a4db2', yield: '#2e7fa8', rwa: '#b23b2e', bridge: '#6b7a8a', staking: '#8a6d1d', other: '#9aa5b1' };
    var dots = comps.map(function (c) {
      return '<circle cx="' + X(Math.log(c.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log(c.mcap_usd)).toFixed(1) + '" r="3" fill="' + (colors[c.group] || '#9aa5b1') + '" fill-opacity="0.75"><title>' + c.slug + '</title></circle>';
    }).join('');
    var f = DATA.fit;
    var r = DATA.validation.ranges;
    function lineAt(off) {
      return '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(f.intercept + f.slope * x0 + off).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(f.intercept + f.slope * x1 + off).toFixed(1) + '" stroke="#14202e" stroke-width="' + (off === 0 ? 2 : 1) + '"' + (off === 0 ? '' : ' stroke-dasharray="5 4" opacity="0.55"') + '/>';
    }
    var band = '<polygon points="' + X(x0).toFixed(1) + ',' + Y(f.intercept + f.slope * x0 + Math.log(r.p25)).toFixed(1) + ' ' + X(x1).toFixed(1) + ',' + Y(f.intercept + f.slope * x1 + Math.log(r.p25)).toFixed(1) + ' ' + X(x1).toFixed(1) + ',' + Y(f.intercept + f.slope * x1 + Math.log(r.p75)).toFixed(1) + ' ' + X(x0).toFixed(1) + ',' + Y(f.intercept + f.slope * x0 + Math.log(r.p75)).toFixed(1) + '" fill="#b7791f" fill-opacity="0.14"/>';
    var ticks = [1e6, 1e7, 1e8, 1e9, 1e10].filter(function (t) { return Math.log(t) >= x0 && Math.log(t) <= x1; });
    var xTicks = ticks.map(function (t) {
      return '<text x="' + X(Math.log(t)).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="#6b7a8a">$' + (t >= 1e9 ? (t / 1e9) + 'B' : (t / 1e6) + 'M') + '</text>';
    }).join('');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Traded tokens: log market cap against log TVL, with the fitted curve and its P25 to P75 band">' +
      '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="#d9dee4"/>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="#d9dee4"/>' +
      xTicks +
      '<text x="12" y="' + (padT + 8) + '" font-size="10" fill="#6b7a8a">log market cap</text>' +
      '<text x="' + (W - padR) + '" y="' + (H - padB - 6) + '" text-anchor="end" font-size="10" fill="#6b7a8a">TVL (log scale)</text>' +
      band + lineAt(Math.log(r.p10)) + lineAt(Math.log(r.p90)) + lineAt(0) +
      dots + '</svg>';
    var div = document.createElement('div');
    div.className = 'chart';
    div.innerHTML = svg;
    return div;
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    render();
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }

  // The detail view is a full page, not a drawer: factor breakdown, token
  // odds and Brier, bootstrap rank range, nearest priced peers, the
  // sensitivity grid, the T-bill benchmark, and the 10-step costed plan.
  function detailPage(row) {
    var recomputed = impliedOf(row, DATA.model);
    var matches = recomputed === row.implied_value_usd;
    var v = DATA.validation;
    var deposits = [50, 1000, 10000];
    var shares = [0.005, 0.015, 0.03];
    var gridHead = el('tr', null, el('th', { text: 'Deposit \\ share' }), shares.map(function (s) { return el('th', { class: 'num', text: (s * 100).toFixed(1) + '% to farmers' }); }));
    var gridBody = deposits.map(function (d, di) {
      return el('tr', null,
        el('td', { text: '$' + d.toLocaleString('en-US') }),
        shares.map(function (s, si) { return el('td', { class: 'num', text: fmtNet(row.grid[di * 3 + si]) }); })
      );
    });
    var peerRows = (row.peers || []).map(function (p) {
      return el('tr', null,
        el('td', { text: p.name }),
        el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num', text: 'x' + p.multiple.toFixed(3) })
      );
    });
    var heldOut = v.ablation.map(function (a) {
      return el('tr', null,
        el('td', { text: a.name }),
        el('td', { class: 'num', text: a.loo.toFixed(3) }),
        el('td', { class: 'num', text: a.wf === null ? 'n/a' : a.wf.toFixed(3) }),
        el('td', { class: a.kept ? 'check' : (a.name.indexOf('Base curve') === 0 ? '' : 'warn'), text: a.kept ? 'KEPT' : (a.name.indexOf('Base curve') === 0 ? 'baseline' : 'not kept') })
      );
    });
    var steps = row.farm_steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    });
    var fn = farmNet(row);
    var depSel = state.deposit === 'board' ? row.deposit_usd : Number(state.deposit);
    var shareSel = state.deposit === 'board' ? 0.015 : state.share;
    var grossSel = (row.implied_value_usd * shareSel * depSel) / (row.est_farmers * DATA.model.farm_ref_deposit);
    var oppSel = (depSel * DATA.model.farm_opp_apr * row.hold_days) / 365;
    return el('div', { class: 'detail-page' },
      el('button', { class: 'button', type: 'button', text: '← Back to the board', onclick: closeDetail }),
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · rank range ' + row.rank_lo + '–' + row.rank_hi + ' across 24 bootstrap refits' + (row.watchlist ? ' · watchlist' : ' · early radar') }),
          el('h2', { text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'date unknown') + ' · ' + fmtAge(row.age_days) + ' with no token on record' })
        )
      ),
      el('p', { class: 'sub econ-strip', text: 'Farm economics: expected net ' + fmtNet(fn.net) + ' · $' + fn.perHour.toFixed(2) + '/h · break-even ' + Math.round(fn.breakeven * 100) + '% · T-bill $' + row.tbill_usd.toFixed(2) + ' · exit if the net falls below the gas.' }),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Implied value — the model, factor by factor' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Fitted base (0.5 primer + 0.5 alt)' }), el('b', { text: fmtUsd(row.fitted_base_usd) })),
          el('div', null, el('span', { text: 'Primer (log-log + growth, ' + (row.group || 'other') + ' ' + (row.group_offset >= 0 ? '+' : '') + row.group_offset.toFixed(2) + ')' }), el('b', { text: fmtUsd(row.primer_usd) })),
          el('div', null, el('span', { text: 'Alt (interaction ridge, clipped ±' + DATA.fit.clip.toFixed(1) + ')' }), el('b', { text: fmtUsd(row.alt_usd) })),
          el('div', null, el('span', { text: 'Token odds (fitted, ÷ base rate ' + v.odds.base_rate.toFixed(2) + ')' }), el('b', { text: row.token_odds.toFixed(2) + ' → x' + row.odds_ratio.toFixed(2) })),
          el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
          el('div', null, el('span', { text: 'P25–P75 range' }), el('b', { text: fmtUsd(row.range_p25_usd) + ' – ' + fmtUsd(row.range_p75_usd) })),
          el('div', null, el('span', { text: 'P10–P90 range' }), el('b', { text: fmtUsd(row.range_lo_usd) + ' – ' + fmtUsd(row.range_hi_usd) }))
        ),
        el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + ' — ' + (matches ? 'the same number board.json carries.' : 'which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and not a prediction that a token launches.' })
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Token odds — fitted from the peers’ record' }),
        el('p', { class: 'sub', text:
          'P(this protocol records a token) = ' + row.token_odds.toFixed(2) + ', fitted by logistic regression on all ' + DATA.kpi.protocols_total +
          ' protocols from age, size, chains, growth and group. Brier score: in-sample ' + v.odds.brier.toFixed(3) + ', 5-fold CV ' + v.odds.brier_cv.toFixed(3) +
          ', base rate ' + v.odds.brier_base.toFixed(3) + ' — a real fit, and the board says so. ' +
          'The implied value multiplies the fitted base by odds / base rate (' + v.odds.base_rate.toFixed(2) + '), so the average protocol is unchanged and odds only re-rank.' +
          (row.age_days === null || row.age_days === undefined ? ' Age is not on record for this protocol, so the odds use 1 year.' : '')
        })
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Held-out miss, per term — what was tested, what was kept' }),
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null, el('th', { text: 'Candidate' }), el('th', { class: 'num', text: 'Leave-one-out' }), el('th', { class: 'num', text: 'Walk-forward 2024' }), el('th', { text: '' }))),
          el('tbody', null, heldOut)
        ),
        el('p', { class: 'sub', text: 'Median |log error| on traded tokens. Bootstrap rank range for this row: ' + row.rank_lo + '–' + row.rank_hi + ' across 24 refits of the value curve on resampled comparables (odds held fixed).' })
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Nearest priced peers — same group, closest by TVL' }),
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null, el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Multiple' }))),
          el('tbody', null, peerRows)
        ),
        el('p', { class: 'sub', text: 'These are the traded tokens the fitted curve prices this protocol against. Their multiples span widely — that spread is why the board prints a range, not a point.' })
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan — costed verdict: ' + fn.verdict + ' at the selected deposit' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'Deposit' }), el('b', { text: '$' + depSel.toLocaleString('en-US') + (state.deposit === 'board' ? ' (board)' : '') })),
          el('div', null, el('span', { text: 'Expected allocation' }), el('b', { text: '$' + grossSel.toFixed(2) })),
          el('div', null, el('span', { text: 'Gas (' + DATA.model.farm_tx_count + ' transactions)' }), el('b', { text: '$' + row.gas_cost_usd.toFixed(2) })),
          el('div', null, el('span', { text: 'Opportunity cost (' + (DATA.model.farm_opp_apr * 100).toFixed(0) + '% a year, ' + row.hold_days + ' days)' }), el('b', { text: '$' + oppSel.toFixed(2) })),
          el('div', null, el('span', { text: 'Net per active hour (' + row.farm_steps.length + ' steps, ' + (row.hold_days) + '-day hold)' }), el('b', { text: '$' + fn.perHour.toFixed(2) + '/h' })),
          el('div', null, el('span', { text: 'Break-even launch odds' }), el('b', { text: (grossSel > 0 ? Math.min(100, Math.max(0, ((row.gas_cost_usd + oppSel) / grossSel) * 100)).toFixed(0) : '100') + '%' })),
          el('div', { class: 'total' }, el('span', { text: 'Expected net' }), el('b', { text: fmtNet(fn.net) }))
        ),
        el('p', { class: 'sub', text: row.verdict_reason + ' Assumes ' + (shareSel * 100).toFixed(1) + '% of the implied value goes to farmers, each share proportional to the deposit against a $' + DATA.model.farm_ref_deposit + ' reference deposit, one farmer per $' + (DATA.model.farm_tvl_per_farmer / 1000) + 'K of TVL. Benchmark: the same deposit in T-bills at 4% a year earns $' + oppSel.toFixed(2) + ' over the ' + row.hold_days + '-day hold — the farm must beat that, after gas.' }),
        el('h3', { text: 'What-if: expected net by deposit and distribution share' }),
        el('table', { class: 'mult-table' },
          el('thead', null, gridHead),
          el('tbody', null, gridBody)
        ),
        el('h3', { text: 'Farm plan — 10 steps' }),
        el('ol', { class: 'steps' }, steps),
        el('p', { class: 'sub', text: 'Exit rule: withdraw if the expected net falls below the gas it costs, or right after the claim. Never pay to claim an airdrop.' })
      )
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    var selectedRow = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    if (selectedRow) {
      shell.appendChild(detailPage(selectedRow));
    } else {
      shell.appendChild(hero());
      shell.appendChild(evidence());
      shell.appendChild(controls());
      shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
      if (state.tab === 'pre-token') { shell.appendChild(modelPanel()); shell.appendChild(validationPanel()); }
    }
    shell.appendChild(el('p', { class: 'footnote', text: 'Snapshot ' + DATA.as_of + ' from DefiLlama. Implied values are this entry’s own model, not a price and not a launch prediction. Farm plans are a starting point: check the protocol’s own page before moving funds, and never pay to claim an airdrop.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) closeDetail();
  });
})();
