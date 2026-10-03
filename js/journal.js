// ── ROUTER ──
var _battInAppNav = false;

// safe token reader across script blocks
function _battToken(){
  try{ return (typeof AUTH_TOKEN!=='undefined' ? AUTH_TOKEN : null) || localStorage.getItem('batt_token') || null; }
  catch(e){ return localStorage.getItem('batt_token') || null; }
}

function battNav(page){
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
  try{
    var hash = '#' + page;
    var cur = (window.location.hash||'').replace('#','');
    if(cur === page) return;
    var overlayStates = ['risk','guide-lock'];
    _battInAppNav = true;
    if(overlayStates.indexOf(cur) !== -1){
      history.replaceState({batt:page}, '', hash);
    } else {
      history.pushState({batt:page}, '', hash);
    }
    _battInAppNav = false;
  }catch(e){ _battInAppNav = false; }
}
function battSetRoute(page){ battNav(page); }
function battSetTitle(page){ battNav(page); }

function battRestoreFromHash(){
  var hash=(window.location.hash||'').replace('#','');
  var ljBox=document.getElementById('lj-box');
  if(ljBox&&ljBox.closest&&ljBox.closest('.lj-modal-wrap')){ var mo=ljBox.closest('.lj-modal-wrap'); if(mo) mo.style.display='none'; }
  var mn=document.getElementById('cockpit-mob-nav');
  if(mn) mn.style.display=(hash==='cockpit')?'':'none';
  if(hash==='cockpit'&&typeof openDashboard==='function'){ openDashboard(); return; }
  if(hash==='journal'&&typeof _showJournal==='function'){ _showJournal(); return; }
  if(hash==='simulate'){
    document.body.style.overflow='auto';
    var tp=document.getElementById('trading-page');
    if(tp) tp.classList.add('visible');
    if(typeof tpFetchPrices==='function') tpFetchPrices();
    if(typeof tpStartWebSocket==='function') tpStartWebSocket();
    if(typeof tpFetchOrderBook==='function') tpFetchOrderBook();
    if(typeof tpUpdateUI==='function') tpUpdateUI();
    if(typeof tpRenderPositions==='function') tpRenderPositions();
    if(typeof tpUpdateSubmitButton==='function') tpUpdateSubmitButton();
    return;
  }
  if(hash==='trade'){
    var hub=document.getElementById('trade-hub');
    if(hub){ hub.style.display='flex'; requestAnimationFrame(function(){ hub.style.opacity='1'; hub.style.transform='scale(1)'; }); }
    document.body.style.overflow='auto';
    if(typeof mbnSetActive==='function') mbnSetActive('trade');
    return;
  }
  if(hash==='account'&&typeof loadAccountPage==='function'){
    var ap=document.getElementById('account-page');
    if(ap) ap.classList.add('visible');
    loadAccountPage();
    document.body.style.overflow='auto';
    if(typeof mbnSetActive==='function') mbnSetActive('account');
    return;
  }
  if(hash==='about'){
    var ab=document.getElementById('about-cj-page');
    if(ab){ ab.style.display='block'; requestAnimationFrame(function(){ ab.style.opacity='1'; ab.classList.add('acj-visible'); }); }
    document.body.style.overflow='auto';
    return;
  }
  var l3=document.getElementById('layer3');
  if(l3){ l3.classList.remove('hidden'); requestAnimationFrame(function(){ l3.classList.add('visible'); }); }
  document.body.style.overflow='auto';
  if(typeof mbnSetActive==='function') mbnSetActive('member');
}

window.addEventListener('popstate', function(e){
  if(typeof ljCloseModal==='function') ljCloseModal();
  var co=document.getElementById('confirm-overlay')||document.querySelector('.confirm-overlay');
  if(co&&co.offsetParent){ if(typeof closeConfirm==='function') closeConfirm(); history.pushState({},'',window.location.hash||''); return; }
  battRestoreFromHash();
});


// ── GUEST / AUTH VISIBILITY HELPERS ──
function battUpdateGuestUI(){
  var tok=_battToken();
  var spotSwitcher=document.getElementById('spot-mode-switcher');
  var guestBanner=document.getElementById('guest-mode-banner');
  if(tok){
    if(guestBanner) guestBanner.style.display='none';
    if(spotSwitcher) spotSwitcher.style.display='';
    var msw=document.getElementById('spot-mode-switcher');
    if(msw) msw.removeAttribute('data-guest');
  } else {
    if(guestBanner) guestBanner.style.display='flex';
    if(spotSwitcher){ spotSwitcher.style.display=''; spotSwitcher.setAttribute('data-guest','1'); }
  }
}

function clearActivePreset(){
  // wipe JN drafts that belong to the active preset folder so 📝 badges clear
  try{
    if(window._ACTIVE_PRESET&&typeof JN!=='undefined'&&JN.folders&&JN.trades){
      const folder=_folderByPreset(window._ACTIVE_PRESET.name);
      if(folder&&JN.trades[folder.id]){
        JN.trades[folder.id]=JN.trades[folder.id].filter(t=>t.status!=='draft');
        if(typeof jnSave==='function') jnSave();
      }
    }
  }catch(e){}
  window._ACTIVE_PRESET=null;
  try{localStorage.removeItem('batt_active_preset');}catch(e){}
  const lbl=document.getElementById('auth-preset-lbl');
  const btn=document.getElementById('auth-preset-clear');
  if(lbl){lbl.textContent='';lbl.style.display='none';}
  if(btn) btn.style.display='none';
  // reset cockpit to clean neutral state — no preset data bleeds through
  ['36','q',...(typeof CUSTOM_TABS!=='undefined'?CUSTOM_TABS.map(t=>t.id):[])].forEach(tabId=>{
    if(!S||!S[tabId]) return;
    // clear locked rows — they belong to the preset
    S[tabId].LK=new Set();
    // clear slot pref so slots reset to defaults
    try{localStorage.removeItem('batt_slot_pref');}catch(e){}
    S[tabId].BT=[...DEF_BT];
    S[tabId].FR=[...DEF_FR];
    // save clean state to localStorage
    try{
      localStorage.setItem('batt_'+tabId+'_lk', JSON.stringify({LK:[]}));
      localStorage.setItem('batt_'+tabId+'_trades', JSON.stringify({BT:[...DEF_BT],FR:[...DEF_FR]}));
    }catch(e){}
  });
  // refresh preset list so active badge disappears
  if(typeof presetRenderList==='function') presetRenderList();
  // re-render cockpit clean
  if(typeof render==='function') render();
  // force sync controls to remove lock badges immediately
  if(typeof syncControls==='function') syncControls();
  showToast('Preset exited — cockpit reset to neutral','info',2500);
}

function guestGoLogin(){
  window.BATT_GUEST=false;
  var guestBanner=document.getElementById('guest-mode-banner');
  if(guestBanner) guestBanner.style.display='none';
  var app=document.querySelector('.app');
  if(app){ app.style.transition='opacity 0.4s ease'; app.style.opacity='0'; }
  var l2=document.getElementById('layer2');
  if(l2){ l2.classList.add('hidden'); l2.classList.remove('out'); l2.style.opacity='0'; }
  battNav('auth');
  var al=document.getElementById('auth-layer');
  if(al){ al.classList.remove('hidden','out'); al.style.opacity='0'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ al.style.opacity='1'; }); }); }
}

// ── ABOUT CJ PAGE ──
// ══════════════════════════════════════════════════════════
// TRADE JOURNAL
// ══════════════════════════════════════════════════════════
var JN = {
  folders: [],      // [{id,name,color,tags,type,createdAt}]
  trades: {},       // {folderId: [{...}]}
  view: 'list',  // 'folders' | 'list' | 'detail'
  folderView: 'grid', // 'grid' | 'list'
  activeFolder: null,
  activeTrade: null,
};

var JN_COLORS = ['#00c47a','#5b7fff','#f59e0b','#a855f7','#E24B4A','#00c4c4','#ff6b6b','#60c030'];
var JN_EMOTIONS = ['😤','😰','😐','😊','🔥'];

async function jnSave(){
  try{
    localStorage.setItem('batt_journal', JSON.stringify(JN));
    await saveUserDataToServer('journal', JN);
  }catch(e){}
}

async function jnLoad(){
  // local first
  try{
    const loc=localStorage.getItem('batt_journal');
    if(loc) Object.assign(JN,_safeJSON(loc,{}));
  }catch(e){}
  // then cloud
  const tok=_battToken();
  if(!tok){if(typeof softUpdate==='function')softUpdate();return;}
  document.body.classList.add('jn-loading');
  try{
    const r=await fetch(AUTH_URL+'/userdata/load',{headers:{'Authorization':'Bearer '+tok}});
    const d=await r.json();
    if(d.ok&&d.data&&d.data.journal){
      Object.assign(JN, d.data.journal);
      localStorage.setItem('batt_journal', JSON.stringify(JN));
    }
  }catch(e){}
  document.body.classList.remove('jn-loading');
  // refresh cockpit so locked rows show actual data immediately
  if(typeof render==='function') setTimeout(render, 50);
}

function openJournal(){
  battNav('journal');
  _showJournal();
}

function _showJournal(){
  const p=document.getElementById('journal-page');
  if(!p||p.style.display==='flex') return; // already showing
  p.style.display='flex';
  requestAnimationFrame(()=>requestAnimationFrame(()=>p.classList.add('visible')));
  document.body.style.overflow='auto';
  jnLoad().then(()=>{
    const savedView=localStorage.getItem('batt_jn_view')||'list';
    const savedFolder=localStorage.getItem('batt_jn_folder');
    const savedTrade=localStorage.getItem('batt_jn_trade');
    if(savedView==='detail'&&savedFolder&&savedTrade&&JN.trades[savedFolder]){
      const tradeExists=JN.trades[savedFolder].find(t=>t.id===savedTrade);
      if(tradeExists){JN.activeFolder=savedFolder;JN.activeTrade=savedTrade;JN.view='detail';jnRender();return;}
    }
    if(savedView==='list'&&savedFolder&&JN.folders.find(f=>f.id===savedFolder)){
      JN.activeFolder=savedFolder;JN.view='list';jnRender();return;
    }
    if(JN.folders.length>0){if(!JN.activeFolder)JN.activeFolder=JN.folders[0].id;JN.view='list';}
    else{JN.view='folders';}
    jnRender();
  });
}

function closeJournal(){
  const p=document.getElementById('journal-page');
  if(!p) return;
  p.classList.remove('visible');
  setTimeout(()=>{p.style.display='none';},300);
  battNav('member');
  document.body.style.overflow='auto';
}

function jnRender(){
  // restore last view preference — user's explicit choice persists forever
  const savedView=localStorage.getItem('batt_jn_view')||'list';
  if(JN.view==='folders'&&savedView==='list'&&JN.folders.length>0){
    JN.activeFolder=JN.activeFolder||JN.folders[0].id;
    JN.view='list';
  }
  JN.view==="folders"?jnRenderFolders():
  JN.view==="list"?jnRenderList():
  JN.view==="stats"?jnRenderStats():
  jnRenderDetail();
  jnUpdateHeader();
  jnUpdateHeader();
}

function jnUpdateHeader(){
  const cb=document.getElementById("jn-csv-btn");
  const bc=document.getElementById('jn-breadcrumb');
  const ab=document.getElementById('jn-add-btn');
  if(JN.view==='folders'){
    bc.innerHTML='';
    ab.style.display='none';
    if(cb) cb.style.display="none";
    ab.textContent='+ new folder';
    ab.onclick=jnNewFolder;
  } else if(JN.view==='list'){
    const f=JN.folders.find(x=>x.id===JN.activeFolder);
    bc.innerHTML=`<span onclick="jnGoFolders()">all folders</span><span class="sep">›</span><span>${f?f.name:''}</span>`;
    ab.style.display='';
    ab.textContent='+ add trade';
    ab.onclick=jnNewTrade;
    const sb=document.getElementById("jn-stats-btn");
    if(sb){sb.style.display="";sb.textContent="📊 stats";sb.onclick=jnGoStats;}
    if(cb) cb.style.display="";
  } else if(JN.view==="stats"){
    const f=JN.folders.find(x=>x.id===JN.activeFolder);
    bc.innerHTML=`<span onclick="jnGoFolders()">all folders</span><span class="sep">›</span><span onclick="jnGoList(JN.activeFolder)">${f?f.name:""}</span><span class="sep">›</span><span>stats</span>`;
    ab.style.display="none";
    const sb=document.getElementById("jn-stats-btn");
    if(sb){sb.style.display="";sb.textContent="← trades";sb.onclick=()=>jnGoList(JN.activeFolder);}
  } else {
    if(cb) cb.style.display="";
    const f=JN.folders.find(x=>x.id===JN.activeFolder);
    bc.innerHTML=`<span onclick="jnGoFolders()">all folders</span><span class="sep">›</span><span onclick="jnGoList(JN.activeFolder)">${f?f.name:''}</span><span class="sep">›</span><span>trade detail</span>`;
    ab.style.display='none';
  }
}


function jnExportCSV(){
  var f=JN.folders.find(function(x){return x.id===JN.activeFolder;});
  if(!f) return;
  var trades=(JN.trades[JN.activeFolder]||[]).filter(function(t){return t.status!=='draft';}).sort(function(a,b){return a.closedAt-b.closedAt;});
  if(!trades.length){showToast('No trades to export','info',2000);return;}
  function esc(v){
    var s=String(v===null||v===undefined?'':v);
    if(s.indexOf(',')!==-1||s.indexOf('"')!==-1||s.indexOf('\n')!==-1){
      return '"'+s.replace(/"/g,'""')+'"';
    }
    return s;
  }
  function fmtDate(ts){return ts?new Date(ts).toISOString().slice(0,16).replace('T',' '):'—';}
  function fmtUSD(v,decimals=2){const abs=Math.abs(parseFloat(v)||0);return '$'+abs.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});}
  var headers=['#','pair','side','type','leverage','size','entry','exit','opened','closed','hold_h','gross_pnl','fee','funding','net_pnl','pct','target','tf','exit_type','emotion','tech_notes','psych_notes','tv_open','tv_close','month','trade_no'];
  var rows=trades.map(function(t,i){
    var holdMs=(t.openedAt&&t.closedAt)?(t.closedAt-t.openedAt):0;
    var holdH=holdMs?Math.round(holdMs/360000)/10:'—';
    var gross=(t.pnl!=null&&t.fee!=null)?(t.pnl+t.fee).toFixed(4):'';
    return [
      i+1,
      t.pair||'',
      t.side||'',
      t.type||'',
      t.leverage||'',
      t.size||'',
      t.entry||'',
      t.exit||'',
      fmtDate(t.openedAt),
      fmtDate(t.closedAt),
      holdH,
      gross,
      t.fee!=null?t.fee.toFixed(4):'',
      t.funding!=null?t.funding.toFixed(4):'',
      t.pnl!=null?t.pnl.toFixed(4):'',
      t.pct!=null?t.pct.toFixed(3):'',
      t.cockpit?t.cockpit.target:'',
      t.tf||'',
      t.exitType||'',
      t.emotion||'',
      t.note||'',
      t.notePsych||'',
      t.tvUrlOpen||'',
      t.tvUrlClose||'',
      t.cockpit?t.cockpit.monthLabel:'',
      t.cockpit?t.cockpit.tradeNo:'',
    ].map(esc).join(',');
  });
  var csv=[headers.join(',')].concat(rows).join('\n');
  var blob=new Blob([csv],{type:'text/csv'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download=(f.name||'journal').replace(/[^a-z0-9_-]/gi,'_')+'_trades.csv';
  a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
  showToast('⬇ '+trades.length+' trades exported','success',2500);
}
function jnGoFolders(){JN.view='folders';JN.activeFolder=null;JN.activeTrade=null;try{localStorage.setItem('batt_jn_view','folders');localStorage.removeItem('batt_jn_folder');localStorage.removeItem('batt_jn_trade');}catch(e){}jnRender();}
function jnGoList(fid){JN.view='list';JN.activeFolder=fid;JN.activeTrade=null;try{localStorage.setItem('batt_jn_view','list');}catch(e){}jnRender();}
function jnGoStats(){JN.view="stats";try{localStorage.setItem("batt_jn_view","stats");}catch(e){}jnRender();}

function jnFolderTypeBadge(type){
  if(!type||type==='mix') return '<span class="jn-folder-row-type mix">mix</span>';
  if(type==='spot') return '<span class="jn-folder-row-type spot">spot</span>';
  return '<span class="jn-folder-row-type lev">leverage</span>';
}

function jnRenderFolders(){
  const body=document.getElementById('jn-body');
  const tpCount=TP_STATE&&TP_STATE.history?TP_STATE.history.length:0;
  const isGrid=JN.folderView!=='list';
  let html='';

  if(tpCount>0){
    html+=`<div class="jn-import-banner">
      <span>⚡</span>
      <span>${tpCount} closed trade${tpCount>1?'s':''} in Trade Panel — ready to import</span>
      <button onclick="jnImportFromTP()">import →</button>
    </div>`;
  }

  // section header with view toggle
  html+=`<div style="display:flex;align-items:center;margin-bottom:12px">
    <div class="jn-sec-title" style="margin-bottom:0;flex:1">Your Folders</div>
    <div class="jn-view-toggle">
      <button class="jn-vt-btn${isGrid?' on':''}" onclick="JN.folderView='grid';jnRenderFolders()" title="grid view">⊞</button>
      <button class="jn-vt-btn${!isGrid?' on':''}" onclick="JN.folderView='list';jnRenderFolders()" title="list view">≡</button>
    </div>
  </div>`;

  if(JN.folders.length===0){
    html+=`<div class="jn-empty">
      <div class="jn-empty-icon">📂</div>
      <div style="margin-bottom:6px;color:#888">No folders yet</div>
      <div style="font-size:10px;color:#444">Create a folder to start logging trades<br>e.g. "BTC Scalps", "May 2025", "High Leverage"</div>
    </div>`;
  }

  if(isGrid){
    html+='<div class="jn-folders">';
    JN.folders.forEach(f=>{
      const trades=JN.trades[f.id]||[];
      const wins=trades.filter(t=>t.pnl>0).length;
      const wr=trades.length?Math.round(wins/trades.length*100):0;
      const totalPnl=trades.reduce((a,t)=>a+(t.pnl||0),0);
      const pnlClass=totalPnl>=0?'up':'dn';
      const pnlStr=(totalPnl>=0?'+':'')+totalPnl.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
      const lastTrade=trades.length?new Date(trades[0].closedAt):null;
      const lastStr=lastTrade?`${lastTrade.getDate()}/${lastTrade.getMonth()+1}/${lastTrade.getFullYear()}`:'—';
      const typeColor=f.type==='spot'?'#5b7fff':f.type==='lev'?'#00c47a':'#f59e0b';
      const typeLbl=f.type==='spot'?'spot':f.type==='lev'?'leverage':'mix';
      html+=`<div class="jn-folder" onclick="jnGoList('${f.id}')">
        <div class="jn-folder-color" style="background:${f.color||'#00c47a'}"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-left:10px;margin-bottom:4px">
          <div class="jn-folder-name" style="padding-left:0;margin-bottom:0">${escHtml(f.name)}</div>
          <span style="font-size:8px;padding:1px 6px;border-radius:3px;font-weight:700;letter-spacing:.04em;background:rgba(${f.type==='spot'?'91,127,255':f.type==='lev'?'0,196,122':'245,158,11'},.1);color:${typeColor};flex-shrink:0;margin-left:6px">${typeLbl}</span>
        </div>
        <div class="jn-folder-meta">
          <span>${trades.length} trade${trades.length!==1?'s':''}</span>
          ${trades.length?`<span>${wr}% WR</span>`:''}
          <span style="color:#555">last: ${lastStr}</span>
        </div>
        ${trades.length?`<div class="jn-folder-pnl ${pnlClass}">$${pnlStr}</div>`:'<div style="height:4px"></div>'}
        <div class="jn-folder-tags">${(f.tags||[]).map(t=>`<span class="jn-tag">${t}</span>`).join('')}</div>
        <div style="position:absolute;top:8px;right:8px;display:flex;gap:3px;opacity:0;transition:opacity .15s" class="jn-folder-acts">
          <button class="jn-btn-sm" onclick="event.stopPropagation();jnEditFolder('${f.id}')" style="padding:2px 5px;font-size:8px">✏</button>
          <button class="jn-btn-sm danger" onclick="event.stopPropagation();jnDeleteFolder('${f.id}')" style="padding:2px 5px;font-size:8px">✕</button>
        </div>
      </div>`;
    });
    html+=`<div class="jn-folder jn-folder-new" onclick="jnNewFolder()">
      <span style="font-size:18px;color:#444">+</span>
      <span>new folder</span>
    </div>`;
    html+='</div>';
    // show action buttons on hover via JS (CSS hover on parent)
  } else {
    // list view
    html+='<div class="jn-folders-list">';
    JN.folders.forEach(f=>{
      const trades=JN.trades[f.id]||[];
      const wins=trades.filter(t=>t.pnl>0).length;
      const wr=trades.length?Math.round(wins/trades.length*100):0;
      const totalPnl=trades.reduce((a,t)=>a+(t.pnl||0),0);
      const pnlClass=totalPnl>=0?'up':'dn';
      const pnlStr=(totalPnl>=0?'+':'')+totalPnl.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
      const lastTrade=trades.length?new Date(Math.max(...trades.map(t=>t.closedAt))):null;
      const createdAt=f.createdAt?new Date(f.createdAt):null;
      const lastStr=lastTrade?`${lastTrade.getDate()}/${lastTrade.getMonth()+1}/${lastTrade.getFullYear()}`:'no trades';
      const createdStr=createdAt?`${createdAt.getDate()}/${createdAt.getMonth()+1}/${createdAt.getFullYear()}`:'';
      html+=`<div class="jn-folder-row" onclick="jnGoList('${f.id}')">
        <div class="jn-folder-row-accent" style="background:${f.color||'#00c47a'}"></div>
        <div class="jn-folder-row-name">${escHtml(f.name)}</div>
        ${jnFolderTypeBadge(f.type)}
        <div class="jn-folder-row-meta">
          <span style="color:#aaa">${trades.length} trade${trades.length!==1?'s':''}</span>
          ${trades.length?`<span style="color:${wr>=50?'#00c47a':'#e05555'}">${wr}% WR</span>`:''}
          <span style="color:#666">last: ${lastStr}</span>
          ${createdStr?`<span style="color:#555">created: ${createdStr}</span>`:''}
        </div>
        <div class="jn-folder-row-pnl ${pnlClass}">${trades.length?'$'+pnlStr:'—'}</div>
        <div class="jn-folder-row-actions">
          <button class="jn-btn-sm" onclick="event.stopPropagation();jnEditFolder('${f.id}')" style="padding:2px 5px;font-size:8px">✏</button>
          <button class="jn-btn-sm danger" onclick="event.stopPropagation();jnDeleteFolder('${f.id}')" style="padding:2px 5px;font-size:8px">✕</button>
        </div>
      </div>`;
    });
    html+=`<div class="jn-folder-row" onclick="jnNewFolder()" style="border-style:dashed;justify-content:center;gap:8px;color:#666;font-size:11px;outline:none">
      <span>+</span><span>new folder</span>
    </div>`;
    html+='</div>';
  }

  body.innerHTML=html;

  // show folder action buttons on card hover
  if(isGrid){
    body.querySelectorAll('.jn-folder:not(.jn-folder-new)').forEach(card=>{
      const acts=card.querySelector('.jn-folder-acts');
      if(acts){
        card.addEventListener('mouseenter',()=>acts.style.opacity='1');
        card.addEventListener('mouseleave',()=>acts.style.opacity='0');
      }
    });
  }
}

function jnRenderList(){
  const body=document.getElementById('jn-body');
  const f=JN.folders.find(x=>x.id===JN.activeFolder);
  if(!f){jnGoFolders();return;}
  const allTrades=(JN.trades[JN.activeFolder]||[]).slice();
  const drafts=allTrades.filter(t=>t.status==='draft').sort((a,b)=>b.createdAt-a.createdAt);
  const trades=allTrades.filter(t=>t.status!=='draft').sort((a,b)=>a.closedAt-b.closedAt);

  const wins=trades.filter(t=>t.pnl>0).length;
  const losses=trades.filter(t=>t.pnl<=0).length;
  const wr=trades.length?Math.round(wins/trades.length*100):0;
  const totalPnl=trades.reduce((a,t)=>a+(t.pnl||0),0);
  const avgPnl=trades.length?totalPnl/trades.length:0;
  const totalFees=trades.reduce((a,t)=>a+(t.fee||0),0);

  let html=`<div class="jn-stats-bar">
    <div class="jn-stat"><div class="jn-stat-lbl">trades</div><div class="jn-stat-val">${trades.length}</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">win rate</div><div class="jn-stat-val ${wr>=50?'up':'dn'}">${wr}%</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">W / L</div><div class="jn-stat-val">${wins}<span style="color:#1e1e1e;font-weight:400"> / </span>${losses}</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">total PnL</div><div class="jn-stat-val ${totalPnl>=0?'up':'dn'}">${totalPnl>=0?'+':''}$${(totalPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">avg PnL</div><div class="jn-stat-val ${avgPnl>=0?'up':'dn'}">${avgPnl>=0?'+':''}$${(avgPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
    <div class="jn-stat"><div class="jn-stat-lbl">fees paid</div><div class="jn-stat-val" style="color:${totalFees>0?'#e05555':'#555'}">-$${(totalFees).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
  </div>`;

  if(drafts.length>0){
    html+=`<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;background:#0d1a10;border:1px solid #00c47a22;border-radius:7px 7px 0 0">
        <span style="font-size:10px;font-weight:800;color:#00c47a">● OPEN POSITIONS</span>
        <span style="font-size:9px;color:#2a5a3a">${drafts.length} running</span>
        <span style="font-size:9px;color:#1e3a22;margin-left:auto">click to close & lock</span>
      </div>
      <div class="jn-list-wrap" style="border-radius:0 0 7px 7px;border-top:none">`;
    drafts.forEach(t=>{
      const d=new Date(t.openedAt||t.createdAt);
      const ds=`${d.getDate()}/${d.getMonth()+1} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      html+=`<div class="jn-trade-row" onclick="ljOpenDraftToClose('${t.id}','${JN.activeFolder}')" style="border-left:2px solid #00c47a;cursor:pointer">
        <div class="jn-tc date" style="display:flex;align-items:center;gap:6px">
          <span style="font-size:8px;background:#00c47a22;color:#00c47a;border:1px solid #00c47a33;border-radius:3px;padding:1px 5px;font-weight:700">OPEN</span>${ds}
        </div>
        <div class="jn-tc pair">${t.pair||'—'}<span style="font-size:8px;color:#00c47a;background:rgba(0,196,122,0.08);border:1px solid rgba(0,196,122,0.15);border-radius:3px;padding:1px 5px;margin-left:4px;font-weight:700">⚡ cockpit</span></div>
        <div class="jn-tc"><span class="${t.side==='long'?'jn-side-long':'jn-side-short'}">${(t.side||'long').toUpperCase()}</span></div>
        <div class="jn-tc">$${(parseFloat(t.entry||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div>
        <div class="jn-tc" style="color:#333;font-size:9px">running…</div>
        <div class="jn-tc">$${parseFloat(t.size||0).toFixed(0)}</div>
        <div class="jn-tc" style="color:#555;font-size:9px">not closed</div>
        <div class="jn-tc" style="color:#555">—</div>
        <div class="jn-tc">${t.emotion||'—'}</div>
        <div><button class="jn-btn-sm danger" onclick="event.stopPropagation();jnDeleteTrade('${t.id}')" style="padding:2px 5px;font-size:8px">✕</button></div>
      </div>`;
    });
    html+=`</div></div>`;
  }

  if(trades.length===0&&drafts.length===0){
    html+=`<div class="jn-empty">
      <div class="jn-empty-icon">📝</div>
      <div style="margin-bottom:8px">No trades yet</div>
      <div style="font-size:10px;color:#222">Lock a trade from the cockpit or save an open position</div>
    </div>`;
  } else if(trades.length>0){
    const buckets={};
    trades.forEach(t=>{const b=t.bucket||1;if(!buckets[b])buckets[b]=[];buckets[b].push(t);});
    const bucketNums=Object.keys(buckets).map(Number).sort((a,b)=>a-b);
    let tradeNum=0;
    bucketNums.forEach(bn=>{
      const bTrades=buckets[bn];
      const bWins=bTrades.filter(t=>t.pnl>0).length;
      const bPnl=bTrades.reduce((a,t)=>a+(t.pnl||0),0);
      const bWr=bTrades.length?Math.round(bWins/bTrades.length*100):0;
      const firstCockpit=bTrades.find(t=>t.cockpit);
      const monthLbl=firstCockpit
        ?(firstCockpit.cockpit.monthLabel||gs().ML[firstCockpit.cockpit.month]||('M'+String(firstCockpit.cockpit.month).padStart(2,'0')))
        :('batch '+bn);
      html+=`<div style="display:flex;align-items:center;gap:10px;padding:7px 14px;background:#111;border:1px solid #1e1e1e;border-radius:7px 7px 0 0;margin-top:${bn>bucketNums[0]?'16px':'0'}">
        <span style="font-size:11px;font-weight:800;color:#ccc">${escHtml(monthLbl)}</span>
        <span style="font-size:9px;color:#555">${bTrades.length} trade${bTrades.length!==1?'s':''}</span>
        <span style="font-size:9px;font-weight:700;color:${bWr>=50?'#00c47a':'#e05555'}">${bWr}% WR</span>
        <span style="font-size:9px;font-weight:700;color:${bPnl>=0?'#00c47a':'#e05555'};margin-left:auto">${bPnl>=0?'+':''}$${(bPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
      </div>
      <div class="jn-list-wrap" style="border-radius:0 0 7px 7px;border-top:none">`;
      bTrades.forEach(t=>{
        tradeNum++;
        const d=new Date(t.closedAt);
        const ds=`${d.getDate()}/${d.getMonth()+1} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        const pCls=t.pnl>=0?'win':'loss';
        const pnlStr=(t.pnl>=0?'+':'')+parseFloat(t.pnl||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
        const pctStr=(t.pct>=0?'+':'')+parseFloat(t.pct||0).toFixed(1)+'%';
        const isCockpit=t.source==='cockpit'&&t.cockpit;
        const cockpitTag=isCockpit?`<span style="font-size:8px;color:#00c47a;background:rgba(0,196,122,0.08);border:1px solid rgba(0,196,122,0.15);border-radius:3px;padding:1px 5px;margin-left:4px;font-weight:700">⚡ cockpit</span>`:`<span style="font-size:8px;color:#2a2a2a;border:1px solid #1e1e1e;border-radius:3px;padding:1px 5px;margin-left:4px">manual</span>`;
        html+=`<div class="jn-trade-row" onclick="jnOpenTrade('${t.id}')">
          <div class="jn-tc date" style="display:flex;align-items:center;gap:6px"><span style="font-size:9px;color:#2a2a2a;font-weight:700;min-width:16px">${tradeNum}.</span>${ds}</div>
          <div class="jn-tc pair">${t.pair||'—'}${cockpitTag}</div>
          <div class="jn-tc"><span class="${t.side==='long'?'jn-side-long':'jn-side-short'}">${(t.side||'long').toUpperCase()}</span></div>
          <div class="jn-tc">$${(parseFloat(t.entry||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div class="jn-tc">$${(parseFloat(t.exit||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div class="jn-tc">$${parseFloat(t.size||0).toFixed(0)}</div>
          <div class="jn-tc ${pCls}">$${pnlStr}</div>
          <div class="jn-tc ${pCls}">${pctStr}</div>
          <div class="jn-tc jn-emotion">${t.emotion||'—'}</div>
          <div><button class="jn-btn-sm danger" onclick="event.stopPropagation();jnDeleteTrade('${t.id}')" style="padding:2px 5px;font-size:8px">✕</button></div>
        </div>`;
      });
      html+='</div>';
    });
  }
  body.innerHTML=html;
}

function jnRenderStats(){
  const body=document.getElementById("jn-body");
  const trades=(JN.trades[JN.activeFolder]||[]).filter(t=>t.status!=="draft");
  if(!trades.length){body.innerHTML=`<div class="jn-empty"><div class="jn-empty-icon">📊</div><div>No trades to analyze yet</div></div>`;return;}
  const sorted=trades.slice().sort((a,b)=>a.closedAt-b.closedAt);
  // core stats
  const wins=sorted.filter(t=>t.pnl>0);
  const losses=sorted.filter(t=>t.pnl<=0);
  const wr=Math.round(wins.length/sorted.length*100);
  const totalPnl=sorted.reduce((a,t)=>a+(t.pnl||0),0);
  const totalFees=sorted.reduce((a,t)=>a+(t.fee||0),0);
  const totalFunding=sorted.reduce((a,t)=>a+(t.funding||0),0);
  const avgWin=wins.length?wins.reduce((a,t)=>a+(t.pnl||0),0)/wins.length:0;
  const avgLoss=losses.length?losses.reduce((a,t)=>a+(t.pnl||0),0)/losses.length:0;
  const rr=avgLoss!==0?Math.abs(avgWin/avgLoss):0;
  const bestTrade=sorted.reduce((a,t)=>(t.pnl||0)>(a.pnl||0)?t:a,sorted[0]);
  const worstTrade=sorted.reduce((a,t)=>(t.pnl||0)<(a.pnl||0)?t:a,sorted[0]);
  // streaks
  let maxWS=0,maxLS=0,curWS=0,curLS=0;
  sorted.forEach(t=>{if(t.pnl>0){curWS++;curLS=0;maxWS=Math.max(maxWS,curWS);}else{curLS++;curWS=0;maxLS=Math.max(maxLS,curLS);}});
  // avg hold time
  const holds=sorted.filter(t=>t.openedAt&&t.closedAt&&t.closedAt>t.openedAt);
  const avgHoldMs=holds.length?holds.reduce((a,t)=>a+(t.closedAt-t.openedAt),0)/holds.length:0;
  const avgHoldH=Math.round(avgHoldMs/3600000*10)/10;
  // per-bucket (month) pnl for bar chart
  const buckets={};
  sorted.forEach(t=>{const b=t.bucket||1;if(!buckets[b])buckets[b]={pnl:0,wins:0,total:0,label:""};
    const f=JN.folders.find(x=>x.id===JN.activeFolder);
    const mc=t.cockpit?t.cockpit.monthLabel:("M"+String(b).padStart(2,"0"));
    buckets[b].label=mc;buckets[b].pnl+=(t.pnl||0);buckets[b].total++;if(t.pnl>0)buckets[b].wins++;});
  const bKeys=Object.keys(buckets).map(Number).sort((a,b)=>a-b);
  const bVals=bKeys.map(k=>buckets[k]);
  const maxAbsPnl=Math.max(...bVals.map(b=>Math.abs(b.pnl)),1);
  // side breakdown
  const longs=sorted.filter(t=>t.side==="long");
  const shorts=sorted.filter(t=>t.side==="short");
  const longPnl=longs.reduce((a,t)=>a+(t.pnl||0),0);
  const shortPnl=shorts.reduce((a,t)=>a+(t.pnl||0),0);
  const fmt=v=>(v>=0?"+":"")+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtM=v=>(v>=0?"+$":"-$")+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  // bar chart SVG
  const bw=Math.max(18,Math.min(40,Math.floor(520/Math.max(bVals.length,1))-6));
  const barsW=bVals.length*(bw+6);
  const barsSvg=bVals.length?`<svg viewBox="0 0 ${Math.max(barsW,200)} 120" preserveAspectRatio="xMinYMid meet" style="width:100%;max-height:120px">
    ${bVals.map((b,i)=>{
      const h=Math.round(Math.abs(b.pnl)/maxAbsPnl*80);
      const x=i*(bw+6);
      const isPos=b.pnl>=0;
      const y=isPos?(95-h):95;
      const col=isPos?"#00c47a":"#e05555";
      const wr2=b.total?Math.round(b.wins/b.total*100):0;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h,2)}" fill="${col}" rx="2" opacity="0.85"/>
        <text x="${x+bw/2}" y="115" text-anchor="middle" font-size="7" fill="#444" font-family="Trebuchet MS,sans-serif">${b.label||("M"+i)}</text>
        <text x="${x+bw/2}" y="${isPos?y-3:y+h+9}" text-anchor="middle" font-size="7" fill="${col}" font-family="Trebuchet MS,sans-serif">${b.pnl>=0?"+":""}${b.pnl.toFixed(0)}</text>`;
    }).join("")}
    <line x1="0" y1="95" x2="${Math.max(barsW,200)}" y2="95" stroke="#222" stroke-width="0.5"/>
  </svg>`:"<div style=\"color:#333;font-size:10px;text-align:center;padding:20px\">not enough data</div>";
  body.innerHTML=`
  <div style="padding:20px;max-width:860px;margin:0 auto">
    <!-- stat cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      ${[
        ["win rate",wr+"%",wr>=50?"#00c47a":"#e05555"],
        ["trades",sorted.length,"#ccc"],
        ["W / L",wins.length+" / "+losses.length,"#ccc"],
        ["total PnL",fmtM(totalPnl),totalPnl>=0?"#00c47a":"#e05555"],
        ["avg RR",(rr).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+"×",rr>=1?"#00c47a":"#e05555"],
        ["avg win",fmtM(avgWin),"#00c47a"],
        ["avg loss",fmtM(avgLoss),"#e05555"],
        ["best trade",fmtM(bestTrade.pnl||0),"#00c47a"],
        ["worst trade",fmtM(worstTrade.pnl||0),"#e05555"],
        ["win streak",maxWS+"×","#ccc"],
        ["loss streak",maxLS+"×","#ccc"],
        ["avg hold",avgHoldH+"h","#ccc"],
        ["fees drag","-$"+totalFees.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),"#e05555"],
        ["funding",totalFunding>=0?"-$"+totalFunding.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):"+$"+Math.abs(totalFunding).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),totalFunding>=0?"#e05555":"#00c47a"],
      ].map(([lbl,val,col])=>`<div style="background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:12px 14px">
        <div style="font-size:8px;color:#444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">${lbl}</div>
        <div style="font-size:15px;font-weight:800;color:${col}">${val}</div>
      </div>`).join("")}
    </div>
    <!-- bar chart -->
    <div style="background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;font-weight:700">PnL by month</div>
      <div style="overflow-x:auto">${barsSvg}</div>
    </div>
    <!-- side breakdown -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:14px">
        <div style="font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;font-weight:700">long vs short</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:#00c47a;font-weight:700">▲ LONG</span>
            <span style="font-size:10px;color:#555">${longs.length} trades</span>
            <span style="font-size:11px;font-weight:800;color:${longPnl>=0?"#00c47a":"#e05555"}">${fmtM(longPnl)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:#e05555;font-weight:700">▼ SHORT</span>
            <span style="font-size:10px;color:#555">${shorts.length} trades</span>
            <span style="font-size:11px;font-weight:800;color:${shortPnl>=0?"#00c47a":"#e05555"}">${fmtM(shortPnl)}</span>
          </div>
        </div>
      </div>
      <div style="background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:14px">
        <div style="font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;font-weight:700">best & worst</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:#555">🏆 best</span>
            <span style="font-size:10px;color:#555">${bestTrade.pair||"—"}</span>
            <span style="font-size:11px;font-weight:800;color:#00c47a">${fmtM(bestTrade.pnl||0)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:#555">💀 worst</span>
            <span style="font-size:10px;color:#555">${worstTrade.pair||"—"}</span>
            <span style="font-size:11px;font-weight:800;color:#e05555">${fmtM(worstTrade.pnl||0)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
function jnRenderDetail(){
  const body=document.getElementById('jn-body');
  const trades=JN.trades[JN.activeFolder]||[];
  const t=trades.find(x=>x.id===JN.activeTrade);
  if(!t){jnGoList(JN.activeFolder);return;}
  const pc=t.pnl>=0?'up':'dn';
  const pcColor=t.pnl>=0?'#00c47a':'#e05555';
  const d=new Date(t.closedAt);
  const dateStr=`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

  // ── hold duration ──
  const holdMs=t.openedAt&&t.closedAt?(t.closedAt-t.openedAt):0;
  const holdH=Math.floor(holdMs/3600000);
  const holdMin=Math.floor((holdMs%3600000)/60000);
  const holdD=Math.floor(holdH/24);
  const holdHr=holdH%24;
  const holdStr=holdMs>0?(holdD>0?`${holdD}d ${holdHr}h ${holdMin}m`:holdH>0?`${holdH}h ${holdMin}m`:`${holdMin}m`):'—';
  const fundIntervals=holdMs>0?Math.floor(holdH/8):0;
  const entry=parseFloat(t.entry||0);
  const exit=parseFloat(t.exit||0);
  const notional=parseFloat(t.size||0);
  const lev=parseFloat(t.leverage||1);
  const margin=lev>1?notional/lev:notional;

  // raw price move — direction-aware
  const rawMovePct=entry>0?((exit-entry)/entry*100):0;
  const directedMovePct=t.side==='long'?rawMovePct:-rawMovePct; // positive = winning direction
  const absPricePct=Math.abs(rawMovePct);

  // RR — actual vs what was needed
  const ck=t.cockpit||null;
  const projTargetPct=ck?(ck.target||0):0; // projected % (of notional)
  const actualMarginPct=parseFloat(t.pct||0); // % return on margin
  const actualNotionalPct=entry>0?(directedMovePct*lev):0; // levered price move

  // how far from target
  const vsTarget=ck?((directedMovePct*lev)-projTargetPct):null; // actual levered % vs projected %
  const vsTargetColor=vsTarget===null?'#555':vsTarget>=0?'#00c47a':'#e05555';

  // beat/miss label
  let outcomeLabel='';
  let outcomeColor='#555';
  if(ck&&entry>0){
    const needed=projTargetPct/(lev||1)/100*entry; // price move needed
    const actual=Math.abs(exit-entry);
    if(t.pnl>=0&&directedMovePct>0){
      outcomeLabel=directedMovePct*lev>=projTargetPct?'✓ target hit':'✓ win · below target';
      outcomeColor='#00c47a';
    } else {
      outcomeLabel='✕ loss';
      outcomeColor='#e05555';
    }
  }

  // TradingView — side by side open/close
  let tvHtml='';
  const hasOpen=t.tvUrlOpen&&t.tvUrlOpen.includes('tradingview.com/x/');
  const hasClose=t.tvUrlClose&&t.tvUrlClose.includes('tradingview.com/x/');
  const hasLegacy=!hasOpen&&!hasClose&&t.tvUrl&&t.tvUrl.includes('tradingview.com');
  if(hasOpen||hasClose||hasLegacy){
    if(hasLegacy){
      // old single URL — show full width
      tvHtml=`<div style="margin-bottom:16px">
        <div class="jn-sec-title" style="margin-bottom:8px">chart proof <a href="${escHtml(t.tvUrl)}" target="_blank" style="color:#5b7fff;font-size:9px;font-weight:600;text-transform:none;letter-spacing:0;margin-left:6px">open ↗</a></div>
        <img src="${escHtml(t.tvUrl)}" style="width:100%;border-radius:8px;border:1px solid #1e1e1e;display:block" alt="chart" onerror="this.style.display='none'">
      </div>`;
    } else {
      // new side-by-side open/close
      const openHtml=hasOpen?`
        <div>
          <div style="font-size:8px;color:#2a2a2a;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em">proof open <a href="${escHtml(t.tvUrlOpen)}" target="_blank" style="color:#5b7fff;font-size:8px;font-weight:600;text-transform:none;letter-spacing:0;margin-left:4px">↗</a></div>
          <img src="${escHtml(t.tvUrlOpen)}" style="width:100%;border-radius:7px;border:1px solid #1e1e1e;display:block" alt="open chart" onerror="this.style.display='none'">
        </div>`:'<div style="display:flex;align-items:center;justify-content:center;height:80px;border:1px solid #1a1a1a;border-radius:7px;color:#2a2a2a;font-size:10px">no open proof</div>';
      const closeHtml=hasClose?`
        <div>
          <div style="font-size:8px;color:#2a2a2a;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em">proof close <a href="${escHtml(t.tvUrlClose)}" target="_blank" style="color:#5b7fff;font-size:8px;font-weight:600;text-transform:none;letter-spacing:0;margin-left:4px">↗</a></div>
          <img src="${escHtml(t.tvUrlClose)}" style="width:100%;border-radius:7px;border:1px solid #1e1e1e;display:block" alt="close chart" onerror="this.style.display='none'">
        </div>`:'<div style="display:flex;align-items:center;justify-content:center;height:80px;border:1px solid #1a1a1a;border-radius:7px;color:#2a2a2a;font-size:10px">no close proof</div>';
      tvHtml=`<div style="margin-bottom:16px">
        <div class="jn-sec-title" style="margin-bottom:10px">chart proof</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${openHtml}
          ${closeHtml}
        </div>
      </div>`;
    }
  }

  // cockpit projection — actual vs projected overlay
  let cockpitHtml='';
  if(ck){
    const projPnl=ck.netPnl||0;
    const actualPnl=t.pnl||0;
    const diffPnl=actualPnl-projPnl;
    const diffColor=diffPnl>=0?'#00c47a':'#e05555';
    const diffSign=diffPnl>=0?'+':'';

    cockpitHtml=`<div style="margin-bottom:20px">
      <div class="jn-sec-title" style="margin-bottom:10px">cockpit projection vs actual</div>
      <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:8px;overflow:hidden">
        <!-- header row -->
        <div style="display:grid;grid-template-columns:140px 1fr 1fr 1fr;border-bottom:1px solid #1a1a1a">
          <div style="padding:7px 12px;font-size:8px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700"></div>
          <div style="padding:7px 12px;font-size:8px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700;border-left:1px solid #1a1a1a">projected</div>
          <div style="padding:7px 12px;font-size:8px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700;border-left:1px solid #1a1a1a">actual</div>
          <div style="padding:7px 12px;font-size:8px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700;border-left:1px solid #1a1a1a">diff</div>
        </div>
        <!-- target % row -->
        <div style="display:grid;grid-template-columns:140px 1fr 1fr 1fr;border-bottom:1px solid #141414">
          <div style="padding:9px 12px;font-size:9px;color:#444;font-weight:600">target % (levered)</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:#00c47a;border-left:1px solid #141414">${(projTargetPct).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}%</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${(directedMovePct*lev)>=0?'#00c47a':'#e05555'};border-left:1px solid #141414">${(directedMovePct*lev)>=0?'+':''}${((directedMovePct*lev)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}%</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${vsTargetColor};border-left:1px solid #141414">${vsTarget!==null?(vsTarget>=0?'+':''()+vsTarget).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—'}</div>
        </div>
        <!-- net PnL row -->
        <div style="display:grid;grid-template-columns:140px 1fr 1fr 1fr;border-bottom:1px solid #141414">
          <div style="padding:9px 12px;font-size:9px;color:#444;font-weight:600">net PnL</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${projPnl>=0?'#00c47a':'#e05555'};border-left:1px solid #141414">${projPnl>=0?'+':''}$${(projPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${actualPnl>=0?'#00c47a':'#e05555'};border-left:1px solid #141414">${actualPnl>=0?'+':''}$${(actualPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:${diffColor};border-left:1px solid #141414">${diffSign}$${(diffPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div>
        </div>
        <!-- margin row — updated with actual -->
        <div style="display:grid;grid-template-columns:140px 1fr 1fr 1fr">
          <div style="padding:9px 12px;font-size:9px;color:#444;font-weight:600">margin used</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:#666;border-left:1px solid #141414">$${((notional/(ck.lev||1))).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div style="padding:9px 12px;font-size:12px;font-weight:700;color:#888;border-left:1px solid #141414">$${(margin).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div style="padding:9px 12px;font-size:10px;font-weight:600;color:#333;border-left:1px solid #141414">same</div>
        </div>
      </div>
      <!-- outcome badge -->
      ${outcomeLabel?`<div style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;background:${t.pnl>=0?'rgba(0,196,122,0.07)':'rgba(224,85,85,0.07)'};border:1px solid ${t.pnl>=0?'rgba(0,196,122,0.15)':'rgba(224,85,85,0.15)'}">
        <span style="font-size:10px;font-weight:700;color:${outcomeColor}">${outcomeLabel}</span>
        <span style="font-size:9px;color:#444">·</span>
        <span style="font-size:9px;color:#555">tab ${ck.tab} · ${ck.monthLabel||'M'+ck.month} · T${ck.tradeNo}</span>
      </div>`:''}
    </div>`;
  }

  body.innerHTML=`
    <div class="jn-detail">

      <!-- HEADER -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
        <div style="font-size:22px;font-weight:800;color:#e8e8e8;letter-spacing:-.02em">${escHtml(t.pair||'—')}</div>
        <span class="${t.side==='long'?'jn-side-long':'jn-side-short'}" style="font-size:9px;padding:3px 9px">${(t.side||'').toUpperCase()}</span>
        ${t.leverage>1?`<span style="font-size:9px;color:#888;background:#1a1a1a;padding:2px 8px;border-radius:3px;border:1px solid #222;font-weight:700">${t.leverage}×</span>`:''}
        ${t.tf?`<span style="font-size:9px;color:#5b7fff;background:rgba(91,127,255,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(91,127,255,0.2);font-weight:700">${t.tf}</span>`:''}
        ${(()=>{
          if(!t.tf) return '';
          const m2=t.tf.match(/^(\d+(?:\.\d+)?)\s*(m|h|D|W)$/i);
          if(!m2) return '';
          const n=parseFloat(m2[1]),u=m2[2].toUpperCase();
          const mins=u==='M'?n:u==='H'?n*60:u==='D'?n*1440:u==='W'?n*10080:0;
          if(!mins) return '';
          const v=mins<5?'⚡ scalper':mins<60?'🔥 intraday':mins<1440?'📈 swing':'🏔 position trader';
          return `<span style="font-size:9px;color:#1D9E75;background:rgba(29,158,117,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(29,158,117,0.2);font-weight:700">${v}</span>`;
        })()}
        ${t.exitType?`<span style="font-size:9px;color:#EF9F27;background:rgba(239,159,39,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(239,159,39,0.2);font-weight:700">${t.exitType}</span>`:''}
        ${t.setupType?`<span style="font-size:9px;color:#a855f7;background:rgba(168,85,247,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(168,85,247,0.2);font-weight:700">${t.setupType}</span>`:''}
        ${t.sl?`<span style="font-size:9px;color:#e05555;background:rgba(224,85,85,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(224,85,85,0.2);font-weight:700">SL $${parseFloat(t.sl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</span>`:''}
        ${t.rr?`<span style="font-size:9px;color:#5b7fff;background:rgba(91,127,255,0.08);padding:2px 8px;border-radius:3px;border:1px solid rgba(91,127,255,0.2);font-weight:700">RR ${t.rr}</span>`:''}
        ${outcomeLabel?`<span style="font-size:10px;font-weight:700;padding:2px 10px;border-radius:4px;background:${t.pnl>=0?'rgba(0,196,122,0.08)':'rgba(224,85,85,0.08)'};color:${outcomeColor}">${outcomeLabel}</span>`:''}
        ${t.emotion?`<span style="font-size:18px">${t.emotion}</span>`:''}
        <span style="font-size:9px;color:#2a2a2a;margin-left:auto">${dateStr}</span>
        ${t.source==='cockpit'?`<span style="font-size:8px;color:#00c47a;background:rgba(0,196,122,0.06);padding:2px 7px;border:1px solid rgba(0,196,122,0.15);border-radius:3px;font-weight:700">⚡ cockpit</span>`:'<span style="font-size:8px;color:#2a2a2a;padding:2px 6px;border:1px solid #1a1a1a;border-radius:3px">manual</span>'}
      </div>

      <!-- TIMING STRIP -->
      ${(()=>{
        const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const closeD=new Date(t.closedAt);
        const openD=t.openedAt?new Date(t.openedAt):null;
        const fmtDt=dt=>`${dt.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]} ${dt.getFullYear()} · ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        const closeH=closeD.getUTCHours();
        const session=closeH<8?'Asia session':closeH<16?'London session':'NY session';
        return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;padding:10px 14px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px">
          <div>
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">opened</div>
            <div style="font-size:10px;font-weight:600;color:#888">${openD?fmtDt(openD):'—'}</div>
            ${openD?`<div style="font-size:8px;color:#333;margin-top:1px">${days[openD.getDay()]}</div>`:''}
          </div>
          <div>
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">closed</div>
            <div style="font-size:10px;font-weight:600;color:#888">${fmtDt(closeD)}</div>
            <div style="font-size:8px;color:#333;margin-top:1px">${days[closeD.getDay()]} · ${session}</div>
          </div>
          <div>
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">held</div>
            <div style="font-size:14px;font-weight:700;color:#aaa">${holdStr}</div>
            <div style="font-size:8px;color:#333;margin-top:1px">${fundIntervals>0?'~'+fundIntervals+' funding interval'+(fundIntervals!==1?'s':''):'no intervals'}</div>
          </div>
        </div>`;
      })()}

      <!-- PNL HERO -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:#0a0a0a;border:1px solid ${pcColor}22;border-radius:8px;padding:16px">
          <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">net PnL · all-in</div>
          <div style="font-size:26px;font-weight:900;color:${pcColor};letter-spacing:-.02em;line-height:1">${t.pnl>=0?'+':''}$${(parseFloat(t.pnl||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div>
          <div style="font-size:12px;color:${pcColor};opacity:.6;margin-top:6px">${actualMarginPct>=0?'+':''}${(actualMarginPct).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}% on margin</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">entry</div>
            <div style="font-size:11px;font-weight:700;color:#ccc">$${entry.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:6})}</div>
          </div>
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">exit</div>
            <div style="font-size:11px;font-weight:700;color:#ccc">$${exit.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:6})}</div>
          </div>
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">notional</div>
            <div style="font-size:11px;font-weight:700;color:#888">$${notional.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          </div>
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">margin</div>
            <div style="font-size:11px;font-weight:700;color:#888">$${(margin).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          </div>
        </div>
      </div>

      <!-- COST BREAKDOWN -->
      <div style="margin-bottom:16px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden">
        <div style="padding:7px 14px;border-bottom:1px solid #141414;font-size:7px;color:#2a2a2a;text-transform:uppercase;letter-spacing:.07em;font-weight:700">cost breakdown</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr)">
          <div style="padding:12px 14px;border-right:1px solid #141414">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">gross PnL</div>
            ${(()=>{const g=entry>0?(t.side==='long'?exit-entry:entry-exit)/entry*notional:0;return `<div style="font-size:12px;font-weight:700;color:${g>=0?'#00c47a':'#e05555'}">${g>=0?'+':''}$${(Math.abs(g)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div>`;})()}
          </div>
          <div style="padding:12px 14px;border-right:1px solid #141414">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">fee paid</div>
            <div style="font-size:12px;font-weight:700;color:#e05555">-$${(parseFloat(t.fee||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div>
            <div style="font-size:8px;color:#2a2a2a;margin-top:2px">open + close</div>
          </div>
          <div style="padding:12px 14px;border-right:1px solid #141414">
            ${(()=>{const fn=parseFloat(t.funding||0);
              if(fn<0) return `<div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">funding</div><div style="font-size:12px;font-weight:700;color:#00c47a">+$${(Math.abs(fn)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div><div style="font-size:8px;color:#2a5a3a;margin-top:2px">received ✓</div>`;
              if(fn>0) return `<div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">funding paid</div><div style="font-size:12px;font-weight:700;color:#e05555">-$${(fn).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div><div style="font-size:8px;color:#2a2a2a;margin-top:2px">${fundIntervals} intervals</div>`;
              return `<div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">funding</div><div style="font-size:12px;font-weight:700;color:#222">$0.0000</div><div style="font-size:8px;color:#2a2a2a;margin-top:2px">none</div>`;
            })()}
          </div>
          <div style="padding:12px 14px">
            <div style="font-size:7px;color:#333;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">total cost</div>
            <div style="font-size:12px;font-weight:700;color:#e05555">-$${(parseFloat(t.fee||0)+Math.max(0,(parseFloat(t.funding||0)))).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</div>
            <div style="font-size:8px;color:#2a2a2a;margin-top:2px">fee + funding</div>
          </div>
        </div>
      </div>

      <!-- PRICE MOVE ANALYSIS -->
      ${entry>0&&exit>0?`<div style="margin-bottom:16px">
        <div class="jn-sec-title" style="margin-bottom:10px">price move analysis</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden">
          <div class="jn-detail-field">
            <div class="jn-detail-lbl">raw move</div>
            <div class="jn-detail-val" style="color:${rawMovePct>=0?'#00c47a':'#e05555'};font-weight:800">${rawMovePct>=0?'+':''}${(rawMovePct).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}%</div>
            <div style="font-size:8px;color:#333;margin-top:2px">${exit>entry?'↑ price up':'↓ price down'}</div>
          </div>
          <div class="jn-detail-field">
            <div class="jn-detail-lbl">directed (${t.side})</div>
            <div class="jn-detail-val" style="color:${directedMovePct>=0?'#00c47a':'#e05555'};font-weight:800">${directedMovePct>=0?'+':''}${(directedMovePct).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}%</div>
            <div style="font-size:8px;color:#333;margin-top:2px">${directedMovePct>=0?'with you':'against you'}</div>
          </div>
          <div class="jn-detail-field">
            <div class="jn-detail-lbl">levered (${lev}×)</div>
            <div class="jn-detail-val" style="color:${directedMovePct*lev>=0?'#00c47a':'#e05555'};font-weight:800">${(directedMovePct*lev)>=0?'+':''}${(directedMovePct*lev).toFixed(3)}%</div>
            <div style="font-size:8px;color:#333;margin-top:2px">price × lev</div>
          </div>
          <div class="jn-detail-field">
            <div class="jn-detail-lbl">needed for target</div>
            <div class="jn-detail-val" style="color:${ck&&projTargetPct>0?'#555':'#222'}">${ck&&projTargetPct>0?((projTargetPct/lev)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})+'%':'—'}</div>
            <div style="font-size:8px;color:#333;margin-top:2px">${ck&&projTargetPct>0?'raw price needed':'no projection'}</div>
          </div>
        </div>
      </div>`:''}

      ${tvHtml}
      ${cockpitHtml}

      <!-- NOTES append-only log -->
      <div style="margin-bottom:12px">
        <div class="jn-sec-title" style="margin-bottom:8px">technical notes</div>
        ${(()=>{
          // migrate old single note
          const logs=t.noteLog||(t.note?[{ts:t.closedAt||Date.now(),text:t.note}]:[]);
          const fmtTs=ts=>{const d=new Date(ts);return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
          const logHtml=logs.length
            ?logs.map(e=>`<div style="padding:8px 12px;border-left:2px solid #1e1e1e;margin-bottom:6px;background:#0a0a0a;border-radius:0 6px 6px 0">
                <div style="font-size:8px;color:#2a2a2a;margin-bottom:3px">${fmtTs(e.ts)}</div>
                <div style="font-size:11px;color:#aaa;line-height:1.6">${escHtml(e.text)}</div>
              </div>`).join('')
            :'<div style="font-size:10px;color:#2a2a2a;padding:8px 0">no notes yet</div>';
          return logHtml;
        })()}
        <!-- append new note -->
        <div style="margin-top:8px;display:flex;gap:6px;align-items:flex-start">
          <textarea id="jn-note-append" rows="2" placeholder="Add a note…"
            style="flex:1;background:#111;border:1px solid #252525;border-radius:7px;color:#aaa;font-size:11px;padding:8px 12px;font-family:inherit;outline:none;resize:none;line-height:1.6;box-sizing:border-box;transition:border-color .15s"
            onfocus="this.style.borderColor='#444'" onblur="this.style.borderColor='#252525'"></textarea>
          <button onclick="const v=document.getElementById('jn-note-append').value;jnAppendNote('${t.id}',v)" style="background:#111;border:1px solid #252525;border-radius:7px;color:#555;font-size:10px;padding:8px 12px;cursor:pointer;font-family:inherit;outline:none;white-space:nowrap;transition:all .15s;flex-shrink:0" onmouseover="this.style.borderColor='#444';this.style.color='#aaa'" onmouseout="this.style.borderColor='#252525';this.style.color='#555'">+ add</button>
        </div>
      </div>
      <!-- PSYCHOLOGICAL NOTES -->
      ${t.notePsych?`<div style="margin-bottom:12px">
        <div class="jn-sec-title" style="margin-bottom:8px">psychological notes</div>
        <div style="padding:10px 14px;background:#0a0a0a;border:1px solid #1e1e1e;border-left:2px solid #5b7fff;border-radius:0 6px 6px 0">
          <div style="font-size:11px;color:#aaa;line-height:1.6">${escHtml(t.notePsych)}</div>
        </div>
      </div>`:''}

      <!-- MOOD — permanent once set -->
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <div style="font-size:8px;color:#333;text-transform:uppercase;letter-spacing:.07em;font-weight:700">mood</div>
        ${t.emotion
          ?`<span style="font-size:22px">${t.emotion}</span>
            <span style="font-size:10px;color:#333">${{'😤':'frustrated','😰':'anxious','😐':'neutral','😊':'confident','🔥':'on fire'}[t.emotion]||''}</span>
            <span style="font-size:8px;color:#1e1e1e;margin-left:4px">permanent</span>`
          :`<div style="display:flex;gap:4px">
              ${JN_EMOTIONS.map(e=>`<button onclick="jnSetEmotion('${t.id}','${e}')" title="${{'😤':'frustrated','😰':'anxious','😐':'neutral','😊':'confident','🔥':'on fire'}[e]||e}" style="font-size:20px;background:none;border:1.5px solid #1a1a1a;border-radius:6px;padding:4px 8px;cursor:pointer;outline:none;transition:all .12s;opacity:.5" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.5'">${e}</button>`).join('')}
            </div>
            <span style="font-size:9px;color:#2a2a2a">pick once · cannot change</span>`
        }
      </div>

      <div style="display:flex;gap:8px">
        <button class="jn-btn-sm danger" onclick="jnDeleteTrade('${t.id}')">delete trade</button>
        ${t.tvUrl?`<a href="${escHtml(t.tvUrl)}" target="_blank" class="jn-btn-sm" style="text-decoration:none">open chart ↗</a>`:''}
      </div>
    </div>`;
}


function ljJumpToJournal(m, tno){
  for(const fid of Object.keys(JN.trades||{})){
    const found=(JN.trades[fid]||[]).find(t=>
      t.status!=='draft'&&t.cockpit&&
      t.cockpit.tab===TAB&&
      parseInt(t.cockpit.month)===parseInt(m)&&
      parseInt(t.cockpit.tradeNo)===parseInt(tno)
    );
    if(found){
      JN.activeFolder=fid;
      // actually open the journal page then navigate to trade
      if(typeof openJournal==='function'){
        openJournal();
        setTimeout(()=>{ jnOpenTrade(found.id); }, 300);
      } else {
        battNav('journal');
        setTimeout(()=>{ jnOpenTrade(found.id); }, 150);
      }
      return;
    }
  }
  showToast('Trade not found in journal','info',2000);
}

function jnOpenTrade(id){
  JN.view='detail';JN.activeTrade=id;try{localStorage.setItem('batt_jn_view','detail');localStorage.setItem('batt_jn_trade',id);if(JN.activeFolder)localStorage.setItem('batt_jn_folder',JN.activeFolder);}catch(e){}jnRender();
}

async function jnSetEmotion(tid,emotion){
  const trades=JN.trades[JN.activeFolder]||[];
  const t=trades.find(x=>x.id===tid);
  if(!t) return;
  if(t.emotion){
    showToast('Mood is permanent — set once, stays forever','info',2000);
    return;
  }
  t.emotion=emotion;
  await jnSave();
  jnRenderDetail();
}

async function jnAppendNote(tid,text){
  if(!text||!text.trim()) return;
  const trades=JN.trades[JN.activeFolder]||[];
  const t=trades.find(x=>x.id===tid);
  if(!t) return;
  if(!t.noteLog) t.noteLog=[];
  // migrate old single note to log
  if(t.note&&!t.noteLog.length){
    t.noteLog.push({ts:t.closedAt||Date.now(),text:t.note});
    t.note='';
  }
  t.noteLog.push({ts:Date.now(),text:text.trim()});
  await jnSave();
  jnRenderDetail();
}
async function jnSaveNote(tid,note){
  // legacy — redirect to append
  await jnAppendNote(tid,note);
}

async function jnNewFolder(){
  // inline form rendered inside body
  const body=document.getElementById('jn-body');
  const colors=JN_COLORS;
  const colorIdx=JN.folders.length%colors.length;
  body.innerHTML=`<div style="max-width:420px">
    <div style="font-size:13px;font-weight:700;color:#ccc;margin-bottom:18px">New Folder</div>
    <div style="margin-bottom:14px">
      <div class="jn-detail-lbl" style="margin-bottom:6px">Folder name</div>
      <input id="jnf-name" type="text" placeholder='e.g. "BTC Scalps", "May 2025"' style="width:100%;background:#1a1a1a;border:1px solid #2e2e2e;border-radius:6px;color:#ddd;font-size:12px;padding:9px 12px;font-family:inherit;outline:none;box-sizing:border-box" autofocus>
    </div>
    <div style="margin-bottom:14px">
      <div class="jn-detail-lbl" style="margin-bottom:6px">Trade type</div>
      <div style="display:flex;gap:6px">
        <button class="jnf-type-btn on" data-type="lev" onclick="document.querySelectorAll('.jnf-type-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')" style="flex:1;padding:8px;border-radius:6px;border:1px solid #2e2e2e;background:#1a1a1a;color:#00c47a;font-size:10px;font-weight:700;cursor:pointer;outline:none;font-family:inherit;transition:all .15s">⚡ Leverage</button>
        <button class="jnf-type-btn" data-type="spot" onclick="document.querySelectorAll('.jnf-type-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')" style="flex:1;padding:8px;border-radius:6px;border:1px solid #2e2e2e;background:#1a1a1a;color:#5b7fff;font-size:10px;font-weight:700;cursor:pointer;outline:none;font-family:inherit;transition:all .15s">◈ Spot</button>
        <button class="jnf-type-btn" data-type="mix" onclick="document.querySelectorAll('.jnf-type-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')" style="flex:1;padding:8px;border-radius:6px;border:1px solid #2e2e2e;background:#1a1a1a;color:#f59e0b;font-size:10px;font-weight:700;cursor:pointer;outline:none;font-family:inherit;transition:all .15s">⊕ Mix</button>
      </div>
    </div>
    <div style="margin-bottom:20px">
      <div class="jn-detail-lbl" style="margin-bottom:6px">Color</div>
      <div style="display:flex;gap:6px">${colors.map((c,i)=>`<button onclick="document.querySelectorAll('.jnf-color-btn').forEach(b=>b.style.outline='none');this.style.outline='2px solid #fff'" class="jnf-color-btn" style="width:22px;height:22px;border-radius:50%;background:${c};border:none;cursor:pointer;outline:${i===colorIdx?'2px solid #fff':'none'};outline-offset:2px;transition:outline .12s"></button>`).join('')}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="jnNewFolderSubmit()" class="jn-add-btn" style="flex:1">create folder</button>
      <button onclick="jnRenderFolders()" class="jn-btn-sm" style="padding:7px 16px;font-size:10px">cancel</button>
    </div>
  </div>`;
  // focus input
  setTimeout(()=>{const i=document.getElementById('jnf-name');if(i)i.focus();},50);
}

async function jnNewFolderSubmit(){
  const nameEl=document.getElementById('jnf-name');
  const name=(nameEl?nameEl.value:'').trim();
  if(!name){nameEl&&(nameEl.style.borderColor='#e05555');return;}
  const typeBtn=document.querySelector('.jnf-type-btn.on');
  const type=typeBtn?typeBtn.dataset.type:'lev';
  const colorBtn=document.querySelector('.jnf-color-btn[style*="2px solid"]');
  const color=colorBtn?colorBtn.style.background:JN_COLORS[JN.folders.length%JN_COLORS.length];
  const id='f'+Date.now();
  JN.folders.push({id,name,color,type,tags:[type],createdAt:Date.now()});
  JN.trades[id]=[];
  await jnSave();
  jnGoList(id);
}

async function jnEditFolder(fid){
  const f=JN.folders.find(x=>x.id===fid);
  if(!f) return;
  const name=await showConfirm({icon:'✏️',type:'info',title:'Rename Folder',input:true,inputValue:f.name,inputPlaceholder:'folder name',confirmText:'save',cancelText:'cancel'});
  if(!name||!name.trim()) return;
  f.name=name.trim();
  await jnSave();
  jnRenderFolders();
}

async function jnDeleteFolder(fid){
  const f=JN.folders.find(x=>x.id===fid);
  if(!f) return;
  const ok=await showConfirm({icon:'🗑️',type:'danger',title:'Delete folder?',message:`Delete "${f.name}" and all ${(JN.trades[fid]||[]).length} trades inside? This cannot be undone.`,confirmText:'delete',cancelText:'cancel'});
  if(!ok) return;
  JN.folders=JN.folders.filter(x=>x.id!==fid);
  delete JN.trades[fid];
  await jnSave();
  jnRenderFolders();
}

async function jnNewTrade(){
  // show a folder picker first then manual entry form
  const result=await showConfirm({
    icon:'📝',type:'info',title:'Add Trade',
    message:'Fill in trade details:',
    input:true,inputPlaceholder:'pair (e.g. BTCUSDT)',
    confirmText:'next',cancelText:'cancel'
  });
  if(!result) return;
  const pair=result.trim().toUpperCase()||'BTCUSDT';
  const id='t'+Date.now();
  const trade={id,pair,side:'long',leverage:1,size:100,entry:0,exit:0,pnl:0,fee:0,funding:0,pct:0,type:'spot',closedAt:Date.now(),note:'',emotion:'',source:'manual',tags:[]};
  if(!JN.trades[JN.activeFolder]) JN.trades[JN.activeFolder]=[];
  JN.trades[JN.activeFolder].unshift(trade);
  await jnSave();
  JN.view='detail';JN.activeTrade=id;jnRender();
  showToast('Trade added — fill in the details','success',2000);
}

async function jnDeleteTrade(tid){
  const ok=await showConfirm({icon:'🗑️',type:'danger',title:'Delete trade?',message:'This trade will be permanently removed.',confirmText:'delete',cancelText:'cancel'});
  if(!ok) return;
  JN.trades[JN.activeFolder]=(JN.trades[JN.activeFolder]||[]).filter(x=>x.id!==tid);
  await jnSave();
  if(typeof softUpdate==='function') softUpdate();
  if(JN.activeTrade===tid){JN.view='list';JN.activeTrade=null;}
  jnRender();
}

function jnAddAction(){
  if(JN.view==='list') jnNewTrade();
  else jnNewFolder();
}

async function jnImportFromTP(){
  if(!TP_STATE||!TP_STATE.history||TP_STATE.history.length===0){
    showToast('No trades in Trade Panel history','info');return;
  }
  // pick target folder
  if(JN.folders.length===0){
    showToast('Create a folder first','info');
    openJournal();
    return;
  }
  const folderNames=JN.folders.map(f=>f.name);
  const fIdx=await showConfirm({
    icon:'⚡',type:'info',title:'Import to which folder?',
    message:'Select a folder to import Trade Panel trades into:',
    input:true,inputPlaceholder:folderNames.join(' / '),
    confirmText:'import',cancelText:'cancel'
  });
  if(!fIdx) return;
  const targetFolder=JN.folders.find(f=>f.name.toLowerCase()===fIdx.trim().toLowerCase())||JN.folders[0];
  if(!JN.trades[targetFolder.id]) JN.trades[targetFolder.id]=[];
  let imported=0;
  TP_STATE.history.forEach(h=>{
    const id='t'+Date.now()+Math.random().toString(36).slice(2,6);
    const pct=(h.pnl/(h.size||1))*100;
    JN.trades[targetFolder.id].unshift({
      id, pair:h.pair||'BTCUSDT', side:h.side||'long',
      leverage:h.leverage||1, size:h.size||0,
      entry:h.entryPrice||0, exit:h.exitPrice||0,
      pnl:h.pnl||0, fee:h.fee||0, funding:h.funding||0,
      pct:h.pct||pct, type:h.marketType||'perpetual',
      closedAt:h.closedAt||Date.now(),
      note:'', emotion:'', source:'Trade Panel',
      tags:[h.pair,h.side,h.liquidated?'liquidated':''].filter(Boolean)
    });
    imported++;
  });
  await jnSave();
  showToast(`Imported ${imported} trade${imported>1?'s':''} to "${targetFolder.name}"`, 'success');
  jnGoList(targetFolder.id);
}

function openAboutCJ(){
  document.body.style.overflow='auto';
  closeL3Menu();
  battNav('about');
  var p=document.getElementById('about-cj-page');
  if(!p)return;
  p.style.display='block';
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ p.style.opacity='1'; p.classList.add('acj-visible'); }); });
  p.scrollTop=0;
}

function closeAboutCJ(){
  document.body.style.overflow='auto';
  battNav('member');
  mbnSetActive('member');
  var p=document.getElementById('about-cj-page');
  if(!p)return;
  p.style.opacity='0';
  setTimeout(function(){ p.style.display='none'; p.classList.remove('acj-visible'); },400);
}

// ── L3 MENU DROPDOWN ──
var _cjFeatureAllowed = false;

async function initL3MenuVisibility(){
  var wrap=document.getElementById('l3-menu-wrap');
  if(!wrap) return;
  wrap.style.display='none';
  _cjFeatureAllowed = false;
  var tok=_battToken();
  if(!tok) return;
  try{
    var res=await fetch(AUTH_URL+'/auth/check-feature',{ method:'GET', headers:{'Authorization':'Bearer '+tok} });
    var data=await res.json();
    if(data.allowed===true){ _cjFeatureAllowed=true; wrap.style.display=''; }
  }catch(e){}
}

function toggleL3Menu(e){
  e.stopPropagation();
  if(!_cjFeatureAllowed) return;
  var dd=document.getElementById('l3-menu-dropdown');
  if(!dd)return;
  dd.classList.toggle('open');
}

function closeL3Menu(){
  var dd=document.getElementById('l3-menu-dropdown');
  if(dd)dd.classList.remove('open');
}

document.addEventListener('click',function(e){
  var wrap=document.getElementById('l3-menu-wrap');
  if(wrap&&!wrap.contains(e.target))closeL3Menu();
});