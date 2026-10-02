/* ==========================================================================
   1. GLOBAL VARIABLES & STATE INITIALIZATION
   ========================================================================== */
let TAB = '36';
let THEME = 't-light';
let VIEW = 'sum';
let ch = null;
let GLOBAL_MODE = false;
let TOP_PANEL_COLLAPSED = false;
let IS_WIPED = false;
let lbl_w = false;
let bustMonth = null;

const DEF_BT = [0,0,0,0,0,0,0,0,0,0];
const DEF_ML = {};
const DEF_TL = {};
const DEF_FR = [0,0,0,0,0,0,0,0,0,0];
const ZERO_36_DEF = [6,11,17,22,30,35];
const TOTAL = 36;

function mkState() {
  return {
    P: 1000,
    LEV: 5,
    NOT: 2500,
    KPI: 1.0,
    BT: [...DEF_BT],
    FR: [...DEF_FR],
    WD: {},
    DEPO: {},
    ML: {},
    TL: {},
    MT: {},
    ZM: new Set([]),
    MP: {},
    LK: new Set([]),
    SPOT: false,
    CF: true,
    FEE: { maker: 0.02, taker: 0.05, funding: 0.01, interval: 8, holds: 1, method: 'taker' }
  };
}

const S = {
  '36': mkState(),
  'q':  mkState(),
};

let CUSTOM_TABS = [];
let _nextTabId = { 36: 1, q: 1 };

/* ==========================================================================
   2. PERSISTENCE & THEMES
   ========================================================================== */
function setTheme(t, btn) {
  _captureUndo();
  THEME = t;
  document.body.className = t;
  document.querySelectorAll('.th-btn').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  try { localStorage.setItem('batt_theme', t); } catch (e) {}
  if (ch) {
    if (ch._errorPulse) { clearInterval(ch._errorPulse); ch._errorPulse = null; }
    ch.destroy();
    ch = null;
  }
  const _pr = document.querySelector('.panel-right');
  const _sy = _pr ? _pr.scrollTop : 0;
  const _rc = document.getElementById('right-content');
  if (_rc) _rc.style.opacity = '.5';
  render();
  if (_pr) _pr.scrollTop = _sy;
  if (_rc) requestAnimationFrame(() => { _rc.style.opacity = '1'; });
}

function l3SetTheme(val, silent) {
  applyMemberTheme(val);
  if (!silent) savePrefSilent('ma_theme', val);
  _syncThemePills(val);
  if (typeof _syncSidebarThemePills === 'function') _syncSidebarThemePills(val);
  ['dark', 'midnight', 'light'].forEach(t => {
    var btn = document.getElementById('l3t-' + t);
    if (!btn) return;
    btn.classList.toggle('active', 'ma-' + t === val);
  });
  if (!silent) showToast('Theme changed', 'success', 1200);
}

function _syncThemePills(val) {
  document.querySelectorAll('#acc-theme-pills button').forEach(b => {
    const active = b.dataset.theme === val;
    b.style.background = active ? '#00c47a' : '#0a0a0a';
    b.style.color = active ? '#000' : '#e0e0e0';
    b.style.borderColor = active ? '#00c47a' : '#222';
  });
  const inp = document.getElementById('acc-pref-theme');
  if (inp) inp.value = val;
}

function accSetTheme(val) {
  _syncThemePills(val);
  _syncSidebarThemePills(val);
  ['dark', 'light', 'midnight', 'emerald'].forEach(t => {
    const btn = document.getElementById('l3t-' + t);
    if (!btn) return;
    btn.style.borderColor = ('ma-' + t === val) ? '#00c47a' : 'transparent';
    btn.style.transform = ('ma-' + t === val) ? 'scale(1.15)' : 'scale(1)';
  });
  applyMemberTheme(val);
  savePrefSilent('ma_theme', val);
  showToast('Theme changed', 'success', 1200);
}

function accSetLang(val) {
  document.querySelectorAll('#acc-lang-pills button').forEach(b => {
    const active = b.dataset.lang === val;
    b.style.background = active ? '#00c47a' : '#0a0a0a';
    b.style.color = active ? '#000' : '#e0e0e0';
    b.style.borderColor = active ? '#00c47a' : '#222';
  });
  const inp = document.getElementById('acc-pref-lang');
  if (inp) inp.value = val;
  if (typeof _syncSidebarLangPills === 'function') _syncSidebarLangPills(val);
  savePref('lang', val);
}

function savePrefSilent(key, value) {
  const prefs = _safeJSON(localStorage.getItem('batt_prefs'), {});
  prefs[key] = value;
  localStorage.setItem('batt_prefs', JSON.stringify(prefs));
  if (key === 'ma_theme') applyMemberTheme(value);
  if (key === 'lang' && typeof aiSetLang === 'function') aiSetLang(value);
  if (AUTH_TOKEN) {
    fetch(AUTH_URL + '/prefs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify({ prefs })
    }).catch(() => {});
  }
}

function savePref(key, value) {
  const prefs = _safeJSON(localStorage.getItem('batt_prefs'), {});
  prefs[key] = value;
  localStorage.setItem('batt_prefs', JSON.stringify(prefs));
  if (key === 'ma_theme') applyMemberTheme(value);
  if (key === 'lang' && typeof aiSetLang === 'function') aiSetLang(value);
  if (AUTH_TOKEN) {
    fetch(AUTH_URL + '/prefs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify({ prefs })
    }).catch(() => {});
  }
  showToast('Preference saved', 'success', 1500);
}

function applyMemberTheme(theme) {
  const l3 = document.getElementById('layer3');
  const acc = document.getElementById('account-page');
  const themes = ['ma-dark', 'ma-light', 'ma-midnight', 'ma-emerald'];
  themes.forEach(t => {
    if (l3) l3.classList.remove(t);
    if (acc) acc.classList.remove(t);
  });
  if (l3) l3.classList.add(theme);
  if (acc) acc.classList.add(theme);
}

/* ==========================================================================
   3. NAVIGATION & ROUTING
   ========================================================================== */
function setView(v, btn) {
  VIEW = v;
  document.getElementById('vt')?.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const tbl = document.getElementById('tbl');
  const gc = document.getElementById('guide-content');
  const fc = document.getElementById('fund-content');
  if (v === 'guide') {
    if (tbl) tbl.style.display = 'none';
    if (fc) fc.style.display = 'none';
    if (gc) { gc.style.display = ''; renderGuide(); }
    return;
  }
  if (v === 'fund') {
    if (tbl) tbl.style.display = 'none';
    if (gc) gc.style.display = 'none';
    if (fc) { fc.style.display = ''; frInit(); }
    return;
  }
  if (gc) gc.style.display = 'none';
  if (fc) fc.style.display = 'none';
  if (tbl) tbl.style.display = '';
  if (!tbl) { render(); return; }
  renderTbl(sim());
}

function goAuth() {
  document.title = 'BATT · Login';
  const l1 = document.getElementById('layer1'); if (!l1) return;
  const al = document.getElementById('auth-layer');
  l1.classList.add('out');
  setTimeout(() => {
    l1.classList.add('hidden');
    if (al) {
      al.classList.remove('hidden');
      requestAnimationFrame(() => requestAnimationFrame(() => { al.style.opacity = '1'; }));
    }
  }, 900);
}

function goLayer2() {
  const l1 = document.getElementById('layer1');
  const l2 = document.getElementById('layer2');
  try {
    if ((window.location.hash || '').replace('#', '') !== 'risk') {
      try { history.replaceState({ batt: 'risk' }, '', '#risk'); } catch (e) {}
    }
  } catch (e) {}
  document.title = 'BATT · Risk Disclosure';
  if (l1 && !l1.classList.contains('hidden')) {
    l1.classList.add('out');
    setTimeout(() => {
      l1.classList.add('hidden');
      if (l2) { l2.classList.remove('hidden'); requestAnimationFrame(() => requestAnimationFrame(() => { l2.style.opacity = '1'; })); }
    }, 900);
  } else {
    if (l2) { l2.classList.remove('hidden'); requestAnimationFrame(() => requestAnimationFrame(() => { l2.style.opacity = '1'; })); }
  }
}

function launchApp() {
  const l2 = document.getElementById('layer2'); if (!l2) return;
  const lb = l2.querySelector('.launch-btn');
  if (lb && lb.disabled) return;
  if (lb) lb.disabled = true;
  l2.style.transition = 'none';
  l2.classList.add('hidden');
  window.RISK_SHOWN = true;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'auto';
  var mn = document.getElementById('cockpit-mob-nav');
  if (mn) mn.style.display = '';
  battNav('cockpit');
  openDashboard();
}

function battNav(page) {
  var titles = {
    'member':  'BATT · Member Area',
    'cockpit': 'BATT · Cockpit',
    'trade':   'BATT · Trade Hub',
    'account': 'BATT · Account',
    'journal': 'BATT · Journal',
    'about':   'BATT · About CJ',
    'auth':    'BATT · Login',
  };
  document.title = titles[page] || 'bet all the time, bet with style';
  try {
    var hash = '#' + page;
    var cur = (window.location.hash || '').replace('#', '');
    if (cur === page) return;
    var overlayStates = ['risk', 'guide-lock'];
    _battInAppNav = true;
    if (overlayStates.indexOf(cur) !== -1) {
      history.replaceState({ batt: page }, '', hash);
    } else {
      history.pushState({ batt: page }, '', hash);
    }
    _battInAppNav = false;
  } catch (e) { _battInAppNav = false; }
}

function battRestoreFromHash() {
  var hash = (window.location.hash || '').replace('#', '');
  var ljBox = document.getElementById('lj-box');
  if (ljBox && ljBox.closest && ljBox.closest('.lj-modal-wrap')) {
    var mo = ljBox.closest('.lj-modal-wrap'); if (mo) mo.style.display = 'none';
  }
  var mn = document.getElementById('cockpit-mob-nav');
  if (mn) mn.style.display = (hash === 'cockpit') ? '' : 'none';
  if (hash === 'cockpit' && typeof openDashboard === 'function') { openDashboard(); return; }
  if (hash === 'journal' && typeof _showJournal === 'function') { _showJournal(); return; }
  if (hash === 'simulate') {
    document.body.style.overflow = 'auto';
    var tp = document.getElementById('trading-page');
    if (tp) tp.classList.add('visible');
    if (typeof tpFetchPrices === 'function') tpFetchPrices();
    if (typeof tpStartWebSocket === 'function') tpStartWebSocket();
    if (typeof tpFetchOrderBook === 'function') tpFetchOrderBook();
    if (typeof tpUpdateUI === 'function') tpUpdateUI();
    if (typeof tpRenderPositions === 'function') tpRenderPositions();
    if (typeof tpUpdateSubmitButton === 'function') tpUpdateSubmitButton();
    return;
  }
  if (hash === 'trade') {
    var hub = document.getElementById('trade-hub');
    if (hub) { hub.style.display = 'flex'; requestAnimationFrame(function() { hub.style.opacity = '1'; hub.style.transform = 'scale(1)'; }); }
    document.body.style.overflow = 'auto';
    if (typeof mbnSetActive === 'function') mbnSetActive('trade');
    return;
  }
  if (hash === 'account' && typeof loadAccountPage === 'function') {
    var ap = document.getElementById('account-page');
    if (ap) ap.classList.add('visible');
    loadAccountPage();
    document.body.style.overflow = 'auto';
    if (typeof mbnSetActive === 'function') mbnSetActive('account');
    return;
  }
  if (hash === 'about') {
    var ab = document.getElementById('about-cj-page');
    if (ab) { ab.style.display = 'block'; requestAnimationFrame(function() { ab.style.opacity = '1'; ab.classList.add('acj-visible'); }); }
    document.body.style.overflow = 'auto';
    return;
  }
  var l3 = document.getElementById('layer3');
  if (l3) { l3.classList.remove('hidden'); requestAnimationFrame(function() { l3.classList.add('visible'); }); }
  document.body.style.overflow = 'auto';
  if (typeof mbnSetActive === 'function') mbnSetActive('member');
}

window.addEventListener('popstate', function(e) {
  if (typeof ljCloseModal === 'function') ljCloseModal();
  var co = document.getElementById('confirm-overlay') || document.querySelector('.confirm-overlay');
  if (co && co.offsetParent) { if (typeof closeConfirm === 'function') closeConfirm(); history.pushState({}, '', window.location.hash || ''); return; }
  battRestoreFromHash();
});

/* ==========================================================================
   4. INTERFACE INTERACTION & SLIDERS (PANELS)
   ========================================================================== */
function togglePanel() {
  const panel = document.getElementById('left-panel');
  const btn = document.getElementById('collapse-btn');
  const toggle = document.getElementById('left-panel-toggle');
  const isCollapsed = panel.classList.contains('collapsed');
  if (isCollapsed) {
    panel.style.overflow = 'hidden';
    panel.classList.remove('collapsed');
    if (btn) btn.textContent = '‹';
    if (toggle) toggle.classList.add('expanded');
    setTimeout(() => { panel.style.overflow = ''; }, 380);
  } else {
    if (toggle) toggle.classList.remove('expanded');
    if (btn) btn.textContent = '›';
    panel.classList.add('collapsed');
  }
  setTimeout(_syncTradeToggleLeft, 10);
  [50, 150, 250, 350, 420].forEach(d => setTimeout(() => {
    if (ch) {
      if (ch._errorPulse) { clearInterval(ch._errorPulse); ch._errorPulse = null; }
      _applyChartErrorStyle();
      requestAnimationFrame(() => ch.resize());
    }
  }, d));
}

function toggleTradePanel() {
  const panel = document.getElementById('trade-panel');
  panel.classList.toggle('collapsed');
  setTimeout(_syncTradeToggleLeft, 10);
  [50, 150, 250, 350, 420].forEach(d => setTimeout(() => {
    if (ch) {
      if (ch._errorPulse) { clearInterval(ch._errorPulse); ch._errorPulse = null; }
      _applyChartErrorStyle();
      requestAnimationFrame(() => ch.resize());
    }
  }, d));
}

function togglePresetsPanel() {
  const panel = document.getElementById('panel-presets');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open');
  if (!isOpen && AUTH_TOKEN) {
    presetRenderList();
  }
}

function toggleL3Sidebar() {
  var sb = document.getElementById('l3-sb');
  if (!sb) return;
  var collapsed = sb.classList.toggle('collapsed');
  localStorage.setItem('batt_sb_collapsed', collapsed ? '1' : '0');
  var btn = document.getElementById('l3-sb-toggle');
  if (btn) btn.title = collapsed ? 'Expand' : 'Collapse';
}

function _syncTradeToggleLeft() {
  const leftPanel = document.getElementById('left-panel');
  const tradePanel = document.getElementById('trade-panel');
  const tradeToggle = document.getElementById('trade-panel-toggle');
  if (!tradeToggle) return;
  const leftOpen = leftPanel && !leftPanel.classList.contains('collapsed');
  const tradeOpen = tradePanel && !tradePanel.classList.contains('collapsed');
  const leftW = leftOpen ? 224 : 0;
  const tradeW = tradeOpen ? 224 : 0;
  tradeToggle.style.left = (leftW + tradeW) + 'px';
}

/* ==========================================================================
   5. POPUPS, TOASTS & DIALOGS
   ========================================================================== */
function showGuidePopup() {
  const p = document.getElementById('guide-popup');
  if (!p) return;
  p.style.display = '';
  p.classList.remove('visible');
  const guestBanner = document.getElementById('guest-mode-banner');
  if (guestBanner) guestBanner.style.display = 'none';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  const pr = document.querySelector('.panel-right');
  if (pr) pr.style.overflow = 'hidden';
  const app = document.querySelector('.app');
  if (app) app.style.pointerEvents = 'none';
  setTimeout(() => {
    p.classList.add('visible');
    _spotlightGuideTab();
    window.addEventListener('resize', _onPopupResize);
  }, 600);
}

function _spotlightGuideTab() {
  const attempt = () => {
    const vt = document.getElementById('vt');
    const btn = vt ? vt.querySelector('.tb') : null;
    if (!btn) { setTimeout(attempt, 150); return; }
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const r = btn.getBoundingClientRect();
    const pad = 10;
    const cx = (r.left / zoom) - pad, cy = (r.top / zoom) - pad;
    const cw = (r.width / zoom) + pad * 2, ch = (r.height / zoom) + pad * 2;
    const W = window.innerWidth / zoom, H = window.innerHeight / zoom;

    const top = document.getElementById('bl-top');
    const bot = document.getElementById('bl-bot');
    const lft = document.getElementById('bl-lft');
    const rgt = document.getElementById('bl-rgt');
    if (top) { top.style.cssText += `;left:0;top:0;width:${W}px;height:${cy}px`; }
    if (bot) { bot.style.cssText += `;left:0;top:${cy + ch}px;width:${W}px;height:${H - (cy + ch)}px`; }
    if (lft) { lft.style.cssText += `;left:0;top:${cy}px;width:${cx}px;height:${ch}px`; }
    if (rgt) { rgt.style.cssText += `;left:${cx + cw}px;top:${cy}px;width:${W - (cx + cw)}px;height:${ch}px`; }

    ['bl-top', 'bl-bot', 'bl-lft', 'bl-rgt'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'block'; requestAnimationFrame(() => el.classList.add('visible')); }
    });

    const sl = document.getElementById('guide-spotlight');
    if (sl) {
      sl.style.cssText = `display:block;left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px`;
      requestAnimationFrame(() => sl.classList.add('visible'));
    }

    requestAnimationFrame(() => {
      const popup = document.querySelector('.popup-box');
      if (!popup) return;
      const pr = popup.getBoundingClientRect();
      const sx = (pr.left / zoom) + 24, sy = (pr.bottom / zoom) - 2;
      const ex = cx + cw + 6, ey = cy + ch - 6;
      const svg = document.getElementById('popup-arrow-svg');
      if (!svg) return;
      svg.style.display = 'block';
      const c1x = sx, c1y = sy + 80;
      const c2x = ex + 60, c2y = ey - 40;
      svg.querySelector('path').setAttribute('d', `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`);
      const ang = Math.atan2(ey - c2y, ex - c2x);
      const al = 13;
      const ax1 = ex - al * Math.cos(ang - 0.4), ay1 = ey - al * Math.sin(ang - 0.4);
      const ax2 = ex - al * Math.cos(ang + 0.4), ay2 = ey - al * Math.sin(ang + 0.4);
      svg.querySelector('polygon').setAttribute('points', `${ex},${ey} ${ax1},${ay1} ${ax2},${ay2}`);
      requestAnimationFrame(() => svg.classList.add('visible'));
      const lbl = document.getElementById('find-me-label');
      const txt = document.getElementById('find-me-txt');
      const isId = typeof LANG !== 'undefined' && LANG === 'id';
      if (txt) txt.textContent = isId ? 'temukan aku di sini' : 'find me here';
      if (lbl) {
        lbl.style.display = 'flex';
        lbl.style.alignItems = 'center';
        lbl.style.gap = '0';
        lbl.style.left = (cx + cw / 2 - 60) + 'px';
        lbl.style.top = (cy - 28) + 'px';
        requestAnimationFrame(() => lbl.style.opacity = '1');
      }
    });
  };
  attempt();
}

function dismissPopup(instant) {
  const p = document.getElementById('guide-popup');
  const sl = document.getElementById('guide-spotlight');
  const svg = document.getElementById('popup-arrow-svg');
  const lbl = document.getElementById('find-me-label');
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = '';
  const pr = document.querySelector('.panel-right');
  if (pr) pr.style.overflow = '';
  const app = document.querySelector('.app');
  if (app) app.style.pointerEvents = '';
  if (window.BATT_GUEST) {
    const guestBanner = document.getElementById('guest-mode-banner');
    if (guestBanner) guestBanner.style.display = 'flex';
  }
  window.removeEventListener('resize', _onPopupResize);

  if (instant) {
    if (p) { p.classList.remove('visible'); p.style.display = 'none'; }
    if (sl) { sl.classList.remove('visible'); sl.style.display = 'none'; }
    if (svg) { svg.classList.remove('visible'); svg.style.display = 'none'; }
    if (lbl) { lbl.style.opacity = '0'; lbl.style.display = 'none'; }
    ['bl-top', 'bl-bot', 'bl-lft', 'bl-rgt'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('visible'); el.style.display = 'none'; }
    });
  } else {
    if (p) { p.classList.remove('visible'); setTimeout(() => p.style.display = 'none', 400); }
    if (sl) { sl.classList.remove('visible'); setTimeout(() => { sl.style.display = 'none'; }, 500); }
    if (svg) { svg.classList.remove('visible'); setTimeout(() => { svg.style.display = 'none'; }, 500); }
    if (lbl) { lbl.style.opacity = '0'; setTimeout(() => { lbl.style.display = 'none'; }, 500); }
    ['bl-top', 'bl-bot', 'bl-lft', 'bl-rgt'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('visible'); setTimeout(() => { el.style.display = 'none'; }, 500); }
    });
  }
}

function _onPopupResize() {
  ['bl-top', 'bl-bot', 'bl-lft', 'bl-rgt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.cssText = 'position:fixed;z-index:8880;background:rgba(0,0,0,0.52);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);display:block'; }
  });
  const sl = document.getElementById('guide-spotlight');
  if (sl) { sl.style.cssText = 'display:none'; sl.classList.remove('visible'); }
  const svg = document.getElementById('popup-arrow-svg');
  if (svg) { svg.style.display = 'none'; svg.classList.remove('visible'); }
  const lbl = document.getElementById('find-me-label');
  if (lbl) { lbl.style.opacity = '0'; }
  _spotlightGuideTab();
}

/* ==========================================================================
   6. SOUND EFFECTS & OTHER ENGINES
   ========================================================================== */
var SOUNDS_ENABLED = localStorage.getItem('batt_sounds') !== 'off';

function toggleSounds() {
  SOUNDS_ENABLED = !SOUNDS_ENABLED;
  localStorage.setItem('batt_sounds', SOUNDS_ENABLED ? 'on' : 'off');
  showToast(`Sounds ${SOUNDS_ENABLED ? 'enabled' : 'disabled'}`, 'success');
}

function playSound(type) {
  if (!SOUNDS_ENABLED) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  switch (type) {
    case 'success':
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      break;
    case 'error':
      osc.frequency.value = 220;
      gain.gain.value = 0.1;
      break;
    case 'click':
      osc.frequency.value = 440;
      gain.gain.value = 0.05;
      break;
  }
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
  osc.stop(ctx.currentTime + 0.1);
}

function triggerConfetti() {
  const colors = ['#00c47a', '#f0a030', '#E24B4A', '#2090e0', '#9b59b6'];
  const confettiCount = 50;
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animation = `confettiFall ${2 + Math.random() * 2}s linear forwards`;
    confetti.style.animationDelay = Math.random() * 0.5 + 's';
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 4000);
  }
}
