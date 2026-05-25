/* ==========================================================================
   1. LIVE DATA & FOREX ENGINE
   ========================================================================== */
let IDR = 16700;
let IDR_LAST_UPDATE = '';

async function fetchIDR(force) {
  try {
    const btn = document.getElementById('idr-refresh');
    if (btn) btn.style.opacity = '.4';
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const d = await r.json();
    if (d.rates && d.rates.IDR) {
      IDR = d.rates.IDR;
      const now = new Date();
      IDR_LAST_UPDATE = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      const el = document.getElementById('idr-rate-val'); if (el) el.textContent = 'Rp' + Math.round(IDR).toLocaleString();
      const el2 = document.getElementById('idr-rate-time'); if (el2) el2.textContent = 'upd ' + IDR_LAST_UPDATE;
      if (btn) btn.style.opacity = '1';
      if (force) softUpdate();
    }
  } catch (e) {
    const btn = document.getElementById('idr-refresh');
    if (btn) btn.style.opacity = '1';
  }
}

/* ==========================================================================
   2. CEX FUNDING RATES & HISTORICAL LOGS
   ========================================================================== */
let FEE_LIVE = { rate: null, exchange: 'binance', symbol: 'BTCUSDT', loading: false };

async function fetchLiveFundingRate() {
  const btn = document.getElementById('fee-live-btn');
  const statusEl = document.getElementById('fee-live-status');
  if (btn) { btn.style.opacity = '.4'; btn.textContent = '⟳'; }
  if (statusEl) statusEl.textContent = 'fetching...';
  FEE_LIVE.loading = true;
  try {
    const ex = FEE_LIVE.exchange, sym = FEE_LIVE.symbol;
    let rate = null;
    if (ex === 'binance') {
      const r = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`);
      const d = await r.json();
      rate = d.lastFundingRate ? Math.abs(parseFloat(d.lastFundingRate) * 100) : null;
    } else if (ex === 'bybit') {
      const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`);
      const d = await r.json();
      rate = d.result?.list?.[0]?.fundingRate ? Math.abs(parseFloat(d.result.list[0].fundingRate) * 100) : null;
    } else if (ex === 'okx') {
      const instId = sym.replace('USDT', '-USDT-SWAP').replace('USDC', '-USDC-SWAP');
      const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`);
      const d = await r.json();
      rate = d.data?.[0]?.fundingRate ? Math.abs(parseFloat(d.data[0].fundingRate) * 100) : null;
    }
    if (rate !== null) {
      FEE_LIVE.rate = rate;
      gs().FEE.funding = Math.round(rate * 10000) / 10000;
      const inp = document.getElementById('fee-funding');
      if (inp) { inp.value = gs().FEE.funding; inp.classList.add('active'); setTimeout(() => inp.classList.remove('active'), 1200); }
      if (statusEl) statusEl.textContent = `live · ${ex}`;
      softUpdate();
    } else {
      if (statusEl) statusEl.textContent = 'no data';
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'failed';
  }
  FEE_LIVE.loading = false;
  if (btn) { btn.style.opacity = '1'; btn.textContent = '↻'; }
}

async function fetchHistoricalFunding(exchange, symbol, startMs, endMs) {
  const results = [];
  try {
    if (exchange === 'binance') {
      let from = startMs;
      while (from < endMs) {
        const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${from}&endTime=${endMs}&limit=1000`;
        const r = await fetch(url);
        const d = await r.json();
        if (!Array.isArray(d) || d.length === 0) break;
        d.forEach(x => results.push({ ts: parseInt(x.fundingTime), rate: parseFloat(x.fundingRate) }));
        from = parseInt(d[d.length - 1].fundingTime) + 1;
        if (d.length < 1000) break;
      }
    } else if (exchange === 'bybit') {
      let cursor = '';
      let calls = 0;
      while (calls < 20) {
        const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&startTime=${startMs}&endTime=${endMs}&limit=200${cursor ? '&cursor=' + cursor : ''}`;
        const r = await fetch(url);
        const d = await r.json();
        if (!d.result?.list?.length) break;
        d.result.list.forEach(x => results.push({ ts: parseInt(x.fundingRateTimestamp), rate: parseFloat(x.fundingRate) }));
        cursor = d.result.nextPageCursor || '';
        if (!cursor || d.result.list.length < 200) break;
        calls++;
      }
    } else if (exchange === 'okx') {
      const instId = symbol.replace('USDT', '-USDT-SWAP').replace('USDC', '-USDC-SWAP');
      let before = '';
      let calls = 0;
      while (calls < 20) {
        const url = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=100${before ? '&before=' + before : '&after=' + endMs}`;
        const r = await fetch(url);
        const d = await r.json();
        if (!d.data?.length) break;
        const inRange = d.data.filter(x => parseInt(x.fundingTime) >= startMs && parseInt(x.fundingTime) <= endMs);
        inRange.forEach(x => results.push({ ts: parseInt(x.fundingTime), rate: parseFloat(x.fundingRate) }));
        const oldest = d.data[d.data.length - 1];
        if (parseInt(oldest.fundingTime) <= startMs || d.data.length < 100) break;
        before = oldest.fundingTime;
        calls++;
      }
    }
  } catch (e) {
    console.warn('funding fetch failed:', e);
  }
  return results;
}

/* ==========================================================================
   3. WEBSOCKET REAL-TIME PRICE FEED
   ========================================================================== */
var _tpWS = null;
var _tpWSReconnectTimer = null;
var _tpWSLive = false;

function tpStartWebSocket() {
  tpStopWebSocket();
  if (window._tpPriceInterval) clearInterval(window._tpPriceInterval);
  _tpSetWSStatus('connecting');

  tpFetchPrices().then(() => { tpFetchOrderBook(); });

  window._tpPriceInterval = setInterval(() => {
    if (!_tpWSLive) tpFetchPrices();
    if (!_tpWSLive) tpFetchOrderBook();
  }, 2000);

  _tpTryWS();
}

function _tpTryWS() {
  const ex = TP_STATE.exchange || 'binance';
  const isSpot = TP_STATE.marketType === 'spot';
  const pair = (TP_STATE.pair || 'BTCUSDT').toLowerCase();
  const pairUp = TP_STATE.pair || 'BTCUSDT';

  try {
    let url, onopen, onmsg;

    if (ex === 'binance') {
      const base = isSpot ? 'wss://stream.binance.com/stream?streams=' : 'wss://fstream.binance.com/stream?streams=';
      url = base + pair + '@ticker/' + pair + '@depth10@100ms';
      onmsg = (msg) => {
        const s = msg.stream || '';
        if (s.includes('@ticker')) {
          const d = msg.data;
          const price = parseFloat(d.c) || 0, change = parseFloat(d.P) || 0;
          const prev = TP_STATE.prices[pairUp]?.price || 0;
          _tpWSLive = true;
          TP_STATE.prices[pairUp] = { symbol: pairUp, price, change, high: parseFloat(d.h) || 0, low: parseFloat(d.l) || 0, volume: parseFloat(d.q) || 0 };
          tpUpdatePriceDisplay();
          tpUpdatePositionsPnL();
          if (typeof tpCheckPendingOrders === "function") tpCheckPendingOrders();
          if (typeof tpUpdateSubmitButton === 'function') tpUpdateSubmitButton();
          _tpFlashPrice(price, prev);
        }
        if (s.includes('@depth') && msg.data.asks && msg.data.bids) {
          tpRenderOrderBookData(msg.data.asks, msg.data.bids);
        }
      };
    } else if (ex === 'bybit') {
      url = isSpot ? 'wss://stream.bybit.com/v5/public/spot' : 'wss://stream.bybit.com/v5/public/linear';
      onopen = () => { _tpWS.send(JSON.stringify({ op: 'subscribe', args: [`tickers.${pairUp}`, `orderbook.50.${pairUp}`] })); };
      onmsg = (msg) => {
        const t = msg.topic || '';
        if (t.startsWith('tickers') && msg.data) {
          const d = msg.data;
          const price = parseFloat(d.lastPrice) || 0, change = parseFloat(d.price24hPcnt || 0) * 100;
          const prev = TP_STATE.prices[pairUp]?.price || 0;
          TP_STATE.prices[pairUp] = { symbol: pairUp, price, change, high: parseFloat(d.highPrice24h) || 0, low: parseFloat(d.lowPrice24h) || 0, volume: parseFloat(d.turnover24h) || 0 };
          tpUpdatePriceDisplay();
          tpUpdatePositionsPnL();
          if (typeof tpCheckPendingOrders === "function") tpCheckPendingOrders();
          if (typeof tpUpdateSubmitButton === 'function') tpUpdateSubmitButton();
          _tpFlashPrice(price, prev);
        }
        if (t.startsWith('orderbook') && msg.data) {
          const d = msg.data;
          if (msg.type === 'snapshot') { _obBook = { asks: {}, bids: {} }; }
          _obApplyDelta(d.a || [], d.b || []);
          const { asks, bids } = _obGetSorted();
          if (asks.length && bids.length) tpRenderOrderBookData(asks, bids);
        }
      };
    } else if (ex === 'okx') {
      url = 'wss://ws.okx.com:8443/ws/v5/public';
      const instId = isSpot ? pairUp.replace('USDT', '-USDT') : pairUp.replace('USDT', '-USDT-SWAP');
      onopen = () => { _tpWS.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'tickers', instId }, { channel: 'books', instId }] })); };
      onmsg = (msg) => {
        const ch = msg.arg?.channel || '';
        if (ch === 'tickers' && msg.data?.[0]) {
          const d = msg.data[0];
          const price = parseFloat(d.last) || 0;
          const open24 = parseFloat(d.open24h) || price;
          const change = open24 ? ((price - open24) / open24 * 100) : 0;
          const prev = TP_STATE.prices[pairUp]?.price || 0;
          TP_STATE.prices[pairUp] = { symbol: pairUp, price, change, high: parseFloat(d.high24h) || 0, low: parseFloat(d.low24h) || 0, volume: parseFloat(d.volCcy24h) || 0 };
          tpUpdatePriceDisplay();
          tpUpdatePositionsPnL();
          if (typeof tpCheckPendingOrders === "function") tpCheckPendingOrders();
          if (typeof tpUpdateSubmitButton === 'function') tpUpdateSubmitButton();
          _tpFlashPrice(price, prev);
        }
        if ((ch === 'books' || ch === 'books5') && msg.data?.[0]) {
          const d = msg.data[0];
          if (msg.action === 'snapshot') { _obBook = { asks: {}, bids: {} }; }
          _obApplyDelta((d.asks || []).map(a => [a[0], a[1]]), (d.bids || []).map(b => [b[0], b[1]]));
          const { asks, bids } = _obGetSorted();
          if (asks.length && bids.length) tpRenderOrderBookData(asks, bids);
        }
      };
    }

    _tpWS = new WebSocket(url);
    if (onopen) _tpWS.onopen = () => { _tpSetWSStatus('live'); onopen(); _tpWS._ping = setInterval(() => { if (_tpWS.readyState === 1) _tpWS.send(ex === 'okx' ? 'ping' : JSON.stringify({ op: 'ping' })); }, 20000); };
    else _tpWS.onopen = () => { _tpSetWSStatus('live'); _tpWS._ping = setInterval(() => { if (_tpWS.readyState === 1) _tpWS.send(JSON.stringify({ op: 'ping' })); }, 20000); };
    _tpWS.onmessage = (e) => { try { const msg = JSON.parse(e.data); if (msg && msg !== 'pong') onmsg(msg); } catch (err) {} };
    _tpWS.onclose = _tpWS.onerror = () => { if (_tpWS._ping) clearInterval(_tpWS._ping); _tpWSLive = false; _tpSetWSStatus('error'); };
  } catch (err) { _tpSetWSStatus('error'); }
}

function _tpFlashPrice(price, prev) {
  if (!prev || price === prev) return;
  const el = document.getElementById('tp-price-main');
  if (!el) return;
  el.style.transition = 'color .15s';
  el.style.color = price > prev ? '#00c47a' : '#e24b4a';
  setTimeout(() => { el.style.color = ''; }, 300);
}

function _tpSetWSStatus(state) {
  const btn = document.getElementById('tp-ws-status');
  const dot = document.getElementById('tp-ws-dot');
  const label = document.getElementById('tp-ws-label');
  if (!btn || !dot || !label) return;

  const states = {
    offline:    { dot: '#444',    label: 'offline',      border: '#2a2a2a', bg: '#111',    color: '#555',    pulse: true },
    connecting: { dot: '#EF9F27', label: 'connecting…',  border: '#3a2a00', bg: '#1a1200', color: '#EF9F27', pulse: true },
    live:       { dot: '#00c47a', label: 'live',          border: '#004d30', bg: '#0a1a10', color: '#00c47a', pulse: false },
    error:      { dot: '#e24b4a', label: 'disconnected',  border: '#3a1a1a', bg: '#1a0a0a', color: '#e24b4a', pulse: true },
  };
  const s = states[state] || states.offline;

  dot.style.background = s.dot;
  label.textContent = s.label;
  btn.style.borderColor = s.border;
  btn.style.background = s.bg;
  label.style.color = s.color;

  dot.style.animation = s.pulse ? 'wsPulse 1.4s ease-in-out infinite' : 'none';
  btn.title = state === 'live' ? 'WebSocket live — click to reconnect' : 'Click to reconnect';
}

function tpReconnectWS() {
  _tpSetWSStatus('connecting');
  _obReset();
  tpStartWebSocket();
  showToast('reconnecting...', 'info');
}

function tpStopWebSocket() {
  if (_tpWSReconnectTimer) { clearTimeout(_tpWSReconnectTimer); _tpWSReconnectTimer = null; }
  if (_tpWS) { try { _tpWS.close(); } catch (e) {} _tpWS = null; }
  if (window._tpPriceInterval) { clearInterval(window._tpPriceInterval); window._tpPriceInterval = null; }
  _tpSetWSStatus('error');
}

/* ==========================================================================
   4. REST TICKER & PRICES HANDLER
   ========================================================================== */
async function tpFetchPrices() {
  try {
    const ex = TP_STATE.exchange || 'binance';
    const isSpot = TP_STATE.marketType === 'spot';

    const data = await Promise.all(TP_PAIRS.map(async p => {
      try {
        let url, ticker;
        if (ex === 'binance') {
          if (isSpot) {
            url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${p.symbol}`;
            ticker = await fetch(url).then(r => r.json());
            return { symbol: p.symbol, price: parseFloat(ticker.lastPrice) || 0, change: parseFloat(ticker.priceChangePercent) || 0, high: parseFloat(ticker.highPrice) || 0, low: parseFloat(ticker.lowPrice) || 0, volume: parseFloat(ticker.quoteVolume) || 0 };
          } else {
            url = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${p.symbol}`;
            ticker = await fetch(url).then(r => r.json());
            return { symbol: p.symbol, price: parseFloat(ticker.lastPrice) || 0, change: parseFloat(ticker.priceChangePercent) || 0, high: parseFloat(ticker.highPrice) || 0, low: parseFloat(ticker.lowPrice) || 0, volume: parseFloat(ticker.quoteVolume) || 0 };
          }
        } else if (ex === 'bybit') {
          const cat = isSpot ? 'spot' : 'linear';
          url = `https://api.bybit.com/v5/market/tickers?category=${cat}&symbol=${p.symbol}`;
          ticker = await fetch(url).then(r => r.json());
          const t = ticker.result?.list?.[0];
          return { symbol: p.symbol, price: parseFloat(t?.lastPrice) || 0, change: parseFloat(t?.price24hPcnt || 0) * 100, high: parseFloat(t?.highPrice24h) || 0, low: parseFloat(t?.lowPrice24h) || 0, volume: parseFloat(t?.turnover24h) || 0 };
        } else if (ex === 'okx') {
          const instId = isSpot ? p.symbol.replace('USDT', '-USDT') : p.symbol.replace('USDT', '-USDT-SWAP');
          url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
          ticker = await fetch(url).then(r => r.json());
          const t = ticker.data?.[0];
          return { symbol: p.symbol, price: parseFloat(t?.last) || 0, change: parseFloat(t?.open24h) ? ((parseFloat(t?.last) - parseFloat(t?.open24h)) / parseFloat(t?.open24h) * 100) : 0, high: parseFloat(t?.high24h) || 0, low: parseFloat(t?.low24h) || 0, volume: parseFloat(t?.volCcy24h) || 0 };
        }
      } catch (e) { return null; }
    }));

    data.forEach(d => {
      if (d) TP_STATE.prices[d.symbol] = d;
    });

    tpUpdatePriceDisplay();
    tpUpdatePositionsPnL();
    tpRenderPairList();
    if (typeof tpUpdateSubmitButton === 'function') tpUpdateSubmitButton();
  } catch (e) {
    console.error('Price fetch error:', e);
  }
}

async function fetchLivePrices() {
  const container = document.getElementById('live-prices');
  if (!container) return;

  const coins = [
    { sym: 'BTC', pair: 'BTCUSDT', icon: 'BTC' },
    { sym: 'ETH', pair: 'ETHUSDT', icon: 'ETH' },
    { sym: 'SOL', pair: 'SOLUSDT', icon: 'SOL' },
    { sym: 'BNB', pair: 'BNBUSDT', icon: 'BNB' }
  ];

  const fetchWithTimeout = async (url, timeout = 5000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  try {
    const results = await Promise.allSettled(coins.map(async c => {
      const r = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/24hr?symbol=${c.pair}`);
      return r.json();
    }));

    const btcResult = results[0];
    if (btcResult.status === 'fulfilled' && btcResult.value?.lastPrice) {
      window.LIVE_BTC_PRICE = parseFloat(btcResult.value.lastPrice);
    }

    container.classList.remove('prices-loading');
    container.innerHTML = coins.map((c, i) => {
      const result = results[i];
      const ticker = result.status === 'fulfilled' ? result.value : null;
      const price = parseFloat(ticker?.lastPrice) || 0;
      const change = parseFloat(ticker?.priceChangePercent) || 0;
      const isUp = change >= 0;
      const priceStr = price > 0 ? fmtPrice(price) : '--';
      const changeStr = price > 0 ? ((isUp ? '+' : '') + change.toFixed(2) + '%') : '--';
      return `<div class="price-card">
        <div class="price-card-head">
          <span class="price-card-icon">${BATT_ICONS[c.icon] ? `<img src="${BATT_ICONS[c.icon]}" width="18" height="18" style="border-radius:50%;object-fit:cover" alt="${c.sym}" onerror="this.style.display='none'">` : `${c.sym[0]}`}</span>
          <span class="price-card-sym">${c.sym}</span>
        </div>
        <div class="price-card-price">${priceStr}</div>
        <div class="price-card-change ${price > 0 ? (isUp ? 'up' : 'down') : ''}">${price > 0 ? `<span class="arrow">${isUp ? '▲' : '▼'}</span>` : ''}${changeStr}</div>
      </div>`;
    }).join('');

  } catch (e) {
    container.classList.remove('prices-loading');
    container.innerHTML = coins.map(c => `<div class="price-card">
      <div class="price-card-head">
        <span class="price-card-icon">${BATT_ICONS[c.icon] ? `<img src="${BATT_ICONS[c.icon]}" width="18" height="18" style="border-radius:50%;object-fit:cover" alt="${c.sym}" onerror="this.style.display='none'">` : `${c.sym[0]}`}</span>
        <span class="price-card-sym">${c.sym}</span>
      </div>
      <div class="price-card-price">--</div>
      <div class="price-card-change">--</div>
    </div>`).join('');
  }
}

function _tpSyncChartOverlay(priceData) {
  if (!priceData || !priceData.price) return;
  const cp  = document.getElementById('tp-chart-price');
  const cc  = document.getElementById('tp-chart-change');
  const ch  = document.getElementById('tp-chart-high');
  const cl  = document.getElementById('tp-chart-low');
  const cv  = document.getElementById('tp-chart-vol');
  const src = document.getElementById('tp-chart-source');

  if (cp) {
    const prev = cp.dataset.prev ? parseFloat(cp.dataset.prev) : 0;
    cp.textContent = fmtPrice(priceData.price);
    if (prev && priceData.price !== prev) {
      cp.style.color = priceData.price > prev ? '#00c47a' : '#e24b4a';
      clearTimeout(cp._ft);
      cp._ft = setTimeout(() => { cp.style.color = '#fff'; }, 280);
    }
    cp.dataset.prev = priceData.price;
  }
  if (cc) {
    const isUp = (priceData.change || 0) >= 0;
    cc.textContent = (isUp ? '+' : '') + priceData.change.toFixed(2) + '%';
    cc.style.background = isUp ? 'rgba(0,196,122,0.15)' : 'rgba(226,75,74,0.15)';
    cc.style.color      = isUp ? '#00c47a' : '#e24b4a';
  }
  if (ch && priceData.high)  ch.textContent = fmtPrice(priceData.high);
  if (cl && priceData.low)   cl.textContent = fmtPrice(priceData.low);
  if (cv && priceData.volume) cv.textContent = '$' + (priceData.volume).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  if (src) src.textContent = _tpWSLive ? 'WS ●' : 'REST ○';
  if (src) src.style.color = _tpWSLive ? '#00c47a' : '#EF9F27';

  const obPriceEl = document.getElementById('tp-ob-price');
  if (obPriceEl && _tpWSLive) {
    if (obPriceEl.textContent === '$69,420.50' || obPriceEl.textContent === '—') {
      obPriceEl.textContent = fmtPrice(priceData.price);
    }
  }
}

/* ==========================================================================
   5. CONSTANTS & METADATA
   ========================================================================== */
const BATT_ICONS = {
  BTC: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  USDC: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  XRP: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
  ADA: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
  MATIC: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
  eth: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  base: 'https://assets.coingecko.com/coins/images/30966/small/base-symbol-blue.png',
  arb: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
  op: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
  pol: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
  bnb: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  avax: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  ftm: 'https://assets.coingecko.com/coins/images/4001/small/Fantom_round.png',
  zks: 'https://assets.coingecko.com/coins/images/38043/small/ZKSyncLogo.jpeg',
  stark: 'https://assets.coingecko.com/coins/images/26433/small/starknet.png',
  linea: 'https://assets.coingecko.com/coins/images/33735/small/linea-mainnet.png',
  sol: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  sui: 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg',
  apt: 'https://assets.coingecko.com/coins/images/26455/small/aptos_round.png',
  ton: 'https://assets.coingecko.com/coins/images/17980/small/ton_symbol.png',
};

const DEX_LOGOS = {
  'Uniswap v3': 'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png',
  'PancakeSwap': 'https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo.png',
  'Jupiter':     'https://assets.coingecko.com/coins/images/34188/small/jup.png',
  'Velodrome':   'https://assets.coingecko.com/coins/images/25783/small/velo.png',
  'Aerodrome':   'https://assets.coingecko.com/coins/images/31745/small/token.png',
  'QuickSwap':   'https://assets.coingecko.com/coins/images/13970/small/1_pOU6pBMEmiL-ZJVb0CYRjQ.png',
  'SyncSwap':    'https://assets.coingecko.com/coins/images/29498/small/SyncSwap.png',
  'Avnu':        'https://assets.coingecko.com/exchanges/images/895/small/avnu.png',
  'Cetus':       'https://assets.coingecko.com/coins/images/30256/small/cetus.png',
  'Trader Joe':  'https://assets.coingecko.com/coins/images/17569/small/trader-joe.png',
  'SpookySwap':  'https://assets.coingecko.com/exchanges/images/518/small/SpookySwap.png',
  'DeDust':      'https://assets.coingecko.com/exchanges/images/778/small/dedust.png',
  'Liquidswap':  'https://assets.coingecko.com/exchanges/images/609/small/liquidswap.png',
};

function fmtPrice(price, withDollar = true) {
  if (!price || isNaN(price) || price === 0) return withDollar ? '' : '';
  let decimals;
  if (price >= 10000)      decimals = 1;
  else if (price >= 1000)  decimals = 2;
  else if (price >= 100)   decimals = 2;
  else if (price >= 10)    decimals = 3;
  else if (price >= 1)     decimals = 4;
  else if (price >= 0.1)   decimals = 5;
  else if (price >= 0.01)  decimals = 6;
  else                     decimals = 8;
  const formatted = price.toFixed(decimals);
  return withDollar ? '$' + formatted : formatted;
}
