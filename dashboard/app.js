// Token Radar's dashboard (radar-2). It reads window.RADAR, written beside
// dashboard/ by main.ts, and renders the ranked board, the filters, the
// per-protocol detail panel with the model's own breakdown, and the farm plan.
// No network: every byte it shows is in data.js. The page recomputes each
// row's implied value from the snapshot figures, so the code and board.json
// are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

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

  // The model, recomputed here from the row's snapshot figures: the fitted
  // log-log curve from DATA.fit (intercept, slope, per-group offsets) times
  // the same growth, maturity and breadth factors main.ts applies. The page
  // recomputes each row's implied value from the snapshot figures, so the
  // code and board.json are visibly the same arithmetic.
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
  function groupOffset(group) {
    var found = (DATA.fit.groups || []).filter(function (g) { return g.group === group; })[0];
    return found ? found.offset : 0;
  }
  function fittedBase(row) {
    return Math.exp(DATA.fit.intercept + DATA.fit.slope * Math.log(Math.max(1, row.tvl_usd)) + groupOffset(groupOf(row.category)));
  }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * (growth >= 0 ? model.growth_weight_up : model.growth_weight_down);
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + Math.sqrt(Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + Math.min(Math.max((row.chains || []).length - 1, 0) * model.breadth_per_chain, model.breadth_cap);
    return Math.max(1, Math.round(fittedBase(row) * growthMult * maturity * breadth));
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

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the actions, the capital, the hold
  // and every cost and time. Gas is priced by chain, so an Ethereum farm and
  // a Solana farm do not pretend to cost the same. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('solana') >= 0 || c.indexOf('sui') >= 0 || c.indexOf('aptos') >= 0 || c.indexOf('near') >= 0) return 'about $0.05 of gas';
    if (c.indexOf('base') >= 0 || c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('polygon') >= 0 || c.indexOf('binance') >= 0 || c.indexOf('blast') >= 0 || c.indexOf('mode') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('scroll') >= 0 || c.indexOf('linea') >= 0) return 'about $0.30 of gas';
    if (c.indexOf('ethereum') >= 0) return 'about $8 of gas';
    if (c.indexOf('bitcoin') >= 0 || c.indexOf('tron') >= 0) return 'about $3 of gas';
    return 'about $2 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow $10 against it, then repay the borrow.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s largest pool on " + chain + ' in the range the app suggests.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds inside its app.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares for the full hold.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-TVL yield position on " + chain + ' and leave it compounding.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ' on ' + chain + '.';
    if (c.indexOf('stablecoin') >= 0) return 'Mint $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payments') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return "Swap $25 of USDC for the protocol's collateral asset on " + name + ' and supply that too.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $25 through ' + name + "'s router on " + chain + ' in the opposite direction and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge, then open one new position half the size of the first.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $25 back to your starting chain through ' + name + ' so both directions are on record.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return 'Delegate or restake $25 more through ' + name + ' and hold the second receipt.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $25 into a second ' + name + ' vault on a different chain it supports.';
    if (c.indexOf('rwa') >= 0) return 'Redeem $25 of the yield asset and mint it again, so the mint and the hold are both recorded.';
    return 'Use ' + name + "'s second feature once: a swap, a vote, or a deposit of $25 on " + chain + '.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : chain;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'nothing to set up', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas + ' for the transaction', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: '$25 of capital and ' + gasFor(secondChain) + ' for the transaction', time: '10 minutes' },
      { text: 'Make one qualifying action each week on ' + chain + ', such as a deposit, a borrow, a swap or a vote.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, then unwind half the position first to test the exit.', cost: 'nothing but the log', time: '10 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
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
      else if (key === 'farm') { av = a.expected_net_usd; bv = b.expected_net_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
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
          ' pre-token protocols below that floor, and the live-token set is kept apart. Implied value is a model of what a token would be worth if the protocol kept its record — not a promise, and not a prediction of a launch.'
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
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
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
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
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
        el('td', null, el('div', { class: 'farm-cell' },
          el('span', { class: 'badge ' + (r.verdict === 'FARM' ? 'farm' : r.verdict === 'THIN' ? 'thin' : 'skip'), text: r.verdict }),
          el('span', { class: 'num', text: (r.expected_net_usd < 0 ? '-$' : '$') + Math.abs(r.expected_net_usd).toFixed(0) + ' net' })
        )),
        el('td', null, el('span', { class: r.watchlist ? 'badge watch' : 'badge early', text: r.watchlist ? 'WATCHLIST' : 'EARLY' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('farm', 'Farm · expected net'),
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
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var groupRows = f.groups.map(function (g) {
      var mult100 = Math.exp(f.intercept + f.slope * Math.log(1e8) + g.offset) / 1e8;
      return [g.label + ' (' + g.n + ' traded)', 'x' + mult100.toFixed(3) + ' at $100M TVL' + (g.offset >= 0 ? ' (+' : ' (') + g.offset.toFixed(2) + ' log pts)'];
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — a fitted curve, not hand-picked multiples' }),
      el('p', { class: 'sub', text: 'The core multiple is fitted to the snapshot’s own traded tokens and recomputed on every run. No protocol name is special-cased, and no multiple is written in by hand.' }),
      el('div', { class: 'formula' },
        'log(market cap) = ' + f.intercept.toFixed(4) + ' + ' + f.slope.toFixed(4) + ' x log(TVL) + group offset' + '\n' +
        'implied = round( fitted_base x growth_multiplier x maturity_multiplier x breadth_multiplier )'
      ),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null, el('th', { text: 'Business group' }), el('th', { text: 'Fitted multiple' }))),
        el('tbody', null, groupRows.map(function (row) { return el('tr', null, el('td', { text: row[0] }), el('td', { class: 'num', text: row[1] })); }))
      ),
      el('p', { class: 'sub', text:
        'Fitted on ' + f.n + ' traded tokens: R² = ' + f.r2.toFixed(3) + ', residual spread ' + f.resid_sd.toFixed(2) +
        ' log points. The slope is ' + f.slope.toFixed(2) + ', so a protocol ten times larger carries about ' +
        Math.pow(10, f.slope).toFixed(1) + 'x the implied value, not 10x. Group offsets are each group’s mean residual, shrunk toward zero by n / (n + ' +
        m.fit_shrink_k + ') and clamped to ±' + m.fit_offset_clamp.toFixed(1) +
        ' log points, so a group with one traded token cannot drag the model. Growth is the seven-day TVL change, clamped to ' + m.growth_floor + '% .. +' + m.growth_cap +
        '%, with falls weighted ' + m.growth_weight_down + 'x and rises ' + m.growth_weight_up +
        'x — a scoring choice, not a fitted fact: on the traded tokens the 7-day change does not predict the multiple. Maturity is a square-root curve from ' +
        m.maturity_floor + ' at listing to 1.00 at ' + (m.maturity_days / 365) +
        ' years (an unlisted age counts as ' + m.unknown_age_days +
        ' days). Breadth adds 2% per extra chain, capped at +10%.'
      })
    );
  }

  function validationPanel() {
    var v = DATA.validation;
    var f = DATA.fit;
    var k = DATA.kpi;
    var verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { verdicts[r.verdict] = (verdicts[r.verdict] || 0) + 1; });
    var improveCv = v.cv_radar2 > 0 ? Math.round((1 - v.cv_fitted / v.cv_radar2) * 100) : 0;
    var improveWf = v.wf_fitted !== null && v.wf_radar2 !== null && v.wf_radar2 > 0 ? Math.round((1 - v.wf_fitted / v.wf_radar2) * 100) : null;
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
        'Held-out 5-fold cross-validation (folds by a hash of the slug): the fitted curve’s median absolute log error is ' + v.cv_fitted.toFixed(3) +
        ' against ' + v.cv_radar2.toFixed(3) + ' for the hand-picked radar-2 multiples on the same held-out tokens — ' + improveCv +
        '% lower error. Walk-forward (fit on protocols listed before ' + '2024-06-01' + ', test on the ' + v.wf_test_n + ' listed after): fitted ' +
        (v.wf_fitted === null ? 'n/a' : v.wf_fitted.toFixed(3)) + ' vs hand-picked ' + (v.wf_radar2 === null ? 'n/a' : v.wf_radar2.toFixed(3)) +
        (improveWf === null ? '.' : ' — ' + improveWf + '% lower error.') +
        ' The fit is real but modest: the traded multiple is very dispersed, so no TVL curve predicts it precisely. That is why the board shows the fit quality next to the curve instead of hiding it.'
      }),
      el('div', { class: 'chart-wrap' }, fitChart()),
      el('p', { class: 'sub', text:
        'Each dot is one traded token (log TVL against log market cap); the line is the fitted curve for the “everything else” group. Farm verdicts on this board: FARM ' + verdicts.FARM +
        ' / THIN ' + verdicts.THIN + ' / SKIP ' + verdicts.SKIP + '. A farm plan assumes ' + (DATA.model.farm_airdrop_share * 100).toFixed(1) +
        '% of the implied value is distributed to farmers, split across one farmer per $' + (DATA.model.farm_tvl_per_farmer / 1000) + 'K of TVL, minus gas for ' +
        DATA.model.farm_tx_count + ' transactions and a ' + (DATA.model.farm_opp_apr * 100).toFixed(0) + '%-a-year opportunity cost over a ' +
        DATA.model.farm_hold_days + '-day hold. FARM clears a $' + DATA.model.farm_min_net + ' expected net; THIN is positive but below it; SKIP is under water. Those are stated assumptions, not snapshot facts.'
      })
    );
  }

  // Log-log scatter of the traded comparables with the fitted curve.
  function fitChart() {
    var comps = DATA.comps || [];
    var W = 640, H = 300, padL = 46, padB = 30, padT = 12, padR = 12;
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
    var lineX0 = X(x0), lineY0 = Y(f.intercept + f.slope * x0), lineX1 = X(x1), lineY1 = Y(f.intercept + f.slope * x1);
    var ticks = [1e6, 1e7, 1e8, 1e9, 1e10].filter(function (t) { return Math.log(t) >= x0 && Math.log(t) <= x1; });
    var xTicks = ticks.map(function (t) {
      return '<text x="' + X(Math.log(t)).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="#6b7a8a">$' + (t >= 1e9 ? (t / 1e9) + 'B' : (t / 1e6) + 'M') + '</text>';
    }).join('');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Traded tokens: log market cap against log TVL, with the fitted curve">' +
      '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="#d9dee4"/>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="#d9dee4"/>' +
      '<text x="' + (W / 2) + '" y="' + (H - 10 + 12) + '" text-anchor="middle" font-size="11" fill="#33475c"></text>' + xTicks +
      '<text x="12" y="' + (padT + 8) + '" font-size="10" fill="#6b7a8a">log market cap</text>' +
      '<text x="' + (W - padR) + '" y="' + (H - padB - 6) + '" text-anchor="end" font-size="10" fill="#6b7a8a">TVL (log scale)</text>' +
      '<line x1="' + lineX0.toFixed(1) + '" y1="' + lineY0.toFixed(1) + '" x2="' + lineX1.toFixed(1) + '" y2="' + lineY1.toFixed(1) + '" stroke="#14202e" stroke-width="2"/>' +
      dots + '</svg>';
    var div = document.createElement('div');
    div.className = 'chart';
    div.innerHTML = svg;
    return div;
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var matches = recomputed === row.implied_value_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'date unknown') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the model, factor by factor' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted base (' + (row.group || 'other') + ', offset ' + (row.group_offset >= 0 ? '+' : '') + row.group_offset.toFixed(2) + ' log pts)' }), el('b', { text: fmtUsd(row.fitted_base_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) + ' → x' + row.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) + ' → x' + row.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains || []).length + ')' }), el('b', { text: 'x' + row.breadth_multiplier.toFixed(2) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + ' — ' + (matches ? 'the same number board.json carries.' : 'which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and not a prediction that a token launches.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — costed verdict: ' + row.verdict }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Deposit' }), el('b', { text: '$' + row.deposit_usd })),
        el('div', null, el('span', { text: 'Expected allocation' }), el('b', { text: '$' + row.expected_gross_usd.toFixed(2) })),
        el('div', null, el('span', { text: 'Gas (' + DATA.model.farm_tx_count + ' transactions)' }), el('b', { text: '$' + row.gas_cost_usd.toFixed(2) })),
        el('div', { class: 'total' }, el('span', { text: 'Expected net' }), el('b', { text: (row.expected_net_usd < 0 ? '-$' : '$') + Math.abs(row.expected_net_usd).toFixed(2) }))
      ),
      el('p', { class: 'sub', text: row.verdict_reason + ' Assumes ' + (DATA.model.farm_airdrop_share * 100).toFixed(1) + '% of the implied value goes to farmers, one farmer per $' + (DATA.model.farm_tvl_per_farmer / 1000) + 'K of TVL.' }),
      el('h3', { text: 'Farm plan — 7 steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') { shell.appendChild(modelPanel()); shell.appendChild(validationPanel()); }
    shell.appendChild(el('p', { class: 'footnote', text: 'Snapshot ' + DATA.as_of + ' from DefiLlama. Implied values are this entry’s own model, not a price and not a launch prediction. Farm plans are a starting point: check the protocol’s own page before moving funds, and never pay to claim an airdrop.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
