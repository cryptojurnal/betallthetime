/* ==========================================================================
   1. CEX STANDARD CONFIGURATIONS & STATE
   ========================================================================== */
var CEX_FEES = {
  binance: {
    spot:   { maker: 0.1,   taker: 0.1   },
    perp:   { maker: 0.02,  taker: 0.05  },
    bnbDiscount: 0.25,
    fundingInterval: 8,
    defaultFunding: 0.01,
  },
  bybit: {
    spot:   { maker: 0.1,   taker: 0.1   },
    perp:   { maker: 0.02,  taker: 0.055 },
    fundingInterval: 8,
    defaultFunding: 0.01,
  },
  okx: {
    spot:   { maker: 0.08,  taker: 0.1   },
    perp:   { maker: 0.02,  taker: 0.05  },
    fundingInterval: 8,
    defaultFunding: 0.01,
  },
};

var CEX_MARGIN_MODES = { cross: 'cross', isolated: 'isolated' };
var CEX_POSITION_MODES = { oneway: 'one-way', hedge: 'hedge' };
var _tpFundingCache = {};

var TP_STATE = {
  exchange: 'binance',
  pair: 'BTCUSDT',
  side: 'long',
  orderType: 'market',
  marketType: 'spot',   
  marginMode: 'cross',  
  positionMode: 'oneway', 
  leverage: 10,
  balance: 10000,
  startBalance: 10000,
  positions: [],
  history: [],
  pendingOrders: [],
  prices: {},
  fundingRates: {},     
  markPrices: {},       
  timeframe: '15m',
  chartType: 'candle',
  useBnbFee: false,     
  feeTier: 'vip0',      
  totalFeesPaid: 0,
  totalFundingPaid: 0,
  sessionTrades: 0,
};

let NOT_LINKED = localStorage.getItem('batt_not_linked') === 'true';

function tpLoadState() {
  const saved = localStorage.getItem('tp_state');
  if (saved) {
    try {
      const parsed = _safeJSON(saved, null);
      TP_STATE = { ...TP_STATE, ...parsed };
    } catch (e) {}
  }
}

function tpSaveState() {
  localStorage.setItem('tp_state', JSON.stringify(TP_STATE));
}

/* ==========================================================================
   2. SIMULATOR MATHEMATICS & PROJECTIONS
   ========================================================================== */
function runSeq(startAcc, lev, initNot, bt, fr, kpi, isSpot, cf, month) {
  const cfOn = cf !== false;
  let acc = startAcc, not = isSpot ? startAcc : initNot;
  let accF = startAcc;
  const trades = [];
  const tradesLen = (Array.isArray(bt) && bt.length > 0) ? bt.length : 1;
  for (let i = 0; i < tradesLen; i++) {
    const skip = (bt[i] || 0) === 0;
    const am = isSpot ? not : not / lev;
    const fm = isSpot ? 100 : am / accF * 100;
    const liq = isSpot ? 999 : accF / not * 100;
    if (skip) {
      trades.push({ no: i + 1, skip: true, not, am, fm, liq, tgt: 0, freq: 1, sp: 0, cp: 0, accB: accF, accA: accF, feePaid: 0, accAF: accF, isSpot });
      continue;
    }
    const tgt = bt[i] * kpi / 100;
    const sp = not * tgt, cp = sp;
    const chosenRate = (gs().FEE.method === 'maker' ? gs().FEE.maker : gs().FEE.taker) / 100;
    const tradeFee = 2 * chosenRate * not;
    const fundFee = isSpot ? 0 : (gs().FEE.funding / 100) * not * gs().FEE.holds;
    const feePaid = tradeFee + fundFee;
    const accAfter = acc + cp;
    const accAfterF = accF + cp - feePaid;
    
    const actual = month ? getActualTrade(month, i + 1) : null;
    const actualCp = actual ? (actual.pnl || 0) : null;
    const actualFee = actual ? (actual.fee || 0) : null;
    const useActual = actual && actualCp !== null;
    const finalCp = useActual ? actualCp : cp;
    const finalFee = useActual ? actualFee : feePaid;
    const finalCpPreFee = useActual ? (actualCp + actualFee) : cp;
    const accAfterActual = acc + finalCpPreFee;
    const accAfterFActual = accF + finalCp;
    
    trades.push({
      no: i + 1, skip: false, not, am, fm, liq, tgt: bt[i] * kpi, freq: 1,
      sp: useActual ? finalCpPreFee : sp,
      cp: useActual ? finalCpPreFee : cp,
      accB: accF, accA: useActual ? accAfterActual : accAfter,
      feePaid: useActual ? finalFee : feePaid,
      accAF: useActual ? accAfterFActual : accAfterF,
      isSpot,
      hasActual: useActual,
      projCp: cp, projFee: feePaid, projAccAF: accAfterF,
      actualCp: useActual ? finalCp : null,
      actualFee: useActual ? finalFee : null
    });
    acc = useActual ? accAfterActual : accAfter;
    accF = useActual ? accAfterFActual : accAfterF;
    const actualNetPnlCF = useActual ? finalCp : (cp - feePaid);
    if (cfOn) {
      not = isSpot ? accF : not + actualNetPnlCF;
    } else {
      not = isSpot ? startAcc : initNot;
    }
  }
  return { trades, endAcc: acc, endAccF: accF, lastNotional: cfOn ? not : initNot };
}

function sim() {
  const s = gs();
  const isQ = isQTab(TAB);
  const zeroSet = s.ZM;
  const total = isQ ? 3 : TOTAL;
  const months = [];
  let acc = s.P, banked = 0, totalDeposits = 0;
  let prevLastNotional = s.NOT;

  for (let m = 1; m <= total; m++) {
    const lb = getMLabel(m), isZ = zeroSet.has(m);
    const depoAmt = parseFloat(s.DEPO && s.DEPO[m]) || 0;
    acc += depoAmt;
    totalDeposits += depoAmt;
    if (isZ) {
      months.push({ m, lb, isZ: true, sA: acc, eA: acc, gA: acc, wd: 0, depo: depoAmt, banked, totalDeposits, nw: acc + banked, trades: [], pct: 0, postLiq: null, initNot: prevLastNotional, liqT1: acc / prevLastNotional * 100, mp: 1 });
      continue;
    }
    const mp = parseFloat(s.MP[m]) || 1.0;
    const cf = s.CF !== false;
    const cfBase = cf ? prevLastNotional : s.NOT;
    const initNot = s.SPOT ? (cf ? acc : (s.P + totalDeposits)) : (cfBase * mp);
    const liqT1 = s.SPOT ? 100 : (acc / initNot * 100);
    const { bt: mBT, fr: mFR } = getMonthTrades(m);
    const { trades, endAcc: gA, endAccF: gAF, lastNotional: ln } = runSeq(acc, s.LEV, initNot, mBT, mFR, s.KPI, s.SPOT, cf, m);
    const monthFeePaid = trades.filter(t => !t.skip).reduce((a, t) => a + t.feePaid, 0);
    const wdAmt = parseFloat(s.WD[m]) || 0;
    
    const activeTrades = trades.filter(t => !t.skip);
    const allLocked = activeTrades.length > 0 && activeTrades.every(t => t.hasActual);
    const lastActualTrade = allLocked ? activeTrades[activeTrades.length - 1] : null;
    const actualEndBal = lastActualTrade ? lastActualTrade.accAF : null;
    const effectiveGAF = allLocked && actualEndBal !== null ? actualEndBal : gAF;
    
    const wd = wdAmt;
    const fA = effectiveGAF - wd;
    const bust = fA <= 0;
    banked += bust ? effectiveGAF : wd;
    const lastActiveTrade = activeTrades.slice(-1)[0];
    const _lastNetPnl = lastActiveTrade ? (lastActiveTrade.hasActual ? lastActiveTrade.actualCp : (lastActiveTrade.cp - lastActiveTrade.feePaid)) : 0;
    const prevLN = lastActiveTrade ? lastActiveTrade.not + _lastNetPnl : initNot;
    const postLiq = wd > 0 && !bust ? (fA / prevLN * 100) : null;
    const pct = (effectiveGAF - acc) / acc * 100;
    prevLastNotional = prevLN;
    months.push({ m, lb, isZ: false, sA: acc, eA: bust ? 0 : fA, gA, gAF: effectiveGAF, wd, depo: depoAmt, banked, totalDeposits, nw: (bust ? 0 : fA) + banked, trades, pct, postLiq, initNot, liqT1, mp, feePaid: monthFeePaid, bust });
    if (bust) break;
    acc = fA;
  }
  return months;
}

function seqStats(s) {
  const actTr = s.BT.filter(t => t !== 0).length;
  const wins = s.BT.filter(t => t > 0).length;
  const losses = s.BT.filter(t => t < 0).length;
  const net = s.BT.reduce((a, t) => a + (t !== 0 ? t * s.KPI / 100 : 0), 0) * 100;
  const upside = s.BT.reduce((a, t) => a + (t > 0 ? t * s.KPI / 100 : 0), 0) * 100;
  const downside = s.BT.reduce((a, t) => a + (t < 0 ? t * s.KPI / 100 : 0), 0) * 100;
  return { actTr, wins, losses, net, upside, downside };
}

/* ==========================================================================
   3. MARGIN, LIQUIDATION, AND CEX PRICING MATHS
   ========================================================================== */
function tpCalcMarginRequired(sizeUSDT, leverage, marginMode) {
  return sizeUSDT / leverage;
}

function tpCalcMaxSize() {
  const leverage = TP_STATE.leverage;
  const isCross = TP_STATE.marginMode === 'cross' && TP_STATE.marketType === 'perpetual';
  if (isCross) {
    const unrealizedPnl = TP_STATE.positions
      .filter(p => p.marginMode === 'cross')
      .reduce((a, p) => {
        const price = TP_STATE.prices[p.pair]?.price || p.entryPrice;
        return a + tpCalcPnL(p, price) + tpCalcFunding(p);
      }, 0);
    const crossMargin = TP_STATE.positions
      .filter(p => p.marginMode === 'cross')
      .reduce((a, p) => a + (p.initialMargin || p.size / p.leverage), 0);
    const walletEquity = TP_STATE.balance + crossMargin + unrealizedPnl;
    const maintMargin  = TP_STATE.positions
      .filter(p => p.marginMode === 'cross')
      .reduce((a, p) => a + p.size * 0.005, 0);
    const availableCross = Math.max(0, walletEquity - maintMargin);
    return availableCross * leverage;
  } else {
    return TP_STATE.balance * leverage;
  }
}

function tpCalcLiqPrice(pos) {
  if (!pos || pos.marketType === 'spot' || pos.leverage <= 1) return null;
  const { entryPrice, side, size } = pos;
  const margin  = pos.initialMargin || (size / pos.leverage);
  const mmRate  = 0.005;
  const notional = size;
  if (pos.marginMode === 'isolated') {
    if (side === 'long')  return entryPrice * (1 - (margin / notional) + mmRate);
    else                 return entryPrice * (1 + (margin / notional) - mmRate);
  } else {
    const totalMargin = TP_STATE.positions.reduce((a, p) => {
      if (p.marketType === 'spot') return a;
      return a + (p.initialMargin || p.size / p.leverage);
    }, 0);
    const walletEquity = TP_STATE.balance + totalMargin;
    const totalMaintMargin = TP_STATE.positions.reduce((a, p) => {
      if (p.marketType === 'spot') return a;
      return a + p.size * mmRate;
    }, 0);
    const availableForLoss = walletEquity - totalMaintMargin;
    if (side === 'long')  return Math.max(0, entryPrice - (availableForLoss / notional) * entryPrice);
    else                 return entryPrice + (availableForLoss / notional) * entryPrice;
  }
}

function tpCalcROE(pos, currentPrice) {
  if (!pos) return 0;
  const pnl = tpCalcPnL(pos, currentPrice);
  const margin = pos.initialMargin || (pos.size / pos.leverage);
  return (pnl / margin) * 100;
}

function tpCalcFunding(pos) {
  if (!pos || pos.marketType === 'spot') return 0;
  const liveEx = TP_STATE.exchange === 'binance' ? 'binance' : TP_STATE.exchange === 'bybit' ? 'bybit' : TP_STATE.exchange === 'okx' ? 'okx' : null;
  const liveRate = liveEx && _frData[pos.pair] && _frData[pos.pair][liveEx] != null
    ? _frData[pos.pair][liveEx]
    : (TP_STATE.fundingRates[pos.pair] ?? (CEX_FEES[TP_STATE.exchange]?.defaultFunding ?? 0.01));
  const hoursSinceOpen = (Date.now() - pos.openedAt) / 3600000;
  const interval       = CEX_FEES[TP_STATE.exchange]?.fundingInterval || 8;
  const fundingPeriods = Math.floor(hoursSinceOpen / interval);
  if (fundingPeriods === 0) return 0;
  const notional = pos.size;
  const sign = pos.side === 'long' ? -1 : 1;
  return sign * notional * (liveRate / 100) * fundingPeriods;
}

/* ==========================================================================
   4. PAPER TRADING ORDER & EXECUTION WORKSPACE
   ========================================================================== */
function tpCheckPendingOrders() {
  if (!TP_STATE.pendingOrders || !TP_STATE.pendingOrders.length) return;
  const now = Date.now();
  let filled = [];

  TP_STATE.pendingOrders.forEach(order => {
    const priceData = TP_STATE.prices[order.pair];
    if (!priceData || !priceData.price) return;
    const lastPrice = priceData.price;
    const bestAsk = TP_STATE.bestAsk || lastPrice;
    const bestBid = TP_STATE.bestBid || lastPrice;
    let triggered = false;
    let fillPrice;

    if (order.type === 'limit') {
      if (order.side === 'long'  && bestAsk <= order.limitPrice) { triggered = true; fillPrice = order.limitPrice; }
      if (order.side === 'short' && bestBid >= order.limitPrice) { triggered = true; fillPrice = order.limitPrice; }
    } else if (order.type === 'stop') {
      if (order.side === 'long'  && lastPrice >= order.limitPrice) { triggered = true; }
      if (order.side === 'short' && lastPrice <= order.limitPrice) { triggered = true; }
      if (triggered) {
        const slippage = tpCalcSlippage(order.pair, order.size);
        fillPrice = order.side === 'long' ? lastPrice * (1 + slippage) : lastPrice * (1 - slippage);
      }
    }

    if (triggered && fillPrice) {
      filled.push(order);
      const fees = tpGetFees(order.exchange, order.marketType, order.type);
      const openFee = order.size * (fees.active / 100);
      const pos = {
        id: 'pos_' + now + '_' + Math.random().toString(36).slice(2, 6),
        pair: order.pair,
        side: order.side,
        size: order.size,
        leverage: order.leverage,
        marginMode: order.marginMode || 'cross',
        initialMargin: order.marginNeeded || order.size / order.leverage,
        entryPrice: fillPrice,
        marketType: order.marketType,
        exchange: order.exchange,
        tpPrice: order.tpPrice || 0,
        slPrice: order.slPrice || 0,
        openFee,
        feeRate: fees.active,
        openedAt: now,
        slippage: fillPrice - order.limitPrice,
      };
      pos.liqPrice = tpCalcLiqPrice(pos);
      const isCrossFill = pos.marginMode === 'cross' && pos.marketType !== 'spot';
      if (isCrossFill) TP_STATE.balance -= (pos.initialMargin || pos.size / pos.leverage);
      TP_STATE.balance -= openFee;
      TP_STATE.totalFeesPaid += openFee;
      
      const fillTxt = order.type === 'limit'
        ? `LIMIT filled: ${order.pair.replace('USDT','')} ${order.side.toUpperCase()} @ ${fmtPrice(fillPrice)}`
        : `STOP filled: ${order.pair.replace('USDT','')} ${order.side.toUpperCase()} @ ${fmtPrice(fillPrice)} (trigger: ${fmtPrice(order.limitPrice)})`;
      showToast(fillTxt, 'success');
    }
  });

  if (filled.length) {
    TP_STATE.pendingOrders = TP_STATE.pendingOrders.filter(o => !filled.includes(o));
    tpSaveState();
    tpRenderPositions();
    tpRenderOrders();
    tpUpdateStats();
    _tpUpdateOrderBadge();
  }
}

function tpPlaceOrder() {
  const sizeInput = document.getElementById('tp-size');
  const size = parseFloat(sizeInput?.value) || 0;
  const priceData = TP_STATE.prices[TP_STATE.pair];
  const isSpot = TP_STATE.marketType === 'spot';
  const isSell = TP_STATE.side === 'short';
  const isLimitOrStop = TP_STATE.orderType === 'limit' || TP_STATE.orderType === 'stop';
  const lev = isSpot ? 1 : TP_STATE.leverage;
  const fees = tpGetFees(TP_STATE.exchange, TP_STATE.marketType, TP_STATE.orderType);

  if (!isLimitOrStop && (!priceData || !priceData.price)) {
    showToast('Loading prices... please wait', 'info');
    tpFetchPrices();
    return;
  }
  if (size <= 0) { showToast('Enter a valid size', 'error'); sizeInput?.focus(); return; }
  const price = priceData?.price || 0;

  if (isLimitOrStop) {
    const limitPriceEl = document.getElementById('tp-limit-price');
    const stopPriceEl  = document.getElementById('tp-stop-price');
    const limitPrice   = parseFloat(limitPriceEl?.value) || parseFloat(stopPriceEl?.value);
    if (!limitPrice || limitPrice <= 0) { showToast('Enter a limit price first', 'error'); return; }
    const marginNeeded = isSpot ? size : tpCalcMarginRequired(size, lev, TP_STATE.marginMode);
    const isCrossOrder = !isSpot && TP_STATE.marginMode === 'cross';
    const crossMarginLocked = isCrossOrder ? TP_STATE.positions.filter(p => p.marginMode === 'cross').reduce((a, p) => a + (p.initialMargin || p.size / p.leverage), 0) : 0;
    const availForOrder = isCrossOrder ? TP_STATE.balance - crossMarginLocked : TP_STATE.balance;
    if (marginNeeded > availForOrder) { showToast('Insufficient balance. Need: ' + fmtPrice(marginNeeded), 'error'); return; }
    
    const tpPrice = parseFloat(document.getElementById('tp-tp-price')?.value) || 0;
    const slPrice = parseFloat(document.getElementById('tp-sl-price')?.value) || 0;
    const order = {
      id: 'ord_' + Date.now(),
      pair: TP_STATE.pair,
      side: TP_STATE.side,
      type: TP_STATE.orderType,
      limitPrice,
      size,
      leverage: lev,
      marginMode: TP_STATE.marginMode,
      marginNeeded,
      marketType: TP_STATE.marketType,
      exchange: TP_STATE.exchange,
      tpPrice,
      slPrice,
      feeRate: fees.active,
      createdAt: Date.now(),
    };
    if (!isCrossOrder) TP_STATE.balance -= marginNeeded;
    if (!TP_STATE.pendingOrders) TP_STATE.pendingOrders = [];
    TP_STATE.pendingOrders.push(order);
    tpSaveState(); tpRenderOrders(); _tpUpdateOrderBadge();
    const _posPanel = document.getElementById('tp-pos-panel');
    if (_posPanel && _posPanel.classList.contains('collapsed')) { _posPanel.classList.remove('collapsed'); setTimeout(_tpSyncPosToggle, 10); }
    tpShowTab('orders');
    showToast(`${TP_STATE.orderType.toUpperCase()} ${order.side.toUpperCase()} @ ${fmtPrice(limitPrice)} | margin: ${fmtPrice(marginNeeded)}`, 'success');
    return;
  }

  if (isSpot && isSell) {
    const holding = TP_STATE.positions.find(p => p.pair === TP_STATE.pair && (p.marketType === 'spot' || p.leverage <= 1));
    if (!holding) { showToast('No ' + TP_STATE.pair.replace('USDT','') + ' holdings to sell', 'error'); return; }
    const holdingQty  = holding.size / holding.entryPrice;
    const sellQty     = size / price;
    if (sellQty > holdingQty * 1.001) { showToast('Insufficient holdings. You have ' + holdingQty.toFixed(6) + ' ' + TP_STATE.pair.replace('USDT',''), 'error'); return; }
    const slippage    = tpCalcSlippage(TP_STATE.pair, size);
    const fillPrice   = price * (1 - slippage);
    const proceeds    = sellQty * fillPrice;
    const fee         = proceeds * (fees.active / 100);
    const costBasis   = sellQty * holding.entryPrice;
    const pnl         = proceeds - costBasis - fee;
    TP_STATE.balance += proceeds - fee;
    TP_STATE.totalFeesPaid += fee;
    const remainingQty = holdingQty - sellQty;
    if (remainingQty < 0.00001) {
      const idx = TP_STATE.positions.indexOf(holding);
      TP_STATE.positions.splice(idx, 1);
      TP_STATE.history.unshift({ ...holding, exitPrice: fillPrice, pnl, fee, closedAt: Date.now() });
    } else {
      holding.size = remainingQty * holding.entryPrice;
    }
    if (TP_STATE.history.length > 100) TP_STATE.history = TP_STATE.history.slice(0, 100);
    TP_STATE.sessionTrades++;
    tpSaveState(); tpUpdateUI(); tpRenderPositions(); tpRenderHistory();
    const pnlStr = (pnl >= 0 ? '+' : '') + fmtPrice(pnl);
    showToast('Sold ' + TP_STATE.pair.replace('USDT','') + ' @ ' + fmtPrice(fillPrice) + ' | PnL: ' + pnlStr + ' | Fee: ' + fmtPrice(fee), pnl >= 0 ? 'success' : 'error');
    return;
  }

  const notional       = size;
  const marginNeeded   = isSpot ? size : tpCalcMarginRequired(notional, lev, TP_STATE.marginMode);
  const slippage       = tpCalcSlippage(TP_STATE.pair, notional);
  const fillPrice      = isSell ? price * (1 - slippage) : price * (1 + slippage);
  const openFee        = notional * (fees.active / 100);

  const isCross = !isSpot && TP_STATE.marginMode === 'cross';
  const balanceDeduct = isSpot ? size + openFee : (isCross ? openFee : marginNeeded + openFee);

  const crossMarginLocked = isCross ? TP_STATE.positions.filter(p => p.marginMode === 'cross').reduce((a, p) => a + (p.initialMargin || p.size / p.leverage), 0) : 0;
  const availableBalance  = isCross ? TP_STATE.balance - crossMarginLocked : TP_STATE.balance;
  const requiredBalance   = isCross ? openFee + marginNeeded : balanceDeduct;
  if (availableBalance < requiredBalance) { showToast('Insufficient balance. Need: ' + fmtPrice(requiredBalance), 'error'); return; }
  if (TP_STATE.positions.length >= 20) { showToast('Max 20 positions', 'error'); return; }

  const tpPrice = parseFloat(document.getElementById('tp-tp-price')?.value) || 0;
  const slPrice = parseFloat(document.getElementById('tp-sl-price')?.value) || 0;

  const position = {
    id: Date.now().toString(),
    pair: TP_STATE.pair,
    side: TP_STATE.side,
    marketType: TP_STATE.marketType,
    marginMode: TP_STATE.marginMode,
    leverage: lev,
    size: notional,
    entryPrice: fillPrice,
    initialMargin: marginNeeded,
    tpPrice,
    slPrice,
    openFee,
    feeRate: fees.active,
    exchange: TP_STATE.exchange,
    openedAt: Date.now(),
    slippage: slippage * fillPrice,
  };
  position.liqPrice = tpCalcLiqPrice(position);

  TP_STATE.balance -= isCross ? openFee : (isSpot ? size + openFee : marginNeeded + openFee);
  TP_STATE.totalFeesPaid += openFee;
  TP_STATE.positions.push(position);
  tpSaveState(); tpUpdateUI(); tpRenderPositions();
  if (sizeInput) sizeInput.value = '';
  tpCalculate();

  const pairShort = position.pair.replace('USDT','');
  const slipTxt   = (slippage * 100).toFixed(3) + '%';
  if (isSpot) {
    showToast('Bought ' + pairShort + ' @ ' + fmtPrice(fillPrice) + ' | Fee: ' + fmtPrice(openFee) + ' | Slip: ' + slipTxt, 'success');
  } else {
    showToast(position.side.toUpperCase() + ' ' + pairShort + ' ' + lev + 'x @ ' + fmtPrice(fillPrice) + ' | Margin: ' + fmtPrice(marginNeeded) + ' | Fee: ' + fmtPrice(openFee), 'success');
    if (TP_STATE.marketType === 'perpetual') tpFetchFundingRate(TP_STATE.pair);
  }
}

function tpClosePosition(id, partialPct) {
  const idx = TP_STATE.positions.findIndex(p => p.id === id);
  if (idx === -1) return;
  const pos = TP_STATE.positions[idx];
  const currentPrice = TP_STATE.prices[pos.pair]?.price || pos.entryPrice;
  const pct = partialPct || 100;
  const isPartial = pct < 100;

  const closeNotional  = pos.size * (pct / 100);
  const pnl            = tpCalcPnL({ ...pos, size: closeNotional }, currentPrice);
  const funding        = tpCalcFunding({ ...pos, size: closeNotional });
  const fees           = tpGetFees(pos.exchange, pos.marketType, 'market');
  const closeFee       = closeNotional * (fees.taker / 100);
  const netPnl         = pnl + funding - closeFee;
  const isCross        = pos.marginMode === 'cross' && pos.marketType !== 'spot';
  const returnedMargin = isCross ? 0 : (pos.initialMargin || pos.size / pos.leverage) * (pct / 100);

  TP_STATE.balance += isCross ? netPnl : returnedMargin + netPnl;
  TP_STATE.totalFeesPaid += closeFee;
  TP_STATE.totalFundingPaid += Math.abs(funding);

  if (isPartial) {
    const remainingPct = (100 - pct) / 100;
    pos.initialMargin = (pos.initialMargin || pos.size / pos.leverage) * remainingPct;
    pos.size         -= closeNotional;
    pos.liqPrice      = tpCalcLiqPrice(pos);
    TP_STATE.history.unshift({ ...pos, exitPrice: currentPrice, pnl: netPnl, fee: closeFee, funding, partial: true, pct, closedAt: Date.now() });
  } else {
    TP_STATE.positions.splice(idx, 1);
    TP_STATE.history.unshift({ ...pos, exitPrice: currentPrice, pnl: netPnl, fee: closeFee, funding, closedAt: Date.now() });
  }
  if (TP_STATE.history.length > 100) TP_STATE.history = TP_STATE.history.slice(0, 100);
  TP_STATE.sessionTrades++;

  tpSaveState(); tpUpdateUI(); tpRenderPositions(); tpRenderHistory();
  const pnlStr = (netPnl >= 0 ? '+' : '') + fmtPrice(netPnl);
  const label  = isPartial ? 'Closed ' + pct + '%' : 'Closed';
  showToast(label + ' ' + pos.pair.replace('USDT','') + ' | PnL: ' + pnlStr + ' | Fee: ' + fmtPrice(closeFee) + (funding !== 0 ? ' | Funding: ' + fmtPrice(funding) : ''), netPnl >= 0 ? 'success' : 'error');
}

/* ==========================================================================
   5. TRADINGVIEW PLOTTING UTILITIES
   ========================================================================== */
var _tpChart = null;
var _tpCandleSeries = null;
var _tpVolumeSeries = null;
var _tpEMASeries = null;

var _tvWidget = null;
var _tvSymbol = 'BINANCE:BTCUSDT';
var _tvInterval = '15';
var _tvIntervalMap = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };

function tpInitTVChart() {
  const container = document.getElementById('tp-tv-widget');
  if (!container) return;
  container.innerHTML = '';

  const exMap = {
    'binance': TP_STATE.marketType === 'spot' ? 'BINANCE' : 'BINANCE',
    'bybit':   TP_STATE.marketType === 'spot' ? 'BYBIT' : 'BYBIT',
    'okx':     TP_STATE.marketType === 'spot' ? 'OKX' : 'OKX',
    'coinbase': 'COINBASE',
  };
  const exPrefix = exMap[TP_STATE.exchange] || 'BINANCE';
  const baseSym = (TP_STATE.pair || 'BTCUSDT').replace('USDT', '');
  let tvSym;
  if (TP_STATE.marketType === 'perpetual') {
    const perpMap = {
      'binance': `${exPrefix}:${baseSym}USDT.P`,
      'bybit':   `${exPrefix}:${baseSym}USDT.P`,
      'okx':     `${exPrefix}:${baseSym}USDT-SWAP`,
    };
    tvSym = perpMap[TP_STATE.exchange] || `BINANCE:${baseSym}USDT.P`;
  } else {
    tvSym = `${exPrefix}:${baseSym}USDT`;
  }
  _tvSymbol = tvSym;
  _tvInterval = _tvIntervalMap[TP_STATE.timeframe || '15m'] || '15';

  const doInit = function() {
    _tvWidget = new TradingView.widget({
      container_id: 'tp-tv-widget',
      symbol: _tvSymbol,
      interval: _tvInterval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#0a0a0a',
      overrides: {
        'paneProperties.background': '#050505',
        'paneProperties.backgroundType': 'solid',
        'paneProperties.vertGridProperties.color': '#0f0f0f',
        'paneProperties.horzGridProperties.color': '#0f0f0f',
        'scalesProperties.textColor': '#666666',
        'scalesProperties.lineColor': '#1a1a1a',
        'mainSeriesProperties.candleStyle.upColor': '#00c47a',
        'mainSeriesProperties.candleStyle.downColor': '#e24b4a',
        'mainSeriesProperties.candleStyle.borderUpColor': '#00c47a',
        'mainSeriesProperties.candleStyle.borderDownColor': '#e24b4a',
        'mainSeriesProperties.candleStyle.wickUpColor': '#00c47a',
        'mainSeriesProperties.candleStyle.wickDownColor': '#e24b4a',
      },
      enable_publishing: false,
      allow_symbol_change: false,
      withdateranges: true,
      save_image: true,
      hide_side_toolbar: false,
      width: '100%',
      height: '100%',
      autosize: true,
      fullscreen: false,
      disabled_features: ['header_symbol_search', 'header_compare', 'symbol_search_hot_key'],
    });
  };

  if (window.TradingView) {
    doInit();
  } else {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.onload = doInit;
    document.head.appendChild(script);
  }
}

function tpSyncTVSymbol() {
  tpInitTVChart();
}

function tpRestartPriceInterval() {
  if (window._tpPriceInterval) { clearInterval(window._tpPriceInterval); window._tpPriceInterval = null; }
  window._tpPriceInterval = setInterval(() => {
    tpFetchPrices();
    tpFetchOrderBook();
  }, 5000);
}

function tpInitChart() {
  tpInitTVChart();
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices.slice(0, period).reduce((a, b) => a + b, 0) / period];
  for (let i = period; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

function tpGenerateSampleData() {
  const price = TP_STATE.prices[TP_STATE.pair]?.price || 69000;
  const data = [];
  const volumes = [];
  const now = Math.floor(Date.now() / 1000);
  const interval = 60 * 15;
  
  let currentPrice = price * 0.95;
  for (let i = 1000; i >= 0; i--) {
    const time = now - (i * interval);
    const volatility = price * 0.002;
    const open = currentPrice;
    const close = open + (Math.random() - 0.48) * volatility * 2;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;
    const volume = Math.random() * 1000 + 100;
    
    data.push({ time, open, high, low, close });
    volumes.push({ time, value: volume, color: close >= open ? 'rgba(0,196,122,0.3)' : 'rgba(226,75,74,0.3)' });
    currentPrice = close;
  }
  
  _tpCandleSeries.setData(data);
  _tpVolumeSeries.setData(volumes);
  _tpChart.timeScale().fitContent();
}

function tpUpdateChartData() {
  tpFetchCandleData();
}

/* ==========================================================================
   6. INTERFACE SYNCS, SHIFTING & PNL RENDERS
   ========================================================================== */
function tpSetMarginMode(mode) {
  TP_STATE.marginMode = mode;
  const crossBtn = document.getElementById('tp-mm-cross');
  const isoBtn   = document.getElementById('tp-mm-iso');
  if (crossBtn) { crossBtn.style.borderColor = mode === 'cross' ? '#00c47a' : '#1a1a1a'; crossBtn.style.background = mode === 'cross' ? '#0a2a1a' : 'transparent'; crossBtn.style.color = mode === 'cross' ? '#00c47a' : '#555'; }
  if (isoBtn)  { isoBtn.style.borderColor = mode === 'isolated' ? '#5b7fff' : '#1a1a1a'; isoBtn.style.background = mode === 'isolated' ? '#0a0a2a' : 'transparent'; isoBtn.style.color = mode === 'isolated' ? '#5b7fff' : '#555'; }
  tpCalculate();
  tpSaveState();
  showToast(mode === 'isolated' ? 'Isolated margin — only this position can be liquidated' : 'Cross margin — whole account is collateral', 'info', 2000);
}

function tpUpdateFeeBadge() {
  const badge = document.getElementById('tp-fee-badge');
  if (!badge) return;
  const fees = tpGetFees(TP_STATE.exchange, TP_STATE.marketType, TP_STATE.orderType);
  badge.textContent = (fees.isMaker ? 'Maker' : 'Taker') + ' ' + fees.active.toFixed(3) + '%';
  badge.style.color = fees.isMaker ? '#00c47a' : '#EF9F27';
  badge.style.background = fees.isMaker ? '#0a2a1a' : '#1a1200';
  badge.style.borderColor = fees.isMaker ? '#004d30' : '#3a3000';
}

function tpUpdateSubmitButton() {
  const btn = document.getElementById('tp-submit');
  if (!btn) return;
  const isSpot    = TP_STATE.marketType === 'spot';
  const side      = TP_STATE.side;
  const pairShort = TP_STATE.pair.replace('USDT', '');
  btn.style.opacity = '';
  btn.style.cursor  = '';
  if (isSpot) {
    const isBuy = side === 'long' || side === 'buy';
    btn.className   = 'tp-submit-btn ' + (isBuy ? 'long' : 'short');
    btn.textContent = isBuy ? `Buy ${pairShort}` : `Sell ${pairShort}`;
  } else {
    btn.className   = 'tp-submit-btn ' + side;
    btn.textContent = `${side === 'long' ? 'Long' : 'Short'} ${pairShort}/USDT`;
  }
}

function tpSetOrderType(type) {
  TP_STATE.orderType = type;
  document.querySelectorAll('.tp-order-tab').forEach(t => t.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  tpUpdateFeeBadge();
  document.getElementById('tp-limit-price-group').style.display = (type === 'limit' || type === 'stop') ? 'block' : 'none';
  document.getElementById('tp-stop-price-group').style.display = type === 'stop' ? 'block' : 'none';
}

function tpSetSizePct(pct) {
  const balance   = TP_STATE.balance;
  const isSpot    = TP_STATE.marketType === 'spot';
  const lev       = isSpot ? 1 : TP_STATE.leverage;
  const fees      = tpGetFees(TP_STATE.exchange, TP_STATE.marketType, TP_STATE.orderType);
  const maxUsable = balance * (1 - fees.active / 100);
  const size      = Math.floor(maxUsable * (pct / 100) * lev * 100) / 100;
  const sizeEl    = document.getElementById('tp-size');
  if (sizeEl) { sizeEl.value = (isSpot ? Math.floor(maxUsable * (pct / 100) * 100) / 100 : size); tpCalculate(); }
}

function tpSetLeverageSlider(val) {
  TP_STATE.leverage = parseInt(val);
  document.getElementById('tp-leverage-value').textContent = val + 'x';
  tpCalculate();
}

function tpSelectSide(side) {
  TP_STATE.side = side;
  document.getElementById('tp-side-long').classList.toggle('active', side === 'long');
  document.getElementById('tp-side-short').classList.toggle('active', side === 'short');
  tpUpdateSubmitButton();
  tpCalculate();
}

function tpAdjustSize(delta) {
  const input = document.getElementById('tp-size');
  let val = parseFloat(input.value) || 0;
  val = Math.max(0, val + delta);
  input.value = val;
  tpCalculate();
}

function tpEditTpSl(id) {
  const pos = TP_STATE.positions.find(p => p.id === id);
  if (!pos) return;
  const currentPrice = TP_STATE.prices[pos.pair]?.price || pos.entryPrice;
  const isLong = pos.side === 'long';
  const suggestTp = isLong ? currentPrice * 1.05 : currentPrice * 0.95;
  const suggestSl = isLong ? currentPrice * 0.97 : currentPrice * 1.03;
  showConfirm({
    icon: '🎯', type: 'info', title: 'Edit TP/SL — ' + pos.pair.replace('USDT', ''),
    message: `<div style="font-size:11px;margin-bottom:8px;color:#888">Current price: ${fmtPrice(currentPrice)} | Entry: ${fmtPrice(pos.entryPrice)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label style="font-size:9px;color:#00c47a;display:block;margin-bottom:4px">TAKE PROFIT ($)</label>
          <input id="edit-tp" type="number" value="${pos.tpPrice || suggestTp.toFixed(2)}" style="width:100%;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px"></div>
        <div><label style="font-size:9px;color:#e24b4a;display:block;margin-bottom:4px">STOP LOSS ($)</label>
          <input id="edit-sl" type="number" value="${pos.slPrice || suggestSl.toFixed(2)}" style="width:100%;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px"></div>
      </div>`,
    confirmText: 'Update', cancelText: 'Cancel'
  }).then(ok => {
    if (!ok) return;
    const newTp = parseFloat(document.getElementById('edit-tp')?.value) || 0;
    const newSl = parseFloat(document.getElementById('edit-sl')?.value) || 0;
    pos.tpPrice = newTp; pos.slPrice = newSl;
    tpSaveState(); tpRenderPositions();
    showToast('TP/SL updated for ' + pos.pair.replace('USDT', ''), 'success');
  });
}

function tpSharePosition(id) {
  const pos = TP_STATE.positions.find(p => p.id === id);
  if (!pos) return;
  const currentPrice = TP_STATE.prices[pos.pair]?.price || pos.entryPrice;
  const pnl = tpCalcPnL(pos, currentPrice);
  const pnlPct = (pnl / pos.size) * 100;
  const isUp = pnl >= 0;
  const isSpot = pos.marketType === 'spot' || pos.leverage === 1;
  const bandColor = isUp ? '#00c47a' : '#e24b4a';
  const sideColor = pos.side === 'long' ? '#00c47a' : '#e24b4a';
  const pair = pos.pair.replace('USDT', '') + '/USDT';
  const ex = (pos.exchange || TP_STATE.exchange || '').toUpperCase();

  const W = 800, H = 440;
  const canvas = document.getElementById('tp-share-canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = bandColor;
  ctx.globalAlpha = 0.05;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.fillStyle = bandColor;
  ctx.fillRect(0, 0, 4, H);

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 0.5;
  for (let x = 80; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 60; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  ctx.font = '600 11px "Trebuchet MS",sans-serif';
  ctx.fillStyle = '#444';
  ctx.textAlign = 'left';
  ctx.fillText('⚡ BATT  ·  PAPER TRADING  ·  betallthetime.fun', 24, 30);

  const sideLabel = isSpot ? 'SPOT' : pos.side.toUpperCase();
  const badgeW = isSpot ? 60 : 72;
  const badgeX = W - 24 - badgeW;
  ctx.fillStyle = sideColor + '22';
  roundRect(ctx, badgeX, 14, badgeW, 26, 6); ctx.fill();
  ctx.font = '800 12px "Trebuchet MS",sans-serif';
  ctx.fillStyle = sideColor;
  ctx.textAlign = 'center';
  ctx.fillText(sideLabel, badgeX + badgeW / 2, 31);

  if (!isSpot) {
    const levW = 44;
    const levX = badgeX - levW - 8;
    ctx.fillStyle = '#1a1a2a';
    roundRect(ctx, levX, 14, levW, 26, 6); ctx.fill();
    ctx.font = '800 12px "Trebuchet MS",sans-serif';
    ctx.fillStyle = '#5b7fff';
    ctx.fillText(pos.leverage + 'x', levX + levW / 2, 31);
  }

  ctx.font = '700 28px "Trebuchet MS",sans-serif';
  ctx.fillStyle = '#e0e0e0';
  ctx.textAlign = 'left';
  ctx.fillText(pair, 24, 78);

  ctx.font = '400 12px "Trebuchet MS",sans-serif';
  ctx.fillStyle = '#555';
  ctx.fillText(ex + (isSpot ? ' · SPOT' : ' · PERP'), 24, 98);

  const pctStr = (isUp ? '+' : '') + pnlPct.toFixed(2) + '%';
  ctx.font = '800 96px "Trebuchet MS",sans-serif';
  ctx.fillStyle = bandColor;
  ctx.textAlign = 'left';
  ctx.fillText(pctStr, 24, 215);

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(24, 272); ctx.lineTo(W - 24, 272); ctx.stroke();

  const stats = isSpot ? [
    ['avg entry', fmtPrice(pos.entryPrice)],
    ['mark price', fmtPrice(currentPrice)],
    ['size', '$' + pos.size],
    ['holdings', (pos.size / pos.entryPrice).toFixed(6) + ' ' + pos.pair.replace('USDT', '')],
  ] : [
    ['entry price', fmtPrice(pos.entryPrice)],
    ['mark price', fmtPrice(currentPrice)],
    ['size', '$' + pos.size],
    ['leverage', pos.leverage + 'x'],
    ['exchange', ex],
  ];

  const colW = (W - 48) / stats.length;
  stats.forEach(([label, val], i) => {
    const x = 24 + i * colW;
    ctx.font = '400 11px "Trebuchet MS",sans-serif';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, 300);
    ctx.font = '700 16px "Trebuchet MS",sans-serif';
    ctx.fillStyle = '#c0c0c0';
    ctx.fillText(val, x, 322);
  });

  const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  ctx.font = '400 11px "Trebuchet MS",sans-serif';
  ctx.fillStyle = '#333';
  ctx.textAlign = 'left';
  ctx.fillText(now, 24, H - 18);
  ctx.textAlign = 'right';
  ctx.fillText('bet all the time · bet with style', W - 24, H - 18);

  const modal = document.getElementById('tp-share-modal');
  if (modal) modal.style.display = 'flex';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function tpCloseShareModal() {
  const m = document.getElementById('tp-share-modal');
  if (m) m.style.display = 'none';
}

function tpDownloadShare() {
  const canvas = document.getElementById('tp-share-canvas');
  const a = document.createElement('a');
  a.download = 'batt-pnl-' + (Date.now()) + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

async function tpCopyShare() {
  const canvas = document.getElementById('tp-share-canvas');
  const btn = document.getElementById('tp-share-copy-btn');
  try {
    canvas.toBlob(async blob => {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      if (btn) { const t = btn.textContent; btn.textContent = '✓ copied!'; setTimeout(() => btn.textContent = t, 2000); }
    });
  } catch (e) {
    if (btn) { btn.textContent = 'use download instead'; setTimeout(() => btn.textContent = 'copy image', 2000); }
  }
}

function tpJumpTo(pair, exchange, marketType) {
  var changed = false;
  if (pair && pair !== TP_STATE.pair) {
    tpSelectPair(pair);
    changed = true;
  }
  if (exchange && exchange !== TP_STATE.exchange) {
    tpSelectExchange(exchange);
    changed = true;
  }
  if (marketType && marketType !== TP_STATE.marketType) {
    tpSetMarketType(marketType);
    changed = true;
  }
}

document.addEventListener('click', function(e) {
  const m = document.getElementById('tp-share-modal');
  if (m && e.target === m) tpCloseShareModal();
});
