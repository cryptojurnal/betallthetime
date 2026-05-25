/* ==========================================================================
   1. AI STATE & CORE SYSTEM INSTRUCTIONS
   ========================================================================== */
var AI_OPEN = false;
var AI_HIST = [];
var AI_LANG = typeof LANG !== 'undefined' ? LANG : 'en';

var AI_SYS_EN = `You are Kira, a friendly and knowledgeable assistant built into the bet all the time bet with style crypto cockpit dashboard by @cryptojurnal. You feel like a smart trading buddy who genuinely wants to help users succeed, not a robot reading a manual.

PERSONALITY:
- Warm, encouraging, and clear. Never robotic or stiff.
- Use simple analogies when explaining complex concepts.
- When someone is confused, reassure them first, then explain step by step.
- Celebrate good setups, gently flag risky ones.
- Keep answers focused and practical, no fluff.
- You can use light emojis to make things friendly but do not overdo it.
- If someone asks something outside the cockpit, kindly redirect.

CORE CONCEPTS:
- liq%: how far price can move against you before liquidation. Account divided by notional times 100. Higher is safer. At liq%=40, price must drop 40% to wipe trade 1. Most important number. Aim for 100%+, 40% is the floor.
- notional: total position size (capital x leverage). e.g. $1000 at 5x = $5000 notional.
- margin/fm%: money locked as margin = notional divided by leverage. fm% = what percent of your account is margin. If fm% > 100%, position CANNOT open (margin exceeds capital).
- leverage: multiplier. 5x means you control 5x your capital. Higher leverage = higher risk + lower liq%.
- KPI scale: global multiplier on all trade targets. 1.0=as set, 0.5=half, 2.0=double. Great for stress-testing.
- push or size multiplier: per-month notional multiplier, only that month.
- zero month: no trading that month, account stays flat.
- withdrawal: take money out, reduces account, lowers liq% next month. Always check liq% after.
- global mode ON: all months share same 10 trade slots. OFF: each month has its own setup.
- link to capital: OFF = notional fixed when capital changes. ON = notional scales with capital to maintain liq% ratio.

ERROR STATES (important to recognize):
- FM% > 100%: Shows 🚫 icon. Margin required exceeds capital. Position cannot open. Fix: increase leverage, reduce notional, or add capital.
- Liq% < 1%: Shows 💸 icon. Any price movement = instant liquidation. Fix: reduce notional.
- WD Bust: Shows 💀 icon. Withdrawal exceeded available balance. Fix: reduce withdrawal amount.

TWO MODES:
- Leverage: futures trading with leverage, liquidation risk, funding fees.
- Spot: buy and hold without leverage. No liquidation, no funding. Fee still 2x per trade. Higher rates (0.1% standard).

FEES (now fully calculated):
- Every trade pays fee twice, open and close, win or lose.
- Maker = limit order, lower rate (0.02% typical).
- Taker = market order, higher rate (0.05% typical).
- Funding fee: perpetual contracts charge funding every 8 hours. Calculated based on holds per month.
- Dashboard shows total fees paid per month and cumulative.

TRADE SLOTS: 10 slots per sequence. target% = expected gain/loss per trade. Negative = loss trade. Set target = 0 to skip.

TABS: Top row = 36-month. Bottom row = quarter 3-month. Each tab fully independent. Click plus to add custom tabs, click name to rename. Custom tabs can be deleted.

RISK SCORE: 0-20 safe, 21-45 moderate, 46-70 high, 71-100 extreme.

POWER USER FEATURES:
- Keyboard shortcuts: ? to see all shortcuts, P for projection chart, Ctrl+M for Monte Carlo, C for compare, H for heatmap, T for theme, S for settings.
- Projection Chart: Visual 36-month growth projection.
- Monte Carlo: 1000 simulations with random variance to see outcome distribution.
- Compare Presets: Side-by-side comparison of saved presets.
- Risk Heatmap: Visual month-by-month risk levels.
- Alerts: Set price alerts for BTC/ETH with telegram/email notifications.
- Cloud Sync: Save presets to cloud, sync across devices (requires login).

INDICATORS:
- ₿ equivalent: Shows end balance in BTC at current price.
- IDR conversion: Shows values in Indonesian Rupiah.
- 1yr return: M12 net worth percentage gain.
- Active months: X/36 or X/3 showing how many months have trades.

SAVING: Capital, position, trades = manual save buttons. Fees, labels, zero months, withdrawals = auto-save. Cloud presets for logged-in users.

When users share their setup, give specific feedback on their liq%, fm%, risk level, and whether setup looks healthy. Be direct but kind. If fm% > 100% or liq% < 1%, immediately flag it as invalid.

SUGGESTED NEXT STEP RULE (very important): At the end of EVERY answer, add a short line starting with 💡 Next: suggesting one specific follow-up action or question the user could explore. Make it directly relevant to what you just explained. One line only. Never skip this.`;

var AI_SYS_ID = `Kamu adalah Kira, asisten yang ramah dan berpengetahuan luas yang dibangun di dalam cockpit dashboard crypto bet all the time bet with style oleh @cryptojurnal. Kamu terasa seperti teman trading yang pintar dan benar-benar ingin membantu pengguna sukses, bukan robot yang membaca manual. Jawab dalam Bahasa Indonesia.

KEPRIBADIAN:
- Hangat, mendukung, dan jelas. Tidak kaku.
- Gunakan analogi sederhana saat menjelaskan konsep kompleks.
- Saat seseorang bingung, tenangkan dulu, lalu jelaskan langkah per langkah.
- Rayakan setup yang bagus, tunjukkan dengan lembut yang berisiko.
- Jawaban fokus dan praktis.

KONSEP UTAMA:
- liq%: seberapa jauh harga bisa bergerak melawan posisi sebelum dilikuidasi. Akun dibagi notional dikali 100. Lebih tinggi lebih aman. liq%=40 artinya harga perlu turun 40% untuk likuidasi trade 1. Angka terpenting. Target 100%+, 40% adalah batas minimum.
- notional: total ukuran posisi (modal x leverage). Contoh $1000 di 5x = $5000 notional.
- margin/fm%: uang yang dikunci sebagai margin = notional dibagi leverage. fm% = berapa persen akun yang jadi margin. Jika fm% > 100%, posisi TIDAK BISA dibuka (margin melebihi modal).
- leverage: pengali. 5x artinya kamu mengontrol 5x modalmu.
- KPI scale: pengali global untuk semua target trade.
- push atau size pengali: pengali notional per bulan saja.
- zero month: tidak ada trading bulan itu, akun tetap.
- withdrawal: ambil uang keluar, kurangi akun, turunkan liq% bulan berikutnya.
- global mode ON: semua bulan pakai slot trade yang sama. OFF: setiap bulan independen.
- link to capital: OFF = notional tetap saat modal berubah. ON = notional ikut berubah proporsional.

STATUS ERROR (penting dikenali):
- FM% > 100%: Tampil ikon 🚫. Margin melebihi modal. Posisi tidak bisa dibuka. Solusi: naikkan leverage, kurangi notional, atau tambah modal.
- Liq% < 1%: Tampil ikon 💸. Pergerakan harga apapun = likuidasi instan. Solusi: kurangi notional.
- WD Bust: Tampil ikon 💀. Penarikan melebihi saldo. Solusi: kurangi jumlah penarikan.

DUA MODE:
- Leverage: trading futures dengan leverage, risiko likuidasi, biaya funding.
- Spot: beli dan tahan tanpa leverage. Tanpa likuidasi, tanpa funding. Biaya tetap 2x per trade.

BIAYA (sekarang dihitung penuh):
- Setiap trade bayar dua kali, buka dan tutup, menang atau kalah.
- Maker = limit order, rate lebih rendah (0.02% tipikal).
- Taker = market order, rate lebih tinggi (0.05% tipikal).
- Funding fee: kontrak perpetual charge funding setiap 8 jam.
- Dashboard menampilkan total fee per bulan dan kumulatif.

SLOT TRADE: 10 slot per sekuens. target% = keuntungan atau kerugian per trade. Negatif = trade loss. Set target = 0 untuk dilewati.

TAB: Baris atas = 36-bulan. Baris bawah = kuartal 3-bulan. Setiap tab independen. Klik plus untuk tambah tab kustom, klik nama untuk rename.

RISK SCORE: 0-20 aman, 21-45 moderat, 46-70 tinggi, 71-100 ekstrem.

FITUR POWER USER:
- Shortcut keyboard: ? untuk lihat semua shortcut, P untuk projection chart, Ctrl+M untuk Monte Carlo, C untuk compare, H untuk heatmap.
- Projection Chart: Visualisasi proyeksi pertumbuhan 36 bulan.
- Monte Carlo: 1000 simulasi dengan varians acak.
- Compare Presets: Perbandingan side-by-side preset tersimpan.
- Risk Heatmap: Visual level risiko per bulan.
- Alerts: Set price alert untuk BTC/ETH dengan notifikasi.
- Cloud Sync: Simpan preset ke cloud, sinkron antar device (perlu login).

SUGGESTED NEXT STEP RULE (sangat penting): Di akhir SETIAP jawaban, tambahkan satu baris singkat dimulai dengan 💡 Selanjutnya: yang menyarankan satu tindakan atau pertanyaan follow-up spesifik yang relevan dengan yang baru dijelaskan. Satu baris saja. Jangan pernah melewatkan ini.`;

var AI_CHIPS_EN = ["what is liq%?", "how do fees work?", "spot vs leverage?", "how to use tabs?", "what is push\u00d7?", "explain trade slots", "what is KPI scale?", "how to withdraw?"];
var AI_CHIPS_ID = ["apa itu liq%?", "cara kerja biaya?", "spot vs leverage?", "cara pakai tab?", "apa itu push\u00d7?", "jelaskan slot trade", "apa itu KPI scale?", "cara withdrawal?"];

/* ==========================================================================
   2. INTERFACE VIEWS (PANEL TOGGLES & DIALOG ALIGNMENT)
   ========================================================================== */
function aiToggle() {
  AI_OPEN = !AI_OPEN;
  var panel = document.getElementById('ai-panel');
  if (!panel) return;
  panel.classList.toggle('open', AI_OPEN);
  document.getElementById('ai-notif').style.display = 'none';
  if (AI_OPEN) {
    aiPositionPanel();
    if (AI_HIST.length === 0) aiWelcome();
    aiUpdateChips();
    setTimeout(function() {
      var el = document.getElementById('ai-inp');
      if (el) el.focus();
    }, 200);
  }
}

function aiPositionPanel() {
  var fab = document.getElementById('ai-fab');
  var panel = document.getElementById('ai-panel');
  if (!fab || !panel) return;
  var fr = fab.getBoundingClientRect();
  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  var fx = fr.left / zoom, fy = fr.top / zoom;
  var fw = fr.width / zoom, fh = fr.height / zoom;
  var pw = 320, ph = 380;
  var W = window.innerWidth / zoom, H = window.innerHeight / zoom;
  var px = Math.min(fx + fw - pw, W - pw - 8);
  var py = fy - ph - 8;
  if (py < 8) py = fy + fh + 8;
  px = Math.max(8, px);
  py = Math.max(8, Math.min(py, H - ph - 8));
  panel.style.left = px + 'px';
  panel.style.top = py + 'px';
  panel.style.right = '';
  panel.style.bottom = '';
}

function aiWelcome() {
  var isId = AI_LANG === 'id';
  var s = typeof gs === 'function' ? gs() : { SPOT: false, P: 1000, LEV: 5, NOT: 2500 };
  var mode = s.SPOT ? 'spot' : 'leverage';
  var liq = s.SPOT ? null : (s.P / s.NOT * 100).toFixed(1);
  var liqLow = liq && parseFloat(liq) < 40;
  var msg;
  if (isId) {
    msg = 'Halo! 👋 Aku **Kira**, asisten dashboard ini.\n\n'
      + 'Kamu sedang di **mode ' + mode + '**' + (liq ? ' dengan liq% **' + liq + '%**' : '') + '. '
      + (liqLow ? 'Hmm, liq%-mu agak rendah nih — mau aku jelaskan cara meningkatkannya? 🔍' : 'Setup terlihat oke dari sini! ✓')
      + '\n\nTanya apa saja — cara baca tabel, setup trade, perbedaan spot vs leverage, atau apa pun yang membingungkan. Aku di sini! 😊';
  } else {
    msg = 'Hey! 👋 I\'m **Kira**, your dashboard assistant.\n\n'
      + 'You\'re in **' + mode + ' mode**' + (liq ? ' with liq% at **' + liq + '%**' : '') + '. '
      + (liqLow ? 'That liq% looks a bit tight — want me to walk you through improving it? 🔍' : 'Looking good from here! ✓')
      + '\n\nAsk me anything — what the numbers mean, how to set up trades, spot vs leverage, reading the tables, or anything that\'s confusing. I\'m here to help! 😊';
  }
  aiAppend('b', msg);
}

function aiUpdateChips() {
  var el = document.getElementById('ai-chips');
  if (!el) return;
  var isId = AI_LANG === 'id';
  var list = isId ? AI_CHIPS_ID : AI_CHIPS_EN;
  el.innerHTML = list.map(function(q) {
    return '<button class="ai-chip" onclick="aiChip(this.textContent)">' + q + '</button>';
  }).join('');
  el.style.display = 'flex';
}

function aiChip(q) {
  var el = document.getElementById('ai-inp');
  if (el) { el.value = q; aiSend(); }
}

function aiAppend(role, text) {
  var el = document.getElementById('ai-msgs');
  if (!el) return null;
  var d = document.createElement('div');
  d.className = 'ai-m ' + (role === 'u' ? 'u' : 'b');
  d.innerHTML = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
  return d;
}

function aiKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); }
}

/* ==========================================================================
   3. RESPONSE PIPELINE (CLAUDE INTEGRATION)
   ========================================================================== */
async function aiSend() {
  var inp = document.getElementById('ai-inp');
  var btn = document.getElementById('ai-send');
  if (!inp || !btn) return;
  var q = (inp.value || '').trim();
  if (!q || btn.disabled) return;
  inp.value = '';

  var chips = document.getElementById('ai-chips');
  if (chips) chips.style.display = 'none';

  aiAppend('u', q);
  AI_HIST.push({ role: 'user', content: q });
  btn.disabled = true;

  var typing = aiAppend('b', '...');
  if (typing) typing.classList.add('typing');

  var isId = AI_LANG === 'id';
  var s = typeof gs === 'function' ? gs() : { SPOT: false, P: 1000, LEV: 5, NOT: 2500, KPI: 1, BT: [], FR: [], FEE: { maker: 0.02, taker: 0.05, method: 'taker' }, ZM: new Set() };
  var liqPct = s.SPOT ? 'n/a' : (s.P / s.NOT * 100).toFixed(1) + '%';
  var fm = s.SPOT ? 'n/a' : (s.NOT / s.LEV / s.P * 100).toFixed(1) + '%';
  var fmVal = s.SPOT ? 0 : (s.NOT / s.LEV / s.P * 100);
  var liqVal = s.SPOT ? 100 : (s.P / s.NOT * 100);
  var actTrades = s.BT ? s.BT.filter(function(b, i) { return b !== 0 && s.FR && s.FR[i] > 0; }).length : 0;
  var wins = s.BT ? s.BT.filter(function(b, i) { return b > 0 && s.FR && s.FR[i] > 0; }).length : 0;
  var losses = s.BT ? s.BT.filter(function(b, i) { return b < 0 && s.FR && s.FR[i] > 0; }).length : 0;
  var feeRate = s.FEE ? (s.FEE.method === 'maker' ? s.FEE.maker : s.FEE.taker) : 0.05;
  var fundingRate = s.FEE ? s.FEE.funding : 0.01;
  var riskEl = document.querySelector('.risk-pill');
  var riskScore = riskEl ? riskEl.textContent.trim() : 'unknown';
  var tabId = typeof TAB !== 'undefined' ? TAB : '36';
  var isQuarter = tabId === 'q' || tabId.startsWith('q_');
  var zeroMonths = s.ZM ? s.ZM.size : 0;
  var totalMonths = isQuarter ? 3 : 36;
  var activeMonths = totalMonths - zeroMonths;
  var btcPrice = typeof window.LIVE_BTC_PRICE !== 'undefined' ? window.LIVE_BTC_PRICE : 85000;
  
  var errorState = 'none';
  if (!s.SPOT && fmVal > 100) errorState = 'FM% > 100% (margin exceeds capital - position cannot open)';
  else if (!s.SPOT && liqVal < 1) errorState = 'Liq% < 1% (instant liquidation risk)';
  else if (typeof bustMonth !== 'undefined' && bustMonth) errorState = 'WD Bust (withdrawal exceeded balance at month ' + bustMonth.m + ')';
  
  var ctx = isId
    ? ('\n\n--- SETUP PENGGUNA SAAT INI ---\nTab: ' + (isQuarter ? 'Quarter (3 bulan)' : '36-Month') + '\nMode: ' + (s.SPOT ? 'spot' : 'leverage') + '\nModal: $' + s.P.toLocaleString() + '\nLeverage: ' + (s.SPOT ? 'n/a' : s.LEV + 'x') + '\nNotional: $' + s.NOT.toLocaleString() + '\nLiq%: ' + liqPct + (liqVal < 20 && !s.SPOT ? ' ⚠️ BAHAYA' : '') + '\nFM%: ' + fm + (fmVal > 100 && !s.SPOT ? ' 🚫 INVALID' : fmVal > 80 && !s.SPOT ? ' ⚠️ TINGGI' : '') + '\nKPI scale: ' + s.KPI.toFixed(2) + 'x\nTrade aktif: ' + actTrades + '/10 (' + wins + ' win, ' + losses + ' loss)\nBulan aktif: ' + activeMonths + '/' + totalMonths + (zeroMonths > 0 ? ' (' + zeroMonths + ' zero month)' : '') + '\nFee: ' + (s.FEE ? s.FEE.method : 'taker') + ' @ ' + feeRate + '%' + (s.SPOT ? '' : ', funding ' + fundingRate + '%') + '\nRisk score: ' + riskScore + '\nHarga BTC: $' + btcPrice.toLocaleString() + '\nStatus error: ' + (errorState === 'none' ? 'tidak ada ✓' : errorState) + '\n---')
    : ('\n\n--- USER CURRENT SETUP ---\nTab: ' + (isQuarter ? 'Quarter (3 months)' : '36-Month') + '\nMode: ' + (s.SPOT ? 'spot' : 'leverage') + '\nCapital: $' + s.P.toLocaleString() + '\nLeverage: ' + (s.SPOT ? 'n/a' : s.LEV + 'x') + '\nNotional: $' + s.NOT.toLocaleString() + '\nLiq%: ' + liqPct + (liqVal < 20 && !s.SPOT ? ' ⚠️ DANGER' : '') + '\nFM%: ' + fm + (fmVal > 100 && !s.SPOT ? ' 🚫 INVALID' : fmVal > 80 && !s.SPOT ? ' ⚠️ HIGH' : '') + '\nKPI scale: ' + s.KPI.toFixed(2) + 'x\nActive trades: ' + actTrades + '/10 (' + wins + ' wins, ' + losses + ' losses)\nActive months: ' + activeMonths + '/' + totalMonths + (zeroMonths > 0 ? ' (' + zeroMonths + ' zero months)' : '') + '\nFee: ' + (s.FEE ? s.FEE.method : 'taker') + ' @ ' + feeRate + '%' + (s.SPOT ? '' : ', funding ' + fundingRate + '%') + '\nRisk score: ' + riskScore + '\nBTC price: $' + btcPrice.toLocaleString() + '\nError state: ' + (errorState === 'none' ? 'none ✓' : errorState) + '\n---');

  var sys = (isId ? AI_SYS_ID : AI_SYS_EN) + ctx;

  try {
    var res = await fetch('https://dashboard-ai-proxy.cryptojurnal.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: sys,
        messages: AI_HIST
      })
    });
    var data = await res.json();
    if (data.error) {
      if (typing) typing.remove();
      aiAppend('b', isId ? 'Error API: ' + data.error.message : 'API error: ' + data.error.message);
      AI_HIST.pop();
      btn.disabled = false;
      return;
    }
    var reply = (data.content && data.content[0] && data.content[0].text) || (isId ? 'Maaf, terjadi kesalahan.' : 'Sorry, something went wrong.');
    if (typing) typing.remove();
    aiAppend('b', reply);
    AI_HIST.push({ role: 'assistant', content: reply });
    if (AI_HIST.length > 40) AI_HIST = AI_HIST.slice(-30);
  } catch (err) {
    if (typing) typing.remove();
    aiAppend('b', isId ? 'Gagal terhubung. Periksa koneksi.' : 'Connection failed. Check your internet.');
    AI_HIST.pop();
  }
  btn.disabled = false;
  var msgs = document.getElementById('ai-msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function aiClear() {
  AI_HIST = [];
  var el = document.getElementById('ai-msgs');
  if (el) el.innerHTML = '';
  aiUpdateChips();
  aiWelcome();
}

function aiSetLang(lang) {
  AI_LANG = lang;
  var en = document.getElementById('ai-lb-en');
  var id = document.getElementById('ai-lb-id');
  if (en) { en.style.background = lang === 'en' ? 'var(--acc)' : 'transparent'; en.style.color = lang === 'en' ? '#fff' : 'var(--tx3)'; }
  if (id) { id.style.background = lang === 'id' ? 'var(--acc)' : 'transparent'; id.style.color = lang === 'id' ? '#fff' : 'var(--tx3)'; }
  var ttl = document.getElementById('ai-ttl');
  if (ttl) ttl.textContent = lang === 'id' ? 'asisten dashboard' : 'dashboard assistant';
  var inp = document.getElementById('ai-inp');
  if (inp) inp.placeholder = lang === 'id' ? 'tanya apa saja...' : 'ask anything...';
  aiUpdateChips();
}

/* ==========================================================================
   4. MEMBER AREA AI WIDGET
   ========================================================================== */
var L3_AI_LANG = 'en';

var L3_AI_RESPONSES = {
  en: {
    what: "Welcome to BATT! Here's what you can do:\n\n📊 <b>Dashboard Cockpit</b> — Your command center. Plan trades, set position sizes, calculate liquidation levels, and project portfolio growth over 36 months.\n\n⚡ <b>Trade Panel</b> — Your all-in-one trading workspace. Practice with simulations, connect via API for live execution, and sharpen your edge with real market data.\n\n💾 <b>Presets</b> — Save your cockpit configurations and load them anytime. Share presets with friends too!\n\n📈 <b>Trade Journal</b> — Log and analyze your real trades.\n\n🤝 <b>Bet With Us</b> (coming soon) — We're building this together. A partnership space to share ideas and shape how this platform grows.",
    cockpit: "The <b>Dashboard Cockpit</b> is your command center for preparation.\n\n• Set your starting capital and position size\n• Configure up to 10 trade slots with target %\n• See liquidation levels for each trade\n• Project your portfolio growth over 36 months\n• Toggle between Leverage and Spot modes\n• Use quarter view for detailed monthly breakdowns\n\nThe cockpit uses notional compounding — each trade's profit adds to your next trade's base. It's all about planning before you execute!",
    trade: "The <b>Trade Panel</b> is your complete trading workspace.\n\n• Real-time prices from Binance API\n• Live order book with clickable prices\n• Place market & limit orders (Spot or Perpetual)\n• Track open positions with live P&L\n• Set Take Profit & Stop Loss\n• View your trade history and stats\n\nPractice with paper trading, or connect your API for real execution. Build your skills, test strategies, and trade with confidence.",
    presets: "Presets let you save your Dashboard Cockpit configurations.\n\n• Click the 💾 button on the right side of the cockpit\n• Name your preset and save it to the cloud\n• Load any preset with one click\n• Share presets with friends via link or QR code\n• Each preset stores: capital, position size, trade slots, theme, and mode\n\nYour presets sync across devices when you're logged in!"
  },
  id: {
    what: "Selamat datang di BATT! Ini yang bisa kamu lakukan:\n\n📊 <b>Dashboard Cockpit</b> — Pusat komando kamu. Rencanakan trade, atur position size, hitung level likuidasi, dan proyeksikan pertumbuhan portfolio 36 bulan.\n\n⚡ <b>Trade Panel</b> — Workspace trading lengkap. Latihan dengan simulasi, koneksikan API untuk eksekusi real, dan asah kemampuanmu dengan data market real.\n\n💾 <b>Presets</b> — Simpan konfigurasi cockpit dan load kapan saja. Bisa share preset ke teman juga!\n\n📈 <b>Trade Journal</b> — Catat dan analisis trade aslimu.\n\n🤝 <b>Bet With Us</b> (segera hadir) — Kita membangun ini bersama. Ruang partnership untuk berbagi ide dan membentuk platform ini.",
    cockpit: "<b>Dashboard Cockpit</b> adalah pusat komando untuk persiapan.\n\n• Atur modal awal dan position size\n• Konfigurasi hingga 10 trade slot dengan target %\n• Lihat level likuidasi untuk setiap trade\n• Proyeksikan pertumbuhan portfolio 36 bulan\n• Toggle antara mode Leverage dan Spot\n• Gunakan quarter view untuk breakdown bulanan detail\n\nCockpit ini pakai notional compounding — profit setiap trade ditambahkan ke base trade berikutnya. Semua tentang persiapan!",
    trade: "<b>Trade Panel</b> adalah workspace trading lengkapmu.\n\n• Harga real-time dari Binance API\n• Order book live dengan harga yang bisa diklik\n• Buat market & limit order (Spot atau Perpetual)\n• Tracking posisi terbuka dengan P&L live\n• Atur Take Profit & Stop Loss\n• Lihat history trade dan statistik\n\nLatihan dengan paper trading, atau koneksikan API untuk eksekusi real. Bangun skill, tes strategi, dan trade dengan percaya diri.",
    presets: "Presets memungkinkan kamu menyimpan konfigurasi Dashboard Cockpit.\n\n• Klik tombol 💾 di sisi kanan cockpit\n• Beri nama preset dan simpan ke cloud\n• Load preset manapun dengan satu klik\n• Share preset ke teman via link atau QR code\n• Setiap preset menyimpan: modal, position size, trade slots, tema, dan mode\n\nHasil preset-mu sync antar device saat login!"
  }
};

var L3_AI_CHIPS = {
  en: {
    what: "What can I do here?",
    cockpit: "How does Dashboard Cockpit work?",
    trade: "Tell me about Trade Panel",
    presets: "How do presets work?"
  },
  id: {
    what: "Apa yang bisa saya lakukan?",
    cockpit: "Bagaimana Dashboard Cockpit bekerja?",
    trade: "Ceritakan tentang Trade Panel",
    presets: "Bagaimana cara kerja presets?"
  }
};

function l3AiSetLang(lang) {
  L3_AI_LANG = lang;
  const btns = document.querySelectorAll('.l3-ai-header button');
  btns.forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === lang));
  
  const desc = document.getElementById('l3-ai-desc');
  if (desc) {
    desc.textContent = lang === 'id' 
      ? 'Saya tahu semua tentang situs ini — dari Dashboard Cockpit sampai Trade Panel. Tanya apa saja!'
      : "I know everything about this site — from the Dashboard Cockpit to Trade Panel. Ask me anything!";
  }
  
  const chipsEl = document.getElementById('l3-ai-chips');
  if (chipsEl) {
    const chips = L3_AI_CHIPS[lang];
    chipsEl.innerHTML = Object.keys(chips).map(key => 
      `<button onclick="l3AiAsk('${key}')">${chips[key]}</button>`
    ).join('');
  }
  
  const resp = document.getElementById('l3-ai-response');
  if (resp) resp.classList.remove('visible');
}

function l3AiAsk(topic) {
  const resp = document.getElementById('l3-ai-response');
  if (!resp) return;
  const answer = L3_AI_RESPONSES[L3_AI_LANG][topic];
  if (answer) {
    resp.innerHTML = answer.replace(/\n/g, '<br>');
    resp.classList.add('visible');
    resp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Bind Enter key listener in text box
window.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('ai-inp');
  if (inp) inp.addEventListener('keydown', aiKey);
});
