let IDR=16700,IDR_LAST_UPDATE='';
async function fetchIDR(force){
  try{
    const btn=document.getElementById('idr-refresh');
    if(btn) btn.style.opacity='.4';
    const r=await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const d=await r.json();
    if(d.rates&&d.rates.IDR){
      IDR=d.rates.IDR;
      const now=new Date();
      IDR_LAST_UPDATE=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
      // update rate display
      const el=document.getElementById('idr-rate-val');if(el)el.textContent='Rp'+Math.round(IDR).toLocaleString();
      const el2=document.getElementById('idr-rate-time');if(el2)el2.textContent='upd '+IDR_LAST_UPDATE;
      if(btn)btn.style.opacity='1';
      // soft update: patch only metric cards that show IDR values — no chart rebuild
      if(force) softUpdate();
    }
  }catch(e){const btn=document.getElementById('idr-refresh');if(btn)btn.style.opacity='1';}
}

// ── LIVE FUNDING RATE ──
async function fetchLiveFundingRate(){
  const btn=document.getElementById('fee-live-btn');
  const statusEl=document.getElementById('fee-live-status');
  if(btn){btn.style.opacity='.4';btn.textContent='⟳';}
  if(statusEl) statusEl.textContent='fetching...';
  FEE_LIVE.loading=true;
  try{
    const ex=FEE_LIVE.exchange, sym=FEE_LIVE.symbol;
    let rate=null;
    if(ex==='binance'){
      const r=await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`);
      const d=await r.json();
      rate=d.lastFundingRate?Math.abs(parseFloat(d.lastFundingRate)*100):null;
    } else if(ex==='bybit'){
      const r=await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`);
      const d=await r.json();
      rate=d.result?.list?.[0]?.fundingRate?Math.abs(parseFloat(d.result.list[0].fundingRate)*100):null;
    } else if(ex==='okx'){
      const instId=sym.replace('USDT','-USDT-SWAP').replace('USDC','-USDC-SWAP');
      const r=await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`);
      const d=await r.json();
      rate=d.data?.[0]?.fundingRate?Math.abs(parseFloat(d.data[0].fundingRate)*100):null;
    }
    if(rate!==null){
      FEE_LIVE.rate=rate;
      gs().FEE.funding=Math.round(rate*10000)/10000;
      const inp=document.getElementById('fee-funding');
      if(inp){inp.value=gs().FEE.funding;inp.classList.add('active');setTimeout(()=>inp.classList.remove('active'),1200);}
      if(statusEl) statusEl.textContent=`live · ${ex}`;
      softUpdate();
    } else {
      if(statusEl) statusEl.textContent='no data';
    }
  } catch(e){
    if(statusEl) statusEl.textContent='failed';
  }
  FEE_LIVE.loading=false;
  if(btn){btn.style.opacity='1';btn.textContent='↻';}
}
// ── HISTORICAL FUNDING RATE FETCH ──
// Fetches all funding payments between entry and exit datetime for a pair
async function fetchHistoricalFunding(exchange, symbol, startMs, endMs){
  const results=[];
  try{
    if(exchange==='binance'){
      // Binance: /fapi/v1/fundingRate — 8h intervals, max 1000 per call
      let from=startMs;
      while(from<endMs){
        const url=`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${from}&endTime=${endMs}&limit=1000`;
        const r=await fetch(url);
        const d=await r.json();
        if(!Array.isArray(d)||d.length===0) break;
        d.forEach(x=>results.push({ts:parseInt(x.fundingTime),rate:parseFloat(x.fundingRate)}));
        from=parseInt(d[d.length-1].fundingTime)+1;
        if(d.length<1000) break;
      }
    } else if(exchange==='bybit'){
      // Bybit: /v5/market/funding/history — max 200 per call
      let cursor='';
      let calls=0;
      while(calls<20){
        const url=`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&startTime=${startMs}&endTime=${endMs}&limit=200${cursor?'&cursor='+cursor:''}`;
        const r=await fetch(url);
        const d=await r.json();
        if(!d.result?.list?.length) break;
        d.result.list.forEach(x=>results.push({ts:parseInt(x.fundingRateTimestamp),rate:parseFloat(x.fundingRate)}));
        cursor=d.result.nextPageCursor||'';
        if(!cursor||d.result.list.length<200) break;
        calls++;
      }
    } else if(exchange==='okx'){
      // OKX: /api/v5/public/funding-rate-history — max 100 per call
      const instId=symbol.replace('USDT','-USDT-SWAP').replace('USDC','-USDC-SWAP');
      let before='';
      let calls=0;
      while(calls<20){
        const url=`https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=100${before?'&before='+before:'&after='+endMs}`;
        const r=await fetch(url);
        const d=await r.json();
        if(!d.data?.length) break;
        // OKX returns newest first, filter by range
        const inRange=d.data.filter(x=>parseInt(x.fundingTime)>=startMs&&parseInt(x.fundingTime)<=endMs);
        inRange.forEach(x=>results.push({ts:parseInt(x.fundingTime),rate:parseFloat(x.fundingRate)}));
        const oldest=d.data[d.data.length-1];
        if(parseInt(oldest.fundingTime)<=startMs||d.data.length<100) break;
        before=oldest.fundingTime;
        calls++;
      }
    }
  }catch(e){
    console.warn('funding fetch failed:',e);
  }
  return results;
}

// Calculate total funding paid from historical rates
function calcFundingFromHistory(rates, notional, isLong){
  // funding: positive rate = longs pay shorts, negative = shorts pay longs
  let total=0;
  rates.forEach(r=>{
    const paid=isLong?r.rate:-r.rate; // long pays positive rates, short receives
    total+=paid*notional;
  });
  return total; // positive = you paid, negative = you received
}

// ── LANGUAGE ──
let LANG='en';

// ── TRANSLATION ──
const TR={
en:{
  cagr_lbl:'3yr CAGR', cagr_sub:'annualized, combined NW',
  total_ret_lbl:'total return', total_ret_sub:(c)=>`36mo on ${c} principal`,
  end_acct_lbl:'end account m36', banked_lbl:'total banked', banked_sub:'profits taken out',
  nw_lbl:'combined NW', nw_sub:'account + banked',
  milestone_lbl:'$1M milestone', beyond36:'beyond 36', milestone_hit:'NW hits $1M at ', milestone_miss:'increase capital or returns',
  avg_lbl:'avg monthly gain', avg_sub:'active months only', per_active_month:'per active month',
  seq_lbl:'max seq upside', seq_net_lbl:'net seq result', per_seq:'per sequence', trades:'trades', months:'months',
  liq_mc_lbl:'liq% t1 · month 1', liq_mc_sub:(n)=>`spot must drop ${n}% to wipe t1`,
  q_end_lbl:'quarter end', total_gain_lbl:'total gain', active_trades:'active trades', active:'active',
  note_setup:'setup', note_margin:'actual margin', note_at:'at',
  note_liq:(n)=>`spot must drop ${n}% to liquidate trade 1`,
  note_wd:'withdrawal input in table · liq drops after wd (less buffer next month)',
  label_hint:'✏️ click any month or trade name to rename it — make every label yours',
  sc_risk:'risk score', sc_liq:'liq t1 buffer', sc_liq_sub:'spot drop → wipe',
  sc_lev:'leverage', sc_of_acct:'of acct', sc_avg:'avg monthly', sc_avg_sub:'active months',
  sc_cagr:'3yr CAGR', sc_cagr_sub:'account + banked', sc_life:'lifespan',
  sc_seq:'net seq result', sc_verdict:'verdict',
  rl_SAFE:'SAFE', rl_MODERATE:'MODERATE', rl_HIGH:'HIGH RISK', rl_EXTREME:'EXTREME',
  verdict_solid:'setup looks solid',
  age_minutes:'minutes', age_hours:'hours', age_days:'days', age_weeks:'weeks', age_months:'months',
  'age_~1 year':'~1 year', age_years:'years', 'age_a decade':'a decade', age_generational:'generational',
  age_sub_minutes:'one bad candle ends it', age_sub_hours:'extremely fragile',
  age_sub_days:'volatile session → gone', age_sub_weeks:'dangerous · tighten risk',
  age_sub_months:'manageable, stay sharp', 'age_sub_~1 year':'solid · respect the plan',
  age_sub_years:'disciplined trader energy', 'age_sub_a decade':'institutional grade',
  age_sub_generational:'almost unliquidatable',
},
id:{
  cagr_lbl:'CAGR 3 thn', cagr_sub:'dianualisasi, NW gabungan',
  total_ret_lbl:'total return', total_ret_sub:(c)=>`36 bln dari modal ${c}`,
  end_acct_lbl:'akun akhir m36', banked_lbl:'total ditarik', banked_sub:'profit yg sudah ditarik',
  nw_lbl:'NW gabungan', nw_sub:'akun + ditarik',
  milestone_lbl:'target $1 Juta', beyond36:'lewat 36 bln', milestone_hit:'NW capai $1M di ', milestone_miss:'tambah modal atau tingkatkan return',
  avg_lbl:'rata-rata bulanan', avg_sub:'bulan aktif saja', per_active_month:'per bulan aktif',
  seq_lbl:'potensi seq maks', seq_net_lbl:'hasil net sekuens', per_seq:'per sekuens', trades:'trade', months:'bulan',
  liq_mc_lbl:'liq% t1 · bulan 1', liq_mc_sub:(n)=>`harga perlu turun ${n}% untuk likuidasi t1`,
  q_end_lbl:'akhir kuartal', total_gain_lbl:'total gain', active_trades:'trade aktif', active:'aktif',
  note_setup:'setup', note_margin:'margin aktual', note_at:'di',
  note_liq:(n)=>`harga perlu turun ${n}% untuk likuidasi trade 1`,
  note_wd:'input penarikan di tabel · liq turun setelah penarikan (buffer lebih kecil bulan depan)',
  label_hint:'✏️ klik nama bulan atau trade untuk mengganti — buat setiap label milikmu sendiri',
  sc_risk:'skor risiko', sc_liq:'buffer liq t1', sc_liq_sub:'harga turun → likuidasi',
  sc_lev:'leverage', sc_of_acct:'dari akun', sc_avg:'rata-rata bulanan', sc_avg_sub:'bulan aktif',
  sc_cagr:'CAGR 3 thn', sc_cagr_sub:'akun + ditarik', sc_life:'ketahanan akun',
  sc_seq:'net sekuens', sc_verdict:'kesimpulan',
  rl_SAFE:'AMAN', rl_MODERATE:'MODERAT', rl_HIGH:'RISIKO TINGGI', rl_EXTREME:'EKSTREM',
  verdict_solid:'setup terlihat solid',
  age_minutes:'menit', age_hours:'jam', age_days:'hari', age_weeks:'minggu', age_months:'bulan',
  'age_~1 year':'~1 tahun', age_years:'tahun', 'age_a decade':'satu dekade', age_generational:'generasional',
  age_sub_minutes:'satu candle buruk bisa habis', age_sub_hours:'sangat rapuh',
  age_sub_days:'satu sesi volatil → habis', age_sub_weeks:'berbahaya · kencangkan risiko',
  age_sub_months:'masih aman, tetap waspada', 'age_sub_~1 year':'solid · ikuti rencananya',
  age_sub_years:'energi trader disiplin', 'age_sub_a decade':'kelas institusional',
  age_sub_generational:'hampir tidak bisa dilikuidasi',
}};
function t(key,arg){
  const lang=LANG||'en';
  const val=(TR[lang]&&TR[lang][key]!==undefined)?TR[lang][key]:((TR.en&&TR.en[key]!==undefined)?TR.en[key]:key);
  if(typeof val==='function') return val(arg);
  return val;
}

const GUIDE_HTML=`
<style>
.guide-wrap{max-width:800px;padding:4px 0 20px;font-size:12px;line-height:1.7;color:var(--tx)}
.g-title{font-size:18px;font-weight:700;color:var(--tx);margin-bottom:4px}
.g-sub{font-size:11px;color:var(--tx2);margin-bottom:16px}
.g-sec{margin-bottom:22px}
.g-sec-title{font-size:13px;font-weight:700;color:var(--acc2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;padding-bottom:5px;border-bottom:0.5px solid var(--bd2)}
.g-term{display:grid;grid-template-columns:140px 1fr;gap:8px 16px;margin-bottom:8px;align-items:start}
.g-term-name{font-size:11px;font-weight:700;color:var(--tx);background:var(--sf2);padding:3px 8px;border-radius:5px;white-space:nowrap}
.g-term-def{font-size:11px;color:var(--tx2);line-height:1.6}
.g-term-def b{color:var(--tx);font-weight:600}
.g-tip{background:var(--sf2);border-left:3px solid var(--acc2);border-radius:0 8px 8px 0;padding:10px 14px;font-size:11px;color:var(--tx2);margin:10px 0;line-height:1.7}
.g-tip b{color:var(--acc2)}
.g-step{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px}
.g-step-num{width:24px;height:24px;border-radius:50%;background:var(--acc);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.g-step-body{font-size:11px;color:var(--tx2);line-height:1.7}
.g-step-body b{color:var(--tx);font-weight:600}
.g-warn{background:#FAEEDA;border-radius:8px;padding:10px 14px;font-size:11px;color:#854F0B;margin:10px 0;line-height:1.7}
body.t-dark .g-warn{background:#2a1a00;color:#EF9F27}
body.t-ocean .g-warn,.body.t-forest .g-warn,.body.t-sunset .g-warn,.body.t-lavender .g-warn{background:var(--sf2);color:var(--tx2)}
.g-toggle-demo{display:inline-flex;align-items:center;gap:6px;background:var(--sf2);border:0.5px solid var(--bd2);border-radius:6px;padding:4px 10px;font-size:10px;color:var(--tx2);margin:4px 0}
.g-tog-on{padding:2px 8px;border-radius:4px;background:var(--togon);color:var(--togonc);font-size:10px;font-weight:700}
.g-tog-off{padding:2px 8px;border-radius:4px;background:transparent;color:var(--tx2);font-size:10px}

/* Tab Navigation - Improved */
.g-nav{display:flex;gap:4px;margin:16px 0 20px;padding:6px;background:var(--sf2);border-radius:12px;border:1px solid var(--bd2);overflow-x:auto;-webkit-overflow-scrolling:touch}
.g-nav::-webkit-scrollbar{height:0}
.g-nav-btn{padding:10px 16px;font-size:11px;font-weight:600;border:none;border-radius:8px;cursor:pointer;background:transparent;color:var(--tx2);transition:all .15s;display:flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0}
.g-nav-btn:hover{background:var(--bg);color:var(--tx)}
.g-nav-btn.active{background:var(--acc2);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.g-nav-btn .g-nav-icon{font-size:14px}
.g-panel{display:none;animation:gFadeIn .25s ease;min-height:200px}
.g-panel.active{display:block}
@keyframes gFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style>

<div class="g-title">bet all the time, bet with style · guide</div>
<div class="g-sub">by <a href="https://t.me/CryptoJurnal" target="_blank" style="color:var(--acc2);font-weight:700;text-decoration:none">@cryptojurnal ↗</a> · essential concepts · keep it simple, keep it disciplined</div>

<!-- ALWAYS VISIBLE: Two Tabs Section -->
<div class="g-sec">
  <div class="g-sec-title">🗂️ the two tabs — start here</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
    <div style="background:var(--sf2);border-radius:8px;padding:14px 16px;border-left:3px solid var(--acc2)">
      <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:6px">36-MONTH · long term projection</div>
      <div style="font-size:11px;color:var(--tx2);line-height:1.7">your <b>master plan</b>. set it once, let compounding do the work over 36 months. use this to <b>onboard a strategy</b>, stress-test your risk setup, and see where your capital ends up. think of it as your <b>trading blueprint</b>.</div>
      <div style="margin-top:8px;font-size:10px;color:var(--acc2);font-weight:600">ideal for: planning · capital allocation · long-term conviction</div>
    </div>
    <div style="background:var(--sf2);border-radius:8px;padding:14px 16px;border-left:3px solid var(--acc)">
      <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:6px">QUARTER · short term assessment</div>
      <div style="font-size:11px;color:var(--tx2);line-height:1.7">your <b>live trading lab</b>. 3 months, zero zero-months, pure execution. use this <b>before entering a trade</b> to validate your setup — check if liq%, leverage, and notional make sense. think of it as your <b>pre-flight checklist</b>.</div>
      <div style="margin-top:8px;font-size:10px;color:var(--acc);font-weight:600">ideal for: scalp · day trade · quick validation · formula testing</div>
    </div>
  </div>
  <div class="g-tip"><b>workflow:</b> use the quarter tab to find the right formula for current conditions → once confident, port those settings to 36-month for the full projection. both tabs have completely independent state.</div>
</div>

<!-- HORIZONTAL TAB NAVIGATION -->
<div class="g-nav" id="guide-nav">
  <button class="g-nav-btn active" onclick="showGuidePanel('basics')"><span class="g-nav-icon">🔑</span> Basics</button>
  <button class="g-nav-btn" onclick="showGuidePanel('metrics')"><span class="g-nav-icon">📊</span> Metrics</button>
  <button class="g-nav-btn" onclick="showGuidePanel('controls')"><span class="g-nav-icon">⚙️</span> Controls</button>
  <button class="g-nav-btn" onclick="showGuidePanel('risk')"><span class="g-nav-icon">🎯</span> Risk</button>
  <button class="g-nav-btn" onclick="showGuidePanel('spot')"><span class="g-nav-icon">◈</span> Spot Mode</button>
  <button class="g-nav-btn" onclick="showGuidePanel('errors')"><span class="g-nav-icon">🚨</span> Errors</button>
  <button class="g-nav-btn" onclick="showGuidePanel('power')"><span class="g-nav-icon">⚡</span> Power</button>
  <button class="g-nav-btn" onclick="showGuidePanel('glossary')"><span class="g-nav-icon">📚</span> Glossary</button>
</div>

<!-- PANEL: BASICS -->
<div class="g-panel active" id="gp-basics">
  <div class="g-sec">
    <div class="g-sec-title">🔑 core concepts</div>
    <div class="g-term"><span class="g-term-name">liq%</span><span class="g-term-def">liquidation percentage. <b>how far price must move against you before wipe.</b> most important number. higher = safer. formula: account ÷ notional × 100. aim for 100%+, 40% is the floor.</span></div>
    <div class="g-term"><span class="g-term-name">notional</span><span class="g-term-def"><b>total position size after leverage.</b> $100 at 10× = $1,000 notional. this is what the exchange trades for you.</span></div>
    <div class="g-term"><span class="g-term-name">actual margin</span><span class="g-term-def"><b>real capital used as collateral</b> for trade 1. formula: notional ÷ leverage.</span></div>
    <div class="g-term"><span class="g-term-name">fm%</span><span class="g-term-def"><b>fractional margin</b> — margin as % of account. if fm% = 16%, you're deploying 16% as margin. lower = safer. if fm% > 100%, position cannot open.</span></div>
    <div class="g-term"><span class="g-term-name">leverage</span><span class="g-term-def">multiplier. 5× means you control 5× your capital. higher leverage = higher risk + lower liq%.</span></div>
    <div class="g-term"><span class="g-term-name">carry-forward</span><span class="g-term-def">each trade's notional <b>grows by adding previous trade's profit.</b> compounds within the sequence.</span></div>
    <div class="g-tip"><b>the relationship:</b> liq% = account ÷ notional × 100. if account = $1,000 and notional = $2,500, liq% = 40%. withdraw $500 → liq% drops to 20%.</div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">🔘 toggle switches</div>
    <div class="g-term">
      <span class="g-term-name">link to capital</span>
      <span class="g-term-def">
        <b>off (default):</b> notional stays fixed when capital changes. safer.<br>
        <b>on:</b> notional scales with capital to maintain liq% ratio.
      </span>
    </div>
    <div class="g-term">
      <span class="g-term-name">global mode</span>
      <span class="g-term-def">
        <b>on (default):</b> all months use same trade slots.<br>
        <b>off:</b> each month has independent targets.
      </span>
    </div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">💾 saving</div>
    <div class="g-term"><span class="g-term-name">save buttons</span><span class="g-term-def">capital, position, trades use manual 💾 buttons — experiment freely without overwriting.</span></div>
    <div class="g-term"><span class="g-term-name">auto-save</span><span class="g-term-def">labels, zero months, withdrawals, fees save automatically on edit.</span></div>
    <div class="g-term"><span class="g-term-name">cloud presets</span><span class="g-term-def">logged-in users can save to cloud and sync across devices.</span></div>
  </div>
</div>

<!-- PANEL: METRICS -->
<div class="g-panel" id="gp-metrics">
  <div class="g-sec">
    <div class="g-sec-title">📊 cockpit indicators (6×2 grid)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">3yr CAGR</div>
        <div style="font-size:10px;color:var(--tx2)">compound annual growth rate over 36 months. S&P ~10%, Buffett ~20%, elite crypto 50%+.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">total return</div>
        <div style="font-size:10px;color:var(--tx2)">percentage gain from start to final combined NW.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">combined NW</div>
        <div style="font-size:10px;color:var(--tx2)">net worth = end account + banked. your true wealth.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">banked</div>
        <div style="font-size:10px;color:var(--tx2)">profits withdrawn. safe from liquidation.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">end account</div>
        <div style="font-size:10px;color:var(--tx2)">balance at M36. shows active months + IDR.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:#f7931a;margin-bottom:4px">₿ equivalent</div>
        <div style="font-size:10px;color:var(--tx2)">end balance in BTC at live price.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">$1M milestone</div>
        <div style="font-size:10px;color:var(--tx2)">first month NW crosses $1,000,000.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">avg monthly %</div>
        <div style="font-size:10px;color:var(--tx2)">average gain per active month.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">seq net %</div>
        <div style="font-size:10px;color:var(--tx2)">net gain from 10-trade sequence. shows W/L.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">liq% t1</div>
        <div style="font-size:10px;color:var(--tx2)">buffer at trade 1 month 1. the tightest point.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:#E24B4A;margin-bottom:4px">total fees</div>
        <div style="font-size:10px;color:var(--tx2)">cumulative trading + funding fees.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:#5b7fff;margin-bottom:4px">1yr return</div>
        <div style="font-size:10px;color:var(--tx2)">percentage gain by M12.</div>
      </div>
    </div>
    <div class="g-tip"><b>IDR conversion:</b> values in Indonesian Rupiah shown as subtitles. rate updates from live forex.</div>
  </div>
</div>

<!-- PANEL: CONTROLS -->
<div class="g-panel" id="gp-controls">
  <div class="g-sec">
    <div class="g-sec-title">⚙️ how to use controls</div>
    <div class="g-step"><div class="g-step-num">1</div><div class="g-step-body"><b>set starting capital</b> — your actual account size. use presets or type/slide manually.</div></div>
    <div class="g-step"><div class="g-step-num">2</div><div class="g-step-body"><b>set leverage</b> — higher = smaller margin but lower liq%. watch liq% update live.</div></div>
    <div class="g-step"><div class="g-step-num">3</div><div class="g-step-body"><b>set notional</b> — trade 1 position size. <b>keep liq% ≥ 40%</b> (floor), aim for 100%+.</div></div>
    <div class="g-step"><div class="g-step-num">4</div><div class="g-step-body"><b>set trade slots</b> — 10 slots with target%. set target to 0 to skip.</div></div>
    <div class="g-step"><div class="g-step-num">5</div><div class="g-step-body"><b>zero months</b> — click ⊘ to mark months with no trading.</div></div>
    <div class="g-step"><div class="g-step-num">6</div><div class="g-step-body"><b>withdrawal</b> — type in withdrawal column. <b>always check liq% after.</b></div></div>
    <div class="g-step"><div class="g-step-num">7</div><div class="g-step-body"><b>margin push ⚡</b> — per-month multiplier on trade 1 notional. use sparingly.</div></div>
    <div class="g-warn">⚠ when you withdraw, liq% drops for next month. if it drops below 20%, you're in the danger zone.</div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">🎨 customization</div>
    <div class="g-term"><span class="g-term-name">month labels</span><span class="g-term-def">click any month name to rename — e.g. "april 2026", "halving month".</span></div>
    <div class="g-term"><span class="g-term-name">trade labels</span><span class="g-term-def">in detail view, click trade row to rename — e.g. "BTC/USDT long".</span></div>
    <div class="g-term"><span class="g-term-name">themes</span><span class="g-term-def">6 themes: Light, Dark, Ocean, Forest, Sunset, Lavender.</span></div>
  </div>
</div>

<!-- PANEL: RISK -->
<div class="g-panel" id="gp-risk">
  <div class="g-sec">
    <div class="g-sec-title">🎯 risk assessment</div>
    <div class="g-term"><span class="g-term-name">risk score</span><span class="g-term-def">0–100. <b>lower = safer.</b> factors: liq%, leverage, fm%, active trades. 0-20 safe, 21-45 moderate, 46-70 high, 71-100 extreme.</span></div>
    <div class="g-term"><span class="g-term-name">liq t1 buffer</span><span class="g-term-def">liq% for trade 1 month 1. green = good, amber = watchable, red = danger.</span></div>
    <div class="g-term"><span class="g-term-name">lifespan</span><span class="g-term-def">estimated survival time. from <b>minutes</b> (extreme) to <b>generational</b> (almost unliquidatable).</span></div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">✅ healthy vs danger</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:#EAF3DE;border-radius:7px;padding:10px 12px">
        <div style="font-size:11px;font-weight:700;color:#3B6D11;margin-bottom:6px">✓ healthy setup</div>
        <div style="font-size:10px;color:#3B6D11;line-height:1.8">liq% ≥ 100% (ideal)<br>liq% ≥ 40% (floor)<br>leverage ≤ 15×<br>fm% ≤ 20%<br>risk score < 30</div>
      </div>
      <div style="background:#FCEBEB;border-radius:7px;padding:10px 12px">
        <div style="font-size:11px;font-weight:700;color:#A32D2D;margin-bottom:6px">✕ danger zone</div>
        <div style="font-size:10px;color:#A32D2D;line-height:1.8">liq% < 20%<br>leverage ≥ 25×<br>fm% > 40%<br>risk score > 60<br>wd without checking liq%</div>
      </div>
    </div>
    <div class="g-tip"><b>discipline rule:</b> never enter a trade without checking liq% first. if below 30%, reduce notional or add capital.</div>
  </div>
</div>

<!-- PANEL: SPOT -->
<div class="g-panel" id="gp-spot">
  <div class="g-sec">
    <div class="g-sec-title">◈ spot mode</div>
    <div style="font-size:11px;color:var(--tx2);margin-bottom:12px">spot mode = <b>buy and hold without leverage</b>. no margin, no liquidation risk, no funding fee.</div>
    <div class="g-term"><span class="g-term-name">how to switch</span><span class="g-term-def">click the <b>◈ spot</b> button under leverage panel. each tab remembers its own mode.</span></div>
    <div class="g-term"><span class="g-term-name">what changes</span><span class="g-term-def">leverage disabled, notional = account, funding fee removed, liq% irrelevant.</span></div>
    <div class="g-term"><span class="g-term-name">fees</span><span class="g-term-def">spot fees higher (~0.1%) vs futures (~0.02-0.05%). still 2× per trade (open + close).</span></div>
    <div class="g-term"><span class="g-term-name">size×</span><span class="g-term-def">scales how much capital deployed that month. at 1× = 100% deployed.</span></div>
    <div class="g-term"><span class="g-term-name">risk score</span><span class="g-term-def">uses different criteria: fee drag, concentration, target aggression, win/loss ratio.</span></div>
    <div class="g-tip"><b>spot vs leverage:</b> run both side by side in separate tabs to compare strategies.</div>
  </div>
</div>

<!-- PANEL: ERRORS -->
<div class="g-panel" id="gp-errors">
  <div class="g-sec">
    <div class="g-sec-title">🚨 error states</div>
    <div style="font-size:11px;color:var(--tx2);margin-bottom:12px">dashboard detects invalid setups and shows clear error states:</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="background:#2a0a0a;border-radius:8px;padding:12px;border-left:3px solid #E24B4A">
        <div style="font-size:16px;margin-bottom:6px">🚫</div>
        <div style="font-size:11px;font-weight:700;color:#ff7070;margin-bottom:4px">FM% > 100%</div>
        <div style="font-size:10px;color:#E24B4A;line-height:1.5">margin exceeds capital. exchange rejects order.</div>
        <div style="font-size:9px;color:#ff9999;margin-top:6px">fix: ↑ leverage, ↓ notional, or ↑ capital</div>
      </div>
      <div style="background:#2a0a0a;border-radius:8px;padding:12px;border-left:3px solid #E24B4A">
        <div style="font-size:16px;margin-bottom:6px">💸</div>
        <div style="font-size:11px;font-weight:700;color:#ff7070;margin-bottom:4px">Liq% < 1%</div>
        <div style="font-size:10px;color:#E24B4A;line-height:1.5">zero buffer. any move = instant liquidation.</div>
        <div style="font-size:9px;color:#ff9999;margin-top:6px">fix: ↓ notional or ↑ capital</div>
      </div>
      <div style="background:#1a0a2e;border-radius:8px;padding:12px;border-left:3px solid #8B5CF6">
        <div style="font-size:16px;margin-bottom:6px">💀</div>
        <div style="font-size:11px;font-weight:700;color:#c084fc;margin-bottom:4px">WD Bust</div>
        <div style="font-size:10px;color:#8B5CF6;line-height:1.5">withdrawal exceeded balance.</div>
        <div style="font-size:9px;color:#a78bfa;margin-top:6px">fix: ↓ withdrawal amount</div>
      </div>
    </div>
    <div class="g-tip"><b>recovery:</b> fix the issue → dashboard auto-recalculates → normal state restored.</div>
  </div>
</div>

<!-- PANEL: POWER -->
<div class="g-panel" id="gp-power">
  <div class="g-sec">
    <div class="g-sec-title">⚡ power user features</div>
    <div class="g-term"><span class="g-term-name">shortcuts</span><span class="g-term-def">press <b>?</b> to see all. P = projection, Ctrl+M = monte carlo, C = compare, H = heatmap, T = theme.</span></div>
    <div class="g-term"><span class="g-term-name">projection 📈</span><span class="g-term-def">visual line chart of 36-month growth. press <b>P</b>.</span></div>
    <div class="g-term"><span class="g-term-name">monte carlo 🎲</span><span class="g-term-def">1000 simulations with ±5% variance. shows probability distribution. press <b>Ctrl+M</b>.</span></div>
    <div class="g-term"><span class="g-term-name">compare ⚖️</span><span class="g-term-def">side-by-side preset comparison. press <b>C</b>.</span></div>
    <div class="g-term"><span class="g-term-name">heatmap 🔥</span><span class="g-term-def">color-coded risk by month. press <b>H</b>.</span></div>
    <div class="g-term"><span class="g-term-name">alerts 🔔</span><span class="g-term-def">set BTC/ETH price alerts with telegram/email notifications.</span></div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">☁️ cloud sync</div>
    <div class="g-term"><span class="g-term-name">save preset</span><span class="g-term-def">saves ALL tabs, custom tabs, theme as one snapshot. access in member area.</span></div>
    <div class="g-term"><span class="g-term-name">share preset</span><span class="g-term-def">generate link to share with others. they can import directly.</span></div>
    <div class="g-term"><span class="g-term-name">custom tabs</span><span class="g-term-def">click <b>+</b> in tab bar. fully independent state, can rename/delete.</span></div>
    <div class="g-tip"><b>local vs cloud:</b> 💾 buttons save to browser. cloud presets sync across devices.</div>
  </div>
</div>

<!-- PANEL: GLOSSARY -->
<div class="g-panel" id="gp-glossary">
  <div class="g-sec">
    <div class="g-sec-title">📚 glossary</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">liq%</b><br><span style="color:var(--tx2)">account÷notional×100</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">fm%</b><br><span style="color:var(--tx2)">margin÷account×100</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">notional</b><br><span style="color:var(--tx2)">capital×leverage</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">margin</b><br><span style="color:var(--tx2)">notional÷leverage</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">leverage</b><br><span style="color:var(--tx2)">position multiplier</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">carry-forward</b><br><span style="color:var(--tx2)">profit→next notional</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">target%</b><br><span style="color:var(--tx2)">expected %/trade</span></div>
      
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">KPI scale</b><br><span style="color:var(--tx2)">global target×</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">push×</b><br><span style="color:var(--tx2)">per-month notional×</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">zero month</b><br><span style="color:var(--tx2)">no trades</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">banked</b><br><span style="color:var(--tx2)">withdrawn profit</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">NW</b><br><span style="color:var(--tx2)">account+banked</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">CAGR</b><br><span style="color:var(--tx2)">annual growth rate</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">maker</b><br><span style="color:var(--tx2)">limit order (low fee)</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">taker</b><br><span style="color:var(--tx2)">market order (hi fee)</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">funding</b><br><span style="color:var(--tx2)">perpetual fee/8h</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">cross margin</b><br><span style="color:var(--tx2)">whole acct collateral</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">isolated</b><br><span style="color:var(--tx2)">per-position (NOT this)</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">spot</b><br><span style="color:var(--tx2)">no leverage mode</span></div>
    </div>
  </div>
</div>

<!-- ALWAYS VISIBLE: Important Notice -->
<div class="g-sec" style="border:1.5px solid #E24B4A;border-radius:10px;padding:14px 16px;background:#FCEBEB;margin-top:20px">
  <div class="g-sec-title" style="color:#A32D2D;border-bottom-color:#f5c6c6">⚠️ important — read before you onboard</div>
  <div style="font-size:11px;color:#7a2020;line-height:1.8">
    <b>this dashboard is a projection tool — not a trading guarantee.</b><br><br>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0">
      <div><b>✓ calculated:</b> trading fees, funding fees, compounding, withdrawal impact</div>
      <div><b>✕ not calculated:</b> slippage, spread, exchange-specific liq mechanics, flash crashes</div>
    </div>
    the final outcome depends entirely on <b>your own execution</b>.<br><br>
    <b style="color:#A32D2D">🔒 cross margin mode only.</b> the liq% formula is for cross margin. isolated margin has different mechanics.
  </div>
</div>
`;

// Guide panel switcher for English
function showGuidePanel(id){
  document.querySelectorAll('.g-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.g-nav-btn').forEach(b=>b.classList.remove('active'));
  var panel=document.getElementById('gp-'+id);
  if(panel)panel.classList.add('active');
  if(event && event.target) event.target.closest('.g-nav-btn').classList.add('active');
}

const GUIDE_HTML_ID=`
<style>
.guide-wrap{max-width:800px;padding:4px 0 20px;font-size:12px;line-height:1.7;color:var(--tx)}
.g-title{font-size:18px;font-weight:700;color:var(--tx);margin-bottom:4px}
.g-sub{font-size:11px;color:var(--tx2);margin-bottom:16px}
.g-sec{margin-bottom:22px}
.g-sec-title{font-size:13px;font-weight:700;color:var(--acc2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;padding-bottom:5px;border-bottom:0.5px solid var(--bd2)}
.g-term{display:grid;grid-template-columns:140px 1fr;gap:8px 16px;margin-bottom:8px;align-items:start}
.g-term-name{font-size:11px;font-weight:700;color:var(--tx);background:var(--sf2);padding:3px 8px;border-radius:5px;white-space:nowrap}
.g-term-def{font-size:11px;color:var(--tx2);line-height:1.6}
.g-term-def b{color:var(--tx);font-weight:600}
.g-tip{background:var(--sf2);border-left:3px solid var(--acc2);border-radius:0 8px 8px 0;padding:10px 14px;font-size:11px;color:var(--tx2);margin:10px 0;line-height:1.7}
.g-tip b{color:var(--acc2)}
.g-step{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px}
.g-step-num{width:24px;height:24px;border-radius:50%;background:var(--acc);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.g-step-body{font-size:11px;color:var(--tx2);line-height:1.7}
.g-step-body b{color:var(--tx);font-weight:600}
.g-warn{background:#FAEEDA;border-radius:8px;padding:10px 14px;font-size:11px;color:#854F0B;margin:10px 0;line-height:1.7}
body.t-dark .g-warn{background:#2a1a00;color:#EF9F27}
.g-nav{display:flex;gap:4px;margin:16px 0 20px;padding:6px;background:var(--sf2);border-radius:12px;border:1px solid var(--bd2);overflow-x:auto;-webkit-overflow-scrolling:touch}
.g-nav::-webkit-scrollbar{height:0}
.g-nav-btn{padding:10px 16px;font-size:11px;font-weight:600;border:none;border-radius:8px;cursor:pointer;background:transparent;color:var(--tx2);transition:all .15s;display:flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0}
.g-nav-btn:hover{background:var(--bg);color:var(--tx)}
.g-nav-btn.active{background:var(--acc2);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.g-nav-btn .g-nav-icon{font-size:14px}
.g-panel{display:none;animation:gFadeIn .25s ease;min-height:200px}
.g-panel.active{display:block}
@keyframes gFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style>

<div class="g-title">bet all the time, bet with style · panduan</div>
<div class="g-sub">oleh <a href="https://t.me/CryptoJurnal" target="_blank" style="color:var(--acc2);font-weight:700;text-decoration:none">@cryptojurnal ↗</a> · konsep dasar · tetap simpel, tetap disiplin</div>

<!-- SELALU TERLIHAT: Dua Tab -->
<div class="g-sec">
  <div class="g-sec-title">🗂️ dua tab — mulai dari sini</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
    <div style="background:var(--sf2);border-radius:8px;padding:14px 16px;border-left:3px solid var(--acc2)">
      <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:6px">36-MONTH · proyeksi jangka panjang</div>
      <div style="font-size:11px;color:var(--tx2);line-height:1.7"><b>rencana utamamu</b>. set sekali, biarkan compounding bekerja selama 36 bulan. gunakan ini untuk <b>merencanakan strategi</b> dan lihat ke mana arah modal kamu. anggap sebagai <b>blueprint trading</b>-mu.</div>
      <div style="margin-top:8px;font-size:10px;color:var(--acc2);font-weight:600">cocok untuk: perencanaan · alokasi modal · keyakinan jangka panjang</div>
    </div>
    <div style="background:var(--sf2);border-radius:8px;padding:14px 16px;border-left:3px solid var(--acc)">
      <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:6px">QUARTER · asesmen jangka pendek</div>
      <div style="font-size:11px;color:var(--tx2);line-height:1.7"><b>lab trading langsungmu</b>. 3 bulan, murni eksekusi. gunakan <b>sebelum masuk trade</b> untuk memvalidasi setup. anggap sebagai <b>checklist pra-terbang</b>.</div>
      <div style="margin-top:8px;font-size:10px;color:var(--acc);font-weight:600">cocok untuk: scalp · day trade · validasi cepat · uji formula</div>
    </div>
  </div>
  <div class="g-tip"><b>alur kerja:</b> gunakan quarter untuk menemukan formula yang tepat → setelah yakin, pindahkan ke 36-month untuk proyeksi penuh. kedua tab punya state independen.</div>
</div>

<!-- NAVIGASI TAB HORIZONTAL -->
<div class="g-nav" id="guide-nav-id">
  <button class="g-nav-btn active" onclick="showGuidePanelId('basics')"><span class="g-nav-icon">🔑</span> Dasar</button>
  <button class="g-nav-btn" onclick="showGuidePanelId('metrics')"><span class="g-nav-icon">📊</span> Metrik</button>
  <button class="g-nav-btn" onclick="showGuidePanelId('controls')"><span class="g-nav-icon">⚙️</span> Kontrol</button>
  <button class="g-nav-btn" onclick="showGuidePanelId('risk')"><span class="g-nav-icon">🎯</span> Risiko</button>
  <button class="g-nav-btn" onclick="showGuidePanelId('spot')"><span class="g-nav-icon">◈</span> Spot</button>
  <button class="g-nav-btn" onclick="showGuidePanelId('errors')"><span class="g-nav-icon">🚨</span> Error</button>
  <button class="g-nav-btn" onclick="showGuidePanelId('power')"><span class="g-nav-icon">⚡</span> Power</button>
  <button class="g-nav-btn" onclick="showGuidePanelId('glossary')"><span class="g-nav-icon">📚</span> Glosarium</button>
</div>

<!-- PANEL: DASAR -->
<div class="g-panel active" id="gp-basics-id">
  <div class="g-sec">
    <div class="g-sec-title">🔑 konsep inti</div>
    <div class="g-term"><span class="g-term-name">liq%</span><span class="g-term-def">persentase likuidasi. <b>seberapa jauh harga harus bergerak melawan sebelum wipe.</b> angka terpenting. makin tinggi = makin aman. rumus: akun ÷ notional × 100. target 100%+, 40% adalah batas minimum.</span></div>
    <div class="g-term"><span class="g-term-name">notional</span><span class="g-term-def"><b>ukuran posisi setelah leverage.</b> $100 di 10× = $1.000 notional.</span></div>
    <div class="g-term"><span class="g-term-name">margin aktual</span><span class="g-term-def"><b>modal nyata sebagai jaminan</b> untuk trade 1. rumus: notional ÷ leverage.</span></div>
    <div class="g-term"><span class="g-term-name">fm%</span><span class="g-term-def"><b>fractional margin</b> — margin sebagai % dari akun. jika fm% = 16%, kamu mendeploy 16% sebagai margin. makin rendah = makin aman. jika fm% > 100%, posisi tidak bisa dibuka.</span></div>
    <div class="g-term"><span class="g-term-name">leverage</span><span class="g-term-def">pengali. 5× = kontrol 5× modalmu. makin tinggi = makin berisiko + liq% makin rendah.</span></div>
    <div class="g-term"><span class="g-term-name">carry-forward</span><span class="g-term-def">notional setiap trade <b>bertambah dari profit trade sebelumnya.</b> compounding dalam sequence.</span></div>
    <div class="g-tip"><b>hubungannya:</b> liq% = akun ÷ notional × 100. jika akun = $1.000 dan notional = $2.500, liq% = 40%. tarik $500 → liq% turun ke 20%.</div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">🔘 toggle switch</div>
    <div class="g-term">
      <span class="g-term-name">link to capital</span>
      <span class="g-term-def">
        <b>off (default):</b> notional tetap saat modal berubah. lebih aman.<br>
        <b>on:</b> notional ikut berubah untuk menjaga rasio liq%.
      </span>
    </div>
    <div class="g-term">
      <span class="g-term-name">global mode</span>
      <span class="g-term-def">
        <b>on (default):</b> semua bulan pakai slot trade yang sama.<br>
        <b>off:</b> setiap bulan punya target independen.
      </span>
    </div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">💾 menyimpan</div>
    <div class="g-term"><span class="g-term-name">tombol save</span><span class="g-term-def">modal, posisi, trade pakai tombol 💾 manual — eksperimen bebas tanpa menimpa.</span></div>
    <div class="g-term"><span class="g-term-name">auto-save</span><span class="g-term-def">label, zero month, penarikan, fee tersimpan otomatis saat edit.</span></div>
    <div class="g-term"><span class="g-term-name">cloud preset</span><span class="g-term-def">user login bisa simpan ke cloud dan sinkron antar device.</span></div>
  </div>
</div>

<!-- PANEL: METRIK -->
<div class="g-panel" id="gp-metrics-id">
  <div class="g-sec">
    <div class="g-sec-title">📊 indikator cockpit (grid 6×2)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">3yr CAGR</div>
        <div style="font-size:10px;color:var(--tx2)">compound annual growth rate 36 bulan.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">total return</div>
        <div style="font-size:10px;color:var(--tx2)">persentase gain dari awal ke NW akhir.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">combined NW</div>
        <div style="font-size:10px;color:var(--tx2)">net worth = akun akhir + banked.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">banked</div>
        <div style="font-size:10px;color:var(--tx2)">profit ditarik. aman dari likuidasi.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:4px">end account</div>
        <div style="font-size:10px;color:var(--tx2)">saldo di M36. tampilkan bulan aktif + IDR.</div>
      </div>
      <div style="background:var(--sf2);padding:10px 12px;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:#f7931a;margin-bottom:4px">₿ equivalent</div>
        <div style="font-size:10px;color:var(--tx2)">saldo akhir dalam BTC di harga live.</div>
      </div>
    </div>
    <div class="g-tip"><b>konversi IDR:</b> nilai dalam Rupiah ditampilkan di subtitle kartu. rate diupdate dari forex live.</div>
  </div>
</div>

<!-- PANEL: KONTROL -->
<div class="g-panel" id="gp-controls-id">
  <div class="g-sec">
    <div class="g-sec-title">⚙️ cara menggunakan kontrol</div>
    <div class="g-step"><div class="g-step-num">1</div><div class="g-step-body"><b>set modal awal</b> — ukuran akun aktual. pakai preset atau ketik/slide manual.</div></div>
    <div class="g-step"><div class="g-step-num">2</div><div class="g-step-body"><b>set leverage</b> — makin tinggi = margin makin kecil tapi liq% makin rendah.</div></div>
    <div class="g-step"><div class="g-step-num">3</div><div class="g-step-body"><b>set notional</b> — ukuran posisi trade 1. <b>jaga liq% ≥ 40%</b> (minimum), target 100%+.</div></div>
    <div class="g-step"><div class="g-step-num">4</div><div class="g-step-body"><b>set slot trade</b> — 10 slot dengan target%. set target ke 0 untuk skip.</div></div>
    <div class="g-step"><div class="g-step-num">5</div><div class="g-step-body"><b>zero month</b> — klik ⊘ untuk tandai bulan tanpa trading.</div></div>
    <div class="g-step"><div class="g-step-num">6</div><div class="g-step-body"><b>penarikan</b> — ketik di kolom withdrawal. <b>selalu cek liq% setelahnya.</b></div></div>
    <div class="g-warn">⚠ saat menarik, liq% turun untuk bulan berikutnya. jika turun di bawah 20%, kamu dalam zona bahaya.</div>
  </div>
</div>

<!-- PANEL: RISIKO -->
<div class="g-panel" id="gp-risk-id">
  <div class="g-sec">
    <div class="g-sec-title">🎯 asesmen risiko</div>
    <div class="g-term"><span class="g-term-name">risk score</span><span class="g-term-def">0–100. <b>makin rendah = makin aman.</b> faktor: liq%, leverage, fm%, trade aktif. 0-20 aman, 21-45 moderat, 46-70 tinggi, 71-100 ekstrem.</span></div>
    <div class="g-term"><span class="g-term-name">liq t1 buffer</span><span class="g-term-def">liq% untuk trade 1 bulan 1. hijau = bagus, kuning = waspada, merah = bahaya.</span></div>
    <div class="g-term"><span class="g-term-name">lifespan</span><span class="g-term-def">estimasi waktu bertahan. dari <b>menit</b> (ekstrem) hingga <b>generasi</b> (hampir tak bisa dilikuidasi).</span></div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">✅ sehat vs bahaya</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:#EAF3DE;border-radius:7px;padding:10px 12px">
        <div style="font-size:11px;font-weight:700;color:#3B6D11;margin-bottom:6px">✓ setup sehat</div>
        <div style="font-size:10px;color:#3B6D11;line-height:1.8">liq% ≥ 100% (ideal)<br>liq% ≥ 40% (minimum)<br>leverage ≤ 15×<br>fm% ≤ 20%<br>risk score < 30</div>
      </div>
      <div style="background:#FCEBEB;border-radius:7px;padding:10px 12px">
        <div style="font-size:11px;font-weight:700;color:#A32D2D;margin-bottom:6px">✕ zona bahaya</div>
        <div style="font-size:10px;color:#A32D2D;line-height:1.8">liq% < 20%<br>leverage ≥ 25×<br>fm% > 40%<br>risk score > 60<br>wd tanpa cek liq%</div>
      </div>
    </div>
  </div>
</div>

<!-- PANEL: SPOT -->
<div class="g-panel" id="gp-spot-id">
  <div class="g-sec">
    <div class="g-sec-title">◈ mode spot</div>
    <div style="font-size:11px;color:var(--tx2);margin-bottom:12px">mode spot = <b>beli dan tahan tanpa leverage</b>. tanpa margin, tanpa risiko likuidasi, tanpa funding fee.</div>
    <div class="g-term"><span class="g-term-name">cara beralih</span><span class="g-term-def">klik tombol <b>◈ spot</b> di bawah panel leverage. setiap tab ingat modenya sendiri.</span></div>
    <div class="g-term"><span class="g-term-name">apa yang berubah</span><span class="g-term-def">leverage dinonaktifkan, notional = akun, funding fee dihapus, liq% tidak relevan.</span></div>
    <div class="g-term"><span class="g-term-name">fee</span><span class="g-term-def">fee spot lebih tinggi (~0.1%) vs futures (~0.02-0.05%). tetap 2× per trade (buka + tutup).</span></div>
    <div class="g-tip"><b>spot vs leverage:</b> jalankan keduanya berdampingan di tab terpisah untuk membandingkan strategi.</div>
  </div>
</div>

<!-- PANEL: ERROR -->
<div class="g-panel" id="gp-errors-id">
  <div class="g-sec">
    <div class="g-sec-title">🚨 status error</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="background:#2a0a0a;border-radius:8px;padding:12px;border-left:3px solid #E24B4A">
        <div style="font-size:16px;margin-bottom:6px">🚫</div>
        <div style="font-size:11px;font-weight:700;color:#ff7070;margin-bottom:4px">FM% > 100%</div>
        <div style="font-size:10px;color:#E24B4A;line-height:1.5">margin melebihi modal. exchange tolak order.</div>
        <div style="font-size:9px;color:#ff9999;margin-top:6px">fix: ↑ leverage, ↓ notional, atau ↑ modal</div>
      </div>
      <div style="background:#2a0a0a;border-radius:8px;padding:12px;border-left:3px solid #E24B4A">
        <div style="font-size:16px;margin-bottom:6px">💸</div>
        <div style="font-size:11px;font-weight:700;color:#ff7070;margin-bottom:4px">Liq% < 1%</div>
        <div style="font-size:10px;color:#E24B4A;line-height:1.5">buffer nol. pergerakan apapun = likuidasi instan.</div>
        <div style="font-size:9px;color:#ff9999;margin-top:6px">fix: ↓ notional atau ↑ modal</div>
      </div>
      <div style="background:#1a0a2e;border-radius:8px;padding:12px;border-left:3px solid #8B5CF6">
        <div style="font-size:16px;margin-bottom:6px">💀</div>
        <div style="font-size:11px;font-weight:700;color:#c084fc;margin-bottom:4px">WD Bust</div>
        <div style="font-size:10px;color:#8B5CF6;line-height:1.5">penarikan melebihi saldo.</div>
        <div style="font-size:9px;color:#a78bfa;margin-top:6px">fix: ↓ jumlah penarikan</div>
      </div>
    </div>
    <div class="g-tip"><b>pemulihan:</b> perbaiki masalah → dashboard auto-recalculate → normal kembali.</div>
  </div>
</div>

<!-- PANEL: POWER -->
<div class="g-panel" id="gp-power-id">
  <div class="g-sec">
    <div class="g-sec-title">⚡ fitur power user</div>
    <div class="g-term"><span class="g-term-name">shortcut</span><span class="g-term-def">tekan <b>?</b> untuk lihat semua. P = projection, Ctrl+M = monte carlo, C = compare, H = heatmap, T = tema.</span></div>
    <div class="g-term"><span class="g-term-name">projection 📈</span><span class="g-term-def">grafik pertumbuhan 36 bulan. tekan <b>P</b>.</span></div>
    <div class="g-term"><span class="g-term-name">monte carlo 🎲</span><span class="g-term-def">1000 simulasi dengan varians ±5%. tekan <b>Ctrl+M</b>.</span></div>
    <div class="g-term"><span class="g-term-name">compare ⚖️</span><span class="g-term-def">perbandingan preset side-by-side. tekan <b>C</b>.</span></div>
    <div class="g-term"><span class="g-term-name">heatmap 🔥</span><span class="g-term-def">risiko berwarna per bulan. tekan <b>H</b>.</span></div>
  </div>

  <div class="g-sec">
    <div class="g-sec-title">☁️ cloud sync</div>
    <div class="g-term"><span class="g-term-name">simpan preset</span><span class="g-term-def">simpan SEMUA tab, tema sebagai satu snapshot. akses di member area.</span></div>
    <div class="g-term"><span class="g-term-name">bagikan preset</span><span class="g-term-def">generate link untuk dibagikan. mereka bisa import langsung.</span></div>
    <div class="g-term"><span class="g-term-name">tab kustom</span><span class="g-term-def">klik <b>+</b> di tab bar. state independen, bisa rename/hapus.</span></div>
  </div>
</div>

<!-- PANEL: GLOSARIUM -->
<div class="g-panel" id="gp-glossary-id">
  <div class="g-sec">
    <div class="g-sec-title">📚 glosarium</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">liq%</b><br><span style="color:var(--tx2)">akun÷notional×100</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">fm%</b><br><span style="color:var(--tx2)">margin÷akun×100</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">notional</b><br><span style="color:var(--tx2)">modal×leverage</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">margin</b><br><span style="color:var(--tx2)">notional÷leverage</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">leverage</b><br><span style="color:var(--tx2)">pengali posisi</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">carry-forward</b><br><span style="color:var(--tx2)">profit→notional</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">target%</b><br><span style="color:var(--tx2)">ekspektasi %/trade</span></div>
      
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">KPI scale</b><br><span style="color:var(--tx2)">pengali target global</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">push×</b><br><span style="color:var(--tx2)">notional× per-bulan</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">zero month</b><br><span style="color:var(--tx2)">tanpa trade</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">banked</b><br><span style="color:var(--tx2)">profit ditarik</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">NW</b><br><span style="color:var(--tx2)">akun+banked</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">CAGR</b><br><span style="color:var(--tx2)">tingkat pertumbuhan tahunan</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">maker</b><br><span style="color:var(--tx2)">limit order (fee rendah)</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">taker</b><br><span style="color:var(--tx2)">market order (fee tinggi)</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">funding</b><br><span style="color:var(--tx2)">fee perpetual/8jam</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">cross margin</b><br><span style="color:var(--tx2)">seluruh akun jaminan</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">isolated</b><br><span style="color:var(--tx2)">per-posisi (BUKAN ini)</span></div>
      <div style="background:var(--sf2);padding:6px 8px;border-radius:5px;font-size:9px"><b style="color:var(--acc2)">spot</b><br><span style="color:var(--tx2)">tanpa leverage</span></div>
    </div>
  </div>
</div>

<!-- SELALU TERLIHAT: Notice Penting -->
<div class="g-sec" style="border:1.5px solid #E24B4A;border-radius:10px;padding:14px 16px;background:#FCEBEB;margin-top:20px">
  <div class="g-sec-title" style="color:#A32D2D;border-bottom-color:#f5c6c6">⚠️ penting — baca sebelum onboard</div>
  <div style="font-size:11px;color:#7a2020;line-height:1.8">
    <b>dashboard ini adalah alat proyeksi — bukan jaminan trading.</b><br><br>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0">
      <div><b>✓ dihitung:</b> fee trading, funding fee, compounding, dampak penarikan</div>
      <div><b>✕ tidak dihitung:</b> slippage, spread, mekanisme liq exchange, flash crash</div>
    </div>
    hasil akhir sepenuhnya bergantung pada <b>eksekusimu sendiri</b>.<br><br>
    <b style="color:#A32D2D">🔒 hanya cross margin.</b> rumus liq% untuk cross margin. isolated margin punya mekanisme berbeda.
  </div>
</div>
`;

// Guide panel switcher for Indonesian
function showGuidePanelId(id){
  document.querySelectorAll('#gp-basics-id,#gp-metrics-id,#gp-controls-id,#gp-risk-id,#gp-spot-id,#gp-errors-id,#gp-power-id,#gp-glossary-id').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#guide-nav-id .g-nav-btn').forEach(b=>b.classList.remove('active'));
  var panel=document.getElementById('gp-'+id+'-id');
  if(panel)panel.classList.add('active');
  if(event && event.target) event.target.closest('.g-nav-btn').classList.add('active');
}

const ZERO_36_DEF=[6,11,17,22,30,35];
const TOTAL=36;

// SEPARATE STATE PER TAB
const DEF_BT=[0]; // 1 sequence by default — dynamic unlimited sequences
const DEF_ML={}; // month labels {m: 'custom label'}
const DEF_TL={}; // trade labels {t: 'asset name'}
const DEF_FR=[0];

function sanitizeTradesArray(bt, fr){
  if(!Array.isArray(bt) || bt.length === 0) return {bt:[0], fr:[0]};
  let lastActiveIdx = 0;
  for(let i = bt.length - 1; i >= 0; i--){
    if(bt[i] !== 0 && bt[i] !== '0' && bt[i] !== null && bt[i] !== undefined){
      lastActiveIdx = i;
      break;
    }
  }
  const len = Math.max(1, lastActiveIdx + 1);
  const cleanBT = [];
  const cleanFR = [];
  for(let i = 0; i < len; i++){
    cleanBT.push(typeof bt[i] === 'number' ? bt[i] : (parseFloat(bt[i]) || 0));
    cleanFR.push((fr && typeof fr[i] === 'number') ? fr[i] : (parseInt(fr && fr[i]) || 0));
  }
  return {bt: cleanBT, fr: cleanFR};
}

let TAB='36', THEME='t-light', VIEW='sum', ch=null, GLOBAL_MODE=false, TOP_PANEL_COLLAPSED=false, IS_WIPED=false, lbl_w=false, bustMonth=null;
// ── FEE STATE ──
// FEE is now per-tab inside S[TAB].FEE
let FEE_LIVE={rate:null, exchange:'binance', symbol:'BTCUSDT', loading:false};

// ── MULTI-TAB STATE ──
// TABS is an ordered array of tab descriptors
// built-in tabs: id='36' name='36-month', id='q' name='quarter'
// custom tabs: id='c1','c2',... name=user-defined, max 5 custom per panel (built-in + custom ≤ 7 total)
function mkState(){return{P:1000,LEV:5,NOT:2500,KPI:1.0,NMO:36,BT:[...DEF_BT],FR:[...DEF_FR],WD:{},DEPO:{},ML:{},TL:{},MT:{},ZM:new Set([]),MP:{},LK:new Set([]),CM:new Set([]),SPOT:false,CF:true,FEE:{maker:0.02,taker:0.05,funding:0.01,interval:8,holds:1,method:'taker'}};}
const S={
  '36': mkState(),
  'q':  Object.assign(mkState(), { NMO: 3 }),
};
// Custom tab registry
let CUSTOM_TABS=[]; // [{id:'36_c1',name:'my plan'},{id:'q_c1',name:'q plan'}]
let _nextTabId={36:1,q:1};

// ── UNDO/REDO SYSTEM ──
var UNDO_STACK = [];
var REDO_STACK = [];
var UNDO_MAX = 50;
var _undoTimer = null;
var _undoSnap = null;

function _deepCopyS(src){
  const out={};
  Object.keys(src).forEach(tabId=>{
    const t=src[tabId];
    if(typeof t!=='object'||t===null){out[tabId]=t;return;}
    // deep copy all nested plain objects so mutations don't bleed into snapshots
    out[tabId]={
      ...t,
      NMO:t.NMO,
      BT:t.BT?[...t.BT]:[],
      FR:t.FR?[...t.FR]:[],
      ZM:t.ZM?new Set(t.ZM):new Set(),
      LK:t.LK?new Set(t.LK):new Set(),
      CM:t.CM?new Set(t.CM):new Set(),
      WD:t.WD?{...t.WD}:{},
      DEPO:t.DEPO?{...t.DEPO}:{},
      MP:t.MP?{...t.MP}:{},
      ML:t.ML?{...t.ML}:{},
      TL:t.TL?{...t.TL}:{},
      MT:t.MT?JSON.parse(JSON.stringify(t.MT)):{}, // nested arrays inside
      FEE:t.FEE?{...t.FEE}:{}
    };
  });
  return out;
}

// Call BEFORE mutating state — captures pre-change snapshot, debounced
function _captureUndo(){
  if(!_undoSnap) _undoSnap=_deepCopyS(S);
  if(_undoTimer) clearTimeout(_undoTimer);
  _undoTimer=setTimeout(function(){
    if(_undoSnap){
      UNDO_STACK.push({action:'change',timestamp:Date.now(),data:_undoSnap});
      if(UNDO_STACK.length>UNDO_MAX) UNDO_STACK.shift();
      REDO_STACK=[];
      _undoSnap=null;
    }
    _undoTimer=null;
  },800);
}

function saveUndoState(action){
  UNDO_STACK.push({action:action,timestamp:Date.now(),data:_deepCopyS(S)});
  if(UNDO_STACK.length>UNDO_MAX) UNDO_STACK.shift();
  REDO_STACK=[];
}

function gs(){
  const s=S[TAB];
  // safety: ensure FEE exists (old localStorage saves won't have it)
  if(!s.FEE) s.FEE={maker:0.02,taker:0.05,funding:0.01,interval:8,holds:1,method:'taker'};
  return s;
}
function isQTab(id){return id==='q'||id.startsWith('q_c');}
function getTotalMonths(s){
  const st = s || (typeof gs === 'function' ? gs() : null);
  if (st && typeof st.NMO === 'number' && st.NMO > 0) return st.NMO;
  return (typeof isQTab === 'function' && isQTab(TAB)) ? 3 : 36;
}

// ── TAB BAR — two rows ──
function renderTabBar(){
  const bar=document.getElementById('mode-tabs-bar');
  if(!bar)return;
  const c36=CUSTOM_TABS.filter(t=>t.id.startsWith('36_c'));
  const cq =CUSTOM_TABS.filter(t=>t.id.startsWith('q_c'));

  function makeTab(tab){
    const active=TAB===tab.id;
    const isCustom=tab.id.includes('_c');
    let h=`<button class="mt${active?' on':''}" onclick="setTab('${tab.id}')" id="tab-${tab.id}">`;
    if(isCustom){
      h+=`<input class="mt-name-inp" value="${tab.name}" onclick="event.stopPropagation()" onchange="renameTab('${tab.id}',this.value)" style="width:${Math.max(44,tab.name.length*7)}px">`;
      h+=`<span class="mt-close" onclick="event.stopPropagation();removeTab('${tab.id}')" title="close">✕</span>`;
    } else {
      h+=tab.name;
    }
    h+='</button>';
    return h;
  }

  // Row 1: 36-month family
  let r1=`<div class="tab-row"><span class="tab-row-lbl">36m</span>`;
  r1+=makeTab({id:'36',name:'36-month'});
  c36.forEach(t=>r1+=makeTab(t));
  if(c36.length<5) r1+=`<button class="mt-add" onclick="addTab('36')" title="new 36-month tab">+</button>`;
  r1+='</div>';

  // Row 2: quarter family
  let r2=`<div class="tab-row"><span class="tab-row-lbl">3m</span>`;
  r2+=makeTab({id:'q',name:'quarter'});
  cq.forEach(t=>r2+=makeTab(t));
  if(cq.length<5) r2+=`<button class="mt-add" onclick="addTab('q')" title="new quarter tab">+</button>`;
  r2+='</div>';

  bar.innerHTML=r1+r2;
}

function addTab(row){
  const n=_nextTabId[row]++;
  const id=row+'_c'+n;
  const name=(row==='36'?'36m':'3m')+' '+n;
  CUSTOM_TABS.push({id,name});
  S[id]=mkState();
  saveTabRegistry();
  setTab(id);
}

function removeTab(id){
  if(!id.includes('_c'))return;
  CUSTOM_TABS=CUSTOM_TABS.filter(t=>t.id!==id);
  delete S[id];
  saveTabRegistry();
  // fallback to the parent permanent tab
  if(TAB===id) setTab(id.startsWith('q_c')?'q':'36');
  else renderTabBar();
}

function renameTab(id,name){
  const tab=CUSTOM_TABS.find(t=>t.id===id);
  if(tab){tab.name=name.trim()||'tab';saveTabRegistry();}
  renderTabBar();
}

function saveTabRegistry(){
  try{localStorage.setItem('batt_custom_tabs',JSON.stringify(CUSTOM_TABS.map(t=>({id:t.id,name:t.name}))));}catch(e){}
  try{localStorage.setItem('batt_next_tab_id',JSON.stringify(_nextTabId));}catch(e){}
}

function loadTabRegistry(){
  try{
    const raw=localStorage.getItem('batt_custom_tabs');
    if(raw){
      const arr=_safeJSON(raw,[]);
      arr.forEach(t=>{
        CUSTOM_TABS.push(t);
        if(!S[t.id])S[t.id]=mkState();
      });
    }
    const nid=localStorage.getItem('batt_next_tab_id');
    if(nid){const p=_safeJSON(nid,null);if(p&&typeof p==='object')_nextTabId=p;}
  }catch(e){}
}

// ── SAVE / LOAD ──
function saveSection(sec){
  const s=gs();
  const key='batt_'+TAB+'_'+sec;
  let data={};
  if(sec==='cap') data={P:s.P};
  if(sec==='pos') data={LEV:s.LEV,NOT:s.NOT,KPI:s.KPI,CF:s.CF};
  if(sec==='trades') data={BT:[...s.BT],FR:[...s.FR],NMO:s.NMO};
  if(sec==='wd') data={WD:{...s.WD}};
  if(sec==='depo') data={DEPO:{...s.DEPO}};
  if(sec==='labels') data={ML:{...s.ML},TL:{...s.TL}};
  if(sec==='zero') data={ZM:[...s.ZM]};
  if(sec==='fee') data={FEE:{...s.FEE},SPOT:s.SPOT};
  if(sec==='cm') data={CM:s.CM?[...s.CM]:[]};
  try{localStorage.setItem(key,JSON.stringify(data));flashSave('save-'+sec);}catch(e){}
  _silentCloudSync();
}
function flashSave(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.add('save-ok');
  el.textContent='✓ saved!';
  setTimeout(()=>{el.classList.remove('save-ok');el.textContent='✓';},1500);
}
function loadAll(){
  // ── ONE-TIME MIGRATION: wz_ → batt_ ──

  // runs once, copies any wz_ keys to batt_, then marks migration done
  if(!localStorage.getItem('batt_migrated_v2')){
    try{
      const allTabIds=['36','q',...CUSTOM_TABS.map(t=>t.id)];
      allTabIds.forEach(tab=>{
        ['cap','pos','trades','wd','depo','labels','zero','fee','lk','cm'].forEach(sec=>{
          const oldKey='wz_'+tab+'_'+sec;
          const newKey='batt_'+tab+'_'+sec;
          // only copy if old key exists and new key doesn't yet
          const oldVal=localStorage.getItem(oldKey);
          if(oldVal&&!localStorage.getItem(newKey)){
            localStorage.setItem(newKey,oldVal);
          }
        });
      });
      // also migrate standalone keys
      [['wz_theme','batt_theme'],['wz_not_linked','batt_not_linked']].forEach(([o,n])=>{
        const v=localStorage.getItem(o);
        if(v&&!localStorage.getItem(n)) localStorage.setItem(n,v);
      });
      localStorage.setItem('batt_migrated_v2','1');
    }catch(e){}
  }
  // load all known tabs (built-in + custom)
  const allTabIds=['36','q',...CUSTOM_TABS.map(t=>t.id)];
  allTabIds.forEach(tab=>{
    if(!S[tab])S[tab]=mkState();
    ['cap','pos','trades','wd','depo','labels','zero','fee','lk','cm'].forEach(sec=>{
      const key='batt_'+tab+'_'+sec;
      try{
        const raw=localStorage.getItem(key);
        if(!raw)return;
        const d=_safeJSON(raw,null);
        if(sec==='cap'&&d.P) S[tab].P=d.P;
        if(sec==='pos'){if(d.LEV)S[tab].LEV=d.LEV;if(d.NOT)S[tab].NOT=d.NOT;if(d.KPI)S[tab].KPI=d.KPI;if(typeof d.CF!=='undefined')S[tab].CF=d.CF;}
        if(sec==='trades'){
          if(d.BT){
            const st = sanitizeTradesArray(d.BT, d.FR);
            S[tab].BT = st.bt;
            S[tab].FR = st.fr;
          }
          if(d.NMO && typeof d.NMO === 'number') S[tab].NMO = d.NMO;
        }
        if(sec==='wd'&&d.WD)S[tab].WD={...d.WD};
        if(sec==='depo'&&d.DEPO)S[tab].DEPO={...d.DEPO};
        if(sec==='labels'){if(d.ML)S[tab].ML={...d.ML};if(d.TL)S[tab].TL={...d.TL};}
        if(sec==='zero'&&d.ZM)S[tab].ZM=new Set(d.ZM);
        if(sec==='lk')S[tab].LK=d.LK?new Set(d.LK):new Set();
        if(sec==='cm'&&d.CM)S[tab].CM=new Set(d.CM);
        if(sec==='fee'){if(d.FEE)S[tab].FEE={...S[tab].FEE,...d.FEE};if(d.SPOT!==undefined)S[tab].SPOT=d.SPOT;}
      }catch(e){}
    });
  });
  try{const t=localStorage.getItem('batt_theme');if(t)THEME=t;}catch(e){}
  // load journal from localStorage immediately so getActualTrade works on first render
  try{const jn=localStorage.getItem('batt_journal');if(jn)Object.assign(JN,JSON.parse(jn));}catch(e){}
  try{const ap=localStorage.getItem('batt_active_preset');if(ap){window._ACTIVE_PRESET=JSON.parse(ap);const _pbl=document.getElementById('auth-preset-lbl');const _pbc=document.getElementById('auth-preset-clear');if(_pbl&&window._ACTIVE_PRESET){_pbl.textContent='● '+window._ACTIVE_PRESET.name;_pbl.style.display='';}if(_pbc&&window._ACTIVE_PRESET)_pbc.style.display='';}}catch(e){}
  // restore global mode pref
  try{
    const gm=localStorage.getItem('batt_global_mode');
    if(gm!==null) GLOBAL_MODE=gm==='1';
  }catch(e){}
  // apply slot pref last — user's explicit slot choices always win over preset/cloud
  try{
    const slotPref=_safeJSON(localStorage.getItem('batt_slot_pref'), {});
    Object.keys(slotPref).forEach(tabId=>{
      if(S[tabId]&&slotPref[tabId]&&slotPref[tabId].BT){
        const st=sanitizeTradesArray(slotPref[tabId].BT, slotPref[tabId].FR);
        S[tabId].BT=[...st.bt];
        S[tabId].FR=[...st.fr];
      }
    });
  }catch(e){}
}

function syncControls(){
  const s=gs();
  document.getElementById('cap-in').value=s.P;
  document.getElementById('cap-sl').value=Math.min(s.P,10000000000);
  document.getElementById('cap-vl').textContent='$'+s.P.toLocaleString();
  document.getElementById('lv-in').value=s.LEV;
  document.getElementById('lv-sl').value=Math.min(s.LEV,50);
  document.getElementById('lv-vl').textContent=s.LEV+'×';
  document.getElementById('not-in').value=s.NOT;
  document.getElementById('not-sl').value=Math.min(s.NOT,100000000000);
  document.getElementById('not-vl').textContent='$'+s.NOT.toLocaleString();
  document.getElementById('kpi-sl').value=s.KPI;
  document.getElementById('kpi-vl').textContent=s.KPI.toFixed(2)+'×';
  initGrid();
  // ── preset lock visual — dim capital/leverage/notional when preset active ──
  const isPreset=!!window._ACTIVE_PRESET;
  const lockIds=['cap-in','cap-sl','lv-in','lv-sl','not-in','not-sl'];
  lockIds.forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.style.opacity=isPreset?'0.35':'';
    el.style.pointerEvents=isPreset?'none':'';
  });
  // dim preset quick-pick buttons
  ['#cap-prs','#lv-prs','#not-prs'].forEach(sel=>{
    document.querySelectorAll(sel+' .pr').forEach(b=>{
      b.style.opacity=isPreset?'0.3':'';
      b.style.pointerEvents=isPreset?'none':'';
    });
  });
  // dim value labels
  ['cap-vl','lv-vl','not-vl'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.opacity=isPreset?'0.4':'';
  });
  // show/hide lock indicator on section headers
  ['cap-lock-badge','lev-lock-badge','not-lock-badge'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display=isPreset?'inline':'none';
  });
  // dim cf-btn in preset mode but keep pointer-events for toast
  const cfBtn=document.getElementById('cf-btn');
  if(cfBtn){ cfBtn.style.opacity=isPreset?'0.35':''; }
  // preset buttons
  document.querySelectorAll('#cap-prs .pr').forEach(b=>{
    const txt=b.textContent.trim().replace('$','');
    let val=0;
    if(txt.endsWith('B')) val=parseFloat(txt)*1000000000;
    else if(txt.endsWith('M')) val=parseFloat(txt)*1000000;
    else if(txt.endsWith('k')) val=parseFloat(txt)*1000;
    else val=parseFloat(txt);
    b.classList.toggle('on',val===s.P);
  });
  document.querySelectorAll('#lv-prs .pr').forEach(b=>b.classList.toggle('on',parseInt(b.textContent)===s.LEV));
  updGrid();updComp();
  // sync notional link button
  const nlb=document.getElementById('not-link-btn');
  if(nlb){
    nlb.textContent=NOT_LINKED?'on':'off';
    nlb.style.color=NOT_LINKED?'var(--acc2)':'var(--tx3)';
    nlb.style.borderColor=NOT_LINKED?'var(--acc2)':'var(--bd2)';
    nlb.style.background=NOT_LINKED?'var(--btno)':'var(--btn)';
  }
  // sync carry-forward button
  const cfb=document.getElementById('cf-btn');
  if(cfb){
    const cfOn=gs().CF!==false;
    cfb.textContent=cfOn?'on':'off';
    cfb.style.borderColor=cfOn?'var(--acc2)':'var(--bd2)';
    cfb.style.color=cfOn?'var(--acc2)':'var(--tx3)';
    cfb.style.background=cfOn?'var(--btno)':'var(--btn)';
  }
  // sync fee inputs from this tab's FEE state
  const f=s.FEE;
  const mk=document.getElementById('fee-maker'); if(mk)mk.value=f.maker;
  const tk=document.getElementById('fee-taker'); if(tk)tk.value=f.taker;
  const fd=document.getElementById('fee-funding'); if(fd)fd.value=f.funding;
  const hd=document.getElementById('fee-holds'); if(hd)hd.value=f.holds;
  // sync method switcher
  const bm=document.getElementById('fee-msw-maker'); if(bm)bm.classList.toggle('on',f.method==='maker');
  const bt=document.getElementById('fee-msw-taker'); if(bt)bt.classList.toggle('on',f.method==='taker');
  const note=document.getElementById('fee-method-note');
  const rate=f.method==='maker'?f.maker:f.taker;
  if(note)note.textContent='using '+f.method+' rate ('+rate+'%) × 2 per trade';
  // restore spot/lev UI state for this tab
  setSpotMode(s.SPOT||false);
}

// ── GRID ──
function initGrid(){
  const g=document.getElementById('tg');
  if(!g)return;
  g.innerHTML='';
  const s=gs();
  if(!Array.isArray(s.BT) || s.BT.length === 0) s.BT = [0];
  if(!Array.isArray(s.FR) || s.FR.length === 0) s.FR = [0];
  for(let i=0;i<s.BT.length;i++){
    const r=document.createElement('div');
    r.className='tg-row';
    const canDel = s.BT.length > 1;
    r.innerHTML=`<div class="tg-no">T${i+1}</div>
<div class="tg-cell" id="btc${i}">
  <button class="tg-btn" onclick="stepBT(${i},-0.5)" tabindex="-1">−</button>
  <input type="number" class="tg-in" id="bt${i}" value="${s.BT[i]}" min="-500" max="500" step="0.5" oninput="dInput(this,v=>onBT(${i},v),400)">
  <button class="tg-btn" onclick="stepBT(${i},0.5)" tabindex="-1">+</button>
</div>
${canDel ? `<button class="tg-del-btn" onclick="removeTradeSlot(${i})" title="remove trade T${i+1}" style="background:none;border:none;color:var(--tx3);cursor:pointer;font-size:10px;padding:0 4px;line-height:1;transition:color .2s" onmouseover="this.style.color='#E24B4A'" onmouseout="this.style.color='var(--tx3)'">✕</button>` : ''}`;
    g.appendChild(r);
  }
  const addBtnRow = document.createElement('div');
  addBtnRow.style.cssText = 'display:flex;justify-content:center;margin-top:6px;';
  addBtnRow.innerHTML = `<button type="button" onclick="addTradeSlot()" style="background:transparent;border:0.5px dashed var(--bd2);color:var(--acc2);border-radius:4px;padding:3px 10px;font-size:9px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;transition:all .2s" onmouseover="this.style.borderColor='var(--acc2)';this.style.background='var(--btno)'" onmouseout="this.style.borderColor='var(--bd2)';this.style.background='transparent'">+ add trade sequence (T${s.BT.length+1})</button>`;
  g.appendChild(addBtnRow);
  updGrid();
}

function updGrid(){
  const s=gs();let act=0;
  if(!Array.isArray(s.BT)) s.BT = [0];
  for(let i=0;i<s.BT.length;i++){
    const skip=(s.BT[i]||0)===0; // freq removed — active = BT !== 0
    document.getElementById('bt'+i)?.classList.toggle('skipped',skip);
    document.getElementById('btc'+i)?.classList.toggle('skipped',skip);
    if(!skip)act++;
    // restore any previously disabled global inputs (locks are per-month, not global)
    const btEl=document.getElementById('bt'+i);
    if(btEl){btEl.disabled=false;btEl.title='';}
  }
  const el=document.getElementById('act-count');
  if(el)el.innerHTML=`<span>${act}</span> active · ${s.BT.length-act} skipped`;
}

function addTradeSlot(m){
  _captureUndo();
  const s=gs();
  if(m && !GLOBAL_MODE){
    if(!s.MT[m]) s.MT[m]={bt:[...s.BT],fr:[...s.FR]};
    s.MT[m].bt.push(0);
    s.MT[m].fr.push(0);
  } else {
    s.BT.push(0);
    s.FR.push(0);
    Object.keys(s.MT).forEach(k=>{
      if(s.MT[k] && Array.isArray(s.MT[k].bt)){
        s.MT[k].bt.push(0);
        s.MT[k].fr.push(0);
      }
    });
    initGrid();
  }
  saveSection('trades');
  try{
    const slotPref=_safeJSON(localStorage.getItem('batt_slot_pref'), {});
    slotPref[TAB]={BT:[...s.BT],FR:[...s.FR]};
    localStorage.setItem('batt_slot_pref',JSON.stringify(slotPref));
  }catch(e){}
  _silentCloudSync();
  softUpdate();
}

async function removeTradeSlot(idx, m){
  const s=gs();
  const tNum = (idx !== undefined ? idx + 1 : (m && s.MT[m]?.bt ? s.MT[m].bt.length : s.BT.length));
  const mLabel = m ? getML(m) : 'all months';
  const seqName = (m && s.TL ? s.TL[m+'-'+tNum] : null) || (s.TL ? s.TL[tNum] : null) || '';
  const seqLabelText = seqName ? `trade sequence <b>T${tNum} ("${seqName}")</b>` : `trade sequence <b>T${tNum}</b>`;
  const confirmed = (typeof showConfirm === 'function')
    ? await showConfirm({
        icon: '🗑️',
        type: 'danger',
        title: `Delete Sequence T${tNum}${seqName ? ' (' + seqName + ')' : ''}?`,
        message: `Are you sure you want to delete ${seqLabelText} in <b>${mLabel}</b>?`,
        confirmText: 'Delete Sequence',
        cancelText: 'Cancel'
      })
    : confirm(`Are you sure you want to delete sequence T${tNum}${seqName ? ' (' + seqName + ')' : ''} in ${mLabel}?`);
  if (!confirmed) return;

  _captureUndo();
  if(m && !GLOBAL_MODE){
    if(!s.MT[m]) s.MT[m] = { bt: [...s.BT], fr: [...s.FR] };
    if(s.MT[m].bt && s.MT[m].bt.length > 1){
      const removeIndex = idx !== undefined ? idx : (s.MT[m].bt.length - 1);
      const targetT = removeIndex + 1;
      const curSlots = s.MT[m].bt.length;
      s.MT[m].bt.splice(removeIndex, 1);
      if(s.MT[m].fr) s.MT[m].fr.splice(removeIndex, 1);

      // Clean and shift sequence names (TL) & exitTypes for month m
      if(s.TL){
        delete s.TL[m+'-'+targetT];
        for(let k = targetT + 1; k <= curSlots; k++){
          if(s.TL[m+'-'+k] !== undefined){
            s.TL[m+'-'+(k-1)] = s.TL[m+'-'+k];
            delete s.TL[m+'-'+k];
          }
        }
      }
      if(s.MT[m] && s.MT[m].exitTypes){
        delete s.MT[m].exitTypes[targetT];
        for(let k = targetT + 1; k <= curSlots; k++){
          if(s.MT[m].exitTypes[k] !== undefined){
            s.MT[m].exitTypes[k-1] = s.MT[m].exitTypes[k];
            delete s.MT[m].exitTypes[k];
          }
        }
      }
    }
  } else {
    if(s.BT.length > 1){
      const removeIndex = idx !== undefined ? idx : (s.BT.length - 1);
      const targetT = removeIndex + 1;
      const curSlots = s.BT.length;
      s.BT.splice(removeIndex, 1);
      if(s.FR) s.FR.splice(removeIndex, 1);

      // Shift across months
      const curM = getTotalMonths(s);
      for(let mon = 1; mon <= curM; mon++){
        if(s.TL){
          delete s.TL[mon+'-'+targetT];
          for(let k = targetT + 1; k <= curSlots; k++){
            if(s.TL[mon+'-'+k] !== undefined){
              s.TL[mon+'-'+(k-1)] = s.TL[mon+'-'+k];
              delete s.TL[mon+'-'+k];
            }
          }
        }
        if(s.MT && s.MT[mon] && s.MT[mon].exitTypes){
          delete s.MT[mon].exitTypes[targetT];
          for(let k = targetT + 1; k <= curSlots; k++){
            if(s.MT[mon].exitTypes[k] !== undefined){
              s.MT[mon].exitTypes[k-1] = s.MT[mon].exitTypes[k];
              delete s.MT[mon].exitTypes[k];
            }
          }
        }
      }

      Object.keys(s.MT).forEach(k=>{
        if(s.MT[k] && Array.isArray(s.MT[k].bt) && s.MT[k].bt.length > removeIndex){
          s.MT[k].bt.splice(removeIndex, 1);
          if(s.MT[k].fr) s.MT[k].fr.splice(removeIndex, 1);
        }
      });
      initGrid();
    }
  }
  saveSection('trades');
  saveSection('labels');
  try{
    const slotPref=_safeJSON(localStorage.getItem('batt_slot_pref'), {});
    slotPref[TAB]={BT:[...s.BT],FR:[...s.FR]};
    localStorage.setItem('batt_slot_pref',JSON.stringify(slotPref));
  }catch(e){}
  _silentCloudSync();
  softUpdate();
}

function addMonthTable(){
  _captureUndo();
  const s = gs();
  const curMonths = getTotalMonths(s);
  s.NMO = curMonths + 1;
  const newM = s.NMO;
  if(!s.MT) s.MT = {};
  if(!s.MT[newM]){
    s.MT[newM] = { bt: [...s.BT], fr: [...s.FR] };
  }
  saveSection('trades');
  _silentCloudSync();
  if(!GLOBAL_MODE && typeof qaRefreshMonths === 'function') qaRefreshMonths();
  softUpdate();
  setTimeout(()=>{
    const el = document.querySelector(`[data-mo="${newM}"]`);
    if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

async function removeMonthTable(m){
  const s = gs();
  const curMonths = getTotalMonths(s);
  if(curMonths <= 1){
    if(typeof showConfirm === 'function'){
      await showConfirm({
        icon: '⚠️',
        type: 'warning',
        title: 'Cannot Delete Table',
        message: 'You must have at least 1 month table in your plan.',
        confirmText: 'OK',
        cancelText: ''
      });
    } else {
      alert('You must have at least 1 month table in your plan.');
    }
    return;
  }
  const targetM = (m !== undefined && m !== null) ? parseInt(m) : curMonths;
  const mLabel = getML(targetM);

  const confirmed = (typeof showConfirm === 'function')
    ? await showConfirm({
        icon: '🗑️',
        type: 'danger',
        title: `Delete Table ${mLabel}?`,
        message: `Are you sure you want to delete table <b>${mLabel}</b>? All trade sequences, sequence names, deposits, withdrawals, and locked actuals in this table will be permanently removed.`,
        confirmText: 'Delete Table',
        cancelText: 'Keep Table'
      })
    : confirm(`Are you sure you want to delete table ${mLabel}?`);
  if (!confirmed) return;

  _captureUndo();

  const shiftKeyedObj = (obj) => {
    if(!obj || typeof obj !== 'object') return;
    delete obj[targetM];
    for(let i = targetM + 1; i <= curMonths; i++){
      if(obj[i] !== undefined){
        obj[i - 1] = obj[i];
        delete obj[i];
      }
    }
  };

  shiftKeyedObj(s.ML);
  shiftKeyedObj(s.MT);
  shiftKeyedObj(s.WD);
  shiftKeyedObj(s.DEPO);
  shiftKeyedObj(s.MP);

  // Shift and clean trade sequence labels (TL)
  if(s.TL && typeof s.TL === 'object'){
    const newTL = {};
    Object.keys(s.TL).forEach(k => {
      const parts = k.split('-');
      if(parts.length === 2){
        const mi = parseInt(parts[0]);
        const tno = parts[1];
        if(mi < targetM){
          newTL[k] = s.TL[k];
        } else if(mi > targetM){
          newTL[`${mi - 1}-${tno}`] = s.TL[k];
        }
        // if mi === targetM, deleted
      } else {
        newTL[k] = s.TL[k];
      }
    });
    s.TL = newTL;
  }

  const shiftSet = (setObj) => {
    if(!setObj || !(setObj instanceof Set)) return;
    const newSet = new Set();
    setObj.forEach(item => {
      if(typeof item === 'number'){
        if(item < targetM) newSet.add(item);
        else if(item > targetM) newSet.add(item - 1);
      } else if(typeof item === 'string'){
        const parts = item.split('-');
        if(parts.length === 2){
          const mi = parseInt(parts[0]);
          const tno = parts[1];
          if(mi < targetM) newSet.add(item);
          else if(mi > targetM) newSet.add(`${mi - 1}-${tno}`);
        } else {
          newSet.add(item);
        }
      }
    });
    setObj.clear();
    newSet.forEach(v => setObj.add(v));
  };

  shiftSet(s.ZM);
  shiftSet(s.LK);
  shiftSet(s.CM);

  s.NMO = curMonths - 1;

  saveSection('trades');
  saveSection('wd');
  saveSection('depo');
  saveSection('labels');
  saveSection('zero');
  _silentCloudSync();
  if(!GLOBAL_MODE && typeof qaRefreshMonths === 'function') qaRefreshMonths();
  softUpdate();
}

function onBT(i,v){
  const val=parseFloat(v)||0;
  const s=gs();
  while(s.BT.length <= i){ s.BT.push(0); s.FR.push(0); }
  s.BT[i]=val;
  updGrid();saveSection('trades');
  // save slots as user preference — survives preset load
  try{
    const slotPref=_safeJSON(localStorage.getItem('batt_slot_pref'), {});
    if(!slotPref[TAB]) slotPref[TAB]={BT:[...s.BT],FR:[...s.FR]};
    slotPref[TAB].BT=[...s.BT];
    slotPref[TAB].FR=[...s.FR];
    localStorage.setItem('batt_slot_pref',JSON.stringify(slotPref));
  }catch(e){}
  _silentCloudSyncNow();softUpdate();
}

function onFR(i,v){
  const val=parseInt(v)||0;
  const s=gs();
  while(s.FR.length <= i){ s.BT.push(0); s.FR.push(0); }
  s.FR[i]=val;
  updGrid();saveSection('trades');
  try{
    const slotPref=_safeJSON(localStorage.getItem('batt_slot_pref'), {});
    if(!slotPref[TAB]) slotPref[TAB]={BT:[...s.BT],FR:[...s.FR]};
    slotPref[TAB].BT=[...s.BT];
    slotPref[TAB].FR=[...s.FR];
    localStorage.setItem('batt_slot_pref',JSON.stringify(slotPref));
  }catch(e){}
  _silentCloudSyncNow();softUpdate();
}
function stepBT(i,delta){
  const inp=document.getElementById('bt'+i);
  if(!inp)return;
  const val=Math.round((parseFloat(inp.value||0)+delta)*10)/10;
  const clamped=Math.max(-500,Math.min(500,val));
  inp.value=clamped;
  onBT(i,clamped);
}
function stepFR(i,delta){
  const inp=document.getElementById('fr'+i);
  if(!inp)return;
  const val=(parseInt(inp.value||0)+delta);
  const clamped=Math.max(0,Math.min(20,val));
  inp.value=clamped;
  onFR(i,clamped);
}
function spStep(id,mn,mx,delta,cb){
  const inp=document.getElementById(id);
  if(!inp)return;
  const val=parseFloat(inp.value||0)+delta;
  const clamped=Math.max(mn,Math.min(mx,val));
  inp.value=clamped;
  if(cb) cb(clamped);
}
function qaStep(id, delta){
  const inp = document.getElementById(id);
  if(!inp) return;
  const cur = parseFloat(inp.value||0);
  const isFreq = id.startsWith('qa-fr');
  const decimals = isFreq ? 0 : 1;
  const mn = isFreq ? 0 : -500;
  const mx = isFreq ? 20 : 500;
  const val = parseFloat((cur + delta).toFixed(decimals));
  inp.value = Math.max(mn, Math.min(mx, val));
}
function manStep(type, m, i, delta){
  if(type === 'bt'){
    const inp = document.getElementById('mbt-'+m+'-'+i);
    if(!inp) return;
    const val = Math.max(-500, Math.min(500, Math.round((parseFloat(inp.value||0)+delta)*10)/10));
    inp.value = val; onManualBT(m, i, val);
  } else {
    const inp = document.getElementById('mfr-'+m+'-'+i);
    if(!inp) return;
    const val = Math.max(0, Math.min(20, parseInt(inp.value||0)+delta));
    inp.value = val; onManualFR(m, i, val);
  }
}
function feeStep(id,mn,mx,delta,cb){
  const inp=document.getElementById(id);
  if(!inp)return;
  const decimals=delta.toString().split('.')[1]?.length||3;
  const val=parseFloat((parseFloat(inp.value||0)+delta).toFixed(decimals+1));
  const clamped=Math.max(mn,Math.min(mx,val));
  inp.value=clamped;
  if(cb) cb();
}
function onKpiSl(v){_captureUndo();gs().KPI=parseFloat(v);document.getElementById('kpi-vl').textContent=gs().KPI.toFixed(2)+'×';saveSection('pos');render();}

// ── SIMULATION ──
function getMLabel(m){return 'm'+String(m).padStart(2,'0');}

// get actual journal result for a locked trade (tab+month+tradeNo)
function getActualTrade(m, tno){
  if(typeof JN==='undefined'||!JN.folders||!window._ACTIVE_PRESET) return null;
  const folder=_folderByPreset(window._ACTIVE_PRESET.name);
  if(!folder||!JN.trades[folder.id]) return null;
  return JN.trades[folder.id].find(t=>
    t.source==='cockpit'&&t.cockpit&&
    String(t.cockpit.tab)===String(TAB)&&
    parseInt(t.cockpit.month)===parseInt(m)&&
    parseInt(t.cockpit.tradeNo)===parseInt(tno)&&
    t.entry&&t.exit
  )||null;
}

function runSeq(startAcc,lev,initNot,bt,fr,kpi,isSpot,cf,month){
  // cf=true (default): notional compounds within month and carries forward
  // cf=false: notional stays fixed at initNot every trade — no intra-month growth
  const cfOn = cf!==false;
  let acc=startAcc,not=isSpot?startAcc:initNot;
  let accF=startAcc;
  const trades=[];
  const tradesLen = (Array.isArray(bt) && bt.length > 0) ? bt.length : 1;
  for(let i=0;i<tradesLen;i++){
    const skip=(bt[i]||0)===0; // freq removed — active = BT !== 0
    const am=isSpot?not:not/lev;
    const fm=isSpot?100:am/accF*100;
    const liq=isSpot?999:accF/not*100;
    if(skip){trades.push({no:i+1,skip:true,not,am,fm,liq,tgt:0,freq:1,sp:0,cp:0,accB:accF,accA:accF,feePaid:0,accAF:accF,isSpot});continue;}
    const tgt=(bt[i]||0)*kpi/100;
    const sp=not*tgt,cp=sp; // freq=1, cp=sp always
    const chosenRate=(gs().FEE.method==='maker'?gs().FEE.maker:gs().FEE.taker)/100;
    const tradeFee=2*chosenRate*not; // freq=1
    const fundFee=isSpot?0:(gs().FEE.funding/100)*not*gs().FEE.holds;
    const feePaid=tradeFee+fundFee;
    const accAfter=acc+cp;
    const accAfterF=accF+cp-feePaid;
    // check for actual journal result on this locked trade
    const actual=month?getActualTrade(month,i+1):null;
    const actualCp=actual?(actual.pnl||0):null;
    const actualFee=actual?(actual.fee||0):null;
    const useActual=actual&&actualCp!==null;
    const finalCp=useActual?actualCp:cp;
    const finalFee=useActual?actualFee:(feePaid);
    const finalCpPreFee=useActual?(actualCp+actualFee):cp;
    const accAfterActual=acc+finalCpPreFee;
    const accAfterFActual=accF+finalCp;
    trades.push({no:i+1,skip:false,not,am,fm,liq,tgt:bt[i]*kpi,freq:1,
      sp:useActual?finalCpPreFee:sp,
      cp:useActual?finalCpPreFee:cp,
      accB:accF,accA:useActual?accAfterActual:accAfter,
      feePaid:useActual?finalFee:feePaid,
      accAF:useActual?accAfterFActual:accAfterF,
      isSpot,
      hasActual:useActual,
      projCp:cp,projFee:feePaid,projAccAF:accAfterF,
      actualCp:useActual?finalCp:null,
      actualFee:useActual?finalFee:null
    });
    acc=useActual?accAfterActual:accAfter;
    accF=useActual?accAfterFActual:accAfterF;
    const actualNetPnlCF=useActual?finalCp:(cp-feePaid); // net pnl post-fee for carry-forward
    if(cfOn){
      not=isSpot?accF:not+actualNetPnlCF;
    } else {
      not=isSpot?startAcc:initNot;
    }
  }
  return{trades,endAcc:acc,endAccF:accF,lastNotional:cfOn?not:initNot};
}

function sim(){
  const s=gs();
  const isQ=isQTab(TAB);
  const zeroSet=s.ZM;
  const total=getTotalMonths(s);
  const months=[];
  let acc=s.P,banked=0,totalDeposits=0;
  // carry-forward: track last active trade's notional
  // on first month, seed from INIT_NOT setting
  let prevLastNotional=s.NOT;

  for(let m=1;m<=total;m++){
    const lb=getMLabel(m),isZ=zeroSet.has(m);
    const depoAmt=parseFloat(s.DEPO&&s.DEPO[m])||0;
    acc+=depoAmt;
    totalDeposits+=depoAmt;
    if(isZ){
      // zero month: notional plan pauses, carry stays unchanged
      months.push({m,lb,isZ:true,sA:acc,eA:acc,gA:acc,wd:0,depo:depoAmt,banked,totalDeposits,nw:acc+banked,trades:[],pct:0,
        postLiq:null,initNot:prevLastNotional,liqT1:acc/prevLastNotional*100,mp:1});
      continue;
    }
    // margin push up: multiplies the carried notional
    const mp=parseFloat(s.MP[m])||1.0;
    // carry-forward: ON = notional compounds; OFF = every month AND every trade resets to fixed base
    const cf=s.CF!==false;
    const cfBase=cf?prevLastNotional:s.NOT;
    // spot CF off: position resets to capital each month; spot CF on: follows account balance (default)
    const initNot=s.SPOT?(cf?acc:(s.P+totalDeposits)):(cfBase*mp);
    const liqT1=s.SPOT?100:(acc/initNot*100);
    const{bt:mBT,fr:mFR}=getMonthTrades(m);
    const{trades,endAcc:gA,endAccF:gAF,lastNotional:ln}=runSeq(acc,s.LEV,initNot,mBT,mFR,s.KPI,s.SPOT,cf,m);
    const monthFeePaid=trades.reduce((a,t)=>a+t.feePaid,0);
    const wdAmt=parseFloat(s.WD[m])||0;
    // if all active trades are locked with actual data, use actual end balance for withdrawal
    const activeTrades=trades.filter(t=>!t.skip);
    const allLocked=activeTrades.length>0&&activeTrades.every(t=>t.hasActual);
    const lastActualTrade=allLocked?activeTrades[activeTrades.length-1]:null;
    const actualEndBal=lastActualTrade?lastActualTrade.accAF:null;
    const effectiveGAF=allLocked&&actualEndBal!==null?actualEndBal:gAF;
    // no cap — if withdrawal exceeds balance, account is bust
    const wd=wdAmt;
    const fA=effectiveGAF-wd;
    const bust=fA<=0; // account wiped by withdrawal
    banked+=bust?effectiveGAF:wd;
    const lastActiveTrade=activeTrades.slice(-1)[0];
    const _lastNetPnl=lastActiveTrade?(lastActiveTrade.hasActual?lastActiveTrade.actualCp:(lastActiveTrade.cp-lastActiveTrade.feePaid)):0;
    const prevLN=lastActiveTrade?lastActiveTrade.not+_lastNetPnl:initNot;
    const postLiq=wd>0&&!bust?(fA/prevLN*100):null;
    const pct=(effectiveGAF-acc)/acc*100;
    prevLastNotional=prevLN;
    months.push({m,lb,isZ:false,sA:acc,eA:bust?0:fA,gA,gAF:effectiveGAF,wd,depo:depoAmt,banked,totalDeposits,nw:(bust?0:fA)+banked,trades,pct,postLiq,initNot,liqT1,mp,feePaid:monthFeePaid,bust});
    if(bust) break;
    acc=fA;
  }
  return months;
}

// ── FORMATTING ──
function fmt(v){
  if(v==null)return'—';
  const a=Math.abs(v),sg=v<0?'-':'';
  if(a>=1e9)return sg+'$'+(a/1e9).toFixed(2)+'B';
  if(a>=1e6)return sg+'$'+(a/1e6).toFixed(2)+'M';
  if(a>=1000)return sg+'$'+Math.round(a).toLocaleString();
  return sg+'$'+(a<0.01?a.toFixed(4):a.toFixed(2));
}
function fIDR(v){
  const x=v*IDR;
  if(x>=1e12)return'Rp'+(x/1e12).toFixed(2)+'T';
  if(x>=1e9)return'Rp'+(x/1e9).toFixed(2)+'B';
  if(x>=1e6)return'Rp'+Math.round(x/1e6)+'M';
  return'Rp'+Math.round(x/1e3)+'K';
}
function lc(l){return l>=60?'#1D9E75':l>=40?'#EF9F27':'#E24B4A';}
function rtag(l){
  if(l>=60)return'<span class="rl">low</span>';
  if(l>=40)return'<span class="rm">med</span>';
  return'<span class="rh">high</span>';
}

// ── NOTIONAL LINK TO CAPITAL ──
let NOT_LINKED=localStorage.getItem('batt_not_linked')==='true'; // persist link state

// ── CARRY FORWARD MODE ──
// ON (default): each month's notional seeds from last trade's end notional — position grows with wins
// OFF: every month resets to the fixed s.NOT — position stays constant regardless of results
function toggleCarryForward(){
  if(window._ACTIVE_PRESET){ showToast('exit preset mode to change this','info',2500); return; }
  _captureUndo();const s=gs();
  s.CF = s.CF===false ? true : false;
  saveSection('pos'); // CF is part of position state
  const btn=document.getElementById('cf-btn');
  if(btn){
    btn.textContent=s.CF?'on':'off';
    btn.style.color=s.CF?'var(--acc2)':'var(--tx3)';
    btn.style.borderColor=s.CF?'var(--acc2)':'var(--bd2)';
    btn.style.background=s.CF?'var(--btno)':'var(--btn)';
  }
  softUpdate();
}

function toggleNotLink(){
  NOT_LINKED=!NOT_LINKED;
  localStorage.setItem('batt_not_linked',NOT_LINKED?'true':'false');
  _silentCloudSync();
  const btn=document.getElementById('not-link-btn');
  if(btn){
    btn.textContent=NOT_LINKED?'on':'off';
    btn.style.color=NOT_LINKED?'var(--acc2)':'var(--tx3)';
    btn.style.borderColor=NOT_LINKED?'var(--acc2)':'var(--bd2)';
    btn.style.background=NOT_LINKED?'var(--btno)':'var(--btn)';
  }
}

function updComp(){
  const s=gs();
  const isSpot=s.SPOT||false;
  const am=isSpot?s.P:s.NOT/s.LEV;
  const fm=isSpot?100:am/s.P*100;
  const liq=isSpot?999:s.P/s.NOT*100;
  const ratio=isSpot?1:s.NOT/s.P;
  document.getElementById('c-am').textContent=isSpot?'n/a':fmt(am);
  const fmEl=document.getElementById('c-fm');
  fmEl.textContent=isSpot?'100%':fm.toFixed(1)+'%';
  fmEl.style.color=(!isSpot&&fm>100)?'#E24B4A':(fm>80?'#EF9F27':'');
  const el=document.getElementById('c-lq');
  el.textContent=isSpot?'n/a':liq.toFixed(1)+'%';
  if(!isSpot)el.style.color=lc(liq);else el.style.color='var(--tx3)';
  const ca=document.getElementById('c-acct'); if(ca)ca.textContent=fmt(s.P);
  const cr=document.getElementById('c-ratio'); if(cr)cr.textContent=isSpot?'1.00':ratio.toFixed(2);
  const cn=document.getElementById('c-not2'); if(cn)cn.textContent=isSpot?fmt(s.P):fmt(s.NOT);
  const cl=document.getElementById('c-lev2'); if(cl)cl.textContent=isSpot?'1×':s.LEV+'×';
  const ca2=document.getElementById('c-am2'); if(ca2)ca2.textContent=isSpot?'n/a':fmt(am);
  // show/hide lev-specific rows
  const lr=document.getElementById('lev-comp-row'),rr=document.getElementById('lev-ratio-row');
  if(lr)lr.style.opacity=isSpot?'.35':'1';
  if(rr)rr.style.opacity=isSpot?'.35':'1';
}

// inline WD handler - called from table
function onPushUp(m,v){
  const val=parseFloat(v)||1.0;
  gs().PU[m]=val<=0?1.0:val;
  softUpdate();
}

function onMP(m,v){
  _captureUndo();
  const val=v===''?1.0:(parseFloat(v)||1.0);
  gs().MP[m]=Math.max(1,val);
  try{localStorage.setItem('batt_'+TAB+'_mp',JSON.stringify({MP:{...gs().MP}}));}catch(e){}
  const el=document.getElementById('mp-inp-d-'+m)||document.getElementById('mp-inp-'+m);
  if(el) el.classList.toggle('active',val>1);
  _silentCloudSync();
  softUpdate();
}
// ── SOFT UPDATE: re-sim + patch metrics + table without rebuilding chart ──
// instant input — fires on every keystroke via rAF, no delay
// delay param kept for API compat but ignored
var _dInputTimers={};
var _oldVals={};
function dInput(el,fn,delay){
  const id=el.id||el.name||Math.random();
  // capture undo state on first keystroke
  if(!_dInputTimers[id]) _captureUndo();
  _dInputTimers[id]=true;
  requestAnimationFrame(function(){
    _dInputTimers[id]=null;
    fn(el.value);
  });
}

var _softUpdateTimer=null;
var _softUpdatePending=false;
function softUpdate(){
  _softUpdatePending=true;
  if(_softUpdateTimer) return; // already scheduled
  _softUpdateTimer=requestAnimationFrame(function(){
    _softUpdateTimer=null;
    if(_softUpdatePending){ _softUpdatePending=false; _softUpdateCore(); }
  });
  _silentCloudSync();
}

// ── LAST TRADES ──
var _tpTradeWS = null;
var _tpTrades = [];
var _tpObMode = 'book';

function tpObTab(mode, btn){
  _tpObMode = mode;
  document.querySelectorAll('.tp-ob-tab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  const book = document.getElementById('tp-ob-book');
  const trades = document.getElementById('tp-ob-trades');
  if(book) book.style.display = mode==='book' ? 'flex' : 'none';
  if(trades) trades.style.display = mode==='trades' ? 'flex' : 'none';
  if(mode==='trades') tpStartTradeWS();
  else tpStopTradeWS();
}

function tpStopTradeWS(){
  if(_tpTradeWS){ try{_tpTradeWS.close();}catch(e){} _tpTradeWS=null; }
}

function tpStartTradeWS(){
  tpStopTradeWS();
  _tpTrades = [];
  const ex = TP_STATE.exchange || 'binance';
  const isSpot = TP_STATE.marketType === 'spot';
  const pair = (TP_STATE.pair||'BTCUSDT').toLowerCase();
  const pairUp = TP_STATE.pair||'BTCUSDT';

  if(ex==='binance'){
    const base = isSpot ? 'wss://stream.binance.com:9443/ws/' : 'wss://fstream.binance.com/ws/';
    _tpTradeWS = new WebSocket(base + pair + '@trade');
    _tpTradeWS.onmessage = (e) => {
      const d = JSON.parse(e.data);
      const trade = {
        price: parseFloat(d.p),
        size: parseFloat(d.q),
        side: d.m ? 'sell' : 'buy',
        time: new Date(d.T).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})
      };
      _tpTrades.unshift(trade);
      if(_tpTrades.length > 50) _tpTrades.pop();
      if(_tpObMode==='trades') tpRenderTrades();
    };
  } else if(ex==='bybit'){
    const wsUrl = isSpot ? 'wss://stream.bybit.com/v5/public/spot' : 'wss://stream.bybit.com/v5/public/linear';
    _tpTradeWS = new WebSocket(wsUrl);
    _tpTradeWS.onopen = () => _tpTradeWS.send(JSON.stringify({op:'subscribe',args:[`publicTrade.${pairUp}`]}));
    _tpTradeWS.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if(!msg.data) return;
      (Array.isArray(msg.data)?msg.data:[msg.data]).forEach(d=>{
        const trade = {
          price: parseFloat(d.p),
          size: parseFloat(d.v||d.q||0),
          side: d.S==='Buy'||d.m===false ? 'buy' : 'sell',
          time: new Date(d.T||d.ts).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})
        };
        _tpTrades.unshift(trade);
        if(_tpTrades.length>50) _tpTrades.pop();
        if(_tpObMode==='trades') tpRenderTrades();
      });
    };
  } else if(ex==='okx'){
    _tpTradeWS = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
    const instId = isSpot ? pairUp.replace('USDT','-USDT') : pairUp.replace('USDT','-USDT-SWAP');
    _tpTradeWS.onopen = () => _tpTradeWS.send(JSON.stringify({op:'subscribe',args:[{channel:'trades',instId}]}));
    _tpTradeWS.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if(!msg.data) return;
      msg.data.forEach(d=>{
        const trade = {
          price: parseFloat(d.px),
          size: parseFloat(d.sz),
          side: d.side==='buy' ? 'buy' : 'sell',
          time: new Date(parseInt(d.ts)).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})
        };
        _tpTrades.unshift(trade);
        if(_tpTrades.length>50) _tpTrades.pop();
        if(_tpObMode==='trades') tpRenderTrades();
      });
    };
  }
}

function tpRenderTrades(){
  const el = document.getElementById('tp-trades-list');
  if(!el) return;
  const fmtSize = (s) => s>=1000?(s/1000).toFixed(2)+'K':s.toFixed(3);
  el.innerHTML = _tpTrades.slice(0,40).map(t=>`
    <div class="tp-trade-row ${t.side}">
      <span class="t-price">${fmtPrice(t.price,false)}</span>
      <span class="t-size">${fmtSize(t.size)}</span>
      <span class="t-time">${t.time}</span>
    </div>`).join('');
}
// ── END LAST TRADES ──


// ── SMART PRICE FORMATTER ──
// determines decimal places based on price magnitude — matches exchange tick sizes
function fmtPrice(price, withDollar=true){
  if(!price || isNaN(price) || price === 0) return withDollar ? '' : '';
  let decimals;
  if(price >= 10000)      decimals = 1;
  else if(price >= 1000)  decimals = 2;
  else if(price >= 100)   decimals = 2;
  else if(price >= 10)    decimals = 3;
  else if(price >= 1)     decimals = 4;
  else if(price >= 0.1)   decimals = 5;
  else if(price >= 0.01)  decimals = 6;
  else                    decimals = 8;
  const formatted = price.toFixed(decimals);
  return withDollar ? '$' + formatted : formatted;
}
// ── END SMART PRICE FORMATTER ──


// ── POSITIONS PANEL TOGGLE + DRAG (cockpit style) ──
var _tpPosOpen = false;

function _tpSyncPosToggle(){
  const panel = document.getElementById('tp-pos-panel');
  const toggle = document.getElementById('tp-pos-toggle');
  if(!toggle) return;
  const open = panel && !panel.classList.contains('collapsed');
  toggle.style.left = open ? '260px' : '0px';
  const icon = toggle.querySelector('.tp-pos-panel-toggle-icon');
  if(icon) icon.textContent = open ? '◀' : 'POS';
}


function tpOpenPosPanel(){
  const panel = document.getElementById('tp-pos-panel');
  if(!panel) return;
  if(panel.classList.contains('collapsed')){
    panel.classList.remove('collapsed');
    setTimeout(_tpSyncPosToggle, 10);
    setTimeout(()=>{
      try{ if(_tvWidget&&_tvWidget.iframe) _tvWidget.iframe.contentWindow.dispatchEvent(new Event('resize')); }catch(e){}
    }, 380);
  } else {
    // already open — close it
    panel.classList.add('collapsed');
    setTimeout(_tpSyncPosToggle, 10);
  }
}

function tpOpenRightPanel(){
  const sidebar = document.getElementById('tp-sidebar');
  if(!sidebar) return;
  if(sidebar.classList.contains('collapsed')){
    sidebar.classList.remove('collapsed');
    setTimeout(_tpSyncRightToggle, 10);
    setTimeout(()=>{
      try{ if(_tvWidget&&_tvWidget.iframe) _tvWidget.iframe.contentWindow.dispatchEvent(new Event('resize')); }catch(e){}
    }, 380);
  } else {
    sidebar.classList.add('collapsed');
    setTimeout(_tpSyncRightToggle, 10);
  }
}
function tpTogglePosPanel(){
  const panel = document.getElementById('tp-pos-panel');
  if(!panel) return;
  _tpPosOpen = panel.classList.contains('collapsed');
  if(_tpPosOpen){
    panel.style.overflow = 'hidden';
    panel.classList.remove('collapsed');
    setTimeout(()=>{ panel.style.overflow = ''; }, 380);
  } else {
    panel.classList.add('collapsed');
  }
  setTimeout(_tpSyncPosToggle, 10);
  // resize TV chart after transition
  setTimeout(()=>{
    if(_tvWidget && _tvWidget.iframe){
      try{ _tvWidget.iframe.contentWindow.dispatchEvent(new Event('resize')); }catch(e){}
    }
  }, 380);
}

// ── DRAG SYSTEM ──
(function(){
  var toggle, startY, startTop, dragging=false, hasDragged=false;
  var _rafId=null, _lastY=0;

  function isPosToggle(el){
    return el && (el.id==='tp-pos-toggle' || el.closest('#tp-pos-toggle'));
  }

  function onDown(e){
    toggle = document.getElementById('tp-pos-toggle');
    if(!toggle || !toggle.classList.contains('visible')) return;
    var pt = e.touches ? e.touches[0] : e;
    startY = pt.clientY;
    var rect = toggle.getBoundingClientRect();
    startTop = rect.top;
    dragging = true; hasDragged = false;
    toggle.style.transition = 'none';
    toggle.classList.add('dragging');
    e.preventDefault();
  }

  function onMove(e){
    if(!dragging||!toggle)return;
    var pt=e.touches?e.touches[0]:e;
    var deltaY=pt.clientY-startY;
    if(Math.abs(deltaY)<5)return;
    hasDragged=true;
    var H=window.innerHeight, toggleH=toggle.offsetHeight;
    var topBar=document.getElementById('tp-topbar')||document.querySelector('.tp-topbar');
    var minY=(topBar?topBar.getBoundingClientRect().bottom:60)+4;
    _lastY=Math.max(minY,Math.min(startTop+deltaY, H-toggleH-8));
    if(!_rafId) _rafId=requestAnimationFrame(function(){
      if(toggle){toggle.style.top=_lastY+'px';toggle.style.transform='none';}
      _rafId=null;
    });
    e.preventDefault();
  }

  function onUp(e){
    if(!dragging)return;
    dragging=false;
    if(toggle){ toggle.classList.remove('dragging'); toggle.style.transition = ''; }
    if(!hasDragged&&toggle) tpTogglePosPanel();
  }

  document.addEventListener('mousedown', function(e){ if(isPosToggle(e.target)) onDown(e); });
  document.addEventListener('touchstart', function(e){ if(isPosToggle(e.target)) onDown(e); }, {passive:false});
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);
})();

// init toggle position when simulator opens
function _tpInitPosPanel(){
  const toggle = document.getElementById('tp-pos-toggle');
  if(toggle){ toggle.style.left='0px'; toggle.style.top=''; toggle.style.transform=''; }
}
// ── END POSITIONS PANEL TOGGLE ──

// ── RIGHT ORDER PANEL TOGGLE + DRAG ──
var _tpRightOpen = true;

function _tpSyncRightToggle(){
  const sidebar = document.getElementById('tp-sidebar');
  const toggle = document.getElementById('tp-right-toggle');
  if(!toggle) return;
  const open = sidebar && !sidebar.classList.contains('collapsed');
  toggle.style.right = open ? '300px' : '0px';
  toggle.classList.toggle('collapsed', !open);
  const icon = toggle.querySelector('.tp-right-toggle-icon');
  if(icon) icon.textContent = open ? '▶' : 'ORDER';
}

function tpToggleRightPanel(){
  const sidebar = document.getElementById('tp-sidebar');
  if(!sidebar) return;
  _tpRightOpen = sidebar.classList.contains('collapsed');
  if(_tpRightOpen){
    sidebar.style.overflow = 'hidden';
    sidebar.classList.remove('collapsed');
    setTimeout(()=>{ sidebar.style.overflow = ''; }, 380);
  } else {
    sidebar.classList.add('collapsed');
  }
  setTimeout(_tpSyncRightToggle, 10);
  setTimeout(()=>{
    if(_tvWidget && _tvWidget.iframe){
      try{ _tvWidget.iframe.contentWindow.dispatchEvent(new Event('resize')); }catch(e){}
    }
  }, 380);
}

(function(){
  var toggle, startY, startTop, dragging=false, hasDragged=false;
  var _rafId=null, _lastY=0;

  function isRightToggle(el){
    return el && (el.id==='tp-right-toggle' || el.closest('#tp-right-toggle'));
  }

  function onDown(e){
    toggle = document.getElementById('tp-right-toggle');
    if(!toggle || !toggle.classList.contains('visible')) return;
    var pt = e.touches ? e.touches[0] : e;
    startY = pt.clientY;
    var rect = toggle.getBoundingClientRect();
    startTop = rect.top;
    dragging = true; hasDragged = false;
    toggle.classList.add('dragging');
    e.preventDefault();
  }

  function onMove(e){
    if(!dragging||!toggle)return;
    var pt=e.touches?e.touches[0]:e;
    var deltaY=pt.clientY-startY;
    if(Math.abs(deltaY)<5)return;
    hasDragged=true;
    var H=window.innerHeight, toggleH=toggle.offsetHeight;
    var topBar=document.getElementById('tp-topbar')||document.querySelector('.tp-topbar');
    var minY=(topBar?topBar.getBoundingClientRect().bottom:60)+4;
    _lastY=Math.max(minY,Math.min(startTop+deltaY, H-toggleH-8));
    if(!_rafId) _rafId=requestAnimationFrame(function(){
      if(toggle){toggle.style.top=_lastY+'px';toggle.style.transform='none';}
      _rafId=null;
    });
    e.preventDefault();
  }

  function onUp(e){
    if(!dragging)return;
    dragging=false;
    if(toggle)toggle.classList.remove('dragging');
    if(!hasDragged&&toggle) tpToggleRightPanel();
  }

  document.addEventListener('mousedown', function(e){ if(isRightToggle(e.target)) onDown(e); });
  document.addEventListener('touchstart', function(e){ if(isRightToggle(e.target)) onDown(e); }, {passive:false});
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);
})();

function _tpInitRightPanel(){
  const toggle = document.getElementById('tp-right-toggle');
  if(toggle){
    toggle.style.right = '300px';
    toggle.style.top = '';
    toggle.style.transform = '';
    toggle.classList.remove('collapsed');
  }
  const sidebar = document.getElementById('tp-sidebar');
  if(sidebar) sidebar.classList.remove('collapsed');
  _tpSyncRightToggle();
}
// ── END RIGHT ORDER PANEL ──



// ── SHARE P&L CARD ──
function tpSharePosition(id){
  const pos = TP_STATE.positions.find(p=>p.id===id);
  if(!pos) return;
  const currentPrice = TP_STATE.prices[pos.pair]?.price || pos.entryPrice;
  const pnl = tpCalcPnL(pos, currentPrice);
  const pnlPct = (pnl / pos.size) * 100;
  const isUp = pnl >= 0;
  const isSpot = pos.marketType==='spot' || pos.leverage===1;
  const bandColor = isUp ? '#00c47a' : '#e24b4a';
  const sideColor = pos.side==='long' ? '#00c47a' : '#e24b4a';
  const pair = pos.pair.replace('USDT','') + '/USDT';
  const ex = (pos.exchange||TP_STATE.exchange||'').toUpperCase();

  const W=800, H=440;
  const canvas = document.getElementById('tp-share-canvas');
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');

  // ── background ──
  ctx.fillStyle='#0d0d0d';
  ctx.fillRect(0,0,W,H);

  // ── subtle tint ──
  ctx.fillStyle=bandColor;
  ctx.globalAlpha=0.05;
  ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=1;

  // ── left color bar ──
  ctx.fillStyle=bandColor;
  ctx.fillRect(0,0,4,H);

  // ── grid lines ──
  ctx.strokeStyle='#1a1a1a';
  ctx.lineWidth=0.5;
  for(let x=80;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=60;y<H;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

  // ── BATT watermark top left ──
  ctx.font='600 11px "Trebuchet MS",sans-serif';
  ctx.fillStyle='#444';
  ctx.textAlign='left';
  ctx.fillText('⚡ BATT  ·  PAPER TRADING  ·  betallthetime.fun', 24, 30);

  // ── TOP RIGHT — long/short + leverage badge ──
  const sideLabel = isSpot ? 'SPOT' : pos.side.toUpperCase();
  const badgeW = isSpot ? 60 : 72;
  const badgeX = W - 24 - badgeW;
  ctx.fillStyle = sideColor+'22';
  roundRect(ctx, badgeX, 14, badgeW, 26, 6); ctx.fill();
  ctx.font='800 12px "Trebuchet MS",sans-serif';
  ctx.fillStyle=sideColor;
  ctx.textAlign='center';
  ctx.fillText(sideLabel, badgeX+badgeW/2, 31);

  if(!isSpot){
    const levW=44;
    const levX=badgeX-levW-8;
    ctx.fillStyle='#1a1a2a';
    roundRect(ctx,levX,14,levW,26,6);ctx.fill();
    ctx.font='800 12px "Trebuchet MS",sans-serif';
    ctx.fillStyle='#5b7fff';
    ctx.fillText(pos.leverage+'x', levX+levW/2, 31);
  }

  // ── pair name ──
  ctx.font='700 28px "Trebuchet MS",sans-serif';
  ctx.fillStyle='#e0e0e0';
  ctx.textAlign='left';
  ctx.fillText(pair, 24, 78);

  // ── exchange label ──
  ctx.font='400 12px "Trebuchet MS",sans-serif';
  ctx.fillStyle='#555';
  ctx.fillText(ex + (isSpot?' · SPOT':' · PERP'), 24, 98);

  // ── BIG percentage (hero number) ──
  const pctStr = (isUp?'+':'') + pnlPct.toFixed(2) + '%';
  ctx.font='800 96px "Trebuchet MS",sans-serif';
  ctx.fillStyle=bandColor;
  ctx.textAlign='left';
  ctx.fillText(pctStr, 24, 215);

  // ── dollar amount below ──
  const pnlStr = (isUp?'+':'-') + '$' + Math.abs(pnl).toFixed(2);
  ctx.font='400 22px "Trebuchet MS",sans-serif';
  ctx.fillStyle=bandColor+'99';
  //ctx.fillText(pnlStr, 28, 248);

  // ── divider ──
  ctx.strokeStyle='#222';
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(24,272);ctx.lineTo(W-24,272);ctx.stroke();

  // ── stats row ──
  const stats = isSpot ? [
    ['avg entry', fmtPrice(pos.entryPrice)],
    ['mark price', fmtPrice(currentPrice)],
    ['size', '$'+pos.size],
    ['holdings', (pos.size/pos.entryPrice).toFixed(6)+' '+pos.pair.replace('USDT','')],
  ] : [
    ['entry price', fmtPrice(pos.entryPrice)],
    ['mark price', fmtPrice(currentPrice)],
    ['size', '$'+pos.size],
    ['leverage', pos.leverage+'x'],
    ['exchange', ex],
  ];

  const colW=(W-48)/stats.length;
  stats.forEach(([label,val],i)=>{
    const x=24+i*colW;
    ctx.font='400 11px "Trebuchet MS",sans-serif';
    ctx.fillStyle='#444';
    ctx.textAlign='left';
    ctx.fillText(label, x, 300);
    ctx.font='700 16px "Trebuchet MS",sans-serif';
    ctx.fillStyle='#c0c0c0';
    ctx.fillText(val, x, 322);
  });

  // ── bottom row ──
  const now=new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
  ctx.font='400 11px "Trebuchet MS",sans-serif';
  ctx.fillStyle='#333';
  ctx.textAlign='left';
  ctx.fillText(now, 24, H-18);
  ctx.textAlign='right';
  ctx.fillText('bet all the time · bet with style', W-24, H-18);

  // show modal
  const modal=document.getElementById('tp-share-modal');
  if(modal) modal.style.display='flex';
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function tpCloseShareModal(){
  const m=document.getElementById('tp-share-modal');
  if(m) m.style.display='none';
}

function tpDownloadShare(){
  const canvas=document.getElementById('tp-share-canvas');
  const a=document.createElement('a');
  a.download='batt-pnl-'+(Date.now())+'.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
}

async function tpCopyShare(){
  const canvas=document.getElementById('tp-share-canvas');
  const btn=document.getElementById('tp-share-copy-btn');
  try{
    canvas.toBlob(async blob=>{
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      if(btn){ const t=btn.textContent; btn.textContent='✓ copied!'; setTimeout(()=>btn.textContent=t,2000); }
    });
  }catch(e){
    if(btn){ btn.textContent='use download instead'; setTimeout(()=>btn.textContent='copy image',2000); }
  }
}

// close modal on backdrop click
document.addEventListener('click',function(e){
  const m=document.getElementById('tp-share-modal');
  if(m && e.target===m) tpCloseShareModal();
});
// ── END SHARE P&L ──


// ══════════════════════════════════════════════════════
// ── LIMIT / STOP ORDER EXECUTION ENGINE ──
// ══════════════════════════════════════════════════════

function tpCheckPendingOrders(){
  if(!TP_STATE.pendingOrders || !TP_STATE.pendingOrders.length) return;
  const now = Date.now();
  let filled = [];

  TP_STATE.pendingOrders.forEach(order => {
    const priceData = TP_STATE.prices[order.pair];
    if(!priceData || !priceData.price) return;
    const lastPrice = priceData.price;
    // use real order book best ask/bid if available, fall back to last price
    const bestAsk = TP_STATE.bestAsk || lastPrice;
    const bestBid = TP_STATE.bestBid || lastPrice;
    let triggered = false;
    let fillPrice;

    if(order.type === 'limit'){
      // CEX standard: limit buy fills when best ask <= limitPrice (you get the ask or better)
      // CEX standard: limit sell fills when best bid >= limitPrice (you get the bid or better)
      // Fill price = exact limit price (maker order — price improvement possible but use limit as floor/ceiling)
      if(order.side === 'long'  && bestAsk <= order.limitPrice){ triggered = true; fillPrice = order.limitPrice; }
      if(order.side === 'short' && bestBid >= order.limitPrice){ triggered = true; fillPrice = order.limitPrice; }
    } else if(order.type === 'stop'){
      // Stop order triggers on last price, then executes as market (apply slippage)
      if(order.side === 'long'  && lastPrice >= order.limitPrice){ triggered = true; }
      if(order.side === 'short' && lastPrice <= order.limitPrice){ triggered = true; }
      if(triggered){
        const slippage = tpCalcSlippage(order.pair, order.size);
        fillPrice = order.side === 'long'
          ? lastPrice * (1 + slippage)   // stop-buy executes above trigger
          : lastPrice * (1 - slippage);  // stop-sell executes below trigger
      }
    }

    if(triggered && fillPrice){
      filled.push(order);
      const fees    = tpGetFees(order.exchange, order.marketType, order.type);
      const openFee = order.size * (fees.active / 100);
      const pos = {
        id: 'pos_'+now+'_'+Math.random().toString(36).slice(2,6),
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
      // cross: deduct margin on fill (wasn't locked upfront). isolated: already deducted on order placement
      const isCrossFill = pos.marginMode === 'cross' && pos.marketType !== 'spot';
      if(isCrossFill) TP_STATE.balance -= (pos.initialMargin || pos.size / pos.leverage);
      TP_STATE.balance -= openFee;
      TP_STATE.totalFeesPaid += openFee;
      const fillTxt = order.type === 'limit'
        ? `LIMIT filled: ${order.pair.replace('USDT','')} ${order.side.toUpperCase()} @ ${fmtPrice(fillPrice)}`
        : `STOP filled: ${order.pair.replace('USDT','')} ${order.side.toUpperCase()} @ ${fmtPrice(fillPrice)} (trigger: ${fmtPrice(order.limitPrice)})`;
      showToast(fillTxt, 'success');
    }
  });

  if(filled.length){
    TP_STATE.pendingOrders = TP_STATE.pendingOrders.filter(o => !filled.includes(o));
    tpSaveState();
    tpRenderPositions();
    tpRenderOrders();
    tpUpdateStats();
    _tpUpdateOrderBadge();
  }
}


// ── RENDER ORDERS TAB ──
function tpRenderOrders(){
  const container = document.getElementById('tp-orders');
  if(!container) return;
  const orders = TP_STATE.pendingOrders || [];
  const countEl = document.getElementById('tp-orders-count');
  if(countEl) countEl.textContent = orders.length;
  if(!orders.length){
    container.innerHTML = '<div class="tp-empty"><div class="tp-empty-icon">📋</div><div class="tp-empty-text">No pending orders<br><span style="font-size:9px;color:#333">Place a limit or stop order to see it here</span></div></div>';
    return;
  }
  container.innerHTML = orders.map(o => {
    const sideColor = o.side==='long' ? '#00c47a' : '#e24b4a';
    const typeColor = o.type==='stop' ? '#EF9F27' : '#5b7fff';
    return `<div class="tp-position-card" style="padding:10px;border-left:3px solid ${sideColor};cursor:pointer" onclick="tpJumpTo('${o.pair}','${o.exchange}','${o.marketType}')">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:13px;font-weight:700;color:#e0e0e0">${o.pair.replace('USDT','')}/USDT</span>
          <span style="font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;background:${sideColor}22;color:${sideColor}">${o.side.toUpperCase()}</span>
          <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:${typeColor}22;color:${typeColor}">${o.type.toUpperCase()}</span>
        </div>
        <button onclick="event.stopPropagation();tpCancelOrder('${o.id}')" style="font-size:9px;padding:3px 10px;background:#2a0a0a;color:#e24b4a;border:0.5px solid #3a1a1a;border-radius:4px;cursor:pointer;font-family:'Trebuchet MS',sans-serif">✕ cancel</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
        <div class="tp-pos-stat">Price<span style="color:#e0e0e0">${fmtPrice(o.limitPrice)}</span></div>
        <div class="tp-pos-stat">Size<span>$${o.size}</span></div>
        <div class="tp-pos-stat">Lev<span>${o.leverage}x</span></div>
      </div>
      <div style="font-size:8px;color:#333;margin-top:4px">${(o.exchange||'').toUpperCase()} · ${o.marketType||'spot'} · ${new Date(o.createdAt).toLocaleTimeString()}</div>
    </div>`;
  }).join('');
}

function tpCancelOrder(id){
  const idx = TP_STATE.pendingOrders.findIndex(o=>o.id===id);
  if(idx===-1) return;
  const o = TP_STATE.pendingOrders[idx];
  const isCross = o.marginMode === 'cross' && o.marketType !== 'spot';
  // refund what was actually locked — isolated locks margin, cross locks nothing
  if(!isCross) TP_STATE.balance += (o.marginNeeded || o.size / o.leverage);
  TP_STATE.pendingOrders.splice(idx,1);
  tpSaveState();
  tpRenderOrders();
  _tpUpdateOrderBadge();
  showToast('Order cancelled', 'info');
}

// ── PRICE ALERTS ──
var _tpAlerts = [];

function tpAddAlert(pair, price, direction){
  _tpAlerts.push({ pair, price, direction, id: Date.now() });
  showToast(`Alert set: ${pair.replace('USDT','')} ${direction} ${fmtPrice(price)}`, 'info');
}

function tpCheckAlerts(){
  if(!_tpAlerts.length) return;
  _tpAlerts = _tpAlerts.filter(alert => {
    const priceData = TP_STATE.prices[alert.pair];
    if(!priceData || !priceData.price) return true;
    const price = priceData.price;
    const triggered = alert.direction === 'above'
      ? price >= alert.price
      : price <= alert.price;
    if(triggered){
      showToast(`🔔 Alert! ${alert.pair.replace('USDT','')} is ${alert.direction} ${fmtPrice(alert.price)}`, 'success');
      return false;
    }
    return true;
  });
}

// ── MOBILE LAYOUT ──
// handled via CSS — see media queries

// ══════════════════════════════════════════════════════

function _tpUpdateOrderBadge(){
  const count = (TP_STATE.pendingOrders||[]).length;
  const countEl = document.getElementById('tp-orders-count');
  if(countEl) countEl.textContent = count;
  // show count on left toggle
  const toggle = document.getElementById('tp-pos-toggle');
  if(toggle){
    const icon = toggle.querySelector('.tp-pos-panel-toggle-icon');
    if(icon) icon.textContent = count > 0 ? count + ' ORD' : (_tpPosOpen ? '◀' : 'POS');
    toggle.style.background = count > 0
      ? 'linear-gradient(180deg,#5b7fff,#3b5bd9)'
      : 'linear-gradient(180deg,#00c47a,#1D9E75)';
  }
}

// ── END ORDER ENGINE ──
// ══════════════════════════════════════════════════════


// ── JUMP TO POSITION/ORDER STATE ──
function tpJumpTo(pair, exchange, marketType){
  var changed = false;
  if(pair && pair !== TP_STATE.pair){
    tpSelectPair(pair);
    changed = true;
  }
  if(exchange && exchange !== TP_STATE.exchange){
    tpSelectExchange(exchange);
    changed = true;
  }
  if(marketType && marketType !== TP_STATE.marketType){
    tpSetMarketType(marketType);
    changed = true;
  }
}
// ── BATT ICON SYSTEM ──
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
  'PancakeSwap':'https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo.png',
  'Jupiter':    'https://assets.coingecko.com/coins/images/34188/small/jup.png',
  'Velodrome':  'https://assets.coingecko.com/coins/images/25783/small/velo.png',
  'Aerodrome':  'https://assets.coingecko.com/coins/images/31745/small/token.png',
  'QuickSwap':  'https://assets.coingecko.com/coins/images/13970/small/1_pOU6pBMEmiL-ZJVb0CYRjQ.png',
  'SyncSwap':   'https://assets.coingecko.com/coins/images/29498/small/SyncSwap.png',
  'Avnu':       'https://assets.coingecko.com/exchanges/images/895/small/avnu.png',
  'Cetus':      'https://assets.coingecko.com/coins/images/30256/small/cetus.png',
  'Trader Joe': 'https://assets.coingecko.com/coins/images/17569/small/trader-joe.png',
  'SpookySwap': 'https://assets.coingecko.com/exchanges/images/518/small/SpookySwap.png',
  'DeDust':     'https://assets.coingecko.com/exchanges/images/778/small/dedust.png',
  'Liquidswap': 'https://assets.coingecko.com/exchanges/images/609/small/liquidswap.png',
};
// ── END ICON SYSTEM ──

function _softUpdateCore(){
  const s=gs();
  const _liqT1=s.P/s.NOT*100;
  const _fm=s.NOT/s.LEV/s.P*100;
  const _newWiped=(!s.SPOT)&&(_liqT1<1||!isFinite(_liqT1)||_fm>100);
  const months=sim(); // single sim call
  const _newBust=!!months.find(r=>r.bust);
  if(_newWiped!==IS_WIPED||_newBust!==!!bustMonth){render();return;}
  const isQ=isQTab(TAB);
  const last=months[months.length-1];
  const act=months.filter(r=>!r.isZ);
  const avgPct=act.length?act.reduce((a,r)=>a+r.pct,0)/act.length:0;
  const {actTr,wins,losses,net:mp}=seqStats(s);
  const liqT1=s.P/s.NOT*100;
  const totalDeposits=last.totalDeposits||0;
  const totalPrincipal=s.P+totalDeposits;
  const tr=totalPrincipal>0?((last.nw/totalPrincipal)-1)*100:0;

  // patch metric cards by re-rendering only .metrics div
  const metricsEl=document.querySelector('.metrics');
  if(metricsEl){
    const cagr=isQ?null:(totalPrincipal>0?(Math.pow(Math.max(last.nw,totalPrincipal)/totalPrincipal,1/3)-1)*100:0);
    const m1M=!isQ?months.find(r=>r.nw>=1000000):null;
    const btcPrice = window.LIVE_BTC_PRICE || 85000; // fallback price
    const endBalanceBTC = last.eA / btcPrice;
    let mh='';
    if(isQ){
      mh=`
        <div class="mc"><div class="mll">${t('q_end_lbl')}</div><div class="mvv" style="color:var(--acc2)">${fmt(last.eA)}</div><div class="ms">${fIDR(last.eA)}</div></div>
        <div class="mc"><div class="mll">${t('total_gain_lbl')}</div><div class="mvv" style="color:var(--acc2)">+${tr.toFixed(1)}%</div><div class="ms">${fmt(last.eA-totalPrincipal)}</div></div>
        <div class="mc"><div class="mll">${t('nw_lbl')}</div><div class="mvv" style="color:var(--acc)">${fmt(last.nw)}</div><div class="ms">${fIDR(last.nw)}</div></div>
        <div class="mc"><div class="mll">${t('banked_lbl')}${totalDeposits>0?' · DEPO':''}</div><div class="mvv">${fmt(last.banked)}</div><div class="ms">${totalDeposits>0?'banked '+fmt(last.banked)+' · depo +'+fmt(totalDeposits):('3 '+t('months'))}</div></div>
        <div class="mc"><div class="mll">${t('avg_lbl')}</div><div class="mvv">${avgPct.toFixed(1)}%</div><div class="ms">${t('per_active_month')}</div></div>
        <div class="mc"><div class="mll">₿ equivalent</div><div class="mvv" style="color:#f7931a">${endBalanceBTC.toFixed(4)}</div><div class="ms">Q3 acct · @ $${btcPrice.toLocaleString()}</div></div>
        <div class="mc"><div class="mll">${t('seq_net_lbl')}</div><div class="mvv" style="color:${mp>=0?'#1D9E75':'#E24B4A'}">${mp>0?'+':''}${mp.toFixed(1)}%</div><div class="ms">${wins}W / ${losses}L · ${actTr} ${t('active_trades')}</div></div>
        <div class="mc"><div class="mll">total fees paid</div><div class="mvv" style="color:#E24B4A">−${fmt(months.filter(r=>!r.isZ).reduce((a,r)=>a+(r.feePaid||0),0))}</div><div class="ms">${s.SPOT?'trade only · spot':'trade + funding · 3mo'}</div></div>
        <div class="mc placeholder"></div>
        <div class="mc placeholder"></div>
        <div class="mc placeholder"></div>
        <div class="mc placeholder"></div>`;
    } else {
      // 1-year metrics (month 12)
      const m12 = months[11]; // index 11 = month 12
      const y1Depo = m12 ? (m12.totalDeposits || 0) : 0;
      const y1Prin = s.P + y1Depo;
      const y1Nw = m12 ? m12.nw : s.P;
      const y1Ret = y1Prin > 0 ? ((y1Nw / y1Prin) - 1) * 100 : 0;
      mh=`
        <div class="mc"><div class="mll">${t('cagr_lbl')}</div><div class="mvv" style="color:var(--acc2)" data-key="cagr">${cagr.toFixed(1)}%</div><div class="ms">${t('cagr_sub')}</div></div>
        <div class="mc"><div class="mll">${t('total_ret_lbl')}</div><div class="mvv">${tr>9999?(tr/1000).toFixed(0)+'k%':tr.toFixed(0)+'%'}</div><div class="ms">${t('total_ret_sub',fmt(totalPrincipal))}</div></div>
        <div class="mc"><div class="mll">${t('nw_lbl')}</div><div class="mvv" style="color:var(--acc2)" data-key="nw">${fmt(last.nw)}</div><div class="ms">${t('nw_sub')} · ${fIDR(last.nw)}</div></div>
        <div class="mc"><div class="mll">${t('banked_lbl')}${totalDeposits>0?' · DEPO':''}</div><div class="mvv" style="color:var(--acc)" data-key="banked">${fmt(last.banked)}</div><div class="ms">${totalDeposits>0?'banked '+fmt(last.banked)+' · depo +'+fmt(totalDeposits):t('banked_sub')}</div></div>
        <div class="mc"><div class="mll">${t('end_acct_lbl')}</div><div class="mvv" data-key="eA">${fmt(last.eA)}</div><div class="ms">${months.filter(r=>!r.isZ).length}/${months.length} active · ${fIDR(last.eA)}</div></div>
        <div class="mc"><div class="mll">₿ equivalent</div><div class="mvv" style="color:#f7931a">${endBalanceBTC.toFixed(4)}</div><div class="ms">${months.filter(r=>!r.isZ).length}/${months.length} · @ $${btcPrice.toLocaleString()}</div></div>
        <div class="mc"><div class="mll">${t('milestone_lbl')}</div><div class="mvv" style="color:${m1M?'var(--acc2)':'#E24B4A'}">${m1M?getMLabel(m1M.m):t('beyond36')}</div><div class="ms">${m1M?t('milestone_hit')+getMLabel(m1M.m):t('milestone_miss')}</div></div>
        <div class="mc"><div class="mll">${t('avg_lbl')}</div><div class="mvv">${avgPct.toFixed(1)}%</div><div class="ms">${t('avg_sub')} · ${(36-s.ZM.size)} ${t('active')}</div></div>
        <div class="mc"><div class="mll">${t('seq_net_lbl')}</div><div class="mvv" style="color:${mp>=0?'#1D9E75':'#E24B4A'}">${mp>0?'+':''}${mp.toFixed(1)}%</div><div class="ms">${wins}W / ${losses}L · ${actTr}/10</div></div>
        ${s.SPOT?'<div class="mc"><div class="mll">no liq%</div><div class="mvv" style="color:#5DC96A">◈ spot</div><div class="ms">no liquidation risk</div></div>':('<div class="mc"><div class="mll">'+t('liq_mc_lbl')+'</div><div class="mvv" style="color:'+lc(liqT1)+'">'+liqT1.toFixed(1)+'%</div><div class="ms">'+t('liq_mc_sub',liqT1.toFixed(0))+'</div></div>')}
        <div class="mc"><div class="mll">total fees paid</div><div class="mvv" style="color:#E24B4A">−${fmt(months.filter(r=>!r.isZ).reduce((a,r)=>a+(r.feePaid||0),0))}</div><div class="ms">${s.SPOT?'trade only · spot':'trade + funding · all months'}</div></div>
        <div class="mc"><div class="mll">1yr return</div><div class="mvv" style="color:#5b7fff">${y1Ret>999?(y1Ret/1000).toFixed(1)+'k%':y1Ret.toFixed(0)+'%'}</div><div class="ms">M12 NW: ${fmt(y1Nw)}</div></div>`;
    }
    metricsEl.innerHTML=mh;
  }

  // patch note text (setup summary)
  const noteEl=document.querySelector('.note');
  if(noteEl && !IS_WIPED){
    const noteText=s.SPOT
      ?(LANG==='id'
        ?`◈ mode spot · akun ${fmt(s.P)} · posisi = modal penuh · tanpa leverage · tanpa likuidasi · biaya: ${s.FEE.method} ${s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker}% × 2 per trade · ${actTr}/10 trade ${t('active')} · kpi scale ${s.KPI.toFixed(2)}×`
        :`◈ spot mode · acct ${fmt(s.P)} · position = full capital · no leverage · no liquidation · fee: ${s.FEE.method} ${s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker}% × 2 per trade · ${actTr}/10 ${t('trades')} ${t('active')} · kpi scale ${s.KPI.toFixed(2)}×`)
      :`${t('note_setup')}: acct ${fmt(s.P)} · notional t1 ${fmt(s.NOT)} (${(s.NOT/s.P).toFixed(2)}× acct) · ${t('note_margin')} ${fmt(s.NOT/s.LEV)} ${t('note_at')} ${s.LEV}× lev · liq t1 = ${liqT1.toFixed(1)}% (${t('note_liq',liqT1.toFixed(0))}) · ${actTr}/10 ${t('trades')} ${t('active')} · kpi scale ${s.KPI.toFixed(2)}× · ${t('note_wd')}`;
    noteEl.textContent=noteText;
  }

  // patch assess-side cards (36-month) or quarter assess bar
  if(!isQ){
    const aside=document.getElementById('assess-side');
    if(aside) aside.innerHTML=buildAssessmentCards(months,s);
    if(ch) requestAnimationFrame(()=>ch.resize());
  } else {
    const assessEl=document.querySelector('.assess-bar')?.parentElement;
    // re-render assess bar in place
    const ab=document.querySelector('.assess-bar');
    if(ab) ab.outerHTML=buildAssessment(months,s);
  }

  // patch chart data in place — no rebuild, no flash
  if(ch&&!isQTab(TAB)){
    const s2=gs();
    const _lbs=['start',...months.map(r=>r.lb)];
    const _d1=[s2.P,...months.map(r=>r.eA)];
    const _d2=[null,...months.map(r=>r.banked>0?r.banked:null)];
    const _d3=[s2.P,...months.map(r=>r.nw)];
    ch.data.labels=_lbs;
    ch.data.datasets[0].data=_d1;
    ch.data.datasets[1].data=_d2;
    ch.data.datasets[2].data=_d3;
    _applyChartErrorStyle();
    ch.update('none');
  }
  // patch table only — skip if user is actively typing in a trade or push input
  const _active=document.activeElement;
  const _isTyping=_active&&(_active.id&&(_active.id.startsWith('mbt-')||_active.id.startsWith('mfr-')||_active.id.startsWith('wd-inp')||_active.id.startsWith('depo-inp')||_active.id.startsWith('mp-inp')||_active.classList.contains('mp-inp')));
  if(!_isTyping) renderTbl(months);
  // update notional comp row (actual margin, fm%, liq%)
  updComp();
}

function onWdInline(m,v){
  _captureUndo();const val=parseFloat(v)||0;
  gs().WD[m]=val;
  try{localStorage.setItem('batt_'+TAB+'_wd',JSON.stringify({WD:{...gs().WD}}));}catch(e){}
  _silentCloudSync();
  softUpdate(); // renderTbl handles warnings inline
}

function onDepoInline(m,v){
  _captureUndo();const val=parseFloat(v)||0;
  if(!gs().DEPO) gs().DEPO={};
  gs().DEPO[m]=val;
  try{localStorage.setItem('batt_'+TAB+'_depo',JSON.stringify({DEPO:{...gs().DEPO}}));}catch(e){}
  _silentCloudSync();
  softUpdate();
}

function setLang(lang){
  LANG=lang;
  const id=lang==='id';
  ['lang-en','lang-en-btn'].forEach(id2=>{const b=document.getElementById(id2);if(b){b.style.background=lang==='en'?'var(--acc)':'transparent';b.style.color=lang==='en'?'#fff':'var(--tx2)';b.style.borderColor=lang==='en'?'var(--acc)':'var(--bd2)';}});
  ['lang-id','lang-id-btn'].forEach(id2=>{const b=document.getElementById(id2);if(b){b.style.background=lang==='id'?'var(--acc)':'transparent';b.style.color=lang==='id'?'#fff':'var(--tx2)';b.style.borderColor=lang==='id'?'var(--acc)':'var(--bd2)';}});

  // liq-desc is owned by setSpotMode — updated after render() via syncControls

  // layer 2 intro disclaimer
  const l2credit=document.querySelector('.l2-credit');
  if(l2credit) l2credit.innerHTML=id
    ?'dibuat oleh <a href="https://t.me/CryptoJurnal" target="_blank">@cryptojurnal ↗</a>'
    :'created by <a href="https://t.me/CryptoJurnal" target="_blank">@cryptojurnal ↗</a>';
  const l2disc=document.querySelector('.l2-disclaimer');
  if(l2disc) l2disc.innerHTML=id?`
    <div style="font-size:11px;font-weight:700;color:#EF9F27;letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px">⚠ pengungkapan risiko</div>
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:0.5px solid #1e1e1e">
      <span style="color:#888;font-weight:600">ini adalah alat proyeksi, bukan saran keuangan.</span>
      <span style="color:#555"> semua angka adalah estimasi berdasarkan inputmu. hasil trading nyata akan berbeda — pasar tidak bisa diprediksi, eksekusi tidak sempurna, dan disiplin tiap orang berbeda.</span>
      <span style="color:#444;font-size:11px"> tersedia dalam mode <span style="color:#5BB0FF;font-weight:600">leverage</span> dan <span style="color:#5DC96A;font-weight:600">spot</span> — tapi keduanya tidak memprediksi apa yang benar-benar akan terjadi.</span>
    </div>
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:0.5px solid #1e1e1e;display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div>
        <div style="font-size:10px;color:#EF9F27;font-weight:600;margin-bottom:4px">yang dihitung ✓</div>
        <div style="font-size:11px;color:#555;line-height:1.7">· return compounding<br>· liq% buffer (cross margin)<br>· biaya trade (maker/taker)<br>· biaya funding<br>· net P&L setelah biaya</div>
      </div>
      <div>
        <div style="font-size:10px;color:#A32D2D;font-weight:600;margin-bottom:4px">yang tidak dihitung ✗</div>
        <div style="font-size:11px;color:#555;line-height:1.7">· slippage & spread<br>· partial fill<br>· keterlambatan eksekusi<br>· liq isolated margin<br>· keputusan emosional</div>
      </div>
    </div>
    <div style="font-size:11px;color:#555;line-height:1.7">
      <span style="color:#EF9F27;font-weight:600">hanya cross margin.</span> rumus liq% mengasumsikan cross margin. isolated margin berperilaku berbeda dan angka ini tidak berlaku.<br><br>
      <span style="color:#888;font-weight:600">taruhannya milikmu.</span> alat ini membantumu mempersiapkan dan stress-test setup — keuntungan dan kerugian dari trading nyata sepenuhnya tanggung jawabmu.
    </div>`:`
    <div style="font-size:11px;font-weight:700;color:#EF9F27;letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px">⚠ risk disclosure</div>
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:0.5px solid #1e1e1e">
      <span style="color:#888;font-weight:600">this is a projection tool, not financial advice.</span>
      <span style="color:#555"> all numbers are estimates based on your inputs. real trading results will differ — markets are unpredictable, execution is imperfect, and discipline varies.</span>
      <span style="color:#444;font-size:11px"> works in both <span style="color:#5BB0FF;font-weight:600">leverage</span> and <span style="color:#5DC96A;font-weight:600">spot</span> mode — but neither predicts what will actually happen.</span>
    </div>
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:0.5px solid #1e1e1e;display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div>
        <div style="font-size:10px;color:#EF9F27;font-weight:600;margin-bottom:4px">what is calculated ✓</div>
        <div style="font-size:11px;color:#555;line-height:1.7">· compounding returns<br>· liq% buffer (cross margin)<br>· trade fees (maker/taker)<br>· funding fees<br>· net P&L after fees</div>
      </div>
      <div>
        <div style="font-size:10px;color:#A32D2D;font-weight:600;margin-bottom:4px">what is not calculated ✗</div>
        <div style="font-size:11px;color:#555;line-height:1.7">· slippage & spread<br>· partial fills<br>· execution delays<br>· isolated margin liq<br>· emotional decisions</div>
      </div>
    </div>
    <div style="font-size:11px;color:#555;line-height:1.7">
      <span style="color:#EF9F27;font-weight:600">cross margin only.</span> liq% formula assumes cross margin. isolated margin behaves differently and these numbers won't apply.<br><br>
      <span style="color:#888;font-weight:600">the bet is yours.</span> this tool helps you prepare and stress-test your setup — gains and losses from actual trading are entirely your own responsibility.
    </div>`;
  const launchBtn=document.querySelector('.launch-btn');
  if(launchBtn) launchBtn.textContent=id?'mulai app':'launch the app';

  // guide popup
  const pt=document.querySelector('.popup-title');
  if(pt) pt.textContent=id?'📖 mulai dengan panduan':'📖 start with the guide book';
  const pb=document.querySelector('.popup-body');
  if(pb) pb.innerHTML=id
    ?'panduan menjelaskan cara kerja semuanya — liq%, biaya, slot trade, skor risiko, dan lainnya. bacaan yang bagus sebelum mulai.<br><br>dan kalau ada pertanyaan di tengah jalan, <b>Kira</b> 🤖 selalu siap membantu — asisten built-in yang tahu dashboard ini luar dalam.'
    :'the guide book walks you through how everything works — liq%, fees, trade slots, risk scores, and more. a good read before diving in.<br><br>and if you ever have questions along the way, <b>Kira</b> 🤖 is always there — your built-in assistant who knows this dashboard inside out.';
  const ph=document.querySelector('.popup-hint');
  if(ph) ph.textContent=id?'↙ tab panduan disorot di bawah':'↙ the guide book tab is highlighted below';
  const pok=document.querySelector('.popup-ok');
  if(pok) pok.textContent=id?'oke, aku mau eksplorasi':'okay, let me explore';

  // spot notes in left panel
  const snl=document.getElementById('spot-note-lev');
  if(snl) snl.innerHTML=id?'◈ mode spot — tanpa leverage, tanpa likuidasi.<br>ukuran posisi = modalmu.':'◈ spot mode — no leverage, no liquidation.<br>position size = your capital.';
  const snn=document.getElementById('spot-note-not');
  if(snn) snn.innerHTML=id?'◈ mode spot — notional = modal.<br>tanpa leverage, tanpa margin, tanpa liq%.':'◈ spot mode — notional = capital.<br>no leverage, no margin, no liq%.';
  const sfn=document.getElementById('spot-fee-note');
  if(sfn) sfn.textContent=id?'◈ spot — tidak ada biaya funding. hanya maker + taker per trade.':'◈ spot — no funding fee. only maker + taker per trade.';

  // fee tier note
  const ftn=document.getElementById('fee-tier-note');
  if(ftn) ftn.innerHTML=id
    ?'<b style="color:var(--tx2)">tarif tier standar</b> — diisi otomatis dari exchange yang dipilih.<br>jika kamu di tier VIP lebih tinggi atau memegang token exchange (BNB/OKB), kamu bisa mengetik tarif aktualmu di bawah. <span style="color:var(--acc2)">perubahan tersimpan otomatis.</span>'
    :'<b style="color:var(--tx2)">standard tier rates</b> — pre-filled from your selected exchange.<br>if you are on a higher VIP tier or hold the exchange token (BNB/OKB), you can type your actual rates below. <span style="color:var(--acc2)">changes auto-save.</span>';

  // fee sec label
  const feeLbl=document.getElementById('fee-sec-lbl');
  if(feeLbl){
    const s=gs();
    feeLbl.textContent=s.SPOT?(id?'biaya spot':'spot fees'):(id?'biaya & funding':'fees & funding');
  }

  // top panel show/hide label
  const tpl=document.getElementById('tp-lbl');
  if(tpl) tpl.textContent=TOP_PANEL_COLLAPSED?(id?'tampilkan ikhtisar':'show overview'):(id?'sembunyikan ikhtisar':'hide overview');

  // act-count in trade slots
  const ac=document.getElementById('act-count');
  if(ac){
    const s=gs();
    const cnt=s.BT.filter(b=>b!==0).length;
    ac.innerHTML=`<span>${cnt}</span> ${id?'aktif':'active'}`;
  }

  // soft render to update all t() keys
  const _prevCh=ch;
  render();
}
// ── TOP PANEL COLLAPSE ──
function toggleTopPanel(){
  TOP_PANEL_COLLAPSED=!TOP_PANEL_COLLAPSED;
  _applyTopPanel();
  setTimeout(()=>{
    if(ch){if(ch._errorPulse){clearInterval(ch._errorPulse);ch._errorPulse=null;}_applyChartErrorStyle();}
  },450);
}
function _applyTopPanel(){
  const tp=document.getElementById('top-panel');
  const body=document.getElementById('top-panel-body');
  const lbl=document.getElementById('tp-lbl');
  if(!tp||!body)return;
  tp.classList.toggle('collapsed',TOP_PANEL_COLLAPSED);
  body.style.maxHeight=TOP_PANEL_COLLAPSED?'0':'2000px';
  body.style.opacity=TOP_PANEL_COLLAPSED?'0':'1';
  if(lbl)lbl.textContent=TOP_PANEL_COLLAPSED?'show overview':'hide overview';
}
// ── PANEL COLLAPSE ──
// ── SPOT/LEVERAGE FEE PRESETS ──
const FEE_PRESETS={
  futures:{binance:{maker:0.02,taker:0.05},bybit:{maker:0.02,taker:0.055},okx:{maker:0.02,taker:0.05}},
  spot:   {binance:{maker:0.1, taker:0.1 },bybit:{maker:0.1, taker:0.1  },okx:{maker:0.08,taker:0.1 }}
};

function setFeeMethod(method){
  _captureUndo();gs().FEE.method=method;
  const bm=document.getElementById('fee-msw-maker');
  const bt=document.getElementById('fee-msw-taker');
  if(bm)bm.classList.toggle('on',method==='maker');
  if(bt)bt.classList.toggle('on',method==='taker');
  const note=document.getElementById('fee-method-note');
  const rate=method==='maker'?gs().FEE.maker:gs().FEE.taker;
  if(note)note.textContent='using '+method+' rate ('+rate+'%) × 2 per trade';
  softUpdate();
  saveSection('fee');
}

function onFeeExchangeChange(ex){
  FEE_LIVE.exchange=ex;
  const s=gs();
  const preset=FEE_PRESETS[s.SPOT?'spot':'futures'][ex];
  if(preset){
    s.FEE.maker=preset.maker; s.FEE.taker=preset.taker;
    const mk=document.getElementById('fee-maker'); if(mk)mk.value=preset.maker;
    const tk=document.getElementById('fee-taker'); if(tk)tk.value=preset.taker;
    setFeeMethod(s.FEE.method);
  }
}

function setSpotMode(isSpot){
  _captureUndo();// guest intercept — only block actual user-initiated switches, not internal init calls
  if(isSpot && !(localStorage.getItem('batt_token')) && window.BATT_GUEST){
    showToast('🔐 guest mode — login or register to switch modes','info',3000);
    return;
  }
  const s=gs();
  // remember previous leverage when switching to spot
  if(isSpot && !s.SPOT) s._prevLEV=s.LEV;
  // restore previous leverage when switching back, or keep as-is
  if(!isSpot && s._prevLEV) { /* keep s.LEV as user left it */ }
  s.SPOT=isSpot;
  // update lev display: show 1x in spot, restore actual in lev
  const levDisplay=isSpot?1:s.LEV;
  const lvIn=document.getElementById('lv-in');
  const lvSl=document.getElementById('lv-sl');
  const lvVl=document.getElementById('lv-vl');
  if(lvIn) lvIn.value=levDisplay;
  if(lvSl) lvSl.value=Math.min(levDisplay,50);
  if(lvVl) lvVl.textContent=levDisplay+'×';
  // update badge
  const badge=document.getElementById('spot-badge');
  if(badge){
    badge.className='spot-badge '+(isSpot?'spot':'lev');
    badge.innerHTML=(isSpot?'◈ spot dashboard':'⚡ leverage dashboard')+'<span class="spot-badge-sub">current mode</span>';
  }
  // switcher buttons
  const bl=document.getElementById('msw-lev'),bs=document.getElementById('msw-spot');
  if(bl)bl.classList.toggle('on',!isSpot);
  if(bs)bs.classList.toggle('on',isSpot);
  // leverage controls
  const lc=document.getElementById('lev-controls'),sn=document.getElementById('spot-note-lev');
  if(lc)lc.classList.toggle('disabled-overlay',isSpot);
  if(sn)sn.style.display=isSpot?'block':'none';
  // notional controls
  const nc=document.getElementById('not-controls'),snn=document.getElementById('spot-note-not');
  // notional link-to-capital: disable in spot (meaningless)
  const nlb=document.getElementById('not-link-btn');
  if(nlb){
    nlb.disabled=isSpot;
    nlb.style.opacity=isSpot?'.3':'1';
    nlb.style.pointerEvents=isSpot?'none':'';
    nlb.title=isSpot?'not available in spot mode':'link notional to capital';
  }
  if(nc)nc.classList.toggle('disabled-overlay',isSpot);
  if(snn)snn.style.display=isSpot?'block':'none';
  // fee section
  const fw=document.getElementById('funding-row-wrap'),sfn=document.getElementById('spot-fee-note');
  const feeLbl=document.getElementById('fee-sec-lbl');
  if(fw)fw.style.display=isSpot?'none':'block';
  if(sfn)sfn.style.display=isSpot?'block':'none';
  if(feeLbl)feeLbl.textContent=isSpot?'spot fees':'fees & funding';
  // liq-desc
  const ld=document.getElementById('liq-desc');
  if(ld)ld.textContent=isSpot
    ?(LANG==='id'?'◈ mode spot — tanpa leverage, tanpa likuidasi':'◈ spot mode — no leverage, no liquidation')
    :(LANG==='id'?'liq% = akun ÷ notional · lebih tinggi = lebih aman':'liq% = account ÷ notional · higher = safer');
  // auto-fill fee preset for current exchange
  const ex=document.getElementById('fee-exchange');
  const exVal=ex?ex.value:'binance';
  const preset=FEE_PRESETS[isSpot?'spot':'futures'][exVal];
  if(preset){
    gs().FEE.maker=preset.maker; gs().FEE.taker=preset.taker;
    const mk=document.getElementById('fee-maker'); if(mk)mk.value=preset.maker;
    const tk=document.getElementById('fee-taker'); if(tk)tk.value=preset.taker;
  }
  // funding: force 0 in spot
  if(isSpot){gs().FEE.funding=0; gs().FEE.holds=0;}
  // live fetch button: hide in spot (no funding)
  const flb=document.getElementById('fee-live-btn'),fls=document.getElementById('fee-live-status');
  if(flb)flb.style.display=isSpot?'none':'';
  if(fls)fls.style.display=isSpot?'none':'';
  saveSection('fee'); // persists SPOT flag + fee state
  softUpdate();
}

function toggleSec(id){
  const body=document.getElementById(id);
  const arrow=document.querySelector('[data-sec="'+id+'"] .sec-toggle');
  if(!body)return;
  const collapsed=body.classList.toggle('collapsed');
  if(arrow)arrow.style.transform=collapsed?'rotate(-90deg)':'rotate(0deg)';
}
function _syncTradeToggleLeft(){
  const leftPanel=document.getElementById('left-panel');
  const tradePanel=document.getElementById('trade-panel');
  const tradeToggle=document.getElementById('trade-panel-toggle');
  if(!tradeToggle) return;
  const leftOpen = leftPanel && !leftPanel.classList.contains('collapsed');
  const tradeOpen = tradePanel && !tradePanel.classList.contains('collapsed');
  // trade toggle sits at right edge of: left panel (if open) + trade panel (if open)
  const leftW = leftOpen ? 224 : 0;
  const tradeW = tradeOpen ? 224 : 0;
  tradeToggle.style.left = (leftW + tradeW) + 'px';
}

function togglePanel(){
  const panel=document.getElementById('left-panel');
  const btn=document.getElementById('collapse-btn');
  const toggle=document.getElementById('left-panel-toggle');
  const isCollapsed=panel.classList.contains('collapsed');
  if(isCollapsed){
    panel.style.overflow='hidden';
    panel.classList.remove('collapsed');
    if(btn) btn.textContent='‹';
    if(toggle) toggle.classList.add('expanded');
    setTimeout(()=>{ panel.style.overflow=''; },380);
  } else {
    if(toggle) toggle.classList.remove('expanded');
    if(btn) btn.textContent='›';
    panel.classList.add('collapsed');
  }
  setTimeout(_syncTradeToggleLeft, 10);
  [50,150,250,350,420].forEach(d=>setTimeout(()=>{
    if(ch){if(ch._errorPulse){clearInterval(ch._errorPulse);ch._errorPulse=null;}_applyChartErrorStyle();requestAnimationFrame(()=>ch.resize());}
  },d));
}

function toggleTradePanel(){
  const panel=document.getElementById('trade-panel');
  const toggle=document.getElementById('trade-panel-toggle');
  panel.classList.toggle('collapsed');
  const isCollapsed=panel.classList.contains('collapsed');
  // _syncTradeToggleLeft owns left position, not .expanded
  setTimeout(_syncTradeToggleLeft, 10);
  [50,150,250,350,420].forEach(d=>setTimeout(()=>{
    if(ch){if(ch._errorPulse){clearInterval(ch._errorPulse);ch._errorPulse=null;}_applyChartErrorStyle();requestAnimationFrame(()=>ch.resize());}
  },d));
}

// ── TRADE PANEL TOGGLE DRAG ──
(function(){
  var toggle, startY, startTop, dragging=false, hasDragged=false;
  var _rafId=null, _lastY=0;
  function isTradePanelBtn(el){
    return el && (el.id==='trade-panel-toggle' || el.closest('#trade-panel-toggle'));
  }
  function onDown(e){
    toggle=document.getElementById('trade-panel-toggle');
    if(!toggle || !toggle.classList.contains('visible'))return;
    var pt=e.touches?e.touches[0]:e;
    startY=pt.clientY;
    var computedTop=toggle.style.top?parseInt(toggle.style.top):(window.innerHeight/2+56-toggle.offsetHeight/2);
    startTop=computedTop;
    dragging=true; hasDragged=false;
    toggle.classList.add('dragging');
    e.preventDefault();
  }
  function onMove(e){
    if(!dragging||!toggle)return;
    var pt=e.touches?e.touches[0]:e;
    var deltaY=pt.clientY-startY;
    if(Math.abs(deltaY)<5)return;
    hasDragged=true;
    var H=window.innerHeight, toggleH=toggle.offsetHeight;
    _lastY=Math.max(20,Math.min(startTop+deltaY, H-toggleH-20));
    if(!_rafId) _rafId=requestAnimationFrame(function(){
      if(toggle){toggle.style.top=_lastY+'px';toggle.style.transform='none';}
      _rafId=null;
    });
    e.preventDefault();
  }
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    if(toggle)toggle.classList.remove('dragging');
    if(!hasDragged&&toggle) toggleTradePanel();
  }
  document.addEventListener('mousedown',function(e){if(isTradePanelBtn(e.target))onDown(e);});
  document.addEventListener('touchstart',function(e){if(isTradePanelBtn(e.target))onDown(e);},{passive:false});
  document.addEventListener('mousemove',onMove);
  document.addEventListener('touchmove',onMove,{passive:false});
  document.addEventListener('mouseup',onUp);
  document.addEventListener('touchend',onUp);
})();

// ── PRESET → FOLDER LINK HELPER ──
// case-insensitive, trimmed match so "MyPreset" links to "mypreset" folder etc.
function _folderByPreset(presetName){
  if(!presetName||typeof JN==='undefined'||!JN.folders) return null;
  const key=presetName.trim().toLowerCase();
  return JN.folders.find(f=>f.name.trim().toLowerCase()===key)||null;
}

// get or auto-create the journal folder for a preset name
function _getOrCreatePresetFolder(presetName){
  if(!presetName||typeof JN==='undefined') return null;
  let folder=_folderByPreset(presetName);
  if(!folder){
    const s=typeof gs==='function'?gs():{};
    const color=(typeof JN_COLORS!=='undefined'?JN_COLORS:['#00c47a'])[JN.folders.length%(typeof JN_COLORS!=='undefined'?JN_COLORS.length:1)];
    folder={id:'f'+Date.now(),name:presetName,color,type:s.SPOT?'spot':'lev',tags:[],createdAt:Date.now()};
    JN.folders.push(folder);
    if(!JN.trades) JN.trades={};
    JN.trades[folder.id]=[];
    if(typeof jnSave==='function') jnSave();
  }
  return folder;
}



// silent auto-resave to active preset — no confirm, no modal
async function _autoResaveActivePreset(){
  const _tok=(typeof AUTH_TOKEN!=='undefined'?AUTH_TOKEN:null)||localStorage.getItem('batt_token');
  if(!_tok||!window._ACTIVE_PRESET) return;
  const {id,name}=window._ACTIVE_PRESET;
  const snapshot={};
  ['36','q',...(typeof CUSTOM_TABS!=='undefined'?CUSTOM_TABS.map(t=>t.id):[])].forEach(tid=>{
    if(!S||!S[tid])return;
    const s=S[tid];
    snapshot[tid]={...s,ZM:s.ZM?[...s.ZM]:[],LK:s.LK?[...s.LK]:[],CM:s.CM?[...s.CM]:[]};
  });
  snapshot._meta={
    activeTab:typeof TAB!=='undefined'?TAB:'36',
    theme:document.body.className||'',
    customTabs:typeof CUSTOM_TABS!=='undefined'?JSON.parse(JSON.stringify(CUSTOM_TABS)):[],
    notLinked:NOT_LINKED
  };
  try{
    // save fresh copy
    const rSave=await fetch(AUTH_URL+'/presets/save',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_tok},
      body:JSON.stringify({name,snapshot})
    });
    const dSave=await rSave.json();
    if(!dSave.ok) return;
    // delete old entry
    await fetch(AUTH_URL+'/presets/delete',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_tok},
      body:JSON.stringify({id})
    });
    // re-fetch list to get the new ID for this preset name — keeps tracker fresh
    const rList=await fetch(AUTH_URL+'/presets/list',{headers:{'Authorization':'Bearer '+_tok}});
    const dList=await rList.json();
    if(dList.ok&&dList.presets){
      const match=dList.presets.find(p=>p.name===name);
      if(match){
        window._ACTIVE_PRESET={id:match.id,name};
        try{localStorage.setItem('batt_active_preset',JSON.stringify(window._ACTIVE_PRESET));}catch(e){}
        const _pbl=document.getElementById('auth-preset-lbl');
        const _pbc=document.getElementById('auth-preset-clear');
        if(_pbl){_pbl.textContent='● '+name;_pbl.style.display='';}
        if(_pbc) _pbc.style.display='';
      }
      presetRenderList();
    }
  }catch(e){} // silent — never interrupt the user
}



function ljVerifyTvLink(input, warnId){
  const val=(input.value||'').trim();
  const warn=document.getElementById(warnId);
  if(!val){
    input.style.borderColor='#1e1e1e';
    if(warn){warn.style.display='none';}
    // hide preview
    const previewId=warnId==='lj-tv-warn-open'?'lj-tv-preview-open':'lj-tv-preview-close';
    const prev=document.getElementById(previewId);
    if(prev){prev.style.display='none';const img=prev.querySelector('img');if(img)img.src='';}
    return;
  }
  // format check first
  if(!val.includes('tradingview.com/x/')){
    input.style.borderColor='#e05555';
    if(warn){warn.style.display='block';warn.style.color='#e05555';warn.textContent='⚠ invalid format — must be tradingview.com/x/… snapshot link';}
    return;
  }
  // format ok — try loading image
  if(warn){warn.style.display='block';warn.style.color='#888';warn.textContent='⏳ verifying link…';}
  input.style.borderColor='#252525';
  const img=new Image();
  img.onload=()=>{
    input.style.borderColor='#00c47a';
    if(warn){warn.style.color='#00c47a';warn.textContent='✓ chart verified';}
    ljPreviewTV(val, warnId==='lj-tv-warn-open'?'lj-tv-preview-open':'lj-tv-preview-close');
  };
  img.onerror=()=>{
    input.style.borderColor='#e05555';
    if(warn){warn.style.color='#e05555';warn.textContent='⚠ link unreachable — check the snapshot URL';}
  };
  img.src=val;
}

function ljSyncExitType(val){
  // sync exit type from log back to cockpit MT state — log always wins
  const {m,tno}=_ljPending;
  if(!m||!tno) return;
  const s=gs();
  if(!s.MT[m]) s.MT[m]={bt:[...s.BT],fr:[...s.FR]};
  if(!s.MT[m].exitTypes) s.MT[m].exitTypes={};
  s.MT[m].exitTypes[tno]=val;
  // also update table row dropdown if visible
  const sel=document.querySelector(`select[onchange="onTradeExit(${m},${tno},this.value)"]`);
  if(sel) sel.value=val;
  // show/hide SL+RR section — visibility keeps space reserved, no layout jump
  const slRr=document.getElementById('lj-sl-rr-section');
  if(slRr) slRr.style.visibility=val==='price'?'visible':'hidden';
  _silentCloudSync();
}

function ljValidateTvLink(input, warnId){
  const val=(input.value||'').trim();
  const warn=document.getElementById(warnId);
  if(!val){
    input.style.borderColor='#1e1e1e';
    if(warn) warn.style.display='none';
    return true;
  }
  const valid=val.includes('tradingview.com/x/');
  input.style.borderColor=valid?'#1e1e1e':'#e05555';
  if(warn) warn.style.display=valid?'none':'block';
  return valid;
}

function ljShowTvReminder(onContinue, isDraft=false){
  const existing=document.getElementById('lj-tv-reminder');
  if(existing) existing.remove();
  window._ljTvCallback=onContinue;
  const overlay=document.createElement('div');
  overlay.id='lj-tv-reminder';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML=`
    <div style="background:#111;border:1px solid #252525;border-radius:12px;padding:24px;max-width:420px;width:100%">
      <div style="font-size:18px;margin-bottom:4px">📸</div>
      <div style="font-size:14px;font-weight:800;color:#e0e0e0;margin-bottom:6px">${isDraft?'Save your open chart now':'Grab your TradingView snapshot'}</div>
      <div style="font-size:11px;color:#888;line-height:1.7;margin-bottom:16px">${isDraft
        ?'Open position — chart proof is super mandatory. Grab your entry chart now, save close chart when you exit.'
        :'Chart proof makes your journal credible. Screenshot your setup <b style="color:#ccc">before closing</b> this log.'
      }</div>
      <div style="background:#0a0a0a;border:1px solid #1e1e1e;border-radius:8px;padding:12px;margin-bottom:16px">
        <div style="font-size:9px;color:#5b7fff;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">how to get the link</div>
        <div style="font-size:10px;color:#888;line-height:1.9">
          1. Open your chart on <b style="color:#ccc">TradingView</b><br>
          2. Click <b style="color:#ccc">📷 Camera icon</b> (top toolbar)<br>
          3. Select <b style="color:#ccc">Publish chart image</b><br>
          4. Copy the <b style="color:#ccc">tradingview.com/x/…</b> link<br>
          5. Paste it in <b style="color:#ccc">proof open / proof close</b>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('lj-tv-reminder').remove();if(window._ljTvCallback){window._ljTvCallback();window._ljTvCallback=null;}"
          style="flex:1;padding:10px;background:#00c47a;border:none;border-radius:7px;color:#000;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit">
          I have it — continue
        </button>
        <button onclick="document.getElementById('lj-tv-reminder').remove();if(window._ljTvCallback){window._ljTvCallback();window._ljTvCallback=null;}"
          style="padding:10px 14px;background:none;border:1px solid #252525;border-radius:7px;color:#666;font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap">
          skip for now
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function toggleLock(m, tno){
  _captureUndo();const s=gs();
  if(!s.LK) s.LK=new Set();
  if(Array.isArray(s.LK)) s.LK=new Set(s.LK);
  const key=m+'-'+tno;

  if(s.LK.has(key)){
    // already locked — show trade name and hint to view journal
    const _tl=getTL(m,tno)||('T'+tno);
    showToast(`🔒 ${_tl} · M${String(m).padStart(2,'0')} T${tno} is locked — view in journal`,'info',3000);
    return;
  }

  // check if a draft exists for this slot
  const existingDraft=ljFindDraft(m,tno);
  if(existingDraft){
    // open the draft to close/edit it
    ljShowLockModal(m, tno, existingDraft.trade);
    return;
  }

  // ── LINEAR CHECK — previous active slots must be locked or drafted ──
  if(tno>1){
    const mBT=GLOBAL_MODE?s.BT:(s.MT[m]?s.MT[m].bt:s.BT);
    for(let i=0;i<tno-1;i++){
      if(mBT[i]===0) continue; // slot skipped — ok
      const prevKey=m+'-'+(i+1);
      const prevLocked=s.LK.has(prevKey);
      const prevDraft=ljFindDraft(m,i+1);
      if(prevDraft){
        const prevLabel=getTL(m,i+1)||('T'+(i+1));
        showToast(`⚠ Close T${i+1} (${prevLabel}) first — you have a running open position`,'info',3500);
        return;
      }
      if(!prevLocked){
        const prevLabel=getTL(m,i+1)||('T'+(i+1));
        showToast(`⚠ Log T${i+1} (${prevLabel}) first — trades must be logged in order`,'info',3500);
        return;
      }
    }
  }

  // fresh lock — must have at least one journal folder
  if(!JN.folders||JN.folders.length===0){
    showToast('⚠ No journal folders found — load or save a preset first','info',3000);
    return;
  }
  // enforce mandatory trade label
  const _tl=getTL(m,tno);
  if(!_tl||_tl===('trade '+tno)||_tl.toLowerCase()===('trade'+tno)){
    showToast('⚠ Name this trade first — click the label to rename it (e.g. <b>BTCUSDT</b>)','info',3500);
    const lbl=document.querySelector(`input.lbl-trade[value="${_tl}"]`);
    if(lbl){lbl.style.borderBottom='1.5px solid #e05555';lbl.focus();setTimeout(()=>{lbl.style.borderBottom='';},2500);}
    return;
  }
  // enforce mandatory month label
  const _ml=gs().ML[m];
  if(!_ml||_ml===getMLabel(m)){
    showToast('⚠ Name this month first — click the month label to set it (e.g. "Jan 2025")','info',3500);
    return;
  }
  ljShowTvReminder(()=>ljShowLockModal(m, tno), false);
}

// ── LOCK TO JOURNAL ──

var _ljPending={m:0,tno:0}; // current modal context
var _ljFundingData={rates:[],total:0,fetched:false,fetching:false,_key:''};
var _ljFundTimer=null;
function ljFetchFundingDebounced(){
  if(_ljFundTimer) clearTimeout(_ljFundTimer);
  _ljFundTimer=setTimeout(()=>ljFetchFunding(true),800);
}

function ljUpdateDtDisplay(which, val){
  if(!val) return;
  const d=new Date(val);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad=n=>String(n).padStart(2,'0');
  const h=d.getHours();
  const ampm=h>=12?'PM':'AM';
  const h12=h%12||12;
  const formatted=`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${pad(h12)}:${pad(d.getMinutes())} ${ampm}`;
  const valEl=document.getElementById('lj-'+which+'-val');
  const dispEl=document.getElementById('lj-'+which+'-display');
  if(valEl) valEl.textContent=formatted;
  if(dispEl) dispEl.classList.add('active');
  // update duration badge
  const openEl=document.getElementById('lj-open-dt');
  const closeEl=document.getElementById('lj-close-dt');
  if(openEl?.value&&closeEl?.value){
    const ms=new Date(closeEl.value)-new Date(openEl.value);
    if(ms>0){
      const h=Math.floor(ms/3600000);
      const m=Math.floor((ms%3600000)/60000);
      const badge=document.getElementById('lj-duration-badge');
      if(badge) badge.textContent=`· ${h>0?h+'h ':''}${m}m held`;
    }
  }
}

async function ljFetchFunding(manual){
  if(_ljFundingData.fetching) return;
  const s=gs();
  const msgEl=document.getElementById('lj-fund-msg');
  const iconEl=document.getElementById('lj-fund-icon');
  const btnEl=document.getElementById('lj-fund-fetch-btn');
  const lblEl=document.getElementById('lj-fund-lbl');

  if(s.SPOT){
    _ljFundingData={rates:[],total:0,fetched:true,fetching:false,_key:''};
    if(msgEl) msgEl.textContent='spot mode — no funding fees';
    if(iconEl) iconEl.textContent='◈';
    ljCalc(); return;
  }
  const openEl=document.getElementById('lj-open-dt');
  const closeEl=document.getElementById('lj-close-dt');
  if(!openEl?.value||!closeEl?.value) return;
  const startMs=new Date(openEl.value).getTime();
  const endMs=new Date(closeEl.value).getTime();
  if(isNaN(startMs)||isNaN(endMs)||endMs<=startMs) return;
  const key=`${openEl.value}|${closeEl.value}`;
  if(!manual&&_ljFundingData._key===key&&_ljFundingData.fetched) return;

  _ljFundingData.fetching=true;
  _ljFundingData._key=key;
  if(msgEl) msgEl.textContent='fetching funding rates...';
  if(iconEl) iconEl.textContent='↻';
  if(btnEl){btnEl.textContent='...';btnEl.style.opacity='.5';}

  const ex=document.getElementById('lj-exchange')?.value||document.getElementById('fee-exchange')?.value||'binance';
  const pair=(window._ljPair||document.getElementById('lj-pair-input')?.value||'BTCUSDT').replace(/[\s\/]/g,'').toUpperCase();
  const side=window._ljSide||'long';
  const _actualNotRaw=parseFloat(document.getElementById('lj-actual-not')?.dataset.raw||'')||0;
  const notional=_actualNotRaw>0?_actualNotRaw:s.NOT;

  try{
    const rates=await fetchHistoricalFunding(ex,pair,startMs,endMs);
    const totalFunding=calcFundingFromHistory(rates,notional,side==='long');
    _ljFundingData={rates,total:totalFunding,fetched:true,fetching:false,_key:key};
    const hrs=Math.round((endMs-startMs)/3600000*10)/10;
    const intervals=rates.length;
    if(msgEl) msgEl.textContent=`${intervals} interval${intervals!==1?'s':''} · ${hrs}h held · $${Math.abs(totalFunding).toFixed(4)} ${totalFunding>0?'paid':totalFunding<0?'received (lucky)':'zero'}`;
    if(iconEl) iconEl.textContent=intervals>0?'✓':'○';
    if(lblEl) lblEl.innerHTML=`funding <span style="color:#00c47a;font-size:8px">✓ ${intervals} intervals live</span>`;
  }catch(e){
    _ljFundingData.fetching=false;
    if(msgEl) msgEl.textContent='fetch failed — using cockpit estimate';
    if(iconEl) iconEl.textContent='⚠';
  }
  if(btnEl){btnEl.textContent='↻';btnEl.style.opacity='1';}
  ljCalc();
}

function ljFormatMoneyInput(el){
  const raw=el.value.replace(/[^0-9.]/g,"");
  const num=parseFloat(raw)||0;
  el.dataset.raw=num>0?raw:"";
  if(!raw){el.value="";return;}
  // format with commas, keep decimals as typed
  const parts=raw.split(".");
  parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,",");
  const cursorFromEnd=el.value.length-el.selectionEnd;
  el.value=parts.join(".");
  // restore cursor position
  const newPos=el.value.length-cursorFromEnd;
  el.setSelectionRange(newPos,newPos);
}

function ljCalcRR(){
  const rrEl=document.getElementById('lj-rr-display');
  if(!rrEl) return;
  const entry=parseFloat(document.getElementById('lj-entry')?.dataset.raw)||0;
  const exit=parseFloat(document.getElementById('lj-exit')?.dataset.raw)||0;
  const sl=parseFloat(document.getElementById('lj-sl')?.dataset.raw)||0;
  if(!entry||!exit||!sl){rrEl.textContent='—';rrEl.style.color='#888';return;}
  const side=window._ljSide||'long';
  const reward=side==='long'?(exit-entry):(entry-exit);
  const risk=side==='long'?(entry-sl):(sl-entry);
  if(risk<=0){rrEl.textContent='SL wrong side';rrEl.style.color='#e05555';return;}
  if(reward<=0){rrEl.textContent='exit wrong side';rrEl.style.color='#e05555';return;}
  const rr=reward/risk;
  const rrClean=Number.isInteger(Math.round(rr*10)/10)?Math.round(rr).toString():(rr).toFixed(1);
  rrEl.textContent='1 : '+rrClean;
  rrEl.style.color=rr>=2?'#00c47a':rr>=1?'#EF9F27':'#e05555';
}

function ljSyncActualMargin(notVal){
  const s=gs();
  const leverage=s.SPOT?1:s.LEV;
  const not=parseFloat(notVal)||0;
  const mEl=document.getElementById('lj-actual-margin');
  if(!mEl) return;
  if(not>0) mEl.value=(s.SPOT?not:not/leverage).toFixed(2);
  else mEl.value='';
}

function ljSyncActualMargin(notVal){
  const s=gs();
  const leverage=s.SPOT?1:s.LEV;
  const not=parseFloat(notVal)||0;
  const disp=document.getElementById('lj-actual-margin-display');
  if(!disp) return;
  if(not>0) disp.textContent='$'+Math.round(s.SPOT?not:not/leverage).toLocaleString('en-US');
  else {
    const mo=sim().find(x=>x.m===_ljPending.m);
    const tr=mo?mo.trades.find(t=>t.no===_ljPending.tno):null;
    const margin=tr?tr.am:(s.SPOT?s.NOT:s.NOT/leverage);
    disp.textContent='$'+Math.round(margin).toLocaleString('en-US');
  }
}

function ljUpdateTfVerdict(source, val){
  const sel=document.getElementById('lj-tf');
  const customInp=document.getElementById('lj-tf-custom');
  const el=document.getElementById('lj-tf-verdict');

  if(source==='preset'){
    // preset picked — disable custom if has value, else clear
    if(val){
      if(customInp){customInp.value='';customInp.style.opacity='0.35';customInp.disabled=true;}
    } else {
      if(customInp){customInp.disabled=false;customInp.style.opacity='1';}
    }
  } else if(source==='custom'){
    // custom typed — disable preset dropdown if has value
    if(val){
      if(sel){sel.value='';sel.disabled=true;sel.style.opacity='0.35';}
    } else {
      if(sel){sel.disabled=false;sel.style.opacity='1';}
    }
  }

  // determine active TF value
  const activeTf=(source==='custom'?val:val)||'';

  // verdict — parse to minutes for comparison
  function toMin(tf){
    if(!tf) return 0;
    const m=tf.match(/^(\d+(?:\.\d+)?)\s*(m|h|D|W)$/i);
    if(!m) return 0;
    const n=parseFloat(m[1]);
    const u=m[2].toUpperCase();
    if(u==='M') return n;
    if(u==='H') return n*60;
    if(u==='D') return n*60*24;
    if(u==='W') return n*60*24*7;
    return 0;
  }

  const mins=toMin(activeTf);
  let verdict='';
  if(mins>0){
    if(mins<5) verdict='⚡ scalper';
    else if(mins<60) verdict='🔥 intraday';
    else if(mins<1440) verdict='📈 swing';
    else verdict='🏔 position trader';
  }

  if(el){
    el.textContent=verdict;
    el.style.color=verdict?'#1D9E75':'#555';
  }
}

function ljSyncActualNotional(marginVal){
  const s=gs();
  const leverage=s.SPOT?1:s.LEV;
  const mar=parseFloat(marginVal)||0;
  const nEl=document.getElementById('lj-actual-not');
  if(!nEl) return;
  if(mar>0) nEl.value=(s.SPOT?mar:mar*leverage).toFixed(2);
  else nEl.value='';
}

function ljShowLockModal(m, tno, draft=null){
  const s=gs();
  const tLabel=getTL(m,tno);
  const mLabel=getML(m);
  const leverage=s.SPOT?1:s.LEV;
  const feeRate=s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker;
  const funding=s.FEE.funding;
  const holds=s.FEE.holds;

  // get ACTUAL simulated values for this specific trade slot
  // t.not = notional at this point in simulation (carry-forward aware)
  // t.am  = margin at this point
  const months=sim();
  const mo=months.find(x=>x.m===m);
  const tr=mo?mo.trades.find(t=>t.no===tno):null;
  const tgt=tr?tr.tgt:0;
  const mode=s.SPOT?'spot':'leverage';

  // use simulated notional/margin if available, fall back to base setting
  const notional=tr?tr.not:s.NOT;
  const margin=tr?tr.am:(s.SPOT?s.NOT:s.NOT/leverage);

  _ljPending={m,tno};
  _ljFundingData={rates:[],total:0,fetched:false,fetching:false,_key:''}; // reset each modal open
  if(_ljFundTimer){clearTimeout(_ljFundTimer);_ljFundTimer=null;}
  window._ljExFeeRate=null; // reset to cockpit fee rate
  window._ljSide=null; // reset side — user must pick
  window._ljPair=tLabel.replace(/[\s\/]/g,'').toUpperCase();
  // sync exchange from cockpit fee setting
  const _exSel=document.getElementById('fee-exchange');
  window._ljExchange=_exSel?_exSel.value:'binance';

  const cockpitEx=document.getElementById('fee-exchange')?.value||'binance';
  // calculate row number
  const _presetName=window._ACTIVE_PRESET?window._ACTIVE_PRESET.name:null;
  const _defaultFolder=_presetName?_folderByPreset(_presetName):JN.folders[0];
  const _jnFolder=draft?JN.folders.find(f=>JN.trades[f.id]&&JN.trades[f.id].find(t=>t.id===draft.id)):_defaultFolder;
  const _jnTrades=_jnFolder?JN.trades[_jnFolder.id]||[]:[];
  // if editing a draft, show its actual position; otherwise show next row number
  const _draftIdx=draft?_jnTrades.findIndex(t=>t.id===draft.id):-1;
  const _rowNo=_draftIdx>=0?(_draftIdx+1):(_jnTrades.filter(t=>t.status!=='draft').length+1);
  // store selected folder id for use when saving
  window._ljSelectedFolderId=_jnFolder?_jnFolder.id:null;
  const box=document.getElementById('lj-box');
  box.innerHTML=`
    <!-- HEADER -->
    <div class="lj-title">🔒 Log Trade to Journal</div>
    <div class="lj-sub">
      <span style="color:#888">folder:</span>
      <select id="lj-folder-sel" onchange="window._ljSelectedFolderId=this.value" style="background:#111;border:0.5px solid #333;border-radius:4px;color:#00c47a;font-size:10px;font-weight:700;padding:1px 6px;font-family:inherit;cursor:pointer;outline:none">
        ${JN.folders.map(f=>`<option value="${f.id}"${f.id===(_jnFolder?_jnFolder.id:'')?' selected':''}>${escHtml(f.name)}</option>`).join('')}
      </select>
      <span style="color:#555;margin:0 6px">·</span>
      <span style="color:#888">month:</span> <b style="color:#ccc">${escHtml(mLabel)}</b>
      <span style="color:#555;margin:0 6px">·</span>
      <span style="color:#888">trade:</span> <b style="color:#ccc">${escHtml(tLabel)}</b>
      <span style="color:#555;margin:0 6px">·</span>
      <span style="font-size:9px;background:rgba(91,127,255,0.1);color:#5b7fff;padding:1px 7px;border-radius:3px;border:1px solid rgba(91,127,255,0.2);font-weight:700">row #${_rowNo}</span>
    </div>

    <!-- ROW 1: COCKPIT DATA (70%) + SIDE/TF (30%) -->
    <div style="display:grid;grid-template-columns:7fr 3fr;gap:12px;margin-bottom:16px;align-items:stretch">
      <!-- cockpit data (70%) -->
      <div style="background:#0f0f0f;border:1px solid #1e1e1e;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:12px">
        <!-- 4-col grid: top row + exit type row all in same grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
          <div><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">mode (lev)</div>
            <div style="font-size:11px;font-weight:700;color:#aaa">${s.SPOT?'spot ◈':`leverage · ${leverage}×`}</div>
          </div>
          <div><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">proj. notional</div><div style="font-size:11px;font-weight:700;color:#888">$${Math.round(notional).toLocaleString('en-US')}</div></div>
          <div><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">proj. margin</div><div style="font-size:11px;font-weight:700;color:#888">$${Math.round(margin).toLocaleString('en-US')}</div></div>
          <div><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">target</div><div style="font-size:11px;font-weight:700;color:#00c47a">${tgt.toFixed(2)}%</div></div>
          <!-- exit type spans first 3 cols, target col free -->
          <div style="grid-column:span 3;background:#0a0a0a;border:1px solid #252525;border-radius:6px;padding:8px">
            <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">exit type <span style="color:#e05555">*</span></div>
            <select id="lj-exit-type" onchange="ljSyncExitType(this.value)" style="width:100%;background:#0a0a0a;border:none;color:#ccc;font-size:11px;padding:2px 0;font-family:inherit;outline:none;cursor:pointer;color-scheme:dark">
              <option value="">— select exit type —</option>
              <option value="price">price-based (TP / SL / trail / partial)</option>
              <option value="signal">signal-based (flip / pullback / time)</option>
              <option value="conditional">conditional (BE / news / funding / liq%)</option>
            </select>
          </div>
          <!-- setup type in 4th col -->
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
        <!-- actual notional / margin + price exit (reserved space, no jump) -->
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
            <!-- price exit: always occupies 2 cols, content shown/hidden without layout shift -->
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
      <!-- side + timeframe ONLY (30%) -->
      <div style="background:#0f0f0f;border:1px solid #1e1e1e;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:12px">
        <!-- side -->
        <div>
          <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">side <span style="color:#e05555">*</span></div>
          ${s.SPOT
            ?`<div style="background:#0d0d0d;border:1px solid #1a1a1a;border-radius:7px;padding:8px;text-align:center">
                <div style="font-size:10px;color:#2a5a3a;font-weight:700">◈ spot — long only</div>
              </div>`
            :`<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #252525;border-radius:7px;overflow:hidden">
                <button id="ljside-long" onclick="ljSetSide('long');ljFetchFundingDebounced()" style="padding:8px 4px;border:none;background:#0d1a10;color:#00c47a;font-size:10px;font-weight:800;cursor:pointer;outline:none;font-family:inherit;letter-spacing:.05em;border-right:1px solid #252525;transition:background .12s">▲ LONG</button>
                <button id="ljside-short" onclick="ljSetSide('short');ljFetchFundingDebounced()" style="padding:8px 4px;border:none;background:#1a0d0d;color:#e05555;font-size:10px;font-weight:800;cursor:pointer;outline:none;font-family:inherit;letter-spacing:.05em;transition:background .12s">▼ SHORT</button>
              </div>
              <div id="lj-side-indicator" style="height:3px;border-radius:0 0 6px 6px;background:#00c47a;transition:all .15s;display:none"></div>`
          }
        </div>
        <!-- timeframe -->
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

    <!-- ROW 2: POSITION TIMING (left) + FUNDING SOURCE (right) -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;align-items:stretch">
      <!-- position timing -->
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
                value="${new Date(Date.now()-3600000).toISOString().slice(0,16)}"
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
                value="${new Date().toISOString().slice(0,16)}"
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
      <!-- funding data source -->
      <div style="background:#0f0f0f;border:1px solid #1e1e1e;border-radius:8px;padding:14px">
        <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;font-weight:700">funding data source${s.SPOT?' <span style="color:#2a5a3a;font-size:8px;font-weight:400">· spot — no funding</span>':''}</div>
        <div style="margin-bottom:8px">
          <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">exchange</div>
          <select id="lj-exchange" onchange="ljOnExchangeChange()"
            style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#ccc;font-size:11px;padding:8px 10px;font-family:inherit;outline:none;cursor:pointer;box-sizing:border-box;color-scheme:dark">
            <option value="binance"${cockpitEx==='binance'?' selected':''}>Binance</option>
            <option value="bybit"${cockpitEx==='bybit'?' selected':''}>Bybit</option>
            <option value="okx"${cockpitEx==='okx'?' selected':''}>OKX</option>
          </select>
        </div>
        <div style="margin-bottom:8px">
          <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">pair / symbol</div>
          <select id="lj-pair-input" onchange="window._ljPair=this.value;ljFetchFundingDebounced()"
            style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#e0e0e0;font-size:11px;font-weight:700;padding:8px 10px;font-family:inherit;outline:none;box-sizing:border-box;cursor:pointer;color-scheme:dark">
            ${(()=>{const cur=(window._ljPair||'BTCUSDT');const list=[..._LJ_COMMON_PAIRS];if(!list.includes(cur))list.unshift(cur);return list.map(p=>`<option value="${p}"${p===cur?' selected':''}>${p}</option>`).join('');})()}
          </select>
        </div>
        <!-- funding status -->
        <div id="lj-fund-status" style="padding:6px 10px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:6px;font-size:9px;color:#444;display:flex;align-items:center;gap:6px">
          <span id="lj-fund-icon" style="font-size:10px">⏳</span>
          <span id="lj-fund-msg" style="flex:1;font-size:9px">set dates → auto-fetch</span>
          <button onclick="window._ljPair=document.getElementById('lj-pair-input')?.value||window._ljPair;ljFetchFunding(true)"
            style="background:none;border:1px solid #1e1e1e;border-radius:4px;color:#555;font-size:9px;padding:2px 8px;cursor:pointer;font-family:inherit;outline:none;transition:all .15s;flex-shrink:0"
            id="lj-fund-fetch-btn">↻</button>
        </div>
      </div>
    </div>

    <!-- ENTRY / EXIT PRICES -->
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

    <!-- LIVE CALC -->
    <div class="lj-calc" id="lj-calc" style="display:none;margin-bottom:16px">
      <div class="lj-calc-row"><span class="lj-calc-lbl">gross PnL</span><span class="lj-calc-val" id="lj-gross">—</span></div>
      <div class="lj-calc-row"><span class="lj-calc-lbl" id="lj-fee-lbl">fee (entry + exit · ${feeRate}% × 2)</span><span class="lj-calc-val neg" id="lj-fee">—</span></div>
      <div class="lj-calc-row" id="lj-fund-row"><span class="lj-calc-lbl" id="lj-fund-lbl">funding <span style="color:#333;font-size:9px">(fetching live...)</span></span><span class="lj-calc-val neg" id="lj-fund">—</span></div>
      <div class="lj-calc-row" style="border-top:1px solid #1a3020;padding-top:8px;margin-top:4px">
        <span class="lj-calc-lbl" style="font-size:11px;font-weight:700;color:#6a9a7a">net PnL (all-in)</span>
        <span class="lj-calc-val" id="lj-net" style="font-size:15px">—</span>
      </div>
      <div class="lj-calc-row"><span class="lj-calc-lbl">% return on margin</span><span class="lj-calc-val" id="lj-pct" style="font-size:13px">—</span></div>
    </div>

    <!-- TV CHART PROOF — two side by side -->
    <div style="margin-bottom:14px">
      <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;font-weight:700">
        chart proof <span style="color:#e05555">*</span> <span style="color:#444;font-weight:400;text-transform:none;letter-spacing:0;font-size:9px">tradingview.com/x/… snapshot link</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:8px;color:#888;margin-bottom:4px;font-weight:600">proof open <span style="color:#e05555">*</span></div>
          <input id="lj-tv-open" type="url"
            placeholder="https://www.tradingview.com/x/…"
            style="width:100%;background:#111;border:1px solid #1e1e1e;border-radius:7px;color:#666;font-size:10px;padding:8px 10px;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color .15s"
            oninput="clearTimeout(this._vt);this._vt=setTimeout(()=>ljVerifyTvLink(this,'lj-tv-warn-open'),600)"
            onfocus="this.style.borderColor='#444'"
            onblur="this.style.borderColor=this.value&&!this.value.includes('tradingview.com/x/')?'#e05555':'#1e1e1e'">
          <div id="lj-tv-warn-open" style="display:none;font-size:9px;color:#e05555;margin-top:3px">⚠ invalid — must be a tradingview.com/x/… snapshot link</div>
          <div id="lj-tv-preview-open" style="display:none;margin-top:6px;border-radius:6px;overflow:hidden;border:1px solid #1e1e1e">
            <img style="width:100%;display:block" alt="open chart">
          </div>
        </div>
        <div>
          <div style="font-size:8px;color:#888;margin-bottom:4px;font-weight:600">proof close <span style="color:#e05555">*</span></div>
          <input id="lj-tv-close" type="url"
            placeholder="https://www.tradingview.com/x/…"
            style="width:100%;background:#111;border:1px solid #1e1e1e;border-radius:7px;color:#666;font-size:10px;padding:8px 10px;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color .15s"
            oninput="clearTimeout(this._vt);this._vt=setTimeout(()=>ljVerifyTvLink(this,'lj-tv-warn-close'),600)"
            onfocus="this.style.borderColor='#444'"
            onblur="this.style.borderColor=this.value&&!this.value.includes('tradingview.com/x/')?'#e05555':'#1e1e1e'">
          <div id="lj-tv-warn-close" style="display:none;font-size:9px;color:#e05555;margin-top:3px">⚠ invalid — must be a tradingview.com/x/… snapshot link</div>
          <div id="lj-tv-preview-close" style="display:none;margin-top:6px;border-radius:6px;overflow:hidden;border:1px solid #1e1e1e">
            <img style="width:100%;display:block" alt="close chart">
          </div>
        </div>
      </div>
    </div>

    <!-- NOTES: technical + psychological side by side -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div>
        <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">technical notes <span style="color:#2a2a2a;font-weight:400;text-transform:none;letter-spacing:0">optional</span></div>
        <textarea id="lj-notes" rows="3" placeholder="Setup, confluence, entry reason…"
          style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#aaa;font-size:11px;padding:9px 12px;font-family:inherit;outline:none;resize:vertical;line-height:1.6;box-sizing:border-box;transition:border-color .15s"
          onfocus="this.style.borderColor='#444'"
          onblur="this.style.borderColor='#252525'"></textarea>
      </div>
      <div>
        <div style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">psychological notes <span style="color:#2a2a2a;font-weight:400;text-transform:none;letter-spacing:0">optional</span></div>
        <textarea id="lj-notes-psych" rows="3" placeholder="How you felt, discipline, lessons…"
          style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#aaa;font-size:11px;padding:9px 12px;font-family:inherit;outline:none;resize:vertical;line-height:1.6;box-sizing:border-box;transition:border-color .15s"
          onfocus="this.style.borderColor='#444'"
          onblur="this.style.borderColor='#252525'"></textarea>
      </div>
    </div>

    <!-- MOOD dropdown — right above the lock button -->
    <div style="margin-bottom:14px">
      <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700">mood <span style="color:#666;font-weight:400;text-transform:none;letter-spacing:0;font-size:9px">optional · set once, permanent after lock</span></div>
      <select id="lj-mood-select" style="width:100%;background:#111;border:1px solid #252525;border-radius:7px;color:#ccc;font-size:13px;padding:9px 12px;font-family:inherit;outline:none;cursor:pointer;box-sizing:border-box;color-scheme:dark">
        <option value="">— select mood —</option>
        ${JN_EMOTIONS.map(e=>`<option value="${e}">${e} ${{'😤':'frustrated','😰':'anxious','😐':'neutral','😊':'confident','🔥':'on fire'}[e]||''}</option>`).join('')}
      </select>
    </div>

    <div id="lj-error" style="display:none;background:#2a0a0a;border:1px solid #4a1a1a;border-radius:6px;padding:8px 12px;font-size:11px;color:#e05555;margin-bottom:12px"></div>

    <!-- ACTION BUTTONS -->
    <div style="display:flex;flex-direction:column;gap:8px">

      <!-- PRIMARY: Lock button — always visible, prominent -->
      <button id="lj-lock-btn" onclick="ljConfirmLock()"
        style="width:100%;background:#00c47a;border:none;border-radius:10px;color:#000;font-size:13px;font-weight:800;padding:14px 20px;cursor:pointer;font-family:inherit;outline:none;letter-spacing:.01em;transition:all .15s"
        onmouseover="this.style.background='#00e08a'" onmouseout="this.style.background='#00c47a'">
        🔒 lock &amp; log to journal
      </button>
      <div style="font-size:9px;color:#666;text-align:center;margin-top:-4px">permanent · cannot be undone · entry + exit required</div>

      <div style="border-top:1px solid #1a1a1a;margin:4px 0"></div>

      <!-- SECONDARY: Draft button — save/update open position -->
      <button id="lj-draft-btn" onclick="ljSaveDraft()"
        style="width:100%;background:#1a1400;border:1px solid #f59e0b44;border-radius:10px;color:#f59e0b;font-size:12px;font-weight:700;padding:11px 20px;cursor:pointer;font-family:inherit;outline:none;transition:all .15s"
        onmouseover="this.style.borderColor='#f59e0b88';this.style.background='#1f1800'" onmouseout="this.style.borderColor='#f59e0b44';this.style.background='#1a1400'">
        📝 save as open position
      </button>
      <div id="lj-draft-btn-hint" style="font-size:9px;color:#666;text-align:center;margin-top:-4px">only entry price required · edit anytime · lock when closed</div>

      <!-- TERTIARY: Delete draft — only shown when editing existing draft -->
      <button id="lj-delete-draft-btn" onclick="ljDeleteDraft()" style="display:none;width:100%;background:none;border:1px solid #2a0a0a;border-radius:10px;color:#4a1a1a;font-size:11px;font-weight:700;padding:9px 20px;cursor:pointer;font-family:inherit;outline:none;transition:all .15s"
        onmouseover="this.style.borderColor='#e05555';this.style.color='#e05555'" onmouseout="this.style.borderColor='#2a0a0a';this.style.color='#4a1a1a'">
        🗑 delete this draft
      </button>
      <div id="lj-delete-draft-hint" style="display:none;font-size:9px;color:#2a2a2a;text-align:center;margin-top:-4px">removes the open position — trade not logged</div>

      <!-- CANCEL -->
      <button onclick="ljCloseModal()"
        style="width:100%;background:none;border:1px solid #1e1e1e;border-radius:10px;color:#333;font-size:11px;font-weight:600;padding:9px 20px;cursor:pointer;font-family:inherit;outline:none;transition:all .15s"
        onmouseover="this.style.borderColor='#333';this.style.color='#888'" onmouseout="this.style.borderColor='#1e1e1e';this.style.color='#333'">
        cancel
      </button>
    </div>
  `;

  document.getElementById('lj-modal').classList.add('visible');
  ljSetSide('long');
  setTimeout(()=>{
    // init date displays
    const od=document.getElementById('lj-open-dt');
    const cd=document.getElementById('lj-close-dt');
    if(od?.value) ljUpdateDtDisplay('open',od.value);
    if(cd?.value) ljUpdateDtDisplay('close',cd.value);
    // set exchange select to cockpit value
    const exSel=document.getElementById('lj-exchange');
    if(exSel) exSel.value=window._ljExchange||'binance';
    // pre-fill from draft if provided
    if(draft){
      const entryEl=document.getElementById('lj-entry');
      if(entryEl&&draft.entry) entryEl.value=draft.entry;
      if(draft.side) ljSetSide(draft.side);
      if(draft.openedAt){
        const d=new Date(draft.openedAt);
        const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
        const odEl=document.getElementById('lj-open-dt');
        if(odEl){odEl.value=iso;ljUpdateDtDisplay('open',iso);}
      }
      if(draft.tvUrlOpen){const el=document.getElementById('lj-tv-open');if(el){el.value=draft.tvUrlOpen;ljPreviewTV(draft.tvUrlOpen,'lj-tv-preview-open');}}
      if(draft.tvUrlClose){const el=document.getElementById('lj-tv-close');if(el){el.value=draft.tvUrlClose;ljPreviewTV(draft.tvUrlClose,'lj-tv-preview-close');}}
      if(draft.note){const el=document.getElementById('lj-notes');if(el) el.value=draft.note;}
      if(draft.notePsych){const el=document.getElementById('lj-notes-psych');if(el) el.value=draft.notePsych;}
      if(draft.tf){const el=document.getElementById('lj-tf');if(el){el.value=draft.tf;ljUpdateTfVerdict('preset',draft.tf);}}
      if(draft.exitType){const el=document.getElementById('lj-exit-type');if(el) el.value=draft.exitType;}
      if(draft.emotion){const el=document.getElementById('lj-mood-select');if(el) el.value=draft.emotion;}
      // update button labels + show delete
      const lockBtn=document.getElementById('lj-lock-btn');
      const draftBtn=document.getElementById('lj-draft-btn');
      const draftHint=document.getElementById('lj-draft-btn-hint');
      const delBtn=document.getElementById('lj-delete-draft-btn');
      const delHint=document.getElementById('lj-delete-draft-hint');
      const modalTitle=document.querySelector('.lj-title');
      if(lockBtn) lockBtn.textContent='🔒 close & lock to journal';
      if(draftBtn) draftBtn.textContent='📝 update open position';
      if(draftHint) draftHint.textContent='saves your changes · still editable · lock when you close the trade';
      if(delBtn){delBtn.style.display='block';}
      if(delHint){delHint.style.display='block';}
      if(modalTitle) modalTitle.textContent='📝 Open Position';
      window._ljDraftId=draft.id;
    } else {
      window._ljDraftId=null;
      // pre-fill exit type from cockpit MT state if set
      setTimeout(()=>{
        const _s=gs();const _mt=_s.MT[_ljPending.m];
        const _savedExit=_mt?.exitTypes?.[_ljPending.tno]||'';
        const _exitEl=document.getElementById('lj-exit-type');
        if(_exitEl&&_savedExit) _exitEl.value=_savedExit;
      },160);
      const lockBtn=document.getElementById('lj-lock-btn');
      const draftBtn=document.getElementById('lj-draft-btn');
      const draftHint=document.getElementById('lj-draft-btn-hint');
      const delBtn=document.getElementById('lj-delete-draft-btn');
      const delHint=document.getElementById('lj-delete-draft-hint');
      const modalTitle=document.querySelector('.lj-title');
      if(lockBtn) lockBtn.textContent='🔒 lock & log to journal';
      if(draftBtn) draftBtn.textContent='📝 save as open position';
      if(draftHint) draftHint.textContent='only entry price required · edit anytime · lock when closed';
      if(delBtn){delBtn.style.display='none';}
      if(delHint){delHint.style.display='none';}
      if(modalTitle) modalTitle.textContent='🔒 Log Trade to Journal';
    }
    const el=document.getElementById('lj-entry');if(el&&!draft) el.focus();
    if(gs().SPOT) window._ljSide='long';
    ljFetchFunding(true);
  },150);
}

function ljSetSide(side){
  window._ljSide=side;
  const lb=document.getElementById('ljside-long');
  const sb=document.getElementById('ljside-short');
  const ind=document.getElementById('lj-side-indicator');
  if(lb&&sb){
    lb.style.background=side==='long'?'#0a2a14':'#0d0d0d';
    lb.style.opacity=side==='long'?'1':'0.4';
    sb.style.background=side==='short'?'#2a0a0a':'#0d0d0d';
    sb.style.opacity=side==='short'?'1':'0.4';
  }
  if(ind){
    ind.style.display='block';
    ind.style.background=side==='long'?'#00c47a':'#e05555';
  }
  ljCalc();
}

function ljCalc(){
  const entry=parseFloat(document.getElementById('lj-entry')?.dataset.raw)||0;
  const exit=parseFloat(document.getElementById('lj-exit')?.dataset.raw)||0;
  if(!entry||!exit){document.getElementById('lj-calc').style.display='none';return;}

  const s=gs();
  const leverage=s.SPOT?1:s.LEV;
  const side=window._ljSide||'long';
  // use exchange-specific fee rate — spot vs futures rates differ
  const _exFeePreset=FEE_PRESETS[s.SPOT?'spot':'futures'][document.getElementById('lj-exchange')?.value||'binance']||FEE_PRESETS[s.SPOT?'spot':'futures'].binance;
  const _exFeeBase=window._ljExFeeRate!=null?window._ljExFeeRate:(s.FEE.method==='maker'?_exFeePreset.maker:_exFeePreset.taker);
  const feeRate=_exFeeBase/100;
  // use simulated notional for this specific trade slot (carry-forward aware)
  const {m,tno}=_ljPending;
  const _months=sim();
  const _mo=_months.find(x=>x.m===m);
  const _tr=_mo?_mo.trades.find(t=>t.no===tno):null;
  const _simNotional=_tr?_tr.not:s.NOT;
  const _simMargin=_tr?_tr.am:(s.SPOT?s.NOT:s.NOT/leverage);
  const _actualNotInput=parseFloat(document.getElementById('lj-actual-not')?.dataset.raw||'')||0;
  const notional=_actualNotInput>0?_actualNotInput:_simNotional;
  const margin=_actualNotInput>0?(_actualNotInput/leverage):_simMargin;
  // spot: price always goes up or down regardless of side label — only long makes sense
  const priceDiff=s.SPOT?(exit-entry):(side==='long'?exit-entry:entry-exit);
  const grossPnl=(priceDiff/entry)*notional;
  const feePaid=notional*feeRate*2;
  // spot has NO funding — perpetuals only
  const fundingNet=s.SPOT?0
    :(_ljFundingData.fetched&&_ljFundingData.rates.length>0)
      ?_ljFundingData.total
      :notional*(s.FEE.funding/100)*s.FEE.holds;
  const fundingPaid=Math.max(0,fundingNet);
  const fundingRecv=Math.max(0,-fundingNet);
  const netPnl=grossPnl-feePaid-fundingNet;
  const pct=(netPnl/margin)*100;

  const c=document.getElementById('lj-calc');
  c.style.display='block';
  const fmt2=v=>(v>=0?'+':'')+v.toFixed(4);
  document.getElementById('lj-gross').textContent='$'+fmt2(grossPnl);
  document.getElementById('lj-gross').className='lj-calc-val '+(grossPnl>=0?'':'neg');
  document.getElementById('lj-fee').textContent='-$'+feePaid.toFixed(4);
  const fundEl=document.getElementById('lj-fund');
  const fundRow=document.getElementById('lj-fund-row');
  if(s.SPOT){
    // spot: hide funding row entirely
    if(fundRow) fundRow.style.display='none';
  } else {
    if(fundRow) fundRow.style.display='';
    if(fundEl){
      const liveTag=(_ljFundingData.fetched&&_ljFundingData.rates.length>0)?' ✓':'';
      if(fundingRecv>0){
        fundEl.textContent='+$'+fundingRecv.toFixed(4)+liveTag+' (received)';
        fundEl.className='lj-calc-val';
      } else {
        fundEl.textContent='-$'+fundingPaid.toFixed(4)+liveTag;
        fundEl.className='lj-calc-val neg';
      }
    }
  }
  document.getElementById('lj-net').textContent='$'+fmt2(netPnl);
  document.getElementById('lj-net').className='lj-calc-val '+(netPnl>=0?'':'neg');
  document.getElementById('lj-pct').textContent=(pct>=0?'+':'')+pct.toFixed(3)+'%';
  document.getElementById('lj-pct').className='lj-calc-val '+(pct>=0?'':'neg');
}

// full pair lists per exchange — populated on first use
var _ljPairLists={binance:null,bybit:null,okx:null};

// common USDT perp pairs — used as instant fallback, no CORS issues
var _LJ_COMMON_PAIRS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','MATICUSDT','SUIUSDT','APTUSDT','ARBUSDT','OPUSDT','INJUSDT','TIAUSDT','SEIUSDT','STXUSDT','WLDUSDT','RUNEUSDT','ATOMUSDT','NEARUSDT','DOTUSDT','UNIUSDT','AAVEUSDT','LTCUSDT','BCHUSDT','FILUSDT','ICPUSDT','LDOUSDT','MOODENGUSDT','PEPEUSDT','SHIBUSDT','FLOKIUSDT','BONKUSDT','WIFUSDT','NEIROUSDT','POPCATUSDT','EIGENUSDT','PENDLEUSDT','JUPUSDT','PYTHUSDT','RENDERUSDT','FETUSDT','AGIXUSDT','TAOUSDT','ENSUSDT','GMXUSDT','DYDXUSDT','MKRUSDT','COMPUSDT','CRVUSDT','SNXUSDT','1000PEPEUSDT','1000BONKUSDT','1000SHIBUSDT','NOTUSDT','TONUSDT','TRXUSDT','XLMUSDT','VETUSDT','EOSUSDT','ALGOUSDT','EGLDUSDT','FLOWUSDT','HBARUSDT','SANDUSDT','MANAUSDT','AXSUSDT','GALAUSDT','IMXUSDT','LRCUSDT','ZRXUSDT','BATUSDT','COTIUSDT','KSMUSDT','KAVAUSDT','IOTAUSDT','ONTUSDT','WAVESUSDT','QTUMUSDT','ZENUSDT','DASHUSDT','XMRUSDT','ZECUSDT','ETCUSDT','NEOUSDT','IOSTUSDT','ZILUSDT','STMXUSDT','CELOUSDT','ANKRUSDT','HNTUSDT','CKBUSDT','STPTUSDT','SFPUSDT','BAKEUSDT','HOTUSDT','CTKUSDT','ROSEUSDT','NUUSDT'].sort();

async function ljFetchAllPairs(exchange){
  if(_ljPairLists[exchange]&&_ljPairLists[exchange].length>20) return _ljPairLists[exchange];
  // start with common pairs immediately so dropdown is instant
  if(!_ljPairLists[exchange]) _ljPairLists[exchange]=[..._LJ_COMMON_PAIRS];
  // try to fetch full list in background (may fail due to CORS on some exchanges)
  try{
    if(exchange==='binance'){
      const r=await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
      const d=await r.json();
      const pairs=(d.symbols||[]).filter(s=>s.status==='TRADING'&&s.quoteAsset==='USDT').map(s=>s.baseAsset+'USDT').sort();
      if(pairs.length>20) _ljPairLists[exchange]=pairs;
    } else if(exchange==='bybit'){
      const r=await fetch('https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000');
      const d=await r.json();
      const pairs=(d.result?.list||[]).filter(s=>s.quoteCoin==='USDT').map(s=>s.symbol).sort();
      if(pairs.length>20) _ljPairLists[exchange]=pairs;
    } else if(exchange==='okx'){
      const r=await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
      const d=await r.json();
      const pairs=(d.data||[]).filter(s=>s.settleCcy==='USDT').map(s=>s.ctValCcy+'USDT').sort();
      if(pairs.length>20) _ljPairLists[exchange]=pairs;
    }
  }catch(e){/* keep common pairs fallback */}
  return _ljPairLists[exchange];
}

function ljPopulatePairSelect(exchange, currentPair){
  const sel=document.getElementById('lj-pair-input');
  if(!sel) return;
  const list=_ljPairLists[exchange]||_LJ_COMMON_PAIRS;
  const cur=(currentPair||window._ljPair||'BTCUSDT').toUpperCase();
  // ensure current pair is in list
  const allPairs=list.includes(cur)?list:[cur,...list];
  sel.innerHTML=allPairs.map(p=>`<option value="${p}"${p===cur?' selected':''}>${p}</option>`).join('');
  sel.value=cur;
  window._ljPair=cur;
}

async function ljOnExchangeChange(){
  const ex=document.getElementById('lj-exchange')?.value||'binance';
  const s=gs();
  // start with hardcoded preset as immediate fallback
  const exFees=FEE_PRESETS[s.SPOT?'spot':'futures'][ex]||(s.SPOT?FEE_PRESETS.spot.binance:FEE_PRESETS.futures.binance);
  let exFeeRate=s.FEE.method==='maker'?exFees.maker:exFees.taker;
  window._ljExFeeRate=exFeeRate;
  // update cockpit fee cell immediately with preset
  const feeRateVal=document.getElementById('lj-fee-rate-val');
  const feeExVal=document.getElementById('lj-fee-ex-val');
  if(feeRateVal) feeRateVal.textContent=`${exFeeRate}% ${s.FEE.method}`;
  if(feeExVal) feeExVal.textContent=ex;
  // update fee label in calc
  const feeLbl=document.getElementById('lj-fee-lbl');
  if(feeLbl) feeLbl.textContent=`fee (entry + exit · ${exFeeRate}% × 2)`;
  // try to fetch live fee from exchange API
  try{
    let liveFee=null;
    if(ex==='binance'){
      const r=await fetch('https://fapi.binance.com/fapi/v1/commissionRate?symbol='+(window._ljPair||'BTCUSDT'),{headers:{'X-MBX-APIKEY':''}});
      // Binance commissionRate requires auth — use preset
    } else if(ex==='bybit'){
      const sym=(window._ljPair||'BTCUSDT');
      const r=await fetch(`https://api.bybit.com/v5/account/fee-rate?category=linear&symbol=${sym}`);
      const d=await r.json();
      if(d.result?.list?.[0]){
        const row=d.result.list[0];
        liveFee=s.FEE.method==='maker'?parseFloat(row.makerFeeRate)*100:parseFloat(row.takerFeeRate)*100;
      }
    } else if(ex==='okx'){
      const r=await fetch('https://www.okx.com/api/v5/account/trade-fee?instType=SWAP&instId='+(window._ljPair||'BTC-USDT-SWAP').replace('USDT','-USDT-SWAP'));
      const d=await r.json();
      if(d.data?.[0]){
        liveFee=s.FEE.method==='maker'?Math.abs(parseFloat(d.data[0].maker)*100):Math.abs(parseFloat(d.data[0].taker)*100);
      }
    }
    if(liveFee&&liveFee>0&&liveFee<1){
      exFeeRate=Math.round(liveFee*10000)/10000;
      window._ljExFeeRate=exFeeRate;
      if(feeRateVal) feeRateVal.textContent=`${exFeeRate}% ${s.FEE.method} ✓live`;
      if(feeLbl) feeLbl.textContent=`fee (entry + exit · ${exFeeRate}% × 2 · live)`;
    }
  }catch(e){/* use preset fallback silently */}
  const statusEl=document.getElementById('lj-fund-msg');
  if(statusEl) statusEl.textContent='loading pairs for '+ex+'...';
  await ljFetchAllPairs(ex);
  ljPopulatePairSelect(ex, window._ljPair||'');
  ljFetchFundingDebounced();
  ljCalc();
}

function ljShowPairDrop(query,force){
  const wrap=document.getElementById('lj-pair-wrap')||document.querySelector('.lj-pair-wrap');
  let drop=document.getElementById('lj-pair-drop');
  if(!drop){drop=document.createElement('div');drop.id='lj-pair-drop';drop.className='lj-pair-dropdown';if(wrap)wrap.appendChild(drop);}
  const q=(query||'').toLowerCase().replace(/usdt$/,'').replace(/usd$/,'');
  const filtered=typeof TP_PAIRS!=='undefined'
    ?TP_PAIRS.filter(p=>!q||p.symbol.toLowerCase().includes(q)||p.name.toLowerCase().includes(q)||p.icon.toLowerCase().includes(q)).slice(0,12)
    :[];
  if(!filtered.length){drop.style.display='none';return;}
  drop.style.display='block';
  drop.innerHTML=filtered.map(p=>`
    <div class="lj-pair-opt" onclick="ljSelectPair('${p.symbol}','${p.name}','${p.icon}')">
      <span class="lj-pair-icon">${p.icon}</span>
      <span style="font-weight:700;color:#ccc">${p.symbol}</span>
      <span class="lj-pair-name">${p.name}</span>
    </div>`).join('');
}

function ljSelectPair(symbol){
  const inp=document.getElementById('lj-pair-input');
  if(inp){inp.value=symbol;inp.style.borderColor='#00c47a';setTimeout(()=>inp.style.borderColor='#252525',600);}
  window._ljPair=symbol;
  document.getElementById('lj-pair-drop')?.remove();
  ljFetchFunding(true);
}

function ljPreviewTV(url, wrapId){
  const wrap=document.getElementById(wrapId||'lj-tv-preview-open');
  if(!wrap) return;
  const img=wrap.querySelector('img');
  if(!img) return;
  if(url&&url.includes('tradingview.com/x/')){
    img.src=url;
    img.onerror=()=>{wrap.style.display='none';};
    img.onload=()=>{wrap.style.display='block';};
    wrap.style.display='block';
  } else {
    wrap.style.display='none';
  }
}

async function ljConfirmLock(){
  const s=gs();
  const {m,tno}=_ljPending;
  const entry=parseFloat(document.getElementById('lj-entry')?.dataset.raw)||0;
  const exit=parseFloat(document.getElementById('lj-exit')?.dataset.raw)||0;
  // validation
  const errEl=document.getElementById('lj-error');
  const _tfSelV=document.getElementById('lj-tf')?.value||'';
  const _tfCustomV=document.getElementById('lj-tf-custom')?.value||'';
  const _tfVal=_tfCustomV||_tfSelV;
  const _tvOpen=(document.getElementById('lj-tv-open')?.value||'').trim();
  const _tvClose=(document.getElementById('lj-tv-close')?.value||'').trim();
  const _side=window._ljSide||null;
  if(!_side&&!gs().SPOT){
    if(errEl){errEl.textContent='⚠ Pick your side first — LONG or SHORT';errEl.style.display='block';}
    document.getElementById('ljside-long')?.focus();
    return;
  }
  if(!entry||!exit){
    if(errEl){errEl.textContent='⚠ Entry price and exit price are required';errEl.style.display='block';}
    if(!entry){const el=document.getElementById('lj-entry');if(el){el.style.borderColor='#e05555';el.focus();}}
    else{const el=document.getElementById('lj-exit');if(el){el.style.borderColor='#e05555';el.focus();}}
    return;
  }
  if(!_tfVal){
    if(errEl){errEl.textContent='⚠ Timeframe is required — pick a preset or type custom';errEl.style.display='block';}
    document.getElementById('lj-tf')?.focus();
    return;
  }
  const _exitType=document.getElementById('lj-exit-type')?.value||'';
  if(!_exitType){
    if(errEl){errEl.textContent='⚠ Exit type is required — select price, signal or conditional';errEl.style.display='block';}
    document.getElementById('lj-exit-type')?.focus();
    return;
  }
  if(!_tvOpen&&!_tvClose){
    if(errEl){errEl.textContent='⚠ At least one chart proof (open or close) is required';errEl.style.display='block';}
    document.getElementById('lj-tv-open')?.focus();
    return;
  }
  if(errEl) errEl.style.display='none';
  const leverage=s.SPOT?1:s.LEV;
  const side=window._ljSide||'long';
  // use exchange-specific fee rate if user changed exchange in modal
  const _exFees=window._ljExFeeRate!=null?window._ljExFeeRate:(s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker);
  const feeRate=_exFees/100;
  const funding=s.FEE.funding/100;
  const holds=s.FEE.holds;
  const tvUrlOpen=(document.getElementById('lj-tv-open')?.value||'').trim();
  const tvUrlClose=(document.getElementById('lj-tv-close')?.value||'').trim();
  const tvUrl=tvUrlOpen||tvUrlClose; // legacy fallback
  const notes=document.getElementById('lj-notes')?.value||'';
  const notePsych=document.getElementById('lj-notes-psych')?.value||'';
  const exitType=document.getElementById('lj-exit-type')?.value||'';
  const _tfSel=document.getElementById('lj-tf')?.value||'';
  const _tfCustom=document.getElementById('lj-tf-custom')?.value||'';
  const tf=_tfCustom||_tfSel;
  const emotion=document.getElementById('lj-mood-select')?.value||'';
  const dateVal=document.getElementById('lj-close-dt')?.value||document.getElementById('lj-date')?.value||new Date().toISOString().slice(0,16);

  // use actual notional/margin if user overrode them, else fall back to sim
  const _simMonths=sim();
  const _simMo=_simMonths.find(x=>x.m===m);
  const _simTr=_simMo?_simMo.trades.find(t=>t.no===tno):null;
  const _projNotional=_simTr?_simTr.not:s.NOT;
  const _projMargin=_simTr?_simTr.am:(s.SPOT?s.NOT:s.NOT/leverage);
  const _actualNotInput=parseFloat(document.getElementById('lj-actual-not')?.dataset.raw||'')||0;
  // actual margin is always derived from actual notional
  const notional=_actualNotInput||_projNotional;
  const margin=_actualNotInput?(s.SPOT?_actualNotInput:_actualNotInput/leverage):_projMargin;
  const hasActualOverride=!!_actualNotInput;
  let grossPnl=0,feePaid=0,fundingPaid=0,netPnl=0,pct=0;
  if(entry&&exit){
    const priceDiff=side==='long'?exit-entry:entry-exit;
    grossPnl=(priceDiff/entry)*notional;
    feePaid=notional*feeRate*2;
    // use actual fetched funding if available
    // spot has no funding; perps use fetched data or estimate
    const _fundNet=s.SPOT?0
      :(_ljFundingData.fetched&&_ljFundingData.rates.length>0
        ?_ljFundingData.total
        :notional*funding*holds);
    fundingPaid=_fundNet;
    netPnl=grossPnl-feePaid-fundingPaid;
    pct=(netPnl/margin)*100;
  }

  // get cockpit data from sim
  const months=sim();
  const mo=months.find(x=>x.m===m);
  const tr=mo?mo.trades.find(t=>t.no===tno):null;
  const tLabel=getTL(m,tno)||('trade '+tno);

  // find or create journal folder — use selected folder from dropdown, or active preset, or first folder
  let folder=null;
  if(window._ljSelectedFolderId){
    folder=JN.folders.find(f=>f.id===window._ljSelectedFolderId);
  }
  if(!folder&&window._ACTIVE_PRESET){
    folder=_getOrCreatePresetFolder(window._ACTIVE_PRESET.name);
  }
  if(!folder) folder=JN.folders[0];
  if(!folder){
    const color=JN_COLORS[JN.folders.length%JN_COLORS.length];
    const presetName=window._ACTIVE_PRESET?window._ACTIVE_PRESET.name:'default';
    folder={id:'f'+Date.now(),name:presetName,color,type:s.SPOT?'spot':'lev',tags:[s.SPOT?'spot':'leverage'],createdAt:Date.now()};
    JN.folders.push(folder);
    JN.trades[folder.id]=[];
  }

  // find current "month bucket" — group of 10, new group when current has 10
  const existingTrades=JN.trades[folder.id]||[];
  const activeBucket=Math.floor(existingTrades.length/10)+1;

  const trade={
    id:'t'+Date.now(),
    pair:tLabel.replace(/\s+/g,'').toUpperCase(),
    side,
    leverage,
    size:notional,
    entry,exit,
    pnl:netPnl,
    fee:feePaid,
    funding:fundingPaid,
    pct,
    type:s.SPOT?'spot':'perpetual',
    closedAt:new Date(dateVal).getTime()||Date.now(),
    openedAt:new Date(document.getElementById('lj-open-dt')?.value||dateVal).getTime()||Date.now(),
    note:notes,
    notePsych,
    tf,
    exitType,
    setupType:document.getElementById('lj-setup-type')?.value||'',
    sl:parseFloat(document.getElementById('lj-sl')?.dataset.raw)||null,
    rr:(()=>{const rrEl=document.getElementById('lj-rr-display');return rrEl&&rrEl.textContent.startsWith('1 :')?rrEl.textContent:null;})(),
    emotion,
    source:'cockpit',
    tvUrl,
    tvUrlOpen,
    tvUrlClose,
    bucket:activeBucket,
    // cockpit specifics
    cockpit:{
      tab:TAB, month:m, tradeNo:tno,
      monthLabel:getML(m),
      target:tr?tr.tgt:0,
      projNotional:_projNotional, actualNotional:_actualNotInput||null,
      projMargin:_projMargin, actualMargin:_actualNotInput?(_actualNotInput/(s.SPOT?1:leverage)):_projMargin,
      hasActualOverride,
      feePaid:tr?tr.feePaid:0, netPnl:tr?tr.cp-(tr.feePaid||0):0,
      liq:tr?tr.liq:0, lev:leverage,
      mode:s.SPOT?'spot':'leverage',
      feeMethod:s.FEE.method, feeRate:feeRate*100
    },
    tags:[side,s.SPOT?'spot':'lev','cockpit']
  };

  JN.trades[folder.id].unshift(trade);

  // if closing a draft — remove it from journal first
  if(window._ljDraftId){
    for(const fid of Object.keys(JN.trades||{})){
      const idx=(JN.trades[fid]||[]).findIndex(t=>t.id===window._ljDraftId);
      if(idx!==-1){JN.trades[fid].splice(idx,1);break;}
    }
    window._ljDraftId=null;
  }

  await jnSave();
  // refresh cockpit simulation immediately to show actual overlay
  if(typeof render==='function') setTimeout(render,50);

  // now actually lock in cockpit
  s.LK.add(m+'-'+tno);
  try{localStorage.setItem('batt_'+TAB+'_lk',JSON.stringify({LK:[...s.LK]}));}catch(e){}
  const _pr=document.querySelector('.panel-right');
  const _sy=_pr?_pr.scrollTop:0;
  softUpdate();
  if(_pr) requestAnimationFrame(()=>{ _pr.scrollTop=_sy; });
  _autoResaveActivePreset();
  _silentCloudSync();

  ljCloseModal();
  showToast(`🔒 locked & logged to "${presetName}"`, 'success', 2500);
}

function ljCloseModal(){
  document.getElementById('lj-modal').classList.remove('visible');
}

// ── DRAFT TRADES (open positions) ──

function ljGetDraftKey(m, tno){
  return TAB+'-'+m+'-'+tno;
}

function ljFindDraft(m, tno){
  // no active preset = no draft context — never show drafts without preset
  if(!window._ACTIVE_PRESET) return null;
  const activeFolderId=(_folderByPreset(window._ACTIVE_PRESET.name)||{}).id;
  if(!activeFolderId) return null;
  const found=(JN.trades[activeFolderId]||[]).find(t=>
    t.status==='draft'&&t.cockpit&&
    t.cockpit.tab===TAB&&t.cockpit.month===m&&t.cockpit.tradeNo===tno
  );
  return found?{trade:found,folderId:activeFolderId}:null;
}

async function ljDeleteDraft(){
  const draftId=window._ljDraftId;
  if(!draftId){ljCloseModal();return;}
  // remove from JN
  for(const fid of Object.keys(JN.trades||{})){
    const idx=(JN.trades[fid]||[]).findIndex(t=>t.id===draftId);
    if(idx!==-1){
      JN.trades[fid].splice(idx,1);
      break;
    }
  }
  window._ljDraftId=null;
  await jnSave();
  // refresh cockpit so 📝 button goes back to ○
  if(typeof softUpdate==='function') softUpdate();
  ljCloseModal();
  showToast('🗑 Draft deleted — trade removed','info',2000);
}

function _ljDraftContinue(){
  ljSaveDraftCore();
}
async function ljSaveDraft(){
  ljShowTvReminder(()=>ljSaveDraftCore(), true);
}
async function ljSaveDraftCore(){
  const s=gs();
  const {m,tno}=_ljPending;
  const entry=parseFloat(document.getElementById('lj-entry')?.dataset.raw)||0;
  const errEl=document.getElementById('lj-error');
  if(!entry){
    const el=document.getElementById('lj-entry');
    if(el){el.style.borderColor='#e05555';el.focus();}
    if(errEl){errEl.textContent='⚠ Entry price is required to save draft';errEl.style.display='block';}
    return;
  }
  // side required for draft
  if(!window._ljSide&&!s.SPOT){
    if(errEl){errEl.textContent='⚠ Pick your side first — LONG or SHORT';errEl.style.display='block';}
    document.getElementById('ljside-long')?.focus();
    return;
  }
  // chart proof open required for draft
  const _tvOpen=(document.getElementById('lj-tv-open')?.value||'').trim();
  if(!_tvOpen||!_tvOpen.includes('tradingview.com/x/')){
    if(errEl){errEl.textContent='⚠ Chart proof (open) is required — grab your TradingView snapshot link';errEl.style.display='block';}
    document.getElementById('lj-tv-open')?.focus();
    return;
  }
  if(errEl) errEl.style.display='none';
  if(!window._ACTIVE_PRESET){
    showToast('⚠ Load or save a preset first','info',2500);
    return;
  }

  const leverage=s.SPOT?1:s.LEV;
  const side=window._ljSide||'long';
  const tvUrlOpen=(document.getElementById('lj-tv-open')?.value||'').trim();
  const tvUrlClose=(document.getElementById('lj-tv-close')?.value||'').trim();
  const notes=document.getElementById('lj-notes')?.value||'';
  const notePsych=document.getElementById('lj-notes-psych')?.value||'';
  const exitType=document.getElementById('lj-exit-type')?.value||'';
  const setupType=document.getElementById('lj-setup-type')?.value||'';
  const _tfSel=document.getElementById('lj-tf')?.value||'';
  const _tfCustom=document.getElementById('lj-tf-custom')?.value||'';
  const tf=_tfCustom||_tfSel;
  const emotion=document.getElementById('lj-mood-select')?.value||'';
  const openDateVal=document.getElementById('lj-open-dt')?.value||new Date().toISOString().slice(0,16);
  const tLabel=getTL(m,tno)||('trade '+tno);
  const _simMonths=sim();
  const _simMo=_simMonths.find(x=>x.m===m);
  const _simTr=_simMo?_simMo.trades.find(t=>t.no===tno):null;
  const notional=_simTr?_simTr.not:s.NOT;

  // find or create folder — use selected folder from dropdown
  let folder=null;
  if(window._ljSelectedFolderId){
    folder=JN.folders.find(f=>f.id===window._ljSelectedFolderId);
  }
  if(!folder&&window._ACTIVE_PRESET){
    folder=_getOrCreatePresetFolder(window._ACTIVE_PRESET.name);
  }
  if(!folder) folder=JN.folders[0];
  if(!folder){
    const color=JN_COLORS[JN.folders.length%JN_COLORS.length];
    const presetName=window._ACTIVE_PRESET?window._ACTIVE_PRESET.name:'default';
    folder={id:'f'+Date.now(),name:presetName,color,type:s.SPOT?'spot':'lev',tags:[],createdAt:Date.now()};
    JN.folders.push(folder);
    JN.trades[folder.id]=[];
  }
  if(!JN.trades[folder.id]) JN.trades[folder.id]=[];

  // check if draft already exists for this slot — update it
  const existing=ljFindDraft(m,tno);
  if(existing){
    // update existing draft
    const t=existing.trade;
    t.entry=entry;
    t.side=side;
    t.leverage=leverage;
    t.size=notional;
    t.openedAt=new Date(openDateVal).getTime()||Date.now();
    t.tvUrlOpen=tvUrlOpen||t.tvUrlOpen;
    t.tvUrlClose=tvUrlClose||t.tvUrlClose;
    if(notes) t.note=notes;
    if(notePsych) t.notePsych=notePsych;
    if(tf) t.tf=tf;
    if(exitType) t.exitType=exitType;
    if(setupType) t.setupType=setupType;
    t.updatedAt=Date.now();
    await jnSave();
    ljCloseModal();
    showToast('📝 Open position updated','success',2000);
    return;
  }

  // create new draft
  const draft={
    id:'t'+Date.now(),
    status:'draft',
    pair:tLabel.replace(/\s+/g,'').toUpperCase(),
    side, leverage,
    size:notional,
    entry, exit:null,
    pnl:null, fee:null, funding:null, pct:null,
    openedAt:new Date(openDateVal).getTime()||Date.now(),
    closedAt:null,
    note:notes,
    noteLog:[],
    emotion,
    tvUrlOpen, tvUrlClose,
    tvUrl:tvUrlOpen||'',
    source:'cockpit',
    cockpit:{
      tab:TAB, month:m, tradeNo:tno,
      monthLabel:getML(m),
      lev:leverage, mode:s.SPOT?'spot':'leverage'
    },
    createdAt:Date.now(),
    updatedAt:Date.now()
  };

  JN.trades[folder.id].push(draft);
  await jnSave();
  ljCloseModal();
  if(typeof render==='function') render();
  showToast('📝 Saved as open position — lock when closed','success',3000);
}

function ljOpenDraftToClose(tradeId, folderId){
  // find the draft
  const t=(JN.trades[folderId]||[]).find(x=>x.id===tradeId);
  if(!t||t.status!=='draft') return;
  // set pending context
  _ljPending={m:t.cockpit.month, tno:t.cockpit.tradeNo};
  // open the modal — it will pre-fill from draft
  ljShowLockModal(t.cockpit.month, t.cockpit.tradeNo, t);
}

async function ljConfirmUnlock(m, tno, key){
  const ok=await showConfirm({
    icon:'🔓',type:'info',
    title:'Unlock trade?',
    message:'Remove from journal too, or keep the journal entry?',
    confirmText:'unlock only',
    cancelText:'unlock + remove from journal'
  });
  // ok=true means "unlock only", false/null = "unlock + remove"
  const s=gs();
  s.LK.delete(key);
  try{localStorage.setItem('batt_'+TAB+'_lk',JSON.stringify({LK:[...s.LK]}));}catch(e){}

  if(ok===false||ok===null){
    // remove from journal — find by cockpit reference
    const presetName=window._ACTIVE_PRESET?.name;
    if(presetName){
      const folder=_folderByPreset(presetName);
      if(folder&&JN.trades[folder.id]){
        JN.trades[folder.id]=JN.trades[folder.id].filter(t=>
          !(t.source==='cockpit'&&t.cockpit&&t.cockpit.tab===TAB&&t.cockpit.month===m&&t.cockpit.tradeNo===tno)
        );
        await jnSave();
        showToast('Unlocked & removed from journal','info',2000);
      }
    }
  } else {
    showToast('Unlocked — journal entry kept','info',2000);
  }

  const _pr=document.querySelector('.panel-right');
  const _sy=_pr?_pr.scrollTop:0;
  softUpdate();
  if(_pr) requestAnimationFrame(()=>{ _pr.scrollTop=_sy; });
  _autoResaveActivePreset();
  _silentCloudSync();
}

// debounced silent cloud sync — batches rapid lock/unlock actions into one call
function _silentCloudSyncNow(){
  // immediate sync — no debounce, used for critical saves like slot changes
  const _tok=(typeof AUTH_TOKEN!=='undefined'?AUTH_TOKEN:null)||localStorage.getItem('batt_token');
  if(!_tok) return;
  if(_silentSyncTimer) clearTimeout(_silentSyncTimer);
  _silentSyncTimer=null;
  _setSyncStatus('saving');
  (async function(){
    try{
      const snapshot={};
      ['36','q',...(typeof CUSTOM_TABS!=='undefined'?CUSTOM_TABS.map(t=>t.id):[])].forEach(id=>{
        if(!S||!S[id])return;
        const s=S[id];
        snapshot[id]={...s,ZM:s.ZM?[...s.ZM]:[],LK:s.LK?[...s.LK]:[],CM:s.CM?[...s.CM]:[]};
      });
      const r=await fetch(AUTH_URL+'/data/save',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+_tok},
        body:JSON.stringify({data:snapshot})
      });
      const d=await r.json();
      _setSyncStatus(d.ok?'saved':'error');
    }catch(e){_setSyncStatus('error');}
  })();
}
var _silentSyncTimer=null;
var _syncBtn=null;
var _syncBtnTimer=null;

function _setSyncStatus(state){ // 'saving' | 'saved' | 'error'
  if(!_syncBtn) _syncBtn=document.querySelector('.auth-sync-btn');
  if(!_syncBtn) return;
  if(_syncBtnTimer){clearTimeout(_syncBtnTimer);_syncBtnTimer=null;}
  if(state==='saving'){
    _syncBtn.textContent='↑ ...';_syncBtn.style.opacity='.5';
  } else if(state==='saved'){
    _syncBtn.textContent='✓ synced';_syncBtn.style.opacity='1';
    _syncBtnTimer=setTimeout(()=>{if(_syncBtn)_syncBtn.textContent='✓ saved';},2000);
  } else {
    _syncBtn.textContent='↑ sync';_syncBtn.style.opacity='1';
  }
}

function _silentCloudSync(){
  const _tok=(typeof AUTH_TOKEN!=='undefined'?AUTH_TOKEN:null)||localStorage.getItem('batt_token');
  if(!_tok) return;
  if(_silentSyncTimer) clearTimeout(_silentSyncTimer);
  _setSyncStatus('saving');
  _silentSyncTimer=setTimeout(async function(){
    _silentSyncTimer=null;
    try{
      const snapshot={};
      ['36','q',...(typeof CUSTOM_TABS!=='undefined'?CUSTOM_TABS.map(t=>t.id):[])].forEach(id=>{
        if(!S||!S[id])return;
        const s=S[id];
        snapshot[id]={...s,ZM:s.ZM?[...s.ZM]:[],LK:s.LK?[...s.LK]:[],CM:s.CM?[...s.CM]:[]};
      });
      const r=await fetch(AUTH_URL+'/data/save',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+_tok},
        body:JSON.stringify({data:snapshot})
      });
      const d=await r.json();
      _setSyncStatus(d.ok?'saved':'error');
      if(!d.ok&&d.error==='Unauthorized — please log in') authForceLogout();
    }catch(e){ _setSyncStatus('error'); }
  }, 2000); // 2s debounce — batches rapid inputs into one call
}

function isLocked(m, tno){
  const s=gs();
  if(!s.LK) return false;
  if(Array.isArray(s.LK)){s.LK=new Set(s.LK);} // heal if loaded as array
  return s.LK.has(m+'-'+tno);
}

function toggleMonth(m){
  const s=gs();
  if(!s.CM) s.CM=new Set();
  if(Array.isArray(s.CM)) s.CM=new Set(s.CM);
  const isCurrentlyCollapsed = s.CM.has(m);
  if(isCurrentlyCollapsed){
    s.CM.delete(m);
  } else {
    s.CM.add(m);
  }
  try{localStorage.setItem('batt_'+TAB+'_cm',JSON.stringify({CM:[...s.CM]}));}catch(e){}
  _silentCloudSync();
  const tbl=document.getElementById('tbl');
  if(!tbl) return;
  const rows=tbl.querySelectorAll('[data-mo="'+m+'"]');
  const btn=tbl.querySelector('.mo-toggle-btn[data-mo="'+m+'"]');
  const willBeCollapsed = !isCurrentlyCollapsed;
  rows.forEach(r=>r.classList.toggle('mo-collapsed',willBeCollapsed));
  if(btn){
    btn.classList.toggle('open',!willBeCollapsed);
    btn.classList.toggle('closed',willBeCollapsed);
    btn.textContent = willBeCollapsed ? '▸' : '▾';
  }
}
function toggleZeroMonth(m){
  _captureUndo();const s=gs();
  if(s.ZM.has(m)) s.ZM.delete(m);
  else s.ZM.add(m);
  try{localStorage.setItem('batt_'+TAB+'_zero',JSON.stringify({ZM:[...s.ZM]}));}catch(e){}
  _silentCloudSync();
  // save scroll before render, restore after so it never feels like a page jump
  const _pr=document.querySelector('.panel-right');
  const _sy=_pr?_pr.scrollTop:0;
  const _rc=document.getElementById('right-content');
  if(_rc){ _rc.style.transition='opacity .15s'; _rc.style.opacity='.5'; }
  render();
  if(_pr) _pr.scrollTop=_sy;
  if(_rc){ requestAnimationFrame(()=>{ _rc.style.opacity='1'; }); }
}

// ── GLOBAL / MANUAL MODE ──
function toggleGlobal(){
  _captureUndo();GLOBAL_MODE=!GLOBAL_MODE;
  // when switching TO global mode, seed BT from current month's MT if BT is all zero
  if(GLOBAL_MODE){
    const s=gs();
    const allZero=s.BT.every(v=>v===0);
    if(allZero){
      const curMT=s.MT[1]||s.MT[Object.keys(s.MT)[0]];
      if(curMT&&curMT.bt) s.BT=curMT.bt.slice();
    }
  }
  try{localStorage.setItem('batt_global_mode',GLOBAL_MODE?'1':'0');}catch(e){}
  const btn=document.getElementById('global-toggle');
  const globalPanel=document.getElementById('sec-trd-global');
  const perMonthPanel=document.getElementById('sec-trd-permonth');
  if(btn){
    btn.textContent=GLOBAL_MODE?'● on':'○ off';
    btn.style.borderColor=GLOBAL_MODE?'var(--acc2)':'var(--tx3)';
    btn.style.color=GLOBAL_MODE?'var(--acc2)':'var(--tx3)';
  }
  if(globalPanel) globalPanel.style.display=GLOBAL_MODE?'':'none';
  if(perMonthPanel) perMonthPanel.style.display=GLOBAL_MODE?'none':'';
  if(!GLOBAL_MODE) qaInitSlots();
  if(!GLOBAL_MODE) qaRefreshMonths();
  _silentCloudSync();
  const _pr=document.querySelector('.panel-right');
  const _sy=_pr?_pr.scrollTop:0;
  softUpdate();
  if(_pr) _pr.scrollTop=_sy;
}

// ── QUICK APPLY ──
function qaRefreshMonths(){
  const sel = document.getElementById('qa-month');
  if(!sel) return;
  const maxM = getTotalMonths();
  const cur = sel.value;
  sel.innerHTML = '<option value="">select...</option>';
  for(let i=1;i<=maxM;i++){
    const def = 'm'+String(i).padStart(2,'0');
    const custom = (typeof gs==='function') ? (gs().ML[i]||'') : '';
    const lbl = custom && custom !== def ? def+' — '+custom : def;
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = lbl;
    sel.appendChild(opt);
  }
  // restore selection if still valid
  if(cur && parseInt(cur) <= maxM) sel.value = cur;
}

function qaInitSlots(m){
  const el=document.getElementById('qa-slots');
  if(!el) return;
  const s=gs();
  const mon=m||parseInt(document.getElementById('qa-month')?.value)||0;
  const numSlots = (mon > 0 && s.MT[mon] && Array.isArray(s.MT[mon].bt)) ? s.MT[mon].bt.length : s.BT.length;
  let h='';
  for(let i=0;i<numSlots;i++){
    const lk=mon>0&&isLocked(mon,i+1);
    const dimStyle=lk?'opacity:.35;pointer-events:none':'';
    const lockTag=lk?`<span title="locked in m${String(mon).padStart(2,'0')}" style="font-size:9px;cursor:default">🔒</span>`:'';
    h+=`<div style="display:grid;grid-template-columns:16px 1fr;gap:3px;margin-bottom:3px;align-items:center;${dimStyle}" id="qa-row-${i}">
      <span style="font-size:8px;color:var(--tx3);text-align:center">${lk?'🔒':i+1}</span>
      <div class="tg-cell" style="border-color:${lk?'var(--bd2)':'var(--bd2)'}">
        <button class="tg-btn" style="color:var(--acc)" onclick="qaStep('qa-bt-${i}',-0.5)" tabindex="-1">−</button>
        <input type="number" id="qa-bt-${i}" placeholder="${lk?'locked':'tgt%'}" step="0.5" ${lk?'disabled':''} style="flex:1;min-width:0;padding:2px 0;font-size:9px;text-align:center;border:none;background:transparent;color:var(--acc);font-weight:700;-moz-appearance:textfield">
        <button class="tg-btn" style="color:var(--acc)" onclick="qaStep('qa-bt-${i}',0.5)" tabindex="-1">+</button>
      </div>
    </div>`;
  }
  el.innerHTML=h;
}

function qaApply(){
  const monthEl=document.getElementById('qa-month');
  const msg=document.getElementById('qa-msg');
  const m=parseInt(monthEl?.value);
  const s=gs();
  const maxM=getTotalMonths();
  if(!m||m<1||m>maxM){
    if(msg){msg.textContent=`enter a valid month (1–${maxM})`;msg.style.color='#E24B4A';}
    return;
  }
  // init month state if not exists
  if(!s.MT[m]) s.MT[m]={bt:[...s.BT],fr:[...s.FR]};
  const numSlots = s.MT[m].bt.length;
  let changed=0, skipped=[];
  for(let i=0;i<numSlots;i++){
    if(isLocked(m,i+1)){skipped.push(i+1);continue;}
    const btEl=document.getElementById(`qa-bt-${i}`);
    const btVal=btEl?.value.trim();
    if(btVal!==''){s.MT[m].bt[i]=parseFloat(btVal)||0;changed++;}
  }
  if(changed===0){
    const why=skipped.length===numSlots?'all slots locked for this month':'fill in at least one unlocked slot';
    if(msg){msg.textContent='nothing applied — '+why;msg.style.color='var(--tx3)';}
    return;
  }
  _silentCloudSync();
  softUpdate();
  const skipNote=skipped.length?` · skipped locked: T${skipped.join(',T')}`:'';
  if(typeof showToast==='function') showToast('✓ applied to m'+String(m).padStart(2,'0')+skipNote,'success',3000);
  if(msg){
    msg.textContent='✓ applied to m'+m+(skipped.length?' ('+skipped.length+' locked)':'');
    msg.style.color='var(--acc2)';
    setTimeout(()=>{if(msg)msg.textContent='';},3000);
  }
}

function qaClear(){
  const s=gs();
  const monthEl=document.getElementById('qa-month');
  const m=parseInt(monthEl?.value)||0;
  const numSlots = (m > 0 && s.MT[m] && Array.isArray(s.MT[m].bt)) ? s.MT[m].bt.length : s.BT.length;
  for(let i=0;i<numSlots;i++){
    const bt=document.getElementById(`qa-bt-${i}`);
    const fr=document.getElementById(`qa-fr-${i}`);
    if(bt) bt.value='';
    if(fr) fr.value='';
  }
  if(monthEl) monthEl.value='';
  const msg=document.getElementById('qa-msg');
  if(msg) msg.textContent='';
}
function getMonthTrades(m){
  const s=gs();
  if(GLOBAL_MODE) return {bt:s.BT,fr:s.FR};
  const mt=s.MT[m];
  if(mt&&Array.isArray(mt.bt)) return {bt:mt.bt,fr:mt.fr};
  // default to global as starting point
  return {bt:[...s.BT],fr:[...s.FR]};
}
function onManualBT(m,i,v){
  _captureUndo();if(isLocked(m,i+1)) return; // locked — ignore edit
  const s=gs();
  if(!s.MT[m]) s.MT[m]={bt:[...s.BT],fr:[...s.FR]};
  while(s.MT[m].bt.length <= i){ s.MT[m].bt.push(0); s.MT[m].fr.push(0); }
  s.MT[m].bt[i]=parseFloat(v)||0;
  _silentCloudSync();
  softUpdate();
}
function onTradeExit(m,tno,val){
  // store exit type on the simulated trade object for display
  const mo=sim().find(x=>x.m===m);
  const tr=mo?mo.trades.find(t=>t.no===tno):null;
  if(tr) tr.exit=val;
  // save to MT state
  const s=gs();
  if(!s.MT[m]) s.MT[m]={bt:[...s.BT],fr:[...s.FR]};
  if(!s.MT[m].exitTypes) s.MT[m].exitTypes={};
  s.MT[m].exitTypes[tno]=val;
  // sync to log modal if open for this slot
  if(_ljPending.m===m&&_ljPending.tno===tno){
    const el=document.getElementById('lj-exit-type');
    if(el) el.value=val;
  }
  _silentCloudSync();
}

function onManualFR(m,i,v){
  _captureUndo();if(isLocked(m,i+1)) return; // locked — ignore edit
  const s=gs();
  if(!s.MT[m]) s.MT[m]={bt:[...s.BT],fr:[...s.FR]};
  s.MT[m].fr[i]=parseInt(v)||0;
  _silentCloudSync();
  softUpdate();
}

// ── LABEL EDITING ──
function onMonthLabel(m,v){
  gs().ML[m]=v.trim();
  try{localStorage.setItem('batt_'+TAB+'_labels',JSON.stringify({ML:{...gs().ML},TL:{...gs().TL}}));}catch(e){}
  _silentCloudSync();
} 
function onTradeLabel(m,t,v){
  gs().TL[m+'-'+t]=v.trim();
  try{localStorage.setItem('batt_'+TAB+'_labels',JSON.stringify({ML:{...gs().ML},TL:{...gs().TL}}));}catch(e){}
  _silentCloudSync();
}
function getML(m){return gs().ML[m]||getMLabel(m);}
function getTL(m,t){return gs().TL[m+'-'+t]||('trade '+t);}

// ── RISK ASSESSMENT ──
function buildAssessment(months, s){
  // wipe state — funny assess bar
  if(IS_WIPED){
    const _lbl=LANG==='id';
    const fmVal = s.NOT/s.LEV/s.P*100;
    const isFmError = fmVal > 100;
    const wipeFunny2= isFmError ? [
      ['risk score','🚫 INVALID','can\'t even start'],['FM%',fmVal.toFixed(0)+'%','margin > capital'],
      ['leverage',gs().LEV+'×','need more'],['avg monthly','n/a','position rejected'],
      ['CAGR','math.exe stopped','fix FM% first'],['lifespan','0ms','exchange says no'],
      ['net seq','denied','increase lev or capital'],['verdict','fix FM% first','margin exceeds account'],
      ['fees','$0','no trades possible'],
    ] : [
      ['risk score','💀 EXTREME','broke math'],['liq%','0.0%','instant death'],
      ['leverage',gs().LEV+'×','the culprit'],['avg monthly','fictional','reduce notional'],
      ['CAGR','lmao','fix setup first'],['lifespan','0ms','one tick = dead'],
      ['net seq','+15% (fake)','not real'],['verdict','fix liq% first','notional > account'],
      ['fees','real tho','only thing working'],
    ];
    return `<div class="assess-bar" style="background:#2a0a0a;border-color:#7a0000">
      ${wipeFunny2.map(([l,v,sub])=>`<div class="as-item"><div class="as-lbl" style="color:#E24B4A">${l}</div><div class="as-val" style="color:#ff7070;font-size:10px">${v}</div><div class="as-sub" style="color:#A32D2D">${sub}</div></div>`).join('')}
    </div>`;
  }
  // bust state — show funny cards
  if(bustMonth){
    const bustFunny=[
      ['risk score',    '💀 busted',          'you out-withdrew yourself'],
      ['liq% buffer',   'irrelevant now',      'wallet is the problem'],
      ['mode',          s.SPOT?'◈ spot':'⚡ '+s.LEV+'×', s.SPOT?'no lev · withdrawal did this':'not what killed you'],
      ['avg monthly',   'one way',             'up then off a cliff'],
      ['3mo / CAGR',    'lol',                 'ask again never'],
      ['lifespan',      'already dead',        'sim stopped at '+getML(bustMonth.m)],
      ['net seq',       'moot point',          'fix the withdrawal first'],
      ['verdict',       'skill issue',         'withdrew more than you had'],
    ];
    return `<div class="assess-bar" style="background:#1a0a2e;border-color:#8B5CF6">
      ${bustFunny.map(([l,v,sub])=>`<div class="as-item"><div class="as-lbl" style="color:#8B5CF6">${l}</div><div class="as-val" style="color:#c084fc;font-size:11px">${v}</div><div class="as-sub" style="color:#8B5CF6">${sub}</div></div>`).join('')}
    </div>`;
  }
  const isQ=isQTab(TAB);
  const isSpot=s.SPOT||false;
  const liqT1=isSpot?100:s.P/s.NOT*100;
  const fm=isSpot?100:s.NOT/s.LEV/s.P*100;
  const act=months.filter(r=>!r.isZ);
  const avgPct=act.length?act.reduce((a,r)=>a+r.pct,0)/act.length:0;
  const last=months[months.length-1];
  const cagr=isQ?null:(Math.pow(Math.max(last.nw,s.P)/s.P,1/3)-1)*100;
  const mp=s.BT.reduce((a,t,i)=>a+(t!==0?t*s.KPI/100:0),0)*100;
  const actTr=s.BT.filter(t=>t!==0).length;
  const wins=s.BT.filter(t=>t>0).length;
  const losses=s.BT.filter(t=>t<0).length;
  
  // risk score 0-100 (lower = safer) — different criteria for spot vs leverage
  let riskScore=0;
  let riskReasons=[];
  const _id=LANG==='id';

  if(isSpot){
    // Spot risk factors: fee drag, concentration, target aggression
    const feeRate=(s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker);
    const feeDrag=feeRate*2*actTr; // total fee % per month per active trade
    if(feeRate>=0.1){riskScore+=20;riskReasons.push(_id?'biaya spot tinggi ('+feeRate+'%)':'high spot fee ('+feeRate+'%)');}
    else if(feeRate>=0.05){riskScore+=10;}
    if(actTr<=3){riskScore+=25;riskReasons.push(_id?'hanya '+actTr+' trade aktif':'only '+actTr+' active trades');}
    else if(actTr<=5){riskScore+=10;}
    const avgTgt=actTr?s.BT.filter(t=>t>0).reduce((a,t)=>a+t,0)/Math.max(wins,1):0;
    if(avgTgt>15){riskScore+=20;riskReasons.push(_id?'target agresif (avg '+avgTgt.toFixed(0)+'%)':'aggressive targets (avg '+avgTgt.toFixed(0)+'%)');}
    else if(avgTgt>8){riskScore+=8;}
    if(losses>=wins&&wins>0){riskScore+=20;riskReasons.push(_id?'lebih banyak loss dari win':'more losses than wins');}
    else if(losses>0&&losses>=wins*0.5){riskScore+=8;}
    if(mp<0){riskScore+=15;riskReasons.push(_id?'net sekuens negatif':'negative net sequence');}
  } else {
    // Leverage risk factors: liq buffer, leverage level, margin deployment
    if(liqT1<20){riskScore+=40;riskReasons.push(_id?'buffer liq kritis (<20%)':'liq buffer critical (<20%)');}
    else if(liqT1<35){riskScore+=25;riskReasons.push(_id?'buffer liq sempit (<35%)':'liq buffer tight (<35%)');}
    else if(liqT1<50){riskScore+=10;}
    if(s.LEV>=25){riskScore+=25;riskReasons.push(_id?'leverage sangat tinggi (≥25×)':'very high leverage (≥25×)');}
    else if(s.LEV>=20){riskScore+=15;riskReasons.push(_id?'leverage tinggi (≥20×)':'high leverage (≥20×)');}
    else if(s.LEV>=15){riskScore+=8;}
    if(fm>40){riskScore+=20;riskReasons.push(_id?'margin >40% dari akun':'margin >40% of account');}
    else if(fm>25){riskScore+=10;}
    else if(fm>15){riskScore+=4;}
    if(actTr<=3){riskScore+=10;riskReasons.push(_id?'hanya '+actTr+' trade aktif':'only '+actTr+' active trades');}
    else if(actTr<=5){riskScore+=4;}
  }
  
  riskScore=Math.min(100,riskScore);
  
  let riskLabelKey,riskClass,riskEmoji;
  if(riskScore<=20){riskLabelKey='SAFE';riskClass='rp-safe';riskEmoji='✓';}
  else if(riskScore<=45){riskLabelKey='MODERATE';riskClass='rp-med';riskEmoji='⚡';}
  else if(riskScore<=70){riskLabelKey='HIGH';riskClass='rp-high';riskEmoji='⚠';}
  else{riskLabelKey='EXTREME';riskClass='rp-extreme';riskEmoji='✕';}
  const riskLabel=t('rl_'+riskLabelKey);
  
  // liq bar color
  const liqBarColor=liqT1>=60?'#1D9E75':liqT1>=40?'#EF9F27':'#E24B4A';
  const riskBarColor=riskScore<=20?'#1D9E75':riskScore<=45?'#EF9F27':riskScore<=70?'#E24B4A':'#7a0000';
  
  // worst month liq (last trade of last active month)
  const worstM=act.length?act[act.length-1]:null;
  const worstLiq=worstM?(worstM.trades.filter(t=>!t.skip).slice(-1)[0]?.liq||0):0;
  
  // breakeven trades needed (how many trades to cover 1 loss)
  const avgSingleProfit=act.length&&act[0].trades.length?act[0].trades.filter(t=>!t.skip).reduce((a,t)=>a+t.sp,0):0;
  const lossT=act.length&&act[0].trades.length?act[0].trades.find(t=>t.tgt<0):null;
  
  const tooltip=riskReasons.length?riskReasons.join(' · '):t('verdict_solid');
  
  // ── ACCOUNT LIFESPAN ESTIMATE ──
  // logic: survival = (liq buffer)² ÷ leverage_factor ÷ margin_factor
  // liq² because 80% buffer is exponentially safer than 40% (market move probability)
  // leverage_factor = lev/10 (normalized to 10× baseline)
  // margin_factor = fm/20 (normalized to 20% baseline)
  const liqFactor = Math.pow(liqT1/100, 2);
  const levFactor = Math.max(0.1, s.LEV/10);
  const fmFactor  = Math.max(0.1, fm/20);
  const survScore = liqFactor / levFactor / fmFactor;

  let ageVal, ageSub, ageColor;
  if(survScore < 0.001){
    ageVal='minutes';   ageSub='one bad candle ends it'; ageColor='#A32D2D';
  } else if(survScore < 0.01){
    ageVal='hours';     ageSub='extremely fragile setup'; ageColor='#A32D2D';
  } else if(survScore < 0.05){
    ageVal='days';      ageSub='one volatile session → gone'; ageColor='#E24B4A';
  } else if(survScore < 0.15){
    ageVal='weeks';     ageSub='dangerous · tighten the risk'; ageColor='#EF9F27';
  } else if(survScore < 0.5){
    ageVal='months';    ageSub='manageable but stay sharp'; ageColor='#EF9F27';
  } else if(survScore < 1.5){
    ageVal='~1 year';   ageSub='solid · respect the plan'; ageColor='#1D9E75';
  } else if(survScore < 5){
    ageVal='years';     ageSub='disciplined trader energy'; ageColor='#1D9E75';
  } else if(survScore < 12){
    ageVal='a decade';  ageSub='institutional grade setup'; ageColor='#185FA5';
  } else {
    ageVal='generational'; ageSub='almost unliquidatable'; ageColor='#185FA5';
  }

  // Wipe state for quarter flat bar
  const _wipedQ=IS_WIPED;
  if(_wipedQ){
    const _lbl=LANG==='id';
    return `<div class="assess-bar" style="background:#FCEBEB">
      <div class="as-item" style="grid-column:1/-1;justify-content:center;color:#A32D2D;font-weight:700;font-size:12px;gap:6px">
        <span style="font-size:20px">💸</span>
        <span>${_lbl?'Setup tidak valid — liq% < 1%. Tidak ada nilai yang bisa dihitung.':'Invalid setup — liq% < 1%. No values can be calculated.'}</span>
        <div style="font-size:10px;font-weight:400;color:#A32D2D;opacity:.8">${_lbl?'Kurangi notional atau tambah modal.':'Reduce notional or increase capital.'}</div>
      </div>
    </div>`;
  }
  const totalFeeQ=act.reduce((a,r)=>a+(r.feePaid||0),0);
  return `<div class="assess-bar">
    <div class="as-item">
      <div class="as-lbl">risk score</div>
      <div class="as-val"><span class="risk-pill ${riskClass}">${riskEmoji} ${riskLabel}</span></div>
      <div class="as-bar-track"><div class="as-bar-fill" style="width:${riskScore}%;background:${riskBarColor}"></div></div>
      <div class="as-sub" title="${tooltip}">${riskScore}/100 · hover for detail</div>
    </div>
    ${isSpot?`
    <div class="as-item">
      <div class="as-lbl">◈ spot mode</div>
      <div class="as-val" style="color:#5DC96A">no liq%</div>
      <div class="as-sub">no liquidation risk</div>
    </div>
    <div class="as-item">
      <div class="as-lbl">fee method</div>
      <div class="as-val" style="color:var(--acc2)">${s.FEE.method}</div>
      <div class="as-sub">×2 per trade · open+close</div>
    </div>`:`
    <div class="as-item">
      <div class="as-lbl">liq t1 buffer</div>
      <div class="as-val" style="color:${liqBarColor}">${liqT1.toFixed(1)}%</div>
      <div class="as-bar-track"><div class="as-bar-fill" style="width:${Math.min(liqT1,100)}%;background:${liqBarColor}"></div></div>
      <div class="as-sub">spot move → wipe trade 1</div>
    </div>
    <div class="as-item">
      <div class="as-lbl">leverage</div>
      <div class="as-val" style="color:${s.LEV>=20?'#E24B4A':s.LEV>=15?'#EF9F27':'#1D9E75'}">${s.LEV}×</div>
      <div class="as-sub">margin = ${fm.toFixed(1)}% of account</div>
    </div>`}
    <div class="as-item">
      <div class="as-lbl">${t('seq_net_lbl')}</div>
      <div class="as-val" style="color:${mp>=0?'#1D9E75':'#E24B4A'}">${mp>0?'+':''}${mp.toFixed(1)}%</div>
      <div class="as-sub">${wins}W / ${losses}L · ${actTr} active</div>
    </div>
    <div class="as-item">
      <div class="as-lbl">avg monthly</div>
      <div class="as-val">${avgPct.toFixed(1)}%</div>
      <div class="as-sub">avg gain · active months</div>
    </div>
    <div class="as-item">
      <div class="as-lbl">${isQ?'3mo return':'3yr CAGR'}</div>
      <div class="as-val" style="color:#BA7517">${isQ?((last.nw/s.P-1)*100).toFixed(1)+'%':cagr.toFixed(1)+'%'}</div>
      <div class="as-sub">account + banked</div>
    </div>
    <div class="as-item">
      <div class="as-lbl">verdict</div>
      <div class="as-val" style="font-size:11px;color:var(--tx2);line-height:1.4;white-space:normal;font-weight:600">${tooltip}</div>
    </div>
    <div class="as-item">
      <div class="as-lbl">${isSpot?'position size':'account lifespan'}</div>
      <div class="as-val" style="color:${isSpot?'#5DC96A':ageColor};font-size:${isSpot?'13':'17'}px">${isSpot?fmt(s.P):ageVal}</div>
      <div class="as-sub">${isSpot?'full capital · no margin':ageSub}</div>
    </div>
    <div class="as-item">
      <div class="as-lbl">total fees paid</div>
      <div class="as-val" style="color:#E24B4A;font-size:13px">−${fmt(totalFeeQ)}</div>
      <div class="as-sub">trade + funding · ${isQ?'3mo':'all months'}</div>
    </div>
  </div>`;
}

// 36-month side panel: 3-col × 2-row, 6 precision cards, aligns flush with chart
function buildAssessmentCards(months, s){
  const isSpot=s.SPOT||false;
  const liqT1=isSpot?999:s.P/s.NOT*100;
  const fm=isSpot?100:s.NOT/s.LEV/s.P*100;
  const margin=isSpot?s.P:s.NOT/s.LEV;
  const feeRate=s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker;
  const feePerTrade=s.NOT*feeRate/100*2;
  const {actTr,wins,losses,net:mp}=seqStats(s);
  const act=months.filter(r=>!r.isZ);
  const last=months[months.length-1];
  const cagr=(Math.pow(Math.max(last.nw,s.P)/s.P,1/3)-1)*100;

  // risk score
  let rs=0,rr=[];
  if(isSpot){
    if(feeRate>=0.1){rs+=20;rr.push('high spot fee ('+feeRate+'%)');}
    if(actTr<=3){rs+=25;rr.push('only '+actTr+' active trades');}
    if(mp<0){rs+=15;rr.push('negative net sequence');}
  } else {
    if(liqT1<20){rs+=40;rr.push('liq buffer critical (<20%)');}
    else if(liqT1<35){rs+=25;rr.push('liq buffer tight (<35%)');}
    else if(liqT1<50){rs+=10;}
    if(s.LEV>=25){rs+=25;rr.push('very high leverage (≥25×)');}
    else if(s.LEV>=20){rs+=15;}else if(s.LEV>=15){rs+=8;}
    if(fm>40){rs+=20;rr.push('margin >40% of account');}
    else if(fm>25){rs+=10;}else if(fm>15){rs+=4;}
    if(actTr<=3){rs+=10;rr.push('only '+actTr+' active trades');}
  }
  rs=Math.min(100,rs);
  let rlKey,rc2,re;
  if(rs<=20){rlKey='SAFE';rc2='rp-safe';re='✓';}
  else if(rs<=45){rlKey='MODERATE';rc2='rp-med';re='⚡';}
  else if(rs<=70){rlKey='HIGH';rc2='rp-high';re='⚠';}
  else{rlKey='EXTREME';rc2='rp-extreme';re='✕';}
  const riskLabel=t('rl_'+rlKey);
  const liqC=liqT1>=60?'#1D9E75':liqT1>=40?'#EF9F27':'#E24B4A';
  const liqW=Math.min(liqT1,100);
  const tooltip=rr.length?rr.join(' · '):t('verdict_solid');

  // lifespan
  let av='n/a',as2='spot mode',ac='#5DC96A';
  if(!isSpot){
    const liqF=Math.pow(liqT1/100,2),levF=Math.max(0.1,s.LEV/10),fmF=Math.max(0.1,fm/20);
    const sv=liqF/levF/fmF;
    if(sv<0.001){av='minutes';as2='one bad candle ends it';ac='#A32D2D';}
    else if(sv<0.01){av='hours';as2='extremely fragile';ac='#A32D2D';}
    else if(sv<0.05){av='days';as2='volatile session → gone';ac='#E24B4A';}
    else if(sv<0.15){av='weeks';as2='dangerous · tighten risk';ac='#EF9F27';}
    else if(sv<0.5){av='months';as2='manageable, stay sharp';ac='#EF9F27';}
    else if(sv<1.5){av='~1 year';as2='solid · respect the plan';ac='#1D9E75';}
    else if(sv<5){av='years';as2='disciplined trader energy';ac='#1D9E75';}
    else if(sv<12){av='a decade';as2='institutional grade';ac='#185FA5';}
    else{av='generational';as2='almost unliquidatable';ac='#185FA5';}
  }
  const tAge=t('age_'+av);
  const ageVal=tAge!==('age_'+av)?tAge:av;
  const tAgeSub=t('age_sub_'+av);
  const ageSub=tAgeSub!==('age_sub_'+av)?tAgeSub:as2;

  // preset + status pills
  const presetName=window._ACTIVE_PRESET?window._ACTIVE_PRESET.name:null;
  const cfOn=s.CF!==false;
  const gmOn=typeof GLOBAL_MODE!=='undefined'?GLOBAL_MODE:false;
  const pillOn=(txt)=>`<span style="font-size:8px;padding:2px 6px;border-radius:8px;background:rgba(0,196,122,0.08);color:#00c47a;border:0.5px solid rgba(0,196,122,0.2);white-space:nowrap">${txt}</span>`;
  const pillOff=(txt)=>`<span style="font-size:8px;padding:2px 6px;border-radius:8px;background:var(--sf2);color:var(--tx3);border:0.5px solid var(--bd2);white-space:nowrap">${txt}</span>`;
  const pillWarn=(txt)=>`<span style="font-size:8px;padding:2px 6px;border-radius:8px;background:rgba(245,158,11,0.08);color:#EF9F27;border:0.5px solid rgba(245,158,11,0.2);white-space:nowrap">${txt}</span>`;

  // wipe/bust override
  if(IS_WIPED||bustMonth){
    const wipeFm=s.NOT/s.LEV/s.P*100;
    const isFmErr=wipeFm>100;
    const col=bustMonth?'#8B5CF6':'#E24B4A';
    const bg=bustMonth?'#1a0a2e':'#2a0a0a';
    const bd=bustMonth?'#2a0a4e':'#3a0a0a';
    const msg=bustMonth?'go fix m'+bustMonth.m:isFmErr?'fix FM% ≤100%':'fix liq% first';
    const sub=bustMonth?'withdrawal > balance':isFmErr?'margin exceeds account':'notional > account';
    return `<div style="height:100%;background:${bg};border:0.5px solid ${col}33;border-radius:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;padding:16px">
      <div style="font-size:13px;font-weight:700;color:${col}">${bustMonth?'💀 busted':'🚫 invalid setup'}</div>
      <div style="font-size:10px;color:${col};opacity:.7">${msg}</div>
      <div style="font-size:9px;color:${col};opacity:.5">${sub}</div>
    </div>`;
  }

  const mc=(content)=>`<div style="padding:5px 7px;background:var(--sf2);border-radius:5px">${content}</div>`;
  const lbl=(t)=>`<div style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${t}</div>`;
  const val=(v,col='var(--tx)',size='12px')=>`<div style="font-size:${size};font-weight:500;color:${col};line-height:1.2">${v}</div>`;
  const sub=(v)=>`<div style="font-size:7px;color:var(--tx2);margin-top:1px">${v}</div>`;

  return `<div style="height:100%;display:grid;grid-template-columns:1fr 1fr;border:0.5px solid var(--bd2);border-radius:0 6px 6px 0;overflow:hidden;background:var(--panel)">

    <!-- SHARED HEADER spans both columns -->
    <div style="grid-column:1/-1;display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--sf);border-bottom:0.5px solid var(--bd2);overflow:hidden">
      <div style="width:6px;height:6px;border-radius:50%;background:#00c47a;flex-shrink:0"></div>
      <span style="font-size:10px;font-weight:600;color:var(--tx2);white-space:nowrap;flex-shrink:0">your cockpit${presetName?` · <span style="color:#00c47a">${presetName}</span>`:''}</span>
      ${presetName?(()=>{
        const _tpl=[
          '🔒 locked in · stop tweaking · trust the plan · hands off the wheel · the setup is done · now execute · no more adjusting · let it cook · you built this · stick to it · trade the plan not the feeling',
          '📋 preset mode: activated · your rules your game · no impulse trades · the plan is the boss · eyes on the target · stay disciplined · the market will test you · don\'t flinch · you prepared for this · execute',
          '🎯 this is the plan · this is the moment · stop second-guessing · the setup was built for a reason · trust your past self · they knew what they were doing · now go · execute · don\'t overthink it',
          '🧊 ice cold · no emotions · no tweaks · no panic · the preset is the preset · your job is to follow it · breathe · wait for the setup · execute when it\'s time · simple as that',
          '⚡ locked and loaded · @'+presetName+' is in charge · you planned this in cold blood · now trade it in cold blood · no FOMO · no revenge trading · just the plan · just the execution',
          '🏹 you set the trap · now let it snap · stop watching every candle · the preset doesn\'t care about your feelings · it only cares about the levels · trust the levels · trust the plan · execute',
          '🔥 no cap this is the move · you did the math · you checked the liq% · you set the slots · now let it breathe · stop hovering · the trade either hits or it doesn\'t · that\'s the game',
          '🛡️ protected by the plan · your liq% is set · your notional is set · your targets are set · there is nothing left to decide · only to execute · remove emotion · follow the system · that\'s it',
          '🚀 conviction mode · you built this preset with intention · every number here was chosen · every slot was deliberate · this isn\'t guessing · this is a system · work the system · let the system work',
          '💎 diamond hands energy · the plan is your edge · your edge is your discipline · discipline beats intelligence every time · you\'re not smarter than the market · but your plan is · trust it',
        ];
        const _t=_tpl[Math.floor(Math.random()*_tpl.length)];
        const _txt=_t+' · '+_t+' ·\u00a0';
        return `<div class="preset-marquee"><div class="preset-marquee-track">${_txt}</div></div>`;
      })():''}
      <span style="font-size:8px;color:var(--tx3);margin-left:auto;letter-spacing:.04em;flex-shrink:0">M01 · T1</span>
    </div>

    <!-- SECTION LABELS -->
    <div style="font-size:7px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.1em;padding:4px 10px 3px;background:var(--sf2);border-bottom:0.5px solid var(--bd2);border-right:0.5px solid var(--bd2)">setup</div>
    <div style="font-size:7px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.1em;padding:4px 10px 3px;background:var(--sf2);border-bottom:0.5px solid var(--bd2)">risk & cost</div>

    <!-- LEFT: setup -->
    <div style="display:flex;flex-direction:column;border-right:0.5px solid var(--bd2);overflow:hidden">
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:7px 6px 5px;gap:4px">
        ${mc(lbl('capital')+val('$'+s.P.toLocaleString())+sub('starting'))}
        ${mc(lbl('leverage')+val(isSpot?'1×':s.LEV+'×',isSpot?'#5DC96A':s.LEV>=20?'#E24B4A':s.LEV>=15?'#EF9F27':'#1D9E75')+sub(isSpot?'spot':'perp'))}
        ${mc(lbl('notional')+val('$'+s.NOT.toLocaleString())+sub((s.NOT/s.P).toFixed(2)+'× cap'))}
      </div>
      <div style="padding:3px 10px 5px">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:7.5px;color:var(--tx2);margin-bottom:3px">
          <span>liq t1 buffer</span>
          <span style="color:${liqC};font-weight:600">${isSpot?'no liq':liqT1.toFixed(1)+'% · '+riskLabel.toLowerCase()}</span>
        </div>
        <div style="height:3px;background:var(--sf2);border-radius:2px;overflow:hidden">
          <div style="width:${isSpot?100:liqW}%;height:100%;background:${isSpot?'#5DC96A':liqC};border-radius:2px"></div>
        </div>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;padding:3px 10px 7px">
        ${isSpot?pillOn('◈ spot'):pillOn('⚡ lev')}
        ${cfOn?pillOn('CF on'):pillOff('CF off')}
        ${gmOn?pillOn('G on'):pillOff('G off')}
        ${pillOn(s.FEE.method)}
        ${actTr>=7?pillWarn(actTr+'/10'):actTr>0?pillOn(actTr+'/10'):pillOff('0/10')}
        ${pillOn(TAB)}
      </div>
    </div>

    <!-- RIGHT: risk & cost -->
    <div style="display:flex;flex-direction:column;overflow:hidden">
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:7px 6px 5px;gap:4px">
        ${mc(lbl('margin')+val('$'+margin.toFixed(2))+sub(fm.toFixed(1)+'% acct'))}
        ${mc(lbl('fee/trade')+val('$'+feePerTrade.toFixed(3),'var(--tx3)','10px')+sub(s.FEE.method+'×2'))}
        ${mc(lbl('risk')+`<div style="font-size:9px;font-weight:500;color:${rs<=20?'#1D9E75':rs<=45?'#EF9F27':rs<=70?'#E24B4A':'#7a0000'}">${re} ${riskLabel.toLowerCase()}</div>`+sub(rs+'/100'))}
        ${mc(lbl('fm%')+val(fm.toFixed(1)+'%',fm>40?'#E24B4A':fm>20?'#EF9F27':'#1D9E75')+sub('of acct'))}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;padding:0 6px 7px;gap:4px">
        <div style="padding:6px 8px;background:var(--sf2);border-radius:5px">
          <div style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">verdict</div>
          <div style="font-size:9px;font-weight:500;color:var(--tx2);line-height:1.4">${tooltip}</div>
        </div>
        <div style="padding:6px 8px;background:var(--sf2);border-radius:5px">
          <div style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">${isSpot?'position':'lifespan'}</div>
          <div style="font-size:13px;font-weight:600;color:${isSpot?'#5DC96A':ac};line-height:1.2">${isSpot?'$'+s.NOT.toLocaleString():ageVal}</div>
          <div style="font-size:7px;color:var(--tx2);margin-top:2px">${isSpot?'no margin':ageSub}</div>
        </div>
      </div>
    </div>

  </div>`;
}
// ── SEQ STATS (net result inc. losses) ──
function seqStats(s){
  const actTr=s.BT.filter(t=>t!==0).length;
  const wins=s.BT.filter(t=>t>0).length;
  const losses=s.BT.filter(t=>t<0).length;
  const net=s.BT.reduce((a,t)=>a+(t!==0?t*s.KPI/100:0),0)*100;
  const upside=s.BT.reduce((a,t)=>a+(t>0?t*s.KPI/100:0),0)*100;
  const downside=s.BT.reduce((a,t)=>a+(t<0?t*s.KPI/100:0),0)*100;
  return{actTr,wins,losses,net,upside,downside};
}

// ── RENDER ──
function render(){
  // preserve scroll so re-render doesn't feel like a page jump
  const _pr=document.querySelector('.panel-right');
  const _scrollY=_pr?_pr.scrollTop:0;
  updComp();
  // snapshot metric values before redraw for animation
  document.querySelectorAll('.mvv[data-key]').forEach(el=>{_oldVals[el.dataset.key]=el.textContent;});
  const s=gs();
  const isQ=isQTab(TAB);
  const liqT1=s.P/s.NOT*100;
  const rc=document.getElementById('right-content');

  // ── WIPE GUARD: liq% < 1 OR fm% > 100% means setup is invalid ──
  // Keep full layout visible but replace every value with wipe error state
  const fm = s.SPOT ? 100 : (s.NOT / s.LEV / s.P * 100);
  const fmExceeded = (!s.SPOT) && (fm > 100);
  IS_WIPED = (!s.SPOT) && (liqT1 < 1 || !isFinite(liqT1) || fmExceeded);

  const months=sim();
  bustMonth=months.find(r=>r.bust)||null;
  const IS_BUST=!!bustMonth;
  const last=months[months.length-1];
  const act=months.filter(r=>!r.isZ);
  const avgPct=act.length?act.reduce((a,r)=>a+r.pct,0)/act.length:0;
  const {actTr,wins,losses,net:mp,upside:mpUp,downside:mpDown}=seqStats(s);
  const totalDeposits=last.totalDeposits||0;
  const totalPrincipal=s.P+totalDeposits;
  const cagr=isQ?null:(totalPrincipal>0?(Math.pow(Math.max(last.nw,totalPrincipal)/totalPrincipal,1/3)-1)*100:0);
  const tr=totalPrincipal>0?((last.nw/totalPrincipal)-1)*100:0;
  const m1M=!isQ?months.find(r=>r.nw>=1000000):null;
  const totalFeesPaid=months.filter(r=>!r.isZ).reduce((a,r)=>a+(r.feePaid||0),0);
  const wv=(val,color='')=>{
    if(IS_WIPED) return '<div class="mvv wipe-val">wiped</div>';
    return '<div class="mvv"'+(color?' style="color:'+color+'"':'')+'>'+val+'</div>';
  };
  const ws=(sub)=>{
    if(IS_WIPED) return '<div class="ms" style="color:#E24B4A;font-size:8px">— invalid —</div>';
    return '<div class="ms">'+sub+'</div>';
  };
  // funny card messages for error states
  const WIPE_MSGS = [
    ['your CAGR',      'you broke math',        'impressive wrongness'],
    ['total return',   'negative infinity',      'congrats on that'],
    ['combined NW',    'thoughts & prayers',     'account + regrets'],
    ['total banked',   'your dreams',            'safely in the trash'],
    ['end account',    'the void',               'Rp0 · nothing left'],
    ['₿ equivalent',   '0.0000 ₿',               'not even satoshis'],
    ['$1M milestone',  'next life maybe',        'keep manifesting'],
    ['avg monthly',    'lmao',                   'not like this'],
    ['net seq result', 'skill issue',            'wins: 0 · losses: all'],
    ['liq%',           'instant',                'any move wipes you'],
    ['fees paid',      'the only real number',   'at least this worked'],
    ['1yr return',     '−100%',                  'speedrun to zero'],
  ];
  const FM_MSGS = [
    ['your CAGR',      'math.exe stopped',       'can\'t even start'],
    ['total return',   'error 404',              'position not found'],
    ['combined NW',    'your ambition',          'exceeds your wallet'],
    ['total banked',   'nothing yet',            'can\'t trade air'],
    ['end account',    'n/a',                    'position rejected'],
    ['₿ equivalent',   '??? ₿',                  'exchange says no'],
    ['$1M milestone',  'login first',            'with valid margin'],
    ['avg monthly',    'bro chill',              'fix the setup first'],
    ['net seq result', 'position denied',        'margin > capital'],
    ['FM%',            fm.toFixed(0)+'%',        'need ≤100% to trade'],
    ['fees paid',      '$0',                     'no trades possible'],
    ['1yr return',     'n/a',                    'can\'t open position'],
  ];
  const BUST_MSGS = [
    ['your CAGR',      'you went all-in',        'bold strategy'],
    ['total return',   'ate the seed money',     'impressive'],
    ['combined NW',    'your personality',       'priceless, apparently'],
    ['total banked',   fmt(bustMonth?bustMonth.gAF:0), 'all you had left'],
    ['end account',    '$0.00',                  'gone. reduced to atoms'],
    ['₿ equivalent',   '0.0000 ₿',               'dust in the wind'],
    ['$1M milestone',  'deleted',                'try again sweetheart'],
    ['avg monthly',    'one month wonder',       'then the cliff'],
    ['net seq result', 'technically a record',   'worst withdrawal ever'],
    [s.SPOT?'mode':'liq%', s.SPOT?'◈ spot · no liq':'not the problem rn', s.SPOT?'wd still busted you':'withdrawal did this'],
    ['fees paid',      fmt(months.filter(r=>!r.isZ&&!r.bust).reduce((a,r)=>a+(r.feePaid||0),0)), 'before the chaos'],
    ['1yr return',     'n/a',                    'didn\'t make it that far'],
  ];
  const errMsgs = fmExceeded ? FM_MSGS : (IS_WIPED ? WIPE_MSGS : (IS_BUST ? BUST_MSGS : null));
  let mh='<div class="metrics">';
  if(errMsgs){
    mh+=errMsgs.map(([lbl,val,sub])=>`<div class="mc"><div class="mll">${lbl}</div><div class="mvv" style="color:#E24B4A;font-size:11px">${val}</div><div class="ms" style="color:#E24B4A;opacity:.7">${sub}</div></div>`).join('');
    mh+='</div>';
  } else if(isQ){
    const btcPrice = window.LIVE_BTC_PRICE || 85000;
    const endBalanceBTC = last.eA / btcPrice;
    mh+=`
      <div class="mc"><div class="mll">${t('q_end_lbl')}</div>${wv(fmt(last.eA),'var(--acc2)')}${ws(fIDR(last.eA))}</div>
      <div class="mc"><div class="mll">${t('total_gain_lbl')}</div>${wv('+'+tr.toFixed(1)+'%','var(--acc2)')}${ws(fmt(last.eA-totalPrincipal))}</div>
      <div class="mc"><div class="mll">${t('nw_lbl')}</div>${wv(fmt(last.nw),'var(--acc)')}${ws(fIDR(last.nw))}</div>
      <div class="mc"><div class="mll">${t('banked_lbl')}${totalDeposits>0?' · DEPO':''}</div><div class="mvv">${fmt(last.banked)}</div><div class="ms">${totalDeposits>0?'banked '+fmt(last.banked)+' · depo +'+fmt(totalDeposits):('3 '+t('months'))}</div></div>
      <div class="mc"><div class="mll">${t('avg_lbl')}</div><div class="mvv">${avgPct.toFixed(1)}%</div><div class="ms">${t('per_active_month')}</div></div>
      <div class="mc"><div class="mll">₿ equivalent</div><div class="mvv" style="color:#f7931a">${endBalanceBTC.toFixed(4)}</div><div class="ms">Q3 acct · @ $${btcPrice.toLocaleString()}</div></div>
      <div class="mc"><div class="mll">${t('seq_net_lbl')}</div><div class="mvv" style="color:${mp>=0?'#1D9E75':'#E24B4A'}">${mp>0?'+':''}${mp.toFixed(1)}%</div><div class="ms">${wins}W / ${losses}L · ${actTr}/${s.BT.length} ${t('active_trades')}</div></div>
      <div class="mc"><div class="mll">total fees paid</div><div class="mvv" style="color:#E24B4A">−${fmt(totalFeesPaid)}</div><div class="ms">${s.SPOT?'trade only · spot':'trade + funding · 3mo'}</div></div>
      <div class="mc placeholder"></div>
      <div class="mc placeholder"></div>
      <div class="mc placeholder"></div>
      <div class="mc placeholder"></div>
    `;
  } else {
    const btcPrice = window.LIVE_BTC_PRICE || 85000;
    const endBalanceBTC = last.eA / btcPrice;
    // 1-year metrics (month 12)
    const m12 = months[11]; // index 11 = month 12
    const y1Depo = m12 ? (m12.totalDeposits || 0) : 0;
    const y1Prin = s.P + y1Depo;
    const y1Nw = m12 ? m12.nw : s.P;
    const y1Ret = y1Prin > 0 ? ((y1Nw / y1Prin) - 1) * 100 : 0;
    mh+=`
      <div class="mc"><div class="mll">${t('cagr_lbl')}</div><div class="mvv" style="color:var(--acc2)" data-key="cagr">${cagr.toFixed(1)}%</div><div class="ms">${t('cagr_sub')}</div></div>
      <div class="mc"><div class="mll">${t('total_ret_lbl')}</div><div class="mvv">${tr>9999?(tr/1000).toFixed(0)+'k%':tr.toFixed(0)+'%'}</div><div class="ms">${t('total_ret_sub',fmt(totalPrincipal))}</div></div>
      <div class="mc"><div class="mll">${t('nw_lbl')}</div><div class="mvv" style="color:var(--acc2)" data-key="nw">${fmt(last.nw)}</div><div class="ms">${t('nw_sub')} · ${fIDR(last.nw)}</div></div>
      <div class="mc"><div class="mll">${t('banked_lbl')}${totalDeposits>0?' · DEPO':''}</div><div class="mvv" style="color:var(--acc)" data-key="banked">${fmt(last.banked)}</div><div class="ms">${totalDeposits>0?'banked '+fmt(last.banked)+' · depo +'+fmt(totalDeposits):t('banked_sub')}</div></div>
      <div class="mc"><div class="mll">${t('end_acct_lbl')}</div><div class="mvv" data-key="eA">${fmt(last.eA)}</div><div class="ms">${months.filter(r=>!r.isZ).length}/${months.length} active · ${fIDR(last.eA)}</div></div>
      <div class="mc"><div class="mll">₿ equivalent</div><div class="mvv" style="color:#f7931a">${endBalanceBTC.toFixed(4)}</div><div class="ms">${months.filter(r=>!r.isZ).length}/${months.length} · @ $${btcPrice.toLocaleString()}</div></div>
      <div class="mc"><div class="mll">${t('milestone_lbl')}</div><div class="mvv" style="color:${m1M?'var(--acc2)':'#E24B4A'}">${m1M?getMLabel(m1M.m):t('beyond36')}</div><div class="ms">${m1M?t('milestone_hit')+getMLabel(m1M.m):t('milestone_miss')}</div></div>
      <div class="mc"><div class="mll">${t('avg_lbl')}</div><div class="mvv">${avgPct.toFixed(1)}%</div><div class="ms">${t('avg_sub')} · ${(36-s.ZM.size)} ${t('active')}</div></div>
      <div class="mc"><div class="mll">${t('seq_net_lbl')}</div><div class="mvv" style="color:${mp>=0?'#1D9E75':'#E24B4A'}">${mp>0?'+':''}${mp.toFixed(1)}%</div><div class="ms">${wins}W / ${losses}L · ${actTr}/${s.BT.length}</div></div>
      ${s.SPOT?'<div class="mc"><div class="mll">no liq%</div><div class="mvv" style="color:#5DC96A">◈ spot</div><div class="ms">no liquidation risk</div></div>':('<div class="mc"><div class="mll">'+t('liq_mc_lbl')+'</div><div class="mvv" style="color:'+lc(liqT1)+'">'+liqT1.toFixed(1)+'%</div><div class="ms">'+t('liq_mc_sub',liqT1.toFixed(0))+'</div></div>')}
      <div class="mc"><div class="mll">total fees paid</div><div class="mvv" style="color:#E24B4A">−${fmt(totalFeesPaid)}</div><div class="ms">${s.SPOT?'trade only · spot':'trade + funding · all months'}</div></div>
      <div class="mc"><div class="mll">1yr return</div><div class="mvv" style="color:#5b7fff">${y1Ret>999?(y1Ret/1000).toFixed(1)+'k%':y1Ret.toFixed(0)+'%'}</div><div class="ms">M12 NW: ${fmt(y1Nw)}</div></div>
    `;
  }
  if(!errMsgs) mh+='</div>';

  // Wipe banner shown instead of note bar when IS_WIPED
  lbl_w=LANG==='id';
  const bustBanner=IS_BUST?`<div class="wipe-banner" style="border-color:#8B5CF6;background:#1a0a2e">
    <span class="wipe-banner-icon">💀</span>
    <div>
      <div class="wipe-banner-msg" style="color:#c084fc">YOU BUSTED THE ACCOUNT — withdrew ${fmt(bustMonth.wd)} but only had ${fmt(bustMonth.gAF)} after fees. classic. the sim stopped at ${getML(bustMonth.m)}.</div>
      <div class="wipe-banner-fix" style="color:#a855f7">fix: reduce the withdrawal in the highlighted row below ↓ — the table stays open so you can adjust</div>
    </div>
  </div>`:'';
  const wipeBanner=IS_WIPED?`<div class="wipe-banner">
    <span class="wipe-banner-icon">${fmExceeded?'🚫':'💸'}</span>
    <div>
      <div class="wipe-banner-msg">${fmExceeded
        ?(lbl_w?'SETUP TIDAK VALID — FM% > 100%: margin yang dibutuhkan melebihi modal Anda. Posisi ini tidak bisa dibuka.':'SETUP INVALID — FM% > 100%: margin required exceeds your capital. This position cannot be opened.')
        :(lbl_w?'SETUP GAGAL TOTAL — liq% < 1%: notional melebihi akun, tidak ada buffer. Setiap pergerakan market melikuidasi seketika.':'SETUP CRITICALLY FAILED — liq% < 1%: notional exceeds account, zero buffer. Any market move causes instant liquidation.')}</div>
      <div class="wipe-banner-fix">${fmExceeded
        ?(lbl_w?'Perbaiki: kurangi notional, tambah leverage, atau tambah modal hingga FM% ≤ 100%':'Fix: reduce notional, increase leverage, or increase capital until FM% ≤ 100%')
        :(lbl_w?'Perbaiki: kurangi notional atau tambah modal hingga liq% ≥ 40%':'Fix: reduce notional or increase capital until liq% ≥ 40%')}</div>
    </div>
  </div>`:'';
  const noteText=s.SPOT
    ?(LANG==='id'
      ?`◈ mode spot · akun ${fmt(s.P)} · posisi = modal penuh · tanpa leverage · tanpa likuidasi · biaya: ${s.FEE.method} ${s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker}% × 2 per trade · ${actTr}/10 trade ${t('active')} · kpi scale ${s.KPI.toFixed(2)}×`
      :`◈ spot mode · acct ${fmt(s.P)} · position = full capital · no leverage · no liquidation · fee: ${s.FEE.method} ${s.FEE.method==='maker'?s.FEE.maker:s.FEE.taker}% × 2 per trade · ${actTr}/10 ${t('trades')} ${t('active')} · kpi scale ${s.KPI.toFixed(2)}×`)
    :`${t('note_setup')}: acct ${fmt(s.P)} · notional t1 ${fmt(s.NOT)} (${(s.NOT/s.P).toFixed(2)}× acct) · ${t('note_margin')} ${fmt(s.NOT/s.LEV)} ${t('note_at')} ${s.LEV}× lev · liq t1 = ${liqT1.toFixed(1)}% (${t('note_liq',liqT1.toFixed(0))}) · ${actTr}/10 ${t('trades')} ${t('active')} · kpi scale ${s.KPI.toFixed(2)}× · ${t('note_wd')}`;

  let IDR_LIVE=typeof IDR!=='undefined'?IDR:16700;
  let IDR_TIME=typeof IDR_LAST_UPDATE!=='undefined'?IDR_LAST_UPDATE:'';
  let chartH='';
  if(!isQ){
    chartH=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">
      <div class="lgd" style="margin-bottom:0">
        <span><span class="ld" style="background:#1D9E75"></span>account</span>
        <span><span class="ld" style="background:var(--acc)"></span>banked</span>
        <span><span class="ld" style="background:#BA7517"></span>NW</span>
        <span style="font-size:9px;color:var(--tx3)">log scale · ⊘ = zero month</span>
      </div>
      <div style="display:flex;align-items:center;gap:5px;background:var(--sf2);border:0.5px solid var(--bd2);padding:2px 8px;font-size:9px">
        <span style="color:var(--tx3)">USD/IDR</span>
        <span style="font-weight:700;color:var(--tx)" id="idr-rate-val">Rp${Math.round(IDR_LIVE).toLocaleString()}</span>
        <span style="color:var(--tx3)" id="idr-rate-time">${IDR_TIME?'upd '+IDR_TIME:''}</span>
        <button onclick="fetchIDR(true)" title="refresh" style="background:transparent;border:none;color:var(--acc2);font-size:13px;cursor:pointer;padding:0;line-height:1" id="idr-refresh">↻</button>
        <span style="width:1px;height:12px;background:var(--bd2);display:inline-block;margin:0 2px"></span>
        <button id="lang-en-btn" onclick="setLang('en')" style="font-size:9px;font-weight:700;padding:1px 6px;border:0.5px solid ${LANG==='en'?'var(--acc)':'var(--bd2)'};background:${LANG==='en'?'var(--acc)':'transparent'};color:${LANG==='en'?'#fff':'var(--tx2)'};cursor:pointer">EN</button>
        <button id="lang-id-btn" onclick="setLang('id')" style="font-size:9px;font-weight:700;padding:1px 6px;border:0.5px solid ${LANG==='id'?'var(--acc)':'var(--bd2)'};background:${LANG==='id'?'var(--acc)':'transparent'};color:${LANG==='id'?'#fff':'var(--tx2)'};cursor:pointer">ID</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:3fr 7fr;gap:0;margin-bottom:8px;height:168px">
      <div class="cw" style="margin-bottom:0;height:168px;position:relative;border-right:none;overflow:hidden"><canvas id="gc"></canvas><button class="chart-zoom-btn" onclick="openChartZoom()" title="expand chart">⤢ zoom</button></div>
      <div id="assess-side" style="height:168px;overflow:hidden"></div>
    </div>`;
  }

  const assessH=isQ?buildAssessment(months,s):'';

  // IDR + lang switcher widget (shared between 36-month header and quarter label bar)
  const idrWidget=`<div style="display:flex;align-items:center;gap:5px;background:var(--sf2);border:0.5px solid var(--bd2);padding:2px 8px;font-size:9px">
    <span style="color:var(--tx3)">USD/IDR</span>
    <span style="font-weight:700;color:var(--tx)" id="idr-rate-val">Rp${Math.round(IDR_LIVE).toLocaleString()}</span>
    <span style="color:var(--tx3)" id="idr-rate-time">${IDR_TIME?'upd '+IDR_TIME:''}</span>
    <button onclick="fetchIDR(true)" title="refresh" style="background:transparent;border:none;color:var(--acc2);font-size:13px;cursor:pointer;padding:0;line-height:1" id="idr-refresh">↻</button>
    <span style="width:1px;height:12px;background:var(--bd2);display:inline-block;margin:0 2px"></span>
    <button id="lang-en-btn" onclick="setLang('en')" style="font-size:9px;font-weight:700;padding:1px 6px;border:0.5px solid ${LANG==='en'?'var(--acc)':'var(--bd2)'};background:${LANG==='en'?'var(--acc)':'transparent'};color:${LANG==='en'?'#fff':'var(--tx2)'};cursor:pointer">EN</button>
    <button id="lang-id-btn" onclick="setLang('id')" style="font-size:9px;font-weight:700;padding:1px 6px;border:0.5px solid ${LANG==='id'?'var(--acc)':'var(--bd2)'};background:${LANG==='id'?'var(--acc)':'transparent'};color:${LANG==='id'?'#fff':'var(--tx2)'};cursor:pointer">ID</button>
  </div>`;

  const togH=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
    <div class="tog" id="vt" style="margin-bottom:0">
      <button class="tb ${VIEW==='guide'?'on':''}" onclick="setView('guide',this)">📖 guide book</button>
      <button class="tb ${VIEW==='sum'?'on':''}" onclick="setView('sum',this)">monthly summary</button>
      <button class="tb ${VIEW==='det'?'on':''}" onclick="setView('det',this)">full trade detail</button>
      <button class="tb ${VIEW==='fund'?'on':''}" onclick="setView('fund',this)">📡 funding rates</button>
    </div>
    <span style="font-size:9px;color:var(--tx3);font-style:italic">${t('label_hint')}</span>
    ${isQ?idrWidget:''}
  </div>`;

  const topBody=mh+(wipeBanner||bustBanner)+`<div class="note" style="${IS_WIPED?'border-color:#E24B4A;background:#FCEBEB':''}">${IS_WIPED?'':noteText}</div>`+chartH+(isQ?assessH:'');
  rc.innerHTML=`<div class="top-panel" id="top-panel">
    <div style="display:flex;align-items:stretch;gap:0;width:100%;margin-bottom:6px">
      <button id="back-to-member" class="spot-badge back" onclick="backToMemberArea()">← back<span class="spot-badge-sub">member area</span></button>
      <button class="top-panel-toggle" onclick="toggleTopPanel()" style="flex:1;margin-bottom:0"><span class="tp-dots"><span class="tp-dot"></span><span class="tp-dot"></span><span class="tp-dot"></span></span><span class="tp-arrow">▾</span> <span id="tp-lbl">hide overview</span> <span class="tp-arrow" style="transform:none">▾</span><span class="tp-dots"><span class="tp-dot"></span><span class="tp-dot"></span><span class="tp-dot"></span></span></button>
      <span id="spot-badge" class="spot-badge ${s.SPOT?'spot':'lev'}" style="margin:0;margin-right:8px;border-left:none;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:0 6px 6px 0">${s.SPOT?'◈ spot dashboard':'⚡ leverage dashboard'}<span class="spot-badge-sub">current mode</span></span>
    </div>
    <div class="top-panel-body" id="top-panel-body" style="max-height:2000px;opacity:1"><div class="top-panel-body-inner">${topBody}</div></div>
  </div>`+togH+`<div class="tw"><table id="tbl"></table></div><div id="guide-content" style="display:none"></div><div id="fund-content" style="display:none;padding:0 4px"></div><p class="ft">${LANG==='id'?'liq% = akun ÷ notional × 100 · lebih tinggi = lebih aman · target = 0 → trade dilewati':'liq% = account ÷ notional × 100 · higher = safer · set target = 0 to skip trade'}</p>`;
  _applyTopPanel();

  // if chart already exists, transplant the live canvas back in so we don't recreate it
  if(ch && !isQ){
    const gcSlot=document.getElementById('gc');
    if(gcSlot && gcSlot.parentNode){
      // replace the fresh blank canvas with the live one
      if(ch.canvas && ch.canvas !== gcSlot){
        gcSlot.parentNode.replaceChild(ch.canvas, gcSlot);
        ch.canvas.id='gc';
      }
    }
  }

  if(!isQ){
    const lbs=['start',...months.map(r=>r.lb)];
    const d1=[s.P,...months.map(r=>r.eA)];
    const d2=[null,...months.map(r=>r.banked>0?r.banked:null)];
    const d3=[s.P,...months.map(r=>r.nw)];
    const _cs=getComputedStyle(document.body);
    const _acc=_cs.getPropertyValue('--acc').trim()||'#185fa5';
    if(ch){
      ch.data.labels=lbs;
      ch.data.datasets[0].data=d1;
      ch.data.datasets[1].data=d2; ch.data.datasets[1].borderColor=_acc;
      ch.data.datasets[2].data=d3;
      ch.update('none');
    }
    else{
      ch=new Chart(document.getElementById('gc').getContext('2d'),{
        type:'line',
        data:{labels:lbs,datasets:[
          {label:'account',data:d1,borderColor:'#1D9E75',pointRadius:0,borderWidth:2,tension:.4,fill:false},
          {label:'banked', data:d2,borderColor:_acc,pointRadius:0,borderWidth:1.5,tension:.4,fill:false,borderDash:[5,3]},
          {label:'NW',     data:d3,borderColor:'#BA7517',pointRadius:0,borderWidth:1.5,tension:.4,fill:false},
        ]},
        options:{responsive:true,maintainAspectRatio:false,
          spanGaps:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw?` ${c.dataset.label}: ${fmt(c.raw)}`:null}}},
          scales:{
            x:{grid:{display:false},ticks:{font:{size:9},color:'#888',maxTicksLimit:12,autoSkip:true}},
            y:{type:'logarithmic',grid:{color:'rgba(128,128,128,0.07)'},ticks:{font:{size:9},color:'#888',
              callback:v=>{
                const mk=[50,100,500,1000,5000,10000,50000,100000,500000,1e6,5e6,1e7,1e8,1e9];
                if(mk.some(x=>Math.abs(v-x)/(x||1)<0.06)){
                  if(v>=1e9)return'$'+(v/1e9).toFixed(1)+'B';
                  if(v>=1e6)return'$'+(v/1e6).toFixed(1)+'M';
                  if(v>=1000)return'$'+(v/1000).toFixed(0)+'k';
                  return'$'+v;
                }return null;
              }
            }}
          }
        }
      });
    }
  } // end if(!isQ) chart block
  // watch chart container for size changes and auto-resize chart
  if(!isQ){
    // also listen to window resize
    if(!window._chartWinResize){
      window._chartWinResize=()=>{if(ch) requestAnimationFrame(()=>ch.resize());};
      window.addEventListener('resize',window._chartWinResize);
    }
    const cw=document.querySelector('#gc')?.parentElement;
    if(cw && window.ResizeObserver){
      if(window._chartResizeObserver) window._chartResizeObserver.disconnect();
      window._chartResizeObserver=new ResizeObserver(()=>{
        if(ch) requestAnimationFrame(()=>ch.resize());
      });
      window._chartResizeObserver.observe(cw);
    }
  }
  // apply error animation if needed
  if(!isQTab(TAB)) _applyChartErrorStyle();
  try{
    if(!isQ){
      const aside=document.getElementById('assess-side');
      if(aside) aside.innerHTML=buildAssessmentCards(months,s);
      // force chart resize after monitor card is populated — layout may have shifted
      if(ch) requestAnimationFrame(()=>{ ch.resize(); });
    } else {
      // quarterly tab — destroy chart cleanly if it exists
      if(ch){ch.destroy();ch=null;}
    }
  }catch(e){console.warn('assess cards error:',e);}
  // animate changed metric values
  document.querySelectorAll('.mvv[data-key]').forEach(el=>{
    const key=el.dataset.key;
    if(_oldVals[key]&&_oldVals[key]!==el.textContent){
      const wasUp=parseFloat(el.textContent.replace(/[^0-9.-]/g,''))>parseFloat((_oldVals[key]||'0').replace(/[^0-9.-]/g,''));
      el.classList.remove('flash-up','flash-down');
      void el.offsetWidth;
      el.classList.add(wasUp?'flash-up':'flash-down');
    }
  });
  renderTbl(months);
  // sync guide/table/fund visibility after render rebuilds DOM
  const _gc=document.getElementById('guide-content');
  const _fc=document.getElementById('fund-content');
  const _tbl=document.getElementById('tbl');
  if(VIEW==='guide'){
    if(_tbl) _tbl.style.display='none';
    if(_fc) _fc.style.display='none';
    if(_gc){_gc.style.display='';renderGuide();}
  } else if(VIEW==='fund'){
    if(_tbl) _tbl.style.display='none';
    if(_gc) _gc.style.display='none';
    if(_fc){ _fc.style.display=''; frRender(); }
  } else {
    if(_gc) _gc.style.display='none';
    if(_fc) _fc.style.display='none';
    if(_tbl) _tbl.style.display='';
  }
  // Re-show back button for logged-in users (render() recreates it with display:none)
  if(typeof AUTH_TOKEN !== 'undefined' && AUTH_TOKEN){
    const backBtn=document.getElementById('back-to-member');
    if(backBtn) backBtn.style.display='flex';
  }
}

function renderTbl(months){
  if(VIEW==='guide'){renderGuide();return;}
  if(VIEW==='fund'){frRender();return;}
  const tbl=document.getElementById('tbl');if(!tbl)return;
  const s=gs();
  let h='';
  if(VIEW==='sum'){
    h=`<thead><tr>
      <th style="width:14%;text-align:left">month</th>
      <th style="width:13%">start<br><span style="font-weight:400;color:var(--tx3);text-transform:none;letter-spacing:0;font-size:8px">${s.SPOT?'position t1':'notional t1'}</span></th>
      <th style="width:5%;text-align:center">target%<br><span style="font-weight:400;color:var(--tx3);text-transform:none;letter-spacing:0;font-size:8px">kpi total</span></th>
      <th style="width:12%">end<br><span style="font-weight:400;color:var(--tx3);text-transform:none;letter-spacing:0;font-size:8px">acct balance</span></th>
      <th style="width:5%;text-align:center">monthly%</th>
      <th style="width:5%;text-align:center">net gain</th>
      <th style="width:18%;text-align:center">depo / withdrawal ✏️</th>
      <th style="width:6%;text-align:center">banked</th>
      <th style="width:9%">NW</th>
      <th style="width:4%">${s.SPOT?'—':'liq t1'}</th>
      <th style="width:5%">${s.SPOT?'—':'liq last'}</th>
      <th style="width:4%;text-align:center">risk</th>
    </tr></thead><tbody>`;
    months.forEach(mo=>{
      if(mo.isZ){
        h+=`<tr class="zero-row" style="cursor:pointer" onclick="toggleZeroMonth(${mo.m})" title="click to remove zero month">
          <td><input class="lbl-sum" value="${getML(mo.m)}" placeholder="e.g. JAN 26" oninput="this.value=this.value.toUpperCase()" onchange="onMonthLabel(${mo.m},this.value.toUpperCase())" onclick="event.stopPropagation();this.select()"></td>
          <td>${fmt(mo.sA)}</td>
          <td colspan="10" style="text-align:center;font-size:10px;color:var(--tx3)">⊘ zero month · no trades · <span style="color:var(--acc);font-size:9px">click to activate</span></td>
        </tr>`;
        return;
      }
      const gain=mo.gAF-mo.sA;
      const actTr=mo.trades.filter(t=>!t.skip);
      const l1=mo.liqT1||0;
      const _lastT=actTr.length?actTr[actTr.length-1]:null;
      const ll=_lastT?(_lastT.hasActual&&_lastT.not>0?_lastT.accAF/_lastT.not*100:_lastT.liq):0;
      const wdVal=s.WD[mo.m]||0;
      const depoVal=(s.DEPO&&s.DEPO[mo.m])||0;
      // Wipe state: show error row instead of calculated values
      if(IS_WIPED){
        const fmVal = s.NOT/s.LEV/s.P*100;
        const isFmError = fmVal > 100;
        h+=`<tr class="wipe-row">
          <td>${getML(mo.m)}</td>
          <td colspan="11" style="font-size:10px;letter-spacing:.02em">${isFmError?'🚫':'💸'} ${lbl_w?(isFmError?'setup tidak valid — FM% > 100%, posisi tidak bisa dibuka':'setup tidak valid — liq% < 1%, tidak ada nilai yang bisa dihitung'):(isFmError?'invalid setup — FM% > 100%, position cannot be opened':'invalid setup — liq% < 1%, no values can be calculated')}</td>
        </tr>`;
        return;
      }
      // Bust state: withdrawal exceeded balance — keep row editable so user can fix it
      if(mo.bust){
        h+=`<tr style="background:#1a0a2e">
          <td style="text-align:left;padding:6px 8px"><input class="lbl-sum" value="${getML(mo.m)}" onchange="onMonthLabel(${mo.m},this.value)" onclick="this.select()" style="width:72px;color:#c084fc;border-bottom-color:#8B5CF6"></td>
          <td style="color:#888;font-size:10px">${fmt(mo.sA)}</td>
          <td style="color:#E24B4A;font-size:10px;font-weight:700">💀 busted</td>
          <td colspan="4" style="color:#c084fc;font-size:9px;font-style:italic">withdrew ${fmt(mo.wd)} · only had ${fmt(mo.gAF)}</td>
          <td style="padding:6px 5px">
            <div class="wd-cell"><input type="number" class="wd-inp active" id="wd-inp-${mo.m}" value="${mo.wd||''}" min="0" step="1" placeholder="0" onchange="onWdInline(${mo.m},this.value)" onblur="onWdInline(${mo.m},this.value)" style="border-color:#8B5CF6;background:#2a0a4a;color:#c084fc;font-weight:700"></div>
          </td>
          <td colspan="4" style="color:#8B5CF6;font-size:9px;text-align:center">← fix withdrawal to resume simulation</td>
        </tr>`;
        return;
      }
      h+=`<tr>
        <td style="white-space:nowrap"><input class="lbl-sum" value="${getML(mo.m)}" placeholder="e.g. JAN 26" oninput="this.value=this.value.toUpperCase()" onchange="onMonthLabel(${mo.m},this.value.toUpperCase())" onclick="this.select()" style="width:72px"> <span title="jump to full detail" onclick="event.stopPropagation();jumpToDetail(${mo.m})" style="cursor:pointer;font-size:9px;color:var(--acc2);padding:1px 4px;border:0.5px solid var(--acc2);border-radius:3px;user-select:none;margin-left:2px" onmouseover="this.style.background='var(--btno)'" onmouseout="this.style.background='transparent'">→</span> <span onclick="toggleZeroMonth(${mo.m})" title="set as zero month" style="cursor:pointer;font-size:9px;color:var(--tx3);padding:1px 4px;border:0.5px solid var(--bd2);border-radius:3px;user-select:none" onmouseover="this.style.color='var(--acc)'" onmouseout="this.style.color='var(--tx3)'">⊘</span> <span onclick="removeMonthTable(${mo.m})" title="delete month table" style="cursor:pointer;font-size:9px;color:var(--tx3);padding:1px 4px;border:0.5px solid var(--bd2);border-radius:3px;user-select:none;margin-left:2px" onmouseover="this.style.color='#E24B4A';this.style.borderColor='#E24B4A'" onmouseout="this.style.color='var(--tx3)';this.style.borderColor='var(--bd2)'">✕</span>${mo.mp>1?'<span style="background:#EAF3DE;color:#3B6D11;font-size:9px;padding:1px 4px;border-radius:3px;font-weight:700;margin-left:2px">⚡'+mo.mp.toFixed(1)+'×</span>':''}</td>
        <td>${fmt(mo.sA)}${mo.depo>0?'<br><span style="font-size:8px;color:#00c47a;font-weight:700">+'+fmt(mo.depo)+'</span>':''}</td>
        <td style="text-align:center">${(()=>{
          const _act=mo.trades.filter(t=>!t.skip);
          const _allLk=_act.length>0&&_act.every(t=>t.hasActual);
          const _projTgt=_act.reduce((a,t)=>a+t.tgt,0);
          if(_allLk){
            const _actTgt=_act.reduce((a,t)=>a+(t.not>0?(t.actualCp/t.not*100):0),0);
            return `<span style="color:var(--tx3);text-decoration:line-through;font-size:8px;opacity:.45">${_projTgt.toFixed(1)}%</span><br><span style="color:${_actTgt>=0?'#00c47a':'#E24B4A'};font-weight:800;font-size:10px">${_actTgt.toFixed(1)}%</span>`;
          }
          return `<span style="font-size:10px;font-weight:700;color:var(--acc)">${_projTgt.toFixed(1)}%</span>`;
        })()}</td>
        <td style="color:var(--acc2);font-weight:700">${mo.wd>0?'<span style="color:var(--tx2);font-size:10px">'+fmt(mo.gA)+'</span> <span style="color:#E24B4A;font-size:9px">−'+fmt(mo.wd)+'</span><br><span style="font-weight:700">'+fmt(mo.eA)+'</span>':fmt(mo.eA)}</td>
        <td>${mo.pct.toFixed(1)}%</td>
        <td>+${fmt(gain)}</td>
        <td><div class="wd-cell" style="flex-wrap:wrap;gap:3px;justify-content:center"><div style="display:flex;align-items:center;gap:2px"><span style="font-size:9px;color:var(--acc);font-weight:800">+</span><input type="number" class="depo-inp${depoVal>0?' active':''}" id="depo-inp-${mo.m}" value="${depoVal||''}" min="0" step="1" placeholder="depo" onchange="onDepoInline(${mo.m},this.value)" onblur="onDepoInline(${mo.m},this.value)" style="width:52px;padding:2px 4px;font-size:10px"></div><div style="display:flex;align-items:center;gap:2px"><span style="font-size:9px;color:#ff8888;font-weight:800">−</span><input type="number" class="wd-inp${wdVal>0?' active':''}" id="wd-inp-${mo.m}" value="${wdVal||''}" min="0" step="1" placeholder="wd" onchange="onWdInline(${mo.m},this.value)" onblur="onWdInline(${mo.m},this.value)" style="width:52px;padding:2px 4px;font-size:10px"></div>${(()=>{
  const _avail=mo.gAF||mo.eA||0;
  const _gain=_avail-(mo.sA||0);
  const _ov=wdVal>_avail;
  const _ue=!_ov&&_gain>=0&&wdVal>_gain&&wdVal>0;
  const _liq=mo.postLiq!==null&&!s.SPOT;
  if(_ov) return '<span style="font-size:8px;padding:1px 4px;border-radius:3px;font-weight:700;background:#A32D2D;color:#fff">⚠ busts account</span>';
  if(_ue) return '<span style="font-size:8px;padding:1px 4px;border-radius:3px;font-weight:700;background:#854F0B;color:#fff">'+(s.SPOT?'draining capital':'wd > gains')+' (earned '+fmt(_gain)+')</span>';
  if(_liq) return '<span style="font-size:8px;padding:1px 4px;border-radius:3px;font-weight:700;background:'+(mo.postLiq<20?'#A32D2D':mo.postLiq<40?'#854F0B':'#1a3a1a')+';color:'+(mo.postLiq<20?'#fff':mo.postLiq<40?'#EF9F27':'#5DC96A')+'">liq→'+mo.postLiq.toFixed(0)+'%'+(mo.postLiq<20?' ⚠ DANGER':mo.postLiq<40?' ⚠':'')+'</span>';
  return '';
})()}</div></td>
        <td style="color:var(--acc)">${fmt(mo.banked)}</td>
        <td style="font-weight:700">${fmt(mo.nw)}</td>
        <td style="color:${s.SPOT?'var(--tx3)':lc(l1)};font-weight:700">${s.SPOT?'◈':l1.toFixed(0)+'%'}</td>
        <td style="color:${s.SPOT?'var(--tx3)':lc(ll)};font-weight:700">${s.SPOT?'◈':ll.toFixed(0)+'%'}</td>
        <td>${s.SPOT?'<span style="color:#5DC96A;font-size:9px">◈ spot</span>':rtag(l1)}</td>
      </tr>
      `;
    });
    // show halted rows for months after bust
    if(bustMonth){
      const total=getTotalMonths();
      for(let mm=bustMonth.m+1;mm<=total;mm++){
        h+=`<tr style="opacity:.35">
          <td style="color:var(--tx3);font-style:italic;padding:4px 8px">${getML(mm)||getMLabel(mm)}</td>
          <td colspan="11" style="color:var(--tx3);font-size:9px;text-align:center;font-style:italic">— halted · account busted at ${getML(bustMonth.m)} · fix withdrawal above to resume —</td>
        </tr>`;
      }
    }
    // + add month table button row
    if(!IS_WIPED){
      h+=`<tr style="background:var(--bg);border-top:1px solid var(--bd2)">
        <td colspan="12" style="text-align:center;padding:10px 8px">
          <button onclick="addMonthTable()" style="background:transparent;border:0.5px dashed var(--bd2);color:var(--acc2);border-radius:4px;padding:5px 14px;font-size:9px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;transition:all .2s" onmouseover="this.style.borderColor='var(--acc2)';this.style.background='var(--btno)'" onmouseout="this.style.borderColor='var(--bd2)';this.style.background='transparent'">+ add month table (${getML(getTotalMonths()+1)})</button>
        </td>
      </tr>`;
    }
  } else {
    h=`<colgroup><col style="width:13%"><col style="width:9%"><col style="width:7%"><col style="width:5%"><col style="width:5%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:7%"><col style="width:8%"><col style="width:8%"></colgroup><thead><tr>
      <th style="text-align:left;width:13%">trade</th>
      <th style="width:9%">${s.SPOT?'position size':'notional'}<div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">${s.SPOT?'entry size':'margin × lev'}</div></th>
      <th style="width:7%">${s.SPOT?'pos size':'margin'}<div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">${s.SPOT?'capital used':'notional ÷ lev'}</div></th>
      <th style="width:5%">${s.SPOT?'—':'fm%'}<div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">${s.SPOT?'':'margin ÷ acc × 100'}</div></th>
      <th style="width:5%">${s.SPOT?'◈':'liq%'}<div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">${s.SPOT?'no liq':'acc ÷ notional × 100'}</div></th>
      <th style="width:7%;text-align:center">target%<div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">${s.SPOT?'price move %':'% gain on notional'}</div></th>
      <th style="width:7%;text-align:center">exit<div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">actual % logged</div></th>
      <th style="width:7%;padding:4px 4px">gross profit<br><span style="font-weight:400;font-size:7px;text-transform:none;color:var(--tx3)">single trade</span><div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">notional × tgt%</div></th>
      <th style="width:6%;color:#E24B4A;padding:4px 4px">fee paid<div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">(open+close) + funding</div></th>
      <th style="width:6%;color:var(--acc2);padding:4px 4px">net pnl<br><span style="font-weight:400;font-size:7px;text-transform:none;color:var(--acc2);opacity:.8">post-fee</span><div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">gross − all fees</div></th>
      <th style="width:6%;color:var(--tx2);padding:5px 5px">acct bal<br><span style="font-weight:400;font-size:7px;text-transform:none">${s.SPOT?'gross':'pre-fee'}</span><div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">bal + gross pnl</div></th>
      <th style="width:7%;color:var(--acc2);padding:5px 5px">acct bal<br><span style="font-weight:400;font-size:7px;text-transform:none">post-fee</span><div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">deployable balance</div></th>
      <th style="width:8%;color:#5b7fff;padding:5px 5px;text-align:center">actual balance result<div style="font-size:6px;font-weight:400;color:var(--tx3);margin-top:1px;opacity:.8">from journal</div></th>
      <th style="width:8%;padding:5px 5px;text-align:center">note</th>
    </tr></thead><tbody>`;
    months.forEach(mo=>{
      if(mo.isZ){
        h+=`<tr class="mh-z" style="cursor:pointer" onclick="toggleZeroMonth(${mo.m})" title="click to remove zero month">
          <td colspan="13" style="text-align:left">${getML(mo.m)} · ⊘ zero month · account: ${fmt(mo.sA)} · <span style="color:var(--acc);font-size:9px">click to activate</span></td>
        </tr>`;
        return;
      }
      const actTr=mo.trades.filter(t=>!t.skip);
      const l1=mo.liqT1||0;
      const _lastActTr=actTr.length?actTr[actTr.length-1]:null;
      const ll=_lastActTr?(_lastActTr.hasActual&&_lastActTr.not>0?_lastActTr.accAF/_lastActTr.not*100:_lastActTr.liq):0;
      const wdVal=s.WD[mo.m]||0;
      const depoVal=(s.DEPO&&s.DEPO[mo.m])||0;
      if(IS_WIPED){
        const fmVal = s.NOT/s.LEV/s.P*100;
        const isFmError = fmVal > 100;
        h+=`<tr class="wipe-row"><td style="text-align:left">${getML(mo.m)}</td><td colspan="13">${isFmError?'🚫':'💸'} ${lbl_w?(isFmError?'setup tidak valid — FM% > 100%':'setup tidak valid — liq% < 1%'):(isFmError?'invalid setup — FM% > 100%':'invalid setup — liq% < 1%')}</td></tr>`;
        return;
      }
      if(mo.bust){
        h+=`<tr style="background:#1a0a2e">
          <td style="text-align:left;padding:6px 8px"><input class="lbl-in" value="${getML(mo.m)}" onchange="onMonthLabel(${mo.m},this.value)" onclick="this.select()" style="color:#c084fc;border-bottom-color:#8B5CF6"></td>
          <td style="color:#888;font-size:9px">${fmt(mo.sA)}</td>
          <td colspan="7" style="color:#c084fc;font-size:9px;font-style:italic">💀 busted — withdrew ${fmt(mo.wd)} · only had ${fmt(mo.gAF)} after fees</td>
          <td colspan="2" style="color:#8B5CF6;font-size:9px;text-align:center">fix withdrawal ↓</td>
          <td colspan="2" style="padding:6px 5px;text-align:right">
            <input type="number" class="wd-inp active" id="wd-inp-d-${mo.m}" value="${mo.wd||''}" min="0" step="1" placeholder="0" onchange="onWdInline(${mo.m},this.value)" onblur="onWdInline(${mo.m},this.value)" style="width:60px;border-color:#8B5CF6;background:#2a0a4a;color:#c084fc;font-weight:700">
          </td>
        </tr>`;
        return;
      }
      const mLabel=getML(mo.m);
      const isCollapsed = s.CM && (s.CM instanceof Set ? s.CM.has(mo.m) : Array.isArray(s.CM) ? s.CM.includes(mo.m) : false);
      const monthFeeTotal=mo.trades.filter(t=>!t.skip).reduce((a,t)=>a+(t.feePaid||0),0);
      const endDisp=mo.wd>0?'<span style="opacity:.75;font-size:9px">'+fmt(mo.gA)+'</span><span style="color:#ff8888;font-size:9px"> −'+fmt(mo.wd)+'</span> → <b>'+fmt(mo.eA)+'</b>':'<b>'+fmt(mo.eA)+'</b>';
      // month header — values aligned under exact column headers (13 cols)
      // col1:label+⊘ | col2:start | col3:push(under margin) | col4:empty | col5:liq-range | col6-7:empty | col8:gain | col9:empty | col10:fees | col11:end(under net) | col12:empty | col13:wd
      h+=`<tr class="mh">
        <td style="text-align:left;padding:4px 4px 4px 6px">
          <div style="display:flex;align-items:center;gap:3px">
            <button class="mo-toggle-btn ${isCollapsed?'closed':'open'}" data-mo="${mo.m}" onclick="toggleMonth(${mo.m})" title="collapse/expand">${isCollapsed?'▸':'▾'}</button>
            <input class="lbl-in" value="${mLabel}" placeholder="e.g. JAN 26" oninput="this.value=this.value.toUpperCase()" onchange="onMonthLabel(${mo.m},this.value.toUpperCase())" onclick="this.select()" style="width:56px">
            <span onclick="toggleZeroMonth(${mo.m})" title="zero month" style="cursor:pointer;font-size:8px;color:var(--mhs);opacity:.6;padding:0 3px;border:0.5px solid var(--mhs);border-radius:2px;user-select:none">⊘</span>
            <span onclick="removeMonthTable(${mo.m})" title="delete month table" style="cursor:pointer;font-size:8px;color:var(--mhs);opacity:.6;padding:0 3px;border:0.5px solid var(--mhs);border-radius:2px;user-select:none;margin-left:2px" onmouseover="this.style.color='#E24B4A';this.style.borderColor='#E24B4A';this.style.opacity='1'" onmouseout="this.style.color='var(--mhs)';this.style.borderColor='var(--mhs)';this.style.opacity='.6'">✕</span>
          </div>
        </td>
        <td style="font-size:9px;padding:4px 5px">
          <div style="font-size:7px;color:var(--mhs);opacity:.8;margin-bottom:1px">start · acc balance</div>
          <b>${fmt(mo.sA)}</b>
          ${mo.depo>0?'<div style="font-size:8px;color:var(--mhs);font-weight:700;margin-top:1px">depo +'+fmt(mo.depo)+'</div>':''}
        </td>
        <td style="font-size:9px;padding:4px 5px">
          <div style="font-size:7px;color:var(--mhs);opacity:.8;margin-bottom:1px">${s.SPOT?'size×':'push×'}</div>
          <div style="display:flex;align-items:center;gap:3px">
            <input type="number" class="mp-inp${(s.MP[mo.m]||1)>1?' active':''}" id="mp-inp-d-${mo.m}" value="${s.MP[mo.m]>1?s.MP[mo.m]:''}" min="1" step="any" placeholder="1" onchange="onMP(${mo.m},this.value)" onblur="onMP(${mo.m},this.value)" oninput="dInput(this,v=>onMP(${mo.m},v),500)" style="width:34px;padding:1px 3px;font-size:9px;border:0.5px solid var(--mhs);border-radius:8px;background:transparent;color:var(--mhc);font-weight:700;-moz-appearance:textfield">
            ${mo.mp>1?'<span style="font-size:7px;background:#EAF3DE;color:#3B6D11;padding:0 3px;border-radius:2px;font-weight:700">⚡'+mo.mp.toFixed(1)+'×</span>':''}
          </div>
        </td>
        <td></td>
        <td style="font-size:9px;padding:4px 5px">
          <div style="font-size:7px;color:var(--mhs);opacity:.8;margin-bottom:1px">${s.SPOT?'◈ no liq%':'liq t1 → last'}</div>
          <b>${s.SPOT?'<span style="color:#5DC96A;font-size:8px">spot mode</span>':l1.toFixed(0)+'%→'+ll.toFixed(0)+'%'}</b>
        </td>
        <td colspan="2"></td>
        <td style="font-size:9px;padding:4px 5px">
          <div style="font-size:7px;color:var(--mhs);opacity:.8;margin-bottom:1px">monthly gross</div>
          <b>+${mo.pct.toFixed(1)}%</b>
          <div style="font-size:7px;color:var(--mhs);opacity:.6">pre-fee</div>
        </td>
        <td></td>
        <td style="font-size:9px;padding:4px 5px">
          <div style="font-size:7px;color:var(--mhs);opacity:.8;margin-bottom:1px">month fees</div>
          <b style="color:#ff8888">−${fmt(monthFeeTotal)}</b>
          <div style="font-size:7px;color:var(--mhs);opacity:.6">2×${gs().FEE.method}</div>
        </td>
        <td style="font-size:9px;padding:4px 5px">
          <div style="font-size:7px;color:var(--mhs);opacity:.8;margin-bottom:1px">end · acc balance</div>
          <b>${fmt(mo.eA)}</b>
          ${mo.wd>0?'<div style="font-size:8px;color:#ff8888;margin-top:1px">wd −'+fmt(mo.wd)+'</div>':''}
        </td>
        <td></td>
        <td style="font-size:9px;text-align:right;padding:4px 5px">
          <div style="display:flex;gap:6px;justify-content:flex-end;align-items:flex-end">
            <div>
              <div style="font-size:7px;color:var(--mhs);opacity:.85;margin-bottom:2px;font-weight:700">depo +$</div>
              <input type="number" class="depo-inp${depoVal>0?' active':''}" id="depo-inp-d-${mo.m}" value="${depoVal||''}" min="0" step="1" placeholder="0" onchange="onDepoInline(${mo.m},this.value)" onblur="onDepoInline(${mo.m},this.value)" style="width:48px;padding:2px 3px;font-size:10px">
            </div>
            <div>
              <div style="font-size:7px;color:var(--mhs);opacity:.85;margin-bottom:2px;font-weight:700">withdraw -$</div>
              <input type="number" class="wd-inp${wdVal>0?' active':''}" id="wd-inp-d-${mo.m}" value="${wdVal||''}" min="0" step="1" placeholder="0" onchange="onWdInline(${mo.m},this.value)" onblur="onWdInline(${mo.m},this.value)" style="width:48px;padding:2px 3px;font-size:10px">
            </div>
          </div>
        </td>
        <td></td>
        <td></td>
      </tr>
      <tr class="mo-subhdr${isCollapsed?' mo-collapsed':''}" data-mo="${mo.m}" style="background:var(--bg)">
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;text-align:left;border-bottom:0.5px solid var(--bd2)">trade</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">${s.SPOT?'size':'notional'}</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">${s.SPOT?'size':'margin'}</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">${s.SPOT?'—':'fm%'}</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">${s.SPOT?'◈':'liq%'}</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2);text-align:center">tgt%</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2);text-align:center">exit</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">gross</td>
        <td style="font-size:7px;color:#E24B4A;text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">fee</td>
        <td style="font-size:7px;color:var(--acc2);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">net pnl</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">bal pre-fee</td>
        <td style="font-size:7px;color:var(--acc2);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2)">bal post-fee</td>
        <td style="font-size:7px;color:#5b7fff;text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2);text-align:center">actual balance result</td>
        <td style="font-size:7px;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;padding:2px 5px;border-bottom:0.5px solid var(--bd2);text-align:center">note</td>
      </tr>`;
      mo.trades.forEach(t=>{
        const tLabel=getTL(mo.m,t.no);
        if(t.skip){
          if(!GLOBAL_MODE){
            const mt=gs().MT[mo.m];
            const btVal=mt?mt.bt[t.no-1]:0;
            h+=`<tr class="skip-row mo-body${isCollapsed?' mo-collapsed':''}" data-mo="${mo.m}">
              <td style="padding-left:8px;text-align:left"><input class="lbl-in lbl-trade" value="${tLabel}" oninput="this.value=this.value.toUpperCase()" onchange="onTradeLabel(${mo.m},${t.no},this.value.toUpperCase())" placeholder="trade ${t.no}..." onchange="onTradeLabel(${mo.m},${t.no},this.value)" onclick="this.select()"></td>
              <td colspan="4" style="color:var(--tx3);font-size:9px;font-style:italic">skipped</td>
              <td><div class="tg-cell" style="width:54px"><button class="tg-btn" onclick="manStep('bt',${mo.m},${t.no-1},-0.5)" tabindex="-1">−</button><input type="number" id="mbt-${mo.m}-${t.no-1}" value="${btVal}" min="-500" max="500" step="0.5" placeholder="tgt%" style="flex:1;min-width:0;padding:1px 0;font-size:9px;text-align:center;border:none;background:transparent;color:var(--acc);font-weight:700;-moz-appearance:textfield" oninput="dInput(this,v=>onManualBT(${mo.m},${t.no-1},v),400)"><button class="tg-btn" onclick="manStep('bt',${mo.m},${t.no-1},0.5)" tabindex="-1">+</button></div></td>
              <td colspan="7" style="color:var(--tx3);font-size:9px;text-align:center;font-style:italic">set target > 0 to activate</td>
              <td></td>
              <td></td>
            </tr>`;
          } else {
            h+=`<tr class="skip-row mo-body${isCollapsed?' mo-collapsed':''}" data-mo="${mo.m}"><td style="padding-left:10px;text-align:left;color:var(--tx3);font-size:9px">${tLabel}</td><td colspan="11" style="text-align:center"><span class="sk">skipped · target = 0</span></td><td></td><td></td></tr>`;
          }
          return;
        }
        const isT1Push=t.no===1&&mo.mp>1;
        const feePaid=t.feePaid||0;
        const netCp=t.cp-feePaid;
        const liqAF=s.SPOT?999:t.accAF/t.not*100;
        const netCol=netCp>=0?'var(--acc2)':'#E24B4A';
        const liqAFc=liqAF<20?'#A32D2D':liqAF<40?'#E24B4A':'var(--tx3)';
        const lk=isLocked(mo.m,t.no);
        const ha=t.hasActual; // has actual journal data
        // outcome class: green=hit or exceeded, red=miss/loss, orange=partial
        let outcomeClass='';
        if(lk&&ha){
          if(t.actualCp>=0&&t.tgt>0&&(t.actualCp+t.actualFee)>=(t.projCp*0.9)) outcomeClass='actual-hit';
          else if(t.actualCp>=0) outcomeClass='actual-neutral';
          else outcomeClass='actual-miss';
        }
        const lkRowAttr=lk?('class="locked-row mo-body'+(isCollapsed?' mo-collapsed':'')+( outcomeClass?' '+outcomeClass:'')+'" data-mo="'+mo.m+'"'):'class="mo-body'+(isCollapsed?' mo-collapsed':'')+'" data-mo="'+mo.m+'"'+(isT1Push?' style="background:rgba(96,192,48,0.06)"':'');
        // before→after helper: strikethrough proj, show actual in color
        const ba=(projVal,actualVal,actualColor)=>
          ha?`<span style="color:var(--tx3);text-decoration:line-through;font-size:8px;opacity:.45">${projVal}</span><br><span style="color:${actualColor};font-weight:800;font-size:10px">${actualVal}</span>`
            :projVal;
        const actNetPnl=ha?t.actualCp:null;
        const actFee=ha?t.actualFee:null;
        const actCol=ha?(actNetPnl>=0?'#00c47a':'#E24B4A'):netCol;
        const actAccAF=ha?t.accAF:null;
        const _draft=ljFindDraft&&ljFindDraft(mo.m,t.no);
        const isDraft=!!_draft;
        h+=`<tr ${lkRowAttr}>
          <td style="padding-left:6px;text-align:left">
            <div style="display:flex;align-items:center;gap:4px">
              <button class="lock-btn${lk?' locked':isDraft?' draft':''}" onclick="toggleLock(${mo.m},${t.no})" title="${lk?'🔒 locked · cannot undo':isDraft?'📝 open position · click to close & lock':'mark as executed'}" style="${lk?'cursor:default;':isDraft?'border-color:#f59e0b;color:#f59e0b;background:rgba(245,158,11,0.08);':''}">
                ${lk?'🔒':isDraft?'📝':'○'}
              </button>
              <input class="lbl-in lbl-trade${lk?' locked-overlay':''}" value="${tLabel}" placeholder="trade ${t.no}..." onchange="onTradeLabel(${mo.m},${t.no},this.value)" onclick="this.select()"${lk?' disabled':''}>
            </div>
          </td>
          <td style="font-weight:600;${isT1Push?'color:var(--acc2)':''}">${fmt(t.not)}${isT1Push?' <span style="font-size:7px;background:#EAF3DE;color:#3B6D11;padding:0 3px;border-radius:2px;font-weight:700">⚡</span>':''}</td>
          <td style="color:var(--acc)">${s.SPOT?'<span style="color:var(--tx3);font-size:9px">n/a</span>':fmt(t.am)}</td>
          <td>${s.SPOT?'<span style="color:var(--tx3);font-size:9px">n/a</span>':t.fm.toFixed(1)+'%'}</td>
          <td style="color:${lc(t.liq)};font-weight:700">${s.SPOT?'<span style="color:#5DC96A;font-size:9px">◈</span>':t.liq.toFixed(1)+'%'}</td>
          <td style="text-align:center">${lk
            ?(ha
              ?`<span style="color:var(--tx3);text-decoration:line-through;font-size:8px;opacity:.45">${t.tgt.toFixed(2)}%</span><br><span style="color:${actNetPnl>=0?'#00c47a':'#E24B4A'};font-weight:800;font-size:10px">${t.not>0?(actNetPnl/t.not*100).toFixed(2):'0.00'}%</span>`
              :'<span class="locked-overlay" style="font-size:9px">'+t.tgt.toFixed(2)+'%</span>')
            :(!GLOBAL_MODE
              ?'<div class="tg-cell" style="width:54px"><button class="tg-btn" onclick="manStep(\'bt\','+mo.m+','+(t.no-1)+',-0.5)" tabindex="-1">−</button><input type="number" id="mbt-'+mo.m+'-'+(t.no-1)+'" value="'+((gs().MT[mo.m]?.bt[t.no-1]??t.tgt/s.KPI)).toFixed(1)+'" min="-500" max="500" step="0.5" style="flex:1;min-width:0;padding:1px 0;font-size:9px;text-align:center;border:none;background:transparent;color:var(--acc);font-weight:700;-moz-appearance:textfield" oninput="dInput(this,v=>onManualBT('+mo.m+','+(t.no-1)+',v),400)"><button class="tg-btn" onclick="manStep(\'bt\','+mo.m+','+(t.no-1)+',0.5)" tabindex="-1">+</button></div>'
              :t.tgt.toFixed(2)+'%')}</td>
          <td style="text-align:center;padding:4px 3px">
            ${lk
              ?`<span style="font-size:9px;color:var(--tx2);font-weight:600">${(gs().MT[mo.m]?.exitTypes?.[t.no])||t.exit||'—'}</span>`
              :`<select onchange="onTradeExit(${mo.m},${t.no},this.value)" style="width:100%;background:var(--sf2);border:0.5px solid var(--bd2);border-radius:4px;color:var(--tx2);font-size:9px;padding:2px 3px;font-family:inherit;outline:none;cursor:pointer;-webkit-appearance:none;text-align:center">
                <option value=""${!t.exit?' selected':''}>—</option>
                <option value="price"${t.exit==='price'?' selected':''}>price</option>
                <option value="signal"${t.exit==='signal'?' selected':''}>signal</option>
                <option value="conditional"${t.exit==='conditional'?' selected':''}>conditional</option>
              </select>`
            }
          </td>

          <td style="color:${t.tgt<0?'#E24B4A':'var(--acc2)'}">
            ${ha?ba(fmt(t.projCp),fmt(actNetPnl+actFee),actNetPnl+actFee>=0?'#00c47a':'#E24B4A'):(t.tgt>=0?'+':'')+fmt(t.sp)}
          </td>
          <td style="color:#E24B4A">
            ${ha?ba('−'+fmt(t.projFee),'−'+fmt(actFee),'#E24B4A'):('−'+fmt(feePaid))}
            <div style="font-size:7px;color:var(--tx3);opacity:.7">2×${gs().FEE.method}</div>
          </td>
          <td style="font-weight:700">
            ${ha?ba((t.projCp-t.projFee>=0?'+':'')+fmt(t.projCp-t.projFee),(actNetPnl>=0?'+':'')+fmt(actNetPnl),actCol):(netCp>=0?'+':'')+fmt(netCp)}
          </td>
          <td style="color:var(--tx3);font-size:10px">${s.SPOT?'<span style="color:var(--tx3);font-size:9px">n/a</span>':fmt(t.accA)}</td>
          <td style="font-weight:700">
            ${fmt(t.projAccAF||t.accAF)}
            <div style="font-size:7px;color:var(--tx3)">proj. balance</div>
          </td>
          <td style="text-align:center;padding:3px 4px;font-size:10px;font-weight:700">
            ${ha?`<span style="color:${actNetPnl>=0?'#00c47a':'#E24B4A'}">${fmt(t.accAF)}</span><div style="font-size:7px;color:var(--tx3);font-weight:400">real balance</div>`:''}
          </td>
          <td style="text-align:center;padding:3px 4px">
            ${lk?(()=>{
              const _ap=ha?t.actualCp:null;
              const _af=ha?t.actualFee:0;
              const _proj=t.projCp||t.cp||0;
              let _col='var(--tx3)',_tip='pending';
              if(ha&&_ap!==null){
                if(_ap<0){_col='#E24B4A';_tip='loss';}
                else if(_ap===0||(_ap>0&&(_ap+_af)<_af)){_col='#555';_tip='breakeven';}
                else if(_ap>0&&(_ap+_af)>=_proj*0.9){_col='#1D9E75';_tip='win';}
                else{_col='#EF9F27';_tip='partial';}
              }
              return `<div style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%">
                <span title="${_tip}" style="width:7px;height:7px;border-radius:50%;background:${_col};display:inline-block;flex-shrink:0;cursor:default"></span>
                <button onclick="ljJumpToJournal(${mo.m},${t.no})" title="open in journal" style="font-size:8px;padding:1px 5px;border-radius:3px;border:0.5px solid #5b7fff;background:rgba(91,127,255,0.08);color:#5b7fff;cursor:pointer;font-family:inherit;white-space:nowrap" onmouseover="this.style.background='rgba(91,127,255,0.2)'" onmouseout="this.style.background='rgba(91,127,255,0.08)'">→ journal</button>
              </div>`;
            })():''}
          </td>
        </tr>`;
      });
      // dynamic + add trade button row for this month
      if(!mo.isZ && !IS_WIPED){
        const canDelLast = mo.trades.length > 1 && !isLocked(mo.m, mo.trades.length);
        h+=`<tr class="mo-body${isCollapsed?' mo-collapsed':''}" data-mo="${mo.m}" style="background:rgba(255,255,255,0.015)">
          <td colspan="14" style="text-align:left;padding:5px 8px">
            <div style="display:flex;align-items:center;gap:6px">
              <button onclick="addTradeSlot(${mo.m})" style="background:transparent;border:0.5px dashed var(--bd2);color:var(--acc2);border-radius:4px;padding:3px 9px;font-size:8px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:3px;transition:all .2s" onmouseover="this.style.borderColor='var(--acc2)';this.style.background='var(--btno)'" onmouseout="this.style.borderColor='var(--bd2)';this.style.background='transparent'">+ add trade to ${getML(mo.m)} (T${mo.trades.length+1})</button>
              ${canDelLast ? `<button onclick="removeTradeSlot(${mo.trades.length-1},${mo.m})" style="background:transparent;border:0.5px solid var(--bd2);color:var(--tx3);border-radius:4px;padding:3px 7px;font-size:8px;cursor:pointer;font-family:inherit;transition:all .2s" onmouseover="this.style.color='#E24B4A';this.style.borderColor='#E24B4A'" onmouseout="this.style.color='var(--tx3)';this.style.borderColor='var(--bd2)'" title="remove last trade T${mo.trades.length}">− remove T${mo.trades.length}</button>` : ''}
            </div>
          </td>
        </tr>`;
      }
      // month end separator — colored bar + spacer before next month
      if(!mo.isZ&&!IS_WIPED){
        const gain=mo.gAF!==undefined?(mo.gAF-mo.sA):0;
        const netPct=mo.gAF!==undefined?((mo.gAF-mo.sA)/mo.sA*100):mo.pct;
        const netAfterAll=(mo.eA-mo.sA)/mo.sA*100;
        const netCol2=netAfterAll>=0?'#7eb8f7':'#f07070';
        const grossCol=mo.pct>=0?'#5DC96A':'#E24B4A';
        const sb='background:#111827;border-top:1px solid #1e2a3a;border-bottom:1px solid #1e2a3a;padding:10px 8px;vertical-align:middle';
        const wdRound=Math.round(mo.wd);
        h+=`<tr class="mo-sep${isCollapsed?' mo-collapsed':''}" data-mo="${mo.m}">
          <!-- col1: label + net -->
          <td style="${sb};text-align:left;padding-left:12px">
            <div style="font-size:8px;font-weight:700;color:#6b7fa8;letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">end of ${getML(mo.m)}</div>
            <div style="font-size:9px;color:${netCol2};font-weight:600">${netAfterAll>=0?'+':''}${netAfterAll.toFixed(1)}% net</div>
          </td>
          <td style="${sb}"></td>
          <td style="${sb}"></td>
          <td style="${sb}"></td>
          <td style="${sb}"></td>
          <td style="${sb}"></td>
          <td style="${sb}"></td>
          <!-- col8: gross profit → monthly gross -->
          <td style="${sb};text-align:right;padding-right:8px">
            <div style="font-size:7px;color:#fff;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">monthly gross</div>
            <div style="font-size:12px;font-weight:700;color:${grossCol};line-height:1">${mo.pct>=0?'+':''}${mo.pct.toFixed(1)}%</div>
            <div style="font-size:7px;color:#fff;margin-top:3px">pre-fee</div>
          </td>
          <!-- col9: fee paid → month fees -->
          <td style="${sb};text-align:right;padding-right:8px">
            <div style="font-size:7px;color:#fff;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">month fees</div>
            <div style="font-size:12px;font-weight:700;color:#E24B4A;line-height:1">−${fmt(mo.feePaid||0)}</div>
            <div style="font-size:7px;color:#fff;margin-top:3px">2×${gs().FEE.method}</div>
          </td>
          <!-- col10: net pnl → empty -->
          <td style="${sb}"></td>
          <!-- col11: acct bal pre-fee → empty -->
          <td style="${sb}"></td>
          <!-- col12: acct bal post-fee → end balance -->
          <td style="${sb};text-align:right;padding-right:12px">
            <div style="font-size:7px;color:#fff;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">end · acc balance</div>
            <div style="font-size:12px;font-weight:700;color:#8ab4e8;line-height:1">${fmt(mo.eA)}</div>
            <div style="font-size:7px;color:#fff;margin-top:3px">${mo.wd>0?'wd −$'+wdRound:'&nbsp;'}</div>
          </td>
          <!-- col13: actual result → empty -->
          <td style="${sb}"></td>
          <!-- col14: note → empty -->
          <td style="${sb}"></td>
        </tr>
        <tr class="mo-gap${isCollapsed?' mo-collapsed':''}" data-mo="${mo.m}"><td colspan="14" style="height:10px;background:var(--bg);border:none;padding:0"></td></tr>`;
      }
    });
    if(!IS_WIPED){
      h+=`<tr style="background:var(--bg);border-top:1px solid var(--bd2)">
        <td colspan="14" style="text-align:center;padding:12px 8px">
          <button onclick="addMonthTable()" style="background:transparent;border:0.5px dashed var(--bd2);color:var(--acc2);border-radius:4px;padding:6px 16px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;transition:all .2s" onmouseover="this.style.borderColor='var(--acc2)';this.style.background='var(--btno)'" onmouseout="this.style.borderColor='var(--bd2)';this.style.background='transparent'">+ add month table (${getML(getTotalMonths()+1)})</button>
        </td>
      </tr>`;
    }
  }
  if(VIEW!=='guide') tbl.innerHTML=h+'</tbody>';
}

// ── TAB / THEME ──
function setTab(t){
  TAB=t;
  if(!S[TAB])S[TAB]=mkState(); // safety: ensure state exists
  renderTabBar();
  ch=null;
  initGrid();
  syncControls();
  const _pr=document.querySelector('.panel-right');
  const _rc=document.getElementById('right-content');
  if(_rc){_rc.style.transition='opacity .18s ease,transform .18s ease';_rc.style.opacity='0';_rc.style.transform='translateY(4px)';}
  render();
  if(_pr) _pr.scrollTop=0;
  if(_rc) requestAnimationFrame(()=>requestAnimationFrame(()=>{
    _rc.style.opacity='1';_rc.style.transform='translateY(0)';
    setTimeout(()=>{_rc.style.transition='opacity .15s ease';},200);
  }));
}

function setTheme(t,btn){
  THEME=t;
  document.body.className=t;
  document.querySelectorAll('.th-btn').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  try{localStorage.setItem('batt_theme',t);}catch(e){}
  // destroy chart so it picks up new CSS color vars on rebuild
  if(ch){if(ch._errorPulse){clearInterval(ch._errorPulse);ch._errorPulse=null;}ch.destroy();ch=null;}
  const _pr=document.querySelector('.panel-right');
  const _sy=_pr?_pr.scrollTop:0;
  const _rc=document.getElementById('right-content');
  if(_rc) _rc.style.opacity='.5';
  render();
  if(_pr) _pr.scrollTop=_sy;
  if(_rc) requestAnimationFrame(()=>{_rc.style.opacity='1';});
}

function setView(v,btn){
  VIEW=v;
  document.getElementById('vt')?.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');
  const tbl=document.getElementById('tbl');
  const gc=document.getElementById('guide-content');
  const fc=document.getElementById('fund-content');
  if(v==='guide'){
    if(tbl) tbl.style.display='none';
    if(fc) fc.style.display='none';
    if(gc){gc.style.display='';renderGuide();}
    return;
  }
  if(v==='fund'){
    if(tbl) tbl.style.display='none';
    if(gc) gc.style.display='none';
    if(fc){fc.style.display='';frInit();}
    return;
  }
  // switching back from guide/fund — show table
  if(gc) gc.style.display='none';
  if(fc) fc.style.display='none';
  if(tbl) tbl.style.display='';
  if(!tbl){render();return;}
  renderTbl(sim());
}

function renderGuide(){
  const gc=document.getElementById('guide-content');
  if(!gc)return;
  const html=LANG==='id'?GUIDE_HTML_ID:GUIDE_HTML;
  gc.innerHTML=`<div class="guide-wrap">${html}</div>`;
}

// ── FUNDING RATE MONITOR ──
var _frData={};        // {symbol: {binance,bybit,okx,nextTs}}
var _frPrevData={};    // snapshot before last fetch — for cell flash
var _frSparkHistory={}; // {symbol: [{ts,rate},...]} last 24h from binance
var _frPinned=new Set(JSON.parse(localStorage.getItem('batt_fr_pinned')||'[]'));
var _frSearch='';
var _frTimer=null;
var _frLastFetch=0;
var _frFetching=false;

const _FR_DEFAULTS=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT'];

async function frFetchAll(){
  if(_frFetching) return;
  _frFetching=true;
  _frLastFetch=Date.now();
  frSetStatus('fetching...');
  // snapshot for cell flash
  _frPrevData={};
  Object.keys(_frData).forEach(s=>{ _frPrevData[s]={..._frData[s]}; });
  try{
    await Promise.allSettled([frFetchBinance(),frFetchBybit(),frFetchOKX(),frFetchGate()]);
    // fetch sparkline history for defaults (last 24h from binance)
    frFetchSparks();
  }catch(e){}
  _frFetching=false;
  frRender();
  frSetStatus('updated '+new Date().toLocaleTimeString());
}

async function frFetchSparks(){
  const now=Date.now();
  const start=now-24*60*60*1000;
  await Promise.allSettled(_FR_DEFAULTS.map(async sym=>{
    try{
      const url=`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&startTime=${start}&endTime=${now}&limit=20`;
      const r=await fetch(url);
      const d=await r.json();
      if(Array.isArray(d)&&d.length>0){
        _frSparkHistory[sym]=d.map(x=>({ts:parseInt(x.fundingTime),rate:parseFloat(x.fundingRate)*100}));
      }
    }catch(e){}
  }));
  // re-render once sparks are ready so the 24h column fills in
  if(VIEW==='fund') frRender();
}

async function frFetchBinance(){
  try{
    const r=await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    const d=await r.json();
    (d||[]).forEach(x=>{
      const sym=x.symbol;
      if(!_frData[sym]) _frData[sym]={};
      _frData[sym].binance=parseFloat(x.lastFundingRate)*100;
      _frData[sym].nextTs=parseInt(x.nextFundingTime);
    });
  }catch(e){}
}

async function frFetchBybit(){
  try{
    const r=await fetch('https://api.bybit.com/v5/market/tickers?category=linear&limit=200');
    const d=await r.json();
    ((d.result&&d.result.list)||[]).forEach(x=>{
      if(!x.fundingRate) return;
      // skip non-USDT pairs (MOODENGPERP, BTCUSDC, inverse contracts, etc.)
      if(!x.symbol.endsWith('USDT')) return;
      const sym=x.symbol;
      if(!_frData[sym]) _frData[sym]={};
      _frData[sym].bybit=parseFloat(x.fundingRate)*100;
      if(!_frData[sym].nextTs&&x.nextFundingTime) _frData[sym].nextTs=parseInt(x.nextFundingTime);
    });
  }catch(e){}
}

async function frFetchOKX(){
  try{
    const r=await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP');
    const d=await r.json();
    const tops=_FR_DEFAULTS.map(s=>s.replace('USDT','-USDT-SWAP'));
    await Promise.allSettled(tops.map(async instId=>{
      try{
        const fr=await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`);
        const fd=await fr.json();
        const row=(fd.data||[])[0];
        if(!row) return;
        const sym=instId.replace('-USDT-SWAP','USDT');
        if(!_frData[sym]) _frData[sym]={};
        _frData[sym].okx=parseFloat(row.fundingRate)*100;
      }catch(e){}
    }));
  }catch(e){}
}

async function frFetchGate(){
  // gate.io tickers endpoint — has live funding_rate, better CORS than contracts
  const tried=new Set();
  const applyTickers=(arr)=>{
    arr.forEach(x=>{
      const raw=x.contract||x.name||'';
      const sym=raw.replace(/_/g,'');
      if(!sym.endsWith('USDT')) return;
      const rate=x.funding_rate??x.last_funding_rate;
      if(rate==null) return;
      if(!_frData[sym]) _frData[sym]={};
      _frData[sym].gate=parseFloat(rate)*100;
    });
  };
  // 1. tickers (live, has funding_rate, usually CORS-ok)
  try{
    const r=await fetch('https://api.gateio.ws/api/v4/futures/usdt/tickers',{headers:{'Accept':'application/json'}});
    if(r.ok){
      const d=await r.json();
      if(Array.isArray(d)&&d.length>0){ applyTickers(d); tried.add('tickers'); }
    }
  }catch(e){}
  // 2. contracts endpoint via allorigins proxy (reliable free CORS proxy)
  if(!tried.has('tickers')){
    try{
      const url='https://api.allorigins.win/raw?url='+encodeURIComponent('https://api.gateio.ws/api/v4/futures/usdt/tickers');
      const r=await fetch(url);
      if(r.ok){
        const d=await r.json();
        if(Array.isArray(d)&&d.length>0){ applyTickers(d); tried.add('proxy'); }
      }
    }catch(e){}
  }
  // 3. corsproxy.io fallback
  if(!tried.has('tickers')&&!tried.has('proxy')){
    try{
      const url='https://corsproxy.io/?url='+encodeURIComponent('https://api.gateio.ws/api/v4/futures/usdt/tickers');
      const r=await fetch(url);
      if(r.ok){
        const d=await r.json();
        if(Array.isArray(d)&&d.length>0) applyTickers(d);
      }
    }catch(e){}
  }
}

function frSetStatus(msg){
  const el=document.getElementById('fr-status');
  if(el) el.textContent=msg;
}

var _frSortCol='avg';   // binance|bybit|okx|gate|avg|annualized
var _frSortDir=1;       // 1=desc -1=asc
var _frFilter='all';    // all|extreme|negative|positive|nearzero

function frSortBy(col){
  if(_frSortCol===col) _frSortDir*=-1;
  else { _frSortCol=col; _frSortDir=1; }
  frRender();
}

function frSetFilter(f){
  _frFilter=f;
  frRender();
}

function frSparkSVG(sym){
  const pts=_frSparkHistory[sym];
  if(!pts||pts.length<2) return '<div style="width:56px;height:18px;background:var(--sf,#181818);border-radius:3px;animation:skeleton-pulse 1.4s ease infinite"></div>';
  const rates=pts.map(p=>p.rate);
  const mn=Math.min(...rates), mx=Math.max(...rates);
  const range=mx-mn||0.0001;
  const W=56,H=18;
  const coords=rates.map((r,i)=>{
    const x=(i/(rates.length-1))*W;
    const y=H-((r-mn)/range)*(H-2)-1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last=rates[rates.length-1];
  const col=last>0?'#00c47a':'#ff4466';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block"><polyline points="${coords}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function frCopyArb(sym,d,diverge){
  const fee=gs()?.FEE||{maker:0.02,taker:0.05};
  const vals=[[d.binance,'binance'],[d.bybit,'bybit'],[d.okx,'okx'],[d.gate,'gate.io']].filter(([v])=>v!=null);
  if(vals.length<2){showToast('not enough exchange data to copy arb','info');return;}
  vals.sort((a,b)=>b[0]-a[0]);
  const [highRate,highEx]=vals[0];
  const [lowRate,lowEx]=vals[vals.length-1];
  const spread=(highRate-lowRate).toFixed(4);
  const feeCost=(fee.taker*2).toFixed(4);
  const intervalsNeeded=feeCost/spread;
  const coin=sym.replace('USDT','');
  const txt=`── arb setup: ${coin} ──\nshort ${coin} on ${highEx} → receive +${highRate.toFixed(4)}% funding\nlong  ${coin} on ${lowEx} → pay    +${lowRate.toFixed(4)}% funding\nnet spread per interval: +${spread}%\nfee cost (2× taker): ${feeCost}%\nbreak-even: ${intervalsNeeded<1?'< 1':intervalsNeeded.toFixed(1)} interval(s) to cover fees\nnote: rates reset every 8h — confirm spread still holds before entry`;
  navigator.clipboard.writeText(txt).then(()=>showToast('arb setup copied to clipboard ✓','success',2500)).catch(()=>showToast('copy failed — check clipboard permissions','info'));
}

function frFmtRate(v, maxAbs, sym, exKey){
  if(v==null||isNaN(v)) return _frFetching
    ?'<div style="width:52px;height:14px;background:var(--sf,#181818);border-radius:3px;animation:skeleton-pulse 1.4s ease infinite;margin-left:auto"></div>'
    :'<span style="color:var(--tx3,#333)">—</span>';
  const abs=Math.abs(v);
  const c=v>0.1?'#00e87a':v>0.01?'#00c47a':v>0?'#4ecf8a':v<-0.1?'#ff4466':v<-0.01?'#e05555':'#aa3333';
  const sign=v>=0?'+':'';
  const barW=maxAbs>0?Math.min(100,abs/maxAbs*100):0;
  const barC=v>=0?'rgba(0,232,122,0.35)':'rgba(255,68,102,0.35)';
  const prev=sym&&exKey&&_frPrevData[sym]?_frPrevData[sym][exKey]:null;
  const changed=prev!=null&&Math.abs(v-prev)>0.00005;
  const flashUp=changed&&v>prev;
  const flashDn=changed&&v<prev;
  const flashStyle=flashUp?'animation:frFlashUp .8s ease-out':flashDn?'animation:frFlashDn .8s ease-out':'';
  return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;${flashStyle}">
    <span style="color:${c};font-weight:700;font-size:11px">${sign}${v.toFixed(4)}%</span>
    <div style="width:48px;height:3px;background:var(--bd,#1a1a1a);border-radius:2px;overflow:hidden">
      <div style="width:${barW}%;height:100%;background:${barC};border-radius:2px;transition:width .3s"></div>
    </div>
  </div>`;
}

function frFmtAnnualized(v){
  if(v==null||isNaN(v)) return '<span style="color:#2a2a2a">—</span>';
  const ann=v*3*365;
  const c=ann>50?'#00e87a':ann>10?'#00c47a':ann>0?'#4ecf8a':ann<-50?'#ff4466':ann<-10?'#e05555':'#aa3333';
  const sign=ann>=0?'+':'';
  return `<span style="color:${c};font-weight:600;font-size:10px">${sign}${ann.toFixed(1)}%</span>`;
}

function frFmtCountdown(ts){
  if(!ts) return '<span style="color:var(--tx3,#333)">—</span>';
  const ms=ts-Date.now();
  if(ms<=0) return '<span style="color:#EF9F27;font-weight:700">now</span>';
  const h=Math.floor(ms/3600000);
  const m=Math.floor((ms%3600000)/60000);
  const urgent=ms<3600000;
  return `<span style="color:${urgent?'#EF9F27':'var(--tx2,#555)'};font-weight:${urgent?'700':'400'}">${h}h ${m}m</span>`;
}

function frTogglePin(sym){
  if(_frPinned.has(sym)) _frPinned.delete(sym);
  else _frPinned.add(sym);
  try{localStorage.setItem('batt_fr_pinned',JSON.stringify([..._frPinned]));}catch(e){}
  frRender();
}

function frRender(){
  const fc=document.getElementById('fund-content');
  if(!fc||fc.style.display==='none') return;

  // build and filter symbol list
  let syms=Object.keys(_frData);
  if(_frSearch){ const q=_frSearch.toUpperCase(); syms=syms.filter(s=>s.includes(q)); }

  // filter
  syms=syms.filter(sym=>{
    const d=_frData[sym]||{};
    const vals=[d.binance,d.bybit,d.okx,d.gate].filter(v=>v!=null);
    const avg=vals.length?vals.reduce((a,v)=>a+v,0)/vals.length:null;
    if(avg==null) return _frFilter==='all';
    if(_frFilter==='extreme') return Math.abs(avg)>0.1;
    if(_frFilter==='negative') return avg<0;
    if(_frFilter==='positive') return avg>0;
    if(_frFilter==='nearzero') return Math.abs(avg)<=0.01;
    return true;
  });

  // compute avgs for all — needed for sorting + max bar
  const computed=syms.map(sym=>{
    const d=_frData[sym]||{};
    const vals=[d.binance,d.bybit,d.okx,d.gate].filter(v=>v!=null);
    const avg=vals.length?vals.reduce((a,v)=>a+v,0)/vals.length:null;
    const div=avg!=null?Math.abs(avg)*3*365:null; // divergence
    // detect divergence: max-min across exchanges
    const diverge=vals.length>=2?(Math.max(...vals)-Math.min(...vals)):0;
    return {sym,d,avg,div,diverge};
  });

  // max abs for bar scaling
  const maxAbs=Math.max(0.01,...computed.map(x=>Math.abs(x.avg||0)));

  // sort — pinned ignore sort, always top
  const pinnedSet=new Set([..._frPinned].filter(s=>syms.includes(s)));
  const pinnedItems=computed.filter(x=>pinnedSet.has(x.sym));
  const defaultItems=computed.filter(x=>!pinnedSet.has(x.sym)&&_FR_DEFAULTS.includes(x.sym));
  const restItems=computed.filter(x=>!pinnedSet.has(x.sym)&&!_FR_DEFAULTS.includes(x.sym));

  const sortFn=(a,b)=>{
    const getV=(x)=>{
      if(_frSortCol==='binance') return x.d.binance??-999;
      if(_frSortCol==='bybit') return x.d.bybit??-999;
      if(_frSortCol==='okx') return x.d.okx??-999;
      if(_frSortCol==='gate') return x.d.gate??-999;
      if(_frSortCol==='annualized') return x.avg!=null?x.avg*3*365:-999;
      return x.avg??-999; // avg default
    };
    return (getV(b)-getV(a))*_frSortDir;
  };

  defaultItems.sort((a,b)=>{
    // when sorting by avg (default col), preserve CMC rank order for default coins
    if(_frSortCol==='avg') return _FR_DEFAULTS.indexOf(a.sym)-_FR_DEFAULTS.indexOf(b.sym);
    return sortFn(a,b);
  });
  restItems.sort(sortFn);
  const ordered=[...pinnedItems,...defaultItems,...restItems];

  const thBase='padding:8px 10px;font-size:8px;color:var(--tx2,#666);text-transform:uppercase;letter-spacing:.09em;font-weight:700;text-align:right;border-bottom:1px solid var(--bd,#1e1e1e);white-space:nowrap;cursor:pointer;user-select:none;position:sticky;top:0;background:var(--sf,#111);z-index:2';
  const thAct='color:var(--acc,#5b7fff)';
  const sortArrow=(col)=>_frSortCol===col?(_frSortDir===1?' ↓':' ↑'):'';

  const filterBtns=['all','extreme','negative','positive','nearzero'].map(f=>{
    const labels={all:'all',extreme:'extreme >0.1%',negative:'negative',positive:'positive',nearzero:'near zero'};
    const active=_frFilter===f;
    return `<button onclick="frSetFilter('${f}')" style="background:${active?'var(--acc,#5b7fff)':'var(--btn,#111)'};border:1px solid ${active?'var(--acc,#5b7fff)':'var(--bd,#252525)'};border-radius:5px;color:${active?'var(--mhc,#fff)':'var(--tx2,#666)'};font-size:9px;padding:4px 10px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .15s">${labels[f]}</button>`;
  }).join('');

  // ── COIN ICONS ──
  // Strategy: Binance CDN (instant, no API key, covers every Binance-listed coin)
  //           → CoinGecko static map for well-known coins
  //           → letter avatar (never blank)
  // Binance CDN: https://bin.bnbstatic.com/image/admin_mgs_image_upload/20240x/xxx.png
  // Easier: use the public Binance asset service used in their own web app
  const _bnbIcon=(coin)=>`https://bin.bnbstatic.com/static/assets/newcms/${coin.toLowerCase()}.png`;
  // CoinGecko static fallbacks for coins whose Binance CDN path differs
  const _cgStatic={
    BTC:'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
    ETH:'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    BNB:'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
    SOL:'https://assets.coingecko.com/coins/images/4128/small/solana.png',
    XRP:'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
    DOGE:'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
    ADA:'https://assets.coingecko.com/coins/images/975/small/cardano.png',
    AVAX:'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
    SHIB:'https://assets.coingecko.com/coins/images/11939/small/shiba.png',
    LINK:'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
    LTC:'https://assets.coingecko.com/coins/images/2/small/litecoin.png',
    UNI:'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png',
    ATOM:'https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png',
    NEAR:'https://assets.coingecko.com/coins/images/10365/small/near.jpg',
    APT:'https://assets.coingecko.com/coins/images/26455/small/aptos_round.png',
    ARB:'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
    OP:'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
    INJ:'https://assets.coingecko.com/coins/images/7226/small/Injective_symbol_-_colored.jpg',
    DOT:'https://assets.coingecko.com/coins/images/12171/small/polkadot.png',
    MATIC:'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
    TRX:'https://assets.coingecko.com/coins/images/1958/small/tron-xtz.png',
    XLM:'https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png',
    ETC:'https://assets.coingecko.com/coins/images/453/small/ethereum-classic-logo.png',
    BCH:'https://assets.coingecko.com/coins/images/780/small/bitcoin-cash-circle.png',
    SUI:'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg',
    TON:'https://assets.coingecko.com/coins/images/17980/small/ton_symbol.png',
    PEPE:'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg',
    FLOKI:'https://assets.coingecko.com/coins/images/16746/small/PNG_image.png',
    RENDER:'https://assets.coingecko.com/coins/images/11636/small/rndr.png',
    HBAR:'https://assets.coingecko.com/coins/images/3688/small/hbar.png',
    SAND:'https://assets.coingecko.com/coins/images/12129/small/sandbox_logo.jpg',
    MANA:'https://assets.coingecko.com/coins/images/878/small/decentraland-mana.png',
    AXS:'https://assets.coingecko.com/coins/images/13029/small/axie_infinity_logo.png',
    ICP:'https://assets.coingecko.com/coins/images/14495/small/Internet_Computer_logo.png',
    ALGO:'https://assets.coingecko.com/coins/images/4030/small/Algorand.png',
    VET:'https://assets.coingecko.com/coins/images/1167/small/VET_Token_Icon.png',
    XMR:'https://assets.coingecko.com/coins/images/69/small/monero_logo.png',
    FIL:'https://assets.coingecko.com/coins/images/12817/small/filecoin.png',
    AAVE:'https://assets.coingecko.com/coins/images/12645/small/AAVE.png',
    RUNE:'https://assets.coingecko.com/coins/images/6595/small/Rune200x200.png',
    WIF:'https://assets.coingecko.com/coins/images/33566/small/dogwifhat.jpg',
    BONK:'https://assets.coingecko.com/coins/images/28600/small/bonk.jpg',
    NOT:'https://assets.coingecko.com/coins/images/36072/small/notcoin.jpg',
    TAO:'https://assets.coingecko.com/coins/images/28452/small/ARUsPeNQ_400x400.jpg',
    JUP:'https://assets.coingecko.com/coins/images/34188/small/jup.png',
    PYTH:'https://assets.coingecko.com/coins/images/31916/small/pyth.png',
    ENA:'https://assets.coingecko.com/coins/images/36530/small/ethena.png',
    SEI:'https://assets.coingecko.com/coins/images/28205/small/Sei_Logo_-_Transparent.png',
    TIA:'https://assets.coingecko.com/coins/images/31967/small/tia.jpg',
    HYPE:'https://assets.coingecko.com/coins/images/51012/small/hyperliquid.jpg',
    VIRTUAL:'https://assets.coingecko.com/coins/images/36390/small/VIRTUAL.png',
    MOVE:'https://assets.coingecko.com/coins/images/37846/small/movement-logo.png',
    MOODENG:'https://assets.coingecko.com/coins/images/39895/small/moodeng.jpg',
    PNUT:'https://assets.coingecko.com/coins/images/39589/small/pnut.jpg',
    EIGEN:'https://assets.coingecko.com/coins/images/33839/small/eigen.png',
    STRK:'https://assets.coingecko.com/coins/images/26433/small/starknet.png',
    PENDLE:'https://assets.coingecko.com/coins/images/15069/small/Pendle_Logo_Normal-03.png',
    GMX:'https://assets.coingecko.com/coins/images/18323/small/arbit.png',
    DYDX:'https://assets.coingecko.com/coins/images/17500/small/hjnIm9bV.jpg',
    LDO:'https://assets.coingecko.com/coins/images/13573/small/Lido_DAO.png',
    MKR:'https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png',
    SNX:'https://assets.coingecko.com/coins/images/3406/small/SNX.png',
    CRV:'https://assets.coingecko.com/coins/images/12124/small/Curve.png',
    IMX:'https://assets.coingecko.com/coins/images/17233/small/immutableX-symbol-BLK-RGB.png',
    FLOW:'https://assets.coingecko.com/coins/images/13446/small/5f6294c0c7a8cda55cb1c936_Flow_Wordmark.png',
    ZEC:'https://assets.coingecko.com/coins/images/486/small/circle-zcash-color.png',
    DASH:'https://assets.coingecko.com/coins/images/19/small/dash-logo.png',
    KSM:'https://assets.coingecko.com/coins/images/9568/small/m4zRhP5e_400x400.jpg',
    NEO:'https://assets.coingecko.com/coins/images/480/small/NEO_512_512.png',
    KAVA:'https://assets.coingecko.com/coins/images/9761/small/kava.png',
    FET:'https://assets.coingecko.com/coins/images/5681/small/Fetch.jpg',
    W:'https://assets.coingecko.com/coins/images/35087/small/wormhole.png',
    ZK:'https://assets.coingecko.com/coins/images/38043/small/ZKSyncLogo.jpeg',
    STG:'https://assets.coingecko.com/coins/images/24413/small/STG_LOGO.png',
    ORCA:'https://assets.coingecko.com/coins/images/17547/small/Orca_Logo.png',
    MSTR:'https://assets.coingecko.com/coins/images/7230/small/logo.png',
  };
  if(!window._frIconCache) window._frIconCache={};
  const _imgTag=(url,sym)=>`<img src="${url}" data-fr-icon="${sym}" width="16" height="16" style="border-radius:50%;vertical-align:middle;margin-right:5px;flex-shrink:0;object-fit:cover" onerror="_frIconError(this,'${sym}')">`;
  const _letterTag=(sym,coin)=>`<span data-fr-icon="${sym}" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--sf2,#1a1a1a);font-size:7px;font-weight:700;color:var(--tx2,#888);vertical-align:middle;margin-right:5px;flex-shrink:0">${coin.slice(0,2).toUpperCase()}</span>`;
  // called when an img 404s — try next fallback chain
  if(!window._frIconError){
    window._frIconError=function(el,sym){
      const coin=sym.replace('USDT','').toLowerCase();
      const tried=el.dataset.tried||'';
      if(!tried.includes('cg')&&_cgStatic[coin.toUpperCase()]){
        el.dataset.tried=(tried||'')+'cg';
        el.src=_cgStatic[coin.toUpperCase()];
      } else if(!tried.includes('jsdelivr')){
        el.dataset.tried=(tried||'')+'jsdelivr';
        el.src=`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/32/color/${coin}.png`;
      } else {
        // all CDNs failed — replace with letter avatar
        el.dataset.tried=(tried||'')+'fail';
        const span=document.createElement('span');
        span.setAttribute('data-fr-icon',sym);
        span.style.cssText='display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--sf2,#1a1a1a);font-size:7px;font-weight:700;color:var(--tx2,#888);vertical-align:middle;margin-right:5px;flex-shrink:0';
        span.textContent=coin.slice(0,2).toUpperCase();
        el.replaceWith(span);
      }
    };
  }
  const iconHtml=(sym)=>{
    const coin=sym.replace('USDT','').toLowerCase();
    // cached url from previous render
    if(window._frIconCache[sym]) return _imgTag(window._frIconCache[sym],sym);
    // CoinGecko static map — most reliable for major coins
    if(_cgStatic[coin.toUpperCase()]){
      const url=_cgStatic[coin.toUpperCase()];
      window._frIconCache[sym]=url;
      return _imgTag(url,sym);
    }
    // Binance CDN — covers every Binance-listed coin, instant, no API
    const bnbUrl=_bnbIcon(coin);
    window._frIconCache[sym]=bnbUrl; // optimistic cache; onerror chain handles failures
    return _imgTag(bnbUrl,sym);
  };

  const rows=ordered.map(({sym,d,avg,diverge},i)=>{
    const isPinned=_frPinned.has(sym);
    const isDefault=_FR_DEFAULTS.includes(sym);
    const showDivider=!isPinned&&isDefault&&i===pinnedItems.length&&pinnedItems.length>0;
    // row heat background
    const heat=avg!=null?Math.min(1,Math.abs(avg)/0.15):0;
    const heatBg=avg==null?'':avg>0
      ?`rgba(0,196,122,${heat*0.06})`
      :`rgba(224,85,85,${heat*0.06})`;
    // arb spread: max - min across available exchanges
    const exVals=[[d.binance,'binance'],[d.bybit,'bybit'],[d.okx,'okx'],[d.gate,'gate']].filter(([v])=>v!=null);
    const spread=exVals.length>=2?Math.max(...exVals.map(([v])=>v))-Math.min(...exVals.map(([v])=>v)):null;
    const fee=typeof gs==='function'?(gs()?.FEE?.taker||0.05):0.05;
    const spreadFmt=spread!=null
      ?`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
          <span style="color:${spread>fee*2?'#EF9F27':spread>0.01?'#888':'#333'};font-weight:700;font-size:10px">${spread>0?'+':''} ${spread.toFixed(4)}%</span>
          ${spread>fee*2?`<span style="font-size:7px;color:#EF9F27;opacity:.7">arb ok</span>`:`<span style="font-size:7px;color:#333">fee: ${(fee*2).toFixed(3)}%</span>`}
        </div>`
      :'<span style="color:#222">—</span>';
    // divergence badge + copy arb button
    const hasDiv=diverge>0.05;
    const divBadge=hasDiv?`<span style="font-size:7px;background:rgba(239,159,39,0.15);color:#EF9F27;padding:1px 4px;border-radius:3px;margin-left:4px;font-weight:700;cursor:pointer" title="copy arb setup" onclick="frCopyArb('${sym}',_frData['${sym}']||{},${diverge.toFixed(5)})">div ⧉</span>`:'';
    // sparkline
    const spark=frSparkSVG(sym);
    return `${showDivider?`<tr><td colspan="10" style="height:1px;background:var(--bd,#1a1a1a);padding:0"></td></tr>`:''}
    <tr style="border-bottom:1px solid var(--bd2,#0f0f0f);background:${isPinned?'rgba(91,127,255,0.05)':heatBg};transition:background .15s" onmouseover="this.style.background='rgba(128,128,128,0.06)'" onmouseout="this.style.background='${isPinned?'rgba(91,127,255,0.05)':heatBg}'">
      <td style="padding:6px 8px;white-space:nowrap">
        <button onclick="frTogglePin('${sym}')" title="${isPinned?'unpin':'pin'}"
          style="background:none;border:none;cursor:pointer;font-size:10px;padding:0 4px 0 0;opacity:${isPinned?'1':'0.2'};transition:opacity .15s"
          onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='${isPinned?'1':'0.2'}'">📌</button>
        ${iconHtml(sym)}<span style="font-size:11px;font-weight:700;color:${isPinned?'var(--acc,#5b7fff)':isDefault?'var(--tx,#ddd)':'var(--tx2,#666)'}">${sym.replace('USDT','')}</span>
        <span style="font-size:8px;color:var(--tx3,#333)">/USDT</span>
        ${divBadge}
      </td>
      <td style="padding:4px 6px;text-align:center">${spark}</td>
      <td style="padding:6px 10px;text-align:right">${frFmtRate(d.binance,maxAbs,sym,'binance')}</td>
      <td style="padding:6px 10px;text-align:right">${frFmtRate(d.bybit,maxAbs,sym,'bybit')}</td>
      <td style="padding:6px 10px;text-align:right">${frFmtRate(d.okx,maxAbs,sym,'okx')}</td>
      <td style="padding:6px 10px;text-align:right">${frFmtRate(d.gate,maxAbs,sym,'gate')}</td>
      <td style="padding:6px 10px;text-align:right;border-left:1px solid var(--bd,#1a1a1a)">${avg!=null?frFmtRate(avg,maxAbs,sym,'avg'):'<span style="color:var(--tx3,#333)">—</span>'}</td>
      <td style="padding:6px 10px;text-align:right">${frFmtAnnualized(avg)}</td>
      <td style="padding:6px 10px;text-align:right">${spreadFmt}</td>
      <td style="padding:6px 10px;text-align:right;font-size:10px">${frFmtCountdown(d.nextTs)}</td>
    </tr>`;
  }).join('');

  fc.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <div style="font-size:13px;font-weight:700;color:var(--tx,#ccc);white-space:nowrap">📡 funding rates</div>
      <div style="position:relative;min-width:140px;max-width:220px;flex:1">
        <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--tx2,#444);font-size:11px;pointer-events:none">🔍</span>
        <input id="fr-search" type="text" placeholder="search..." value="${_frSearch}"
          style="width:100%;background:var(--inp,#111);border:1px solid var(--bd,#1e1e1e);border-radius:6px;color:var(--tx,#ccc);font-size:11px;padding:6px 10px 6px 28px;font-family:inherit;outline:none;box-sizing:border-box"
          oninput="_frSearch=this.value.toUpperCase();frRender()">
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${filterBtns}</div>
      <button onclick="frFetchAll()" style="background:var(--btn,#111);border:1px solid var(--bd,#1e1e1e);border-radius:6px;color:var(--tx2,#555);font-size:10px;padding:5px 10px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .15s"
        onmouseover="this.style.color='var(--tx,#ccc)'" onmouseout="this.style.color='var(--tx2,#555)'">↻ refresh</button>
      <span id="fr-status" style="font-size:9px;color:var(--tx2,#444)"></span>
      <span style="font-size:9px;color:var(--tx3,#333);margin-left:auto;white-space:nowrap">auto 30s · 📌${_frPinned.size}</span>
    </div>
    <div style="overflow-x:auto;border:1px solid var(--bd,#141414);border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="${thBase};text-align:left;cursor:default">symbol</th>
            <th style="${thBase};cursor:default;text-align:center">24h</th>
            <th style="${thBase};${_frSortCol==='binance'?thAct:''}" onclick="frSortBy('binance')">binance${sortArrow('binance')}</th>
            <th style="${thBase};${_frSortCol==='bybit'?thAct:''}" onclick="frSortBy('bybit')">bybit${sortArrow('bybit')}</th>
            <th style="${thBase};${_frSortCol==='okx'?thAct:''}" onclick="frSortBy('okx')">okx${sortArrow('okx')}</th>
            <th style="${thBase};${_frSortCol==='gate'?thAct:''}" onclick="frSortBy('gate')">gate.io${sortArrow('gate')}</th>
            <th style="${thBase};${_frSortCol==='avg'?thAct:''};border-left:1px solid #1a1a1a" onclick="frSortBy('avg')">avg${sortArrow('avg')}</th>
            <th style="${thBase};${_frSortCol==='annualized'?thAct:''}" onclick="frSortBy('annualized')">annualized${sortArrow('annualized')}</th>
            <th style="${thBase};color:#EF9F27;cursor:default" title="max–min spread across exchanges. click 'div' badge to copy arb setup">arb spread</th>
            <th style="${thBase};cursor:default">next fund.</th>
          </tr>
        </thead>
        <tbody>
          ${rows||`<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--tx2,#444);font-size:12px">fetching rates...</td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
      <span style="font-size:8px;color:var(--tx3,#333)">+ = longs pay shorts · − = shorts pay longs · div ⧉ = click to copy arb setup · arb spread = max–min across exchanges</span>
      <span style="font-size:8px;color:var(--tx3,#333)">press <kbd style="background:var(--sf,#1a1a1a);border:1px solid var(--bd,#2a2a2a);border-radius:3px;padding:0 3px;font-size:7px;color:var(--tx,#ccc)">F</kbd> to jump here</span>
    </div>`;
}

function frInit(){
  _FR_DEFAULTS.forEach(s=>{ if(!_frData[s]) _frData[s]={}; });
  frRender();
  // fire both in parallel — sparks will re-render when done
  frFetchAll();
  frFetchSparks();
  if(_frTimer) clearInterval(_frTimer);
  _frTimer=setInterval(()=>{
    if(VIEW==='fund') frFetchAll();
    else { clearInterval(_frTimer); _frTimer=null; }
  },30000);
  setInterval(()=>{ if(VIEW==='fund') frRender(); },60000);
}

// ── CONTROLS ──
function setP(v,btn){
  _captureUndo();const s=gs();
  const ratio=s.NOT/s.P; // preserve current ratio
  s.P=v;
  if(NOT_LINKED){
    s.NOT=Math.round(v*ratio);
    document.getElementById('not-in').value=s.NOT;
    document.getElementById('not-sl').value=Math.min(s.NOT,5000000);
    document.getElementById('not-vl').textContent='$'+s.NOT.toLocaleString();
  }
  document.getElementById('cap-in').value=v;
  document.getElementById('cap-sl').value=Math.min(v,10000000000);
  document.getElementById('cap-vl').textContent='$'+v.toLocaleString();
  document.querySelectorAll('#cap-prs .pr').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');
  saveSection('cap');render();
}
function onCapIn(v){
  if(window._ACTIVE_PRESET){showToast('🔒 exit preset to change setup','info',2000);return;}
  const s=gs();
  const ratio=s.NOT/s.P; // preserve current ratio
  s.P=Math.max(1,parseFloat(v)||s.P);
  if(NOT_LINKED){
    s.NOT=Math.round(s.P*ratio);
    document.getElementById('not-in').value=s.NOT;
    document.getElementById('not-sl').value=Math.min(s.NOT,5000000);
    document.getElementById('not-vl').textContent='$'+s.NOT.toLocaleString();
  }
  document.getElementById('cap-sl').value=Math.min(s.P,10000000000);
  document.getElementById('cap-vl').textContent='$'+s.P.toLocaleString();
  document.querySelectorAll('#cap-prs .pr').forEach(b=>b.classList.remove('on'));saveSection('cap');softUpdate();
}
function onCapSl(v){
  if(window._ACTIVE_PRESET){showToast('🔒 exit preset to change setup','info',2000);return;}
  _captureUndo();const s=gs();
  const ratio=s.NOT/s.P; // preserve current ratio
  s.P=parseInt(v);
  if(NOT_LINKED){
    s.NOT=Math.round(s.P*ratio);
    document.getElementById('not-in').value=s.NOT;
    document.getElementById('not-sl').value=Math.min(s.NOT,5000000);
    document.getElementById('not-vl').textContent='$'+s.NOT.toLocaleString();
  }
  document.getElementById('cap-in').value=s.P;
  document.getElementById('cap-vl').textContent='$'+s.P.toLocaleString();
  document.querySelectorAll('#cap-prs .pr').forEach(b=>b.classList.remove('on'));saveSection('cap');softUpdate();
}
function setLev(v,btn){
  if(window._ACTIVE_PRESET){showToast('🔒 exit preset to change setup','info',2000);return;}
  _captureUndo();const s=gs();s.LEV=v;
  document.getElementById('lv-sl').value=v;document.getElementById('lv-in').value=v;document.getElementById('lv-vl').textContent=v+'×';
  document.querySelectorAll('#lv-prs .pr').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');saveSection('pos');softUpdate();
}
function onLevIn(v){
  if(window._ACTIVE_PRESET){showToast('🔒 exit preset to change setup','info',2000);return;}
  const s=gs();s.LEV=Math.max(1,parseInt(v)||s.LEV);
  document.getElementById('lv-sl').value=Math.min(s.LEV,50);document.getElementById('lv-vl').textContent=s.LEV+'×';
  document.querySelectorAll('#lv-prs .pr').forEach(b=>b.classList.remove('on'));saveSection('pos');softUpdate();
}
function onLevSl(v){
  if(window._ACTIVE_PRESET){showToast('🔒 exit preset to change setup','info',2000);return;}
  _captureUndo();const s=gs();s.LEV=parseInt(v);
  document.getElementById('lv-in').value=s.LEV;document.getElementById('lv-vl').textContent=s.LEV+'×';
  document.querySelectorAll('#lv-prs .pr').forEach(b=>b.classList.remove('on'));saveSection('pos');softUpdate();
}
function onNotIn(v){
  if(window._ACTIVE_PRESET){showToast('🔒 exit preset to change setup','info',2000);return;}
  const s=gs();s.NOT=Math.max(1,parseFloat(v)||s.NOT);
  document.getElementById('not-sl').value=Math.min(s.NOT,100000000000);
  document.getElementById('not-vl').textContent='$'+s.NOT.toLocaleString();
  document.querySelectorAll('#not-prs .pr').forEach(b=>b.classList.remove('on'));saveSection('pos');softUpdate();
}
function onNotSl(v){
  if(window._ACTIVE_PRESET){showToast('🔒 exit preset to change setup','info',2000);return;}
  _captureUndo();const s=gs();s.NOT=parseInt(v);
  document.getElementById('not-in').value=s.NOT;
  document.getElementById('not-vl').textContent='$'+s.NOT.toLocaleString();
  document.querySelectorAll('#not-prs .pr').forEach(b=>b.classList.remove('on'));saveSection('pos');softUpdate();
}
function setNot(v,btn){
  if(window._ACTIVE_PRESET){showToast('🔒 exit preset to change setup','info',2000);return;}
  _captureUndo();const s=gs();s.NOT=v;
  document.getElementById('not-in').value=v;
  document.getElementById('not-sl').value=Math.min(v,100000000000);
  document.getElementById('not-vl').textContent='$'+v.toLocaleString();
  document.querySelectorAll('#not-prs .pr').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');
  saveSection('pos');softUpdate();
}

function _applyChartErrorStyle(){
  try{
  if(!ch||!ch.data||!ch.data.datasets||!ch.data.datasets[0])return;
  // ALWAYS kill interval first — restart only if error
  if(ch._errorPulse){clearInterval(ch._errorPulse);ch._errorPulse=null;}
  const isBust=!!bustMonth;
  const isWiped=IS_WIPED;
  if(isBust||isWiped){
    const col=isBust?'#8B5CF6':'#E24B4A';
    const dash=isBust?[4,4]:[2,2];
    ch.data.datasets[0].borderColor=col;ch.data.datasets[0].borderDash=dash;ch.data.datasets[0].tension=0;
    ch.data.datasets[1].borderColor=col;ch.data.datasets[1].borderDash=dash;ch.data.datasets[1].tension=0;
    ch.data.datasets[2].borderColor=col;ch.data.datasets[2].borderDash=dash;ch.data.datasets[2].tension=0;
    let _tick=0;
    ch._errorPulse=setInterval(()=>{
      _tick++;
      if(ch&&ch.data&&ch.data.datasets[0]){
        const thick=_tick%2===0;
        ch.data.datasets[0].borderWidth=thick?2.5:0.8;
        ch.data.datasets[1].borderWidth=thick?2:0.6;
        ch.data.datasets[2].borderWidth=thick?2:0.6;
        ch.update('none');
      }
    },500);
  } else {
    // fully restore normal — no animation
    const _acc=getComputedStyle(document.body).getPropertyValue('--acc').trim()||'#185fa5';
    ch.data.datasets[0].borderColor='#1D9E75';ch.data.datasets[0].borderDash=[];ch.data.datasets[0].borderWidth=2;ch.data.datasets[0].tension=.4;
    ch.data.datasets[1].borderColor=_acc;ch.data.datasets[1].borderDash=[5,3];ch.data.datasets[1].borderWidth=1.5;ch.data.datasets[1].tension=.4;
    ch.data.datasets[2].borderColor='#BA7517';ch.data.datasets[2].borderDash=[];ch.data.datasets[2].borderWidth=1.5;ch.data.datasets[2].tension=.4;
  }
  }catch(e){console.warn('chart style err:',e);}
}

function jumpToDetail(m){
  // switch to full trade detail view
  setView('det',document.querySelector('#vt .tb:nth-child(3)'));
  // wait for table to render then scroll to that month header
  setTimeout(()=>{
    const tbl=document.getElementById('tbl');
    if(!tbl)return;
    // find the mh row for this month by looking for the label input value
    const rows=tbl.querySelectorAll('tr.mh');
    for(const row of rows){
      const inp=row.querySelector('.lbl-in');
      if(inp&&(inp.value===getML(m)||inp.placeholder===getMLabel(m))){
        row.scrollIntoView({behavior:'smooth',block:'center'});
        // flash highlight
        row.style.outline='2px solid var(--acc2)';
        row.style.outlineOffset='1px';
        setTimeout(()=>{row.style.outline='';row.style.outlineOffset='';},1500);
        break;
      }
    }
  },120);
}

// ── CHART ZOOM ──
let zoomChart=null;
function openChartZoom(){
  if(document.getElementById('chart-zoom-overlay')) return;
  const s=gs();
  const months=sim();
  const lbs=['start',...months.map(r=>r.lb)];
  const d1=[s.P,...months.map(r=>r.eA)];
  const d2=[0,...months.map(r=>r.banked)];
  const d3=[s.P,...months.map(r=>r.nw)];

  const overlay=document.createElement('div');
  overlay.id='chart-zoom-overlay';
  overlay.innerHTML=`<div id="chart-zoom-box" onclick="event.stopPropagation()">
    <button id="chart-zoom-close" onclick="closeChartZoom()">✕ close</button>
    <div style="display:flex;gap:12px;align-items:center;font-size:10px;color:var(--tx2)">
      <span><span style="display:inline-block;width:10px;height:3px;background:#1D9E75;border-radius:2px;margin-right:3px;vertical-align:middle"></span>account</span>
      <span><span style="display:inline-block;width:10px;height:3px;background:var(--acc);border-radius:2px;margin-right:3px;vertical-align:middle"></span>banked</span>
      <span><span style="display:inline-block;width:10px;height:3px;background:#BA7517;border-radius:2px;margin-right:3px;vertical-align:middle"></span>NW</span>
      <span style="font-size:9px;color:var(--tx3)">log scale</span>
    </div>
    <canvas id="chart-zoom-canvas"></canvas>
  </div>`;
  overlay.onclick=closeChartZoom;
  document.body.appendChild(overlay);

  const ctx=document.getElementById('chart-zoom-canvas').getContext('2d');
  zoomChart=new Chart(ctx,{
    type:'line',
    data:{labels:lbs,datasets:[
      {label:'account',data:d1,borderColor:'#1D9E75',pointRadius:0,borderWidth:2,tension:.4,fill:false},
      {label:'banked', data:d2,borderColor:'var(--acc)',pointRadius:0,borderWidth:1.5,tension:.4,fill:false,borderDash:[5,3]},
      {label:'NW',     data:d3,borderColor:'#BA7517',pointRadius:0,borderWidth:1.5,tension:.4,fill:false},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.raw)}`}}},
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10},color:'#888',maxTicksLimit:18,autoSkip:true}},
        y:{type:'logarithmic',grid:{color:'rgba(128,128,128,0.07)'},ticks:{font:{size:10},color:'#888',
          callback:v=>{
            const mk=[50,100,500,1000,5000,10000,50000,100000,500000,1e6,5e6,1e7,1e8,1e9];
            if(mk.some(x=>Math.abs(v-x)/(x||1)<0.06)){
              if(v>=1e9)return'$'+(v/1e9).toFixed(1)+'B';
              if(v>=1e6)return'$'+(v/1e6).toFixed(1)+'M';
              if(v>=1000)return'$'+(v/1000).toFixed(0)+'k';
              return'$'+v;
            }return null;
          }
        }}
      }
    }
  });
  document.addEventListener('keydown',onZoomEsc);
}
function closeChartZoom(){
  if(zoomChart){zoomChart.destroy();zoomChart=null;}
  const ov=document.getElementById('chart-zoom-overlay');
  if(ov) ov.remove();
  document.removeEventListener('keydown',onZoomEsc);
}
function onZoomEsc(e){if(e.key==='Escape')closeChartZoom();}

// ── INIT ──
loadTabRegistry();
loadAll();
initGrid();
syncControls();
renderTabBar();
try{
  const t=localStorage.getItem('batt_theme');
  if(t){THEME=t;document.body.className=t;document.querySelectorAll('.th-btn').forEach(b=>b.classList.toggle('on',b.dataset.t===t));}
}catch(e){}
render();


function goLayer2(){
  const l1=document.getElementById('layer1');
  const l2=document.getElementById('layer2');
  // push sentinel so browser back has somewhere to go
  try{
    if((window.location.hash||'').replace('#','') !== 'risk'){
      try{history.replaceState({batt:'risk'},'','#risk');}catch(e){}
    }
  }catch(e){}
  document.title = 'BATT · Risk Disclosure';
  if(l1 && !l1.classList.contains('hidden')){
    l1.classList.add('out');
    setTimeout(()=>{
      l1.classList.add('hidden');
      if(l2){l2.classList.remove('hidden');requestAnimationFrame(()=>requestAnimationFrame(()=>{l2.style.opacity='1';}));}
    },900);
  } else {
    if(l2){l2.classList.remove('hidden');requestAnimationFrame(()=>requestAnimationFrame(()=>{l2.style.opacity='1';}));}
  }
}
function launchApp(){
  const l2=document.getElementById('layer2');if(!l2)return;
  const lb=l2.querySelector('.launch-btn');
  if(lb && lb.disabled) return;
  if(lb) lb.disabled=true;

  l2.style.transition='none';
  l2.classList.add('hidden');

  window.RISK_SHOWN=true;
  document.body.style.overflow='hidden';
  document.documentElement.style.overflow='auto';

  // show mobile nav only on cockpit
  var mn=document.getElementById('cockpit-mob-nav');
  if(mn) mn.style.display='';

  battNav('cockpit');
  openDashboard();
}