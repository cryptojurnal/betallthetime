// ── AI ASSISTANT ──
var AI_OPEN=false;
var AI_HIST=[];
var AI_LANG=typeof LANG!=='undefined'?LANG:'en';
// proxy handles auth — no client key needed

var AI_SYS_EN="You are Kira, a friendly and knowledgeable assistant built into the bet all the time bet with style crypto cockpit dashboard by @cryptojurnal. You feel like a smart trading buddy who genuinely wants to help users succeed, not a robot reading a manual.\n\nPERSONALITY:\n- Warm, encouraging, and clear. Never robotic or stiff.\n- Use simple analogies when explaining complex concepts.\n- When someone is confused, reassure them first, then explain step by step.\n- Celebrate good setups, gently flag risky ones.\n- Keep answers focused and practical, no fluff.\n- You can use light emojis to make things friendly but do not overdo it.\n- If someone asks something outside the cockpit, kindly redirect.\n\nCORE CONCEPTS:\n- liq%: how far price can move against you before liquidation. Account divided by notional times 100. Higher is safer. At liq%=40, price must drop 40% to wipe trade 1. Most important number. Aim for 100%+, 40% is the floor.\n- notional: total position size (capital x leverage). e.g. $1000 at 5x = $5000 notional.\n- margin/fm%: money locked as margin = notional divided by leverage. fm% = what percent of your account is margin. If fm% > 100%, position CANNOT open (margin exceeds capital).\n- leverage: multiplier. 5x means you control 5x your capital. Higher leverage = higher risk + lower liq%.\n- KPI scale: global multiplier on all trade targets. 1.0=as set, 0.5=half, 2.0=double. Great for stress-testing.\n- push or size multiplier: per-month notional multiplier, only that month.\n- zero month: no trading that month, account stays flat.\n- withdrawal: take money out, reduces account, lowers liq% next month. Always check liq% after.\n- global mode ON: all months share same 10 trade slots. OFF: each month has its own setup.\n- link to capital: OFF = notional fixed when capital changes. ON = notional scales with capital to maintain liq% ratio.\n\nERROR STATES (important to recognize):\n- FM% > 100%: Shows 🚫 icon. Margin required exceeds capital. Position cannot open. Fix: increase leverage, reduce notional, or add capital.\n- Liq% < 1%: Shows 💸 icon. Any price movement = instant liquidation. Fix: reduce notional.\n- WD Bust: Shows 💀 icon. Withdrawal exceeded available balance. Fix: reduce withdrawal amount.\n\nTWO MODES:\n- Leverage: futures trading with leverage, liquidation risk, funding fees.\n- Spot: buy and hold without leverage. No liquidation, no funding. Fee still 2x per trade. Higher rates (0.1% standard).\n\nFEES (now fully calculated):\n- Every trade pays fee twice, open and close, win or lose.\n- Maker = limit order, lower rate (0.02% typical).\n- Taker = market order, higher rate (0.05% typical).\n- Funding fee: perpetual contracts charge funding every 8 hours. Calculated based on holds per month.\n- Dashboard shows total fees paid per month and cumulative.\n\nTRADE SLOTS: 10 slots per sequence. target% = expected gain/loss per trade. Negative = loss trade. Set target = 0 to skip.\n\nTABS: Top row = 36-month. Bottom row = quarter 3-month. Each tab fully independent. Click plus to add custom tabs, click name to rename. Custom tabs can be deleted.\n\nRISK SCORE: 0-20 safe, 21-45 moderate, 46-70 high, 71-100 extreme.\n\nPOWER USER FEATURES:\n- Keyboard shortcuts: ? to see all shortcuts, P for projection chart, Ctrl+M for Monte Carlo, C for compare, H for heatmap, T for theme, S for settings.\n- Projection Chart: Visual 36-month growth projection.\n- Monte Carlo: 1000 simulations with random variance to see outcome distribution.\n- Compare Presets: Side-by-side comparison of saved presets.\n- Risk Heatmap: Visual month-by-month risk levels.\n- Alerts: Set price alerts for BTC/ETH with telegram/email notifications.\n- Cloud Sync: Save presets to cloud, sync across devices (requires login).\n\nINDICATORS:\n- ₿ equivalent: Shows end balance in BTC at current price.\n- IDR conversion: Shows values in Indonesian Rupiah.\n- 1yr return: M12 net worth percentage gain.\n- Active months: X/36 or X/3 showing how many months have trades.\n\nSAVING: Capital, position, trades = manual save buttons. Fees, labels, zero months, withdrawals = auto-save. Cloud presets for logged-in users.\n\nWhen users share their setup, give specific feedback on their liq%, fm%, risk level, and whether setup looks healthy. Be direct but kind. If fm% > 100% or liq% < 1%, immediately flag it as invalid.\n\nSUGGESTED NEXT STEP RULE (very important): At the end of EVERY answer, add a short line starting with 💡 Next: suggesting one specific follow-up action or question the user could explore. Make it directly relevant to what you just explained. One line only. Never skip this.";
var AI_SYS_ID="Kamu adalah Kira, asisten yang ramah dan berpengetahuan luas yang dibangun di dalam cockpit dashboard crypto bet all the time bet with style oleh @cryptojurnal. Kamu terasa seperti teman trading yang pintar dan benar-benar ingin membantu pengguna sukses, bukan robot yang membaca manual. Jawab dalam Bahasa Indonesia.\n\nKEPRIBADIAN:\n- Hangat, mendukung, dan jelas. Tidak kaku.\n- Gunakan analogi sederhana saat menjelaskan konsep kompleks.\n- Saat seseorang bingung, tenangkan dulu, lalu jelaskan langkah per langkah.\n- Rayakan setup yang bagus, tunjukkan dengan lembut yang berisiko.\n- Jawaban fokus dan praktis.\n\nKONSEP UTAMA:\n- liq%: seberapa jauh harga bisa bergerak melawan posisi sebelum dilikuidasi. Akun dibagi notional dikali 100. Lebih tinggi lebih aman. liq%=40 artinya harga perlu turun 40% untuk likuidasi trade 1. Angka terpenting. Target 100%+, 40% adalah batas minimum.\n- notional: total ukuran posisi (modal x leverage). Contoh $1000 di 5x = $5000 notional.\n- margin/fm%: uang yang dikunci sebagai margin = notional dibagi leverage. fm% = berapa persen akun yang jadi margin. Jika fm% > 100%, posisi TIDAK BISA dibuka (margin melebihi modal).\n- leverage: pengali. 5x artinya kamu mengontrol 5x modalmu.\n- KPI scale: pengali global untuk semua target trade.\n- push atau size pengali: pengali notional per bulan saja.\n- zero month: tidak ada trading bulan itu, akun tetap.\n- withdrawal: ambil uang keluar, kurangi akun, turunkan liq% bulan berikutnya.\n- global mode ON: semua bulan pakai slot trade yang sama. OFF: setiap bulan independen.\n- link to capital: OFF = notional tetap saat modal berubah. ON = notional ikut berubah proporsional.\n\nSTATUS ERROR (penting dikenali):\n- FM% > 100%: Tampil ikon 🚫. Margin melebihi modal. Posisi tidak bisa dibuka. Solusi: naikkan leverage, kurangi notional, atau tambah modal.\n- Liq% < 1%: Tampil ikon 💸. Pergerakan harga apapun = likuidasi instan. Solusi: kurangi notional.\n- WD Bust: Tampil ikon 💀. Penarikan melebihi saldo. Solusi: kurangi jumlah penarikan.\n\nDUA MODE:\n- Leverage: trading futures dengan leverage, risiko likuidasi, biaya funding.\n- Spot: beli dan tahan tanpa leverage. Tanpa likuidasi, tanpa funding. Biaya tetap 2x per trade.\n\nBIAYA (sekarang dihitung penuh):\n- Setiap trade bayar dua kali, buka dan tutup, menang atau kalah.\n- Maker = limit order, rate lebih rendah (0.02% tipikal).\n- Taker = market order, rate lebih tinggi (0.05% tipikal).\n- Funding fee: kontrak perpetual charge funding setiap 8 jam.\n- Dashboard menampilkan total fee per bulan dan kumulatif.\n\nSLOT TRADE: 10 slot per sekuens. target% = keuntungan atau kerugian per trade. Negatif = trade loss. Set target = 0 untuk dilewati.\n\nTAB: Baris atas = 36-bulan. Baris bawah = kuartal 3-bulan. Setiap tab independen. Klik plus untuk tambah tab kustom, klik nama untuk rename.\n\nRISK SCORE: 0-20 aman, 21-45 moderat, 46-70 tinggi, 71-100 ekstrem.\n\nFITUR POWER USER:\n- Shortcut keyboard: ? untuk lihat semua shortcut, P untuk projection chart, Ctrl+M untuk Monte Carlo, C untuk compare, H untuk heatmap.\n- Projection Chart: Visualisasi proyeksi pertumbuhan 36 bulan.\n- Monte Carlo: 1000 simulasi dengan varians acak.\n- Compare Presets: Perbandingan side-by-side preset tersimpan.\n- Risk Heatmap: Visual level risiko per bulan.\n- Alerts: Set price alert untuk BTC/ETH dengan notifikasi.\n- Cloud Sync: Simpan preset ke cloud, sinkron antar device (perlu login).\n\nINDIKATOR:\n- ₿ equivalent: Tampilkan saldo akhir dalam BTC.\n- Konversi IDR: Tampilkan nilai dalam Rupiah.\n- 1yr return: Persentase gain net worth M12.\n\nSaat pengguna berbagi setup, berikan feedback spesifik tentang liq%, fm%, level risiko, apakah setup terlihat sehat. Jujur tapi tetap baik. Jika fm% > 100% atau liq% < 1%, langsung tandai sebagai invalid.\n\nATURAN LANGKAH SELANJUTNYA (sangat penting): Di akhir SETIAP jawaban, tambahkan satu baris singkat dimulai dengan 💡 Selanjutnya: yang menyarankan satu tindakan atau pertanyaan follow-up spesifik yang relevan dengan yang baru dijelaskan. Satu baris saja. Jangan pernah melewatkan ini.";


var AI_CHIPS_EN=["what is liq%?","how do fees work?","spot vs leverage?","how to use tabs?","what is push\u00d7?","explain trade slots","what is KPI scale?","how to withdraw?"];
var AI_CHIPS_ID=["apa itu liq%?","cara kerja biaya?","spot vs leverage?","cara pakai tab?","apa itu push\u00d7?","jelaskan slot trade","apa itu KPI scale?","cara withdrawal?"];

function aiToggle(){
  AI_OPEN=!AI_OPEN;
  var panel=document.getElementById('ai-panel');
  panel.classList.toggle('open',AI_OPEN);
  document.getElementById('ai-notif').style.display='none';
  if(AI_OPEN){
    aiPositionPanel();
    if(AI_HIST.length===0) aiWelcome();
    aiUpdateChips();
    setTimeout(function(){
      var el=document.getElementById('ai-inp');
      if(el)el.focus();
    },200);
  }
}

function aiPositionPanel(){
  var fab=document.getElementById('ai-fab');
  var panel=document.getElementById('ai-panel');
  if(!fab||!panel)return;
  var fr=fab.getBoundingClientRect();
  var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
  var fx=fr.left/zoom, fy=fr.top/zoom;
  var fw=fr.width/zoom, fh=fr.height/zoom;
  var pw=320, ph=380;
  var W=window.innerWidth/zoom, H=window.innerHeight/zoom;
  // prefer above fab, align right edge
  var px=Math.min(fx+fw-pw, W-pw-8);
  var py=fy-ph-8;
  // if not enough space above, go below
  if(py<8) py=fy+fh+8;
  px=Math.max(8,px);
  py=Math.max(8,Math.min(py,H-ph-8));
  panel.style.left=px+'px';
  panel.style.top=py+'px';
  panel.style.right='';
  panel.style.bottom='';
}





function aiWelcome(){
  var isId=AI_LANG==='id';
  var s=typeof gs==='function'?gs():{SPOT:false,P:1000,LEV:5,NOT:2500};
  var mode=s.SPOT?'spot':'leverage';
  var liq=s.SPOT?null:(s.P/s.NOT*100).toFixed(1);
  var liqLow=liq&&parseFloat(liq)<40;
  var msg;
  if(isId){
    msg='Halo! 👋 Aku **Kira**, asisten dashboard ini.\n\n'
      +'Kamu sedang di **mode '+mode+'**'+(liq?' dengan liq% **'+liq+'%**':'')+'. '
      +(liqLow?'Hmm, liq%-mu agak rendah nih — mau aku jelaskan cara meningkatkannya? 🔍':'Setup terlihat oke dari sini! ✓')
      +'\n\nTanya apa saja — cara baca tabel, setup trade, perbedaan spot vs leverage, atau apa pun yang membingungkan. Aku di sini! 😊';
  } else {
    msg='Hey! 👋 I\'m **Kira**, your dashboard assistant.\n\n'
      +'You\'re in **'+mode+' mode**'+(liq?' with liq% at **'+liq+'%**':'')+'. '
      +(liqLow?'That liq% looks a bit tight — want me to walk you through improving it? 🔍':'Looking good from here! ✓')
      +'\n\nAsk me anything — what the numbers mean, how to set up trades, spot vs leverage, reading the tables, or anything that\'s confusing. I\'m here to help! 😊';
  }
  aiAppend('b',msg);
}

function aiUpdateChips(){
  var el=document.getElementById('ai-chips');
  if(!el)return;
  var isId=AI_LANG==='id';
  var list=isId?AI_CHIPS_ID:AI_CHIPS_EN;
  el.innerHTML=list.map(function(q){
    return '<button class="ai-chip" onclick="aiChip(this.textContent)">'+q+'</button>';
  }).join('');
  el.style.display='flex';
}

function aiChip(q){
  var el=document.getElementById('ai-inp');
  if(el){el.value=q;aiSend();}
}

function aiAppend(role,text){
  var el=document.getElementById('ai-msgs');
  if(!el)return null;
  var d=document.createElement('div');
  d.className='ai-m '+(role==='u'?'u':'b');
  d.innerHTML=text.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
  el.appendChild(d);
  el.scrollTop=el.scrollHeight;
  return d;
}

function aiKey(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend();}
}

async function aiSend(){
  var inp=document.getElementById('ai-inp');
  var btn=document.getElementById('ai-send');
  var q=(inp.value||'').trim();
  if(!q||btn.disabled)return;
  inp.value='';

  var chips=document.getElementById('ai-chips');
  if(chips)chips.style.display='none';

  aiAppend('u',q);
  AI_HIST.push({role:'user',content:q});
  btn.disabled=true;

  var typing=aiAppend('b','...');
  if(typing)typing.classList.add('typing');

  var isId=AI_LANG==='id';
  var s=typeof gs==='function'?gs():{SPOT:false,P:1000,LEV:5,NOT:2500,KPI:1,BT:[],FR:[],FEE:{maker:0.02,taker:0.05,method:'taker'},ZM:new Set()};
  var liqPct=s.SPOT?'n/a':(s.P/s.NOT*100).toFixed(1)+'%';
  var fm=s.SPOT?'n/a':(s.NOT/s.LEV/s.P*100).toFixed(1)+'%';
  var fmVal=s.SPOT?0:(s.NOT/s.LEV/s.P*100);
  var liqVal=s.SPOT?100:(s.P/s.NOT*100);
  var actTrades=s.BT?s.BT.filter(function(b,i){return b!==0&&s.FR&&s.FR[i]>0;}).length:0;
  var wins=s.BT?s.BT.filter(function(b,i){return b>0&&s.FR&&s.FR[i]>0;}).length:0;
  var losses=s.BT?s.BT.filter(function(b,i){return b<0&&s.FR&&s.FR[i]>0;}).length:0;
  var feeRate=s.FEE?(s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker):0.05;
  var fundingRate=s.FEE?s.FEE.funding:0.01;
  var riskEl=document.querySelector('.risk-pill');
  var riskScore=riskEl?riskEl.textContent.trim():'unknown';
  var tabId=typeof TAB!=='undefined'?TAB:'36';
  var isQuarter=tabId==='q'||tabId.startsWith('q_');
  var zeroMonths=s.ZM?s.ZM.size:0;
  var totalMonths=isQuarter?3:36;
  var activeMonths=totalMonths-zeroMonths;
  var btcPrice=typeof window.LIVE_BTC_PRICE!=='undefined'?window.LIVE_BTC_PRICE:85000;
  
  // Detect error states
  var errorState='none';
  if(!s.SPOT && fmVal>100) errorState='FM% > 100% (margin exceeds capital - position cannot open)';
  else if(!s.SPOT && liqVal<1) errorState='Liq% < 1% (instant liquidation risk)';
  else if(typeof bustMonth!=='undefined' && bustMonth) errorState='WD Bust (withdrawal exceeded balance at month '+bustMonth.m+')';
  
  var ctx=isId
    ?('\n\n--- SETUP PENGGUNA SAAT INI ---\nTab: '+(isQuarter?'Quarter (3 bulan)':'36-Month')+'\nMode: '+(s.SPOT?'spot':'leverage')+'\nModal: $'+s.P.toLocaleString()+'\nLeverage: '+(s.SPOT?'n/a':s.LEV+'x')+'\nNotional: $'+s.NOT.toLocaleString()+'\nLiq%: '+liqPct+(liqVal<20&&!s.SPOT?' ⚠️ BAHAYA':'')+'\nFM%: '+fm+(fmVal>100&&!s.SPOT?' 🚫 INVALID':fmVal>80&&!s.SPOT?' ⚠️ TINGGI':'')+'\nKPI scale: '+s.KPI.toFixed(2)+'x\nTrade aktif: '+actTrades+'/10 ('+wins+' win, '+losses+' loss)\nBulan aktif: '+activeMonths+'/'+totalMonths+(zeroMonths>0?' ('+zeroMonths+' zero month)':'')+'\nFee: '+(s.FEE?s.FEE.method:'taker')+' @ '+feeRate+'%'+(s.SPOT?'':', funding '+fundingRate+'%')+'\nRisk score: '+riskScore+'\nHarga BTC: $'+btcPrice.toLocaleString()+'\nStatus error: '+(errorState==='none'?'tidak ada ✓':errorState)+'\n---')
    :('\n\n--- USER CURRENT SETUP ---\nTab: '+(isQuarter?'Quarter (3 months)':'36-Month')+'\nMode: '+(s.SPOT?'spot':'leverage')+'\nCapital: $'+s.P.toLocaleString()+'\nLeverage: '+(s.SPOT?'n/a':s.LEV+'x')+'\nNotional: $'+s.NOT.toLocaleString()+'\nLiq%: '+liqPct+(liqVal<20&&!s.SPOT?' ⚠️ DANGER':'')+'\nFM%: '+fm+(fmVal>100&&!s.SPOT?' 🚫 INVALID':fmVal>80&&!s.SPOT?' ⚠️ HIGH':'')+'\nKPI scale: '+s.KPI.toFixed(2)+'x\nActive trades: '+actTrades+'/10 ('+wins+' wins, '+losses+' losses)\nActive months: '+activeMonths+'/'+totalMonths+(zeroMonths>0?' ('+zeroMonths+' zero months)':'')+'\nFee: '+(s.FEE?s.FEE.method:'taker')+' @ '+feeRate+'%'+(s.SPOT?'':', funding '+fundingRate+'%')+'\nRisk score: '+riskScore+'\nBTC price: $'+btcPrice.toLocaleString()+'\nError state: '+(errorState==='none'?'none ✓':errorState)+'\n---');

  var sys=(isId?AI_SYS_ID:AI_SYS_EN)+ctx;

  try{
    var res=await fetch('https://dashboard-ai-proxy.cryptojurnal.workers.dev',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:800,
        system:sys,
        messages:AI_HIST
      })
    });
    var data=await res.json();
    if(data.error){
      if(typing)typing.remove();
      var apiErr=data.error.message||'error';
      if(data.error.type==='authentication_error')aiShowKeyScreen();
      aiAppend('b',isId?'Error API: '+apiErr:'API error: '+apiErr);
      AI_HIST.pop();
      btn.disabled=false;
      return;
    }
    var reply=(data.content&&data.content[0]&&data.content[0].text)||(isId?'Maaf, terjadi kesalahan.':'Sorry, something went wrong.');
    if(typing)typing.remove();
    aiAppend('b',reply);
    AI_HIST.push({role:'assistant',content:reply});
    if(AI_HIST.length>40)AI_HIST=AI_HIST.slice(-30);
  }catch(err){
    if(typing)typing.remove();
    aiAppend('b',isId?'Gagal terhubung. Periksa koneksi.':'Connection failed. Check your internet.');
    AI_HIST.pop();
  }
  btn.disabled=false;
  var msgs=document.getElementById('ai-msgs');
  if(msgs)msgs.scrollTop=msgs.scrollHeight;
}

function aiClear(){
  AI_HIST=[];
  var el=document.getElementById('ai-msgs');
  if(el)el.innerHTML='';
  aiUpdateChips();
  aiWelcome();
}

// ── DRAG TO REPOSITION ──
// reposition AI panel on window resize if open
window.addEventListener('resize',function(){
  if(AI_OPEN) aiPositionPanel();
});
(function(){
  var fab, dx, dy, startX, startY, dragging=false, hasDragged=false;
  var _rafId=null, _lastX=0, _lastY=0;
  function onDown(e){
    fab=document.getElementById('ai-fab');
    var pt=e.touches?e.touches[0]:e;
    var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
    var r=fab.getBoundingClientRect();
    dx=pt.clientX/zoom-r.left/zoom;
    dy=pt.clientY/zoom-r.top/zoom;
    startX=pt.clientX/zoom;
    startY=pt.clientY/zoom;
    dragging=true;
    hasDragged=false;
    fab.classList.add('dragging');
    // no preventDefault here — let native click still fire for taps
  }
  function onMove(e){
    if(!dragging)return;
    var pt=e.touches?e.touches[0]:e;
    var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
    var distX=pt.clientX/zoom-startX, distY=pt.clientY/zoom-startY;
    // only count as drag if moved more than 10px from origin
    if(Math.sqrt(distX*distX+distY*distY)<10)return;
    hasDragged=true;
    var W=window.innerWidth/zoom, H=window.innerHeight/zoom;
    _lastX=Math.max(8,Math.min(pt.clientX/zoom-dx, W-58));
    _lastY=Math.max(8,Math.min(pt.clientY/zoom-dy, H-58));
    if(!_rafId) _rafId=requestAnimationFrame(function(){
      if(fab){
        fab.style.left=_lastX+'px';
        fab.style.top=_lastY+'px';
        fab.style.right='auto';
        fab.style.bottom='auto';
        if(AI_OPEN) aiPositionPanel();
      }
      _rafId=null;
    });
    e.preventDefault();
  }
  var _wasDragged=false;
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    if(fab)fab.classList.remove('dragging');
    if(hasDragged){
      _wasDragged=true;
      try{localStorage.setItem('batt_ai_pos',JSON.stringify({x:_lastX,y:_lastY}));}catch(ex){}
    }
    hasDragged=false;
  }
  // intercept onclick on fab — skip if it followed a drag
  window.addEventListener('DOMContentLoaded',function(){
    var f=document.getElementById('ai-fab');
    if(!f)return;
    f.addEventListener('click',function(e){
      if(_wasDragged){_wasDragged=false;e.stopImmediatePropagation();return;}
    },true);
  });
  function clampAiFab(){
    var f=document.getElementById('ai-fab');
    if(!f)return;
    try{
      var saved=_safeJSON(localStorage.getItem('batt_ai_pos'), null);
      if(saved && typeof saved.x === 'number' && typeof saved.y === 'number'){
        var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
        var W=window.innerWidth/zoom, H=window.innerHeight/zoom;
        var fabW=f.offsetWidth/zoom||50, fabH=f.offsetHeight/zoom||50;
        var clampX=Math.max(8,Math.min(saved.x, W-fabW-8));
        var clampY=Math.max(8,Math.min(saved.y, H-fabH-8));
        f.style.left=clampX+'px';
        f.style.top=clampY+'px';
        f.style.right='auto';
        f.style.bottom='auto';
      }
    }catch(ex){}
  }
  window.addEventListener('DOMContentLoaded',function(){
    var f=document.getElementById('ai-fab');
    if(!f)return;
    clampAiFab();
    window.addEventListener('resize', clampAiFab);
    window.addEventListener('mousemove',onMove);
    window.addEventListener('touchmove',onMove,{passive:false});
    window.addEventListener('mouseup',onUp);
    window.addEventListener('touchend',onUp);
    // attach to window, filter to fab — works regardless of pointer-events timing
    window.addEventListener('mousedown',function(e){
      var f2=document.getElementById('ai-fab');
      if(f2&&(e.target===f2||f2.contains(e.target)))onDown(e);
    });
    window.addEventListener('touchstart',function(e){
      var f2=document.getElementById('ai-fab');
      if(f2&&(e.target===f2||f2.contains(e.target)))onDown(e);
    },{passive:false});
  });
  window._attachAiFabDrag=function(){
    // no-op now — drag is handled via window listeners above
  };
})();

// ── USER BAR DRAG TO REPOSITION ──
(function(){
  var ub, dx, dy, startX, startY, dragging=false, hasDragged=false;
  var _rafId=null, _lastX=0, _lastY=0;
  window._ubWasDragged=false;
  
  function clampUserBar(){
    var u=document.getElementById('auth-user-bar');
    if(!u)return;
    try{
      var saved=_safeJSON(localStorage.getItem('batt_ub_pos'), null);
      if(saved && typeof saved.x === 'number' && typeof saved.y === 'number'){
        var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
        var W=window.innerWidth/zoom, H=window.innerHeight/zoom;
        var ubW=u.offsetWidth/zoom||140, ubH=u.offsetHeight/zoom||28;
        var clampX=Math.max(8,Math.min(saved.x, W-ubW-8));
        var clampY=Math.max(8,Math.min(saved.y, H-ubH-8));
        u.style.left=clampX+'px';
        u.style.top=clampY+'px';
        u.style.right='auto';
      }
    }catch(ex){}
  }

  function onDown(e){
    ub=document.getElementById('auth-user-bar');
    if(!ub)return;
    var pt=e.touches?e.touches[0]:e;
    var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
    var r=ub.getBoundingClientRect();
    dx=pt.clientX/zoom-r.left/zoom;
    dy=pt.clientY/zoom-r.top/zoom;
    startX=pt.clientX/zoom;
    startY=pt.clientY/zoom;
    dragging=true;
    hasDragged=false;
    ub.classList.add('dragging');
  }
  
  function onMove(e){
    if(!dragging)return;
    var pt=e.touches?e.touches[0]:e;
    var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
    var distX=pt.clientX/zoom-startX, distY=pt.clientY/zoom-startY;
    if(Math.sqrt(distX*distX+distY*distY)<10)return;
    hasDragged=true;
    var W=window.innerWidth/zoom, H=window.innerHeight/zoom;
    var ubW=ub.offsetWidth/zoom, ubH=ub.offsetHeight/zoom;
    _lastX=Math.max(8,Math.min(pt.clientX/zoom-dx, W-ubW-8));
    _lastY=Math.max(8,Math.min(pt.clientY/zoom-dy, H-ubH-8));
    if(!_rafId) _rafId=requestAnimationFrame(function(){
      if(ub){
        ub.style.left=_lastX+'px';
        ub.style.top=_lastY+'px';
        ub.style.right='auto';
      }
      _rafId=null;
    });
    e.preventDefault();
  }
  
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    if(ub)ub.classList.remove('dragging');
    if(hasDragged){
      window._ubWasDragged=true;
      setTimeout(function(){window._ubWasDragged=false;},100);
      try{localStorage.setItem('batt_ub_pos',JSON.stringify({x:_lastX,y:_lastY}));}catch(ex){}
    }
    hasDragged=false;
  }
  
  window.addEventListener('DOMContentLoaded',function(){
    var u=document.getElementById('auth-user-bar');
    if(!u)return;
    clampUserBar();
    window.addEventListener('resize',clampUserBar);
    // attach drag listeners
    window.addEventListener('mousemove',onMove);
    window.addEventListener('touchmove',onMove,{passive:false});
    window.addEventListener('mouseup',onUp);
    window.addEventListener('touchend',onUp);
    window.addEventListener('mousedown',function(e){
      var u2=document.getElementById('auth-user-bar');
      if(u2&&(e.target===u2||u2.contains(e.target))){
        // don't start drag if clicking on buttons
        if(e.target.tagName==='BUTTON')return;
        onDown(e);
      }
    });
    window.addEventListener('touchstart',function(e){
      var u2=document.getElementById('auth-user-bar');
      if(u2&&(e.target===u2||u2.contains(e.target))){
        if(e.target.tagName==='BUTTON')return;
        onDown(e);
      }
    },{passive:false});
  });
})();

// ── BACK BUTTON DRAG TO REPOSITION ──
(function(){
  var btn, dx, dy, startX, startY, dragging=false, hasDragged=false;
  var _rafId=null, _lastX=0, _lastY=0;
  window._backBtnWasDragged=false;
  
  function onDown(e){
    btn=document.getElementById('back-to-member');
    if(!btn)return;
    var pt=e.touches?e.touches[0]:e;
    var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
    var r=btn.getBoundingClientRect();
    dx=pt.clientX/zoom-r.left/zoom;
    dy=pt.clientY/zoom-r.top/zoom;
    startX=pt.clientX/zoom;
    startY=pt.clientY/zoom;
    dragging=true;
    hasDragged=false;
    btn.style.cursor='grabbing';
  }
  
  function onMove(e){
    if(!dragging)return;
    var pt=e.touches?e.touches[0]:e;
    var zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
    var distX=pt.clientX/zoom-startX, distY=pt.clientY/zoom-startY;
    if(Math.sqrt(distX*distX+distY*distY)<10)return;
    hasDragged=true;
    var W=window.innerWidth/zoom, H=window.innerHeight/zoom;
    var btnW=btn.offsetWidth/zoom, btnH=btn.offsetHeight/zoom;
    _lastX=Math.max(8,Math.min(pt.clientX/zoom-dx, W-btnW-8));
    _lastY=Math.max(8,Math.min(pt.clientY/zoom-dy, H-btnH-8));
    if(!_rafId) _rafId=requestAnimationFrame(function(){
      if(btn){
        btn.style.left=_lastX+'px';
        btn.style.top=_lastY+'px';
      }
      _rafId=null;
    });
    e.preventDefault();
  }
  
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    if(btn)btn.style.cursor='pointer';
    if(hasDragged){
      window._backBtnWasDragged=true;
      setTimeout(function(){window._backBtnWasDragged=false;},100);
      try{localStorage.setItem('batt_back_pos',JSON.stringify({x:_lastX,y:_lastY}));}catch(ex){}
    }
    hasDragged=false;
  }
  
  window.addEventListener('DOMContentLoaded',function(){
    var b=document.getElementById('back-to-member');
    if(!b)return;
    // restore saved position
    try{
      var saved=_safeJSON(localStorage.getItem('batt_back_pos'), null);
      if(saved){b.style.left=saved.x+'px';b.style.top=saved.y+'px';}
    }catch(ex){}
    // intercept click if dragged
    b.addEventListener('click',function(e){
      if(window._backBtnWasDragged){e.stopImmediatePropagation();e.preventDefault();return false;}
    },true);
    // attach drag listeners
    window.addEventListener('mousemove',onMove);
    window.addEventListener('touchmove',onMove,{passive:false});
    window.addEventListener('mouseup',onUp);
    window.addEventListener('touchend',onUp);
    window.addEventListener('mousedown',function(e){
      var b2=document.getElementById('back-to-member');
      if(b2&&(e.target===b2||b2.contains(e.target)))onDown(e);
    });
    window.addEventListener('touchstart',function(e){
      var b2=document.getElementById('back-to-member');
      if(b2&&(e.target===b2||b2.contains(e.target)))onDown(e);
    },{passive:false});
  });
})();


// ── PRESETS TOGGLE DRAG TO REPOSITION (vertical only) ──
(function(){
  var toggle, startY, startTop, dragging=false, hasDragged=false;
  var _rafId=null, _lastY=0;
  function isToggleBtn(el){
    return el && (el.id==='presets-toggle-btn' || el.closest('#presets-toggle-btn'));
  }
  function onDown(e){
    toggle=document.getElementById('presets-toggle-btn');
    if(!toggle || !toggle.classList.contains('visible'))return;
    var pt=e.touches?e.touches[0]:e;
    startY=pt.clientY;
    var computedTop = toggle.style.top ? parseInt(toggle.style.top) : (window.innerHeight/2 - toggle.offsetHeight/2);
    startTop = computedTop;
    dragging=true; hasDragged=false;
    toggle.classList.add('dragging');
    e.preventDefault();
  }
  function onMove(e){
    if(!dragging || !toggle)return;
    var pt=e.touches?e.touches[0]:e;
    var deltaY=pt.clientY-startY;
    if(Math.abs(deltaY)<5)return;
    hasDragged=true;
    var H=window.innerHeight, toggleH=toggle.offsetHeight;
    _lastY=Math.max(20,Math.min(startTop+deltaY, H-toggleH-20));
    if(!_rafId) _rafId=requestAnimationFrame(function(){
      if(toggle){ toggle.style.top=_lastY+'px'; toggle.style.transform='none'; }
      _rafId=null;
    });
    e.preventDefault();
  }
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    if(toggle) toggle.classList.remove('dragging');
    if(!hasDragged && toggle) togglePresetsPanel();
  }
  document.addEventListener('mousedown',function(e){ if(isToggleBtn(e.target))onDown(e); });
  document.addEventListener('touchstart',function(e){ if(isToggleBtn(e.target))onDown(e); },{passive:false});
  document.addEventListener('mousemove',onMove);
  document.addEventListener('touchmove',onMove,{passive:false});
  document.addEventListener('mouseup',onUp);
  document.addEventListener('touchend',onUp);
})();

// ── LEFT PANEL TOGGLE DRAG TO REPOSITION (vertical only) ──
(function(){
  var toggle, startY, startTop, dragging=false, hasDragged=false;
  var _rafId=null, _lastY=0;
  function isLeftToggleBtn(el){
    return el && (el.id==='left-panel-toggle' || el.closest('#left-panel-toggle'));
  }
  function onDown(e){
    toggle=document.getElementById('left-panel-toggle');
    if(!toggle || !toggle.classList.contains('visible'))return;
    var pt=e.touches?e.touches[0]:e;
    startY=pt.clientY;
    var computedTop = toggle.style.top ? parseInt(toggle.style.top) : (window.innerHeight/2 - toggle.offsetHeight/2);
    startTop = computedTop;
    dragging=true; hasDragged=false;
    toggle.classList.add('dragging');
    e.preventDefault();
  }
  function onMove(e){
    if(!dragging || !toggle)return;
    var pt=e.touches?e.touches[0]:e;
    var deltaY=pt.clientY-startY;
    if(Math.abs(deltaY)<5)return;
    hasDragged=true;
    var H=window.innerHeight, toggleH=toggle.offsetHeight;
    _lastY=Math.max(20,Math.min(startTop+deltaY, H-toggleH-20));
    if(!_rafId) _rafId=requestAnimationFrame(function(){
      if(toggle){ toggle.style.top=_lastY+'px'; toggle.style.transform='translateY(0)'; }
      _rafId=null;
    });
    e.preventDefault();
  }
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    if(toggle) toggle.classList.remove('dragging');
    if(!hasDragged && toggle) togglePanel();
  }
  document.addEventListener('mousedown',function(e){ if(isLeftToggleBtn(e.target))onDown(e); });
  document.addEventListener('touchstart',function(e){ if(isLeftToggleBtn(e.target))onDown(e); },{passive:false});
  document.addEventListener('mousemove',onMove);
  document.addEventListener('touchmove',onMove,{passive:false});
  document.addEventListener('mouseup',onUp);
  document.addEventListener('touchend',onUp);
})();


function aiSetLang(lang){
  AI_LANG=lang;
  var en=document.getElementById('ai-lb-en');
  var id=document.getElementById('ai-lb-id');
  if(en){en.style.background=lang==='en'?'var(--acc)':'transparent';en.style.color=lang==='en'?'#fff':'var(--tx3)';}
  if(id){id.style.background=lang==='id'?'var(--acc)':'transparent';id.style.color=lang==='id'?'#fff':'var(--tx3)';}
  var ttl=document.getElementById('ai-ttl');
  if(ttl)ttl.textContent=lang==='id'?'asisten dashboard':'dashboard assistant';
  var inp=document.getElementById('ai-inp');
  if(inp)inp.placeholder=lang==='id'?'tanya apa saja...':'ask anything...';
  aiUpdateChips();
  aiUpdateKeyScreenLang();
}

// ══════════════════════════════════════════════════════════════
// ███ POWER USER FEATURES (Hidden but Discoverable) ███
// ══════════════════════════════════════════════════════════════


function undo() {
  if (UNDO_STACK.length === 0) {
    showToast('Nothing to undo', 'info');
    return;
  }
  const state = UNDO_STACK.pop();
  REDO_STACK.push({
    action: 'undo',
    timestamp: Date.now(),
    data: _deepCopyS(S)
  });
  // S is const — mutate in-place
  Object.keys(S).forEach(k=>delete S[k]);
  Object.assign(S, state.data);
  // ensure Sets are proper Sets after assign
  Object.keys(S).forEach(k=>{
    if(S[k]&&Array.isArray(S[k].ZM)) S[k].ZM=new Set(S[k].ZM);
    if(S[k]&&Array.isArray(S[k].LK)) S[k].LK=new Set(S[k].LK);
    if(S[k]&&Array.isArray(S[k].CM)) S[k].CM=new Set(S[k].CM);
  });
  // cancel any pending debounced inputs — prevents stale values firing after restore
  Object.keys(_dInputTimers).forEach(k=>{clearTimeout(_dInputTimers[k]);delete _dInputTimers[k];});
  // cancel pending undo capture so restored state isn't immediately snapshotted
  if(_undoTimer){clearTimeout(_undoTimer);_undoTimer=null;_undoSnap=null;}
  if(typeof saveSection==='function'){
    ['cap','pos','trades','fee','cm'].forEach(sec=>saveSection(sec));
  }
  syncControls();
  render();
  showToast('↩ undone','success',1500);
}

function redo() {
  if (REDO_STACK.length === 0) {
    showToast('Nothing to redo', 'info');
    return;
  }
  const state = REDO_STACK.pop();
  UNDO_STACK.push({
    action: 'redo',
    timestamp: Date.now(),
    data: _deepCopyS(S)
  });
  Object.keys(S).forEach(k=>delete S[k]);
  Object.assign(S, state.data);
  Object.keys(S).forEach(k=>{
    if(S[k]&&Array.isArray(S[k].ZM)) S[k].ZM=new Set(S[k].ZM);
    if(S[k]&&Array.isArray(S[k].LK)) S[k].LK=new Set(S[k].LK);
    if(S[k]&&Array.isArray(S[k].CM)) S[k].CM=new Set(S[k].CM);
  });
  Object.keys(_dInputTimers).forEach(k=>{clearTimeout(_dInputTimers[k]);delete _dInputTimers[k];});
  if(_undoTimer){clearTimeout(_undoTimer);_undoTimer=null;_undoSnap=null;}
  if(typeof saveSection==='function'){
    ['cap','pos','trades','fee'].forEach(sec=>saveSection(sec));
  }
  syncControls();
  render();
  showToast('↪ redone','success',1500);
}

// ── NUMBER ANIMATIONS ──
function animateNumber(el, from, to, duration = 400) {
  const start = performance.now();
  const diff = to - from;
  el.classList.add('num-animate');
  
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + diff * eased;
    
    if (el.dataset.format === 'currency') {
      el.textContent = '$' + current.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    } else if (el.dataset.format === 'percent') {
      el.textContent = current.toFixed(2) + '%';
    } else {
      el.textContent = current.toFixed(2);
    }
    
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.classList.remove('num-animate');
      if (diff > 0) {
        el.classList.add('num-up');
        setTimeout(() => el.classList.remove('num-up'), 500);
      } else if (diff < 0) {
        el.classList.add('num-down');
        setTimeout(() => el.classList.remove('num-down'), 500);
      }
    }
  }
  
  requestAnimationFrame(tick);
}

// ── COMMAND PALETTE ──
var CMD_OPEN = false;
var CMD_INDEX = 0;
var CMD_ITEMS = [];

const CMD_ACTIONS = [
  { icon: '📊', title: 'Open Cockpit', desc: 'Go to trading cockpit', action: () => { if(typeof openDashboard==='function') openDashboard(); }, category: 'Navigation' },
  { icon: '📈', title: 'Paper Trading', desc: 'Go to paper trading', action: () => { if(typeof openTradingPage==='function') openTradingPage(); }, category: 'Navigation' },
  { icon: '👤', title: 'Account Settings', desc: 'Manage your account', action: () => { if(typeof openAccountPage==='function') openAccountPage(); }, category: 'Navigation' },
  { icon: '🏠', title: 'Member Area', desc: 'Back to member area', action: () => { if(typeof backToMemberArea==='function') backToMemberArea(); }, category: 'Navigation' },
  { icon: '💾', title: 'Save Preset', desc: 'Save current setup', action: () => { if(typeof openPresetSave==='function') openPresetSave(); }, kbd: 'Ctrl+S', category: 'Actions' },
  { icon: '☁️', title: 'Sync to Cloud', desc: 'Upload data to cloud', action: () => { if(typeof authSaveWithToast==='function') authSaveWithToast(); }, kbd: 'Ctrl+Shift+S', category: 'Actions' },
  { icon: '📈', title: 'Projection Chart', desc: 'View 36-month growth', action: () => openProjectionChart(), kbd: 'P', category: 'Analysis' },
  { icon: '⚖️', title: 'Compare Presets', desc: 'Side-by-side comparison', action: () => openCompareModal(), kbd: 'C', category: 'Analysis' },
  { icon: '🎲', title: 'Monte Carlo Sim', desc: 'Run probability simulation', action: () => openMonteCarlo(), kbd: 'Ctrl+M', category: 'Analysis' },
  { icon: '🔥', title: 'Risk Heatmap', desc: 'Visualize monthly risk', action: () => openRiskHeatmap(), kbd: 'H', category: 'Analysis' },
  { icon: '🔄', title: 'Toggle Spot/Leverage', desc: 'Switch trading mode', action: () => { const btn=document.querySelector('.spot-badge'); if(btn) btn.click(); }, kbd: 'M', category: 'Cockpit' },
  { icon: '🌍', title: 'Toggle Global Mode', desc: 'Shared vs separate slots', action: () => { const tog=document.getElementById('global-toggle'); if(tog) tog.click(); }, kbd: 'G', category: 'Cockpit' },
  { icon: '↩️', title: 'Undo', desc: 'Undo last change', action: () => undo(), kbd: 'Ctrl+Z', category: 'Edit' },
  { icon: '↪️', title: 'Redo', desc: 'Redo last undo', action: () => redo(), kbd: 'Ctrl+Y', category: 'Edit' },
  { icon: '⌨️', title: 'Keyboard Shortcuts', desc: 'View all shortcuts', action: () => openShortcutsPanel(), kbd: '?', category: 'Help' },
  { icon: '🤖', title: 'Ask AI Assistant', desc: 'Get help from AI', action: () => { if(typeof aiToggle==='function') aiToggle(); }, kbd: '/', category: 'Help' },
  { icon: '🌙', title: 'Dark Theme', desc: 'Switch to dark mode', action: () => document.body.className='t-dark', category: 'Appearance' },
  { icon: '☀️', title: 'Light Theme', desc: 'Switch to light mode', action: () => document.body.className='t-light', category: 'Appearance' },
  { icon: '🌊', title: 'Ocean Theme', desc: 'Switch to ocean mode', action: () => document.body.className='t-ocean', category: 'Appearance' },
  { icon: '🌲', title: 'Forest Theme', desc: 'Switch to forest mode', action: () => document.body.className='t-forest', category: 'Appearance' },
  { icon: '🔊', title: 'Toggle Sounds', desc: 'Enable/disable sounds', action: () => toggleSounds(), category: 'Settings' },
];

function openCommandPalette() {
  CMD_OPEN = true;
  CMD_INDEX = 0;
  const palette = document.getElementById('cmd-palette');
  const input = document.getElementById('cmd-input');
  palette.classList.add('show');
  input.value = '';
  input.focus();
  renderCommandResults('');
  trackPowerUser('cmd_palette');
}

function closeCommandPalette() {
  CMD_OPEN = false;
  document.getElementById('cmd-palette').classList.remove('show');
}

function renderCommandResults(query) {
  const results = document.getElementById('cmd-results');
  const q = query.toLowerCase().trim();
  
  let filtered = CMD_ACTIONS;
  if (q) {
    filtered = CMD_ACTIONS.filter(a => 
      a.title.toLowerCase().includes(q) || 
      a.desc.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    );
  }
  
  CMD_ITEMS = filtered;
  
  if (filtered.length === 0) {
    results.innerHTML = '<div class="cmd-empty">No results found</div>';
    return;
  }
  
  // Group by category
  const groups = {};
  filtered.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });
  
  let html = '';
  Object.keys(groups).forEach(cat => {
    html += `<div class="cmd-group"><div class="cmd-group-title">${cat}</div>`;
    groups[cat].forEach((item, i) => {
      const globalIndex = filtered.indexOf(item);
      html += `<div class="cmd-item${globalIndex === CMD_INDEX ? ' active' : ''}" data-index="${globalIndex}" onclick="executeCommand(${globalIndex})">
        <div class="cmd-item-icon">${item.icon}</div>
        <div class="cmd-item-text">
          <div class="cmd-item-title">${item.title}</div>
          <div class="cmd-item-desc">${item.desc}</div>
        </div>
        ${item.kbd ? `<span class="cmd-item-kbd">${item.kbd}</span>` : ''}
      </div>`;
    });
    html += '</div>';
  });
  
  results.innerHTML = html;
}

function executeCommand(index) {
  if (CMD_ITEMS[index]) {
    closeCommandPalette();
    CMD_ITEMS[index].action();
  }
}

document.getElementById('cmd-input')?.addEventListener('input', (e) => {
  renderCommandResults(e.target.value);
  CMD_INDEX = 0;
});

document.getElementById('cmd-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    CMD_INDEX = Math.min(CMD_INDEX + 1, CMD_ITEMS.length - 1);
    renderCommandResults(e.target.value);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    CMD_INDEX = Math.max(CMD_INDEX - 1, 0);
    renderCommandResults(e.target.value);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executeCommand(CMD_INDEX);
  }
});

document.getElementById('cmd-palette')?.addEventListener('click', (e) => {
  if (e.target.id === 'cmd-palette') closeCommandPalette();
});

// ── KEYBOARD SHORTCUTS PANEL ──
function openShortcutsPanel() {
  document.getElementById('shortcuts-panel').classList.add('show');
  trackPowerUser('shortcuts');
}

function closeShortcutsPanel() {
  document.getElementById('shortcuts-panel').classList.remove('show');
}

document.getElementById('shortcuts-panel')?.addEventListener('click', (e) => {
  if (e.target.id === 'shortcuts-panel') closeShortcutsPanel();
});

// ── PROJECTION CHART ──
var projectionChart = null;

function renderProjectionChart() {
  const ctx = document.getElementById('projection-chart-canvas');
  if (!ctx) return;

  const months = sim();
  if (!months || months.length === 0) return;

  const labels = ['Start', ...months.map(m => m.lb)];
  const accountData = [gs().P, ...months.map(m => m.eA)];
  const bankedData = [0, ...months.map(m => m.banked)];
  const nwData = [gs().P, ...months.map(m => m.nw)];

  if (projectionChart) projectionChart.destroy();

  projectionChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Account', data: accountData, borderColor: '#1D9E75', pointRadius: 0, borderWidth: 2, tension: 0.4, fill: false },
        { label: 'Banked',  data: bankedData,  borderColor: '#00c47a', pointRadius: 0, borderWidth: 1.5, tension: 0.4, fill: false, borderDash: [5, 3] },
        { label: 'NW',      data: nwData,      borderColor: '#BA7517', pointRadius: 0, borderWidth: 1.5, tension: 0.4, fill: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#888', font: { size: 9 } } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#888', maxTicksLimit: 12 } },
        y: {
          type: 'logarithmic',
          grid: { color: 'rgba(128,128,128,0.07)' },
          ticks: {
            font: { size: 9 }, color: '#888',
            callback: v => {
              if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
              if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
              if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'k';
              return '$' + v;
            }
          }
        }
      }
    }
  });

  // Update stats
  const start = nwData[0];
  const end = nwData[nwData.length - 1];
  const growth = ((end - start) / start) * 100;
  const maxVal = Math.max(...nwData);

  document.getElementById('proj-chart-stats').innerHTML = `
    <div class="proj-stat"><div class="proj-stat-value">${fmt(start)}</div><div class="proj-stat-label">Starting NW</div></div>
    <div class="proj-stat"><div class="proj-stat-value${end > start ? '' : ' negative'}">${fmt(end)}</div><div class="proj-stat-label">Final NW</div></div>
    <div class="proj-stat"><div class="proj-stat-value${growth >= 0 ? '' : ' negative'}">${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%</div><div class="proj-stat-label">Total Growth</div></div>
    <div class="proj-stat"><div class="proj-stat-value">${fmt(maxVal)}</div><div class="proj-stat-label">Peak NW</div></div>
  `;
}

function openProjectionChart() {
  const wrap = document.getElementById('projection-chart-wrap');
  if (!wrap) return;
  wrap.classList.add('show');
  renderProjectionChart();
}

function closeProjectionChart() {
  const wrap = document.getElementById('projection-chart-wrap');
  if (wrap) wrap.classList.remove('show');
  if (projectionChart) {
    projectionChart.destroy();
    projectionChart = null;
  }
}

// ── COMPARE PRESETS ──
var COMPARE_DATA = [null, null];

function openCompareModal() {
  document.getElementById('compare-modal').classList.add('show');
  populateCompareSelects();
  trackPowerUser('compare');
}

function closeCompareModal() {
  document.getElementById('compare-modal').classList.remove('show');
}

document.getElementById('compare-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'compare-modal') closeCompareModal();
});

function populateCompareSelects() {
  const presets = _safeJSON(localStorage.getItem('batt_presets_cache'), []);
  const opt1 = '<option value="">Select preset...</option>' + presets.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  const opt2 = opt1;
  document.getElementById('compare-select-1').innerHTML = opt1;
  document.getElementById('compare-select-2').innerHTML = opt2;
}

function loadComparePreset(colNum) {
  const select = document.getElementById(`compare-select-${colNum}`);
  const col = document.getElementById(`compare-col-${colNum}`);
  const presetId = select.value;
  
  if (!presetId) {
    col.innerHTML = '<div class="compare-col-title">Select a preset...</div>';
    COMPARE_DATA[colNum - 1] = null;
    return;
  }
  
  // Load from cache (in real implementation, would fetch from server)
  const presets = _safeJSON(localStorage.getItem('batt_presets_cache'), []);
  const preset = presets.find(p => p.id == presetId);
  
  if (!preset || !preset.data) {
    col.innerHTML = '<div class="compare-col-title">Could not load preset</div>';
    return;
  }
  
  COMPARE_DATA[colNum - 1] = preset.data;
  renderCompareColumn(colNum, preset.name, preset.data);
}

function renderCompareColumn(colNum, name, data) {
  const col = document.getElementById(`compare-col-${colNum}`);
  const other = COMPARE_DATA[colNum === 1 ? 1 : 0];
  
  const rows = [
    { label: 'Capital', value: '$' + (data.C || 0).toLocaleString(), key: 'C' },
    { label: 'Leverage', value: (data.V || 1) + 'x', key: 'V' },
    { label: 'Position %', value: (data.P || 0) + '%', key: 'P' },
    { label: 'Spot Mode', value: data.SPOT ? 'Yes' : 'No', key: 'SPOT' },
    { label: 'KPI Scale', value: (data.KPI || 1).toFixed(2), key: 'KPI' },
  ];
  
  let html = `<div class="compare-col-title">📊 ${name}</div>`;
  rows.forEach(row => {
    let valueClass = '';
    if (other) {
      const thisVal = parseFloat(String(data[row.key]).replace(/[^0-9.-]/g, '')) || 0;
      const otherVal = parseFloat(String(other[row.key]).replace(/[^0-9.-]/g, '')) || 0;
      if (row.key === 'C' && thisVal > otherVal) valueClass = 'better';
      if (row.key === 'C' && thisVal < otherVal) valueClass = 'worse';
      if (row.key === 'V' && thisVal < otherVal) valueClass = 'better'; // Lower leverage is safer
      if (row.key === 'V' && thisVal > otherVal) valueClass = 'worse';
    }
    html += `<div class="compare-row">
      <span class="compare-label">${row.label}</span>
      <span class="compare-value ${valueClass}">${row.value}</span>
    </div>`;
  });
  
  col.innerHTML = html;
}

// ── MONTE CARLO SIMULATION ──
function openMonteCarlo() {
  if (IS_WIPED) {
    showToast('Fix setup errors first', 'error');
    return;
  }
  showToast('Monte Carlo: Running 1000 simulations...', 'info');
  trackPowerUser('monte_carlo');

  setTimeout(() => {
    console.log('Monte Carlo started');
    const numSims = 1000;
    const results = [];
    const tabId = typeof TAB !== 'undefined' ? TAB : '36';
    const totalMonths = isQTab(tabId) ? 3 : 36;
    console.log('tabId:', tabId, 'totalMonths:', totalMonths);

    // Save original state
    const originalState = S[tabId];
    console.log('originalState keys:', Object.keys(originalState));

    // Capture the simulation function (make sure it exists)
    const simFunc = typeof sim === 'function' ? sim : window.sim;
    if (typeof simFunc !== 'function') {
      console.error('Simulation function not found!');
      showToast('Simulation engine missing. Please reload the page.', 'error');
      return;
    }

    // Helper: create a deep copy of the state that we can safely modify
    function copyStateForSim(orig) {
      const copy = {
        P: orig.P,
        LEV: orig.LEV,
        NOT: orig.NOT,
        KPI: orig.KPI,
        BT: [...orig.BT],
        FR: [...orig.FR],
        WD: { ...orig.WD },
        DEPO: { ...orig.DEPO },
        ML: { ...orig.ML },
        TL: { ...orig.TL },
        MP: { ...orig.MP },
        SPOT: orig.SPOT,
        FEE: { ...orig.FEE },
        ZM: new Set(orig.ZM),               // copy Set correctly
        MT: {},
        // preserve any extra fields like _prevLEV
        ...(orig._prevLEV !== undefined && { _prevLEV: orig._prevLEV }),
      };
      // Deep copy per‑month trade data (if any)
      for (let m in orig.MT) {
        if (orig.MT.hasOwnProperty(m)) {
          copy.MT[m] = {
            bt: [...orig.MT[m].bt],
            fr: [...orig.MT[m].fr],
          };
        }
      }
      return copy;
    }

    // Helper: randomize trade targets in a state
    function randomizeTargets(state, totalMonths) {
      const globalMode = GLOBAL_MODE;
      console.log('randomizeTargets, globalMode:', globalMode);

      if (globalMode) {
        // Randomize global BT array
        for (let i = 0; i < state.BT.length; i++) {
          if (state.BT[i] !== 0) {
            const factor = 0.9 + Math.random() * 0.2; // ±10%
            state.BT[i] = Math.round(state.BT[i] * factor * 10) / 10;
          }
        }
      } else {
        // Per-month mode: randomize each month's BT individually
        for (let m = 1; m <= totalMonths; m++) {
          if (state.ZM.has(m)) continue; // zero month → no trades

          let baseBT;
          if (state.MT[m] && state.MT[m].bt) {
            baseBT = state.MT[m].bt;
          } else {
            baseBT = state.BT;
          }

          if (!state.MT[m]) state.MT[m] = { bt: [...baseBT], fr: [...state.FR] };

          for (let i = 0; i < baseBT.length; i++) {
            if (baseBT[i] !== 0) {
              const factor = 0.9 + Math.random() * 0.2;
              let newVal = Math.round(baseBT[i] * factor * 10) / 10;
              newVal = Math.max(-500, Math.min(500, newVal));
              state.MT[m].bt[i] = newVal;
            } else {
              state.MT[m].bt[i] = 0;
            }
          }
        }
      }
      return state;
    }

    for (let simIdx = 0; simIdx < numSims; simIdx++) {
      if (simIdx % 100 === 0) console.log(`Simulation ${simIdx} of ${numSims}`);

      const simState = copyStateForSim(originalState);
      randomizeTargets(simState, totalMonths);

      S[tabId] = simState;
      const months = simFunc();           // runs projection using the new state
      const finalNW = months.length ? months[months.length - 1].nw : originalState.P;
      results.push(finalNW);

      S[tabId] = originalState;
    }

    console.log('Simulations finished, sorting results');
    results.sort((a, b) => a - b);
    const p10 = results[Math.floor(numSims * 0.1)];
    const p50 = results[Math.floor(numSims * 0.5)];
    const p90 = results[Math.floor(numSims * 0.9)];
    const profitProb = results.filter(r => r > originalState.P).length / numSims * 100;

    console.log('Results:', { p10, p50, p90, profitProb });

    // Build message with explanation
    const message = `<div style="text-align:left;font-size:12px;line-height:1.8">
      <strong>${numSims} Simulations Complete</strong><br><br>
      <span style="color:#E24B4A">10th Percentile:</span> $${p10.toLocaleString('en-US', {minimumFractionDigits: 2})}<br>
      <span style="color:#f0a030">50th Percentile:</span> $${p50.toLocaleString('en-US', {minimumFractionDigits: 2})}<br>
      <span style="color:#00c47a">90th Percentile:</span> $${p90.toLocaleString('en-US', {minimumFractionDigits: 2})}<br><br>
      <strong>Probability of Profit:</strong> ${profitProb.toFixed(1)}%<br><br>
      <hr style="border-color:#333; margin:12px 0">
      <div style="font-size:10px; color:#888; line-height:1.5">
        ℹ️ <strong>What this means:</strong> Each simulation slightly varies your trade targets (±10%).
        Your plan is strong enough that even with those variations, you never ended below your starting capital.
        <br><br>
        ⚠️ <strong>Reality reminder:</strong> This model doesn’t account for market crashes, exchange issues,
        slippage, or emotional mistakes. A 100% probability here is not a guarantee – it just shows your setup
        is very resilient to small randomness.
      </div>
    </div>`;

    if (typeof showConfirm === 'function') {
      showConfirm({
        icon: '🎲',
        type: 'info',
        title: 'Monte Carlo Results',
        message: message,
        confirmText: 'Got it',
        cancelText: ''
      });
    } else {
      alert('Monte Carlo Results:\n' + message.replace(/<[^>]*>/g, ''));
    }
  }, 500);
}
  
// ── RISK HEATMAP ──
function openRiskHeatmap() {
  if (IS_WIPED) {
    showToast('Fix setup errors first', 'error');
    return;
  }
  trackPowerUser('risk_heatmap');

  const tabId = typeof TAB !== 'undefined' ? TAB : '36';
  const totalMonths = isQTab(tabId) ? 3 : 36;
  const months = sim();   // run the projection once

  // Determine risk metric: for leverage, use liq% of trade 1; for spot, mark as "spot"
  const isSpot = gs().SPOT;
  const riskLevels = [];
  for (let i = 0; i < months.length; i++) {
    const mo = months[i];
    let level = 'safe', title = '';
    if (mo.isZ) {
      level = 'zero';
      title = 'Zero month – no trading activity';
    } else if (isSpot) {
      level = 'spot';
      title = 'Spot mode – no liquidation risk';
    } else {
      const liq = mo.liqT1 || 0;  // liq% for trade 1 of that month
      if (liq < 20) {
        level = 'extreme';
        title = `Liq% ${liq.toFixed(0)}% – extreme risk (any move could liquidate)`;
      } else if (liq < 40) {
        level = 'high';
        title = `Liq% ${liq.toFixed(0)}% – high risk (tight buffer)`;
      } else if (liq < 60) {
        level = 'moderate';
        title = `Liq% ${liq.toFixed(0)}% – moderate risk`;
      } else {
        level = 'safe';
        title = `Liq% ${liq.toFixed(0)}% – safe buffer`;
      }
    }
    riskLevels.push({ level, title });
  }

  // Build the heatmap grid
  let heatmapHtml = '<div class="heatmap-grid">';
  for (let m = 1; m <= totalMonths; m++) {
    const r = riskLevels[m-1] || { level: 'safe', title: 'No data' };
    let levelClass = r.level;
    let bgColor = '';
    if (levelClass === 'safe') bgColor = '#0a3020';
    else if (levelClass === 'moderate') bgColor = '#3a3a10';
    else if (levelClass === 'high') bgColor = '#4a2a10';
    else if (levelClass === 'extreme') bgColor = '#4a1010';
    else if (levelClass === 'spot') bgColor = '#1a2a3a';
    else if (levelClass === 'zero') bgColor = '#2a2a2a';   // neutral grey for zero months

    heatmapHtml += `<div class="heatmap-cell ${levelClass}" style="background:${bgColor};" title="${r.title}">${m}</div>`;
  }
  heatmapHtml += '</div>';

  showConfirm({
    icon: '🔥',
    type: 'info',
    title: `Risk Heatmap – ${isSpot ? 'Spot' : 'Leverage'} Mode`,
    message: `<div style="margin-bottom:12px;font-size:11px;color:#888">
      ${isSpot ? 'No liquidation risk in spot mode.' : 'Darker red = higher risk (lower liq% buffer). Hover over a month for details.'}
      ${totalMonths === 3 ? ' (Quarter view – 3 months)' : ''}
    </div>${heatmapHtml}
    <div style="display:flex;gap:12px;margin-top:16px;font-size:9px">
      <span><span style="display:inline-block;width:12px;height:12px;background:#0a3020;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Safe (liq% ≥ 60%)</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:#3a3a10;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Moderate (liq% 40–60%)</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:#4a2a10;border-radius:2px;vertical-align:middle;margin-right:4px"></span>High (liq% 20–40%)</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:#4a1010;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Extreme (liq% < 20%)</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:#2a2a2a;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Zero month</span>
    </div>`,
    confirmText: 'Close',
    cancelText: ''
  });
}
  
// ── SOUNDS ──
var SOUNDS_ENABLED = localStorage.getItem('batt_sounds') !== 'off';

function toggleSounds() {
  SOUNDS_ENABLED = !SOUNDS_ENABLED;
  localStorage.setItem('batt_sounds', SOUNDS_ENABLED ? 'on' : 'off');
  showToast(`Sounds ${SOUNDS_ENABLED ? 'enabled' : 'disabled'}`, 'success');
}
  
function playSound(type) {
  if (!SOUNDS_ENABLED) return;
  
  // Use Web Audio API for simple sounds
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

// ── CONFETTI ──
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

// ── POWER USER TRACKING ──
var POWER_USER_ACTIONS = _safeJSON(localStorage.getItem('batt_power_actions'), []);

function trackPowerUser(action) {
  if (!POWER_USER_ACTIONS.includes(action)) {
    POWER_USER_ACTIONS.push(action);
    localStorage.setItem('batt_power_actions', JSON.stringify(POWER_USER_ACTIONS));
  saveUserDataToServer('power_actions', POWER_USER_ACTIONS);
    
    if (POWER_USER_ACTIONS.length >= 5) {
      document.getElementById('power-user-badge')?.classList.add('show');
      if (POWER_USER_ACTIONS.length === 5) {
        triggerConfetti();
        showToast('🎉 Power User unlocked! You discovered 5 hidden features', 'success');
      }
    }
  }
}

// ── GLOBAL KEYBOARD SHORTCUTS ──
document.addEventListener('keydown', (e) => {
  // Skip if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') {
      if (CMD_OPEN) closeCommandPalette();
      e.target.blur();
    }
    return;
  }
  
  // Command palette
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (CMD_OPEN) closeCommandPalette();
    else openCommandPalette();
    return;
  }
  
  // Close modals on Escape
  if (e.key === 'Escape') {
    if (CMD_OPEN) { closeCommandPalette(); return; }
    if (document.getElementById('shortcuts-panel')?.classList.contains('show')) { closeShortcutsPanel(); return; }
    if (document.getElementById('projection-chart-wrap')?.classList.contains('show')) { closeProjectionChart(); return; }
    if (document.getElementById('compare-modal')?.classList.contains('show')) { closeCompareModal(); return; }
  }
  
  // Shortcuts (only when dashboard is visible)
  const app = document.querySelector('.app');
  if (!app || getComputedStyle(app).opacity === '0') return;
  
  // ? for shortcuts
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault();
    openShortcutsPanel();
    return;
  }
  
  // P for projection
  if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    openProjectionChart();
    return;
  }
  
  // C for compare
  if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    openCompareModal();
    return;
  }
  
  // Ctrl+M for Monte Carlo
  if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
    e.preventDefault();
    openMonteCarlo();
    return;
  }
  
  // H for heatmap
  if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    openRiskHeatmap();
    return;
  }
  
  // Ctrl+Z for undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  
  // Ctrl+Y or Ctrl+Shift+Z for redo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
    return;
  }
  
  // / for AI
  if (e.key === '/') {
    e.preventDefault();
    if (typeof aiToggle === 'function') aiToggle();
    return;
  }
  
  // M for mode toggle
  if (e.key === 'm' && !e.ctrlKey && !e.metaKey) {
    const badge = document.querySelector('.spot-badge');
    if (badge) badge.click();
    return;
  }
  
  // G for global toggle
  if (e.key === 'g' || e.key === 'G') {
    const tog = document.getElementById('global-toggle');
    if (tog) tog.click();
    return;
  }
  
  // F for funding rates tab
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    const fundBtn = document.querySelector('#vt .tb[onclick*="fund"]');
    if (fundBtn) fundBtn.click();
    return;
  }

  // Tab for presets panel
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    if (typeof togglePresetsPanel === 'function') togglePresetsPanel();
    return;
  }
});

// ── EASTER EGGS ──
var KONAMI = [];
const KONAMI_CODE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

document.addEventListener('keydown', (e) => {
  KONAMI.push(e.key);
  KONAMI = KONAMI.slice(-10);
  
  if (KONAMI.join(',') === KONAMI_CODE.join(',')) {
    document.body.classList.add('party-mode');
    triggerConfetti();
    showToast('🎮 Konami Code activated! Party mode!', 'success');
    setTimeout(() => document.body.classList.remove('party-mode'), 5000);
    trackPowerUser('konami');
  }
});

// Double-click dashboard title for dev mode
document.addEventListener('dblclick', (e) => {
  if (e.target.closest('.mh-title')) {
    trackPowerUser('dev_mode');
    console.log('🔧 Dev Mode Active');
    console.log('State:', S);
    console.log('Power Actions:', POWER_USER_ACTIONS);
    showToast('Dev info logged to console', 'info');
  }
});

// Init power user badge
if (POWER_USER_ACTIONS.length >= 5) {
  document.getElementById('power-user-badge')?.classList.add('show');
}

// ══════════════════════════════════════════════════════════════
// ███ ADVANCED FEATURES ███
// ══════════════════════════════════════════════════════════════

// ── CURRENCY SYSTEM ──
var CURRENCIES = {
  USD: { symbol: '$', rate: 1, locale: 'en-US' },
  EUR: { symbol: '€', rate: 0.92, locale: 'de-DE' },
  GBP: { symbol: '£', rate: 0.79, locale: 'en-GB' },
  IDR: { symbol: 'Rp', rate: 15800, locale: 'id-ID' },
  JPY: { symbol: '¥', rate: 149, locale: 'ja-JP' },
  KRW: { symbol: '₩', rate: 1320, locale: 'ko-KR' },
  BTC: { symbol: '₿', rate: 0.000015, locale: 'en-US' }
};

var CURRENT_CURRENCY = localStorage.getItem('batt_currency') || 'USD';

function formatCurrency(usdAmount, currency = CURRENT_CURRENCY) {
  const curr = CURRENCIES[currency] || CURRENCIES.USD;
  const converted = usdAmount * curr.rate;
  
  if (currency === 'BTC') {
    return curr.symbol + converted.toFixed(8);
  }
  
  return curr.symbol + converted.toLocaleString(curr.locale, {
    minimumFractionDigits: currency === 'IDR' || currency === 'KRW' ? 0 : 2,
    maximumFractionDigits: currency === 'IDR' || currency === 'KRW' ? 0 : 2
  });
}

function setCurrency(currency) {
  CURRENT_CURRENCY = currency;
  localStorage.setItem('batt_currency', currency);
  showToast(`Currency set to ${currency}`, 'success');
  // Trigger re-render if needed
  if (typeof render === 'function') render();
  trackPowerUser('currency');
}

// ── PRICE ALERTS ──
var PRICE_ALERTS = _safeJSON(localStorage.getItem('batt_alerts'), []);
var ALERT_CHECK_INTERVAL = null;

function openAlertsPanel() {
  document.getElementById('alerts-panel').classList.add('show');
  renderAlertsList();
  startAlertChecker();
  trackPowerUser('alerts');
}

function closeAlertsPanel() {
  document.getElementById('alerts-panel').classList.remove('show');
}

function showAlertForm() {
  const form = document.getElementById('alert-form');
  const btn = document.getElementById('alert-add-btn');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  btn.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function createAlert() {
  const pair = document.getElementById('alert-pair').value;
  const condition = document.getElementById('alert-condition').value;
  const price = parseFloat(document.getElementById('alert-price').value);
  
  if (!price || isNaN(price)) {
    showToast('Enter a valid price', 'error');
    return;
  }
  
  const alert = {
    id: Date.now(),
    pair,
    condition,
    price,
    triggered: false,
    createdAt: new Date().toISOString()
  };
  
  PRICE_ALERTS.push(alert);
  localStorage.setItem('batt_alerts', JSON.stringify(PRICE_ALERTS));
  
  document.getElementById('alert-price').value = '';
  showAlertForm();
  renderAlertsList();
  showToast(`Alert created: ${pair} ${condition} $${price.toLocaleString()}`, 'success');
}

function deleteAlert(id) {
  PRICE_ALERTS = PRICE_ALERTS.filter(a => a.id !== id);
  localStorage.setItem('batt_alerts', JSON.stringify(PRICE_ALERTS));
  saveUserDataToServer('alerts', PRICE_ALERTS);
  renderAlertsList();
  showToast('Alert deleted', 'success');
}

function renderAlertsList() {
  const list = document.getElementById('alerts-list');
  if (PRICE_ALERTS.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#444;font-size:11px;padding:20px">No alerts set. Create one below.</div>';
    return;
  }
  
  list.innerHTML = PRICE_ALERTS.map(a => `
    <div class="alert-item${a.triggered ? ' triggered' : ''}">
      <div class="alert-info">
        <div class="alert-pair">${a.pair.replace('USDT','')}</div>
        <div class="alert-condition">${a.condition === 'above' ? '↑ Above' : '↓ Below'} $${a.price.toLocaleString()}</div>
      </div>
      <button class="alert-delete" onclick="deleteAlert(${a.id})">✕</button>
    </div>
  `).join('');
}

function startAlertChecker() {
  if (ALERT_CHECK_INTERVAL) clearInterval(ALERT_CHECK_INTERVAL);
  
  ALERT_CHECK_INTERVAL = setInterval(async () => {
    if (PRICE_ALERTS.length === 0) return;
    
    try {
      const symbols = [...new Set(PRICE_ALERTS.map(a => a.pair))];
      const prices = await fetchPricesForAlerts(symbols);
      
      PRICE_ALERTS.forEach(alert => {
        if (alert.triggered) return;
        
        const currentPrice = prices[alert.pair];
        if (!currentPrice) return;
        
        const triggered = alert.condition === 'above' 
          ? currentPrice >= alert.price 
          : currentPrice <= alert.price;
        
        if (triggered) {
          alert.triggered = true;
          localStorage.setItem('batt_alerts', JSON.stringify(PRICE_ALERTS));
          renderAlertsList();
          
          // Notification
          showToast(`🔔 ${alert.pair}: Price ${alert.condition} $${alert.price.toLocaleString()}!`, 'success');
          playSound('success');
          
          // Browser notification if permitted
          if (Notification.permission === 'granted') {
            new Notification('BATT Price Alert', {
              body: `${alert.pair} is now ${alert.condition} $${alert.price.toLocaleString()}`,
              icon: '📊'
            });
          }
          
          // Trigger webhook
          triggerWebhook('alert', { pair: alert.pair, condition: alert.condition, price: alert.price });
        }
      });
    } catch (e) {
      console.log('Alert check failed:', e);
    }
  }, 10000); // Check every 10 seconds
}

async function fetchPricesForAlerts(symbols) {
  const prices = {};
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=["${symbols.join('","')}"]`);
    const data = await response.json();
    data.forEach(item => {
      prices[item.symbol] = parseFloat(item.price);
    });
  } catch (e) {}
  return prices;
}

// ── WEBHOOKS ──
var WEBHOOKS = _safeJSON(localStorage.getItem('batt_webhooks'), []);

function openWebhooksPanel() {
  document.getElementById('webhooks-panel').classList.add('show');
  renderWebhooksList();
  trackPowerUser('webhooks');
}

function closeWebhooksPanel() {
  document.getElementById('webhooks-panel').classList.remove('show');
}

document.getElementById('webhooks-panel')?.addEventListener('click', (e) => {
  if (e.target.id === 'webhooks-panel') closeWebhooksPanel();
});

function renderWebhooksList() {
  const list = document.getElementById('webhooks-list');
  if (WEBHOOKS.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#444;font-size:11px;padding:20px">No webhooks configured.</div>';
    return;
  }
  
  list.innerHTML = WEBHOOKS.map(w => `
    <div class="webhook-item">
      <div class="webhook-item-header">
        <div class="webhook-name">
          ${w.name}
          <span class="webhook-badge ${w.type}">${w.type}</span>
        </div>
      </div>
      <div class="webhook-url">${w.url.substring(0, 40)}...</div>
      <div class="webhook-events">
        ${w.events.map(e => `<span class="webhook-event">${e}</span>`).join('')}
      </div>
      <div class="webhook-actions">
        <button onclick="testWebhook('${w.id}')">Test</button>
        <button class="delete" onclick="deleteWebhook('${w.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function createWebhook() {
  const name = document.getElementById('webhook-name').value.trim();
  const type = document.getElementById('webhook-type').value;
  const url = document.getElementById('webhook-url').value.trim();
  
  if (!name || !url) {
    showToast('Fill in all fields', 'error');
    return;
  }
  
  const events = [];
  if (document.getElementById('wh-evt-sync').checked) events.push('sync');
  if (document.getElementById('wh-evt-alert').checked) events.push('alert');
  if (document.getElementById('wh-evt-trade').checked) events.push('trade');
  if (document.getElementById('wh-evt-goal').checked) events.push('goal');
  
  const webhook = {
    id: Date.now().toString(),
    name,
    type,
    url,
    events,
    createdAt: new Date().toISOString()
  };
  
  WEBHOOKS.push(webhook);
  localStorage.setItem('batt_webhooks', JSON.stringify(WEBHOOKS));
  
  // Clear form
  document.getElementById('webhook-name').value = '';
  document.getElementById('webhook-url').value = '';
  
  renderWebhooksList();
  showToast('Webhook created!', 'success');
}

function deleteWebhook(id) {
  WEBHOOKS = WEBHOOKS.filter(w => w.id !== id);
  localStorage.setItem('batt_webhooks', JSON.stringify(WEBHOOKS));
  saveUserDataToServer('webhooks', WEBHOOKS);
  renderWebhooksList();
  showToast('Webhook deleted', 'success');
}

async function testWebhook(id) {
  const webhook = WEBHOOKS.find(w => w.id === id);
  if (!webhook) return;
  
  showToast('Testing webhook...', 'info');
  
  try {
    const payload = {
      event: 'test',
      message: 'Test from BATT Dashboard',
      timestamp: new Date().toISOString()
    };
    
    if (webhook.type === 'discord') {
      await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `🔔 **BATT Test**\n${payload.message}` })
      });
    } else {
      await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    
    showToast('Webhook test sent!', 'success');
  } catch (e) {
    showToast('Webhook test failed', 'error');
  }
}

async function triggerWebhook(eventType, data) {
  const relevantWebhooks = WEBHOOKS.filter(w => w.events.includes(eventType));
  
  for (const webhook of relevantWebhooks) {
    try {
      const payload = {
        event: eventType,
        data,
        timestamp: new Date().toISOString()
      };
      
      if (webhook.type === 'discord') {
        let message = `🔔 **BATT ${eventType.toUpperCase()}**\n`;
        if (eventType === 'alert') message += `${data.pair} ${data.condition} $${data.price}`;
        if (eventType === 'sync') message += `Dashboard synced to cloud`;
        if (eventType === 'trade') message += `Paper trade: ${data.pair} ${data.side}`;
        
        await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message })
        });
      } else {
        await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    } catch (e) {
      console.log('Webhook failed:', webhook.name, e);
    }
  }
}

// ── CUSTOM THEME CREATOR ──
var CUSTOM_THEMES = _safeJSON(localStorage.getItem('batt_custom_themes'), []);

function openThemeCreator() {
  document.getElementById('theme-creator').classList.add('show');
  renderCustomThemesList();
  initThemeColorPickers();
  trackPowerUser('theme_creator');
}

function closeThemeCreator() {
  document.getElementById('theme-creator').classList.remove('show');
}

document.getElementById('theme-creator')?.addEventListener('click', (e) => {
  if (e.target.id === 'theme-creator') closeThemeCreator();
});

function initThemeColorPickers() {
  ['bg', 'panel', 'accent', 'text'].forEach(key => {
    const picker = document.getElementById(`tc-${key}`);
    const val = document.getElementById(`tc-${key}-val`);
    if (picker && val) {
      picker.addEventListener('input', () => {
        val.textContent = picker.value;
        applyThemePreview();
      });
    }
  });
}

function applyThemePreview() {
  const bg = document.getElementById('tc-bg').value;
  const panel = document.getElementById('tc-panel').value;
  const accent = document.getElementById('tc-accent').value;
  const text = document.getElementById('tc-text').value;
  
  document.documentElement.style.setProperty('--bg', bg);
  document.documentElement.style.setProperty('--panel', panel);
  document.documentElement.style.setProperty('--acc', accent);
  document.documentElement.style.setProperty('--acc2', accent);
  document.documentElement.style.setProperty('--tx', text);
}

function saveCustomTheme() {
  const name = document.getElementById('tc-name').value.trim() || 'Untitled Theme';
  const theme = {
    id: Date.now().toString(),
    name,
    bg: document.getElementById('tc-bg').value,
    panel: document.getElementById('tc-panel').value,
    accent: document.getElementById('tc-accent').value,
    text: document.getElementById('tc-text').value
  };
  
  CUSTOM_THEMES.push(theme);
  localStorage.setItem('batt_custom_themes', JSON.stringify(CUSTOM_THEMES));
  saveUserDataToServer('custom_themes', CUSTOM_THEMES);
  renderCustomThemesList();
  showToast(`Theme "${name}" saved!`, 'success');
}

function applyCustomTheme(id) {
  const theme = CUSTOM_THEMES.find(t => t.id === id);
  if (!theme) return;
  
  document.documentElement.style.setProperty('--bg', theme.bg);
  document.documentElement.style.setProperty('--panel', theme.panel);
  document.documentElement.style.setProperty('--acc', theme.accent);
  document.documentElement.style.setProperty('--acc2', theme.accent);
  document.documentElement.style.setProperty('--tx', theme.text);
  
  showToast(`Theme "${theme.name}" applied!`, 'success');
  closeThemeCreator();
}

function deleteCustomTheme(id) {
  CUSTOM_THEMES = CUSTOM_THEMES.filter(t => t.id !== id);
  localStorage.setItem('batt_custom_themes', JSON.stringify(CUSTOM_THEMES));
  saveUserDataToServer('custom_themes', CUSTOM_THEMES);
  renderCustomThemesList();
  showToast('Theme deleted', 'success');
}

function renderCustomThemesList() {
  const list = document.getElementById('custom-themes-list');
  if (CUSTOM_THEMES.length === 0) {
    list.innerHTML = '<div style="color:#444;font-size:10px">No saved themes</div>';
    return;
  }
  
  list.innerHTML = CUSTOM_THEMES.map(t => `
    <div style="background:#111;border:1px solid #1a1a1a;border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer" onclick="applyCustomTheme('${t.id}')">
      <div style="width:20px;height:20px;border-radius:4px;background:linear-gradient(135deg,${t.bg} 50%,${t.accent} 50%)"></div>
      <div style="flex:1;font-size:10px;color:#e0e0e0">${t.name}</div>
      <button onclick="event.stopPropagation();deleteCustomTheme('${t.id}')" style="background:none;border:none;color:#444;cursor:pointer;font-size:10px">✕</button>
    </div>
  `).join('');
}

// ── LIVE PRICE TICKER ──
var TICKER_ENABLED = localStorage.getItem('batt_ticker') === 'on';

function toggleTicker() {
  TICKER_ENABLED = !TICKER_ENABLED;
  localStorage.setItem('batt_ticker', TICKER_ENABLED ? 'on' : 'off');
  
  const ticker = document.getElementById('cockpit-ticker');
  if (TICKER_ENABLED) {
    ticker.classList.add('show');
    updateTicker();
    startTickerUpdates();
  } else {
    ticker.classList.remove('show');
  }
  
  showToast(`Ticker ${TICKER_ENABLED ? 'enabled' : 'disabled'}`, 'success');
}

function startTickerUpdates() {
  if (!TICKER_ENABLED) return;
  if (window._tickerInterval) clearInterval(window._tickerInterval);
  window._tickerInterval = setInterval(updateTicker, 30000);
}

async function updateTicker() {
  if (!TICKER_ENABLED) return;
  
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];
    const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=["${symbols.join('","')}"]`);
    const data = await response.json();
    
    const track = document.getElementById('ticker-track');
    let html = '';
    
    data.forEach(item => {
      const change = parseFloat(item.priceChangePercent);
      const price = parseFloat(item.lastPrice);
      html += `
        <div class="ticker-item">
          <span class="ticker-symbol">${item.symbol.replace('USDT','')}</span>
          <span class="ticker-price">$${price.toLocaleString('en-US', {minimumFractionDigits: price > 100 ? 0 : 2, maximumFractionDigits: price > 100 ? 2 : 4})}</span>
          <span class="ticker-change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>
        </div>
      `;
    });
    
    // Duplicate for seamless scroll
    track.innerHTML = html + html;
  } catch (e) {
    console.log('Ticker update failed:', e);
  }
}

// Init ticker if enabled
if (TICKER_ENABLED) {
  document.getElementById('cockpit-ticker')?.classList.add('show');
  updateTicker();
  startTickerUpdates();
}

// ── API ACCESS (Developer Mode) ──
var API_KEY = localStorage.getItem('batt_api_key');

function generateApiKey() {
  const key = 'batt_' + Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  API_KEY = key;
  localStorage.setItem('batt_api_key', key);
  saveUserDataToServer('api_key', key);
  showToast('API key generated!', 'success');
  trackPowerUser('api_key');
  return key;
}

function copyApiKey() {
  if (!API_KEY) {
    showToast('Generate an API key first', 'error');
    return;
  }
  navigator.clipboard.writeText(API_KEY);
  showToast('API key copied to clipboard', 'success');
}

// Expose API for developers (hidden)
window.BATT_API = {
  getState: () => JSON.parse(JSON.stringify(S)),
  getPresets: () => _safeJSON(localStorage.getItem('batt_presets_cache'), []),
  getCurrency: () => CURRENT_CURRENCY,
  formatCurrency: formatCurrency,
  triggerWebhook: triggerWebhook,
  exportData: () => ({
    state: S,
    presets: _safeJSON(localStorage.getItem('batt_presets_cache'), []),
    alerts: PRICE_ALERTS,
    webhooks: WEBHOOKS.map(w => ({ name: w.name, events: w.events })),
    currency: CURRENT_CURRENCY
  })
};

// ── ADD TO COMMAND PALETTE ──
CMD_ACTIONS.push(
  { icon: '🔔', title: 'Price Alerts', desc: 'Set price notifications', action: () => openAlertsPanel(), kbd: 'A', category: 'Advanced' },
  { icon: '🔗', title: 'Webhooks', desc: 'Discord/Telegram integrations', action: () => openWebhooksPanel(), kbd: 'W', category: 'Advanced' },
  { icon: '🎨', title: 'Theme Creator', desc: 'Design custom color theme', action: () => openThemeCreator(), kbd: 'Shift+T', category: 'Advanced' },
  { icon: '📺', title: 'Toggle Ticker', desc: 'Live price ticker bar', action: () => toggleTicker(), kbd: 'T', category: 'Advanced' },
  { icon: '💱', title: 'Currency', desc: 'Change display currency', action: () => showCurrencyPicker(), kbd: '$', category: 'Settings' },
  { icon: '🔑', title: 'API Access', desc: 'Generate developer API key', action: () => showApiPanel(), category: 'Advanced' }
);

function showCurrencyPicker() {
  const currencies = Object.keys(CURRENCIES);
  let html = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">';
  currencies.forEach(c => {
    html += `<button onclick="setCurrency('${c}');document.querySelector('.confirm-overlay').classList.remove('visible')" style="padding:10px 16px;background:${c === CURRENT_CURRENCY ? 'var(--acc)' : '#1a1a1a'};color:${c === CURRENT_CURRENCY ? '#000' : '#888'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">${CURRENCIES[c].symbol} ${c}</button>`;
  });
  html += '</div>';
  
  showConfirm({
    icon: '💱',
    type: 'info',
    title: 'Select Currency',
    message: html,
    confirmText: 'Close',
    cancelText: ''
  });
}

function showApiPanel() {
  showConfirm({
    icon: '🔑',
    type: 'info',
    title: 'Developer API',
    message: `<div style="font-size:11px;text-align:left;line-height:1.8">
      <p style="color:#888;margin-bottom:12px">Access your BATT data programmatically via <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px">window.BATT_API</code></p>
      <div style="background:#0a0a0a;border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-size:9px;color:#555;margin-bottom:4px">YOUR API KEY</div>
        <div style="font-family:monospace;color:#e0e0e0;word-break:break-all">${API_KEY || '<em style="color:#444">Not generated</em>'}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="generateApiKey();showApiPanel()" style="flex:1;padding:8px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#888;cursor:pointer;font-size:10px">Generate New</button>
        <button onclick="copyApiKey()" style="flex:1;padding:8px;background:var(--acc);border:none;border-radius:6px;color:#000;cursor:pointer;font-size:10px;font-weight:700">Copy Key</button>
      </div>
    </div>`,
    confirmText: 'Close',
    cancelText: ''
  });
}

// ── DIRECT KEYBOARD SHORTCUTS (No Ctrl+K needed!) ──
// All these work when cockpit is visible

document.addEventListener('keydown', (e) => {
  // Skip if typing
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  // Check if cockpit is visible
  const app = document.querySelector('.app');
  const cockpitVisible = app && getComputedStyle(app).opacity !== '0';
  
  if (!cockpitVisible) return;
  
  // A = Alerts
  if (e.key === 'a' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    openAlertsPanel();
    return;
  }
  
  // W = Webhooks
  if (e.key === 'w' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    openWebhooksPanel();
    return;
  }
  
  // T = Ticker toggle
  if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    toggleTicker();
    return;
  }
  
  // Shift+T = Theme creator
  if (e.key === 'T' && e.shiftKey) {
    e.preventDefault();
    openThemeCreator();
    return;
  }
  
  // $ or Shift+4 = Currency picker
  if (e.key === '$' || (e.shiftKey && e.key === '4')) {
    e.preventDefault();
    showCurrencyPicker();
    return;
  }
});