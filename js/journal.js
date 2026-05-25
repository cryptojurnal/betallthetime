/* ==========================================================================
   1. JOURNAL STATE & DATA INITIALIZATION
   ========================================================================== */
var JN = {
  folders: [],      
  trades: {},       
  view: 'folders',  
  folderView: 'grid', 
  activeFolder: null,
  activeTrade: null,
};

const JN_COLORS = ['#00c47a','#5b7fff','#f59e0b','#a855f7','#E24B4A','#00c4c4','#ff6b6b','#60c030'];
const JN_EMOTIONS = ['😤','😰','😐','😊','🔥'];
var _ljPairLists = { binance: null, bybit: null, okx: null };

var _LJ_COMMON_PAIRS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','MATICUSDT','SUIUSDT','APTUSDT','ARBUSDT','OPUSDT','INJUSDT','TIAUSDT','SEIUSDT','STXUSDT','WLDUSDT','RUNEUSDT','ATOMUSDT','NEARUSDT','DOTUSDT','UNIUSDT','AAVEUSDT','LTCUSDT','BCHUSDT','FILUSDT','ICPUSDT','LDOUSDT','MOODENGUSDT','PEPEUSDT','SHIBUSDT','FLOKIUSDT','BONKUSDT','WIFUSDT','NEIROUSDT','POPCATUSDT','EIGENUSDT','PENDLEUSDT','JUPUSDT','PYTHUSDT','RENDERUSDT','FETUSDT','AGIXUSDT','TAOUSDT','ENSUSDT','GMXUSDT','DYDXUSDT','MKRUSDT','COMPUSDT','CRVUSDT','SNXUSDT','1000PEPEUSDT','1000BONKUSDT','1000SHIBUSDT','NOTUSDT','TONUSDT','TRXUSDT','XLMUSDT','VETUSDT','EOSUSDT','ALGOUSDT','EGLDUSDT','FLOWUSDT','HBARUSDT','SANDUSDT','MANAUSDT','AXSUSDT','GALAUSDT','IMXUSDT','LRCUSDT','ZRXUSDT','BATUSDT','COTIUSDT','KSMUSDT','KAVAUSDT','IOTAUSDT','ONTUSDT','WAVESUSDT','QTUMUSDT','ZENUSDT','DASHUSDT','XMRUSDT','ZECUSDT','ETCUSDT','NEOUSDT','IOSTUSDT','ZILUSDT','STMXUSDT','CELOUSDT','ANKRUSDT','HNTUSDT','CKBUSDT','STPTUSDT','SFPUSDT','BAKEUSDT','HOTUSDT','CTKUSDT','ROSEUSDT','NUUSDT'].sort();

async function jnSave() {
  try {
    localStorage.setItem('batt_journal', JSON.stringify(JN));
    await saveUserDataToServer('journal', JN);
  } catch (e) {}
}

async function jnLoad() {
  try {
    const loc = localStorage.getItem('batt_journal');
    if (loc) Object.assign(JN, _safeJSON(loc, {}));
  } catch (e) {}
  
  const tok = _battToken();
  if (!tok) { if (typeof softUpdate === 'function') softUpdate(); return; }
  document.body.classList.add('jn-loading');
  try {
    const r = await fetch(AUTH_URL + '/userdata/load', { headers: { 'Authorization': 'Bearer ' + tok } });
    const d = await r.json();
    if (d.ok && d.data && d.data.journal) {
      Object.assign(JN, d.data.journal);
      localStorage.setItem('batt_journal', JSON.stringify(JN));
    }
  } catch (e) {}
  document.body.classList.remove('jn-loading');
  if (typeof render === 'function') setTimeout(render, 50);
}

function openJournal() {
  battNav('journal');
  _showJournal();
}

function _showJournal() {
  const p = document.getElementById('journal-page');
  if (!p || p.style.display === 'flex') return;
  p.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('visible')));
  document.body.style.overflow = 'auto';
  jnLoad().then(() => {
    const savedView = localStorage.getItem('batt_jn_view') || 'list';
    const savedFolder = localStorage.getItem('batt_jn_folder');
    const savedTrade = localStorage.getItem('batt_jn_trade');
    if (savedView === 'detail' && savedFolder && savedTrade && JN.trades[savedFolder]) {
      const tradeExists = JN.trades[savedFolder].find(t => t.id === savedTrade);
      if (tradeExists) { JN.activeFolder = savedFolder; JN.activeTrade = savedTrade; JN.view = 'detail'; jnRender(); return; }
    }
    if (savedView === 'list' && savedFolder && JN.folders.find(f => f.id === savedFolder)) {
      JN.activeFolder = savedFolder; JN.view = 'list'; jnRender(); return;
    }
    if (JN.folders.length > 0) {
      if (!JN.activeFolder) JN.activeFolder = JN.folders[0].id;
      JN.view = 'list';
    } else {
      JN.view = 'folders';
    }
    jnRender();
  });
}

function closeJournal() {
  const p = document.getElementById('journal-page');
  if (!p) return;
  p.classList.remove('visible');
  setTimeout(() => { p.style.display = 'none'; }, 300);
  battNav('member');
  document.body.style.overflow = 'auto';
}

function jnRender() {
  const savedView = localStorage.getItem('batt_jn_view') || 'list';
  if (JN.view === 'folders' && savedView === 'list' && JN.folders.length > 0) {
    JN.activeFolder = JN.activeFolder || JN.folders[0].id;
    JN.view = 'list';
  }
  if (JN.view === 'folders') jnRenderFolders();
  else if (JN.view === 'list') jnRenderList();
  else if (JN.view === 'stats') jnRenderStats();
  else jnRenderDetail();
  jnUpdateHeader();
}

function jnUpdateHeader() {
  const cb = document.getElementById("jn-csv-btn");
  const bc = document.getElementById('jn-breadcrumb');
  const ab = document.getElementById('jn-add-btn');
  const sb = document.getElementById("jn-stats-btn");
  if (!bc || !ab) return;

  if (JN.view === 'folders') {
    bc.innerHTML = '';
    ab.style.display = 'none';
    if (cb) cb.style.display = "none";
    ab.textContent = '+ new folder';
    ab.onclick = jnNewFolder;
  } else if (JN.view === 'list') {
    const f = JN.folders.find(x => x.id === JN.activeFolder);
    bc.innerHTML = `<span onclick="jnGoFolders()">all folders</span><span class="sep">›</span><span>${f ? f.name : ''}</span>`;
    ab.style.display = '';
    ab.textContent = '+ add trade';
    ab.onclick = jnNewTrade;
    if (sb) { sb.style.display = ""; sb.textContent = "📊 stats"; sb.onclick = jnGoStats; }
    if (cb) cb.style.display = "";
  } else if (JN.view === "stats") {
    const f = JN.folders.find(x => x.id === JN.activeFolder);
    bc.innerHTML = `<span onclick="jnGoFolders()">all folders</span><span class="sep">›</span><span onclick="jnGoList(JN.activeFolder)">${f ? f.name : ""}</span><span class="sep">›</span><span>stats</span>`;
    ab.style.display = "none";
    if (sb) { sb.style.display = ""; sb.textContent = "← trades"; sb.onclick = () => jnGoList(JN.activeFolder); }
  } else {
    if (cb) cb.style.display = "";
    const f = JN.folders.find(x => x.id === JN.activeFolder);
    bc.innerHTML = `<span onclick="jnGoFolders()">all folders</span><span class="sep">›</span><span onclick="jnGoList(JN.activeFolder)">${f ? f.name : ''}</span><span class="sep">›</span><span>trade detail</span>`;
    ab.style.display = 'none';
  }
}

/* ==========================================================================
   2. JOURNAL VIEWS (FOLDERS, LISTS, METRICS)
   ========================================================================== */
function jnFolderTypeBadge(type) {
  if (!type || type === 'mix') return '<span class="jn-folder-row-type mix">mix</span>';
  if (type === 'spot') return '<span class="jn-folder-row-type spot">spot</span>';
  return '<span class="jn-folder-row-type lev">leverage</span>';
}

function jnRenderFolders() {
  const body = document.getElementById('jn-body');
  if (!body) return;
  const tpCount = TP_STATE && TP_STATE.history ? TP_STATE.history.length : 0;
  const isGrid = JN.folderView !== 'list';
  let html = '';

  if (tpCount > 0) {
    html += `<div class="jn-import-banner">
      <span>⚡</span>
      <span>${tpCount} closed trade${tpCount > 1 ? 's' : ''} in Trade Panel — ready to import</span>
      <button onclick="jnImportFromTP()">import →</button>
    </div>`;
  }

  html += `<div style="display:flex;align-items:center;margin-bottom:12px">
    <div class="jn-sec-title" style="margin-bottom:0;flex:1">Your Folders</div>
    <div class="jn-view-toggle">
      <button class="jn-vt-btn${isGrid ? ' on' : ''}" onclick="JN.folderView='grid';jnRenderFolders()" title="grid view">⊞</button>
      <button class="jn-vt-btn${!isGrid ? ' on' : ''}" onclick="JN.folderView='list';jnRenderFolders()" title="list view">≡</button>
    </div>
  </div>`;

  if (JN.folders.length === 0) {
    html += `<div class="jn-empty">
      <div class="jn-empty-icon">📂</div>
      <div style="margin-bottom:6px;color:#888">No folders yet</div>
      <div style="font-size:10px;color:#444">Create a folder to start logging trades</div>
    </div>`;
  }

  if (isGrid) {
    html += '<div class="jn-folders">';
    JN.folders.forEach(f => {
      const trades = JN.trades[f.id] || [];
      const wins = trades.filter(t => t.pnl > 0).length;
      const wr = trades.length ? Math.round(wins / trades.length * 100) : 0;
      const totalPnl = trades.reduce((a, t) => a + (t.pnl || 0), 0);
      const pnlClass = totalPnl >= 0 ? 'up' : 'dn';
      const pnlStr = (totalPnl >= 0 ? '+' : '') + totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const lastTrade = trades.length ? new Date(trades[0].closedAt) : null;
      const lastStr = lastTrade ? `${lastTrade.getDate()}/${lastTrade.getMonth() + 1}/${lastTrade.getFullYear()}` : '—';
      const typeColor = f.type === 'spot' ? '#5b7fff' : f.type === 'lev' ? '#00c47a' : '#f59e0b';
      const typeLbl = f.type === 'spot' ? 'spot' : f.type === 'lev' ? 'leverage' : 'mix';
      html += `<div class="jn-folder" onclick="jnGoList('${f.id}')">
        <div class="jn-folder-color" style="background:${f.color || '#00c47a'}"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-left:10px;margin-bottom:4px">
          <div class="jn-folder-name" style="padding-left:0;margin-bottom:0">${escHtml(f.name)}</div>
          <span style="font-size:8px;padding:1px 6px;border-radius:3px;font-weight:700;letter-spacing:.04em;background:rgba(${f.type === 'spot' ? '91,127,255' : f.type === 'lev' ? '0,196,122' : '245,158,11'},.1);color:${typeColor};flex-shrink:0;margin-left:6px">${typeLbl}</span>
        </div>
        <div class="jn-folder-meta">
          <span>${trades.length} trade${trades.length !== 1 ? 's' : ''}</span>
          ${trades.length ? `<span>${wr}% WR</span>` : ''}
          <span style="color:#555">last: ${lastStr}</span>
        </div>
        ${trades.length ? `<div class="jn-folder-pnl ${pnlClass}">$${pnlStr}</div>` : '<div style="height:4px"></div>'}
        <div class="jn-folder-tags">${(f.tags || []).map(t => `<span class="jn-tag">${t}</span>`).join('')}</div>
        <div style="position:absolute;top:8px;right:8px;display:flex;gap:3px;opacity:0;transition:opacity .15s" class="jn-folder-acts">
          <button class="jn-btn-sm" onclick="event.stopPropagation();jnEditFolder('${f.id}')" style="padding:2px 5px;font-size:8px">✏</button>
          <button class="jn-btn-sm danger" onclick="event.stopPropagation();jnDeleteFolder('${f.id}')" style="padding:2px 5px;font-size:8px">✕</button>
        </div>
      </div>`;
    });
    html += `<div class="jn-folder jn-folder-new" onclick="jnNewFolder()">
      <span style="font-size:18px;color:#444">+</span>
      <span>new folder</span>
    </div>`;
    html += '</div>';
  } else {
    html += '<div class="jn-folders-list">';
    JN.folders.forEach(f => {
      const trades = JN.trades[f.id] || [];
      const wins = trades.filter(t => t.pnl > 0).length;
      const wr = trades.length ? Math.round(wins / trades.length * 100) : 0;
      const totalPnl = trades.reduce((a, t) => a + (t.pnl || 0), 0);
      const pnlClass = totalPnl >= 0 ? 'up' : 'dn';
      const pnlStr = (totalPnl >= 0 ? '+' : '') + totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const lastTrade = trades.length ? new Date(Math.max(...trades.map(t => t.closedAt))) : null;
      const createdAt = f.createdAt ? new Date(f.createdAt) : null;
      const lastStr = lastTrade ? `${lastTrade.getDate()}/${lastTrade.getMonth() + 1}/${lastTrade.getFullYear()}` : 'no trades';
      const createdStr = createdAt ? `${createdAt.getDate()}/${createdAt.getMonth() + 1}/${createdAt.getFullYear()}` : '';
      html += `<div class="jn-folder-row" onclick="jnGoList('${f.id}')">
        <div class="jn-folder-row-accent" style="background:${f.color || '#00c47a'}"></div>
        <div class="jn-folder-row-name">${escHtml(f.name)}</div>
        ${jnFolderTypeBadge(f.type)}
        <div class="jn-folder-row-meta">
          <span style="color:#aaa">${trades.length} trade${trades.length !== 1 ? 's' : ''}</span>
          ${trades.length ? `<span style="color:${wr >= 50 ? '#00c47a' : '#e05555'}">${wr}% WR</span>` : ''}
          <span style="color:#666">last: ${lastStr}</span>
          ${createdStr ? `<span style="color:#555">created: ${createdStr}</span>` : ''}
        </div>
        <div class="jn-folder-row-pnl ${pnlClass}">${trades.length ? '$' + pnlStr : '—'}</div>
        <div class="jn-folder-row-actions">
          <button class="jn-btn-sm" onclick="event.stopPropagation();jnEditFolder('${f.id}')" style="padding:2px 5px;font-size:8px">✏</button>
          <button class="jn-btn-sm danger" onclick="event.stopPropagation();jnDeleteFolder('${f.id}')" style="padding:2px 5px;font-size:8px">✕</button>
        </div>
      </div>`;
    });
    html += `<div class="jn-folder-row" onclick="jnNewFolder()" style="border-style:dashed;justify-content:center;gap:8px;color:#666;font-size:11px;outline:none">
      <span>+</span><span>new folder</span>
    </div>`;
    html += '</div>';
  }

  body.innerHTML = html;

  if (isGrid) {
    body.querySelectorAll('.jn-folder:not(.jn-folder-new)').forEach(card => {
      const acts = card.querySelector('.jn-folder-acts');
      if (acts) {
        card.addEventListener('mouseenter', () => acts.style.opacity = '1');
        card.addEventListener('mouseleave', () => acts.style.opacity = '0');
      }
    });
  }
}

function jnRenderList() {
  const body = document.getElementById('jn-body');
  if (!body) return;
  const f = JN.folders.find(x => x.id === JN.activeFolder);
  if (!f) { jnGoFolders(); return; }
  const allTrades = (JN.trades[JN.activeFolder] || []).slice();
  const drafts = allTrades.filter(t => t.status === 'draft').sort((a, b) => b.createdAt - a.createdAt);
  const trades = allTrades.filter(t => t.status !== 'draft').sort((a, b) => a.closedAt - b.closedAt);

  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl <= 0).length;
  const wr = trades.length ? Math.round(wins / trades.length * 100) : 0;
  const totalPnl = trades.reduce((a, t) => a + (t.pnl || 0), 0);
  const avgPnl = trades.length ? totalPnl / trades.length : 0;
  const totalFees = trades.reduce((a, t) => a + (t.fee || 0), 0);

  let html = `<div class="jn-stats-bar">
    <div class="jn-stat"><div class="jn-stat-lbl">trades</div><div class="jn-stat-val">${trades.length}</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">win rate</div><div class="jn-stat-val ${wr >= 50 ? 'up' : 'dn'}">${wr}%</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">W / L</div><div class="jn-stat-val">${wins}<span style="color:#1e1e1e;font-weight:400"> / </span>${losses}</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">total PnL</div><div class="jn-stat-val ${totalPnl >= 0 ? 'up' : 'dn'}">${totalPnl >= 0 ? '+' : ''}$${(totalPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">avg PnL</div><div class="jn-stat-val ${avgPnl >= 0 ? 'up' : 'dn'}">${avgPnl >= 0 ? '+' : ''}$${(avgPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">fees paid</div><div class="jn-stat-val" style="color:${totalFees > 0 ? '#e05555' : '#555'}">-$${(totalFees).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
  </div>`;

  if (drafts.length > 0) {
    html += `<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;background:#0d1a10;border:1px solid #00c47a22;border-radius:7px 7px 0 0">
        <span style="font-size:10px;font-weight:800;color:#00c47a">● OPEN POSITIONS</span>
        <span style="font-size:9px;color:#2a5a3a">${drafts.length} running</span>
        <span style="font-size:9px;color:#1e3a22;margin-left:auto">click to close & lock</span>
      </div>
      <div class="jn-list-wrap" style="border-radius:0 0 7px 7px;border-top:none">`;
    drafts.forEach(t => {
      const d = new Date(t.openedAt || t.createdAt);
      const ds = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      html += `<div class="jn-trade-row" onclick="ljOpenDraftToClose('${t.id}','${JN.activeFolder}')" style="border-left:2px solid #00c47a;cursor:pointer">
        <div class="jn-tc date" style="display:flex;align-items:center;gap:6px">
          <span style="font-size:8px;background:#00c47a22;color:#00c47a;border:1px solid #00c47a33;border-radius:3px;padding:1px 5px;font-weight:700">OPEN</span>${ds}
        </div>
        <div class="jn-tc pair">${t.pair || '—'}<span style="font-size:8px;color:#00c47a;background:rgba(0,196,122,0.08);border:1px solid rgba(0,196,122,0.15);border-radius:3px;padding:1px 5px;margin-left:4px;font-weight:700">⚡ cockpit</span></div>
        <div class="jn-tc"><span class="${t.side === 'long' ? 'jn-side-long' : 'jn-side-short'}">${(t.side || 'long').toUpperCase()}</span></div>
        <div class="jn-tc">$${(parseFloat(t.entry || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
        <div class="jn-tc" style="color:#333;font-size:9px">running…</div>
        <div class="jn-tc">$${parseFloat(t.size || 0).toFixed(0)}</div>
        <div class="jn-tc" style="color:#555;font-size:9px">not closed</div>
        <div class="jn-tc" style="color:#555">—</div>
        <div class="jn-tc">${t.emotion || '—'}</div>
        <div><button class="jn-btn-sm danger" onclick="event.stopPropagation();jnDeleteTrade('${t.id}')" style="padding:2px 5px;font-size:8px">✕</button></div>
      </div>`;
    });
    html += `</div></div>`;
  }

  if (trades.length === 0 && drafts.length === 0) {
    html += `<div class="jn-empty">
      <div class="jn-empty-icon">📝</div>
      <div style="margin-bottom:8px">No trades yet</div>
      <div style="font-size:10px;color:#222">Lock a trade from the cockpit or save an open position</div>
    </div>`;
  } else if (trades.length > 0) {
    const buckets = {};
    trades.forEach(t => { const b = t.bucket || 1; if (!buckets[b]) buckets[b] = []; buckets[b].push(t); });
    const bucketNums = Object.keys(buckets).map(Number).sort((a, b) => a - b);
    let tradeNum = 0;
    bucketNums.forEach(bn => {
      const bTrades = buckets[bn];
      const bWins = bTrades.filter(t => t.pnl > 0).length;
      const bPnl = bTrades.reduce((a, t) => a + (t.pnl || 0), 0);
      const bWr = bTrades.length ? Math.round(bWins / bTrades.length * 100) : 0;
      const firstCockpit = bTrades.find(t => t.cockpit);
      const monthLbl = firstCockpit
        ? (firstCockpit.cockpit.monthLabel || gs().ML[firstCockpit.cockpit.month] || ('M' + String(firstCockpit.cockpit.month).padStart(2, '0')))
        : ('batch ' + bn);
      html += `<div style="display:flex;align-items:center;gap:10px;padding:7px 14px;background:#111;border:1px solid #1e1e1e;border-radius:7px 7px 0 0;margin-top:${bn > bucketNums[0] ? '16px' : '0'}">
        <span style="font-size:11px;font-weight:800;color:#ccc">${escHtml(monthLbl)}</span>
        <span style="font-size:9px;color:#555">${bTrades.length} trade${bTrades.length !== 1 ? 's' : ''}</span>
        <span style="font-size:9px;font-weight:700;color:${bWr >= 50 ? '#00c47a' : '#e05555'}">${bWr}% WR</span>
        <span style="font-size:9px;font-weight:700;color:${bPnl >= 0 ? '#00c47a' : '#e05555'};margin-left:auto">${bPnl >= 0 ? '+' : ''}$${(bPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="jn-list-wrap" style="border-radius:0 0 7px 7px;border-top:none">`;
      bTrades.forEach(t => {
        tradeNum++;
        const d = new Date(t.closedAt);
        const ds = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const pCls = t.pnl >= 0 ? 'win' : 'loss';
        const pnlStr = (t.pnl >= 0 ? '+' : '') + parseFloat(t.pnl || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const pctStr = (t.pct >= 0 ? '+' : '') + parseFloat(t.pct || 0).toFixed(1) + '%';
        const isCockpit = t.source === 'cockpit' && t.cockpit;
        const cockpitTag = isCockpit ? `<span style="font-size:8px;color:#00c47a;background:rgba(0,196,122,0.08);border:1px solid rgba(0,196,122,0.15);border-radius:3px;padding:1px 5px;margin-left:4px;font-weight:700">⚡ cockpit</span>` : `<span style="font-size:8px;color:#2a2a2a;border:1px solid #1e1e1e;border-radius:3px;padding:1px 5px;margin-left:4px">manual</span>`;
        html += `<div class="jn-trade-row" onclick="jnOpenTrade('${t.id}')">
          <div class="jn-tc date" style="display:flex;align-items:center;gap:6px"><span style="font-size:9px;color:#2a2a2a;font-weight:700;min-width:16px">${tradeNum}.</span>${ds}</div>
          <div class="jn-tc pair">${t.pair || '—'}${cockpitTag}</div>
          <div class="jn-tc"><span class="${t.side === 'long' ? 'jn-side-long' : 'jn-side-short'}">${(t.side || 'long').toUpperCase()}</span></div>
          <div class="jn-tc">$${(parseFloat(t.entry || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="jn-tc">$${(parseFloat(t.exit || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="jn-tc">$${parseFloat(t.size || 0).toFixed(0)}</div>
          <div class="jn-tc ${pCls}">$${pnlStr}</div>
          <div class="jn-tc ${pCls}">${pctStr}</div>
          <div class="jn-tc jn-emotion">${t.emotion || '—'}</div>
          <div><button class="jn-btn-sm danger" onclick="event.stopPropagation();jnDeleteTrade('${t.id}')" style="padding:2px 5px;font-size:8px">✕</button></div>
        </div>`;
      });
      html += '</div>';
    });
  }
  body.innerHTML = html;
}

function jnRenderStats() {
  const body = document.getElementById("jn-body");
  if (!body) return;
  const trades = (JN.trades[JN.activeFolder] || []).filter(t => t.status !== "draft");
  if (!trades.length) { body.innerHTML = `<div class="jn-empty"><div class="jn-empty-icon">📊</div><div>No trades to analyze yet</div></div>`; return; }
  const sorted = trades.slice().sort((a, b) => a.closedAt - b.closedAt);

  const wins = sorted.filter(t => t.pnl > 0);
  const losses = sorted.filter(t => t.pnl <= 0);
  const wr = Math.round(wins.length / sorted.length * 100);
  const totalPnl = sorted.reduce((a, t) => a + (t.pnl || 0), 0);
  const totalFees = sorted.reduce((a, t) => a + (t.fee || 0), 0);
  const totalFunding = sorted.reduce((a, t) => a + (t.funding || 0), 0);
  const avgWin = wins.length ? wins.reduce((a, t) => a + (t.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + (t.pnl || 0), 0) / losses.length : 0;
  const rr = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
  const bestTrade = sorted.reduce((a, t) => (t.pnl || 0) > (a.pnl || 0) ? t : a, sorted[0]);
  const worstTrade = sorted.reduce((a, t) => (t.pnl || 0) < (a.pnl || 0) ? t : a, sorted[0]);

  let maxWS = 0, maxLS = 0, curWS = 0, curLS = 0;
  sorted.forEach(t => { if (t.pnl > 0) { curWS++; curLS = 0; maxWS = Math.max(maxWS, curWS); } else { curLS++; curWS = 0; maxLS = Math.max(maxLS, curLS); } });

  const holds = sorted.filter(t => t.openedAt && t.closedAt && t.closedAt > t.openedAt);
  const avgHoldMs = holds.length ? holds.reduce((a, t) => a + (t.closedAt - t.openedAt), 0) / holds.length : 0;
  const avgHoldH = Math.round(avgHoldMs / 3600000 * 10) / 10;

  const buckets = {};
  sorted.forEach(t => {
    const b = t.bucket || 1; if (!buckets[b]) buckets[b] = { pnl: 0, wins: 0, total: 0, label: "" };
    const mc = t.cockpit ? t.cockpit.monthLabel : ("M" + String(b).padStart(2, "0"));
    buckets[b].label = mc; buckets[b].pnl += (t.pnl || 0); buckets[b].total++; if (t.pnl > 0) buckets[b].wins++;
  });
  const bKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  const bVals = bKeys.map(k => buckets[k]);
  const maxAbsPnl = Math.max(...bVals.map(b => Math.abs(b.pnl)), 1);

  const longs = sorted.filter(t => t.side === "long");
  const shorts = sorted.filter(t => t.side === "short");
  const longPnl = longs.reduce((a, t) => a + (t.pnl || 0), 0);
  const shortPnl = shorts.reduce((a, t) => a + (t.pnl || 0), 0);
  const fmtM = v => (v >= 0 ? "+$" : "-$") + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const bw = Math.max(18, Math.min(40, Math.floor(520 / Math.max(bVals.length, 1)) - 6));
  const barsW = bVals.length * (bw + 6);
  const barsSvg = bVals.length ? `<svg viewBox="0 0 ${Math.max(barsW, 200)} 120" preserveAspectRatio="xMinYMid meet" style="width:100%;max-height:120px">
    ${bVals.map((b, i) => {
      const h = Math.round(Math.abs(b.pnl) / maxAbsPnl * 80);
      const x = i * (bw + 6);
      const isPos = b.pnl >= 0;
      const y = isPos ? (95 - h) : 95;
      const col = isPos ? "#00c47a" : "#e05555";
      return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 2)}" fill="${col}" rx="2" opacity="0.85"/>
        <text x="${x + bw / 2}" y="115" text-anchor="middle" font-size="7" fill="#444" font-family="Trebuchet MS,sans-serif">${b.label || ("M" + i)}</text>
        <text x="${x + bw / 2}" y="${isPos ? y - 3 : y + h + 9}" text-anchor="middle" font-size="7" fill="${col}" font-family="Trebuchet MS,sans-serif">${b.pnl >= 0 ? "+" : ""}${b.pnl.toFixed(0)}</text>`;
    }).join("")}
    <line x1="0" y1="95" x2="${Math.max(barsW, 200)}" y2="95" stroke="#222" stroke-width="0.5"/>
  </svg>` : "";

  body.innerHTML = `
  <div style="padding:20px;max-width:860px;margin:0 auto">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      ${[
        ["win rate", wr + "%", wr >= 50 ? "#00c47a" : "#e05555"],
        ["trades", sorted.length, "#ccc"],
        ["W / L", wins.length + " / " + losses.length, "#ccc"],
        ["total PnL", fmtM(totalPnl), totalPnl >= 0 ? "#00c47a" : "#e05555"],
        ["avg RR", (rr).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "×", rr >= 1 ? "#00c47a" : "#e05555"],
        ["avg win", fmtM(avgWin), "#00c47a"],
        ["avg loss", fmtM(avgLoss), "#e05555"],
        ["best trade", fmtM(bestTrade.pnl || 0), "#00c47a"],
        ["worst trade", fmtM(worstTrade.pnl || 0), "#e05555"],
        ["win streak", maxWS + "×", "#ccc"],
        ["loss streak", maxLS + "×", "#ccc"],
        ["avg hold", avgHoldH + "h", "#ccc"],
        ["fees drag", "-$" + totalFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "#e05555"],
        ["funding", totalFunding >= 0 ? "-$" + totalFunding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "+$" + Math.abs(totalFunding).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), totalFunding >= 0 ? "#e05555" : "#00c47a"],
      ].map(([lbl, val, col]) => `<div style="background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:12px 14px">
        <div style="font-size:8px;color:#444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">${lbl}</div>
        <div style="font-size:15px;font-weight:800;color:${col}">${val}</div>
      </div>`).join("")}
    </div>
    <div style="background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;font-weight:700">PnL by month</div>
      <div style="overflow-x:auto">${barsSvg}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:14px">
        <div style="font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;font-weight:700">long vs short</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:#00c47a;font-weight:700">▲ LONG</span>
            <span style="font-size:10px;color:#555">${longs.length} trades</span>
            <span style="font-size:11px;font-weight:800;color:${longPnl >= 0 ? "#00c47a" : "#e05555"}">${fmtM(longPnl)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:#e05555;font-weight:700">▼ SHORT</span>
            <span style="font-size:10px;color:#555">${shorts.length} trades</span>
            <span style="font-size:11px;font-weight:800;color:${shortPnl >= 0 ? "#00c47a" : "#e05555"}">${fmtM(shortPnl)}</span>
          </div>
        </div>
      </div>
      <div style="background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:14px">
        <div style="font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;font-weight:700">best & worst</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:#555">🏆 best</span>
            <span style="font-size:10px;color:#555">${bestTrade.pair || "—"}</span>
            <span style="font-size:11px;font-weight:800;color:#00c47a">${fmtM(bestTrade.pnl || 0)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:#555">💀 worst</span>
            <span style="font-size:10px;color:#555">${worstTrade.pair || "—"}</span>
            <span style="font-size:11px;font-weight:800;color:#e05555">${fmtM(worstTrade.pnl || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function jnRenderDetail() {
  const body = document.getElementById('jn-body');
  if (!body) return;
  const trades = JN.trades[JN.activeFolder] || [];
  const t = trades.find(x => x.id === JN.activeTrade);
  if (!t) { jnGoList(JN.activeFolder); return; }
  const pc = t.pnl >= 0 ? 'up' : 'dn';
  const pcColor = t.pnl >= 0 ? '#00c47a' : '#e05555';
  const d = new Date(t.closedAt);
  const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const holdMs = t.openedAt && t.closedAt ? (t.closedAt - t.openedAt) : 0;
  const holdH = Math.floor(holdMs / 3600000);
  const holdMin = Math.floor((holdMs % 3600000) / 60000);
  const holdD = Math.floor(holdH / 24);
  const holdHr = holdH % 24;
  const holdStr = holdMs > 0 ? (holdD > 0 ? `${holdD}d ${holdHr}h ${holdMin}m` : holdH > 0 ? `${holdH}h ${holdMin}m` : `${holdMin}m`) : '—';
  const fundIntervals = holdMs > 0 ? Math.floor(holdH / 8) : 0;
  const entry = parseFloat(t.entry || 0);
  const exit = parseFloat(t.exit || 0);
  const notional = parseFloat(t.size || 0);
  const lev = parseFloat(t.leverage || 1);
  const margin = lev > 1 ? notional / lev : notional;

  const rawMovePct = entry > 0 ? ((exit - entry) / entry * 100) : 0;
  const directedMovePct = t.side === 'long' ? rawMovePct : -rawMovePct;

  const ck = t.cockpit || null;
  const projTargetPct = ck ? (ck.target || 0) : 0;
  const actualMarginPct = parseFloat(t.pct || 0);
  const vsTarget = ck ? ((directedMovePct * lev) - projTargetPct) : null;
  const vsTargetColor = vsTarget === null ? '#555' : vsTarget >= 0 ? '#00c47a' : '#e05555';

  let outcomeLabel = '';
  let outcomeColor = '#555';
  if (ck && entry > 0) {
    if (t.pnl >= 0 && directedMovePct > 0) {
      outcomeLabel = directedMovePct * lev >= projTargetPct ? '✓ target hit' : '✓ win · below target';
      outcomeColor = '#00c47a';
    } else {
      outcomeLabel = '✕ loss';
      outcomeColor = '#e05555';
    }
  }

  let tvHtml = '';
  const hasOpen = t.tvUrlOpen && t.tvUrlOpen.includes('tradingview.com/x/');
  const hasClose = t.tvUrlClose && t.tvUrlClose.includes('tradingview.com/x/');
  const hasLegacy = !hasOpen && !hasClose && t.tvUrl && t.tvUrl.includes('tradingview.com');
  if (hasOpen || hasClose || hasLegacy) {
    if (hasLegacy) {
      tvHtml = `<div style="margin-bottom:16px">
        <div class="jn-sec-title" style="margin-bottom:8px">chart proof <a href="${escHtml(t.tvUrl)}" target="_blank" style="color:#5b7fff;font-size:9px;font-weight:600;text-transform:none;letter-spacing:0;margin-left:6px">open ↗</a></div>
        <img src="${escHtml(t.tvUrl)}" style="width:100%;border-radius:8px;border:1px solid #1e1e1e;display:block" alt="chart" onerror="this.style.display='none'">
      </div>`;
    } else {
      const openHtml = hasOpen ? `
        <div>
          <div style="font-size:8px;color:#2a2a2a;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em">proof open <a href="${escHtml(t.tvUrlOpen)}" target="_blank" style="color:#5b7fff;font-size:8px;font-weight:600;text-transform:none;letter-spacing:0;margin-left:4px">↗</a></div>
          <img src="${escHtml(t.tvUrlOpen)}" style="width:100%;border-radius:7px;border:1px solid #1e1e1e;display:block" alt="open chart" onerror="this.style.display='none'">
        </div>` : '<div style="display:flex;align-items:center;justify-content:center;height:80px;border:1px solid #1a1a1a;border-radius:7px;color:#2a2a2a;font-size:10px">no open proof</div>';
      const closeHtml = hasClose ? `
        <div>
          <div style="font-size:8px;color:#2a2a2a;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em">proof close <a href="${escHtml(t.tvUrlClose)}" target="_blank" style="color:#5b7fff;font-size:8px;font-weight:600;text-transform:none;letter-spacing:0;margin-left:4px">↗</a></div>
          <img src="${escHtml(t.tvUrlClose)}" style="width:100%;border-radius:7px;border:1px solid #1e1e1e;display:block" alt="close chart" onerror="this.style.display='none'">
        </div>` : '<div style="display:flex;align-items:center;justify-content:center;height:80px;border:1px solid #1a1a1a;border-radius:7px;color:#2a2a2a;font-size:10px">no close proof</div>';
      tvHtml = `<div style="margin-bottom:16px">
        <div class="jn-sec-title" style="margin-bottom:10px">chart proof</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${openHtml}
          ${closeHtml}
        </div>
      </div>`;
    }
  }

  let cockpitHtml = '';
  if (ck) {
    const projPnl = ck.netPnl || 0;
    const actualPnl = t.pnl || 0;
    const diffPnl = actualPnl - projPnl;
    const diffColor = diffPnl >= 0 ? '#00c47a' : '#e05555';
    const diffSign = diffPnl >= 0 ? '+' : '';

    cockpitHtml = `<div style="margin-bottom:20px">
      <div class="jn-sec-title" style="margin-bottom:10px">cockpit projection vs actual</div>
      <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:8px;overflow:hidden">
        <div style="display:grid;grid-template-columns:140px 1fr 1fr 1fr;border-bottom:1px solid #1a1a1a">
          <div style="padding:7px 12px;font-size:8px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700"></div>
          <div style="padding:7px 12px;font-size:8px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700;border-left:1px solid #1a1a1a">projected</div>
          <div style="padding:7px 12px;font-size:8px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700;border-left:1px solid #1a1a1a">actual</div>
          <div style="padding:7px 12px;font-size:8px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700;border-left:1px solid #1a1a1a">diff</div>
        </div>
        <div style="display:grid;grid-template-columns:140px 1fr 1fr 1fr;border-bottom:1px solid #141414">
          <div style="padding:9px 12px;font-size:9px;color:#444;font-weight:600">target % (levered)</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:#00c47a;border-left:1px solid #141414">${(projTargetPct).toLocaleString('en-US', { minimumFractionDigits: 2 })}%</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${(directedMovePct * lev) >= 0 ? '#00c47a' : '#e05555'};border-left:1px solid #141414">${(directedMovePct * lev) >= 0 ? '+' : ''}${((directedMovePct * lev)).toLocaleString('en-US', { minimumFractionDigits: 2 })}%</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${vsTargetColor};border-left:1px solid #141414">${vsTarget !== null ? (vsTarget >= 0 ? '+' : '') + vsTarget.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%' : '—'}</div>
        </div>
        <div style="display:grid;grid-template-columns:140px 1fr 1fr 1fr;border-bottom:1px solid #141414">
          <div style="padding:9px 12px;font-size:9px;color:#444;font-weight:600">net PnL</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${projPnl >= 0 ? '#00c47a' : '#e05555'};border-left:1px solid #141414">${projPnl >= 0 ? '+' : ''}$${(projPnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${actualPnl >= 0 ? '#00c47a' : '#e05555'};border-left:1px solid #141414">${actualPnl >= 0 ? '+' : ''}$${(actualPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${diffColor};border-left:1px solid #141414">${diffSign}$${(diffPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
        </div>
        <div style="display:grid;grid-template-columns:140px 1fr 1fr 1fr">
          <div style="padding:9px 12px;font-size:9px;color:#444;font-weight:600">margin used</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:#666;border-left:1px solid #141414">$${((notional / (ck.lev || 1))).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:#888;border-left:1px solid #141414">$${(margin).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div style="padding:9px 12px;font-size:10px;font-weight:600;color:#333;border-left:1px solid #141414">same</div>
        </div>
      </div>
    </div>`;
  }

  body.innerHTML = `
    <div class="jn-detail">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
        <div style="font-size:22px;font-weight:800;color:#e8e8e8;letter-spacing:-.02em">${escHtml(t.pair || '—')}</div>
        <span class="${t.side === 'long' ? 'jn-side-long' : 'jn-side-short'}" style="font-size:9px;padding:3px 9px">${(t.side || '').toUpperCase()}</span>
        ${t.leverage > 1 ? `<span style="font-size:9px;color:#888;background:#1a1a1a;padding:2px 8px;border-radius:3px;border:1px solid #222;font-weight:700">${t.leverage}×</span>` : ''}
        ${t.tf ? `<span style="font-size:9px;color:#5b7fff;background:rgba(91,127,255,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(91,127,255,0.2);font-weight:700">${t.tf}</span>` : ''}
        ${t.exitType ? `<span style="font-size:9px;color:#EF9F27;background:rgba(239,159,39,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(239,159,39,0.2);font-weight:700">${t.exitType}</span>` : ''}
        ${t.setupType ? `<span style="font-size:9px;color:#a855f7;background:rgba(168,85,247,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(168,85,247,0.2);font-weight:700">${t.setupType}</span>` : ''}
        ${t.sl ? `<span style="font-size:9px;color:#e05555;background:rgba(224,85,85,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(224,85,85,0.2);font-weight:700">SL $${parseFloat(t.sl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>` : ''}
        ${t.rr ? `<span style="font-size:9px;color:#5b7fff;background:rgba(91,127,255,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(91,127,255,0.2);font-weight:700">RR ${t.rr}</span>` : ''}
        ${t.emotion ? `<span style="font-size:18px">${t.emotion}</span>` : ''}
        <span style="font-size:9px;color:#2a2a2a;margin-left:auto">${dateStr}</span>
      </div>

      ${(() => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const closeD = new Date(t.closedAt);
        const openD = t.openedAt ? new Date(t.openedAt) : null;
        const fmtDt = dt => `${dt.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()]} ${dt.getFullYear()} · ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        const closeH = closeD.getUTCHours();
        const session = closeH < 8 ? 'Asia session' : closeH < 16 ? 'London session' : 'NY session';
        return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;padding:10px 14px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px">
          <div>
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">opened</div>
            <div style="font-size:10px;font-weight:600;color:#888">${openD ? fmtDt(openD) : '—'}</div>
            ${openD ? `<div style="font-size:8px;color:#333;margin-top:1px">${days[openD.getDay()]}</div>` : ''}
          </div>
          <div>
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">closed</div>
            <div style="font-size:10px;font-weight:600;color:#888">${fmtDt(closeD)}</div>
            <div style="font-size:8px;color:#333;margin-top:1px">${days[closeD.getDay()]} · ${session}</div>
          </div>
          <div>
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">held</div>
            <div style="font-size:14px;font-weight:700;color:#aaa">${holdStr}</div>
            <div style="font-size:8px;color:#333;margin-top:1px">${fundIntervals > 0 ? '~' + fundIntervals + ' funding interval' + (fundIntervals !== 1 ? 's' : '') : 'no intervals'}</div>
          </div>
        </div>`;
      })()}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:#0a0a0a;border:1px solid ${pcColor}22;border-radius:8px;padding:16px">
          <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">net PnL · all-in</div>
          <div style="font-size:26px;font-weight:900;color:${pcColor};letter-spacing:-.02em;line-height:1">${t.pnl >= 0 ? '+' : ''}$${(parseFloat(t.pnl || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
          <div style="font-size:12px;color:${pcColor};opacity:.6;margin-top:6px">${actualMarginPct >= 0 ? '+' : ''}${actualMarginPct.toLocaleString('en-US', { minimumFractionDigits: 2 })}% on margin</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">entry</div>
            <div style="font-size:11px;font-weight:700;color:#ccc">$${entry.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
          </div>
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">exit</div>
            <div style="font-size:11px;font-weight:700;color:#ccc">$${exit.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
          </div>
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">notional</div>
            <div style="font-size:11px;font-weight:700;color:#888">$${notional.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">margin</div>
            <div style="font-size:11px;font-weight:700;color:#888">$${margin.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:16px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden">
        <div style="padding:7px 14px;border-bottom:1px solid #141414;font-size:7px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700">cost breakdown</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr)">
          <div style="padding:12px 14px;border-right:1px solid #141414">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">gross PnL</div>
            ${(() => { const g = entry > 0 ? (t.side === 'long' ? exit - entry : entry - exit) / entry * notional : 0; return `<div style="font-size:12px;font-weight:700;color:${g >= 0 ? '#00c47a' : '#e05555'}">${g >= 0 ? '+' : ''}$${Math.abs(g).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>`; })()}
          </div>
          <div style="padding:12px 14px;border-right:1px solid #141414">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">fee paid</div>
            <div style="font-size:12px;font-weight:700;color:#e05555">-$${(parseFloat(t.fee || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
            <div style="font-size:8px;color:#2a2a2a;margin-top:2px">open + close</div>
          </div>
          <div style="padding:12px 14px;border-right:1px solid #141414">
            ${(() => {
              const fn = parseFloat(t.funding || 0);
              if (fn < 0) return `<div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">funding</div><div style="font-size:12px;font-weight:700;color:#00c47a">+$${(Math.abs(fn)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div><div style="font-size:8px;color:#2a5a3a;margin-top:2px">received ✓</div>`;
              if (fn > 0) return `<div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">funding paid</div><div style="font-size:12px;font-weight:700;color:#e05555">-$${(fn).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div><div style="font-size:8px;color:#2a2a2a;margin-top:2px">${fundIntervals} intervals</div>`;
              return `<div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">funding</div><div style="font-size:12px;font-weight:700;color:#222">$0.0000</div><div style="font-size:8px;color:#2a2a2a;margin-top:2px">none</div>`;
            })()}
          </div>
          <div style="padding:12px 14px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">total cost</div>
            <div style="font-size:12px;font-weight:700;color:#e05555">-$${(parseFloat(t.fee || 0) + Math.max(0, (parseFloat(t.funding || 0)))).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
            <div style="font-size:8px;color:#2a2a2a;margin-top:2px">fee + funding</div>
          </div>
        </div>
      </div>

      ${entry > 0 && exit > 0 ? `<div style="margin-bottom:16px">
        <div class="jn-sec-title" style="margin-bottom:10px">price move analysis</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden">
          <div class="jn-detail-field">
            <div class="jn-detail-lbl">raw move</div>
            <div class="jn-detail-val" style="color:${rawMovePct >= 0 ? '#00c47a' : '#e05555'};font-weight:800">${rawMovePct >= 0 ? '+' : ''}${rawMovePct.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%</div>
            <div style="font-size:8px;color:#333;margin-top:2px">${exit > entry ? '↑ price up' : '↓ price down'}</div>
          </div>
          <div class="jn-detail-field">
            <div class="jn-detail-lbl">directed (${t.side})</div>
            <div class="jn-detail-val" style="color:${directedMovePct >= 0 ? '#00c47a' : '#e05555'};font-weight:800">${directedMovePct >= 0 ? '+' : ''}${directedMovePct.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%</div>
            <div style="font-size:8px;color:#333;margin-top:2px">${directedMovePct >= 0 ? 'with you' : 'against you'}</div>
          </div>
          <div class="jn-detail-field">
            <div class="jn-detail-lbl">levered (${lev}×)</div>
            <div class="jn-detail-val" style="color:${directedMovePct * lev >= 0 ? '#00c47a' : '#e05555'};font-weight:800">${(directedMovePct * lev) >= 0 ? '+' : ''}${(directedMovePct * lev).toFixed(3)}%</div>
            <div style="font-size:8px;color:#333;margin-top:2px">price × lev</div>
          </div>
          <div class="jn-detail-field">
            <div class="jn-detail-lbl">needed for target</div>
            <div class="jn-detail-val" style="color:${ck && projTargetPct > 0 ? '#555' : '#222'}">${ck && projTargetPct > 0 ? ((projTargetPct / lev)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%' : '—'}</div>
            <div style="font-size:8px;color:#333;margin-top:2px">${ck && projTargetPct > 0 ? 'raw price needed' : 'no projection'}</div>
          </div>
        </div>
      </div>` : ''}

      ${tvHtml}
      ${cockpitHtml}

      <div style="margin-bottom:12px">
        <div class="jn-sec-title" style="margin-bottom:8px">technical notes</div>
        ${(() => {
          const logs = t.noteLog || (t.note ? [{ ts: t.closedAt || Date.now(), text: t.note }] : []);
          const fmtTs = ts => { const d = new Date(ts); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
          return logs.length
            ? logs.map(e => `<div style="padding:8px 12px;border-left:2px solid #1e1e1e;margin-bottom:6px;background:#0a0a0a;border-radius:0 6px 6px 0">
                <div style="font-size:8px;color:#2a2a2a;margin-bottom:3px">${fmtTs(e.ts)}</div>
                <div style="font-size:11px;color:#aaa;line-height:1.6">${escHtml(e.text)}</div>
              </div>`).join('')
            : '<div style="font-size:10px;color:#2a2a2a;padding:8px 0">no notes yet</div>';
        })()}
        <div style="margin-top:8px;display:flex;gap:6px;align-items:flex-start">
          <textarea id="jn-note-append" rows="2" placeholder="Add a note…" style="flex:1;background:#111;border:1px solid #252525;border-radius:7px;color:#aaa;font-size:11px;padding:8px 12px;font-family:inherit;outline:none;resize:none;line-height:1.6;box-sizing:border-box;transition:border-color .15s" onfocus="this.style.borderColor='#444'" onblur="this.style.borderColor='#252525'"></textarea>
          <button onclick="const v=document.getElementById('jn-note-append').value;jnAppendNote('${t.id}',v)" style="background:#111;border:1px solid #252525;border-radius:7px;color:#555;font-size:10px;padding:8px 12px;cursor:pointer;font-family:inherit;outline:none;white-space:nowrap;transition:all .15s;flex-shrink:0" onmouseover="this.style.borderColor='#444';this.style.color='#aaa'" onmouseout="this.style.borderColor='#252525';this.style.color='#555'">+ add</button>
        </div>
      </div>

      ${t.notePsych ? `<div style="margin-bottom:12px">
        <div class="jn-sec-title" style="margin-bottom:8px">psychological notes</div>
        <div style="padding:10px 14px;background:#0a0a0a;border:1px solid #1e1e1e;border-left:2px solid #5b7fff;border-radius:0 6px 6px 0">
          <div style="font-size:11px;color:#aaa;line-height:1.6">${escHtml(t.notePsych)}</div>
        </div>
      </div>` : ''}

      <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <div style="font-size:8px;color:#333;text-transform:uppercase;letter-spacing:.07em;font-weight:700">mood</div>
        ${t.emotion
          ? `<span style="font-size:22px">${t.emotion}</span>
            <span style="font-size:10px;color:#333">${{ '😤': 'frustrated', '😰': 'anxious', '😐': 'neutral', '😊': 'confident', '🔥': 'on fire' }[t.emotion] || ''}</span>
            <span style="font-size:8px;color:#1e1e1e;margin-left:4px">permanent</span>`
          : `<div style="display:flex;gap:4px">
              ${JN_EMOTIONS.map(e => `<button onclick="jnSetEmotion('${t.id}','${e}')" title="${{ '😤': 'frustrated', '😰': 'anxious', '😐': 'neutral', '😊': 'confident', '🔥': 'on fire' }[e] || e}" style="font-size:20px;background:none;border:1.5px solid #1a1a1a;border-radius:6px;padding:4px 8px;cursor:pointer;outline:none;transition:all .12s;opacity:.5" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.5'">${e}</button>`).join('')}
            </div>
            <span style="font-size:9px;color:#2a2a2a">pick once · cannot change`}
      </div>

      <div style="display:flex;gap:8px">
        <button class="jn-btn-sm danger" onclick="jnDeleteTrade('${t.id}')">delete trade</button>
        ${t.tvUrl ? `<a href="${escHtml(t.tvUrl)}" target="_blank" class="jn-btn-sm" style="text-decoration:none">open chart ↗</a>` : ''}
      </div>
    </div>`;
}

/* ==========================================================================
   3. INLINE JOURNAL CONFIGURATOR (SLOT LOCKS & DRAFTS)
   ========================================================================== */
function toggleLock(m, tno) {
  _captureUndo();
  const s = gs();
  if (!s.LK) s.LK = new Set();
  const key = m + '-' + tno;

  if (s.LK.has(key)) {
    const _tl = getTL(m, tno) || ('T' + tno);
    showToast(`🔒 ${_tl} · M${String(m).padStart(2, '0')} T${tno} is locked — view in journal`, 'info', 3000);
    return;
  }

  const existingDraft = ljFindDraft(m, tno);
  if (existingDraft) {
    ljShowLockModal(m, tno, existingDraft.trade);
    return;
  }

  if (tno > 1) {
    const mBT = GLOBAL_MODE ? s.BT : (s.MT[m] ? s.MT[m].bt : s.BT);
    for (let i = 0; i < tno - 1; i++) {
      if (mBT[i] === 0) continue;
      const prevKey = m + '-' + (i + 1);
      const prevLocked = s.LK.has(prevKey);
      const prevDraft = ljFindDraft(m, i + 1);
      if (prevDraft) {
        const prevLabel = getTL(m, i + 1) || ('T' + (i + 1));
        showToast(`⚠ Close T${i + 1} (${prevLabel}) first — you have a running open position`, 'info', 3500);
        return;
      }
      if (!prevLocked) {
        const prevLabel = getTL(m, i + 1) || ('T' + (i + 1));
        showToast(`⚠ Log T${i + 1} (${prevLabel}) first — trades must be logged in order`, 'info', 3500);
        return;
      }
    }
  }

  if (!JN.folders || JN.folders.length === 0) {
    showToast('⚠ No journal folders found — load or save a preset first', 'info', 3000);
    return;
  }
  const _tl = getTL(m, tno);
  if (!_tl || _tl === ('trade ' + tno) || _tl.toLowerCase() === ('trade' + tno)) {
    showToast('⚠ Name this trade first — click the label to rename it (e.g. <b>BTCUSDT</b>)', 'info', 3500);
    const lbl = document.querySelector(`input.lbl-trade[value="${_tl}"]`);
    if (lbl) { lbl.style.borderBottom = '1.5px solid #e05555'; lbl.focus(); setTimeout(() => { lbl.style.borderBottom = ''; }, 2500); }
    return;
  }
  const _ml = gs().ML[m];
  if (!_ml || _ml === getMLabel(m)) {
    showToast('⚠ Name this month first — click the month label to set it (e.g. "Jan 2025")', 'info', 3500);
    return;
  }
  ljShowTvReminder(() => ljShowLockModal(m, tno), false);
}

function ljShowLockModal(m, tno, draft = null) {
  const s = gs();
  const tLabel = getTL(m, tno);
  const mLabel = getML(m);
  const leverage = s.SPOT ? 1 : s.LEV;
  const feeRate = s.FEE.method === 'maker' ? s.FEE.maker : s.FEE.taker;
  const funding = s.FEE.funding;
  const holds = s.FEE.holds;

  const months = sim();
  const mo = months.find(x => x.m === m);
  const tr = mo ? mo.trades.find(t => t.no === tno) : null;
  const tgt = tr ? tr.tgt : 0;

  const notional = tr ? tr.not : s.NOT;
  const margin = tr ? tr.am : (s.SPOT ? s.NOT : s.NOT / leverage);

  _ljPending = { m, tno };
  _ljFundingData = { rates: [], total: 0, fetched: false, fetching: false, _key: '' };
  if (_ljFundTimer) { clearTimeout(_ljFundTimer); _ljFundTimer = null; }
  window._ljExFeeRate = null;
  window._ljSide = null;
  window._ljPair = tLabel.replace(/[\s\/]/g, '').toUpperCase();
  
  const _exSel = document.getElementById('fee-exchange');
  window._ljExchange = _exSel ? _exSel.value : 'binance';
  const cockpitEx = document.getElementById('fee-exchange')?.value || 'binance';
  const _presetName = window._ACTIVE_PRESET ? window._ACTIVE_PRESET.name : null;
  const _defaultFolder = _presetName ? _folderByPreset(_presetName) : JN.folders[0];
  const _jnFolder = draft ? JN.folders.find(f => JN.trades[f.id] && JN.trades[f.id].find(t => t.id === draft.id)) : _defaultFolder;
  const _jnTrades = _jnFolder ? JN.trades[_jnFolder.id] || [] : [];
  const _draftIdx = draft ? _jnTrades.findIndex(t => t.id === draft.id) : -1;
  const _rowNo = _draftIdx >= 0 ? (_draftIdx + 1) : (_jnTrades.filter(t => t.status !== 'draft').length + 1);
  window._ljSelectedFolderId = _jnFolder ? _jnFolder.id : null;
  
  const box = document.getElementById('lj-box');
  box.innerHTML = `
    <div class="lj-title">🔒 Log Trade to Journal</div>
    <div class="lj-sub">
      <span style="color:#888">folder:</span>
      <select id="lj-folder-sel" onchange="window._ljSelectedFolderId=this.value" style="background:#111;border:0.5px solid #333;border-radius:4px;color:#00c47a;font-size:10px;font-weight:700;padding:1px 6px;font-family:inherit;cursor:pointer;outline:none">
        ${JN.folders.map(f => `<option value="${f.id}"${f.id === (_jnFolder ? _jnFolder.id : '') ? ' selected' : ''}>${escHtml(f.name)}</option>`).join('')}
      </select>
      <span style="color:#555;margin:0 6px">·</span>
      <span style="color:#888">month:</span> <b style="color:#ccc">${escHtml(mLabel)}</b>
      <span style="color:#555;margin:0 6px">·</span>
      <span style="color:#888">trade:</span> <b style="color:#ccc">${escHtml(tLabel)}</b>
      <span style="color:#555;margin:0 6px">·</span>
      <span style="font-size:9px;background:rgba(91,127,255,0.1);color:#5b7fff;padding:1px 7px;border-radius:3px;border:1px solid rgba(91,127,255,0.2);font-weight:700">row #${_rowNo}</span>
    </div>

    <div style="display:grid;grid-template-columns:7fr 3fr;gap:12px;margin-bottom:16px;align-items:stretch">
      <div style="background:#0f0f0f;border:1px solid #1e1e1e;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
          <div><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">mode (lev)</div>
            <div style="font-size:11px;font-weight:700;color:#aaa">${s.SPOT ? 'spot ◈' : `leverage · ${leverage}×`}</div>
          </div>
          <div><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">proj. notional</div><div style="font-size:11px;font-weight:700;color:#888">$${Math.round(notional).toLocaleString('en-US')}</div></div>
          <div><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">proj. margin</div><div style="font-size:11px;font-weight:700;color:#888">$${Math.round(margin).toLocaleString('en-US')}</div></div>
          <div><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">target</div><div style="font-size:11px;font-weight:700;color:#00c47a">${tgt.toFixed(2)}%</div></div>
          <div style="grid-column:span 3;background:#0a0a0a;border:1px solid #252525;border-radius:6px;padding:8px">
            <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">exit type <span style="color:#e05555">*</span></div>
            <select id="lj-exit-type" onchange="ljSyncExitType(this.value)" style="width:100%;background:#0a0a0a;border:none;color:#ccc;font-size:11px;padding:2px 0;font-family:inherit;outline:none;cursor:pointer;color-scheme:dark">
              <option value="">— select exit type —</option>
              <option value="price">price-based (TP / SL / trail / partial)</option>
              <option value="signal">signal-based (flip / pullback / time)</option>
              <option value="conditional">conditional (BE / news / funding / liq%)</option>
            </select>
          </div>
          <div style="background:#0a0a0a;border:1px solid #252525;border-radius:6px;padding:8px">
            <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">setup type</div>
            <select id="lj-setup-type" style="width:100%;background:#0a0a0a;border:none;color:#ccc;font-size:11px;padding:2px 0;font-family:inherit;outline:none;cursor:pointer;color-scheme:dark">
              <option value="">— type —</option>
              <option value="breakout">breakout</option>
              <option value="pullback">pullback</option>
              <option value="reversal">reversal</option>
              <option value="range">range</option>
              <option value="momentum">momentum</option>
              <option value="news">news play</option>
              <option value="scalp">scalp</option>
              <option value="other">other</option>
            </select>
          </div>
        </div>
        <div style="border-top:1px solid #1a1a1a;padding-top:10px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;align-items:start">
            <div>
              <div style="font-size:8px;color:#5b7fff;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">actual notional</div>
              <input type="text" id="lj-actual-not" placeholder="${Math.round(notional).toLocaleString('en-US')}" inputmode="decimal"
                style="width:100%;background:#0a0a0a;border:1px solid #1e3a6a;border-radius:4px;padding:4px 6px;font-size:10px;font-weight:700;color:#5b7fff;font-family:inherit;box-sizing:border-box"
                oninput="ljFormatMoneyInput(this);ljSyncActualMargin(this.dataset.raw);ljCalc()">
            </div>
            <div id="lj-fee-cockpit-cell">
              <div style="font-size:8px;color:#5b7fff;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">actual margin</div>
              <div id="lj-actual-margin-display" style="font-size:11px;font-weight:700;color:#5b7fff;padding:4px 0">$${Math.round(margin).toLocaleString('en-US')}</div>
              <div style="font-size:8px;color:#444;margin-top:1px">notional ÷ ${leverage}×</div>
              <div style="font-size:8px;color:#888" id="lj-fee-rate-val">${feeRate}% ${s.FEE.method}</div>
            </div>
            <div id="lj-sl-rr-section" style="grid-column:span 2;visibility:hidden">
              <div style="font-size:8px;color:#EF9F27;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">price exit</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center">
                <div>
                  <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">stop loss</div>
                  <div style="position:relative">
                    <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#444;font-size:11px;pointer-events:none">$</span>
                    <input id="lj-sl" type="text" inputmode="decimal" placeholder="0"
                      style="width:100%;background:#111;border:1px solid #252525;border-radius:6px;color:#e05555;font-size:12px;font-weight:700;padding:7px 8px 7px 20px;font-family:inherit;outline:none;box-sizing:border-box"
                      oninput="ljFormatMoneyInput(this);ljCalcRR()"
                      onfocus="this.style.borderColor='#e05555'"
                      onblur="this.style.borderColor='#252525'">
                  </div>
                </div>
                <div>
                  <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">risk / reward</div>
                  <div id="lj-rr-display" style="font-size:18px;font-weight:800;color:#888">—</div>
                  <div style="font-size:8px;color:#444">price ratio · auto</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style="background:#0f0f0f;border:1px solid #1e1e1e;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">side <span style="color:#e05555">*</span></div>
          ${s.SPOT
            ? `<div style="background:#0d0d0d;border:1px solid #1a1a1a;border-radius:7px;padding:8px;text-align:center">
                <div style="font-size:10px;color:#2a5a3a;font-weight:700">◈ spot — long only</div>
              </div>`
            : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #252525;border-radius:7px;overflow:hidden">
                <button id="ljside-long" onclick="ljSetSide('long');ljFetchFundingDebounced()" style="padding:8px 4px;border:none;background:#0d1a10;color:#00c47a;font-size:10px;font-weight:800;cursor:pointer;outline:none;font-family:inherit;letter-spacing:.05em;border-right:1px solid #252525;transition:background .12s">▲ LONG</button>
                <button id="ljside-short" onclick="ljSetSide('short');ljFetchFundingDebounced()" style="padding:8px 4px;border:none;background:#1a0d0d;color:#e05555;font-size:10px;font-weight:800;cursor:pointer;outline:none;font-family:inherit;letter-spacing:.05em;transition:background .12s">▼ SHORT</button>
              </div>
              <div id="lj-side-indicator" style="height:3px;border-radius:0 0 6px 6px;background:#00c47a;transition:all .15s;display:none"></div>`
          }
        </div>
        <div>
          <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">timeframe <span style="color:#e05555">*</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px">
            <select id="lj-tf" onchange="ljUpdateTfVerdict('preset',this.value)"
              style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#ccc;font-size:11px;padding:6px 8px;font-family:inherit;outline:none;cursor:pointer;color-scheme:dark;box-sizing:border-box">
              <option value="">— preset —</option>
              <option value="1m">1m</option><option value="3m">3m</option><option value="5m">5m</option>
              <option value="15m">15m</option><option value="30m">30m</option><option value="45m">45m</option>
              <option value="1h">1h</option><option value="2h">2h</option><option value="3h">3h</option>
              <option value="4h">4h</option><option value="1D">1D</option><option value="1W">1W</option>
            </select>
            <input id="lj-tf-custom" type="text" placeholder="e.g. 6h"
              style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#ccc;font-size:11px;padding:6px 8px;font-family:inherit;outline:none;box-sizing:border-box"
              oninput="ljUpdateTfVerdict('custom',this.value)">
          </div>
          <div id="lj-tf-verdict" style="font-size:9px;color:#555;min-height:14px"></div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;align-items:stretch">
      <div style="background:#0f0f0f;border:1px solid #1e1e1e;border-radius:8px;padding:14px">
        <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;font-weight:700;display:flex;align-items:center;gap:6px">
          position timing
          <span id="lj-duration-badge" style="color:#2a5a3a;font-weight:600;text-transform:none;letter-spacing:0;font-size:9px"></span>
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">opened <span style="color:#e05555">*</span></div>
          <div style="display:flex;gap:6px;align-items:center">
            <div style="position:relative;flex:1">
              <div class="lj-dt-display" id="lj-open-display" onclick="document.getElementById('lj-open-dt').showPicker()">
                <span class="lj-dt-val" id="lj-open-val">—</span>
                <span class="lj-dt-icon">📅</span>
              </div>
              <input id="lj-open-dt" type="datetime-local"
                value="${new Date(Date.now() - 3600000).toISOString().slice(0, 16)}"
                style="position:absolute;opacity:0;width:1px;height:1px;top:0;left:0;pointer-events:none;color-scheme:dark"
                onchange="ljUpdateDtDisplay('open',this.value);ljFetchFundingDebounced()">
            </div>
            <button onclick="const n=new Date().toISOString().slice(0,16);document.getElementById('lj-open-dt').value=n;ljUpdateDtDisplay('open',n);ljFetchFundingDebounced()"
              style="background:#111;border:1px solid #252525;border-radius:7px;color:#888;font-size:10px;padding:6px 10px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .15s;flex-shrink:0"
              onmouseover="this.style.color='#ccc';this.style.borderColor='#444'"
              onmouseout="this.style.color='#888';this.style.borderColor='#252525'">now</button>
          </div>
        </div>
        <div>
          <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">closed <span style="color:#e05555">*</span></div>
          <div style="display:flex;gap:6px;align-items:center">
            <div style="position:relative;flex:1">
              <div class="lj-dt-display" id="lj-close-display" onclick="document.getElementById('lj-close-dt').showPicker()">
                <span class="lj-dt-val" id="lj-close-val">—</span>
                <span class="lj-dt-icon">📅</span>
              </div>
              <input id="lj-close-dt" type="datetime-local"
                value="${new Date().toISOString().slice(0, 16)}"
                style="position:absolute;opacity:0;width:1px;height:1px;top:0;left:0;pointer-events:none;color-scheme:dark"
                onchange="ljUpdateDtDisplay('close',this.value);ljFetchFundingDebounced()">
            </div>
            <button onclick="const n=new Date().toISOString().slice(0,16);document.getElementById('lj-close-dt').value=n;ljUpdateDtDisplay('close',n);ljFetchFundingDebounced()"
              style="background:#111;border:1px solid #252525;border-radius:7px;color:#888;font-size:10px;padding:6px 10px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .15s;flex-shrink:0"
              onmouseover="this.style.color='#ccc';this.style.borderColor='#444'"
              onmouseout="this.style.color='#888';this.style.borderColor='#252525'">now</button>
          </div>
        </div>
      </div>
      <div style="background:#0f0f0f;border:1px solid #1e1e1e;border-radius:8px;padding:14px">
        <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;font-weight:700">funding data source${s.SPOT ? ' <span style="color:#2a5a3a;font-size:8px;font-weight:400">· spot — no funding</span>' : ''}</div>
        <div style="margin-bottom:8px">
          <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">exchange</div>
          <select id="lj-exchange" onchange="ljOnExchangeChange()"
            style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#ccc;font-size:11px;padding:8px 10px;font-family:inherit;outline:none;cursor:pointer;box-sizing:border-box;color-scheme:dark">
            <option value="binance"${cockpitEx === 'binance' ? ' selected' : ''}>Binance</option>
            <option value="bybit"${cockpitEx === 'bybit' ? ' selected' : ''}>Bybit</option>
            <option value="okx"${cockpitEx === 'okx' ? ' selected' : ''}>OKX</option>
          </select>
        </div>
        <div style="margin-bottom:8px">
          <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">pair / symbol</div>
          <select id="lj-pair-input" onchange="window._ljPair=this.value;ljFetchFundingDebounced()"
            style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#e0e0e0;font-size:11px;font-weight:700;padding:8px 10px;font-family:inherit;outline:none;box-sizing:border-box;cursor:pointer;color-scheme:dark">
            ${(() => { const cur = (window._ljPair || 'BTCUSDT'); const list = [..._LJ_COMMON_PAIRS]; if (!list.includes(cur)) list.unshift(cur); return list.map(p => `<option value="${p}"${p === cur ? ' selected' : ''}>${p}</option>`).join(''); })()}
          </select>
        </div>
        <div id="lj-fund-status" style="padding:6px 10px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:6px;font-size:9px;color:#444;display:flex;align-items:center;gap:6px">
          <span id="lj-fund-icon" style="font-size:10px">⏳</span>
          <span id="lj-fund-msg" style="flex:1;font-size:9px">set dates → auto-fetch</span>
          <button onclick="window._ljPair=document.getElementById('lj-pair-input')?.value||window._ljPair;ljFetchFunding(true)"
            style="background:none;border:1px solid #1e1e1e;border-radius:4px;color:#555;font-size:9px;padding:2px 8px;cursor:pointer;font-family:inherit;outline:none;transition:all .15s;flex-shrink:0"
            id="lj-fund-fetch-btn">↻</button>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">
      <div>
        <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">entry price <span style="color:#e05555">*</span></div>
        <div style="position:relative">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#333;font-size:13px;font-weight:700;pointer-events:none">$</span>
          <input id="lj-entry" type="text" inputmode="decimal" placeholder="0"
            style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#e8e8e8;font-size:15px;font-weight:700;padding:11px 10px 11px 24px;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color .15s"
            oninput="ljFormatMoneyInput(this);ljCalc();ljCalcRR();this.style.borderColor=this.dataset.raw>0?'#00c47a':'#252525'"
            onfocus="this.style.borderColor='#00c47a'"
            onblur="this.style.borderColor=this.dataset.raw>0?'#2a4a3a':'#252525'">
        </div>
      </div>
      <div>
        <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">exit price <span style="color:#e05555">*</span></div>
        <div style="position:relative">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#333;font-size:13px;font-weight:700;pointer-events:none">$</span>
          <input id="lj-exit" type="text" inputmode="decimal" placeholder="0"
            style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#e8e8e8;font-size:15px;font-weight:700;padding:11px 10px 11px 24px;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color .15s"
            oninput="ljFormatMoneyInput(this);ljCalc();ljCalcRR();this.style.borderColor=this.dataset.raw>0?'#00c47a':'#252525'"
            onfocus="this.style.borderColor='#00c47a'"
            onblur="this.style.borderColor=this.dataset.raw>0?'#2a4a3a':'#252525'">
        </div>
      </div>
    </div>

    <div style="font-size:9px;color:#888;margin-bottom:14px">side selection affects direction of PnL calculation</div>

    <div class="lj-calc" id="lj-calc" style="display:none;margin-bottom:16px">
      <div class="lj-calc-row"><span class="lj-calc-lbl">gross PnL</span><span class="lj-calc-val" id="lj-gross">—</span></div>
      <div class="lj-calc-row"><span class="lj-calc-lbl" id="lj-fee-lbl">fee (entry + exit)</span><span class="lj-calc-val neg" id="lj-fee">—</span></div>
      <div class="lj-calc-row" id="lj-fund-row"><span class="lj-calc-lbl" id="lj-fund-lbl">funding</span><span class="lj-calc-val neg" id="lj-fund">—</span></div>
      <div class="lj-calc-row" style="border-top:1px solid #1a3020;padding-top:8px;margin-top:4px">
        <span class="lj-calc-lbl" style="font-size:11px;font-weight:700;color:#6a9a7a">net PnL (all-in)</span>
        <span class="lj-calc-val" id="lj-net" style="font-size:15px">—</span>
      </div>
      <div class="lj-calc-row"><span class="lj-calc-lbl">% return on margin</span><span class="lj-calc-val" id="lj-pct" style="font-size:13px">—</span></div>
    </div>

    <div style="margin-bottom:14px">
      <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;font-weight:700">chart proof <span style="color:#e05555">*</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:8px;color:#888;margin-bottom:4px;font-weight:600">proof open <span style="color:#e05555">*</span></div>
          <input id="lj-tv-open" type="url" placeholder="https://www.tradingview.com/x/…"
            style="width:100%;background:#111;border:1px solid #1e1e1e;border-radius:7px;color:#666;font-size:10px;padding:8px 10px;font-family:inherit;outline:none;box-sizing:border-box"
            oninput="clearTimeout(this._vt);this._vt=setTimeout(()=>ljVerifyTvLink(this,'lj-tv-warn-open'),600)">
          <div id="lj-tv-warn-open" style="display:none;font-size:9px;color:#e05555;margin-top:3px">⚠ invalid — must be a tradingview.com/x/… link</div>
          <div id="lj-tv-preview-open" style="display:none;margin-top:6px;border-radius:6px;overflow:hidden;border:1px solid #1e1e1e">
            <img style="width:100%;display:block" alt="open chart">
          </div>
        </div>
        <div>
          <div style="font-size:8px;color:#888;margin-bottom:4px;font-weight:600">proof close <span style="color:#e05555">*</span></div>
          <input id="lj-tv-close" type="url" placeholder="https://www.tradingview.com/x/…"
            style="width:100%;background:#111;border:1px solid #1e1e1e;border-radius:7px;color:#666;font-size:10px;padding:8px 10px;font-family:inherit;outline:none;box-sizing:border-box"
            oninput="clearTimeout(this._vt);this._vt=setTimeout(()=>ljVerifyTvLink(this,'lj-tv-warn-close'),600)">
          <div id="lj-tv-warn-close" style="display:none;font-size:9px;color:#e05555;margin-top:3px">⚠ invalid — must be a tradingview.com/x/… link</div>
          <div id="lj-tv-preview-close" style="display:none;margin-top:6px;border-radius:6px;overflow:hidden;border:1px solid #1e1e1e">
            <img style="width:100%;display:block" alt="close chart">
          </div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div>
        <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">technical notes</div>
        <textarea id="lj-notes" rows="3" placeholder="Setup, confluence, entry reason…"
          style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#aaa;font-size:11px;padding:9px 12px;font-family:inherit;outline:none;resize:vertical;line-height:1.6;box-sizing:border-box"></textarea>
      </div>
      <div>
        <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">psychological notes</div>
        <textarea id="lj-notes-psych" rows="3" placeholder="How you felt, discipline, lessons…"
          style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#aaa;font-size:11px;padding:9px 12px;font-family:inherit;outline:none;resize:vertical;line-height:1.6;box-sizing:border-box"></textarea>
      </div>
    </div>

    <div style="margin-bottom:14px">
      <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">mood</div>
      <select id="lj-mood-select" style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#ccc;font-size:13px;padding:9px 12px;font-family:inherit;outline:none;cursor:pointer;box-sizing:border-box;color-scheme:dark">
        <option value="">— select mood —</option>
        ${JN_EMOTIONS.map(e => `<option value="${e}">${e} ${{ '😤': 'frustrated', '😰': 'anxious', '😐': 'neutral', '😊': 'confident', '🔥': 'on fire' }[e] || ''}</option>`).join('')}
      </select>
    </div>

    <div id="lj-error" style="display:none;background:#2a0a0a;border:1px solid #4a1a1a;border-radius:6px;padding:8px 12px;font-size:11px;color:#e05555;margin-bottom:12px"></div>

    <div style="display:flex;flex-direction:column;gap:8px">
      <button id="lj-lock-btn" onclick="ljConfirmLock()" style="width:100%;background:#00c47a;border:none;border-radius:10px;color:#000;font-size:13px;font-weight:800;padding:14px 20px;cursor:pointer;font-family:inherit">🔒 lock & log to journal</button>
      <div style="font-size:9px;color:#666;text-align:center;margin-top:-4px">permanent · cannot be undone</div>
      <div style="border-top:1px solid #1a1a1a;margin:4px 0"></div>
      <button id="lj-draft-btn" onclick="ljSaveDraft()" style="width:100%;background:#1a1400;border:1px solid #f59e0b44;border-radius:10px;color:#f59e0b;font-size:12px;font-weight:700;padding:11px 20px;cursor:pointer;font-family:inherit">📝 save as open position</button>
      <button id="lj-delete-draft-btn" onclick="ljDeleteDraft()" style="display:none;width:100%;background:none;border:1px solid #2a0a0a;border-radius:10px;color:#4a1a1a;font-size:11px;font-weight:700;padding:9px 20px;cursor:pointer;font-family:inherit">🗑 delete this draft</button>
      <button onclick="ljCloseModal()" style="width:100%;background:none;border:1px solid #1e1e1e;border-radius:10px;color:#333;font-size:11px;font-weight:600;padding:9px 20px;cursor:pointer;font-family:inherit">cancel</button>
    </div>
  `;

  document.getElementById('lj-modal').classList.add('visible');
  ljSetSide('long');
  setTimeout(() => {
    const od = document.getElementById('lj-open-dt');
    const cd = document.getElementById('lj-close-dt');
    if (od?.value) ljUpdateDtDisplay('open', od.value);
    if (cd?.value) ljUpdateDtDisplay('close', cd.value);
    const exSel = document.getElementById('lj-exchange');
    if (exSel) exSel.value = window._ljExchange || 'binance';
    if (draft) {
      const entryEl = document.getElementById('lj-entry');
      if (entryEl && draft.entry) entryEl.value = draft.entry;
      if (draft.side) ljSetSide(draft.side);
      if (draft.openedAt) {
        const d = new Date(draft.openedAt);
        const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        const odEl = document.getElementById('lj-open-dt');
        if (odEl) { odEl.value = iso; ljUpdateDtDisplay('open', iso); }
      }
      if (draft.tvUrlOpen) { const el = document.getElementById('lj-tv-open'); if (el) { el.value = draft.tvUrlOpen; ljPreviewTV(draft.tvUrlOpen, 'lj-tv-preview-open'); } }
      if (draft.tvUrlClose) { const el = document.getElementById('lj-tv-close'); if (el) { el.value = draft.tvUrlClose; ljPreviewTV(draft.tvUrlClose, 'lj-tv-preview-close'); } }
      if (draft.note) { const el = document.getElementById('lj-notes'); if (el) el.value = draft.note; }
      if (draft.notePsych) { const el = document.getElementById('lj-notes-psych'); if (el) el.value = draft.notePsych; }
      if (draft.tf) { const el = document.getElementById('lj-tf'); if (el) { el.value = draft.tf; ljUpdateTfVerdict('preset', draft.tf); } }
      if (draft.exitType) { const el = document.getElementById('lj-exit-type'); if (el) el.value = draft.exitType; }
      if (draft.emotion) { const el = document.getElementById('lj-mood-select'); if (el) el.value = draft.emotion; }
      const lockBtn = document.getElementById('lj-lock-btn');
      const draftBtn = document.getElementById('lj-draft-btn');
      const delBtn = document.getElementById('lj-delete-draft-btn');
      const modalTitle = document.querySelector('.lj-title');
      if (lockBtn) lockBtn.textContent = '🔒 close & lock to journal';
      if (draftBtn) draftBtn.textContent = '📝 update open position';
      if (delBtn) delBtn.style.display = 'block';
      if (modalTitle) modalTitle.textContent = '📝 Open Position';
      window._ljDraftId = draft.id;
    } else {
      window._ljDraftId = null;
      setTimeout(() => {
        const _s = gs(); const _mt = _s.MT[_ljPending.m];
        const _savedExit = _mt?.exitTypes?.[_ljPending.tno] || '';
        const _exitEl = document.getElementById('lj-exit-type');
        if (_exitEl && _savedExit) _exitEl.value = _savedExit;
      }, 160);
    }
    const el = document.getElementById('lj-entry'); if (el && !draft) el.focus();
    if (gs().SPOT) window._ljSide = 'long';
    ljFetchFunding(true);
  }, 150);
}

function jnGoList(fid) { JN.view = 'list'; JN.activeFolder = fid; JN.activeTrade = null; try { localStorage.setItem('batt_jn_view', 'list'); } catch (e) {} jnRender(); }
function jnGoFolders() { JN.view = 'folders'; JN.activeFolder = null; JN.activeTrade = null; try { localStorage.setItem('batt_jn_view', 'folders'); } catch (e) {} jnRender(); }
function jnGoStats() { JN.view = "stats"; try { localStorage.setItem("batt_jn_view", "stats"); } catch (e) {} jnRender(); }

function ljUpdateDtDisplay(which, val) {
  if (!val) return;
  const d = new Date(val);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const formatted = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${pad(h12)}:${pad(d.getMinutes())} ${ampm}`;
  const valEl = document.getElementById('lj-' + which + '-val');
  const dispEl = document.getElementById('lj-' + which + '-display');
  if (valEl) valEl.textContent = formatted;
  if (dispEl) dispEl.classList.add('active');
  const openEl = document.getElementById('lj-open-dt');
  const closeEl = document.getElementById('lj-close-dt');
  if (openEl?.value && closeEl?.value) {
    const ms = new Date(closeEl.value) - new Date(openEl.value);
    if (ms > 0) {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const badge = document.getElementById('lj-duration-badge');
      if (badge) badge.textContent = `· ${h > 0 ? h + 'h ' : ''}${m}m held`;
    }
  }
}

async function ljFetchFunding(manual) {
  const msgEl = document.getElementById('lj-fund-msg');
  const iconEl = document.getElementById('lj-fund-icon');
  const btnEl = document.getElementById('lj-fund-fetch-btn');
  const lblEl = document.getElementById('lj-fund-lbl');
  const s = gs();

  if (s.SPOT) {
    _ljFundingData = { rates: [], total: 0, fetched: true, fetching: false, _key: '' };
    if (msgEl) msgEl.textContent = 'spot mode — no funding fees';
    if (iconEl) iconEl.textContent = '◈';
    ljCalc(); return;
  }
  const openEl = document.getElementById('lj-open-dt');
  const closeEl = document.getElementById('lj-close-dt');
  if (!openEl?.value || !closeEl?.value) return;
  const startMs = new Date(openEl.value).getTime();
  const endMs = new Date(closeEl.value).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return;
  const key = `${openEl.value}|${closeEl.value}`;
  if (!manual && _ljFundingData._key === key && _ljFundingData.fetched) return;

  _ljFundingData.fetching = true;
  _ljFundingData._key = key;
  if (msgEl) msgEl.textContent = 'fetching funding rates...';
  if (iconEl) iconEl.textContent = '↻';
  if (btnEl) { btnEl.textContent = '...'; btnEl.style.opacity = '.5'; }

  const ex = document.getElementById('lj-exchange')?.value || 'binance';
  const pair = (window._ljPair || 'BTCUSDT');
  const side = window._ljSide || 'long';
  const notional = parseFloat(document.getElementById('lj-actual-not')?.dataset.raw) || s.NOT;

  try {
    const rates = await fetchHistoricalFunding(ex, pair, startMs, endMs);
    const totalFunding = calcFundingFromHistory(rates, notional, side === 'long');
    _ljFundingData = { rates, total: totalFunding, fetched: true, fetching: false, _key: key };
    const hrs = Math.round((endMs - startMs) / 3600000 * 10) / 10;
    const intervals = rates.length;
    if (msgEl) msgEl.textContent = `${intervals} interval${intervals !== 1 ? 's' : ''} · ${hrs}h held · $${Math.abs(totalFunding).toFixed(4)} ${totalFunding > 0 ? 'paid' : 'received'}`;
    if (iconEl) iconEl.textContent = intervals > 0 ? '✓' : '○';
  } catch (e) {
    _ljFundingData.fetching = false;
    if (msgEl) msgEl.textContent = 'fetch failed — using estimate';
  }
  if (btnEl) { btnEl.textContent = '↻'; btnEl.style.opacity = '1'; }
  ljCalc();
}

function ljFormatMoneyInput(el) {
  const raw = el.value.replace(/[^0-9.]/g, "");
  const num = parseFloat(raw) || 0;
  el.dataset.raw = num > 0 ? raw : "";
  if (!raw) { el.value = ""; return; }
  const parts = raw.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cursorFromEnd = el.value.length - el.selectionEnd;
  el.value = parts.join(".");
  const newPos = el.value.length - cursorFromEnd;
  el.setSelectionRange(newPos, newPos);
}

function ljCalcRR() {
  const rrEl = document.getElementById('lj-rr-display');
  if (!rrEl) return;
  const entry = parseFloat(document.getElementById('lj-entry')?.dataset.raw) || 0;
  const exit = parseFloat(document.getElementById('lj-exit')?.dataset.raw) || 0;
  const sl = parseFloat(document.getElementById('lj-sl')?.dataset.raw) || 0;
  if (!entry || !exit || !sl) { rrEl.textContent = '—'; rrEl.style.color = '#888'; return; }
  const side = window._ljSide || 'long';
  const reward = side === 'long' ? (exit - entry) : (entry - exit);
  const risk = side === 'long' ? (entry - sl) : (sl - entry);
  if (risk <= 0 || reward <= 0) { rrEl.textContent = 'invalid levels'; rrEl.style.color = '#e05555'; return; }
  const rr = reward / risk;
  rrEl.textContent = '1 : ' + (rr % 1 === 0 ? rr.toString() : rr.toFixed(1));
  rrEl.style.color = rr >= 2 ? '#00c47a' : rr >= 1 ? '#EF9F27' : '#e05555';
}

function ljSyncActualMargin(notVal) {
  const s = gs();
  const leverage = s.SPOT ? 1 : s.LEV;
  const not = parseFloat(notVal) || 0;
  const disp = document.getElementById('lj-actual-margin-display');
  if (!disp) return;
  if (not > 0) disp.textContent = '$' + Math.round(s.SPOT ? not : not / leverage).toLocaleString('en-US');
  else {
    const mo = sim().find(x => x.m === _ljPending.m);
    const tr = mo ? mo.trades.find(t => t.no === _ljPending.tno) : null;
    disp.textContent = '$' + Math.round(tr ? tr.am : (s.SPOT ? s.NOT : s.NOT / leverage)).toLocaleString('en-US');
  }
}

function ljUpdateTfVerdict(source, val) {
  const sel = document.getElementById('lj-tf');
  const customInp = document.getElementById('lj-tf-custom');
  const el = document.getElementById('lj-tf-verdict');

  if (source === 'preset') {
    if (val && customInp) { customInp.value = ''; customInp.style.opacity = '0.35'; customInp.disabled = true; }
    else if (customInp) { customInp.disabled = false; customInp.style.opacity = '1'; }
  } else if (source === 'custom') {
    if (val && sel) { sel.value = ''; sel.disabled = true; sel.style.opacity = '0.35'; }
    else if (sel) { sel.disabled = false; sel.style.opacity = '1'; }
  }

  const activeTf = (source === 'custom' ? val : val) || '';
  function toMin(tf) {
    if (!tf) return 0;
    const m = tf.match(/^(\d+(?:\.\d+)?)\s*(m|h|D|W)$/i);
    if (!m) return 0;
    const n = parseFloat(m[1]), u = m[2].toUpperCase();
    return u === 'M' ? n : u === 'H' ? n * 60 : u === 'D' ? n * 1440 : u === 'W' ? n * 10080 : 0;
  }

  const mins = toMin(activeTf);
  let verdict = mins > 0 ? (mins < 5 ? '⚡ scalper' : mins < 60 ? '🔥 intraday' : mins < 1440 ? '📈 swing' : '🏔 position trader') : '';
  if (el) { el.textContent = verdict; el.style.color = verdict ? '#1D9E75' : '#555'; }
}

function ljVerifyTvLink(input, warnId) {
  const val = (input.value || '').trim();
  const warn = document.getElementById(warnId);
  if (!val) {
    input.style.borderColor = '#1e1e1e';
    if (warn) warn.style.display = 'none';
    return;
  }
  if (!val.includes('tradingview.com/x/')) {
    input.style.borderColor = '#e05555';
    if (warn) { warn.style.display = 'block'; warn.style.color = '#e05555'; warn.textContent = '⚠ invalid snapshot link'; }
    return;
  }
  if (warn) { warn.style.display = 'block'; warn.style.color = '#888'; warn.textContent = '⏳ verifying link…'; }
  const img = new Image();
  img.onload = () => {
    input.style.borderColor = '#00c47a';
    if (warn) { warn.style.color = '#00c47a'; warn.textContent = '✓ verified'; }
    ljPreviewTV(val, warnId === 'lj-tv-warn-open' ? 'lj-tv-preview-open' : 'lj-tv-preview-close');
  };
  img.src = val;
}

function ljSyncExitType(val) {
  const { m, tno } = _ljPending;
  const s = gs();
  if (!s.MT[m]) s.MT[m] = { bt: [...s.BT], fr: [...s.FR] };
  if (!s.MT[m].exitTypes) s.MT[m].exitTypes = {};
  s.MT[m].exitTypes[tno] = val;
  const slRr = document.getElementById('lj-sl-rr-section');
  if (slRr) slRr.style.visibility = val === 'price' ? 'visible' : 'hidden';
}

function ljGetDraftKey(m, tno) { return TAB + '-' + m + '-' + tno; }

function ljFindDraft(m, tno) {
  if (!window._ACTIVE_PRESET) return null;
  const activeFolderId = (_folderByPreset(window._ACTIVE_PRESET.name) || {}).id;
  if (!activeFolderId) return null;
  const found = (JN.trades[activeFolderId] || []).find(t => t.status === 'draft' && t.cockpit && t.cockpit.tab === TAB && t.cockpit.month === m && t.cockpit.tradeNo === tno);
  return found ? { trade: found, folderId: activeFolderId } : null;
}

async function ljDeleteDraft() {
  const draftId = window._ljDraftId;
  if (!draftId) { ljCloseModal(); return; }
  for (const fid of Object.keys(JN.trades || {})) {
    const idx = (JN.trades[fid] || []).findIndex(t => t.id === draftId);
    if (idx !== -1) { JN.trades[fid].splice(idx, 1); break; }
  }
  window._ljDraftId = null;
  await jnSave();
  if (typeof softUpdate === 'function') softUpdate();
  ljCloseModal();
  showToast('Draft deleted', 'info', 2000);
}

function _ljDraftContinue() { ljSaveDraftCore(); }
async function ljSaveDraft() { ljShowTvReminder(() => ljSaveDraftCore(), true); }

async function ljSaveDraftCore() {
  const s = gs();
  const { m, tno } = _ljPending;
  const entry = parseFloat(document.getElementById('lj-entry')?.dataset.raw) || 0;
  const errEl = document.getElementById('lj-error');
  if (!entry) {
    const el = document.getElementById('lj-entry'); if (el) { el.style.borderColor = '#e05555'; el.focus(); }
    if (errEl) { errEl.textContent = '⚠ Entry price is required to save draft'; errEl.style.display = 'block'; }
    return;
  }
  if (!window._ljSide && !s.SPOT) { if (errEl) { errEl.textContent = '⚠ Pick side — LONG or SHORT'; errEl.style.display = 'block'; } return; }
  const _tvOpen = (document.getElementById('lj-tv-open')?.value || '').trim();
  if (!_tvOpen || !_tvOpen.includes('tradingview.com/x/')) { if (errEl) { errEl.textContent = '⚠ Chart proof (open) is required'; errEl.style.display = 'block'; } return; }
  if (errEl) errEl.style.display = 'none';
  if (!window._ACTIVE_PRESET) { showToast('⚠ Load or save a preset first', 'info', 2500); return; }

  const leverage = s.SPOT ? 1 : s.LEV;
  const side = window._ljSide || 'long';
  const tvUrlOpen = (document.getElementById('lj-tv-open')?.value || '').trim();
  const tvUrlClose = (document.getElementById('lj-tv-close')?.value || '').trim();
  const notes = document.getElementById('lj-notes')?.value || '';
  const notePsych = document.getElementById('lj-notes-psych')?.value || '';
  const exitType = document.getElementById('lj-exit-type')?.value || '';
  const setupType = document.getElementById('lj-setup-type')?.value || '';
  const _tfSel = document.getElementById('lj-tf')?.value || '';
  const _tfCustom = document.getElementById('lj-tf-custom')?.value || '';
  const tf = _tfCustom || _tfSel;
  const emotion = document.getElementById('lj-mood-select')?.value || '';
  const openDateVal = document.getElementById('lj-open-dt')?.value || new Date().toISOString().slice(0, 16);
  const tLabel = getTL(m, tno) || ('trade ' + tno);
  const _simMonths = sim();
  const _simMo = _simMonths.find(x => x.m === m);
  const _simTr = _simMo ? _simMo.trades.find(t => t.no === tno) : null;
  const notional = _simTr ? _simTr.not : s.NOT;

  let folder = window._ljSelectedFolderId ? JN.folders.find(f => f.id === window._ljSelectedFolderId) : (_getOrCreatePresetFolder(window._ACTIVE_PRESET.name) || JN.folders[0]);
  if (!JN.trades[folder.id]) JN.trades[folder.id] = [];

  const existing = ljFindDraft(m, tno);
  if (existing) {
    const t = existing.trade;
    t.entry = entry; t.side = side; t.leverage = leverage; t.size = notional;
    t.openedAt = new Date(openDateVal).getTime() || Date.now();
    t.tvUrlOpen = tvUrlOpen || t.tvUrlOpen; t.tvUrlClose = tvUrlClose || t.tvUrlClose;
    if (notes) t.note = notes;
    if (notePsych) t.notePsych = notePsych;
    if (tf) t.tf = tf;
    if (exitType) t.exitType = exitType;
    if (setupType) t.setupType = setupType;
    t.updatedAt = Date.now();
    await jnSave();
    ljCloseModal();
    showToast('Open position updated', 'success', 2000);
    return;
  }

  const draft = {
    id: 't' + Date.now(),
    status: 'draft',
    pair: tLabel.replace(/\s+/g, '').toUpperCase(),
    side, leverage, size: notional, entry, exit: null, pnl: null, fee: null, funding: null, pct: null,
    openedAt: new Date(openDateVal).getTime() || Date.now(), closedAt: null,
    note: notes, noteLog: [], emotion, tvUrlOpen, tvUrlClose, tvUrl: tvUrlOpen || '', source: 'cockpit',
    cockpit: { tab: TAB, month: m, tradeNo: tno, monthLabel: getML(m), lev: leverage, mode: s.SPOT ? 'spot' : 'leverage' },
    createdAt: Date.now(), updatedAt: Date.now()
  };

  JN.trades[folder.id].push(draft);
  await jnSave();
  ljCloseModal();
  if (typeof render === 'function') render();
  showToast('Saved as open position — lock when closed', 'success', 3000);
}

function ljOpenDraftToClose(tradeId, folderId) {
  const t = (JN.trades[folderId] || []).find(x => x.id === tradeId);
  if (!t || t.status !== 'draft') return;
  _ljPending = { m: t.cockpit.month, tno: t.cockpit.tradeNo };
  ljShowLockModal(t.cockpit.month, t.cockpit.tradeNo, t);
}

async function ljConfirmUnlock(m, tno, key) {
  const ok = await showConfirm({
    icon: '🔓', type: 'info', title: 'Unlock trade?',
    message: 'Remove from journal too, or keep the journal entry?',
    confirmText: 'unlock only', cancelText: 'unlock + remove'
  });
  const s = gs();
  s.LK.delete(key);
  try { localStorage.setItem('batt_' + TAB + '_lk', JSON.stringify({ LK: [...s.LK] })); } catch (e) {}

  if (ok === false || ok === null) {
    const presetName = window._ACTIVE_PRESET?.name;
    if (presetName) {
      const folder = _folderByPreset(presetName);
      if (folder && JN.trades[folder.id]) {
        JN.trades[folder.id] = JN.trades[folder.id].filter(t => !(t.source === 'cockpit' && t.cockpit && t.cockpit.tab === TAB && t.cockpit.month === m && t.cockpit.tradeNo === tno));
        await jnSave();
        showToast('Unlocked & removed from journal', 'info', 2000);
      }
    }
  } else {
    showToast('Unlocked — journal entry kept', 'info', 2000);
  }

  const _pr = document.querySelector('.panel-right');
  const _sy = _pr ? _pr.scrollTop : 0;
  softUpdate();
  if (_pr) requestAnimationFrame(() => { _pr.scrollTop = _sy; });
  _autoResaveActivePreset();
}

function isLocked(m, tno) {
  const s = gs();
  if (!s.LK) return false;
  if (Array.isArray(s.LK)) { s.LK = new Set(s.LK); }
  return s.LK.has(m + '-' + tno);
}

/* ==========================================================================
   4. MANUAL ACTIONS & IMPORT SYSTEM
   ========================================================================== */
async function jnNewFolder() {
  const body = document.getElementById('jn-body');
  if (!body) return;
  const colors = JN_COLORS;
  const colorIdx = JN.folders.length % colors.length;
  body.innerHTML = `<div style="max-width:420px">
    <div style="font-size:13px;font-weight:700;color:#ccc;margin-bottom:18px">New Folder</div>
    <div style="margin-bottom:14px">
      <div class="jn-detail-lbl" style="margin-bottom:6px">Folder name</div>
      <input id="jnf-name" type="text" placeholder='e.g. "BTC Scalps"' style="width:100%;background:#1a1a1a;border:1px solid #2e2e2e;border-radius:6px;color:#ddd;font-size:12px;padding:9px 12px;font-family:inherit;outline:none" autofocus>
    </div>
    <div style="margin-bottom:14px">
      <div class="jn-detail-lbl" style="margin-bottom:6px">Trade type</div>
      <div style="display:flex;gap:6px">
        <button class="jnf-type-btn on" data-type="lev" onclick="document.querySelectorAll('.jnf-type-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')" style="flex:1;padding:8px;border-radius:6px;border:1px solid #2e2e2e;background:#1a1a1a;color:#00c47a;font-size:10px;font-weight:700;cursor:pointer;outline:none">⚡ Leverage</button>
        <button class="jnf-type-btn" data-type="spot" onclick="document.querySelectorAll('.jnf-type-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')" style="flex:1;padding:8px;border-radius:6px;border:1px solid #2e2e2e;background:#1a1a1a;color:#5b7fff;font-size:10px;font-weight:700;cursor:pointer;outline:none">◈ Spot</button>
        <button class="jnf-type-btn" data-type="mix" onclick="document.querySelectorAll('.jnf-type-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')" style="flex:1;padding:8px;border-radius:6px;border:1px solid #2e2e2e;background:#1a1a1a;color:#f59e0b;font-size:10px;font-weight:700;cursor:pointer;outline:none">⊕ Mix</button>
      </div>
    </div>
    <div style="margin-bottom:20px">
      <div class="jn-detail-lbl" style="margin-bottom:6px">Color</div>
      <div style="display:flex;gap:6px">${colors.map((c, i) => `<button onclick="document.querySelectorAll('.jnf-color-btn').forEach(b=>b.style.outline='none');this.style.outline='2px solid #fff'" class="jnf-color-btn" style="width:22px;height:22px;border-radius:50%;background:${c};border:none;cursor:pointer;outline:${i === colorIdx ? '2px solid #fff' : 'none'};outline-offset:2px"></button>`).join('')}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="jnNewFolderSubmit()" class="jn-add-btn" style="flex:1">create folder</button>
      <button onclick="jnRenderFolders()" class="jn-btn-sm" style="padding:7px 16px;font-size:10px">cancel</button>
    </div>
  </div>`;
  setTimeout(() => { const i = document.getElementById('jnf-name'); if (i) i.focus(); }, 50);
}

async function jnNewFolderSubmit() {
  const nameEl = document.getElementById('jnf-name');
  const name = (nameEl ? nameEl.value : '').trim();
  if (!name) { nameEl && (nameEl.style.borderColor = '#e05555'); return; }
  const typeBtn = document.querySelector('.jnf-type-btn.on');
  const type = typeBtn ? typeBtn.dataset.type : 'lev';
  const colorBtn = document.querySelector('.jnf-color-btn[style*="2px solid"]');
  const color = colorBtn ? colorBtn.style.background : JN_COLORS[JN.folders.length % JN_COLORS.length];
  const id = 'f' + Date.now();
  JN.folders.push({ id, name, color, type, tags: [type], createdAt: Date.now() });
  JN.trades[id] = [];
  await jnSave();
  jnGoList(id);
}

async function jnEditFolder(fid) {
  const f = JN.folders.find(x => x.id === fid);
  if (!f) return;
  const name = await showConfirm({ icon: '✏️', type: 'info', title: 'Rename Folder', input: true, inputValue: f.name, inputPlaceholder: 'folder name', confirmText: 'save', cancelText: 'cancel' });
  if (!name || !name.trim()) return;
  f.name = name.trim();
  await jnSave();
  jnRenderFolders();
}

async function jnDeleteFolder(fid) {
  const f = JN.folders.find(x => x.id === fid);
  if (!f) return;
  const ok = await showConfirm({ icon: '🗑️', type: 'danger', title: 'Delete folder?', message: `Delete "${f.name}" and all ${(JN.trades[fid] || []).length} trades inside?`, confirmText: 'delete', cancelText: 'cancel' });
  if (!ok) return;
  JN.folders = JN.folders.filter(x => x.id !== fid);
  delete JN.trades[fid];
  await jnSave();
  jnRenderFolders();
}

async function jnNewTrade() {
  const result = await showConfirm({
    icon: '📝', type: 'info', title: 'Add Trade',
    message: 'Fill in trade details:', input: true, inputPlaceholder: 'pair (e.g. BTCUSDT)',
    confirmText: 'next', cancelText: 'cancel'
  });
  if (!result) return;
  const pair = result.trim().toUpperCase() || 'BTCUSDT';
  const id = 't' + Date.now();
  const trade = { id, pair, side: 'long', leverage: 1, size: 100, entry: 0, exit: 0, pnl: 0, fee: 0, funding: 0, pct: 0, type: 'spot', closedAt: Date.now(), note: '', emotion: '', source: 'manual', tags: [] };
  if (!JN.trades[JN.activeFolder]) JN.trades[JN.activeFolder] = [];
  JN.trades[JN.activeFolder].unshift(trade);
  await jnSave();
  JN.view = 'detail'; JN.activeTrade = id; jnRender();
  showToast('Trade added — fill in details', 'success', 2000);
}

async function jnDeleteTrade(tid) {
  const ok = await showConfirm({ icon: '🗑️', type: 'danger', title: 'Delete trade?', message: 'This trade will be permanently removed.', confirmText: 'delete', cancelText: 'cancel' });
  if (!ok) return;
  JN.trades[JN.activeFolder] = (JN.trades[JN.activeFolder] || []).filter(x => x.id !== tid);
  await jnSave();
  if (typeof softUpdate === 'function') softUpdate();
  if (JN.activeTrade === tid) { JN.view = 'list'; JN.activeTrade = null; }
  jnRender();
}

function jnAddAction() {
  if (JN.view === 'list') jnNewTrade();
  else jnNewFolder();
}

async function jnImportFromTP() {
  if (!TP_STATE || !TP_STATE.history || TP_STATE.history.length === 0) {
    showToast('No trades in Trade Panel history', 'info'); return;
  }
  if (JN.folders.length === 0) {
    showToast('Create a folder first', 'info');
    openJournal();
    return;
  }
  const folderNames = JN.folders.map(f => f.name);
  const fIdx = await showConfirm({
    icon: '⚡', type: 'info', title: 'Import to which folder?',
    message: 'Select a folder to import Trade Panel trades into:',
    input: true, inputPlaceholder: folderNames.join(' / '),
    confirmText: 'import', cancelText: 'cancel'
  });
  if (!fIdx) return;
  const targetFolder = JN.folders.find(f => f.name.toLowerCase() === fIdx.trim().toLowerCase()) || JN.folders[0];
  if (!JN.trades[targetFolder.id]) JN.trades[targetFolder.id] = [];
  let imported = 0;
  TP_STATE.history.forEach(h => {
    const id = 't' + Date.now() + Math.random().toString(36).slice(2, 6);
    const pct = (h.pnl / (h.size || 1)) * 100;
    JN.trades[targetFolder.id].unshift({
      id, pair: h.pair || 'BTCUSDT', side: h.side || 'long',
      leverage: h.leverage || 1, size: h.size || 0,
      entry: h.entryPrice || 0, exit: h.exitPrice || 0,
      pnl: h.pnl || 0, fee: h.fee || 0, funding: h.funding || 0,
      pct: h.pct || pct, type: h.marketType || 'perpetual',
      closedAt: h.closedAt || Date.now(),
      note: '', emotion: '', source: 'Trade Panel',
      tags: [h.pair, h.side, h.liquidated ? 'liquidated' : ''].filter(Boolean)
    });
    imported++;
  });
  await jnSave();
  showToast(`Imported ${imported} trade${imported > 1 ? 's' : ''} to "${targetFolder.name}"`, 'success');
  jnGoList(targetFolder.id);
}
