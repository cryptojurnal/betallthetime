
// ── WEB3 CRYPTO WALLET AUTHENTICATION (EVM & SOLANA) ──
function _formatAddress(addr){
  if(!addr || addr.length < 10) return addr || '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function _updateWeb3Badge(chain){
  const b = document.getElementById('auth-web3-badge');
  if(!b) return;
  if(!chain){
    b.style.display = 'none';
    b.textContent = '';
    b.className = '';
  } else {
    b.style.display = 'inline-flex';
    b.className = 'auth-web3-badge ' + chain;
    b.innerHTML = chain === 'evm' ? '🦊 EVM' : '🟣 SOL';
  }
}

let _eip6963Providers = [];
if(typeof window !== 'undefined'){
  window.addEventListener('eip6963:announceProvider', function(e){
    if(e && e.detail && !_eip6963Providers.some(p => p.info && p.info.uuid === e.detail.info.uuid)){
      _eip6963Providers.push(e.detail);
    }
  });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch(e){}
}

function _getEVMProvider(){
  // 1. Check EIP-6963 announced MetaMask
  const mmAnnounced = _eip6963Providers.find(p => p.info && p.info.name && p.info.name.toLowerCase().includes('metamask'));
  if(mmAnnounced && mmAnnounced.provider) return mmAnnounced.provider;

  // 2. Check window.ethereum.providers array
  if(window.ethereum && window.ethereum.providers && window.ethereum.providers.length){
    const mm = window.ethereum.providers.find(p => p.isMetaMask && !p.isPhantom);
    if(mm) return mm;
    const rabby = window.ethereum.providers.find(p => p.isRabby);
    if(rabby) return rabby;
    const anyMM = window.ethereum.providers.find(p => p.isMetaMask);
    if(anyMM) return anyMM;
    return window.ethereum.providers[0];
  }

  // 3. Fallback to direct window.ethereum
  return window.ethereum;
}

async function authConnectEVM(){
  const btn = document.getElementById('auth-evm-btn');
  const provider = _getEVMProvider();
  
  if(!provider){
    showToast('No EVM wallet found. Install MetaMask, Rabby, or Coinbase Wallet.', 'error', 3500);
    window.open('https://metamask.io/download/', '_blank');
    return;
  }
  
  if(btn){
    btn.disabled = true; btn.innerHTML = '<span class="spin">↻</span> connecting...';
    setTimeout(()=>{ if(btn && btn.disabled){ btn.disabled = false; btn.innerHTML = '<span class="auth-web3-icon">🦊</span><span>EVM / MetaMask</span>'; } }, 25000);
  }
  
  try{
    // 1. Request accounts
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if(!accounts || !accounts.length){
      throw new Error('No accounts selected');
    }
    const address = accounts[0].toLowerCase();
    
    // 2. Create clean challenge message
    const issuedAt = new Date().toISOString();
    const nonce = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    const message = 'Sign in to Bet All The Time (BATT)\n\nAccount: ' + address + '\nNonce: ' + nonce + '\nTimestamp: ' + issuedAt;
    
    // Convert to hex for standard personal_sign compatibility
    const encoder = new TextEncoder();
    const msgBytes = encoder.encode(message);
    const hexMsg = '0x' + Array.from(msgBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // 3. Request signature (0 gas, 100% free)
    if(btn) btn.innerHTML = '<span class="spin">↻</span> sign in wallet...';
    showToast('Please confirm in the MetaMask window (check taskbar if hidden).', 'info', 4500);
    let signature = null;
    try {
      signature = await provider.request({
        method: 'personal_sign',
        params: [hexMsg, address]
      });
    } catch(err) {
      if(err && err.code === 4001) throw err;
      signature = await provider.request({
        method: 'personal_sign',
        params: [message, address]
      });
    }
    
    if(!signature){
      throw new Error('Signature cancelled');
    }
    
    // 4. Session issuance
    let token = 'web3_evm_' + address + '_' + nonce;
    let userObj = {
      username: _formatAddress(address),
      address: address,
      chain: 'evm',
      auth_type: 'web3',
      created_at: issuedAt
    };
    
    try {
      const res = await fetch(AUTH_URL + '/auth/web3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature, message, chain: 'evm', nonce })
      });
      const data = await res.json();
      if(data.ok && data.token){
        token = data.token;
        if(data.user) userObj = { ...userObj, ...data.user };
      }
    } catch(err){
      // fallback to client-verified session
    }
    
    localStorage.setItem('batt_auth_web3', 'evm');
    localStorage.setItem('batt_wallet_address', address);
    _updateWeb3Badge('evm');
    authOnSuccess({ token, user: userObj, is_new: false });
    
    if(provider.on){
      provider.on('accountsChanged', function(newAccounts){
        if(!newAccounts || !newAccounts.length || newAccounts[0].toLowerCase() !== address){
          authLogout();
        }
      });
    }
    
  }catch(e){
    console.error('EVM auth error:', e);
    const msg = (e && e.code === 4001) ? 'Signature request rejected in wallet.' : (e.message || 'Failed to connect wallet.');
    showToast(msg, 'error', 3000);
  } finally {
    if(btn){ btn.disabled = false; btn.innerHTML = '<span class="auth-web3-icon">🦊</span><span>EVM / MetaMask</span>'; }
  }
}

async function authConnectSolana(){
  const btn = document.getElementById('auth-sol-btn');
  const solProvider = window.phantom?.solana || window.solana;
  
  if(!solProvider || (!solProvider.isPhantom && !window.solana)){
    showToast('No Solana wallet found. Install Phantom or Solflare.', 'error', 3500);
    window.open('https://phantom.app/', '_blank');
    return;
  }
  
  if(btn){
    btn.disabled = true; btn.innerHTML = '<span class="spin">↻</span> connecting...';
    setTimeout(()=>{ if(btn && btn.disabled){ btn.disabled = false; btn.innerHTML = '<span class="auth-web3-icon">🟣</span><span>Solana / Phantom</span>'; } }, 25000);
  }
  
  try{
    // 1. Connect wallet
    const resp = await solProvider.connect();
    const address = resp.publicKey.toString();
    
    // 2. Create clean Solana challenge message (avoids strict SIWS parser)
    const issuedAt = new Date().toISOString();
    const nonce = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    const messageStr = 'Sign in to Bet All The Time (BATT)\n\nAccount: ' + address + '\nNonce: ' + nonce + '\nTimestamp: ' + issuedAt;
    const encodedMessage = new TextEncoder().encode(messageStr);
    
    // 3. Request signature (0 gas, 100% free)
    if(btn) btn.innerHTML = '<span class="spin">↻</span> sign in wallet...';
    showToast('Please confirm in the Phantom window (check taskbar if hidden).', 'info', 4500);
    const signed = await solProvider.signMessage(encodedMessage, 'utf8');
    
    let signatureHex = '';
    if(signed && signed.signature){
      signatureHex = Array.from(signed.signature).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // 4. Session issuance
    let token = 'web3_sol_' + address + '_' + nonce;
    let userObj = {
      username: _formatAddress(address),
      address: address,
      chain: 'solana',
      auth_type: 'web3',
      created_at: issuedAt
    };
    
    try {
      const res = await fetch(AUTH_URL + '/auth/web3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature: signatureHex, message: messageStr, chain: 'solana', nonce })
      });
      const data = await res.json();
      if(data.ok && data.token){
        token = data.token;
        if(data.user) userObj = { ...userObj, ...data.user };
      }
    } catch(err){
      // fallback
    }
    
    localStorage.setItem('batt_auth_web3', 'solana');
    localStorage.setItem('batt_wallet_address', address);
    _updateWeb3Badge('solana');
    authOnSuccess({ token, user: userObj, is_new: false });
    
    if(solProvider.on){
      solProvider.on('disconnect', function(){
        authLogout();
      });
    }
    
  }catch(e){
    console.error('Solana auth error:', e);
    const msg = (e && e.code === 4001) ? 'Signature request rejected in Phantom.' : (e.message || 'Failed to connect Solana wallet.');
    showToast(msg, 'error', 3000);
  } finally {
    if(btn){ btn.disabled = false; btn.innerHTML = '<span class="auth-web3-icon">🟣</span><span>Solana / Phantom</span>'; }
  }
}

// ── AUTH SYSTEM ──
const AUTH_URL = 'https://dashboard-ai-proxy.cryptojurnal.workers.dev';
let AUTH_TOKEN = localStorage.getItem('batt_token') || null;
let AUTH_USER  = null;

function authTogglePass(btn){
  const input = btn.previousElementSibling;
  if(!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = show
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function authShowTab(tab){
  document.getElementById('auth-login-form').style.display   = tab==='login'    ? '' : 'none';
  document.getElementById('auth-register-form').style.display = tab==='register' ? '' : 'none';
  document.getElementById('auth-forgot-form').style.display  = tab==='forgot'   ? '' : 'none';
  document.getElementById('auth-reset-form').style.display   = tab==='reset'    ? '' : 'none';
  document.getElementById('auth-tab-login').classList.toggle('on',    tab==='login');
  document.getElementById('auth-tab-register').classList.toggle('on', tab==='register');
}

function authShowForgot(){
  authShowTab('forgot');
  document.getElementById('auth-forgot-email').value='';
  document.getElementById('auth-forgot-err').textContent='';
}

var _resetEmail='';
async function authForgotSend(){
  const btn=document.getElementById('auth-forgot-btn');
  const err=document.getElementById('auth-forgot-err');
  const email=document.getElementById('auth-forgot-email').value.trim();
  
  if(!email){err.textContent='Enter your email';return;}
  
  btn.disabled=true;btn.innerHTML='<span class="spin">↻</span> sending';err.textContent='';
  
  try{
    const r=await fetch(AUTH_URL+'/auth/forgot-password',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email})
    });
    const d=await r.json();
    if(d.ok){
      _resetEmail=email;
      authShowTab('reset');
      showToast('Code sent! Check your email','success');
    }else{
      err.textContent=d.error||'Failed to send';
    }
  }catch(e){err.textContent='Connection failed';}
  btn.disabled=false;btn.textContent='send reset code';
}

async function authResetPassword(){
  const btn=document.getElementById('auth-reset-btn');
  const err=document.getElementById('auth-reset-err');
  const code=document.getElementById('auth-reset-code').value.trim();
  const pass=document.getElementById('auth-reset-pass').value;
  
  if(!code||code.length!==6){err.textContent='Enter 6-digit code';return;}
  if(!pass||pass.length<6){err.textContent='Password min 6 characters';return;}
  
  btn.disabled=true;btn.textContent='resetting...';err.textContent='';
  
  try{
    const r=await fetch(AUTH_URL+'/auth/reset-password',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:_resetEmail,code,new_password:pass})
    });
    const d=await r.json();
    if(d.ok){
      showToast('Password reset! Please login','success');
      authShowTab('login');
    }else{
      err.textContent=d.error||'Invalid code';
    }
  }catch(e){err.textContent='Connection failed';}
  btn.disabled=false;btn.textContent='reset password';
}

async function authLogin(){
  const btn = document.getElementById('auth-login-btn');
  const err = document.getElementById('auth-login-err');
  const login = document.getElementById('auth-login-input').value.trim();
  const pass  = document.getElementById('auth-pass-input').value;
  if(!login||!pass){err.textContent='fill in both fields';return;}
  btn.disabled=true; btn.innerHTML='<span class="spin">↻</span> logging in'; err.textContent='';
  try{
    const r = await fetch(AUTH_URL+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password:pass})});
    const d = await r.json();
    if(!d.ok){err.textContent=d.error||'login failed';btn.disabled=false;btn.textContent='login';return;}
    authOnSuccess(d);
  }catch(e){err.textContent='connection failed — check your internet';btn.disabled=false;btn.textContent='login';}
}

async function authRegister(){
  const btn = document.getElementById('auth-reg-btn');
  const err = document.getElementById('auth-reg-err');
  const email = document.getElementById('auth-reg-email').value.trim();
  const user  = document.getElementById('auth-reg-user').value.trim();
  const pass  = document.getElementById('auth-reg-pass').value;
  if(!email||!user||!pass){err.textContent='fill in all fields';return;}
  btn.disabled=true; btn.innerHTML='<span class="spin">↻</span> creating account'; err.textContent='';
  try{
    const r = await fetch(AUTH_URL+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,username:user,password:pass})});
    const d = await r.json();
    if(!d.ok){err.textContent=d.error||'registration failed';btn.disabled=false;btn.textContent='create account';return;}
    authOnSuccess(d);
  }catch(e){err.textContent='connection failed';btn.disabled=false;btn.textContent='create account';}
}

function authOnSuccess(d){
  AUTH_TOKEN = d.token;
  AUTH_USER  = d.user;
  localStorage.setItem('batt_token', d.token);
  if(d.user) localStorage.setItem('batt_user', JSON.stringify(d.user));
  // load cloud preferences
  if(typeof loadCloudPrefs==='function') loadCloudPrefs();
  // load cloud data if exists and merge
  if(d.data){
    try{
      const parsed = typeof d.data==='string'?JSON.parse(d.data):d.data;
      // merge into S state
      Object.keys(parsed).forEach(tabId=>{
        if(!S[tabId])S[tabId]=mkState();
        Object.assign(S[tabId],parsed[tabId]);
        if(parsed[tabId].ZM) S[tabId].ZM=new Set(parsed[tabId].ZM);
      });
    }catch(e){console.warn('data merge error',e);}
  }
  // show welcome toast
  const isNewUser=d.is_new||false;
  showToast(isNewUser?'Welcome to BATT! 🎉':'Welcome back, '+(d.user?.username||'trader')+'!','success');
  // log activity
  setTimeout(()=>{
    if(typeof logActivity==='function') logActivity(isNewUser?'register':'login',{});
  },1000);
  // hide auth, show layer3 (member area)
  const al=document.getElementById('auth-layer');
  al.style.opacity='0';
  setTimeout(()=>{
    al.classList.add('hidden');
    goLayer3();
    // show onboarding for new users
    if(isNewUser||!localStorage.getItem('onboarding_done')){
      setTimeout(()=>onboardingShow(),800);
    }
  },500);
  // show user bar
  const ub=document.getElementById('auth-user-bar');
  const ul=document.getElementById('auth-username-lbl');
  if(ub){ub.classList.remove('hidden');}
  if(ul) ul.textContent='@'+d.user.username;
      if(d.user && d.user.chain) _updateWeb3Badge(d.user.chain);
  // proceed to layer 2
}

// ── GOOGLE OAUTH ──
async function authGoogleLogin(){
  const btn=document.querySelector('.auth-google');
  if(btn){btn.disabled=true;btn.style.opacity='0.6';btn.innerHTML='<span style="margin-right:8px">⏳</span> connecting...';}

  // safety timeout — always re-enable after 15s no matter what
  const safetyTimer=setTimeout(()=>resetGoogleBtn(), 15000);

  try{
    google.accounts.id.initialize({
      client_id: '951384802849-hgc699g447ugb8pr2u42ifur00b8hcig.apps.googleusercontent.com',
      callback: handleGoogleCredential
    });
    google.accounts.id.prompt((notification)=>{
      if(notification.isNotDisplayed()||notification.isSkippedMoment()){
        // One Tap not available or dismissed — try popup
        const tokenClient=google.accounts.oauth2.initTokenClient({
          client_id: '951384802849-hgc699g447ugb8pr2u42ifur00b8hcig.apps.googleusercontent.com',
          scope: 'email profile',
          error_callback: (err)=>{
            // user cancelled or error — reset button
            clearTimeout(safetyTimer);
            resetGoogleBtn();
          },
          callback: async(response)=>{
            clearTimeout(safetyTimer);
            if(response.error){
              resetGoogleBtn();
              return;
            }
            if(response.access_token){
              const userRes=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{
                headers:{'Authorization':'Bearer '+response.access_token}
              });
              const userData=await userRes.json();
              await sendGoogleToWorker(userData.id,userData.email,userData.name,userData.picture);
            } else {
              resetGoogleBtn();
            }
          }
        });
        tokenClient.requestAccessToken();
      } else if(notification.isDismissedMoment()){
        // user closed the One Tap prompt
        clearTimeout(safetyTimer);
        resetGoogleBtn();
      }
    });
  }catch(e){
    clearTimeout(safetyTimer);
    console.error('Google auth error:',e);
    showToast('Google login failed. Please try again.','error');
    resetGoogleBtn();
  }
}

async function handleGoogleCredential(response){
  // Decode JWT to get user info
  const payload=JSON.parse(atob(response.credential.split('.')[1]));
  await sendGoogleToWorker(payload.sub,payload.email,payload.name,payload.picture);
}

async function sendGoogleToWorker(google_id,email,name,picture){
  try{
    const res=await fetch(AUTH_URL+'/auth/google',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({google_id,email,name})
    });
    const data=await res.json();
    if(data.ok&&data.token){
      AUTH_TOKEN=data.token;
      // add picture and google_id to user object
      AUTH_USER=data.user ? {...data.user, picture:picture, google_id:google_id} : {email,name,picture,google_id};
      localStorage.setItem('batt_token',data.token);
      localStorage.setItem('batt_user',JSON.stringify(AUTH_USER));
      localStorage.setItem('batt_auth_google','1'); // flag for Google login
      // show user bar
      const ub=document.getElementById('auth-user-bar');
      const ul=document.getElementById('auth-username-lbl');
      if(ub)ub.classList.remove('hidden');
      if(ul)ul.textContent='@'+(data.user?.username||email.split('@')[0]);
      // hide auth layer, go to layer 3 (member area)
      showToast('Welcome back, '+(data.user?.username||name||email.split('@')[0])+'!','success');
      const al=document.getElementById('auth-layer');
      if(al){al.style.opacity='0';setTimeout(()=>{al.classList.add('hidden');goLayer3();},500);}
    }else{
      showToast(data.error||'Google login failed','error');
      resetGoogleBtn();
    }
  }catch(e){
    console.error('Google auth error:',e);
    showToast('Connection failed. Please try again.','error');
    resetGoogleBtn();
  }
}

function resetGoogleBtn(){
  const btn=document.querySelector('.auth-google');
  if(btn){btn.disabled=false;btn.style.opacity='1';btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" style="margin-right:8px;flex-shrink:0"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>continue with google';}
}

function authGuest(){
  const al=document.getElementById('auth-layer');
  const l2=document.getElementById('layer2');
  const gb=document.getElementById('guest-mode-banner');

  // kill banner before anything — never bleeds through
  if(gb) gb.style.display='none';

  // stage layer2 solid behind auth-layer BEFORE the fade starts — zero gap
  if(l2){
    l2.classList.remove('hidden','out');
    l2.style.transition='none';
    l2.style.opacity='1';
    const lb=l2.querySelector('.launch-btn');
    if(lb){ lb.disabled=false; lb.style.pointerEvents=''; }
  }

  // fade auth-layer out — layer2 is already fully opaque underneath
  requestAnimationFrame(()=>{
    al.style.opacity='0';
    setTimeout(()=>{
      al.classList.add('hidden');
      window.BATT_GUEST=true;
      // restore layer2 natural transition for its own exit later
      if(l2) l2.style.transition='';
      // always lock to leverage mode as guest default
      if(typeof setSpotMode==='function') setSpotMode(false);
      try{ try{history.replaceState({batt:'risk'},'','#risk');}catch(e){} }catch(e){}
      document.title='BATT · Risk Disclosure';
    },500);
  });
}

async function authSave(){
  if(!AUTH_TOKEN){showToast('Please log in first to sync','error');return;}
  // flush any pending debounced sync immediately
  if(_silentSyncTimer){clearTimeout(_silentSyncTimer);_silentSyncTimer=null;}
  _syncBtn=document.querySelector('.auth-sync-btn');
  _setSyncStatus('saving');
  try{
    const snapshot={};
    ['36','q',...CUSTOM_TABS.map(t=>t.id)].forEach(id=>{
      if(!S[id])return;
      const s=S[id];
      snapshot[id]={...s,ZM:s.ZM?[...s.ZM]:[],LK:s.LK?[...s.LK]:[],CM:s.CM?[...s.CM]:[]};
    });
    const r=await fetch(AUTH_URL+'/data/save',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({data:snapshot})
    });
    const d=await r.json();
    if(d.ok){
      _setSyncStatus('saved');
    } else {
      _setSyncStatus('error');
      if(d.error==='Unauthorized — please log in') authForceLogout();
    }
  }catch(e){ _setSyncStatus('error'); }
}

async function authLogout(){
  const confirmed = await confirmLogout();
  if(!confirmed) return;
  if(AUTH_TOKEN){
    fetch(AUTH_URL+'/auth/logout',{method:'POST',headers:{'Authorization':'Bearer '+AUTH_TOKEN}}).catch(()=>{});
  }
  authForceLogout();
  showToast('Logged out successfully','info');
}

async function logoutAllDevices(){
  const confirmed = await showConfirm({
    icon:'🔐',
    type:'danger',
    title:'logout all devices',
    message:'this will end all active sessions on every device. you\'ll need to log in again everywhere.',
    confirmText:'logout all',
    cancelText:'cancel'
  });
  if(!confirmed) return;
  if(AUTH_TOKEN){
    try{
      await fetch(AUTH_URL+'/auth/logout-all',{method:'POST',headers:{'Authorization':'Bearer '+AUTH_TOKEN}});
    }catch(e){}
  }
  authForceLogout();
  showToast('All devices logged out','info');
}

function authForceLogout(){
  _updateWeb3Badge(null);
  localStorage.removeItem('batt_auth_web3');
  localStorage.removeItem('batt_wallet_address');
  AUTH_TOKEN=null; AUTH_USER=null;
  // reset guide popup state so it shows fresh on next guest session
  window.RISK_SHOWN = false;
  // reset to leverage mode on logout — deferred so state is ready
  setTimeout(()=>{ if(typeof setSpotMode==='function') try{setSpotMode(false);}catch(e){} },100);
  localStorage.removeItem('batt_token');
  localStorage.removeItem('batt_user');
  localStorage.removeItem('batt_sync_count');
  localStorage.removeItem('batt_last_sync');
  localStorage.removeItem('batt_auth_google');
  // reset in-memory badge + stats state — server is source of truth
  if(typeof _badgeData !== 'undefined'){ _badgeData = {}; }
  if(typeof _badgeNewList !== 'undefined'){ _badgeNewList = []; }
  // clear cached stat counters
  localStorage.removeItem('batt_sync_count');
  localStorage.removeItem('batt_badge_presets');
  // clear old wz_ keys for users migrating from old version
  ['wz_sync_count','wz_badge_presets','wz_user','wz_theme','wz_prefs','wz_last_sync','wz_auth_google'].forEach(k=>localStorage.removeItem(k));
  // hide user bar
  const ub=document.getElementById('auth-user-bar');
  if(ub) ub.classList.add('hidden');
  // hide account page
  const accPage=document.getElementById('account-page');
  if(accPage) accPage.classList.remove('visible');
  // close member panel
  memberClose();
  // hide layer3 (member area)
  const l3=document.getElementById('layer3');
  if(l3){l3.classList.remove('visible');l3.classList.add('hidden');}
  // hide dashboard
  const app=document.querySelector('.app');
  if(app) app.style.opacity='0';
  // hide back button
  const backBtn=document.getElementById('back-to-member');
  if(backBtn) backBtn.style.display='none';
  // hide keyboard hints
  const kbdHint=document.getElementById('kbd-hint');
  if(kbdHint) kbdHint.classList.remove('visible');
  // hide presets toggle and close panel
  const presetsBtn=document.getElementById('presets-toggle-btn');
  if(presetsBtn) presetsBtn.classList.remove('visible');
  const presetsPanel=document.getElementById('panel-presets');
  if(presetsPanel) presetsPanel.classList.remove('open');
  // hide left panel toggle and collapse panel
  const leftToggle=document.getElementById('left-panel-toggle');
  if(leftToggle){
    leftToggle.classList.remove('visible');
      }
  const tradeToggleHide=document.getElementById('trade-panel-toggle');
  if(tradeToggleHide) tradeToggleHide.classList.remove('visible');
  const leftPanel=document.getElementById('left-panel');
  if(leftPanel) leftPanel.classList.add('collapsed');
  // hide AI fab
  const aiFab=document.getElementById('ai-fab');
  if(aiFab){aiFab.style.opacity='0';aiFab.style.pointerEvents='none';}
  // reset Google button
  resetGoogleBtn();
  // reset login form
  const loginBtn=document.getElementById('auth-login-btn');
  if(loginBtn){loginBtn.disabled=false;loginBtn.textContent='login';}
  const regBtn=document.getElementById('auth-reg-btn');
  if(regBtn){regBtn.disabled=false;regBtn.textContent='create account';}
  const loginErr=document.getElementById('auth-login-err');
  if(loginErr) loginErr.textContent='';
  const regErr=document.getElementById('auth-reg-err');
  if(regErr) regErr.textContent='';
  // clear form inputs
  const loginInput=document.getElementById('auth-login-input');
  if(loginInput) loginInput.value='';
  const passInput=document.getElementById('auth-pass-input');
  if(passInput) passInput.value='';
  // show login tab
  authShowTab('login');
  // show auth layer again
  const al=document.getElementById('auth-layer');
  al.classList.remove('hidden','out');
  al.style.opacity='1';
}

// ── TOAST NOTIFICATIONS ──
function showToast(message, type='info', duration=3500){
  const container=document.getElementById('toast-container');
  if(!container) return;
  const toast=document.createElement('div');
  toast.className='toast '+type;
  toast.innerHTML='<span>'+message+'</span>';
  container.appendChild(toast);
  setTimeout(()=>{
    toast.classList.add('out');
    setTimeout(()=>toast.remove(),300);
  },duration);
}

// ── PROFESSIONAL CONFIRMATION MODAL ──
var _confirmCallback = null;
var _confirmInputRequired = false;

function showConfirm(options){
  return new Promise((resolve)=>{
    const overlay = document.getElementById('confirm-overlay');
    const icon = document.getElementById('confirm-icon');
    const title = document.getElementById('confirm-title');
    const message = document.getElementById('confirm-message');
    const input = document.getElementById('confirm-input');
    const cancelBtn = document.getElementById('confirm-cancel');
    const okBtn = document.getElementById('confirm-ok');
    
    // Set content
    icon.textContent = options.icon || '⚠️';
    icon.className = 'confirm-icon ' + (options.type || 'warning');
    title.textContent = options.title || 'Are you sure?';
    message.innerHTML = options.message || 'This action cannot be undone.';
    
    // Input field (optional)
    if(options.input){
      input.style.display = 'block';
      input.placeholder = options.inputPlaceholder || '';
      input.value = options.inputValue || '';
      _confirmInputRequired = options.inputRequired || false;
    } else {
      input.style.display = 'none';
      _confirmInputRequired = false;
    }
    
    // Buttons
    cancelBtn.textContent = options.cancelText || 'Cancel';
    cancelBtn.style.display = options.cancelText === '' ? 'none' : 'block';
    okBtn.textContent = options.confirmText || 'Confirm';
    okBtn.className = 'confirm-btn ' + (options.type === 'danger' ? 'danger' : 'primary');
    
    // Show modal
    overlay.classList.add('visible');
    if(options.input) setTimeout(()=>{input.focus();input.select();},100);
    
    // Handle cancel
    const handleCancel = ()=>{
      overlay.classList.remove('visible');
      cleanup();
      resolve(false);
    };
    
    // Handle confirm
    const handleConfirm = ()=>{
      if(_confirmInputRequired && !input.value.trim()){
        input.style.borderColor = '#E24B4A';
        input.focus();
        return;
      }
      overlay.classList.remove('visible');
      cleanup();
      resolve(options.input ? input.value.trim() : true);
    };
    
    // Handle escape key
    const handleEscape = (e)=>{
      if(e.key === 'Escape') handleCancel();
      if(e.key === 'Enter' && !options.input) handleConfirm();
    };
    
    // Cleanup listeners
    const cleanup = ()=>{
      cancelBtn.removeEventListener('click', handleCancel);
      okBtn.removeEventListener('click', handleConfirm);
      overlay.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleEscape);
    };
    
    // Click outside to cancel
    const handleOverlayClick = (e)=>{
      if(e.target === overlay) handleCancel();
    };
    
    // Attach listeners
    cancelBtn.addEventListener('click', handleCancel);
    okBtn.addEventListener('click', handleConfirm);
    overlay.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleEscape);
  });
}

// Quick confirm helpers
function confirmLogout(){
  return showConfirm({
    icon: '👋',
    type: 'warning',
    title: 'Leaving so soon?',
    message: 'You\'ll be logged out of your account.<br>Your data will stay safe in the cloud.',
    confirmText: 'Log out',
    cancelText: 'Stay'
  });
}

function confirmDelete(itemName){
  return showConfirm({
    icon: '🗑️',
    type: 'danger',
    title: 'Delete this preset?',
    message: '<strong>"'+itemName+'"</strong> will be permanently deleted.<br>This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Keep it'
  });
}

function confirmDeleteAll(){
  return showConfirm({
    icon: '⚠️',
    type: 'danger',
    title: 'Delete ALL presets?',
    message: 'This will permanently delete <strong>all your saved presets</strong>.<br>Are you absolutely sure?',
    confirmText: 'Delete All',
    cancelText: 'Cancel'
  });
}

function confirmDeleteAccount(){
  return showConfirm({
    icon: '💔',
    type: 'danger',
    title: 'Delete your account?',
    message: 'Your account and <strong>all your data</strong> will be permanently deleted.<br>This cannot be undone.',
    confirmText: 'Delete Account',
    cancelText: 'Keep Account'
  });
}

function confirmImport(type, name){
  return showConfirm({
    icon: '📥',
    type: 'info',
    title: 'Import ' + type + '?',
    message: name ? 'Import <strong>"'+name+'"</strong>?<br>This will add to your current data.' : 'This will replace your current dashboard data.',
    confirmText: 'Import',
    cancelText: 'Cancel'
  });
}

function confirmReset(what){
  return showConfirm({
    icon: '🔄',
    type: 'warning',
    title: 'Reset ' + what + '?',
    message: 'All your progress will be cleared.<br>This action cannot be undone.',
    confirmText: 'Reset',
    cancelText: 'Keep it'
  });
}

function showInfo(icon, title, message){
  return showConfirm({
    icon: icon,
    type: 'info',
    title: title,
    message: message,
    confirmText: 'Got it',
    cancelText: ''
  }).then(()=>true);
}

// ── SYNC WITH TOAST ──
async function authSaveWithToast(){
  if(!AUTH_TOKEN){showToast('Please log in first to sync','error');return;}
  const btn=document.getElementById('l3-sync-btn');
  if(btn){btn.innerHTML='<span class="spin">↻</span> syncing';btn.disabled=true;btn.style.opacity='0.7';}
  try{
    const snapshot={};
    ['36','q',...CUSTOM_TABS.map(t=>t.id)].forEach(id=>{
      if(!S[id])return;
      const s=S[id];
      snapshot[id]={...s,ZM:s.ZM?[...s.ZM]:[],LK:s.LK?[...s.LK]:[],CM:s.CM?[...s.CM]:[]};
    });
    const r=await fetch(AUTH_URL+'/data/save',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({data:snapshot})
    });
    const d=await r.json();
    if(d.ok){
      // increment sync count
      // increment sync count on server
      let syncCount = parseInt(localStorage.getItem('batt_sync_count')||'0')+1;
      localStorage.setItem('batt_sync_count', syncCount); // keep local as cache
      const tok = _battToken();
      if(tok) fetch(AUTH_URL+'/stats/increment',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({key:'sync_count'})}).then(r=>r.json()).then(d=>{ if(d.ok){ localStorage.setItem('batt_sync_count', d.value); } }).catch(()=>{});
      localStorage.setItem('batt_last_sync',Date.now());
      updateMemberStats();
      if(btn){btn.innerHTML='✓ synced';btn.style.opacity='1';setTimeout(()=>{btn.innerHTML='↑ sync';btn.disabled=false;},1500);}
      showToast('Synced to cloud successfully!','success');
      if(typeof logActivity==='function') logActivity('sync',{tabs:Object.keys(snapshot).length});
      // refresh sidebar sync label + stats
      setTimeout(()=>{ if(typeof loadSidebarData==='function') loadSidebarData(); }, 200);
    } else {
      if(btn){btn.innerHTML='↑ sync';btn.disabled=false;btn.style.opacity='1';}
      showToast(d.error||'Sync failed','error');
      if(d.error==='Unauthorized — please log in') authForceLogout();
    }
  }catch(e){
    if(btn){btn.innerHTML='↑ sync';btn.disabled=false;btn.style.opacity='1';}
    showToast('Connection failed — check your internet','error');
  }
}

// ── UPDATE MEMBER AREA STATS ──
async function updateMemberStats(){
  // preset count (from cloud)
  const presetCount=document.getElementById('l3-stat-presets');
  if(presetCount && AUTH_TOKEN){
    try{
      const r=await fetch(AUTH_URL+'/presets/list',{headers:{'Authorization':'Bearer '+AUTH_TOKEN}});
      const d=await r.json();
      if(d.ok) presetCount.textContent=(d.presets||[]).length;
    }catch(e){presetCount.textContent='—';}
  }else if(presetCount){
    presetCount.textContent='0';
  }
  // days active
  const daysEl=document.getElementById('l3-stat-days');
  if(daysEl && AUTH_USER && AUTH_USER.created_at){
    const created=new Date(AUTH_USER.created_at);
    const now=new Date();
    const days=Math.floor((now-created)/(1000*60*60*24))+1;
    daysEl.textContent=days;
  }
  // sync count
  const syncsEl=document.getElementById('l3-stat-syncs');
  const syncsSub=document.getElementById('l3-stat-syncs-sub');
  if(syncsEl){
    syncsEl.textContent=localStorage.getItem('batt_sync_count')||'0';
  }
  // last sync
  const syncStatus=document.getElementById('l3-sync-status');
  if(syncStatus){
    const lastSync=localStorage.getItem('batt_last_sync');
    if(lastSync){
      const diff=Date.now()-parseInt(lastSync);
      const mins=Math.floor(diff/60000);
      const hours=Math.floor(diff/3600000);
      const days=Math.floor(diff/86400000);
      let txt='';
      if(mins<1) txt='synced just now';
      else if(mins<60) txt='synced '+mins+'m ago';
      else if(hours<24) txt='synced '+hours+'h ago';
      else txt='synced '+days+'d ago';
      const dot = mins < 60 ? '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#00c47a;margin-right:4px;vertical-align:middle"></span>' : '';
      syncStatus.innerHTML=dot+txt;
    }else{
      syncStatus.innerHTML='never synced';
    }
  }
}

// ── KEYBOARD SHORTCUTS ──
document.addEventListener('keydown',function(e){
  // ignore if typing in an input/textarea
  const tag=document.activeElement&&document.activeElement.tagName;
  const isTyping=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';

  // Q = collapse/expand all month groups in full trade detail
  if(e.key==='q'&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!isTyping){
    if(VIEW==='det'){
      const tbl=document.getElementById('tbl');
      if(!tbl) return;
      const btns=tbl.querySelectorAll('.mo-toggle-btn');
      if(!btns.length) return;
      const s=gs();
      if(!s.CM) s.CM=new Set();
      if(Array.isArray(s.CM)) s.CM=new Set(s.CM);
      const anyOpen=[...btns].some(b=>b.classList.contains('open'));
      btns.forEach(b=>{
        const mStr=b.getAttribute('data-mo');
        const m=Number(mStr);
        if(mStr!==null){
          const rows=tbl.querySelectorAll('[data-mo="'+mStr+'"]');
          rows.forEach(r=>r.classList.toggle('mo-collapsed',anyOpen));
          b.classList.toggle('open',!anyOpen);
          b.classList.toggle('closed',anyOpen);
          b.textContent = anyOpen ? '▸' : '▾';
          if(anyOpen){
            s.CM.add(m);
          } else {
            s.CM.delete(m);
          }
        }
      });
      try{localStorage.setItem('batt_'+TAB+'_cm',JSON.stringify({CM:[...s.CM]}));}catch(e){}
      _silentCloudSync();
      showToast(anyOpen?'all months collapsed':'all months expanded','info',1500);
    }
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){
    e.preventDefault();
    if(AUTH_TOKEN){
      authSaveWithToast();
    }else{
      authSave();
    }
  }
  // Esc = back to member area (only when in dashboard)
  if(e.key==='Escape'){
    const app=document.querySelector('.app');
    const backBtn=document.getElementById('back-to-member');
    if(app && backBtn && backBtn.style.display==='flex'){
      e.preventDefault();
      backToMemberArea();
    }
  }
  // Ctrl+Shift+A = Admin Panel (secret)
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='A'){
    e.preventDefault();
    openAdminPage();
  }
});

// ── PRESET SYSTEM (Cloud via Cloudflare D1) ──
function presetSaveModal(){
  if(!AUTH_TOKEN){showToast('Please log in to save presets','error');return;}
  const modal=document.getElementById('preset-save-modal');
  if(modal){
    modal.classList.add('open');
    document.getElementById('psm-name').value='';
    document.getElementById('psm-desc').value='';
    document.getElementById('psm-err').textContent='';
    setTimeout(()=>document.getElementById('psm-name').focus(),100);
  }
}

function presetSaveModalClose(){
  const modal=document.getElementById('preset-save-modal');
  if(modal) modal.classList.remove('open');
}

async function presetSaveConfirm(){
  const nameEl=document.getElementById('psm-name');
  const descEl=document.getElementById('psm-desc');
  const errEl=document.getElementById('psm-err');
  const btn=document.getElementById('psm-confirm-btn');
  const name=nameEl.value.trim();
  const desc=descEl.value.trim();
  
  if(!name){errEl.textContent='please enter a preset name';return;}
  if(name.length>50){errEl.textContent='name too long (max 50 chars)';return;}
  if(!AUTH_TOKEN){errEl.textContent='please log in first';return;}
  
  // capture current state
  const snapshot={};
  ['36','q',...(typeof CUSTOM_TABS!=='undefined'?CUSTOM_TABS.map(t=>t.id):[])].forEach(id=>{
    if(!S||!S[id])return;
    const s=S[id];
    snapshot[id]={...s,ZM:s.ZM?[...s.ZM]:[],LK:s.LK?[...s.LK]:[],CM:s.CM?[...s.CM]:[]};
  });
  snapshot._meta={
    activeTab:typeof activeTab!=='undefined'?activeTab:'36',
    theme:document.body.className||'t-light',
    customTabs:typeof CUSTOM_TABS!=='undefined'?JSON.parse(JSON.stringify(CUSTOM_TABS)):[],
    notLinked:NOT_LINKED
  };
  
  btn.disabled=true;
  btn.textContent='saving...';
  
  try{
    const r=await fetch(AUTH_URL+'/presets/save',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({name,description:desc,snapshot})
    });
    const d=await r.json();
    if(d.ok){
      presetSaveModalClose();
      presetRenderList();
      updateMemberStats();
      showToast('Preset "'+name+'" saved to cloud!','success');
      if(typeof logActivity==='function') logActivity('preset_save',{name});
      if(typeof incrementBadgeCounter==='function') incrementBadgeCounter('batt_badge_presets');
      // also increment on server
      const _ptok=_battToken(); if(_ptok) fetch(AUTH_URL+'/stats/increment',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_ptok},body:JSON.stringify({key:'preset_count'})}).catch(()=>{});
    }else{
      errEl.textContent=d.error||'Failed to save';
    }
  }catch(e){
    errEl.textContent='Connection failed';
  }
  btn.disabled=false;
  btn.textContent='save preset';
}

async function presetRenderList(){
  // Get both containers (member panel and dashboard panel)
  const mpContainer=document.getElementById('mp-preset-list');
  const ppContainer=document.getElementById('pp-preset-list');
  const mpCount=document.getElementById('mp-preset-count');
  const ppCount=document.getElementById('pp-preset-count');
  
  const setContent=(html)=>{
    if(mpContainer) mpContainer.innerHTML=html;
    if(ppContainer) ppContainer.innerHTML=html.replace(/mp-/g,'pp-').replace(/preset-card/g,'pp-card').replace(/preset-name/g,'pp-card-name').replace(/preset-actions/g,'pp-card-actions').replace(/preset-btn/g,'pp-card-btn').replace(/preset-meta/g,'pp-card-meta').replace(/preset-desc/g,'pp-card-desc');
  };
  const setCount=(text)=>{
    if(mpCount) mpCount.textContent=text;
    if(ppCount) ppCount.textContent=text;
  };
  
  if(!AUTH_TOKEN){
    setContent('<div class="pp-empty"><div class="pp-empty-icon">🔒</div>Log in to save and view presets</div>');
    setCount('');
    return;
  }
  
  setContent('<div class="pp-empty" style="opacity:0.5"><span class="spin">↻</span> Loading presets...</div>');
  
  try{
    const r=await fetch(AUTH_URL+'/presets/list',{
      headers:{'Authorization':'Bearer '+AUTH_TOKEN}
    });
    const d=await r.json();
    
    if(!d.ok){
      setContent('<div class="pp-empty"><div class="pp-empty-icon">⚠️</div>'+(d.error||'Failed to load')+'</div>');
      return;
    }
    
    const presets=d.presets||[];
    setCount('('+presets.length+'/20)');
    
    // Also update member area stats
    const statEl=document.getElementById('l3-stat-presets');
    if(statEl) statEl.textContent=presets.length;
    
    if(presets.length===0){
      setContent('<div class="pp-empty"><div class="pp-empty-icon">📋</div>No presets yet<br>Save your current setup to access it anytime</div>');
      return;
    }
    
    // Generate HTML for both panels
    const html=presets.map(p=>{
      const saved=new Date(p.updated_at||p.created_at);
      const pad=n=>String(n).padStart(2,'0');
      const savedStr=`${pad(saved.getDate())}/${pad(saved.getMonth()+1)}/${saved.getFullYear()} ${pad(saved.getHours())}.${pad(saved.getMinutes())}`;
      return `
        <div class="pp-card" data-id="${p.id}">
          <div class="pp-card-head">
            <button class="pp-card-name" data-name="${escHtml(p.name)}" onclick="presetLoad('${p.id}')">${escHtml(p.name)}${window._ACTIVE_PRESET&&window._ACTIVE_PRESET.id===p.id?'<span style="font-size:7px;color:#00c47a;margin-left:5px;letter-spacing:.04em;font-weight:700">● active</span>':''}</button>
            <div class="pp-card-actions">
              <button class="pp-card-btn" onclick="sharePreset('${p.id}',this.closest('.pp-card').querySelector('.pp-card-name').dataset.name)" title="Share">🔗</button>
              <button class="pp-card-btn" onclick="presetRename('${p.id}',this.closest('.pp-card').querySelector('.pp-card-name').dataset.name)" title="Rename name">✏️</button>
              <button class="pp-card-btn resave" onclick="presetResave('${p.id}',this.closest('.pp-card').querySelector('.pp-card-name').dataset.name)" title="Overwrite with current state">💾</button>
              <button class="pp-card-btn load" onclick="presetLoad('${p.id}')">load</button>
              <button class="pp-card-btn del" onclick="presetDelete('${p.id}',this.closest('.pp-card').querySelector('.pp-card-name').dataset.name)">✕</button>
            </div>
          </div>
          <div class="pp-card-meta">
            <span>📊 ${p.tab_count||1} tabs</span>
            <span title="last saved">🕒 ${savedStr}</span>
          </div>
          <div class="pp-card-desc-wrap">
            ${p.description
              ? `<div class="pp-card-desc">${escHtml(p.description)} <button class="pp-desc-edit" onclick="presetEditDesc('${p.id}','${escHtml(p.description||'')}')" title="Edit description">✏️</button></div>`
              : `<button class="pp-desc-add" onclick="presetEditDesc('${p.id}','')" title="Add description">+ add description</button>`
            }
          </div>
        </div>
      `;
    }).join('');
    
    if(ppContainer) ppContainer.innerHTML=html;
    if(mpContainer) mpContainer.innerHTML=html.replace(/pp-/g,'preset-').replace(/-card/g,'-card').replace(/-name/g,'-name');
  }catch(e){
    setContent('<div class="pp-empty"><div class="pp-empty-icon">⚠️</div>Connection failed</div>');
  }
}

function escHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Toggle presets panel in dashboard
function togglePresetsPanel(){
  const panel=document.getElementById('panel-presets');
  if(!panel)return;
  const isOpen=panel.classList.contains('open');
  panel.classList.toggle('open');
  // Load presets when opening
  if(!isOpen && AUTH_TOKEN){
    presetRenderList();
  }
}

async function presetLoad(id){
  if(!AUTH_TOKEN){showToast('Please log in','error');return;}
  
  showToast('Loading preset...','info',1500);
  
  try{
    const r=await fetch(AUTH_URL+'/presets/load?id='+id,{
      headers:{'Authorization':'Bearer '+AUTH_TOKEN}
    });
    const d=await r.json();
    
    if(!d.ok||!d.preset){
      showToast(d.error||'Preset not found','error');
      return;
    }
    
    const preset=d.preset;
    const snapshot=preset.snapshot;
    
    // restore custom tabs first
    if(snapshot._meta&&snapshot._meta.customTabs&&Array.isArray(snapshot._meta.customTabs)){
      CUSTOM_TABS.length=0;
      snapshot._meta.customTabs.forEach(t=>CUSTOM_TABS.push(t));
    }
    
    // restore state
    Object.keys(snapshot).forEach(tabId=>{
      if(tabId==='_meta')return;
      if(!S[tabId])S[tabId]=mkState();
      Object.assign(S[tabId],snapshot[tabId]);
      if(snapshot[tabId].BT){
        const st=sanitizeTradesArray(snapshot[tabId].BT, snapshot[tabId].FR);
        S[tabId].BT=st.bt;
        S[tabId].FR=st.fr;
      }
      if(snapshot[tabId].MT){
        Object.keys(snapshot[tabId].MT).forEach(m=>{
          if(snapshot[tabId].MT[m] && snapshot[tabId].MT[m].bt){
            const stm=sanitizeTradesArray(snapshot[tabId].MT[m].bt, snapshot[tabId].MT[m].fr);
            S[tabId].MT[m].bt=stm.bt;
            S[tabId].MT[m].fr=stm.fr;
          }
        });
      }
      if(snapshot[tabId].ZM) S[tabId].ZM=new Set(snapshot[tabId].ZM);
      if(snapshot[tabId].LK) S[tabId].LK=new Set(snapshot[tabId].LK);
      if(snapshot[tabId].CM) S[tabId].CM=new Set(snapshot[tabId].CM);
    });
    
    // restore theme
    if(snapshot._meta&&snapshot._meta.theme){
      document.body.className=snapshot._meta.theme;
      document.querySelectorAll('.th-btn').forEach(b=>{
        b.classList.toggle('on',b.dataset.t===snapshot._meta.theme);
      });
    }
    
    // restore notional link state
    if(snapshot._meta&&typeof snapshot._meta.notLinked==='boolean'){
      NOT_LINKED=snapshot._meta.notLinked;
      localStorage.setItem('batt_not_linked',NOT_LINKED?'true':'false');
      // restore carry-forward per tab
      if(typeof snapshot._meta.cf !== 'undefined') gs().CF = snapshot._meta.cf;
      const nlb=document.getElementById('not-link-btn');
      if(nlb){
        nlb.textContent=NOT_LINKED?'on':'off';
        nlb.style.color=NOT_LINKED?'var(--acc2)':'var(--tx3)';
        nlb.style.borderColor=NOT_LINKED?'var(--acc2)':'var(--bd2)';
        nlb.style.background=NOT_LINKED?'var(--btno)':'var(--btn)';
      }
    }
    
    // restore active tab
    if(snapshot._meta&&snapshot._meta.activeTab&&typeof setTab==='function'){
      setTab(snapshot._meta.activeTab);
    }
    
    // re-render
    if(typeof renderTabBar==='function') renderTabBar();
    if(typeof syncControls==='function') syncControls();
    if(typeof render==='function') render();
    
    // close panels
    memberClose();
    const pp=document.getElementById('panel-presets');
    if(pp) pp.classList.remove('open');
    
    // if in member area, go to dashboard
    const l3=document.getElementById('layer3');
    if(l3&&l3.classList.contains('visible')){
      openDashboard();
    }
    
    // track active preset for auto-resave
    window._ACTIVE_PRESET = {id: preset.id, name: preset.name};
    try{localStorage.setItem('batt_active_preset',JSON.stringify({id:preset.id,name:preset.name}));}catch(e){}

    // auto-create matching journal folder if it doesn't exist yet
    if(typeof JN!=='undefined'&&JN.folders){
      _getOrCreatePresetFolder(preset.name);
    }
    const _pbl2=document.getElementById('auth-preset-lbl');
    const _pbc2=document.getElementById('auth-preset-clear');
    if(_pbl2){_pbl2.textContent='● '+preset.name;_pbl2.style.display='';}
    if(_pbc2) _pbc2.style.display='';
    // lock controls immediately — don't wait for softUpdate
    if(typeof syncControls==='function') syncControls();

    showToast('Preset "'+preset.name+'" loaded!','success');
    if(typeof logActivity==='function') logActivity('preset_load',{name:preset.name});
    // apply user slot preference on top of preset — user choice wins
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
    if(typeof softUpdate==='function') setTimeout(softUpdate,100);
  }catch(e){
    showToast('Connection failed','error');
  }
}

async function presetDelete(id,name){
  if(!AUTH_TOKEN){showToast('Please log in','error');return;}
  const confirmed = await confirmDelete(name);
  if(!confirmed) return;
  
  try{
    const r=await fetch(AUTH_URL+'/presets/delete',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({id})
    });
    const d=await r.json();
    if(d.ok){
      presetRenderList();
      updateMemberStats();
      // clear active preset tracker if this was the active one
      if(window._ACTIVE_PRESET&&window._ACTIVE_PRESET.id===id){
        window._ACTIVE_PRESET=null;
        try{localStorage.removeItem('batt_active_preset');}catch(e){}
        const _dpbl=document.getElementById('auth-preset-lbl');
        const _dpbc=document.getElementById('auth-preset-clear');
        if(_dpbl){_dpbl.textContent='';_dpbl.style.display='none';}
        if(_dpbc) _dpbc.style.display='none';
      }
      showToast('Preset deleted','info');
      if(typeof logActivity==='function') logActivity('preset_delete',{name});
    }else{
      showToast(d.error||'Failed to delete','error');
    }
  }catch(e){
    showToast('Connection failed','error');
  }
}

async function presetResave(id, name){
  if(!AUTH_TOKEN){showToast('Please log in','error');return;}
  const ok = await showConfirm({
    icon:'💾', type:'info',
    title:'Overwrite preset?',
    message:`Save current cockpit state into "${name}"? This replaces the existing data.`,
    confirmText:'overwrite', cancelText:'cancel'
  });
  if(!ok) return;
  const snapshot={};
  ['36','q',...(typeof CUSTOM_TABS!=='undefined'?CUSTOM_TABS.map(t=>t.id):[])].forEach(tid=>{
    if(!S||!S[tid])return;
    const s=S[tid];
    snapshot[tid]={...s,ZM:s.ZM?[...s.ZM]:[],LK:s.LK?[...s.LK]:[],CM:s.CM?[...s.CM]:[]};
  });
  snapshot._meta={
    activeTab:typeof activeTab!=='undefined'?activeTab:'36',
    theme:document.body.className||'',
    customTabs:typeof CUSTOM_TABS!=='undefined'?JSON.parse(JSON.stringify(CUSTOM_TABS)):[],
    notLinked:NOT_LINKED,
    cf:gs().CF!==false
  };
  try{
    // save fresh copy first, then delete the old one — guaranteed atomic overwrite
    const rSave=await fetch(AUTH_URL+'/presets/save',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({name, snapshot})
    });
    const dSave=await rSave.json();
    if(!dSave.ok){ showToast(dSave.error||'Failed to save','error'); return; }
    // delete old
    await fetch(AUTH_URL+'/presets/delete',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({id})
    });
    presetRenderList();
    showToast('Preset "'+name+'" overwritten!','success');
  }catch(e){ showToast('Connection failed','error'); }
}

async function presetEditDesc(id, currentDesc){
  if(!AUTH_TOKEN){showToast('Please log in','error');return;}
  const newDesc = await showConfirm({
    icon:'📝', type:'info',
    title:'Edit description',
    message:'Update the description for this preset.',
    input:true,
    inputValue:currentDesc,
    inputPlaceholder:'e.g. conservative 5x setup, low risk',
    confirmText:'save', cancelText:'cancel'
  });
  if(newDesc===false||newDesc===null) return;
  try{
    const r=await fetch(AUTH_URL+'/presets/rename',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({id, description:newDesc.trim()})
    });
    const d=await r.json();
    if(d.ok){ presetRenderList(); showToast('Description updated','success'); }
    else showToast(d.error||'Failed to update','error');
  }catch(e){ showToast('Connection failed','error'); }
}

async function presetRename(id,currentName){
  if(!AUTH_TOKEN){showToast('Please log in','error');return;}
  
  const newName = await showConfirm({
    icon: '✏️',
    type: 'info',
    title: 'Rename Preset',
    message: 'Enter a new name for this preset.',
    input: true,
    inputValue: currentName,
    inputPlaceholder: 'Preset name',
    inputRequired: true,
    confirmText: 'Rename',
    cancelText: 'Cancel'
  });
  
  if(!newName || newName.trim() === currentName) return;
  
  try{
    const r=await fetch(AUTH_URL+'/presets/rename',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({id,name:newName.trim()})
    });
    const d=await r.json();
    if(d.ok){
      const trimmedName=newName.trim();
      // sync journal folder name if this is the active preset
      if(window._ACTIVE_PRESET&&window._ACTIVE_PRESET.id===id){
        const oldName=window._ACTIVE_PRESET.name;
        window._ACTIVE_PRESET.name=trimmedName;
        try{localStorage.setItem('batt_active_preset',JSON.stringify(window._ACTIVE_PRESET));}catch(e){}
        // update journal folder name
        const jFolder=JN.folders.find(f=>f.name===oldName);
        if(jFolder){
          jFolder.name=trimmedName;
          // also update all cockpit trade records in that folder
          (JN.trades[jFolder.id]||[]).forEach(t=>{/* folder ref is by id, no update needed */});
          jnSave();
        }
        // update user bar label
        const _pbl=document.getElementById('auth-preset-lbl');
        if(_pbl){_pbl.textContent='● '+trimmedName;}
      }
      presetRenderList();
      showToast('Preset renamed','success');
      if(typeof logActivity==='function') logActivity('preset_rename',{name:trimmedName});
    }else{
      showToast(d.error||'Failed to rename','error');
    }
  }catch(e){
    showToast('Connection failed','error');
  }
}

// render preset list when member panel opens
function memberOpen(){
  // Toggle the main presets panel instead of the duplicate member-panel
  const presetsPanel = document.querySelector('.panel-presets');
  if(presetsPanel){
    presetsPanel.classList.toggle('open');
    // Also update preset list
    if(presetsPanel.classList.contains('open') && typeof presetRenderList === 'function'){
      presetRenderList();
    }
  }
}

function memberClose(){
  const presetsPanel = document.querySelector('.panel-presets');
  if(presetsPanel) presetsPanel.classList.remove('open');
}

// ── MEMBER AREA AI ASSISTANT ──
var L3_AI_LANG = 'en';

var L3_AI_RESPONSES = {
  en: {
    what: "Welcome to BATT! Here's what you can do:\n\n📊 <b>Dashboard Cockpit</b> — Your command center. Plan trades, set position sizes, calculate liquidation levels, and project portfolio growth over 36 months.\n\n⚡ <b>Trade Panel</b> — Your all-in-one trading workspace. Practice with simulations, connect via API for live execution, and sharpen your edge with real market data.\n\n💾 <b>Presets</b> — Save your cockpit configurations and load them anytime. Share presets with friends too!\n\n📈 <b>Trade Journal</b> (coming soon) — Log and analyze your real trades.\n\n🤝 <b>Bet With Us</b> (coming soon) — We're building this together. A partnership space to share ideas and shape how this platform grows.",
    cockpit: "The <b>Dashboard Cockpit</b> is your command center for preparation.\n\n• Set your starting capital and position size\n• Configure up to 10 trade slots with target %\n• See liquidation levels for each trade\n• Project your portfolio growth over 36 months\n• Toggle between Leverage and Spot modes\n• Use quarter view for detailed monthly breakdowns\n\nThe cockpit uses notional compounding — each trade's profit adds to your next trade's base. It's all about planning before you execute!",
    trade: "The <b>Trade Panel</b> is your complete trading workspace.\n\n• Real-time prices from Binance API\n• Live order book with clickable prices\n• Place market & limit orders (Spot or Perpetual)\n• Track open positions with live P&L\n• Set Take Profit & Stop Loss\n• View your trade history and stats\n\nPractice with paper trading, or connect your API for real execution. Build your skills, test strategies, and trade with confidence.",
    presets: "Presets let you save your Dashboard Cockpit configurations.\n\n• Click the 💾 button on the right side of the cockpit\n• Name your preset and save it to the cloud\n• Load any preset with one click\n• Share presets with friends via link or QR code\n• Each preset stores: capital, position size, trade slots, theme, and mode\n\nYour presets sync across devices when you're logged in!"
  },
  id: {
    what: "Selamat datang di BATT! Ini yang bisa kamu lakukan:\n\n📊 <b>Dashboard Cockpit</b> — Pusat komando kamu. Rencanakan trade, atur position size, hitung level likuidasi, dan proyeksikan pertumbuhan portfolio 36 bulan.\n\n⚡ <b>Trade Panel</b> — Workspace trading lengkap. Latihan dengan simulasi, koneksikan API untuk eksekusi real, dan asah kemampuanmu dengan data market real.\n\n💾 <b>Presets</b> — Simpan konfigurasi cockpit dan load kapan saja. Bisa share preset ke teman juga!\n\n📈 <b>Trade Journal</b> (segera hadir) — Catat dan analisis trade aslimu.\n\n🤝 <b>Bet With Us</b> (segera hadir) — Kita membangun ini bersama. Ruang partnership untuk berbagi ide dan membentuk platform ini.",
    cockpit: "<b>Dashboard Cockpit</b> adalah pusat komando untuk persiapan.\n\n• Atur modal awal dan position size\n• Konfigurasi hingga 10 trade slot dengan target % dan frekuensi\n• Lihat level likuidasi untuk setiap trade\n• Proyeksikan pertumbuhan portfolio 36 bulan\n• Toggle antara mode Leverage dan Spot\n• Gunakan quarter view untuk breakdown bulanan detail\n\nCockpit ini pakai notional compounding — profit setiap trade ditambahkan ke base trade berikutnya. Semua tentang persiapan!",
    trade: "<b>Trade Panel</b> adalah workspace trading lengkapmu.\n\n• Harga real-time dari Binance API\n• Order book live dengan harga yang bisa diklik\n• Buat market & limit order (Spot atau Perpetual)\n• Tracking posisi terbuka dengan P&L live\n• Atur Take Profit & Stop Loss\n• Lihat history trade dan statistik\n\nLatihan dengan paper trading, atau koneksikan API untuk eksekusi real. Bangun skill, tes strategi, dan trade dengan percaya diri.",
    presets: "Presets memungkinkan kamu menyimpan konfigurasi Dashboard Cockpit.\n\n• Klik tombol 💾 di sisi kanan cockpit\n• Beri nama preset dan simpan ke cloud\n• Load preset manapun dengan satu klik\n• Share preset ke teman via link atau QR code\n• Setiap preset menyimpan: modal, position size, trade slots, tema, dan mode\n\nPreset-mu sync antar device saat login!"
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

function l3AiSetLang(lang){
  L3_AI_LANG = lang;
  const btns = document.querySelectorAll('.l3-ai-lang button');
  btns.forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === lang));
  
  const desc = document.getElementById('l3-ai-desc');
  if(desc){
    desc.textContent = lang === 'id' 
      ? 'Saya tahu semua tentang situs ini — dari Dashboard Cockpit sampai Trade Panel. Tanya apa saja!'
      : "I know everything about this site — from the Dashboard Cockpit to Trade Panel. Ask me anything!";
  }
  
  // Update chips
  const chipsEl = document.getElementById('l3-ai-chips');
  if(chipsEl){
    const chips = L3_AI_CHIPS[lang];
    chipsEl.innerHTML = Object.keys(chips).map(key => 
      `<button onclick="l3AiAsk('${key}')">${chips[key]}</button>`
    ).join('');
  }
  
  // Clear response
  const resp = document.getElementById('l3-ai-response');
  if(resp) resp.classList.remove('visible');
}

function l3AiAsk(topic){
  const resp = document.getElementById('l3-ai-response');
  if(!resp) return;
  
  const answer = L3_AI_RESPONSES[L3_AI_LANG][topic];
  if(answer){
    resp.innerHTML = answer.replace(/\n/g, '<br>');
    resp.classList.add('visible');
    resp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── ACCOUNT PAGE FUNCTIONS ──
// ── MOBILE BOTTOM NAV ──
function mbnGo(page){
  // update active state
  ['member','cockpit','trade','account'].forEach(function(p){
    var btn=document.getElementById('mbn-'+p);
    if(btn) btn.classList.toggle('active', p===page);
  });
  switch(page){
    case 'member':    backToMemberArea(); break;
    case 'cockpit':   openDashboard(); break;
    case 'trade':     openTradingPage(); break;
    case 'account':   openAccountPage(); break;
  }
}

// call this whenever a page opens to sync the active tab
function mbnSetActive(page){
  ['member','cockpit','trade','account'].forEach(function(p){
    var btn=document.getElementById('mbn-'+p);
    if(btn) btn.classList.toggle('active', p===page);
  });
}

function openAccountPage(){
  document.body.style.overflow='auto';
  battNav('account');
  mbnSetActive('account');
  const page=document.getElementById('account-page');
  if(page){
    page.classList.add('visible');
    loadAccountPage();
  }
}

function closeAccountPage(){
  document.body.style.overflow='auto';
  battNav('member');
  mbnSetActive('member');
  const page=document.getElementById('account-page');
  if(page) page.classList.remove('visible');
}

// ── ADMIN PANEL FUNCTIONS ──
var ADMIN_KEY = null;
var ADMIN_USERS_PAGE = 1;
var ADMIN_ACTIVITY_PAGE = 1;

function openAdminPage(){
  const page = document.getElementById('admin-page');
  if(page) page.classList.add('visible');
  
  // If already logged in, show dashboard
  if(ADMIN_KEY){
    document.getElementById('admin-login-section').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    adminLoadStats();
    adminLoadUsers();
  } else {
    document.getElementById('admin-login-section').style.display = 'block';
    document.getElementById('admin-dashboard').style.display = 'none';
  }
}

function closeAdminPage(){
  const page = document.getElementById('admin-page');
  if(page) page.classList.remove('visible');
}

async function adminLogin(){
  const input = document.getElementById('admin-key-input');
  const err = document.getElementById('admin-login-err');
  const key = input?.value?.trim();
  
  if(!key){
    err.textContent = 'Please enter admin key';
    return;
  }
  
  err.textContent = 'Verifying...';
  
  try {
    const r = await fetch(AUTH_URL + '/admin/stats', {
      headers: { 'X-Admin-Key': key }
    });
    
    if(r.ok){
      ADMIN_KEY = key;
      err.textContent = '';
      input.value = '';
      document.getElementById('admin-login-section').style.display = 'none';
      document.getElementById('admin-dashboard').style.display = 'block';
      adminLoadStats();
      adminLoadUsers();
    } else {
      err.textContent = 'Invalid admin key';
    }
  } catch(e){
    err.textContent = 'Connection error';
  }
}

async function adminLoadStats(){
  try {
    const r = await fetch(AUTH_URL + '/admin/stats', {
      headers: { 'X-Admin-Key': ADMIN_KEY }
    });
    const d = await r.json();
    if(d.ok && d.stats){
      document.getElementById('admin-total-users').textContent = d.stats.total_users || 0;
      document.getElementById('admin-new-users').textContent = d.stats.new_users_7d || 0;
      document.getElementById('admin-active-users').textContent = d.stats.active_users_7d || 0;
      document.getElementById('admin-total-presets').textContent = d.stats.total_presets || 0;
      document.getElementById('admin-total-syncs').textContent = d.stats.total_syncs || 0;
      document.getElementById('admin-shared-presets').textContent = d.stats.shared_presets || '—';
    }
  } catch(e){
    console.error('Admin stats error:', e);
  }
}

async function adminLoadUsers(page = 1, search = ''){
  ADMIN_USERS_PAGE = page;
  const tbody = document.getElementById('admin-users-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">Loading...</td></tr>';
  
  try {
    let url = AUTH_URL + '/admin/users?page=' + page;
    if(search) url += '&search=' + encodeURIComponent(search);
    
    const r = await fetch(url, {
      headers: { 'X-Admin-Key': ADMIN_KEY }
    });
    const d = await r.json();
    
    if(d.ok && d.users){
      if(d.users.length === 0){
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#555;padding:20px">No users found</td></tr>';
      } else {
        tbody.innerHTML = d.users.map(u => {
          const isGoogle = u.password_hash ? u.password_hash.startsWith('google:') : null;
          const authBadge = isGoogle === null
            ? '<span style="color:#333;font-size:9px">—</span>'
            : isGoogle
              ? '<span style="background:#1a3060;color:#4a9eff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">G</span>'
              : '<span style="background:#1a1a1a;color:#888;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">✉</span>';
          return `
          <tr>
            <td><strong>${escHtml(u.username)}</strong></td>
            <td>${escHtml(u.email)}</td>
            <td style="text-align:center">${authBadge}</td>
            <td>${formatDate(u.created_at)}</td>
            <td>${u.last_login ? formatDate(u.last_login) : '—'}</td>
            <td>${u.preset_count || 0}</td>
            <td>${u.sync_count || 0}</td>
          </tr>
        `}).join('');
      }
      
      // Pagination
      const pag = document.getElementById('admin-users-pagination');
      const pages = d.pagination?.pages || 1;
      const currentPage = d.pagination?.page || 1;
      
      if(pages > 1){
        let html = '';
        html += `<button ${currentPage <= 1 ? 'disabled' : ''} onclick="adminLoadUsers(${currentPage - 1}, '${search}')">← Prev</button>`;
        for(let i = 1; i <= Math.min(pages, 5); i++){
          html += `<button class="${i === currentPage ? 'active' : ''}" onclick="adminLoadUsers(${i}, '${search}')">${i}</button>`;
        }
        if(pages > 5){
          html += `<span style="color:#555;padding:0 8px">...</span>`;
          html += `<button onclick="adminLoadUsers(${pages}, '${search}')">${pages}</button>`;
        }
        html += `<button ${currentPage >= pages ? 'disabled' : ''} onclick="adminLoadUsers(${currentPage + 1}, '${search}')">Next →</button>`;
        pag.innerHTML = html;
      } else {
        pag.innerHTML = '';
      }
    }
  } catch(e){
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#E24B4A;padding:20px">Error loading users</td></tr>';
  }
}

function adminSearchUsers(){
  const search = document.getElementById('admin-search-input')?.value?.trim() || '';
  adminLoadUsers(1, search);
}

async function adminLoadActivity(page = 1){
  ADMIN_ACTIVITY_PAGE = page;
  const tbody = document.getElementById('admin-activity-tbody');
  tbody.innerHTML = '<tr><td colspan="4" class="admin-loading">Loading...</td></tr>';
  const filter = document.getElementById('admin-activity-filter')?.value || '';
  try {
    let url = AUTH_URL + '/admin/activity?page=' + page;
    if(filter) url += '&action=' + encodeURIComponent(filter);
    const r = await fetch(url, { headers: { 'X-Admin-Key': ADMIN_KEY } });
    const d = await r.json();
    if(d.ok && d.activity){
      if(d.activity.length === 0){
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#555;padding:20px">No activity found</td></tr>';
      } else {
        tbody.innerHTML = d.activity.map(a => {
          const badgeClass = a.action === 'sync' ? 'sync' : (a.action === 'login' ? 'login' : 'preset');
          return `
          <tr>
            <td>${escHtml(a.username || '—')}</td>
            <td><span class="admin-badge ${badgeClass}">${escHtml(a.action)}</span></td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(a.details || '—')}</td>
            <td>${formatDate(a.created_at)}</td>
          </tr>
        `}).join('');
      }
    }
  } catch(e){
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#E24B4A;padding:20px">Error loading activity</td></tr>';
  }
}

function adminShowTab(tab){
  // Update tab buttons
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  // Show/hide content
  document.getElementById('admin-users-tab').style.display = tab === 'users' ? 'block' : 'none';
  document.getElementById('admin-activity-tab').style.display = tab === 'activity' ? 'block' : 'none';
  
  // Load data
  if(tab === 'activity'){
    adminLoadActivity();
  }
}

function formatDate(ts){
  if(!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function escHtml(str){
  if(!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadAccountPage(){
  const user=AUTH_USER||{};
  
  // Avatar
  const avatar=document.getElementById('acc-avatar');
  if(avatar){
    if(user.picture){
      avatar.innerHTML='<img src="'+user.picture+'" style="width:100%;height:100%;object-fit:cover">';
    }else{
      avatar.innerHTML='';
      avatar.textContent=(user.username||user.email||'U')[0].toUpperCase();
    }
  }
  
  // Basic info
  const username=document.getElementById('acc-username');
  const email=document.getElementById('acc-email');
  const since=document.getElementById('acc-since');
  if(username) username.textContent=user.username||'—';
  if(email) email.textContent=user.email||'—';
  if(since && user.created_at){
    since.textContent=new Date(user.created_at).toLocaleDateString();
  }
  
  // Google indicator
  const googleEl=document.getElementById('acc-google');
  const isGoogle=user.google_id||localStorage.getItem('batt_auth_google');
  if(googleEl) googleEl.style.display=isGoogle?'inline':'none';
  
  // Security section - show password change for email users, google message for google users
  const passSection=document.getElementById('acc-security-password');
  const googleSection=document.getElementById('acc-security-google');
  if(passSection) passSection.style.display=isGoogle?'none':'block';
  if(googleSection) googleSection.style.display=isGoogle?'block':'none';
  
  // Stats
  const statPresets=document.getElementById('acc-stat-presets');
  const statSyncs=document.getElementById('acc-stat-syncs');
  const statDays=document.getElementById('acc-stat-days');
  if(statSyncs) statSyncs.textContent=localStorage.getItem('batt_sync_count')||'0';
  if(statDays && user.created_at){
    const days=Math.floor((Date.now()-user.created_at)/(1000*60*60*24))+1;
    statDays.textContent=days;
  }
  
  // Fetch preset count
  if(statPresets && AUTH_TOKEN){
    try{
      const r=await fetch(AUTH_URL+'/presets/list',{headers:{'Authorization':'Bearer '+AUTH_TOKEN}});
      const d=await r.json();
      if(d.ok) statPresets.textContent=(d.presets||[]).length;
    }catch(e){}
  }
  
  // Last sync
  const lastSync=document.getElementById('acc-last-sync');
  if(lastSync){
    const ls=localStorage.getItem('batt_last_sync');
    if(ls){
      const diff=Date.now()-parseInt(ls);
      const mins=Math.floor(diff/60000);
      if(mins<1) lastSync.textContent='synced just now';
      else if(mins<60) lastSync.textContent='synced '+mins+' min ago';
      else lastSync.textContent='synced '+Math.floor(diff/3600000)+' hr ago';
    }
  }
  
  // Preferences
  const prefTheme=document.getElementById('acc-pref-theme');
  const prefLang=document.getElementById('acc-pref-lang');
  const prefs=_safeJSON(localStorage.getItem('batt_prefs'), {});
  if(prefTheme) prefTheme.value=prefs.ma_theme||'ma-dark';
  if(prefLang) prefLang.value=prefs.lang||'en';
  // sync pill active states
  if(typeof _syncThemePills==='function') _syncThemePills(prefs.ma_theme||'ma-dark');
  if(typeof accSetLang==='function') accSetLang(prefs.lang||'en');
  if(typeof l3SetTheme==='function') l3SetTheme(prefs.ma_theme||'ma-dark', true);
  // Apply member theme
  if(prefs.ma_theme) applyMemberTheme(prefs.ma_theme);
  
  // Load activity log
  if(typeof loadActivityLog==='function') loadActivityLog(true);
  
  // Render badges
  if(typeof renderBadges==='function') renderBadges();
  // Also populate sidebar
  if(typeof loadSidebarData==='function') loadSidebarData();
}

// ── MEMBER AREA SIDEBAR FUNCTIONS ──
function toggleL3Sidebar(){
  var sb=document.getElementById('l3-sb');
  if(!sb) return;
  var collapsed=sb.classList.toggle('collapsed');
  localStorage.setItem('batt_sb_collapsed', collapsed?'1':'0');
  var btn=document.getElementById('l3-sb-toggle');
  if(btn) btn.title=collapsed?'Expand':'Collapse';
}

async function loadSidebarData(){
  var user=AUTH_USER||{};

  // Avatar
  var sbAv=document.getElementById('sb-avatar');
  if(sbAv){
    if(user.picture){ sbAv.innerHTML='<img src="'+user.picture+'" style="width:100%;height:100%;object-fit:cover">'; }
    else { sbAv.innerHTML=''; sbAv.textContent=(user.username||user.email||'U')[0].toUpperCase(); }
  }

  // User info
  var sbUser=document.getElementById('sb-username');
  var sbEmail=document.getElementById('sb-email');
  var sbType=document.getElementById('sb-type');
  var sbJoined=document.getElementById('sb-joined');
  if(sbUser) sbUser.textContent=(user.username?('@'+user.username):user.email)||'—';
  if(sbEmail) sbEmail.textContent=user.email||'—';
  if(sbType) sbType.textContent=(user.tier||'free').toUpperCase();
  if(sbJoined && user.created_at) sbJoined.textContent='📅 joined '+new Date(user.created_at).toLocaleDateString();

  // Stats
  var sbPresets=document.getElementById('sb-stat-presets');
  var sbSyncs=document.getElementById('sb-stat-syncs');
  var sbDays=document.getElementById('sb-stat-days');
  if(sbSyncs) sbSyncs.textContent=localStorage.getItem('batt_sync_count')||'0';
  if(sbDays && user.created_at){
    sbDays.textContent=Math.floor((Date.now()-user.created_at)/(1000*60*60*24))+1;
  }
  if(sbPresets && AUTH_TOKEN){
    try{
      var r=await fetch(AUTH_URL+'/presets/list',{headers:{'Authorization':'Bearer '+AUTH_TOKEN}});
      var d=await r.json();
      if(d.ok) sbPresets.textContent=(d.presets||[]).length;
    }catch(e){}
  }

  // Last sync
  var sbSync=document.getElementById('sb-last-sync');
  if(sbSync){
    var ls=localStorage.getItem('batt_last_sync');
    if(ls){
      var diff=Date.now()-parseInt(ls);
      var mins=Math.floor(diff/60000);
      if(mins<1) sbSync.textContent='synced just now';
      else if(mins<60) sbSync.textContent='synced '+mins+' min ago';
      else sbSync.textContent='synced '+Math.floor(diff/3600000)+' hr ago';
    } else { sbSync.textContent='never synced'; }
  }

  // Security
  var sbPass=document.getElementById('sb-security-password');
  var sbGoogle=document.getElementById('sb-security-google');
  var isGoogle=user.google_id||localStorage.getItem('batt_auth_google');
  if(sbPass) sbPass.style.display=isGoogle?'none':'block';
  if(sbGoogle) sbGoogle.style.display=isGoogle?'block':'none';

  // Preferences
  var prefs=_safeJSON(localStorage.getItem('batt_prefs'), {});
  _syncSidebarThemePills(prefs.ma_theme||'ma-dark');
  _syncSidebarLangPills(prefs.lang||'en');

  // Restore collapsed state
  var sb=document.getElementById('l3-sb');
  if(sb && localStorage.getItem('batt_sb_collapsed')==='1') sb.classList.add('collapsed');

  // Activity log (reuse existing renderActivityItems or load fresh)
  if(typeof loadActivityLog==='function') loadSidebarActivity();

  // Badges
  if(typeof renderBadges==='function') renderSidebarBadges();
}

function _syncSidebarThemePills(val){
  document.querySelectorAll('#sb-theme-pills button').forEach(function(b){
    var active=b.dataset.theme===val;
    b.classList.toggle('active', active);
  });
}
function _syncSidebarLangPills(val){
  document.querySelectorAll('#sb-lang-pills button').forEach(function(b){
    var active=b.dataset.lang===val;
    b.classList.toggle('active', active);
  });
}

function loadSidebarActivity(){
  var container=document.getElementById('sb-activity-log');
  if(!container) return;
  var log=_safeJSON(localStorage.getItem('batt_activity_log'), []);
  if(!log.length){ container.innerHTML='<div style="font-size:9px;color:#222;padding:8px 0;text-align:center">no activity yet</div>'; return; }
  var html='';
  log.slice(0,8).forEach(function(item){
    html+='<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:0.5px solid #111">';
    html+='<span style="font-size:12px">'+( item.icon||'•')+'</span>';
    html+='<div style="flex:1;min-width:0"><div style="font-size:9px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(item.action||item.type||'—')+'</div>';
    html+='<div style="font-size:8px;color:#2a2a2a">'+formatTimestamp(item.ts||item.timestamp)+'</div></div>';
    html+='</div>';
  });
  container.innerHTML=html;
}

function renderSidebarBadges(){
  var grid=document.getElementById('sb-badges-grid');
  var ulEl=document.getElementById('sb-badges-unlocked');
  var totEl=document.getElementById('sb-badges-total');
  if(!grid) return;
  var unlocked=parseInt(document.getElementById('badges-unlocked')&&document.getElementById('badges-unlocked').textContent)||0;
  var total=parseInt(document.getElementById('badges-total')&&document.getElementById('badges-total').textContent)||10;
  if(ulEl) ulEl.textContent=unlocked;
  if(totEl) totEl.textContent=total;
  // Mirror badges-grid
  var src=document.getElementById('badges-grid');
  if(src) grid.innerHTML=src.innerHTML;
}

function l3SetTheme(val, silent){
  applyMemberTheme(val);
  if(!silent) savePrefSilent('ma_theme', val);
  _syncThemePills(val);
  if(typeof _syncSidebarThemePills==='function') _syncSidebarThemePills(val);
  // update topbar pills
  ['dark','midnight','light'].forEach(t=>{
    var btn=document.getElementById('l3t-'+t);
    if(!btn) return;
    btn.classList.toggle('active', 'ma-'+t === val);
  });
  if(!silent) showToast('Theme changed','success',1200);
}
function _syncThemePills(val){
  document.querySelectorAll('#acc-theme-pills button').forEach(b=>{
    const active = b.dataset.theme === val;
    b.style.background = active ? '#00c47a' : '#0a0a0a';
    b.style.color = active ? '#000' : '#e0e0e0';
    b.style.borderColor = active ? '#00c47a' : '#222';
  });
  const inp = document.getElementById('acc-pref-theme');
  if(inp) inp.value = val;
}
function accSetTheme(val){
  _syncThemePills(val);
  _syncSidebarThemePills(val);
  // also sync l3 switcher
  ['dark','light','midnight','emerald'].forEach(t=>{
    const btn = document.getElementById('l3t-'+t);
    if(!btn) return;
    btn.style.borderColor = ('ma-'+t === val) ? '#00c47a' : 'transparent';
    btn.style.transform = ('ma-'+t === val) ? 'scale(1.15)' : 'scale(1)';
  });
  applyMemberTheme(val);
  savePrefSilent('ma_theme', val);
  showToast('Theme changed','success',1200);
}
function accSetLang(val){
  document.querySelectorAll('#acc-lang-pills button').forEach(b=>{
    const active = b.dataset.lang === val;
    b.style.background = active ? '#00c47a' : '#0a0a0a';
    b.style.color = active ? '#000' : '#e0e0e0';
    b.style.borderColor = active ? '#00c47a' : '#222';
  });
  const inp = document.getElementById('acc-pref-lang');
  if(inp) inp.value = val;
  if(typeof _syncSidebarLangPills==='function') _syncSidebarLangPills(val);
  savePref('lang', val);
}
function savePrefSilent(key,value){
  const prefs=_safeJSON(localStorage.getItem('batt_prefs'), {});
  prefs[key]=value;
  localStorage.setItem('batt_prefs',JSON.stringify(prefs));
  if(key==='ma_theme') applyMemberTheme(value);
  if(key==='lang'&&typeof aiSetLang==='function') aiSetLang(value);
  if(AUTH_TOKEN){
    fetch(AUTH_URL+'/prefs/save',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},body:JSON.stringify({prefs})}).catch(()=>{});
  }
}
function savePref(key,value){
  const prefs=_safeJSON(localStorage.getItem('batt_prefs'), {});
  prefs[key]=value;
  localStorage.setItem('batt_prefs',JSON.stringify(prefs));
  
  // Apply immediately
  if(key==='ma_theme'){
    applyMemberTheme(value);
  }
  if(key==='lang'&&typeof aiSetLang==='function'){
    aiSetLang(value);
  }
  
  // Save to cloud if logged in
  if(AUTH_TOKEN){
    fetch(AUTH_URL+'/prefs/save',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({prefs})
    }).catch(()=>{});
  }
  
  showToast('Preference saved','success',1500);
}

// Load preferences from cloud
async function loadCloudPrefs(){
  if(!AUTH_TOKEN)return;
  try{
    const r=await fetch(AUTH_URL+'/prefs/load',{
      headers:{'Authorization':'Bearer '+AUTH_TOKEN}
    });
    const d=await r.json();
    if(d.ok && d.prefs){
      // Merge with localStorage (cloud takes priority)
      const local=_safeJSON(localStorage.getItem('batt_prefs'), {});
      const merged={...local,...d.prefs};
      localStorage.setItem('batt_prefs',JSON.stringify(merged));
      // Apply member theme if set
      if(merged.ma_theme) applyMemberTheme(merged.ma_theme);
      // Apply AI language if set
      if(merged.lang && typeof aiSetLang==='function') aiSetLang(merged.lang);
    }
  }catch(e){}
}

function applyMemberTheme(theme){
  const l3=document.getElementById('layer3');
  const acc=document.getElementById('account-page');
  const themes=['ma-dark','ma-light','ma-midnight','ma-emerald'];
  themes.forEach(t=>{
    if(l3) l3.classList.remove(t);
    if(acc) acc.classList.remove(t);
  });
  if(l3) l3.classList.add(theme);
  if(acc) acc.classList.add(theme);
}

async function changePassword(){
  // Support both account page fields and sidebar fields
  const oldPassEl=document.getElementById('acc-old-pass')||document.getElementById('sb-old-pass');
  const newPassEl=document.getElementById('acc-new-pass')||document.getElementById('sb-new-pass');
  const msgEl=document.getElementById('acc-pass-msg')||document.getElementById('sb-pass-msg');
  const oldPass=oldPassEl?oldPassEl.value:'';
  const newPass=newPassEl?newPassEl.value:'';
  
  if(!oldPass||!newPass){
    if(msgEl){msgEl.style.color='#E24B4A';msgEl.textContent='Please fill both fields';}
    return;
  }
  if(newPass.length<6){
    if(msgEl){msgEl.style.color='#E24B4A';msgEl.textContent='Min 6 characters';}
    return;
  }
  
  if(msgEl){msgEl.style.color='#888';msgEl.textContent='Updating...';}
  
  try{
    const r=await fetch(AUTH_URL+'/auth/change-password',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({old_password:oldPass,new_password:newPass})
    });
    const d=await r.json();
    if(d.ok){
      if(msgEl){msgEl.style.color='#00c47a';msgEl.textContent='Password updated!';}
      // Clear both field sets
      ['acc-old-pass','acc-new-pass','sb-old-pass','sb-new-pass'].forEach(id=>{
        const el=document.getElementById(id);if(el) el.value='';
      });
      if(typeof logActivity==='function') logActivity('password_change',{});
    }else{
      if(msgEl){msgEl.style.color='#E24B4A';msgEl.textContent=d.error||'Failed to update';}
    }
  }catch(e){
    if(msgEl){msgEl.style.color='#E24B4A';msgEl.textContent='Connection failed';}
  }
}

function exportAllData(){
  const data={
    version:1,
    exported:Date.now(),
    user:AUTH_USER,
    state:{},
    customTabs:typeof CUSTOM_TABS!=='undefined'?CUSTOM_TABS:[],
    prefs:_safeJSON(localStorage.getItem('batt_prefs'), {})
  };
  
  // Export current state
  ['36','q',...(typeof CUSTOM_TABS!=='undefined'?CUSTOM_TABS.map(t=>t.id):[])].forEach(id=>{
    if(S&&S[id]){
      data.state[id]={...S[id],ZM:S[id].ZM?[...S[id].ZM]:[],LK:S[id].LK?[...S[id].LK]:[]};
    }
  });
  
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='batt-backup-'+new Date().toISOString().split('T')[0]+'.json';
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('Data exported!','success');
  if(typeof logActivity==='function') logActivity('export',{format:'json'});
  if(typeof unlockBadge==='function') unlockBadge('export');
  if(typeof checkBadges==='function') checkBadges();
}

async function importData(event){
  const file=event.target.files[0];
  if(!file)return;
  
  const reader=new FileReader();
  reader.onload=async function(e){
    try{
      const data=JSON.parse(e.target.result);
      
      if(!data.version||!data.state){
        showToast('Invalid backup file','error');
        return;
      }
      
      const confirmed = await confirmImport('backup', null);
      if(!confirmed) return;
      
      // Restore custom tabs
      if(data.customTabs&&Array.isArray(data.customTabs)){
        CUSTOM_TABS.length=0;
        data.customTabs.forEach(t=>CUSTOM_TABS.push(t));
      }
      
      // Restore state
      Object.keys(data.state).forEach(tabId=>{
        if(!S[tabId])S[tabId]=mkState();
        Object.assign(S[tabId],data.state[tabId]);
        if(data.state[tabId].ZM) S[tabId].ZM=new Set(data.state[tabId].ZM);
        if(data.state[tabId].LK) S[tabId].LK=new Set(data.state[tabId].LK);
        if(data.state[tabId].CM) S[tabId].CM=new Set(data.state[tabId].CM);
      });
      
      // Restore prefs
      if(data.prefs){
        localStorage.setItem('batt_prefs',JSON.stringify(data.prefs));
        if(data.prefs.theme){
          document.body.className=data.prefs.theme;
        }
      }
      
      // Re-render
      if(typeof renderTabBar==='function') renderTabBar();
      if(typeof syncControls==='function') syncControls();
      if(typeof render==='function') render();
      
      showToast('Data imported successfully!','success');
      if(typeof logActivity==='function') logActivity('import',{});
      memberClose();
      
    }catch(err){
      showToast('Failed to parse backup file','error');
    }
  };
  reader.readAsText(file);
  event.target.value=''; // reset file input
}

async function clearAllPresets(){
  if(!AUTH_TOKEN){showToast('Please log in','error');return;}
  const confirmed = await confirmDeleteAll();
  if(!confirmed) return;
  
  try{
    // Get all presets
    const r=await fetch(AUTH_URL+'/presets/list',{headers:{'Authorization':'Bearer '+AUTH_TOKEN}});
    const d=await r.json();
    if(!d.ok)return;
    
    // Delete each one
    for(const p of (d.presets||[])){
      await fetch(AUTH_URL+'/presets/delete',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
        body:JSON.stringify({id:p.id})
      });
    }
    
    showToast('All presets deleted','info');
    presetRenderList();
    if(typeof updateMemberStats==='function') updateMemberStats();
    
  }catch(e){
    showToast('Failed to delete presets','error');
  }
}

async function deleteAccount(){
  if(!AUTH_TOKEN){showToast('Please log in','error');return;}
  
  // First confirmation
  const confirmed = await confirmDeleteAccount();
  if(!confirmed) return;
  
  // Second confirmation - require typing DELETE
  const typed = await showConfirm({
    icon: '⚠️',
    type: 'danger',
    title: 'Final Confirmation',
    message: 'Type <strong>DELETE</strong> below to permanently delete your account.',
    input: true,
    inputPlaceholder: 'Type DELETE to confirm',
    inputRequired: true,
    confirmText: 'Delete Forever',
    cancelText: 'Cancel'
  });
  
  if(typed !== 'DELETE'){
    showToast('Account deletion cancelled','info');
    return;
  }
  
  try{
    const r=await fetch(AUTH_URL+'/auth/delete-account',{
      method:'POST',
      headers:{'Authorization':'Bearer '+AUTH_TOKEN}
    });
    const d=await r.json();
    if(d.ok){
      showToast('Account deleted. Goodbye!','info');
      authForceLogout();
    }else{
      showToast(d.error||'Failed to delete account','error');
    }
  }catch(e){
    showToast('Connection failed','error');
  }
}

// ── LAYER 3: MEMBER AREA NAVIGATION ──
function goLayer3(){
  document.body.style.overflow='auto';
  mbnSetActive('member');
  // title only — no history push (goLayer3 is called on auto-restore too)
  document.title = 'BATT · Member Area';
  // Ensure AI fab is hidden in member area
  const aiFab=document.getElementById('ai-fab');
  if(aiFab){aiFab.style.opacity='0';aiFab.style.pointerEvents='none';}
  
  // update layer3 user info - use AUTH_USER or fallback to localStorage
  let user = AUTH_USER;
  if(!user){
    try{ user = JSON.parse(localStorage.getItem('batt_user')); }catch(e){}
  }
  if(user){
    const avatar=document.getElementById('l3-avatar');
    const username=document.getElementById('l3-username');
    const email=document.getElementById('l3-email');
    const welcomeName=document.getElementById('l3-welcome-name');
    const displayName = user.username || (user.email ? user.email.split('@')[0] : 'user');
    // show Google avatar if available
    if(avatar){
      if(user.picture){
        avatar.innerHTML='<img src="'+user.picture+'" alt="'+displayName+'">';
      }else{
        avatar.innerHTML='';
        avatar.textContent = displayName[0].toUpperCase();
      }
    }
    if(username) username.textContent = '@' + displayName;
    if(email) email.textContent = user.email || '';
    if(welcomeName) welcomeName.textContent = displayName;
  }
  // show/hide ☰ menu based on allowed usernames
  if(typeof initL3MenuVisibility==='function') initL3MenuVisibility();
  // load badges + stats from server
  // load badges + stats together — only checkBadges after BOTH complete to prevent false toast
  if(typeof loadBadgesFromServer==='function' && typeof loadStatsFromServer==='function'){
    Promise.all([loadBadgesFromServer(), loadStatsFromServer()]).then(()=>{
      if(typeof checkBadges==='function') checkBadges();
    });
  } else if(typeof loadBadgesFromServer==='function'){
    loadBadgesFromServer().then(()=>{ if(typeof checkBadges==='function') checkBadges(); });
  }
  if(typeof loadAllUserDataFromServer==='function') loadAllUserDataFromServer();
  // update stats
  updateMemberStats();
  // hide layer2 if visible
  const l2=document.getElementById('layer2');
  if(l2){l2.classList.add('hidden');l2.style.opacity='0';}
  // show layer3
  const l3=document.getElementById('layer3');
  if(l3){
    l3.classList.remove('hidden');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{l3.classList.add('visible');}));
  }
  // Apply saved member theme
  const prefs=_safeJSON(localStorage.getItem('batt_prefs'), {});
  if(prefs.ma_theme && typeof applyMemberTheme==='function'){
    applyMemberTheme(prefs.ma_theme);
  }
  // Fetch live prices when entering member area
  if(typeof fetchLivePrices==='function') fetchLivePrices();
  // Populate sidebar with user data
  if(typeof loadSidebarData==='function') loadSidebarData();
  // Time-based greeting
  var greetEl=document.getElementById('l3-topbar-greeting');
  if(greetEl){
    var h=new Date().getHours();
    greetEl.textContent=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  }
  // Sync active theme pill
  var prefs2=_safeJSON(localStorage.getItem('batt_prefs'), {});
  var curTheme=prefs2.ma_theme||'ma-dark';
  ['dark','midnight','light'].forEach(function(t){
    var btn=document.getElementById('l3t-'+t);
    if(btn) btn.classList.toggle('active','ma-'+t===curTheme);
  });
}

// Track if risk disclosure was shown this session
var RISK_SHOWN = false;

function openDashboard(){
  document.body.style.overflow='hidden';
  mbnSetActive('cockpit');
  // sync journal so cockpit overlays are always fresh
  if(typeof jnLoad==='function') jnLoad();
  const l3=document.getElementById('layer3');
  if(l3){l3.classList.remove('visible');setTimeout(()=>{l3.classList.add('hidden');},500);}
  if(RISK_SHOWN){
    setTimeout(()=>{
      const app=document.querySelector('.app');
      if(app){
        app.style.transition='opacity 0.5s cubic-bezier(0.4,0,0.2,1), transform 0.5s cubic-bezier(0.4,0,0.2,1)';
        app.style.transform='scale(0.98) translateY(-10px)';
        app.style.opacity='0';
        requestAnimationFrame(()=>{ app.style.opacity='1'; app.style.transform='scale(1) translateY(0)'; });
      }
      // restore AI fab
      const fab=document.getElementById('ai-fab');
      if(fab){
        fab.style.display='';
        fab.style.transition='none';
        fab.style.opacity='0';
        fab.style.transform='scale(0.8) translateY(20px)';
        fab.style.pointerEvents='none';
        setTimeout(()=>{
          fab.style.transition='opacity 0.4s ease, transform 0.4s ease';
          fab.style.opacity='1';
          fab.style.transform='scale(1) translateY(0)';
          fab.style.pointerEvents='all';
        },120);
      }
      // left panel toggle + trade panel toggle
      const leftToggle=document.getElementById('left-panel-toggle');
      if(leftToggle) leftToggle.classList.add('visible');
      const tradeToggle2=document.getElementById('trade-panel-toggle');
      if(tradeToggle2) tradeToggle2.classList.add('visible');
      // sync trade toggle left position
      if(typeof _syncTradeToggleLeft==='function') _syncTradeToggleLeft();
      // use localStorage — works across all script blocks
      if(localStorage.getItem('batt_token')){
        const backBtn=document.getElementById('back-to-member');
        if(backBtn) backBtn.style.display='flex';
        const kbdHint=document.getElementById('kbd-hint');
        if(kbdHint) setTimeout(()=>{kbdHint.classList.add('visible');},500);
        const presetsBtn=document.getElementById('presets-toggle-btn');
        if(presetsBtn){
          presetsBtn.classList.remove('visible');
          setTimeout(()=>presetsBtn.classList.add('visible'),80);
        }
      }
      if(typeof battUpdateGuestUI==='function') battUpdateGuestUI();
    },400);
  } else {
    setTimeout(()=>{goLayer2();},400);
  }
}

function backToMemberArea(){
  document.body.style.overflow='auto';
  battNav('member');
  mbnSetActive('member');
  // Smooth fade out dashboard with pro easing
  const app=document.querySelector('.app');
  if(app){
    app.style.transition='opacity 0.5s cubic-bezier(0.4,0,0.2,1), transform 0.5s cubic-bezier(0.4,0,0.2,1)';
    app.style.opacity='0';
    app.style.transform='scale(0.96) translateY(10px)';
  }
  // hide back button with fade
  const backBtn=document.getElementById('back-to-member');
  if(backBtn){
    backBtn.style.transition='opacity 0.3s ease';
    backBtn.style.opacity='0';
    setTimeout(()=>{backBtn.style.display='none';backBtn.style.opacity='';},300);
  }
  // hide keyboard hints
  const kbdHint=document.getElementById('kbd-hint');
  if(kbdHint) kbdHint.classList.remove('visible');
  // hide presets toggle and close panel
  const presetsBtn=document.getElementById('presets-toggle-btn');
  if(presetsBtn) presetsBtn.classList.remove('visible');
  const presetsPanel=document.getElementById('panel-presets');
  if(presetsPanel) presetsPanel.classList.remove('open');
  // hide left panel toggle and collapse panel
  const leftToggle=document.getElementById('left-panel-toggle');
  if(leftToggle){
    leftToggle.classList.remove('visible');
      }
  const tradeToggleHide=document.getElementById('trade-panel-toggle');
  if(tradeToggleHide) tradeToggleHide.classList.remove('visible');
  const leftPanel=document.getElementById('left-panel');
  if(leftPanel) leftPanel.classList.add('collapsed');
  // hide AI fab smoothly
  const aiFab=document.getElementById('ai-fab');
  if(aiFab){
    aiFab.style.transition='opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1)';
    aiFab.style.opacity='0';
    aiFab.style.transform='scale(0.8) translateY(20px)';
    aiFab.style.pointerEvents='none';
  }
  // close AI panel if open
  if(AI_OPEN) aiToggle();
  // show layer3 with smooth entrance after dashboard fades
  setTimeout(()=>{
    goLayer3();
    // Reset app transform after transition
    if(app){
      app.style.transform='';
    }
  },450);
}

// ── Auto-restore session on load ──
async function authRestoreSession(){
  if(!AUTH_TOKEN) return false;
  const web3Chain = localStorage.getItem('batt_auth_web3');
  const savedUser = _safeJSON(localStorage.getItem('batt_user'), null);
  if(web3Chain && savedUser){
    AUTH_USER = savedUser;
    const ub = document.getElementById('auth-user-bar');
    const ul = document.getElementById('auth-username-lbl');
    if(ub) ub.classList.remove('hidden');
    if(ul) ul.textContent = '@' + savedUser.username;
    _updateWeb3Badge(web3Chain);
    document.body.classList.remove('jn-loading');
    return true;
  }
  // signal to cockpit that journal is loading — locked rows pulse
  document.body.classList.add('jn-loading');
  try{
    const r=await fetch(AUTH_URL+'/auth/me',{headers:{'Authorization':'Bearer '+AUTH_TOKEN}});
    const d=await r.json();
    if(d.ok){
      AUTH_USER=d.user;
      if(d.user) localStorage.setItem('batt_user', JSON.stringify(d.user));
      const ub=document.getElementById('auth-user-bar');
      const ul=document.getElementById('auth-username-lbl');
      if(ub) ub.classList.remove('hidden');
      if(ul) ul.textContent='@'+d.user.username;
      // load cloud data
      const dr=await fetch(AUTH_URL+'/data/load',{headers:{'Authorization':'Bearer '+AUTH_TOKEN}});
      const dd=await dr.json();
      if(dd.ok&&dd.data){
        const parsed=typeof dd.data==='string'?JSON.parse(dd.data):dd.data;
        Object.keys(parsed).forEach(tabId=>{
          if(!S[tabId])S[tabId]=mkState();
          Object.assign(S[tabId],parsed[tabId]);
          if(parsed[tabId].BT){
            const st=sanitizeTradesArray(parsed[tabId].BT, parsed[tabId].FR);
            S[tabId].BT=st.bt;
            S[tabId].FR=st.fr;
          }
          if(parsed[tabId].MT){
            Object.keys(parsed[tabId].MT).forEach(m=>{
              if(parsed[tabId].MT[m] && parsed[tabId].MT[m].bt){
                const stm=sanitizeTradesArray(parsed[tabId].MT[m].bt, parsed[tabId].MT[m].fr);
                S[tabId].MT[m].bt=stm.bt;
                S[tabId].MT[m].fr=stm.fr;
              }
            });
          }
          if(parsed[tabId].ZM) S[tabId].ZM=new Set(parsed[tabId].ZM);
          if(parsed[tabId].LK) S[tabId].LK=new Set(parsed[tabId].LK);
          if(parsed[tabId].CM) S[tabId].CM=new Set(parsed[tabId].CM);
        });
        // re-sync controls with loaded data
        syncControls();
        // don't render yet — wait for journal to load too
      }
      // load journal + preferences IN PARALLEL — then single render
      await Promise.all([
        (async()=>{
          try{
            const jr=await fetch(AUTH_URL+'/userdata/load',{headers:{'Authorization':'Bearer '+AUTH_TOKEN}});
            const jd=await jr.json();
            if(jd.ok&&jd.data?.journal){
              Object.assign(JN,jd.data.journal);
              localStorage.setItem('batt_journal',JSON.stringify(JN));
            }
          }catch(e){}
        })(),
        (async()=>{if(typeof loadCloudPrefs==='function') await loadCloudPrefs();})()
      ]);
      // apply user slot preference on top of cloud data
      try{
        const slotPref=_safeJSON(localStorage.getItem('batt_slot_pref'), {});
        Object.keys(slotPref).forEach(tabId=>{
          if(S[tabId]&&slotPref[tabId]){
            S[tabId].BT=[...slotPref[tabId].BT];
            S[tabId].FR=[...slotPref[tabId].FR];
          }
        });
      }catch(e){}
      document.body.classList.remove('jn-loading');
      render();
      return true;
    } else {
      AUTH_TOKEN=null; localStorage.removeItem('batt_token');
      document.body.classList.remove('jn-loading');
      return false;
    }
  }catch(e){document.body.classList.remove('jn-loading');return false;}
}

// ── PWA INSTALL ──
let pwaInstallPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{
  e.preventDefault();
  pwaInstallPrompt=e;
  // Show banner after short delay if not dismissed before
  if(!localStorage.getItem('pwa_dismissed')){
    setTimeout(()=>{
      const banner=document.getElementById('pwa-install-banner');
      if(banner) banner.classList.add('show');
    },3000);
  }
});
function pwaInstall(){
  if(!pwaInstallPrompt)return;
  pwaInstallPrompt.prompt();
  pwaInstallPrompt.userChoice.then((result)=>{
    if(result.outcome==='accepted'){
      showToast('App installed! 🎉','success');
    }
    pwaCloseBanner();
    pwaInstallPrompt=null;
  });
}
function pwaCloseBanner(){
  const banner=document.getElementById('pwa-install-banner');
  if(banner) banner.classList.remove('show');
  localStorage.setItem('pwa_dismissed','1');
}

// ── ONBOARDING TOUR ──
var _onboardingStep=1;
function onboardingShow(){
  if(localStorage.getItem('onboarding_done'))return;
  const overlay=document.getElementById('onboarding-overlay');
  if(overlay){
    overlay.classList.add('show');
    _onboardingStep=1;
    onboardingUpdateStep();
  }
}
function onboardingClose(){
  const overlay=document.getElementById('onboarding-overlay');
  if(overlay) overlay.classList.remove('show');
  localStorage.setItem('onboarding_done','1');
}
function onboardingNext(){
  if(_onboardingStep>=6){
    onboardingClose();
    return;
  }
  _onboardingStep++;
  onboardingUpdateStep();
}
function onboardingUpdateStep(){
  document.querySelectorAll('.onboarding-step').forEach(s=>{
    s.classList.toggle('active',parseInt(s.dataset.step)===_onboardingStep);
  });
  document.querySelectorAll('.onboarding-dot').forEach(d=>{
    d.classList.toggle('active',parseInt(d.dataset.dot)===_onboardingStep);
  });
  const btn=document.getElementById('onboarding-next-btn');
  if(btn) btn.textContent=_onboardingStep>=6?'Get Started':'Next';
}

// ── EXPORT FUNCTIONS ──
function exportModalOpen(){
  const modal=document.getElementById('export-modal');
  if(modal) modal.classList.add('show');
}
function exportModalClose(){
  const modal=document.getElementById('export-modal');
  if(modal) modal.classList.remove('show');
}
async function exportAsImage(){
  showToast('Preparing screenshot...','info',2000);
  exportModalClose();
  
  // Use html2canvas (load dynamically)
  if(!window.html2canvas){
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload=()=>captureAndDownload();
    document.head.appendChild(script);
  }else{
    captureAndDownload();
  }
}
async function captureAndDownload(){
  try{
    const content=document.getElementById('right-content');
    if(!content){showToast('Nothing to export','error');return;}
    
    const canvas=await html2canvas(content,{
      backgroundColor:'#0d0d0d',
      scale:2,
      useCORS:true
    });
    
    const link=document.createElement('a');
    link.download='batt-dashboard-'+new Date().toISOString().split('T')[0]+'.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
    showToast('Image saved!','success');
    if(typeof logActivity==='function') logActivity('export',{format:'png'});
  }catch(e){
    showToast('Export failed','error');
    console.error(e);
  }
}
async function exportAsPDF(){
  showToast('Generating PDF...','info',2000);
  exportModalClose();
  
  // Load jsPDF dynamically
  if(!window.jspdf){
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload=()=>generatePDF();
    document.head.appendChild(script);
  }else{
    generatePDF();
  }
}
async function generatePDF(){
  try{
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF('p','mm','a4');
    
    // Header
    doc.setFillColor(0,0,0);
    doc.rect(0,0,210,30,'F');
    doc.setTextColor(0,196,122);
    doc.setFontSize(18);
    doc.text('Bet All The Time, Bet With Style',105,15,{align:'center'});
    doc.setFontSize(10);
    doc.setTextColor(100,100,100);
    doc.text('Trading Projection Report - '+new Date().toLocaleDateString(),105,22,{align:'center'});
    
    // Get current state
    const tab=typeof activeTab!=='undefined'?activeTab:'36';
    const state=S&&S[tab]?S[tab]:null;
    
    if(state){
      doc.setTextColor(0,0,0);
      doc.setFontSize(12);
      let y=40;
      
      doc.text('Configuration',15,y);y+=8;
      doc.setFontSize(10);
      doc.text('Capital: $'+Number(state.CAP||0).toLocaleString(),20,y);y+=6;
      doc.text('Leverage: '+state.LEV+'x',20,y);y+=6;
      doc.text('Notional: $'+Number(state.NOT||0).toLocaleString(),20,y);y+=6;
      doc.text('Mode: '+(state.isSpot?'Spot':'Leverage'),20,y);y+=10;
      
      doc.setFontSize(12);
      doc.text('Risk Metrics',15,y);y+=8;
      doc.setFontSize(10);
      const liq=state.NOT>0?((state.CAP/state.NOT)*100).toFixed(2):'0';
      doc.text('Liquidation %: '+liq+'%',20,y);y+=6;
      
      doc.setFontSize(8);
      doc.setTextColor(150,150,150);
      doc.text('Generated by BATT - betallthetime.fun',105,285,{align:'center'});
    }
    
    doc.save('batt-report-'+new Date().toISOString().split('T')[0]+'.pdf');
    showToast('PDF saved!','success');
    if(typeof logActivity==='function') logActivity('export',{format:'pdf'});
  }catch(e){
    showToast('PDF generation failed','error');
    console.error(e);
  }
}
function exportAsJSON(){
  exportModalClose();
  // Reuse existing exportAllData function
  if(typeof exportAllData==='function'){
    exportAllData();
  }else{
    showToast('Export not available','error');
  }
}

// ── ACTIVITY LOG ──
var _activityOffset=0;
var _activityLoading=false;

const ACTIVITY_ICONS={
  'login':'🔐',
  'logout':'🚪',
  'register':'🎉',
  'preset_save':'💾',
  'preset_delete':'🗑️',
  'preset_load':'📂',
  'preset_rename':'✏️',
  'sync':'☁️',
  'export':'📤',
  'import':'📥',
  'password_change':'🔑',
  'settings_change':'⚙️',
  'google_link':'🔗'
};

const ACTIVITY_TITLES={
  'login':'Logged in',
  'logout':'Logged out',
  'register':'Account created',
  'preset_save':'Saved preset',
  'preset_delete':'Deleted preset',
  'preset_load':'Loaded preset',
  'preset_rename':'Renamed preset',
  'sync':'Cloud sync',
  'export':'Exported data',
  'import':'Imported data',
  'password_change':'Password changed',
  'settings_change':'Settings updated',
  'google_link':'Google connected'
};

function formatActivityTime(ts){
  const now=Date.now();
  const diff=now-ts;
  const mins=Math.floor(diff/60000);
  const hours=Math.floor(diff/3600000);
  const days=Math.floor(diff/86400000);
  
  if(mins<1) return 'just now';
  if(mins<60) return mins+'m ago';
  if(hours<24) return hours+'h ago';
  if(days<7) return days+'d ago';
  return new Date(ts).toLocaleDateString();
}

async function loadActivityLog(reset=false){
  if(_activityLoading)return;
  if(reset) _activityOffset=0;
  
  _activityLoading=true;
  const list=document.getElementById('activity-log-list');
  const loadMore=document.getElementById('activity-load-more');
  const endMsg=document.getElementById('activity-end-msg');
  
  if(!list)return;
  
  if(reset){
    list.innerHTML='<div style="padding:20px;text-align:center"><div class="skeleton" style="height:40px;margin-bottom:8px;border-radius:6px"></div><div class="skeleton" style="height:40px;margin-bottom:8px;border-radius:6px"></div><div class="skeleton" style="height:40px;border-radius:6px"></div></div>';
  }
  
  try{
    const r=await fetch(AUTH_URL+'/activity/list?offset='+_activityOffset+'&limit=10',{
      headers:{'Authorization':'Bearer '+AUTH_TOKEN}
    });
    const d=await r.json();
    
    if(d.ok){
      if(reset) list.innerHTML='';
      
      if(d.activities.length===0&&_activityOffset===0){
        list.innerHTML='<div class="activity-empty">No activity yet.<br>Start using the dashboard!</div>';
        if(loadMore) loadMore.style.display='none';
        if(endMsg) endMsg.style.display='none';
      }else{
        d.activities.forEach(a=>{
          const icon=ACTIVITY_ICONS[a.action]||'📋';
          const title=ACTIVITY_TITLES[a.action]||a.action;
          let details='';
          try{
            const det=_safeJSON(a.details,{});
            if(det.name) details=det.name;
            if(det.browser) details=(details?details+' · ':'')+det.browser;
            if(det.format) details=(details?details+' · ':'')+det.format.toUpperCase();
          }catch(e){}
          
          list.innerHTML+=`<div class="activity-item">
            <div class="activity-icon">${icon}</div>
            <div class="activity-content">
              <div class="activity-title">${title}</div>
              ${details?`<div class="activity-meta">${details}</div>`:''}
            </div>
            <div class="activity-time">${formatActivityTime(a.created_at)}</div>
          </div>`;
        });
        
        _activityOffset+=d.activities.length;
        
        if(d.has_more){
          if(loadMore){loadMore.style.display='inline';loadMore.textContent='load more';}
          if(endMsg) endMsg.style.display='none';
        }else{
          if(loadMore) loadMore.style.display='none';
          if(endMsg&&_activityOffset>0) endMsg.style.display='inline';
        }
      }
    }
  }catch(e){
    console.error('Activity load error:',e);
    if(reset) list.innerHTML='<div class="activity-empty">Failed to load activity</div>';
  }
  
  _activityLoading=false;
}

function loadMoreActivity(){
  const btn=document.getElementById('activity-load-more');
  if(btn) btn.textContent='loading...';
  loadActivityLog(false);
}

// ── ACHIEVEMENTS/BADGES ──
const BADGES=[
  {id:'first_steps', icon:'🌱', name:'First Steps',  desc:'Complete onboarding'},
  {id:'saver',       icon:'💾', name:'Saver',         desc:'Save your first preset'},
  {id:'power_user',  icon:'📊', name:'Power User',    desc:'Create 10+ presets'},
  {id:'cloud_sync',  icon:'☁️', name:'Cloud Sync',    desc:'Sync to cloud'},
  {id:'cloud_master',icon:'🌩️', name:'Cloud Master',  desc:'Sync 50 times'},
  {id:'exporter',    icon:'📤', name:'Exporter',      desc:'Export your data'},
  {id:'night_owl',   icon:'🌙', name:'Night Owl',     desc:'Use after midnight'},
  {id:'early_bird',  icon:'🐦', name:'Early Bird',    desc:'Use before 6am'},
  {id:'week_streak', icon:'🔥', name:'On Fire',       desc:'7-day login streak'},
  {id:'sharer',      icon:'🔗', name:'Sharer',        desc:'Share a preset'},
];

// server-side badge state — loaded on login
var _badgeData = {}; // { badge_id: unlocked_at_timestamp }
var _badgeNewList = []; // badges newly unlocked this session

async function saveUserDataToServer(key, value){
  const tok = _battToken();
  if(!tok) return;
  try{
    await fetch(AUTH_URL+'/userdata/save',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
      body: JSON.stringify({key, value})
    });
  }catch(e){}
}

async function loadAllUserDataFromServer(){
  const tok = _battToken();
  if(!tok) return;
  try{
    const r = await fetch(AUTH_URL+'/userdata/load', { headers:{'Authorization':'Bearer '+tok} });
    const d = await r.json();
    if(!d.ok) return;
    // restore each key into memory and localStorage cache
    if(d.data.alerts !== undefined){
      PRICE_ALERTS = d.data.alerts;
      localStorage.setItem('batt_alerts', JSON.stringify(PRICE_ALERTS));
    }
    if(d.data.webhooks !== undefined){
      WEBHOOKS = d.data.webhooks;
      localStorage.setItem('batt_webhooks', JSON.stringify(WEBHOOKS));
    }
    if(d.data.api_key !== undefined){
      API_KEY = d.data.api_key;
      localStorage.setItem('batt_api_key', API_KEY);
    }
    if(d.data.custom_themes !== undefined){
      CUSTOM_THEMES = d.data.custom_themes;
      localStorage.setItem('batt_custom_themes', JSON.stringify(CUSTOM_THEMES));
  saveUserDataToServer('custom_themes', CUSTOM_THEMES);
    }
    if(d.data.power_actions !== undefined){
      POWER_USER_ACTIONS = d.data.power_actions;
      localStorage.setItem('batt_power_actions', JSON.stringify(POWER_USER_ACTIONS));
  saveUserDataToServer('power_actions', POWER_USER_ACTIONS);
    }
    if(d.data.journal !== undefined){
      Object.assign(JN, d.data.journal);
      localStorage.setItem('batt_journal', JSON.stringify(JN));
      // full render so cockpit overlays appear immediately on page load
      if(typeof render==='function') setTimeout(render, 50);
    }
  }catch(e){}
}

async function loadStatsFromServer(){
  const tok = _battToken();
  if(!tok) return;
  try{
    const r = await fetch(AUTH_URL+'/stats/load', { headers:{'Authorization':'Bearer '+tok} });
    const d = await r.json();
    if(d.ok){
      if(d.stats.sync_count   !== undefined) localStorage.setItem('batt_sync_count',    d.stats.sync_count);
      if(d.stats.preset_count !== undefined) localStorage.setItem('batt_badge_presets', d.stats.preset_count);
    }
  }catch(e){}
}

async function loadBadgesFromServer(){
  const tok = _battToken();
  if(!tok){ _badgeData = {}; return; }
  try{
    const r = await fetch(AUTH_URL+'/badges/load', { headers:{'Authorization':'Bearer '+tok} });
    const d = await r.json();
    if(d.ok) _badgeData = d.badges || {};
  }catch(e){ _badgeData = {}; }
}

async function saveBadgeToServer(badgeId){
  const tok = _battToken();
  if(!tok) return;
  try{
    await fetch(AUTH_URL+'/badges/unlock', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
      body: JSON.stringify({badge_id: badgeId})
    });
  }catch(e){}
}

function renderBadges(){
  const grid = document.getElementById('badges-grid');
  const unlockedEl = document.getElementById('badges-unlocked');
  const totalEl = document.getElementById('badges-total');
  if(!grid) return;

  // check time badges client-side and unlock if needed
  const hour = new Date().getHours();
  if(hour>=0 && hour<5)  unlockBadge('night_owl');
  if(hour>=4 && hour<6)  unlockBadge('early_bird');

  let unlocked = 0;
  grid.innerHTML = BADGES.map(b=>{
    const ts = _badgeData[b.id];
    const isUnlocked = !!ts;
    if(isUnlocked) unlocked++;
    const isNew = _badgeNewList.includes(b.id);
    return `<div class="badge-item ${isUnlocked?'unlocked':'locked'}" title="${b.desc}" onclick="showBadgeInfo('${b.id}','${b.name}','${b.desc}',${isUnlocked})">
      ${isNew?'<span class="badge-new">!</span>':''}
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-name">${b.name}</span>
      ${isUnlocked&&ts?`<span class="badge-date">${new Date(ts).toLocaleDateString()}</span>`:''}
    </div>`;
  }).join('');

  if(unlockedEl) unlockedEl.textContent = unlocked;
  if(totalEl) totalEl.textContent = BADGES.length;
  _badgeNewList = [];
}

async function unlockBadge(badgeId){
  if(_badgeData[badgeId]) return; // already unlocked
  const badge = BADGES.find(b=>b.id===badgeId);
  if(!badge) return;
  const tok = _battToken();
  if(!tok) return; // guests don't earn badges
  _badgeData[badgeId] = Date.now();
  _badgeNewList.push(badgeId);
  await saveBadgeToServer(badgeId);
  showToast('🏆 Badge unlocked: '+badge.name, 'success', 4000);
}

async function checkBadges(){
  // called after actions — check counter-based badges
  const syncCount = parseInt(localStorage.getItem('batt_sync_count')||'0');
  const presetCount = parseInt(localStorage.getItem('batt_badge_presets')||'0');
  if(presetCount >= 1)  await unlockBadge('saver');
  if(presetCount >= 10) await unlockBadge('power_user');
  if(syncCount >= 1)    await unlockBadge('cloud_sync');
  if(syncCount >= 50)   await unlockBadge('cloud_master');
}

function showBadgeInfo(id, name, desc, unlocked){
  const badge = BADGES.find(b=>b.id===id);
  const status = unlocked?'<span style="color:#00c47a">✅ Unlocked</span>':'<span style="color:#666">🔒 Locked</span>';
  const ts = _badgeData[id];
  const dateStr = ts?'<br><small style="color:#555">Unlocked: '+new Date(ts).toLocaleDateString()+'</small>':'';
  showConfirm({
    icon: badge?badge.icon:'🏆',
    type: unlocked?'success':'info',
    title: name,
    message: desc+'<br><br>'+status+dateStr,
    confirmText: 'Nice!',
    cancelText: ''
  });
}

function incrementBadgeCounter(key){
  const count = parseInt(localStorage.getItem(key)||'0')+1;
  localStorage.setItem(key, count);
  // only checkBadges if _badgeData is populated (badges loaded from server)
  if(Object.keys(_badgeData).length > 0 || count === 1){
    setTimeout(checkBadges, 100);
  }
}

// ── PRESET SHARING ──
var _sharePresetId=null;

async function sharePreset(id,name){
  if(!AUTH_TOKEN){showToast('Please log in','error');return;}
  
  _sharePresetId=id;
  
  const modal=document.getElementById('share-modal');
  const nameEl=document.getElementById('share-preset-name');
  const linkInput=document.getElementById('share-link-input');
  const qrEl=document.getElementById('share-qr');
  
  if(nameEl) nameEl.textContent=name;
  if(linkInput) linkInput.value='Generating link...';
  if(qrEl) qrEl.innerHTML='';
  if(modal) modal.classList.add('show');
  
  try{
    const r=await fetch(AUTH_URL+'/presets/share',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN},
      body:JSON.stringify({id})
    });
    const d=await r.json();
    
    console.log('Share response:', d);
    
    if(d.ok&&d.share_code){
      const shareUrl='https://betallthetime.fun/?p='+d.share_code;
      if(linkInput) linkInput.value=shareUrl;

      // show expiry date
      const expiryEl=document.getElementById('share-expiry');
      if(expiryEl){
        const expDate=new Date(Date.now()+30*24*60*60*1000);
        expiryEl.textContent='expires '+expDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      }

      // Generate QR code
      if(typeof QRCode!=='undefined'&&qrEl){
        qrEl.innerHTML='';
        new QRCode(qrEl,{text:shareUrl,width:120,height:120,colorDark:'#000',colorLight:'#fff'});
      }else if(qrEl){
        // Load QR library
        const script=document.createElement('script');
        script.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        script.onload=()=>{
          new QRCode(qrEl,{text:shareUrl,width:120,height:120,colorDark:'#000',colorLight:'#fff'});
        };
        document.head.appendChild(script);
      }

      // Badge
      if(typeof unlockBadge==='function') unlockBadge('sharer');
      checkBadges();
      if(typeof logActivity==='function') logActivity('preset_share',{name});
    }else{
      const errorMsg = d.error || 'Failed to generate link';
      if(linkInput) linkInput.value = errorMsg;
      showToast(errorMsg, 'error');
    }
  }catch(e){
    console.error('Share preset error:', e);
    if(linkInput) linkInput.value='Connection failed';
    showToast('Connection failed: ' + e.message, 'error');
  }
}

function shareModalClose(){
  const modal=document.getElementById('share-modal');
  if(modal) modal.classList.remove('show');
  _sharePresetId=null;
}

function copyShareLink(){
  const input=document.getElementById('share-link-input');
  if(!input||!input.value||input.value.includes('...')||input.value.includes('Failed'))return;
  
  navigator.clipboard.writeText(input.value).then(()=>{
    showToast('Link copied!','success');
  }).catch(()=>{
    input.select();
    document.execCommand('copy');
    showToast('Link copied!','success');
  });
}

async function loadSharedPreset(shareCode){
  showToast('Loading shared preset...','info',2000);
  
  try{
    const r=await fetch(AUTH_URL+'/presets/shared?code='+shareCode);
    const d=await r.json();
    
    if(!d.ok||!d.preset){
      showToast(d.error||'Preset not found or expired','error');
      return;
    }
    
    const preset=d.preset;
    
    const confirmed = await confirmImport('preset', preset.name + '" from ' + preset.username);
    if(!confirmed) return;
    
    const snapshot=preset.snapshot;
    
    // Restore custom tabs
    if(snapshot._meta&&snapshot._meta.customTabs){
      CUSTOM_TABS.length=0;
      snapshot._meta.customTabs.forEach(t=>CUSTOM_TABS.push(t));
    }
    
    // Restore state
    Object.keys(snapshot).forEach(tabId=>{
      if(tabId==='_meta')return;
      if(!S[tabId])S[tabId]=mkState();
      Object.assign(S[tabId],snapshot[tabId]);
      if(snapshot[tabId].ZM) S[tabId].ZM=new Set(snapshot[tabId].ZM);
      if(snapshot[tabId].LK) S[tabId].LK=new Set(snapshot[tabId].LK);
      if(snapshot[tabId].CM) S[tabId].CM=new Set(snapshot[tabId].CM);
    });
    
    // Restore theme
    if(snapshot._meta&&snapshot._meta.theme){
      document.body.className=snapshot._meta.theme;
    }
    
    // Restore notional link state
    if(snapshot._meta&&typeof snapshot._meta.notLinked==='boolean'){
      NOT_LINKED=snapshot._meta.notLinked;
      localStorage.setItem('batt_not_linked',NOT_LINKED?'true':'false');
      // restore carry-forward per tab
      if(typeof snapshot._meta.cf !== 'undefined') gs().CF = snapshot._meta.cf;
    }
    
    // Re-render
    if(typeof renderTabBar==='function') renderTabBar();
    if(typeof syncControls==='function') syncControls();
    if(typeof render==='function') render();
    
    showToast('Preset "'+preset.name+'" imported!','success');
    
    // Go to dashboard
    const l1=document.getElementById('layer1');
    const al=document.getElementById('auth-layer');
    if(l1) l1.classList.add('hidden');
    if(al) al.classList.add('hidden');
    goLayer2();
    
  }catch(e){
    showToast('Connection failed','error');
  }
}

// ── PAPER TRADING SYSTEM ──
// ── CEX STANDARD FEE STRUCTURES ──
// Real VIP0 fees per exchange (maker/taker %)
var CEX_FEES = {
  binance: {
    spot:   { maker: 0.1,   taker: 0.1   },
    perp:   { maker: 0.02,  taker: 0.05  },
    // BNB discount 25% if BNB held
    bnbDiscount: 0.25,
    // funding every 8h, typical 0.01%
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

// ── CEX STANDARD MARGIN MODES ──
var CEX_MARGIN_MODES = { cross: 'cross', isolated: 'isolated' };
// ── CEX STANDARD POSITION MODES ──
var CEX_POSITION_MODES = { oneway: 'one-way', hedge: 'hedge' };

// ── LIVE FUNDING RATES CACHE ──
var _tpFundingCache = {}; // { 'BTCUSDT': { rate: 0.01, nextTime: ts } }

var TP_STATE = {
  exchange: 'binance',
  pair: 'BTCUSDT',
  side: 'long',
  orderType: 'market',
  marketType: 'spot',   // 'spot' | 'perpetual'
  marginMode: 'cross',  // 'cross' | 'isolated'
  positionMode: 'oneway', // 'oneway' | 'hedge'
  leverage: 10,
  balance: 10000,
  startBalance: 10000,
  positions: [],
  history: [],
  pendingOrders: [],
  prices: {},
  fundingRates: {},     // live funding per symbol
  markPrices: {},       // mark price (can differ from last price)
  timeframe: '15m',
  chartType: 'candle',
  useBnbFee: false,     // binance BNB fee discount
  feeTier: 'vip0',      // vip0..vip9 — affects rates
  totalFeesPaid: 0,
  totalFundingPaid: 0,
  sessionTrades: 0,
};

var TP_PAIRS = [
  { symbol:'BTCUSDT',  name:'Bitcoin',      icon:'BTC',  img:'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
  { symbol:'ETHUSDT',  name:'Ethereum',     icon:'ETH',  img:'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  { symbol:'SOLUSDT',  name:'Solana',       icon:'SOL',  img:'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
  { symbol:'BNBUSDT',  name:'BNB',          icon:'BNB',  img:'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
  { symbol:'XRPUSDT',  name:'Ripple',       icon:'XRP',  img:'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png' },
  { symbol:'DOGEUSDT', name:'Dogecoin',     icon:'DOGE', img:'https://assets.coingecko.com/coins/images/5/small/dogecoin.png' },
  { symbol:'ADAUSDT',  name:'Cardano',      icon:'ADA',  img:'https://assets.coingecko.com/coins/images/975/small/cardano.png' },
  { symbol:'AVAXUSDT', name:'Avalanche',    icon:'AVAX', img:'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png' },
  { symbol:'LINKUSDT', name:'Chainlink',    icon:'LINK', img:'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png' },
  { symbol:'MATICUSDT',name:'Polygon',      icon:'MATIC',img:'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png' },
  { symbol:'SUIUSDT',  name:'Sui',          icon:'SUI',  img:'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg' },
  { symbol:'APTUSDT',  name:'Aptos',        icon:'APT',  img:'https://assets.coingecko.com/coins/images/26455/small/aptos_round.png' },
  { symbol:'ARBUSDT',  name:'Arbitrum',     icon:'ARB',  img:'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg' },
  { symbol:'OPUSDT',   name:'Optimism',     icon:'OP',   img:'https://assets.coingecko.com/coins/images/25244/small/Optimism.png' },
  { symbol:'TONUSDT',  name:'Toncoin',      icon:'TON',  img:'https://assets.coingecko.com/coins/images/17980/small/ton_symbol.png' },
  { symbol:'DOTUSDT',  name:'Polkadot',     icon:'DOT',  img:'https://assets.coingecko.com/coins/images/12171/small/polkadot.png' },
  { symbol:'NEARUSDT', name:'NEAR',         icon:'NEAR', img:'https://assets.coingecko.com/coins/images/10365/small/near.jpg' },
  { symbol:'ATOMUSDT', name:'Cosmos',       icon:'ATOM', img:'https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png' },
  { symbol:'LTCUSDT',  name:'Litecoin',     icon:'LTC',  img:'https://assets.coingecko.com/coins/images/2/small/litecoin.png' },
  { symbol:'UNIUSDT',  name:'Uniswap',      icon:'UNI',  img:'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png' },
  { symbol:'AAVEUSDT', name:'Aave',         icon:'AAVE', img:'https://assets.coingecko.com/coins/images/12645/small/AAVE.png' },
  { symbol:'INJUSDT',  name:'Injective',    icon:'INJ',  img:'https://assets.coingecko.com/coins/images/20947/small/photo_2023-01-31_14-52-50.jpg' },
  { symbol:'TIAUSDT',  name:'Celestia',     icon:'TIA',  img:'https://assets.coingecko.com/coins/images/33000/small/tia.png' },
  { symbol:'SEIUSDT',  name:'Sei',          icon:'SEI',  img:'https://assets.coingecko.com/coins/images/28205/small/Sei_Logo_-_Transparent.png' },
  { symbol:'STXUSDT',  name:'Stacks',       icon:'STX',  img:'https://assets.coingecko.com/coins/images/2069/small/Stacks_logo_full.png' },
  { symbol:'FTMUSDT',  name:'Fantom',       icon:'FTM',  img:'https://assets.coingecko.com/coins/images/4001/small/Fantom_round.png' },
  { symbol:'SANDUSDT', name:'The Sandbox',  icon:'SAND', img:'https://assets.coingecko.com/coins/images/12129/small/sandbox_logo.jpg' },
  { symbol:'MANAUSDT', name:'Decentraland', icon:'MANA', img:'https://assets.coingecko.com/coins/images/878/small/decentraland-mana.png' },
  { symbol:'FILUSDT',  name:'Filecoin',     icon:'FIL',  img:'https://assets.coingecko.com/coins/images/2306/small/filecoin.png' },
  { symbol:'RUNEUSDT', name:'THORChain',    icon:'RUNE', img:'https://assets.coingecko.com/coins/images/6595/small/Rune200x200.png' },
];

var _tpChart = null;
var _tpCandleSeries = null;

// Load state
function tpLoadState() {
  const saved = localStorage.getItem('tp_state');
  if (saved) {
    try {
      const parsed=_safeJSON(saved,null);
      TP_STATE = { ...TP_STATE, ...parsed };
    } catch (e) {}
  }
}

// Save state
function tpSaveState() {
  localStorage.setItem('tp_state', JSON.stringify(TP_STATE));
}

// Open trading page
function openTradingPage() {
  battNav('trade');
  mbnSetActive('trade');
  document.body.style.overflow='auto';
  const hub = document.getElementById('trade-hub');
  const l3 = document.getElementById('layer3');
  if(l3){ l3.classList.remove('visible'); setTimeout(()=>l3.classList.add('hidden'),300); }
  if(hub){
    hub.style.display='flex';
    requestAnimationFrame(()=>{ hub.style.opacity='1'; hub.style.transform='scale(1)'; });
  }
}

function closeTradeHub(){
  battNav('member');
  mbnSetActive('member');
  document.body.style.overflow='auto';
  const hub = document.getElementById('trade-hub');
  if(hub){
    hub.style.opacity='0';
    hub.style.transform='scale(0.98)';
    setTimeout(()=>{ hub.style.display='none'; hub.style.opacity=''; hub.style.transform=''; },300);
  }
  const l3 = document.getElementById('layer3');
  if(l3){ l3.classList.remove('hidden'); requestAnimationFrame(()=>requestAnimationFrame(()=>l3.classList.add('visible'))); }
}

function openSimulation(){
  const hub = document.getElementById('trade-hub');
  if(hub){ hub.style.opacity='0'; hub.style.transform='scale(0.98)'; setTimeout(()=>{ hub.style.display='none'; hub.style.opacity=''; hub.style.transform=''; },300); }
  // own history entry so back goes to hub
  battNav('simulate');
  document.title = 'BATT · Simulator';
  tpLoadState();
  const page = document.getElementById('trading-page');
  if(page){
    page.classList.add('visible');
    // set connecting IMMEDIATELY so pill shows right state from first render
    requestAnimationFrame(()=> _tpSetWSStatus('connecting'));
    // hide floating elements that interfere
    const userBar = document.getElementById('auth-user-bar');
    const aiFab = document.getElementById('ai-fab');
    if(userBar) userBar.style.display='none';
    if(aiFab) aiFab.style.display='none';
    tpFetchPrices();
    tpInitChart();
    tpUpdateUI();
    tpRenderPositions();
    tpRenderHistory();
    tpRenderOrders();
    tpRenderPairList();
    tpUpdateFeeBadge();
    tpSetMarginMode(TP_STATE.marginMode||'cross');
    // fetch live funding rate
    if(TP_STATE.marketType==='perpetual') tpFetchFundingRate(TP_STATE.pair);
    // open left panel on start
    const _pp = document.getElementById('tp-pos-panel');
    if(_pp && _pp.classList.contains('collapsed')){ _pp.classList.remove('collapsed'); setTimeout(_tpSyncPosToggle,10); }
    if(typeof tpFetchOrderBook==='function') tpFetchOrderBook();
    // apply market type
    const isSpot = TP_STATE.marketType==='spot';
    document.querySelectorAll('.tp-market-type button').forEach(b=>{
      b.classList.toggle('active', b.textContent.toLowerCase()===TP_STATE.marketType);
    });
    const longBtn=document.getElementById('tp-side-long');
    const shortBtn=document.getElementById('tp-side-short');
    if(longBtn) longBtn.textContent=isSpot?'Buy':'Long';
    if(shortBtn) shortBtn.textContent=isSpot?'Sell':'Short';
    if(longBtn) longBtn.classList.toggle('active',TP_STATE.side==='long');
    if(shortBtn) shortBtn.classList.toggle('active',TP_STATE.side==='short');
    ['tp-leverage-row','tp-tpsl-row','tp-sum-margin-row','tp-sum-liq-row','tp-sum-tp-row','tp-sum-sl-row'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.style.display=isSpot?'none':'flex';
    });
    if(typeof tpUpdateSubmitButton==='function') tpUpdateSubmitButton();
    const exLbl=document.getElementById('tp-pair-exchange');
    if(exLbl) exLbl.textContent=`${isSpot?'spot':'perpetual'} · ${TP_STATE.exchange}`;
    // start WebSocket for real-time price + orderbook
    if(typeof tpStartWebSocket==='function') tpStartWebSocket();
  }
}

function openDexSelector(){
  const sel = document.getElementById('dex-selector');
  if(sel){ sel.style.display='flex'; }
}

function closeDexSelector(){
  const sel = document.getElementById('dex-selector');
  if(sel){ sel.style.display='none'; }
}

function closeTradingPage() {
  if(typeof tpStopWebSocket==='function') tpStopWebSocket();
  if(typeof tpStopTradeWS==='function') tpStopTradeWS();
  _tpSetWSStatus('offline'); // reset so next open starts clean
  document.body.style.overflow='auto';
  battNav('trade');
  document.title = 'BATT · Trade Hub';
  const page = document.getElementById('trading-page');
  if (page) {
    page.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    page.style.opacity = '0';
    page.style.transform = 'scale(0.96) translateY(10px)';
    setTimeout(() => {
      page.classList.remove('visible');
      page.style.opacity = '';
      page.style.transform = '';
      mbnSetActive('trade');
      const userBar = document.getElementById('auth-user-bar');
      const aiFab = document.getElementById('ai-fab');
      if(userBar) userBar.style.display = '';
      if(aiFab) aiFab.style.display = '';
      const hub = document.getElementById('trade-hub');
      if(hub){
        hub.style.display='flex';
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          hub.style.opacity='1';
          hub.style.transform='scale(1)';
        }));
      }
    }, 300);
  }
  if (window._tpPriceInterval) {
    clearInterval(window._tpPriceInterval);
    window._tpPriceInterval = null;
  }
}

// Initialize chart using TradingView Lightweight Charts

// ── TRADINGVIEW WIDGET ──
var _tvWidget = null;
var _tvSymbol = 'BINANCE:BTCUSDT';
var _tvInterval = '15';

var _tvIntervalMap = {
  '1m':'1','5m':'5','15m':'15','1h':'60','4h':'240','1d':'D'
};

function tpInitTVChart(){
  const container = document.getElementById('tp-tv-widget');
  if(!container) return;
  container.innerHTML = '';

  // build correct exchange prefix per exchange
  const exMap = {
    'binance': TP_STATE.marketType==='spot' ? 'BINANCE' : 'BINANCE',
    'bybit':   TP_STATE.marketType==='spot' ? 'BYBIT' : 'BYBIT',
    'okx':     TP_STATE.marketType==='spot' ? 'OKX' : 'OKX',
    'coinbase':'COINBASE',
  };
  const exPrefix = exMap[TP_STATE.exchange] || 'BINANCE';

  // build symbol — perp uses different suffix on some exchanges
  const baseSym = (TP_STATE.pair || 'BTCUSDT').replace('USDT','');
  let tvSym;
  if(TP_STATE.marketType === 'perpetual'){
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

  const doInit = function(){
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
        'mainSeriesProperties.hollowCandleStyle.upColor': '#00c47a',
        'mainSeriesProperties.hollowCandleStyle.downColor': '#e24b4a',
        'mainSeriesProperties.hollowCandleStyle.borderUpColor': '#00c47a',
        'mainSeriesProperties.hollowCandleStyle.borderDownColor': '#e24b4a',
        'mainSeriesProperties.barStyle.upColor': '#00c47a',
        'mainSeriesProperties.barStyle.downColor': '#e24b4a',
        'mainSeriesProperties.lineStyle.color': '#00c47a',
        'mainSeriesProperties.areaStyle.color1': 'rgba(0,196,122,0.2)',
        'mainSeriesProperties.areaStyle.color2': 'rgba(0,196,122,0)',
        'mainSeriesProperties.areaStyle.lineColor': '#00c47a',
      },
      studies_overrides: {
        'volume.volume.color.0': '#e24b4a',
        'volume.volume.color.1': '#00c47a',
        'volume.volume ma.color': '#EF9F27',
        'volume.volume ma.linewidth': 1,
        'moving average.plot.color': '#EF9F27',
        'moving average.plot.linewidth': 1,
        'MACD.histogram.color': '#00c47a',
        'bollinger bands.median.color': '#5b7fff',
        'bollinger bands.upper.color': '#555555',
        'bollinger bands.lower.color': '#555555',
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
      disabled_features: ['header_symbol_search','header_compare','symbol_search_hot_key'],
    });
  };

  if(window.TradingView){
    doInit();
  } else {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.onload = doInit;
    document.head.appendChild(script);
  }
}

function tpSyncTVSymbol(){
  // tpInitTVChart builds the correct symbol from TP_STATE
  tpInitTVChart();
}
function tpRestartPriceInterval(){
  if(window._tpPriceInterval){ clearInterval(window._tpPriceInterval); window._tpPriceInterval=null; }
  window._tpPriceInterval = setInterval(()=>{
    tpFetchPrices();
    tpFetchOrderBook();
  }, 5000);
}
// ── END TRADINGVIEW WIDGET ──

function tpInitChart() {
  tpInitTVChart();
  return; // legacy lightweight charts replaced by TradingView widget
  const container = document.getElementById('tp-chart-container');
  if (!container || _tpChart) return;
  
  // Load TradingView Lightweight Charts
  if (false && !window.LightweightCharts) { // replaced by TradingView
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js';
    script.onload = () => tpCreateChart();
    document.head.appendChild(script);
  } else {
    tpCreateChart();
  }
}

var _tpVolumeSeries = null;
var _tpEMASeries = null;

function tpCreateChart() {
  const container = document.getElementById('tp-chart-container');
  if (!container) return;
  
  _tpChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { type: 'solid', color: '#0a0a0a' },
      textColor: '#555',
    },
    grid: {
      vertLines: { color: '#141414' },
      horzLines: { color: '#141414' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: '#333', labelBackgroundColor: '#1a1a1a' },
      horzLine: { color: '#333', labelBackgroundColor: '#1a1a1a' },
    },
    rightPriceScale: {
      borderColor: '#1a1a1a',
      scaleMargins: { top: 0.1, bottom: 0.2 },
    },
    timeScale: {
      borderColor: '#1a1a1a',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  // Candlestick series
  _tpCandleSeries = _tpChart.addCandlestickSeries({
    upColor: '#00c47a',
    downColor: '#E24B4A',
    borderDownColor: '#E24B4A',
    borderUpColor: '#00c47a',
    wickDownColor: '#E24B4A',
    wickUpColor: '#00c47a',
  });

  // Volume series
  _tpVolumeSeries = _tpChart.addHistogramSeries({
    color: '#26a69a',
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    scaleMargins: { top: 0.85, bottom: 0 },
  });

  // EMA line (optional indicator)
  _tpEMASeries = _tpChart.addLineSeries({
    color: '#5b7fff',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  });

  // Fetch real candle data
  tpFetchCandleData();

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    if (_tpChart && container) {
      _tpChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    }
  });
  resizeObserver.observe(container);

  // Subscribe to crosshair for price display
  _tpChart.subscribeCrosshairMove((param) => {
    if (param.time && param.seriesData) {
      const candle = param.seriesData.get(_tpCandleSeries);
      if (candle) {
        updateChartTooltip(candle);
      }
    }
  });
}

function updateChartTooltip(candle) {
  // Could add a tooltip element here if needed
}

// Get Binance symbol from our pair
function getBinanceSymbol(pair) {
  return pair; // Already in Binance format (BTCUSDT)
}

// Get timeframe interval for Binance
function getTimeframeInterval(tf) {
  const map = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };
  return map[tf] || '15m';
}

// Fetch real candle data from Binance
async function tpFetchCandleData() {
  if (!_tpCandleSeries) return;
  
  const symbol = getBinanceSymbol(TP_STATE.pair);
  const interval = getTimeframeInterval(TP_STATE.timeframe);
  
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error('Invalid candle data');
      tpGenerateSampleData();
      return;
    }
    
    const candles = data.map(d => ({
      time: Math.floor(d[0] / 1000),
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
    }));
    
    const volumes = data.map(d => ({
      time: Math.floor(d[0] / 1000),
      value: parseFloat(d[5]),
      color: parseFloat(d[4]) >= parseFloat(d[1]) ? 'rgba(0,196,122,0.3)' : 'rgba(226,75,74,0.3)',
    }));
    
    // Calculate EMA 20
    const ema = calculateEMA(candles.map(c => c.close), 20);
    const emaData = candles.slice(19).map((c, i) => ({ time: c.time, value: ema[i] }));
    
    _tpCandleSeries.setData(candles);
    _tpVolumeSeries.setData(volumes);
    _tpEMASeries.setData(emaData);
    _tpChart.timeScale().fitContent();
    
  } catch (e) {
    console.error('Failed to fetch candles:', e);
    tpGenerateSampleData();
  }
}

// Calculate EMA
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices.slice(0, period).reduce((a, b) => a + b, 0) / period];
  for (let i = period; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

// Fallback sample data
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

// Fetch live prices


// ── LOCAL ORDERBOOK STATE — merges delta updates ──
var _obBook = {asks:{}, bids:{}};

function _obApplyDelta(asks, bids){
  // merge asks
  (asks||[]).forEach(([p,s])=>{
    if(parseFloat(s)===0) delete _obBook.asks[p];
    else _obBook.asks[p] = s;
  });
  // merge bids
  (bids||[]).forEach(([p,s])=>{
    if(parseFloat(s)===0) delete _obBook.bids[p];
    else _obBook.bids[p] = s;
  });
}

function _obGetSorted(){
  const asks = Object.entries(_obBook.asks)
    .map(([p,s])=>[p,s])
    .sort((a,b)=>parseFloat(a[0])-parseFloat(b[0]))
    .slice(0,12);
  const bids = Object.entries(_obBook.bids)
    .map(([p,s])=>[p,s])
    .sort((a,b)=>parseFloat(b[0])-parseFloat(a[0]))
    .slice(0,12);
  return {asks, bids};
}

function _obReset(){
  _obBook = {asks:{}, bids:{}};
}
// ── END OB STATE ──

// ── WEBSOCKET REAL-TIME PRICE + ORDERBOOK ──
var _tpWS = null;
var _tpOBWS = null;
var _tpWSReconnectTimer = null;
var _tpWSLive = false; // true when WS is sending price data

function tpStartWebSocket(){
  tpStopWebSocket();
  if(window._tpPriceInterval) clearInterval(window._tpPriceInterval);
  _tpSetWSStatus('connecting');

  // REST immediately for fast first load
  tpFetchPrices().then(()=>{ tpFetchOrderBook(); });

  // REST fallback every 2s — skips if WS is delivering data
  window._tpPriceInterval = setInterval(()=>{
    if(!_tpWSLive) tpFetchPrices();
    if(!_tpWSLive) tpFetchOrderBook();
  }, 2000);

  // WS on top for real-time
  _tpTryWS();
}

function _tpTryWS(){
  const ex = TP_STATE.exchange||'binance';
  const isSpot = TP_STATE.marketType==='spot';
  const pair = (TP_STATE.pair||'BTCUSDT').toLowerCase();
  const pairUp = TP_STATE.pair||'BTCUSDT';
  const dot = document.getElementById('tp-ws-status');

  try{
    let url, onopen, onmsg;

    if(ex==='binance'){
      const base = isSpot ? 'wss://stream.binance.com/stream?streams=' : 'wss://fstream.binance.com/stream?streams=';
      url = base + pair + '@ticker/' + pair + '@depth10@100ms';
      onmsg = (msg)=>{
        const s = msg.stream||'';
        if(s.includes('@ticker')){
          const d=msg.data;
          const price=parseFloat(d.c)||0, change=parseFloat(d.P)||0;
          const prev=TP_STATE.prices[pairUp]?.price||0;
          _tpWSLive=true;
          TP_STATE.prices[pairUp]={symbol:pairUp,price,change,high:parseFloat(d.h)||0,low:parseFloat(d.l)||0,volume:parseFloat(d.q)||0};
          tpUpdatePriceDisplay();
          tpUpdatePositionsPnL();
          if(typeof tpCheckPendingOrders==="function") tpCheckPendingOrders();
          if(typeof tpUpdateSubmitButton==='function') tpUpdateSubmitButton();
          _tpFlashPrice(price,prev);
        }
        if(s.includes('@depth')&&msg.data.asks&&msg.data.bids){
          tpRenderOrderBookData(msg.data.asks, msg.data.bids);
        }
      };
    } else if(ex==='bybit'){
      url = isSpot ? 'wss://stream.bybit.com/v5/public/spot' : 'wss://stream.bybit.com/v5/public/linear';
      onopen = ()=>{ _tpWS.send(JSON.stringify({op:'subscribe',args:[`tickers.${pairUp}`,`orderbook.50.${pairUp}`]})); };
      onmsg = (msg)=>{
        const t=msg.topic||'';
        if(t.startsWith('tickers')&&msg.data){
          const d=msg.data;
          const price=parseFloat(d.lastPrice)||0, change=parseFloat(d.price24hPcnt||0)*100;
          const prev=TP_STATE.prices[pairUp]?.price||0;
          TP_STATE.prices[pairUp]={symbol:pairUp,price,change,high:parseFloat(d.highPrice24h)||0,low:parseFloat(d.lowPrice24h)||0,volume:parseFloat(d.turnover24h)||0};
          tpUpdatePriceDisplay();
          tpUpdatePositionsPnL();
          if(typeof tpCheckPendingOrders==="function") tpCheckPendingOrders();
          if(typeof tpUpdateSubmitButton==='function') tpUpdateSubmitButton();
          _tpFlashPrice(price,prev);
        }
        if(t.startsWith('orderbook')&&msg.data){
          const d=msg.data;
          if(msg.type==='snapshot'){ _obBook={asks:{},bids:{}}; }
          _obApplyDelta(d.a||[],d.b||[]);
          const {asks,bids}=_obGetSorted();
          if(asks.length&&bids.length) tpRenderOrderBookData(asks,bids);
        }
      };
    } else if(ex==='okx'){
      url = 'wss://ws.okx.com:8443/ws/v5/public';
      const instId = isSpot ? pairUp.replace('USDT','-USDT') : pairUp.replace('USDT','-USDT-SWAP');
      onopen = ()=>{ _tpWS.send(JSON.stringify({op:'subscribe',args:[{channel:'tickers',instId},{channel:'books',instId}]})); };
      onmsg = (msg)=>{
        const ch=msg.arg?.channel||'';
        if(ch==='tickers'&&msg.data?.[0]){
          const d=msg.data[0];
          const price=parseFloat(d.last)||0;
          const open24=parseFloat(d.open24h)||price;
          const change=open24?((price-open24)/open24*100):0;
          const prev=TP_STATE.prices[pairUp]?.price||0;
          TP_STATE.prices[pairUp]={symbol:pairUp,price,change,high:parseFloat(d.high24h)||0,low:parseFloat(d.low24h)||0,volume:parseFloat(d.volCcy24h)||0};
          tpUpdatePriceDisplay();
          tpUpdatePositionsPnL();
          if(typeof tpCheckPendingOrders==="function") tpCheckPendingOrders();
          if(typeof tpUpdateSubmitButton==='function') tpUpdateSubmitButton();
          _tpFlashPrice(price,prev);
        }
        if((ch==='books'||ch==='books5')&&msg.data?.[0]){
          const d=msg.data[0];
          if(msg.action==='snapshot'){ _obBook={asks:{},bids:{}}; }
          _obApplyDelta((d.asks||[]).map(a=>[a[0],a[1]]),(d.bids||[]).map(b=>[b[0],b[1]]));
          const {asks,bids}=_obGetSorted();
          if(asks.length&&bids.length) tpRenderOrderBookData(asks,bids);
        }
      };
    }

    _tpWS = new WebSocket(url);
    if(onopen) _tpWS.onopen = ()=>{ _tpSetWSStatus('live'); onopen(); _tpWS._ping=setInterval(()=>{ if(_tpWS.readyState===1) _tpWS.send(ex==='okx'?'ping':JSON.stringify({op:'ping'})); },20000); };
    else _tpWS.onopen = ()=>{ _tpSetWSStatus('live'); _tpWS._ping=setInterval(()=>{ if(_tpWS.readyState===1) _tpWS.send(JSON.stringify({op:'ping'})); },20000); };
    _tpWS.onmessage = (e)=>{ try{ const msg=JSON.parse(e.data); if(msg&&msg!=='pong') onmsg(msg); }catch(err){} };
    _tpWS.onclose = _tpWS.onerror = ()=>{ if(_tpWS._ping) clearInterval(_tpWS._ping); _tpWSLive=false; _tpSetWSStatus('error'); };
  } catch(err){ _tpSetWSStatus('error'); }
}

function _tpFlashPrice(price, prev){
  if(!prev||price===prev) return;
  const el=document.getElementById('tp-price-main');
  if(!el) return;
  el.style.transition='color .15s';
  el.style.color=price>prev?'#00c47a':'#e24b4a';
  setTimeout(()=>{el.style.color='';},300);
}

// ── WS STATUS PILL HELPER ──
function _tpSetWSStatus(state){
  // state: 'offline' | 'connecting' | 'live' | 'error'
  const btn   = document.getElementById('tp-ws-status');
  const dot   = document.getElementById('tp-ws-dot');
  const label = document.getElementById('tp-ws-label');
  if(!btn||!dot||!label) return;

  const states = {
    offline:    { dot:'#444',    label:'offline',      border:'#2a2a2a', bg:'#111',    color:'#555',    pulse:true  },
    connecting: { dot:'#EF9F27', label:'connecting…',  border:'#3a2a00', bg:'#1a1200', color:'#EF9F27', pulse:true  },
    live:       { dot:'#00c47a', label:'live',          border:'#004d30', bg:'#0a1a10', color:'#00c47a', pulse:false },
    error:      { dot:'#e24b4a', label:'disconnected',  border:'#3a1a1a', bg:'#1a0a0a', color:'#e24b4a', pulse:true  },
  };
  const s = states[state] || states.offline;

  dot.style.background   = s.dot;
  label.textContent      = s.label;
  btn.style.borderColor  = s.border;
  btn.style.background   = s.bg;
  label.style.color      = s.color;

  // pulse animation for non-live states
  dot.style.animation = s.pulse ? 'wsPulse 1.4s ease-in-out infinite' : 'none';
  btn.title = state==='live' ? 'WebSocket live — click to reconnect' : 'Click to reconnect';
}

function tpReconnectWS(){
  const dot = document.getElementById('tp-ws-status');
  _tpSetWSStatus('connecting');
  _obReset();
  tpStartWebSocket();
  showToast('reconnecting...', 'info');
}

function tpStopWebSocket(){
  if(_tpWSReconnectTimer){ clearTimeout(_tpWSReconnectTimer); _tpWSReconnectTimer=null; }
  if(_tpWS){ try{ _tpWS.close(); }catch(e){} _tpWS=null; }
  if(window._tpPriceInterval){ clearInterval(window._tpPriceInterval); window._tpPriceInterval=null; }
  _tpSetWSStatus('error');
}
// ── END WEBSOCKET ──

async function tpFetchPrices() {
  try {
    const ex = TP_STATE.exchange || 'binance';
    const isSpot = TP_STATE.marketType === 'spot';

    const data = await Promise.all(TP_PAIRS.map(async p => {
      try {
        let url, ticker;
        if(ex === 'binance'){
          if(isSpot){
            url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${p.symbol}`;
            ticker = await fetch(url).then(r=>r.json());
            return { symbol: p.symbol, price: parseFloat(ticker.lastPrice)||0, change: parseFloat(ticker.priceChangePercent)||0, high: parseFloat(ticker.highPrice)||0, low: parseFloat(ticker.lowPrice)||0, volume: parseFloat(ticker.quoteVolume)||0 };
          } else {
            url = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${p.symbol}`;
            ticker = await fetch(url).then(r=>r.json());
            return { symbol: p.symbol, price: parseFloat(ticker.lastPrice)||0, change: parseFloat(ticker.priceChangePercent)||0, high: parseFloat(ticker.highPrice)||0, low: parseFloat(ticker.lowPrice)||0, volume: parseFloat(ticker.quoteVolume)||0 };
          }
        } else if(ex === 'bybit'){
          const cat = isSpot ? 'spot' : 'linear';
          url = `https://api.bybit.com/v5/market/tickers?category=${cat}&symbol=${p.symbol}`;
          ticker = await fetch(url).then(r=>r.json());
          const t = ticker.result?.list?.[0];
          return { symbol: p.symbol, price: parseFloat(t?.lastPrice)||0, change: parseFloat(t?.price24hPcnt||0)*100, high: parseFloat(t?.highPrice24h)||0, low: parseFloat(t?.lowPrice24h)||0, volume: parseFloat(t?.turnover24h)||0 };
        } else if(ex === 'okx'){
          const instId = isSpot ? p.symbol.replace('USDT','-USDT') : p.symbol.replace('USDT','-USDT-SWAP');
          url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
          ticker = await fetch(url).then(r=>r.json());
          const t = ticker.data?.[0];
          return { symbol: p.symbol, price: parseFloat(t?.last)||0, change: parseFloat(t?.open24h) ? ((parseFloat(t?.last)-parseFloat(t?.open24h))/parseFloat(t?.open24h)*100) : 0, high: parseFloat(t?.high24h)||0, low: parseFloat(t?.low24h)||0, volume: parseFloat(t?.volCcy24h)||0 };
        }
      } catch(e){ return null; }
    }));

    data.forEach(d => {
      if(d) TP_STATE.prices[d.symbol] = d;
    });

    tpUpdatePriceDisplay();
    tpUpdatePositionsPnL();
    tpRenderPairList();
    if(typeof tpUpdateSubmitButton==='function') tpUpdateSubmitButton();
  } catch(e) {
    console.error('Price fetch error:', e);
  }
}

// Update price display
function tpUpdatePriceDisplay() {
  const priceEl = document.getElementById('tp-price-main');
  if (!priceEl) return; // Not ready

  const priceData = TP_STATE.prices[TP_STATE.pair] || { price: 0, change: 0 };
  const pairInfo = TP_PAIRS.find(p => p.symbol === TP_STATE.pair) || TP_PAIRS[0];
  
  const _piEl=document.getElementById('tp-pair-icon'); 
  if(_piEl){ 
    const _src=BATT_ICONS[pairInfo.icon]; 
    _piEl.innerHTML=_src?`<img src="${_src}" width="20" height="20" style="border-radius:50%;object-fit:cover" alt="${pairInfo.icon}" onerror="this.style.display='none'">`:pairInfo.icon; 
  }
  
  const nameEl = document.getElementById('tp-pair-name');
  if (nameEl) nameEl.textContent = TP_STATE.pair.replace('USDT', '/USDT');
  
  const exchangeEl = document.getElementById('tp-pair-exchange');
  if (exchangeEl) exchangeEl.textContent = `${TP_STATE.marketType} · ${TP_STATE.exchange}`;
  
  // skip if no real data yet — keep whatever is already displayed
  if(!priceData.price || priceData.price === 0) return;

  if (priceEl) priceEl.textContent = fmtPrice(priceData.price);
  
  const changeEl = document.getElementById('tp-price-change');
  if (changeEl) {
    const isUp = priceData.change >= 0;
    changeEl.textContent = (isUp ? '+' : '') + priceData.change.toFixed(2) + '%';
    changeEl.className = 'tp-price-change ' + (isUp ? 'up' : 'down');
  }
  
  // sync OB mid change% with same ticker data
  const obChangeEl = document.getElementById('tp-ob-change');
  if(obChangeEl && priceData.change !== undefined){
    const isUp2 = priceData.change >= 0;
    const chgTxt = (isUp2?'+':'')+priceData.change.toFixed(2)+'%';
    if(obChangeEl.textContent !== chgTxt){
      obChangeEl.textContent = chgTxt;
      obChangeEl.className = 'tp-ob-mid-change '+(isUp2?'up':'down');
    }
  }
  
  const highEl = document.getElementById('tp-high');
  if(highEl && priceData.high) highEl.textContent = fmtPrice(priceData.high);
  const lowEl = document.getElementById('tp-low');
  if(lowEl && priceData.low) lowEl.textContent = fmtPrice(priceData.low);
  const volEl = document.getElementById('tp-vol');
  if(volEl && priceData.volume) volEl.textContent = '$' + (priceData.volume).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });

  // ── sync chart overlay ──
  _tpSyncChartOverlay(priceData);

  tpCalculate();
}

// keep chart overlay in sync with WS price — runs on every tick
function _tpSyncChartOverlay(priceData){
  if(!priceData || !priceData.price) return;
  const cp  = document.getElementById('tp-chart-price');
  const cc  = document.getElementById('tp-chart-change');
  const ch  = document.getElementById('tp-chart-high');
  const cl  = document.getElementById('tp-chart-low');
  const cv  = document.getElementById('tp-chart-vol');
  const src = document.getElementById('tp-chart-source');

  if(cp){
    const prev = cp.dataset.prev ? parseFloat(cp.dataset.prev) : 0;
    cp.textContent = fmtPrice(priceData.price);
    // flash color on tick
    if(prev && priceData.price !== prev){
      cp.style.color = priceData.price > prev ? '#00c47a' : '#e24b4a';
      clearTimeout(cp._ft);
      cp._ft = setTimeout(()=>{ cp.style.color='#fff'; }, 280);
    }
    cp.dataset.prev = priceData.price;
  }
  if(cc){
    const isUp = (priceData.change||0) >= 0;
    cc.textContent = (isUp?'+':'')+priceData.change.toFixed(2)+'%';
    cc.style.background = isUp ? 'rgba(0,196,122,0.15)' : 'rgba(226,75,74,0.15)';
    cc.style.color      = isUp ? '#00c47a' : '#e24b4a';
  }
  if(ch && priceData.high)  ch.textContent = fmtPrice(priceData.high);
  if(cl && priceData.low)   cl.textContent = fmtPrice(priceData.low);
  if(cv && priceData.volume) cv.textContent = '$'+(priceData.volume).toLocaleString(undefined,{notation:'compact',maximumFractionDigits:1});
  // source indicator — WS = live, REST = polling
  if(src) src.textContent = _tpWSLive ? 'WS ●' : 'REST ○';
  if(src) src.style.color = _tpWSLive ? '#00c47a' : '#EF9F27';

  // also sync orderbook mid price to match WS exactly
  const obPriceEl = document.getElementById('tp-ob-price');
  if(obPriceEl && _tpWSLive){
    // only sync ob mid if no real OB data has come in (OB updates its own mid)
    // use WS price as fallback when OB hasn't rendered yet
    if(obPriceEl.textContent === '$69,420.50' || obPriceEl.textContent === '—'){
      obPriceEl.textContent = fmtPrice(priceData.price);
    }
  }
}

// Select pair
function tpSelectPair(symbol) {
  TP_STATE.pair = symbol;
  tpHidePairModal();
  tpUpdateSubmitButton();
  tpSaveState();
  _obReset();
  _tpTrades = []; // clear stale trades
  if(typeof tpStartWebSocket==='function') tpStartWebSocket();
  if(typeof tpInitTVChart==='function') tpInitTVChart();
  // restart trade WS if trades tab is active
  if(_tpObMode==='trades' && typeof tpStartTradeWS==='function') tpStartTradeWS();
}

// Pair modal
function tpShowPairModal() {
  document.getElementById('tp-pair-modal').classList.add('show');
  tpRenderPairList();
}

function tpHidePairModal() {
  document.getElementById('tp-pair-modal').classList.remove('show');
}

function tpRenderPairList(filter = '') {
  const container = document.getElementById('tp-pair-list');
  if (!container) return;
  
  const filtered = TP_PAIRS.filter(p => 
    p.symbol.toLowerCase().includes(filter.toLowerCase()) ||
    p.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  container.innerHTML = filtered.map(p => {
    const priceData = TP_STATE.prices[p.symbol] || { price: 0, change: 0 };
    const isUp = priceData.change >= 0;
    const isActive = p.symbol === TP_STATE.pair;
    
    return `
      <div class="tp-pair-item ${isActive ? 'active' : ''}" onclick="tpSelectPair('${p.symbol}')">
        <div class="tp-pair-item-left">
          <span class="tp-pair-item-icon">${p.img?`<img src="${p.img}" width="22" height="22" style="border-radius:50%;object-fit:cover" alt="${p.icon}" onerror="this.style.display='none'">`:BATT_ICONS[p.icon]?`<img src="${BATT_ICONS[p.icon]}" width="22" height="22" style="border-radius:50%;object-fit:cover" alt="${p.icon}" onerror="this.style.display='none'">`:`<span>${p.icon}</span>`}</span>
          <div>
            <div class="tp-pair-item-name">${p.symbol.replace('USDT', '')}</div>
            <div class="tp-pair-item-full">${p.name}</div>
          </div>
        </div>
        <div class="tp-pair-item-right">
          <div class="tp-pair-item-price">$${priceData.price.toLocaleString()}</div>
          <div class="tp-pair-item-change ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${priceData.change.toFixed(2)}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function tpFilterPairs(query) {
  tpRenderPairList(query);
}

// Exchange selection
function tpSelectExchange(ex) {
  TP_STATE.exchange = ex;
  TP_STATE.prices = {}; // clear stale prices from previous exchange
  document.querySelectorAll('.tp-ex-tabs button').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const isSpot = TP_STATE.marketType === 'spot';
  document.getElementById('tp-pair-exchange').textContent = `${isSpot?'spot':'perpetual'} · ${ex}`;
  _obReset();
  _tpTrades = [];
  tpUpdateFeeBadge();
  tpUpdateSubmitButton();
  if(typeof tpStartWebSocket==='function') tpStartWebSocket();
  if(typeof tpFetchPrices==='function') tpFetchPrices();
  if(typeof tpFetchOrderBook==='function') tpFetchOrderBook();
  if(typeof tpInitTVChart==='function') tpInitTVChart();
  if(_tpObMode==='trades' && typeof tpStartTradeWS==='function') tpStartTradeWS();
}

// Order type
// Side selection
function tpSelectSide(side) {
  TP_STATE.side = side;
  document.getElementById('tp-side-long').classList.toggle('active', side === 'long');
  document.getElementById('tp-side-short').classList.toggle('active', side === 'short');
  
  const btn = document.getElementById('tp-submit');
  if (btn) {
    btn.className = 'tp-submit-btn ' + side;
    btn.textContent = `${side === 'long' ? 'Long' : 'Short'} ${TP_STATE.pair.replace('USDT', '/USDT')}`;
  }
  tpCalculate();
}

// Leverage slider
function tpSetLeverageSlider(val) {
  TP_STATE.leverage = parseInt(val);
  document.getElementById('tp-leverage-value').textContent = val + 'x';
  tpCalculate();
}

// Adjust size
function tpAdjustSize(delta) {
  const input = document.getElementById('tp-size');
  let val = parseFloat(input.value) || 0;
  val = Math.max(0, val + delta);
  input.value = val;
  tpCalculate();
}

function tpSetMaxSize() {
  document.getElementById('tp-size').value = Math.floor(TP_STATE.balance);
  tpCalculate();
}

// Calculate summary
function tpCalculate() {
  const sizeInput = document.getElementById('tp-size');
  const limitPriceInput = document.getElementById('tp-limit-price');
  const stopPriceInput = document.getElementById('tp-stop-price');
  const tpPriceInput = document.getElementById('tp-tp-price');
  const slPriceInput = document.getElementById('tp-sl-price');

  const size = parseFloat(sizeInput?.value) || 0;
  const priceData = TP_STATE.prices[TP_STATE.pair] || { price: 69000 };
  const isSpot = TP_STATE.marketType === 'spot';
  const side = TP_STATE.side;
  const lev = isSpot ? 1 : TP_STATE.leverage;
  const fees = tpGetFees(TP_STATE.exchange, TP_STATE.marketType, TP_STATE.orderType);

  const entryPrice = (TP_STATE.orderType === 'limit' || TP_STATE.orderType === 'stop')
    ? (parseFloat(limitPriceInput?.value) || parseFloat(stopPriceInput?.value) || priceData.price)
    : priceData.price;

  const slippage = tpCalcSlippage(TP_STATE.pair, size);
  // limit orders fill at exact price — no slippage in preview
  const isLimitPreview = TP_STATE.orderType === 'limit' || TP_STATE.orderType === 'stop';
  const fillPrice = isLimitPreview ? entryPrice
    : (side === 'long' || isSpot) ? entryPrice * (1 + slippage) : entryPrice * (1 - slippage);
  const notional = size;
  const margin = isSpot ? size : tpCalcMarginRequired(notional, lev, TP_STATE.marginMode);
  const openFee = notional * (fees.active / 100);

  // liq price — use same isolated formula as tpCalcLiqPrice for consistency
  const mmRate = 0.005;
  let liqPrice = null;
  if (!isSpot && lev > 1) {
    const marginPerNotional = margin / notional;
    if (side === 'long') liqPrice = fillPrice * (1 - marginPerNotional + mmRate);
    else                 liqPrice = fillPrice * (1 + marginPerNotional - mmRate);
  }

  const tpPrice = parseFloat(tpPriceInput?.value) || 0;
  const slPrice = parseFloat(slPriceInput?.value) || 0;

  // TP/SL PnL: priceDelta/entryPrice * notional (no extra leverage multiply — notional already includes it)
  const tpPnl = tpPrice > 0
    ? (side === 'long' ? (tpPrice - fillPrice) / fillPrice : (fillPrice - tpPrice) / fillPrice) * notional
    : 0;
  const slPnl = slPrice > 0
    ? (side === 'long' ? (slPrice - fillPrice) / fillPrice : (fillPrice - slPrice) / fillPrice) * notional
    : 0;

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  setText('tp-sum-entry', fmtPrice(fillPrice) + (!isLimitPreview && slippage > 0.0001 ? ' (slip ' + ((slippage * 100).toFixed(3)) + '%)' : ''));
  setText('tp-sum-margin', fmtPrice(margin));
  setText('tp-sum-liq', liqPrice ? fmtPrice(liqPrice) : 'n/a');
  setText('tp-sum-tp', tpPrice > 0 ? fmtPrice(tpPrice) + ' (' + (tpPnl >= 0 ? '+' : '') + fmtPrice(tpPnl) + ')' : '—');
  setText('tp-sum-sl', slPrice > 0 ? fmtPrice(slPrice) + ' (' + (slPnl >= 0 ? '+' : '') + fmtPrice(slPnl) + ')' : '—');
  setText('tp-sum-fee', fmtPrice(openFee) + ' (' + (fees.isMaker ? 'maker' : 'taker') + ' ' + fees.active.toFixed(3) + '%)');
  setText('tp-sum-value', fmtPrice(notional));

  const roeEl = document.getElementById('tp-sum-roe');
  if (roeEl && margin > 0) {
    const tpRoe = margin > 0 ? (tpPnl / margin * 100).toFixed(1) : 0;
    const slRoe = margin > 0 ? (slPnl / margin * 100).toFixed(1) : 0;
    roeEl.textContent = tpPrice > 0 ? 'ROE: TP ' + (tpRoe >= 0 ? '+' : '') + tpRoe + '% / SL ' + (slRoe >= 0 ? '+' : '') + slRoe + '%' : '';
  }
}
  
// Place order
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

  // ── LIMIT / STOP ORDER ──
  if(TP_STATE.orderType === 'limit' || TP_STATE.orderType === 'stop'){
    const limitPriceEl = document.getElementById('tp-limit-price');
    const stopPriceEl  = document.getElementById('tp-stop-price');
    const limitPrice   = parseFloat(limitPriceEl?.value) || parseFloat(stopPriceEl?.value);
    if(!limitPrice || limitPrice <= 0){ showToast('Enter a limit price first', 'error'); return; }
    const marginNeeded = isSpot ? size : tpCalcMarginRequired(size, lev, TP_STATE.marginMode);
    const isCrossOrder = !isSpot && TP_STATE.marginMode === 'cross';
    // available balance check — cross uses wallet equity, isolated uses free balance
    const crossMarginLocked = isCrossOrder
      ? TP_STATE.positions.filter(p=>p.marginMode==='cross').reduce((a,p)=>a+(p.initialMargin||p.size/p.leverage),0)
      : 0;
    const availForOrder = isCrossOrder ? TP_STATE.balance - crossMarginLocked : TP_STATE.balance;
    if(marginNeeded > availForOrder){ showToast('Insufficient balance. Need: '+fmtPrice(marginNeeded), 'error'); return; }
    const tpPrice = parseFloat(document.getElementById('tp-tp-price')?.value) || 0;
    const slPrice = parseFloat(document.getElementById('tp-sl-price')?.value) || 0;
    const order = {
      id: 'ord_'+Date.now(),
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
    // isolated locks margin immediately, cross does not
    if(!isCrossOrder) TP_STATE.balance -= marginNeeded;
    if(!TP_STATE.pendingOrders) TP_STATE.pendingOrders = [];
    TP_STATE.pendingOrders.push(order);
    tpSaveState(); tpRenderOrders(); _tpUpdateOrderBadge();
    const _posPanel = document.getElementById('tp-pos-panel');
    if(_posPanel && _posPanel.classList.contains('collapsed')){ _posPanel.classList.remove('collapsed'); setTimeout(_tpSyncPosToggle,10); }
    tpShowTab('orders');
    showToast(`${TP_STATE.orderType.toUpperCase()} ${order.side.toUpperCase()} @ ${fmtPrice(limitPrice)} | margin: ${fmtPrice(marginNeeded)}`, 'success');
    return;
  }

  // ── SPOT SELL ──
  if (isSpot && isSell) {
    const holding = TP_STATE.positions.find(p => p.pair === TP_STATE.pair && (p.marketType === 'spot' || p.leverage <= 1));
    if (!holding){ showToast('No '+TP_STATE.pair.replace('USDT','')+' holdings to sell', 'error'); return; }
    const holdingQty  = holding.size / holding.entryPrice;
    const sellQty     = size / price;
    if (sellQty > holdingQty * 1.001){ showToast('Insufficient holdings. You have '+holdingQty.toFixed(6)+' '+TP_STATE.pair.replace('USDT',''), 'error'); return; }
    const slippage    = tpCalcSlippage(TP_STATE.pair, size);
    const fillPrice   = price * (1 - slippage); // sell fills slightly below market
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
    if (TP_STATE.history.length > 100) TP_STATE.history = TP_STATE.history.slice(0,100);
    TP_STATE.sessionTrades++;
    tpSaveState(); tpUpdateUI(); tpRenderPositions(); tpRenderHistory();
    const pnlStr = (pnl>=0?'+':'')+fmtPrice(pnl);
    showToast('Sold '+TP_STATE.pair.replace('USDT','')+' @ '+fmtPrice(fillPrice)+' | PnL: '+pnlStr+' | Fee: '+fmtPrice(fee), pnl >= 0 ? 'success' : 'error');
    return;
  }

  // ── SPOT BUY or PERP OPEN ──
  const notional       = size; // size = USDT notional
  const marginNeeded   = isSpot ? size : tpCalcMarginRequired(notional, lev, TP_STATE.marginMode);
  const slippage       = tpCalcSlippage(TP_STATE.pair, notional);
  const fillPrice      = isSell
    ? price * (1 - slippage)
    : price * (1 + slippage);
  const openFee        = notional * (fees.active / 100);

  // Cross: margin stays in pool, only fee is deducted from free balance
  // Isolated: margin + fee deducted from free balance
  const isCross = !isSpot && TP_STATE.marginMode === 'cross';
  const balanceDeduct = isSpot ? size + openFee : (isCross ? openFee : marginNeeded + openFee);

  // Available balance check
  const crossMarginLocked = isCross ? TP_STATE.positions.filter(p=>p.marginMode==='cross').reduce((a,p)=>a+(p.initialMargin||p.size/p.leverage),0) : 0;
  const availableBalance  = isCross ? TP_STATE.balance - crossMarginLocked : TP_STATE.balance;
  const requiredBalance   = isCross ? openFee + marginNeeded : balanceDeduct;
  if(availableBalance < requiredBalance){ showToast('Insufficient balance. Need: '+fmtPrice(requiredBalance), 'error'); return; }
  if(TP_STATE.positions.length >= 20){ showToast('Max 20 positions', 'error'); return; }

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

  // Cross: only deduct fee (margin stays in wallet equity pool)
  // Isolated/Spot: deduct margin + fee
  TP_STATE.balance -= isCross ? openFee : (isSpot ? size + openFee : marginNeeded + openFee);
  TP_STATE.totalFeesPaid += openFee;
  TP_STATE.positions.push(position);
  tpSaveState(); tpUpdateUI(); tpRenderPositions();
  if (sizeInput) sizeInput.value = '';
  tpCalculate();

  const pairShort = position.pair.replace('USDT','');
  const slipTxt   = (slippage*100).toFixed(3)+'%';
  if (isSpot) {
    showToast('Bought '+pairShort+' @ '+fmtPrice(fillPrice)+' | Fee: '+fmtPrice(openFee)+' | Slip: '+slipTxt, 'success');
  } else {
    showToast(position.side.toUpperCase()+' '+pairShort+' '+lev+'x @ '+fmtPrice(fillPrice)+' | Margin: '+fmtPrice(marginNeeded)+' | Fee: '+fmtPrice(openFee), 'success');
    if(TP_STATE.marketType === 'perpetual') tpFetchFundingRate(TP_STATE.pair);
  }
}

// ── CEX STANDARD: CLOSE POSITION ──
function tpClosePosition(id, partialPct) {
  const idx = TP_STATE.positions.findIndex(p => p.id === id);
  if (idx === -1) return;
  const pos = TP_STATE.positions[idx];
  const currentPrice = TP_STATE.prices[pos.pair]?.price || pos.entryPrice;
  const pct = partialPct || 100;
  const isPartial = pct < 100;

  // size to close
  const closeNotional  = pos.size * (pct / 100);
  const pnl            = tpCalcPnL({ ...pos, size: closeNotional }, currentPrice);
  const funding        = tpCalcFunding({ ...pos, size: closeNotional });
  const fees           = tpGetFees(pos.exchange, pos.marketType, 'market');
  const closeFee       = closeNotional * (fees.taker / 100);
  const netPnl         = pnl + funding - closeFee;
  const isCross        = pos.marginMode === 'cross' && pos.marketType !== 'spot';
  const returnedMargin = isCross ? 0 : (pos.initialMargin || pos.size / pos.leverage) * (pct / 100);

  // Cross: netPnl only (margin was never deducted from balance)
  // Isolated/Spot: margin + netPnl returned
  TP_STATE.balance += isCross ? netPnl : returnedMargin + netPnl;
  TP_STATE.totalFeesPaid += closeFee;
  TP_STATE.totalFundingPaid += Math.abs(funding);

  if(isPartial){
    // reduce position — calc remaining margin BEFORE modifying size
    const remainingPct = (100 - pct) / 100;
    pos.initialMargin = (pos.initialMargin || pos.size / pos.leverage) * remainingPct;
    pos.size         -= closeNotional;
    pos.liqPrice      = tpCalcLiqPrice(pos);
    TP_STATE.history.unshift({ ...pos, exitPrice: currentPrice, pnl: netPnl, fee: closeFee, funding, partial: true, pct, closedAt: Date.now() });
  } else {
    TP_STATE.positions.splice(idx, 1);
    TP_STATE.history.unshift({ ...pos, exitPrice: currentPrice, pnl: netPnl, fee: closeFee, funding, closedAt: Date.now() });
  }
  if (TP_STATE.history.length > 100) TP_STATE.history = TP_STATE.history.slice(0,100);
  TP_STATE.sessionTrades++;

  tpSaveState(); tpUpdateUI(); tpRenderPositions(); tpRenderHistory();
  const pnlStr = (netPnl>=0?'+':'')+fmtPrice(netPnl);
  const label  = isPartial ? 'Closed '+pct+'%' : 'Closed';
  showToast(label+' '+pos.pair.replace('USDT','')+' | PnL: '+pnlStr+' | Fee: '+fmtPrice(closeFee)+(funding!==0?' | Funding: '+fmtPrice(funding):''), netPnl >= 0 ? 'success' : 'error');
}

// ── CEX STANDARD: GET FEES FOR CURRENT EXCHANGE/MODE ──
function tpGetFees(exchange, marketType, orderType){
  const ex = exchange || TP_STATE.exchange;
  const mt = marketType || TP_STATE.marketType;
  const ot = orderType || TP_STATE.orderType;
  const feeSet = CEX_FEES[ex] || CEX_FEES.binance;
  const rates = mt === 'spot' ? feeSet.spot : feeSet.perp;
  const isMaker = (ot === 'limit');
  let rate = isMaker ? rates.maker : rates.taker;
  if(ex === 'binance' && TP_STATE.useBnbFee) rate *= (1 - feeSet.bnbDiscount);
  return { maker: rates.maker, taker: rates.taker, active: rate, isMaker };
}

// ── CEX STANDARD: CALCULATE LIQUIDATION PRICE ──
function tpCalcLiqPrice(pos){
  if(!pos || pos.marketType === 'spot' || pos.leverage <= 1) return null;
  const { entryPrice, side, size } = pos;
  const margin  = pos.initialMargin || (size / pos.leverage);
  const mmRate  = 0.005; // 0.5% maintenance margin rate
  const notional = size;
  if(pos.marginMode === 'isolated'){
    // Isolated: liq when remaining margin = maintenance margin
    if(side === 'long')  return entryPrice * (1 - (margin / notional) + mmRate);
    else                 return entryPrice * (1 + (margin / notional) - mmRate);
  } else {
    // Cross: total wallet equity backs all positions
    // wallet equity = free balance + sum of all margins (already in pool for cross)
    // avoid calling tpCalcPnL here (recursive risk) — use direct balance approach
    const totalMargin = TP_STATE.positions.reduce((a, p) => {
      if(p.marketType === 'spot') return a;
      return a + (p.initialMargin || p.size / p.leverage);
    }, 0);
    const walletEquity = TP_STATE.balance + totalMargin;
    // liq when walletEquity = total maintenance margin across all positions
    const totalMaintMargin = TP_STATE.positions.reduce((a, p) => {
      if(p.marketType === 'spot') return a;
      return a + p.size * mmRate;
    }, 0);
    const availableForLoss = walletEquity - totalMaintMargin;
    if(side === 'long')  return Math.max(0, entryPrice - (availableForLoss / notional) * entryPrice);
    else                 return entryPrice + (availableForLoss / notional) * entryPrice;
  }
}

// ── CEX STANDARD: CALCULATE PNL ──
function tpCalcPnL(pos, currentPrice){
  if(!pos) return 0;
  const isSpot = pos.marketType === 'spot' || pos.leverage <= 1;
  if(isSpot){
    const qty = pos.size / pos.entryPrice;
    return (currentPrice - pos.entryPrice) * qty;
  }
  // Perp: PnL = (exitPrice - entryPrice) / entryPrice * notional
  // notional = size (in USDT), already includes leverage
  const priceDelta = (currentPrice - pos.entryPrice) / pos.entryPrice;
  const pnlFactor  = pos.side === 'long' ? priceDelta : -priceDelta;
  return pos.size * pnlFactor;
}

// ── CEX STANDARD: CALCULATE ROE % ──
function tpCalcROE(pos, currentPrice){
  if(!pos) return 0;
  const pnl = tpCalcPnL(pos, currentPrice);
  const margin = pos.initialMargin || (pos.size / pos.leverage);
  return (pnl / margin) * 100;
}

// ── CEX STANDARD: ACCRUED FUNDING ──
function tpCalcFunding(pos){
  if(!pos || pos.marketType === 'spot') return 0;
  // prefer live rate from funding monitor (_frData) if available, fallback to TP_STATE cache, then default
  const liveEx = TP_STATE.exchange==='binance'?'binance':TP_STATE.exchange==='bybit'?'bybit':TP_STATE.exchange==='okx'?'okx':null;
  const liveRate = liveEx&&_frData[pos.pair]&&_frData[pos.pair][liveEx]!=null
    ? _frData[pos.pair][liveEx]
    : (TP_STATE.fundingRates[pos.pair] ?? (CEX_FEES[TP_STATE.exchange]?.defaultFunding ?? 0.01));
  const fundingRate = liveRate;
  const hoursSinceOpen = (Date.now() - pos.openedAt) / 3600000;
  const interval       = CEX_FEES[TP_STATE.exchange]?.fundingInterval || 8;
  const fundingPeriods = Math.floor(hoursSinceOpen / interval);
  if(fundingPeriods === 0) return 0;
  const notional = pos.size;
  const sign = pos.side === 'long' ? -1 : 1;
  return sign * notional * (fundingRate / 100) * fundingPeriods;
}

// ── CEX STANDARD: FETCH LIVE FUNDING RATE ──
async function tpFetchFundingRate(symbol){
  const ex = TP_STATE.exchange;
  try {
    let rate = null;
    if(ex === 'binance'){
      const r = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol='+symbol);
      const d = await r.json();
      rate = parseFloat(d.lastFundingRate) * 100;
    } else if(ex === 'bybit'){
      const r = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol='+symbol);
      const d = await r.json();
      rate = parseFloat(d.result?.list?.[0]?.fundingRate||0) * 100;
    } else if(ex === 'okx'){
      const instId = symbol.replace('USDT','-USDT-SWAP');
      const r = await fetch('https://www.okx.com/api/v5/public/funding-rate?instId='+instId);
      const d = await r.json();
      rate = parseFloat(d.data?.[0]?.fundingRate||0) * 100;
    }
    if(rate !== null && !isNaN(rate)){
      TP_STATE.fundingRates[symbol] = Math.abs(rate);
      _tpFundingCache[symbol] = { rate: Math.abs(rate), ts: Date.now() };
    }
    return rate;
  } catch(e){ return null; }
}

// ── CEX STANDARD: SLIPPAGE MODEL ──
function tpCalcSlippage(pair, sizeUSDT){
  const base = 0.0001;
  const impact = Math.min(sizeUSDT / 500000, 0.002);
  return base + impact;
}

// ── CEX STANDARD: MARGIN REQUIRED ──
function tpCalcMarginRequired(sizeUSDT, leverage, marginMode){
  return sizeUSDT / leverage;
}

// ── CEX STANDARD: MAX POSITION SIZE ──
function tpCalcMaxSize(){
  const leverage = TP_STATE.leverage;
  const isCross  = TP_STATE.marginMode === 'cross' && TP_STATE.marketType === 'perpetual';

  if(isCross){
    // Cross: available = wallet equity minus maintenance margin of all cross positions
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
      .reduce((a, p) => a + p.size * 0.005, 0); // 0.5% maintenance
    const availableCross = Math.max(0, walletEquity - maintMargin);
    return availableCross * leverage;
  } else {
    // Isolated/Spot: available = free balance (locked isolated margins already deducted)
    return TP_STATE.balance * leverage;
  }
}

// Update positions PnL
function tpUpdatePositionsPnL() {
  const container = document.getElementById('tp-positions');
  TP_STATE.positions.forEach(pos => {
    if(!container) return;
    const card = container.querySelector('[data-id="'+pos.id+'"]');
    if(!card) return;
    const currentPrice = TP_STATE.prices[pos.pair]?.price;
    if(!currentPrice) return;
    const pnl      = tpCalcPnL(pos, currentPrice);
    const roe      = tpCalcROE(pos, currentPrice);
    const funding  = tpCalcFunding(pos);
    const netPnl   = pnl + funding;
    const isUp     = netPnl >= 0;
    const pnlVal   = card.querySelector('.tp-pos-pnl-value');
    const pnlPer   = card.querySelector('.tp-pos-pnl-percent');
    const markEl   = card.querySelector('.tp-pos-mark');
    const fundEl   = card.querySelector('.tp-pos-funding');
    if(pnlVal){ pnlVal.textContent=(isUp?'+':'')+fmtPrice(netPnl); pnlVal.className='tp-pos-pnl-value '+(isUp?'up':'down'); }
    if(pnlPer){ pnlPer.textContent='ROE '+(roe>=0?'+':'')+roe.toFixed(2)+'%'; pnlPer.style.color=roe>=0?'#00c47a':'#e24b4a'; }
    if(markEl)  markEl.textContent  = fmtPrice(currentPrice);
    if(fundEl)  fundEl.textContent  = funding !== 0 ? 'Funding: '+(funding>=0?'+':'')+fmtPrice(funding) : '';
    // update liq price (cross margin changes as balance changes)
    pos.liqPrice = tpCalcLiqPrice(pos);
    const liqEl = card.querySelector('.tp-pos-liq');
    if(liqEl) liqEl.textContent = pos.liqPrice ? fmtPrice(pos.liqPrice) : 'n/a';
  });
  tpUpdateUI();

  // TP/SL/Liq check
  [...TP_STATE.positions].forEach(pos => {
    const currentPrice = TP_STATE.prices[pos.pair]?.price || pos.entryPrice;
    const isLong = pos.side === 'long';
    // TP hit
    if(pos.tpPrice > 0 && ((isLong && currentPrice >= pos.tpPrice) || (!isLong && currentPrice <= pos.tpPrice))){
      showToast('TP Hit! '+pos.pair.replace('USDT',''), 'success');
      tpClosePosition(pos.id);
      return;
    }
    // SL hit
    if(pos.slPrice > 0 && ((isLong && currentPrice <= pos.slPrice) || (!isLong && currentPrice >= pos.slPrice))){
      showToast('SL Hit! '+pos.pair.replace('USDT',''), 'error');
      tpClosePosition(pos.id);
      return;
    }
    // Liq hit
    if(pos.liqPrice && ((isLong && currentPrice <= pos.liqPrice) || (!isLong && currentPrice >= pos.liqPrice))){
      showToast('Liquidated! '+pos.pair.replace('USDT',''), 'error');
      const isCross = pos.marginMode === 'cross' && pos.marketType !== 'spot';
      const margin  = pos.initialMargin || pos.size / pos.leverage;
      if(isCross){
        // Cross liq: insurance fund absorbs, balance takes the hit of margin + unrealized loss
        const liqLoss = margin + tpCalcPnL(pos, currentPrice);
        TP_STATE.balance = Math.max(0, TP_STATE.balance + liqLoss);
      } else {
        // Isolated liq: return 0 (margin fully lost), insurance keeps 0.5%
        const maintMargin = margin * 0.005;
        TP_STATE.balance += maintMargin;
      }
      const idx = TP_STATE.positions.findIndex(p=>p.id===pos.id);
      if(idx!==-1){
        TP_STATE.history.unshift({...pos, exitPrice: currentPrice, pnl: -(margin * 0.995), fee:0, liquidated:true, closedAt:Date.now()});
        TP_STATE.positions.splice(idx,1);
      }
      tpSaveState(); tpUpdateUI(); tpRenderPositions(); tpRenderHistory();
    }
  });
}

// Update UI — account summary bar
function tpUpdateUI() {
  let unrealizedPnl   = 0;
  let totalFunding    = 0;
  let isolatedMargin  = 0;
  let crossMargin     = 0;
  let allPricesKnown  = true;

  TP_STATE.positions.forEach(pos => {
    const price = TP_STATE.prices[pos.pair]?.price;
    if(!price){ allPricesKnown = false; return; }
    const pnl     = tpCalcPnL(pos, price);
    const funding = tpCalcFunding(pos);
    unrealizedPnl += pnl;
    totalFunding  += funding;
    const margin = pos.initialMargin || pos.size / pos.leverage;
    if(pos.marginMode === 'cross' && pos.marketType !== 'spot'){
      crossMargin += margin;
    } else {
      isolatedMargin += margin;
    }
  });

  if(!allPricesKnown && TP_STATE.positions.length > 0) return;

  // Isolated: margin deducted from balance on open, so add it back for equity
  // Cross: margin stays IN balance (never deducted), so don't add it again
  const totalEquity = TP_STATE.balance + isolatedMargin + unrealizedPnl + totalFunding;
  const totalPnl    = totalEquity - TP_STATE.startBalance;
  const pnlPct      = (totalPnl / TP_STATE.startBalance) * 100;

  const balEl = document.getElementById('tp-balance');
  const pnlEl = document.getElementById('tp-pnl');
  if(balEl){ const v='$'+totalEquity.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); if(balEl.textContent!==v) balEl.textContent=v; }
  if(pnlEl){
    const isUp = totalPnl >= 0;
    const v = (isUp?'+':'')+'$'+totalPnl.toFixed(2)+' ('+(isUp?'+':'')+pnlPct.toFixed(2)+'%)';
    if(pnlEl.textContent!==v){ pnlEl.textContent=v; pnlEl.className='tp-balance-pnl '+(isUp?'up':'down'); }
  }
  document.getElementById('tp-pos-count').textContent = TP_STATE.positions.length;
  tpUpdateSubmitButton();
}

// Render positions — full CEX card with margin, liq, ROE, funding
function tpRenderPositions() {
  const container = document.getElementById('tp-positions');
  if (!container) return;
  const countEl = document.getElementById('tp-pos-count');
  if(countEl) countEl.textContent = TP_STATE.positions.length;

  if (TP_STATE.positions.length === 0) {
    container.innerHTML = '<div class="tp-empty"><div class="tp-empty-icon">📭</div><div class="tp-empty-text">No open positions</div></div>';
    return;
  }

  container.innerHTML = TP_STATE.positions.map(pos => {
    const currentPrice = TP_STATE.prices[pos.pair]?.price || pos.entryPrice;
    const pnl       = tpCalcPnL(pos, currentPrice);
    const funding   = tpCalcFunding(pos);
    const netPnl    = pnl + funding;
    const roe       = tpCalcROE(pos, currentPrice);
    const isUp      = netPnl >= 0;
    const isSpot    = pos.marketType === 'spot' || pos.leverage <= 1;
    const margin    = pos.initialMargin || pos.size/pos.leverage;
    const liqP      = pos.liqPrice;
    const fees      = tpGetFees(pos.exchange, pos.marketType, 'market');
    const closeFee  = pos.size * (fees.taker/100);
    const pairShort = pos.pair.replace('USDT','');
    const durMs     = Date.now() - pos.openedAt;
    const durStr    = durMs < 3600000 ? Math.floor(durMs/60000)+'m' : durMs < 86400000 ? Math.floor(durMs/3600000)+'h' : Math.floor(durMs/86400000)+'d';
    const fundingRate = TP_STATE.fundingRates[pos.pair] ?? CEX_FEES[TP_STATE.exchange]?.defaultFunding ?? 0.01;

    return `<div class="tp-position-card" data-id="${pos.id}" onclick="tpJumpTo('${pos.pair}','${pos.exchange||TP_STATE.exchange}','${pos.marketType||'perpetual'}')">
      <div class="tp-pos-row1">
        <div class="tp-pos-symbol">
          <span class="tp-pos-symbol-name">${pairShort}/USDT</span>
          ${isSpot
            ? '<span class="tp-pos-badge" style="background:#1a2a1a;color:#5ac">SPOT</span>'
            : `<span class="tp-pos-badge ${pos.side}">${pos.side.toUpperCase()}</span>
               <span class="tp-pos-badge lev">${pos.leverage}x</span>
               <span class="tp-pos-badge" style="background:#1a1a2a;color:#888;font-size:7px">${pos.marginMode||'cross'}</span>`}
          <span style="font-size:8px;color:#444;margin-left:2px">${durStr}</span>
        </div>
        <div class="tp-pos-pnl">
          <div class="tp-pos-pnl-value ${isUp?'up':'down'}">${isUp?'+':''}${fmtPrice(netPnl)}</div>
          <div class="tp-pos-pnl-percent" style="font-size:9px;color:${roe>=0?'#00c47a':'#e24b4a'}">ROE ${roe>=0?'+':''}${roe.toFixed(2)}%</div>
        </div>
      </div>

      <div class="tp-pos-row2" style="grid-template-columns:repeat(3,1fr)">
        <div class="tp-pos-stat">Size<span>$${pos.size.toLocaleString(undefined,{maximumFractionDigits:2})}</span></div>
        ${isSpot
          ? `<div class="tp-pos-stat">Qty<span>${(pos.size/pos.entryPrice).toFixed(6)}</span></div>`
          : `<div class="tp-pos-stat">Margin<span>$${margin.toFixed(2)}</span></div>`}
        <div class="tp-pos-stat">Entry<span>${fmtPrice(pos.entryPrice)}</span></div>
      </div>

      <div class="tp-pos-row2" style="grid-template-columns:repeat(3,1fr)">
        <div class="tp-pos-stat">Mark<span class="tp-pos-mark">${fmtPrice(currentPrice)}</span></div>
        ${isSpot
          ? `<div class="tp-pos-stat">Value<span>$${((pos.size/pos.entryPrice)*currentPrice).toFixed(2)}</span></div>`
          : `<div class="tp-pos-stat">Liq<span class="tp-pos-liq" style="color:#e24b4a">${liqP?fmtPrice(liqP):'n/a'}</span></div>`}
        <div class="tp-pos-stat">Fee to close<span style="color:#e24b4a">-${fmtPrice(closeFee)}</span></div>
      </div>

      ${!isSpot ? `
      <div style="display:flex;gap:8px;padding:4px 0;font-size:9px;color:#444;border-top:0.5px solid #1a1a1a;margin-top:4px">
        <span class="tp-pos-funding">${funding!==0?'Funding: '+(funding>=0?'+':'')+fmtPrice(funding):''}</span>
        <span style="margin-left:auto">Rate: ${fundingRate.toFixed(4)}% / 8h</span>
      </div>
      ${pos.tpPrice > 0 || pos.slPrice > 0 ? `
      <div class="tp-pos-row2" style="grid-template-columns:1fr 1fr;margin-top:4px;border-top:0.5px solid #1a1a1a;padding-top:4px">
        <div class="tp-pos-stat">TP<span style="color:#00c47a">${pos.tpPrice>0?fmtPrice(pos.tpPrice):'—'}</span></div>
        <div class="tp-pos-stat">SL<span style="color:#e24b4a">${pos.slPrice>0?fmtPrice(pos.slPrice):'—'}</span></div>
      </div>`:''}`:''}

      <div class="tp-pos-actions" style="margin-top:6px">
        ${!isSpot ? `
          <button onclick="event.stopPropagation();tpClosePosition('${pos.id}',25)" title="Close 25%">25%</button>
          <button onclick="event.stopPropagation();tpClosePosition('${pos.id}',50)" title="Close 50%">50%</button>
          <button onclick="event.stopPropagation();tpClosePosition('${pos.id}',75)" title="Close 75%">75%</button>
          <button onclick="event.stopPropagation();tpEditTpSl('${pos.id}')" title="Edit TP/SL">TP/SL</button>` : ''}
        <button onclick="event.stopPropagation();tpClosePosition('${pos.id}')" class="close">${isSpot?'Sell All':'Close'}</button>
        <button onclick="event.stopPropagation();tpSharePosition('${pos.id}')" title="Share P&L">share</button>
      </div>
    </div>`;
  }).join('');
}

// Render history — full CEX trade record
function tpRenderHistory() {
  const container = document.getElementById('tp-history');
  if (!container) return;
  if (TP_STATE.history.length === 0) {
    container.innerHTML = '<div class="tp-empty"><div class="tp-empty-icon">📜</div><div class="tp-empty-text">No trade history</div></div>';
    return;
  }
  container.innerHTML = TP_STATE.history.slice(0,50).map(h => {
    const isUp   = h.pnl >= 0;
    const isSpot = h.marketType === 'spot' || h.leverage <= 1;
    const roe    = h.initialMargin > 0 ? (h.pnl / h.initialMargin * 100) : 0;
    const time   = new Date(h.closedAt).toLocaleString();
    const slipp  = h.slippage ? fmtPrice(h.slippage) : '—';
    return `<div class="tp-position-card" style="padding:8px 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div class="tp-pos-symbol" style="gap:4px">
          <span class="tp-pos-symbol-name" style="font-size:12px">${h.pair.replace('USDT','')}</span>
          ${isSpot
            ? '<span class="tp-pos-badge" style="background:#1a2a1a;color:#5ac;font-size:7px">SPOT</span>'
            : `<span class="tp-pos-badge ${h.side}" style="font-size:7px">${h.side.toUpperCase()}</span>
               <span class="tp-pos-badge lev" style="font-size:7px">${h.leverage}x</span>`}
          ${h.partial ? '<span class="tp-pos-badge" style="background:#1a1a2a;color:#88f;font-size:7px">PARTIAL '+h.pct+'%</span>' : ''}
          ${h.liquidated ? '<span class="tp-pos-badge" style="background:#2a0a0a;color:#f55;font-size:7px">LIQ</span>' : ''}
        </div>
        <div style="text-align:right">
          <div class="tp-pos-pnl-value ${isUp?'up':'down'}" style="font-size:13px">${isUp?'+':''}${fmtPrice(h.pnl)}</div>
          <div style="font-size:9px;color:${roe>=0?'#00c47a':'#e24b4a'}">ROE ${roe>=0?'+':''}${roe.toFixed(2)}%</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:9px;color:#555">
        <span>Entry: ${fmtPrice(h.entryPrice)}</span>
        <span>Exit: ${fmtPrice(h.exitPrice)}</span>
        <span>Size: $${(h.size||0).toFixed(2)}</span>
        <span>Fee: ${fmtPrice(h.fee||0)}</span>
        <span>Funding: ${fmtPrice(h.funding||0)}</span>
        <span style="color:#333">${new Date(h.closedAt).toLocaleTimeString()}</span>
      </div>
    </div>`;
  }).join('');
}

function tpUpdateStats() {
  const history = TP_STATE.history;
  const closed  = history.filter(h => !h.liquidated);
  const wins    = closed.filter(h => h.pnl > 0);
  const losses  = closed.filter(h => h.pnl < 0);
  const liqd    = history.filter(h => h.liquidated);

  const winRate    = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const totalProfit= wins.reduce((a,h)=>a+h.pnl, 0);
  const totalLoss  = Math.abs(losses.reduce((a,h)=>a+h.pnl, 0));
  const profitFactor = totalLoss > 0 ? totalProfit/totalLoss : totalProfit > 0 ? 999 : 0;
  const bestTrade  = history.length > 0 ? Math.max(...history.map(h=>h.pnl)) : 0;
  const worstTrade = history.length > 0 ? Math.min(...history.map(h=>h.pnl)) : 0;
  const avgWin     = wins.length > 0 ? totalProfit / wins.length : 0;
  const avgLoss    = losses.length > 0 ? totalLoss / losses.length : 0;
  const maxDD      = tpCalcMaxDrawdown();

  const set = (id, val, cls) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = val;
    if(cls) el.className = 'tp-stat-value '+cls;
  };

  set('tp-stat-total-trades', closed.length + liqd.length);
  set('tp-stat-win-rate',  winRate.toFixed(1)+'%', winRate>=50?'up':'down');
  set('tp-stat-total-profit', '+$'+totalProfit.toFixed(2));
  set('tp-stat-total-loss',   '-$'+totalLoss.toFixed(2));
  const bestEl = document.getElementById('tp-stat-best-trade');
  if(bestEl){ bestEl.textContent=(bestTrade>=0?'+':'')+fmtPrice(bestTrade); bestEl.className='tp-stat-value '+(bestTrade>=0?'up':'down'); }
  const worstEl = document.getElementById('tp-stat-worst-trade');
  if(worstEl){ worstEl.textContent=(worstTrade>=0?'+':'')+fmtPrice(worstTrade); worstEl.className='tp-stat-value '+(worstTrade>=0?'up':'down'); }
  set('tp-stat-avg-win',  '+$'+avgWin.toFixed(2));
  set('tp-stat-avg-loss', '-$'+avgLoss.toFixed(2));

  // extra CEX stats
  const pfEl = document.getElementById('tp-stat-profit-factor');
  if(pfEl) pfEl.textContent = profitFactor > 100 ? '∞' : profitFactor.toFixed(2);
  const ddEl = document.getElementById('tp-stat-max-dd');
  if(ddEl){ ddEl.textContent = '-$'+maxDD.toFixed(2); ddEl.className='tp-stat-value down'; }
  const feeEl = document.getElementById('tp-stat-fees');
  if(feeEl){ feeEl.textContent = '-$'+(TP_STATE.totalFeesPaid||0).toFixed(2); feeEl.className='tp-stat-value down'; }
  const liqEl = document.getElementById('tp-stat-liquidations');
  if(liqEl){ liqEl.textContent = liqd.length; liqEl.className='tp-stat-value '+(liqd.length>0?'down':''); }

  tpDrawPnLChart();
}

function tpCalcMaxDrawdown(){
  if(!TP_STATE.history.length) return 0;
  const series = [...TP_STATE.history].reverse();
  let running = 0, peak = 0, maxDD = 0;
  series.forEach(h => {
    running += h.pnl;
    if(running > peak) peak = running;
    const dd = peak - running;
    if(dd > maxDD) maxDD = dd;
  });
  return maxDD;
}

// Edit TP/SL for open position
function tpEditTpSl(id){
  const pos = TP_STATE.positions.find(p=>p.id===id);
  if(!pos) return;
  const currentPrice = TP_STATE.prices[pos.pair]?.price || pos.entryPrice;
  const isLong = pos.side === 'long';
  const suggestTp = isLong ? currentPrice * 1.05 : currentPrice * 0.95;
  const suggestSl = isLong ? currentPrice * 0.97 : currentPrice * 1.03;
  showConfirm({
    icon:'🎯',type:'info',title:'Edit TP/SL — '+pos.pair.replace('USDT',''),
    message:`<div style="font-size:11px;margin-bottom:8px;color:#888">Current price: ${fmtPrice(currentPrice)} | Entry: ${fmtPrice(pos.entryPrice)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label style="font-size:9px;color:#00c47a;display:block;margin-bottom:4px">TAKE PROFIT ($)</label>
          <input id="edit-tp" type="number" value="${pos.tpPrice||suggestTp.toFixed(2)}" style="width:100%;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px"></div>
        <div><label style="font-size:9px;color:#e24b4a;display:block;margin-bottom:4px">STOP LOSS ($)</label>
          <input id="edit-sl" type="number" value="${pos.slPrice||suggestSl.toFixed(2)}" style="width:100%;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px"></div>
      </div>`,
    confirmText:'Update',cancelText:'Cancel'
  }).then(ok=>{
    if(!ok) return;
    const newTp = parseFloat(document.getElementById('edit-tp')?.value)||0;
    const newSl = parseFloat(document.getElementById('edit-sl')?.value)||0;
    pos.tpPrice = newTp; pos.slPrice = newSl;
    tpSaveState(); tpRenderPositions();
    showToast('TP/SL updated for '+pos.pair.replace('USDT',''),'success');
  });
}


// ── RESTORED: tpFillPrice — click orderbook row to set limit price ──
function tpFillPrice(price){
  const limitEl = document.getElementById('tp-limit-price');
  const stopEl  = document.getElementById('tp-stop-price');
  if(TP_STATE.orderType === 'limit' && limitEl){
    limitEl.value = price;
    tpCalculate();
    showToast('Price set: '+fmtPrice(price), 'info', 1500);
  } else if(TP_STATE.orderType === 'stop' && stopEl){
    stopEl.value = price;
    tpCalculate();
    showToast('Stop price set: '+fmtPrice(price), 'info', 1500);
  } else {
    tpSetOrderType('limit');
    const limitEl2 = document.getElementById('tp-limit-price');
    if(limitEl2){ 
      limitEl2.value = price; 
      tpCalculate(); 
      showToast('Limit price set: '+fmtPrice(price), 'info', 1500);
    }
  }
}

// ── RESTORED: tpPartialClose ──
function tpPartialClose(id, percent) {
  tpClosePosition(id, percent);
}

// ── RESTORED: tpShowTab ──
function tpShowTab(tab) {
  document.querySelectorAll('.tp-pos-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tp-tab-' + tab)?.classList.add('active');
  document.getElementById('tp-positions').style.display = tab === 'positions' ? 'flex' : 'none';
  document.getElementById('tp-orders').style.display    = tab === 'orders'    ? 'flex' : 'none';
  document.getElementById('tp-history').style.display   = tab === 'history'   ? 'flex' : 'none';
  document.getElementById('tp-stats').style.display     = tab === 'stats'     ? 'flex' : 'none';
  if (tab === 'stats')   tpUpdateStats();
  if (tab === 'orders')  tpRenderOrders();
  if (tab === 'history') tpRenderHistory();
}

// ── RESTORED: tpFetchPrices alias (already exists, just ensure tpSetSizePct works) ──
function tpSetSizePct(pct){
  const balance   = TP_STATE.balance;
  const isSpot    = TP_STATE.marketType === 'spot';
  const lev       = isSpot ? 1 : TP_STATE.leverage;
  const fees      = tpGetFees(TP_STATE.exchange, TP_STATE.marketType, TP_STATE.orderType);
  const maxUsable = balance * (1 - fees.active/100);
  const size      = Math.floor(maxUsable * (pct/100) * lev * 100) / 100;
  const sizeEl    = document.getElementById('tp-size');
  if(sizeEl){ sizeEl.value = (isSpot ? Math.floor(maxUsable * (pct/100) * 100)/100 : size); tpCalculate(); }
}


// Draw cumulative PnL chart
function tpDrawPnLChart() {
  const canvas = document.getElementById('tp-pnl-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.parentElement.clientWidth - 20;
  const height = 100;
  canvas.width = width;
  canvas.height = height;
  
  ctx.clearRect(0, 0, width, height);
  
  const history = [...TP_STATE.history].reverse(); // Oldest first
  if (history.length < 2) {
    ctx.fillStyle = '#333';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Need at least 2 trades', width / 2, height / 2);
    return;
  }
  
  // Calculate cumulative PnL
  let cumPnl = [0];
  let running = 0;
  history.forEach(h => {
    running += h.pnl;
    cumPnl.push(running);
  });
  
  const maxPnl = Math.max(...cumPnl);
  const minPnl = Math.min(...cumPnl);
  const range = maxPnl - minPnl || 1;
  const padding = 10;
  
  // Draw zero line
  const zeroY = height - padding - ((0 - minPnl) / range) * (height - padding * 2);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  ctx.lineTo(width, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw PnL line
  ctx.strokeStyle = cumPnl[cumPnl.length - 1] >= 0 ? '#00c47a' : '#E24B4A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  cumPnl.forEach((pnl, i) => {
    const x = (i / (cumPnl.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((pnl - minPnl) / range) * (height - padding * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Fill area
  ctx.lineTo(width - padding, zeroY);
  ctx.lineTo(padding, zeroY);
  ctx.closePath();
  ctx.fillStyle = cumPnl[cumPnl.length - 1] >= 0 ? 'rgba(0,196,122,0.1)' : 'rgba(226,75,74,0.1)';
  ctx.fill();
  
  // Draw current value
  const lastPnl = cumPnl[cumPnl.length - 1];
  ctx.fillStyle = lastPnl >= 0 ? '#00c47a' : '#E24B4A';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText((lastPnl >= 0 ? '+' : '') + '$' + lastPnl.toFixed(2), width - padding, 15);
}

// Chart controls
function tpSetTimeframe(tf) {
  TP_STATE.timeframe = tf;
  // TradingView handles its own timeframe via its toolbar
}

function tpSetChartType(type) {
  TP_STATE.chartType = type;
  // TradingView handles chart type via its toolbar
}

// Toggle indicators
function tpToggleIndicator(indicator, btn) {
  // TradingView handles indicators via its built-in toolbar
}

// Reset account
async function tpResetAccount() {
  const confirmed = await confirmReset('paper account');
  if (!confirmed) return;
  TP_STATE = {
    ...TP_STATE,
    balance: 10000,
    startBalance: 10000,
    positions: [],
    history: [],
    pendingOrders: []
  };
  tpSaveState();
  tpUpdateUI();
  tpRenderPositions();
  tpRenderHistory();
  showToast('Paper account reset!', 'success');
}

// Market type toggle (Spot / Perpetual)
function tpSetMarketType(type) {
  TP_STATE.marketType = type;
  document.querySelectorAll('.tp-market-type button').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  tpUpdateFeeBadge();
  const mmRow = document.getElementById('tp-margin-mode-row');
  if(mmRow) mmRow.style.display = type==='spot' ? 'none' : 'flex';
  
  const isSpot = type === 'spot';
  const leverageRow = document.getElementById('tp-leverage-row');
  const tpslRow = document.getElementById('tp-tpsl-row');
  const marginRow = document.getElementById('tp-sum-margin-row');
  const liqRow = document.getElementById('tp-sum-liq-row');
  const tpRow = document.getElementById('tp-sum-tp-row');
  const slRow = document.getElementById('tp-sum-sl-row');
  const longBtn = document.getElementById('tp-side-long');
  const shortBtn = document.getElementById('tp-side-short');
  
  // Show/hide perpetual-only elements
  if (leverageRow) leverageRow.style.display = isSpot ? 'none' : 'flex';
  if (tpslRow) tpslRow.style.display = isSpot ? 'none' : 'flex';
  if (marginRow) marginRow.style.display = isSpot ? 'none' : 'flex';
  if (liqRow) liqRow.style.display = isSpot ? 'none' : 'flex';
  if (tpRow) tpRow.style.display = isSpot ? 'none' : 'flex';
  if (slRow) slRow.style.display = isSpot ? 'none' : 'flex';
  
  // Update button labels - show both Buy/Sell in spot mode
  if (longBtn) longBtn.textContent = isSpot ? 'Buy' : 'Long';
  if (shortBtn) {
    shortBtn.textContent = isSpot ? 'Sell' : 'Short';
    shortBtn.style.display = 'block'; // Always show
  }
  
  // Update exchange label
  document.getElementById('tp-pair-exchange').textContent = `${isSpot ? 'spot' : 'perpetual'} · ${TP_STATE.exchange}`;
  
  // Update submit button text
  tpUpdateSubmitButton();
  
  // Re-render positions filtered by market type
  tpRenderPositions();
  tpRenderHistory();
  
  tpCalculate();
  tpSaveState();
  // full restart — spot/perp use different WS streams and REST endpoints
  _obReset();
  _tpTrades = [];
  if(typeof tpStartWebSocket==='function') tpStartWebSocket();
  if(typeof tpInitTVChart==='function') tpInitTVChart();
  if(_tpObMode==='trades' && typeof tpStartTradeWS==='function') tpStartTradeWS();
}

// ── CEX STANDARD: MARGIN MODE TOGGLE ──
function tpSetMarginMode(mode){
  TP_STATE.marginMode = mode;
  const crossBtn = document.getElementById('tp-mm-cross');
  const isoBtn   = document.getElementById('tp-mm-iso');
  if(crossBtn){ crossBtn.style.borderColor = mode==='cross'?'#00c47a':'#1a1a1a'; crossBtn.style.background = mode==='cross'?'#0a2a1a':'transparent'; crossBtn.style.color = mode==='cross'?'#00c47a':'#555'; }
  if(isoBtn)  { isoBtn.style.borderColor = mode==='isolated'?'#5b7fff':'#1a1a1a'; isoBtn.style.background = mode==='isolated'?'#0a0a2a':'transparent'; isoBtn.style.color = mode==='isolated'?'#5b7fff':'#555'; }
  tpCalculate();
  tpSaveState();
  showToast(mode==='isolated'?'Isolated margin — only this position can be liquidated':'Cross margin — whole account is collateral','info',2000);
}

// ── CEX STANDARD: UPDATE FEE BADGE ──
function tpUpdateFeeBadge(){
  const badge = document.getElementById('tp-fee-badge');
  if(!badge) return;
  const fees = tpGetFees(TP_STATE.exchange, TP_STATE.marketType, TP_STATE.orderType);
  badge.textContent = (fees.isMaker?'Maker':'Taker')+' '+fees.active.toFixed(3)+'%';
  badge.style.color = fees.isMaker ? '#00c47a' : '#EF9F27';
  badge.style.background = fees.isMaker ? '#0a2a1a' : '#1a1200';
  badge.style.borderColor = fees.isMaker ? '#004d30' : '#3a3000';
}


// Update submit button based on mode and side
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

// Order type with stop order support
function tpSetOrderType(type) {
  TP_STATE.orderType = type;
  document.querySelectorAll('.tp-order-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  tpUpdateFeeBadge();
  
  document.getElementById('tp-limit-price-group').style.display = (type === 'limit' || type === 'stop') ? 'block' : 'none';
  document.getElementById('tp-stop-price-group').style.display = type === 'stop' ? 'block' : 'none';
}

// Generate and render order book
// Click order book row to fill price


// Fetch real order book from Binance
async function tpFetchOrderBook() {
  try {
    const symbol = TP_STATE.pair;
    const ex = TP_STATE.exchange || 'binance';
    const isSpot = TP_STATE.marketType === 'spot';
    let url, data, asks, bids;

    if(ex === 'binance'){
      if(isSpot){
        url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=10`;
        data = await fetch(url).then(r=>r.json());
        asks = data.asks; bids = data.bids;
      } else {
        url = `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=10`;
        data = await fetch(url).then(r=>r.json());
        asks = data.asks; bids = data.bids;
      }
    } else if(ex === 'bybit'){
      const cat = isSpot ? 'spot' : 'linear';
      url = `https://api.bybit.com/v5/market/orderbook?category=${cat}&symbol=${symbol}&limit=10`;
      data = await fetch(url).then(r=>r.json());
      asks = data.result?.a; bids = data.result?.b;
    } else if(ex === 'okx'){
      const instId = isSpot
        ? symbol.replace('USDT','-USDT')
        : symbol.replace('USDT','-USDT-SWAP');
      url = `https://www.okx.com/api/v5/market/books?instId=${instId}&sz=10`;
      data = await fetch(url).then(r=>r.json());
      const book = data.data?.[0];
      asks = book?.asks?.map(a=>[a[0],a[1]]);
      bids = book?.bids?.map(b=>[b[0],b[1]]);
    } else {
      // fallback to binance spot
      url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=10`;
      data = await fetch(url).then(r=>r.json());
      asks = data.asks; bids = data.bids;
    }

    if(asks && bids) {
      tpRenderOrderBookData(asks, bids);
    }
  } catch(e) {
    tpRenderOrderBook();
  }
}

var _obPrevMidPrice = 0;
var _obPending = null;
var _obRAF = null;

function tpRenderOrderBookData(asks, bids){
  _obPending = {asks, bids};
  if(!_obRAF) _obRAF = requestAnimationFrame(()=>{
    _obRAF = null;
    if(!_obPending) return;
    const {asks,bids} = _obPending;
    _obPending = null;
    _tpRenderOBData(asks, bids);
  });
}

function _tpRenderOBData(asks, bids) {
  const asksContainer = document.getElementById('tp-ob-asks');
  const bidsContainer = document.getElementById('tp-ob-bids');
  if (!asksContainer || !bidsContainer) return; // Guard: page not ready

  const priceEl = document.getElementById('tp-ob-price');
  const changeEl = document.getElementById('tp-ob-change');
  const spreadEl = document.getElementById('tp-ob-spread');
  
  const priceData = TP_STATE.prices[TP_STATE.pair] || {price:0,change:0};
  const fmtSize = (s) => s>=1000?(s/1000).toFixed(2)+'K':s.toFixed(3);
  const fmtUsdt = (v) => v>=1000000?(v/1000000).toFixed(2)+'M':v>=1000?(v/1000).toFixed(1)+'K':v.toFixed(0);
  const allSizes = [...asks,...bids].map(o=>parseFloat(o[1]));
  const maxSize = Math.max(...allSizes)||1;

  const mkRows = (rows, side) => rows.map(r=>{
    const p=parseFloat(r[0]), s=parseFloat(r[1]);
    const dep=Math.min((s/maxSize)*100,100);
    const pc=side==='asks'?'#e24b4a':'#00c47a';
    return `<div class="tp-ob-row ${side}" onclick="tpFillPrice(${p})" style="position:relative">` +
      `<span style="color:${pc};font-weight:700">${fmtPrice(p,false)}</span>` +
      `<span style="color:#888;text-align:right">${fmtSize(s)}</span>` +
      `<span style="color:#555;text-align:right">${fmtUsdt(p*s)}</span>` +
      `<div style="position:absolute;right:0;top:0;bottom:0;width:${dep}%;background:${pc};opacity:0.1;pointer-events:none"></div>` +
      `</div>`;
  }).join('');

  const topAsks = asks.slice(0,10).reverse();
  const topBids = bids.slice(0,10);
  asksContainer.innerHTML = mkRows(topAsks,'asks');
  bidsContainer.innerHTML = mkRows(topBids,'bids');

  const bestAsk = parseFloat(asks[0]?.[0]||0);
  const bestBid = parseFloat(bids[0]?.[0]||0);
  const midPrice = (bestAsk+bestBid)/2;
  const spread = bestAsk-bestBid;

  // store for limit order fill checks
  if(bestAsk > 0) TP_STATE.bestAsk = bestAsk;
  if(bestBid > 0) TP_STATE.bestBid = bestBid;

  if(priceEl){
    const newTxt = fmtPrice(midPrice);
    if(priceEl.textContent !== newTxt){
      priceEl.textContent = newTxt;
      if(_obPrevMidPrice && midPrice!==_obPrevMidPrice){
        priceEl.classList.remove('up','dn','ob-price-pulse');
        void priceEl.offsetWidth;
        priceEl.classList.add(midPrice>_obPrevMidPrice?'up':'dn','ob-price-pulse');
      }
    }
    _obPrevMidPrice = midPrice;
  }
  // change% is updated by ticker WS only, not OB render
  if(spreadEl){
    const pct = midPrice?((spread/midPrice)*100).toFixed(4):'0';
    spreadEl.textContent=`${fmtPrice(spread,false)} (${pct}%)`;
  }
}

function tpRenderOrderBook() {
  const asksContainer = document.getElementById('tp-ob-asks');
  const bidsContainer = document.getElementById('tp-ob-bids');
  const priceEl = document.getElementById('tp-ob-price');
  const changeEl = document.getElementById('tp-ob-change');
  const spreadEl = document.getElementById('tp-ob-spread');
  
  if (!asksContainer || !bidsContainer) return;
  
  const priceData = TP_STATE.prices[TP_STATE.pair] || { price: 69000, change: 0 };
  const price = priceData.price;
  const change = priceData.change;
  
  // Generate simulated order book data
  const spread = price * 0.0001; // 0.01% spread
  const asks = [];
  const bids = [];
  
  for (let i = 0; i < 8; i++) {
    const askPrice = price + spread/2 + (i * price * 0.0002 * (1 + Math.random() * 0.5));
    const bidPrice = price - spread/2 - (i * price * 0.0002 * (1 + Math.random() * 0.5));
    const askSize = (Math.random() * 2 + 0.1).toFixed(4);
    const bidSize = (Math.random() * 2 + 0.1).toFixed(4);
    asks.push({ price: askPrice, size: askSize, depth: Math.random() * 80 + 10 });
    bids.push({ price: bidPrice, size: bidSize, depth: Math.random() * 80 + 10 });
  }
  
  // Render asks (reversed so lowest ask is at bottom)
  asksContainer.innerHTML = asks.reverse().map(a => `
    <div class="tp-ob-row ask" onclick="tpFillPrice(${a.price})" title="Click to set limit price">
      <span class="price">${fmtPrice(a.price,false)}</span>
      <span class="size">${a.size}</span>
      <div class="depth" style="width:${a.depth}%"></div>
    </div>
  `).join('');
  
  // Render bids
  bidsContainer.innerHTML = bids.map(b => `
    <div class="tp-ob-row bid" onclick="tpFillPrice(${b.price})" title="Click to set limit price">
      <span class="price">${fmtPrice(b.price,false)}</span>
      <span class="size">${b.size}</span>
      <div class="depth" style="width:${b.depth}%"></div>
    </div>
  `).join('');
  
  // Update mid price
  if (priceEl) priceEl.textContent = '$' + price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (changeEl) {
    const isUp = change >= 0;
    changeEl.textContent = (isUp ? '+' : '') + change.toFixed(2) + '%';
    changeEl.className = 'tp-ob-mid-change ' + (isUp ? 'up' : 'down');
  }
  
  // Update spread
  if (spreadEl) {
    const spreadUsd = spread.toFixed(2);
    const spreadPercent = ((spread / price) * 100).toFixed(4);
    spreadEl.textContent = `$${spreadUsd} (${spreadPercent}%)`;
  }
}

// ── DEX SWAP PAGE ──
var _swState = {
  eco: 'evm',
  net: 'base',
  netIcon: '🔵',
  netName: 'Base',
  dex: 'Uniswap v3',
  gas: '~$0.01',
  netDesc: 'L2 · Coinbase backed · cheapest EVM · MetaMask',
  wallet: null,
  inSym: 'ETH', inIcon: 'Ξ', inImg: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png', inColor: '#627eea',
  outSym: 'USDC', outIcon: '$', outImg: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png', outColor: '#2775ca',
};

function openSwapPage(){
  try{history.replaceState({batt:'swap'},'','#swap');}catch(e){}
  document.title = 'BATT · DEX Swap';
  const hub = document.getElementById('trade-hub');
  if(hub){ hub.style.opacity='0'; hub.style.transform='scale(0.98)'; setTimeout(()=>{ hub.style.display='none'; hub.style.opacity=''; hub.style.transform=''; },300); }
  const pg = document.getElementById('swap-page');
  if(pg){
    pg.style.display='flex';
    requestAnimationFrame(()=>{ pg.style.opacity='1'; pg.style.transform='scale(1)'; });
  }
}

function closeSwapPage(){
  battNav('trade');
  document.title = 'BATT · Trade Hub';
  const pg = document.getElementById('swap-page');
  if(pg){ pg.style.opacity='0'; pg.style.transform='scale(0.98)'; setTimeout(()=>{ pg.style.display='none'; pg.style.opacity=''; pg.style.transform=''; },300); }
  const hub = document.getElementById('trade-hub');
  if(hub){
    hub.style.display='flex';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ hub.style.opacity='1'; hub.style.transform='scale(1)'; }));
  }
  mbnSetActive('trade');
}

function swSetEco(eco, btn){
  _swState.eco = eco;
  document.querySelectorAll('.sw-eco-tab').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on');
  ['evm','sol','sui','apt','ton'].forEach(e=>{
    const el = document.getElementById('sw-nets-'+e);
    if(el) el.style.display = e===eco ? '' : 'none';
  });
  // auto-select first network of that eco
  const firstBtn = document.querySelector('#sw-nets-'+eco+' .sw-net-btn.on') || document.querySelector('#sw-nets-'+eco+' .sw-net-btn');
  if(firstBtn) firstBtn.click();
}

function swSetNet(net, btn, icon, name, dex, gas, desc){
  _swState.net=net; _swState.netIcon=icon; _swState.netName=name;
  _swState.dex=dex; _swState.gas=gas; _swState.netDesc=desc;
  // clear all active in current eco panel
  const panel = document.getElementById('sw-nets-'+_swState.eco);
  if(panel) panel.querySelectorAll('.sw-net-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  // update info bar
  const ni = document.getElementById('sw-ni-icon'); if(ni){ const src=BATT_ICONS[net]; ni.innerHTML=src?`<img src="${src}" style="width:24px;height:24px;border-radius:50%" alt="${name}">`:`<span style="font-size:18px">${icon}</span>`; }
  const nn = document.getElementById('sw-ni-name'); if(nn){ const _dSrc=DEX_LOGOS[dex]; nn.innerHTML=`${name} · ${_dSrc?`<img src="${_dSrc}" width="12" height="12" style="border-radius:50%;vertical-align:middle;margin-right:2px" alt="">`:''}${dex}`; }
  const nd = document.getElementById('sw-ni-desc'); if(nd) nd.textContent=desc;
  const nf = document.getElementById('sw-ni-fee'); if(nf) nf.textContent=gas;
  // update route display
  const rd = document.getElementById('sw-route-dex'); if(rd){ const _dSrc=DEX_LOGOS[dex]; rd.innerHTML=_dSrc?`<img src="${_dSrc}" width="12" height="12" style="border-radius:50%;vertical-align:middle;margin-right:3px" alt="">${dex}`:dex; }
  const rg = document.getElementById('sw-gas'); if(rg) rg.textContent=gas;
  swUpdateQuote();
}

function swConnectWallet(){
  if(_swState.wallet){
    _swState.wallet=null;
    const dot=document.getElementById('sw-wallet-dot'); if(dot){dot.classList.remove('on');}
    const addr=document.getElementById('sw-wallet-addr'); if(addr) addr.textContent='not connected';
    const btn=document.getElementById('sw-wallet-btn'); if(btn){btn.textContent='connect wallet';}
    const mb=document.getElementById('sw-main-btn'); if(mb){mb.textContent='connect wallet to swap';mb.className='sw-btn connect';}
    return;
  }
  if(typeof window.ethereum !== 'undefined'){
    window.ethereum.request({method:'eth_requestAccounts'}).then(accounts=>{
      if(accounts[0]){
        _swState.wallet=accounts[0];
        const short=accounts[0].slice(0,6)+'...'+accounts[0].slice(-4);
        const dot=document.getElementById('sw-wallet-dot'); if(dot) dot.classList.add('on');
        const addr=document.getElementById('sw-wallet-addr'); if(addr) addr.textContent=short+' · MetaMask';
        const btn=document.getElementById('sw-wallet-btn'); if(btn) btn.textContent='disconnect';
        const mb=document.getElementById('sw-main-btn'); if(mb){mb.textContent='swap now';mb.className='sw-btn primary';}
        showToast('Wallet connected','success',2000);
        swUpdateQuote();
      }
    }).catch(()=>showToast('Connection rejected','error',2000));
  } else {
    showToast('No wallet detected — install MetaMask or Phantom','error',3000);
  }
}

function swOnAmtChange(){
  const amt=parseFloat(document.getElementById('sw-in-amt').value)||0;
  if(amt>0) swUpdateQuote();
}

function swUpdateQuote(){
  const amt=parseFloat(document.getElementById('sw-in-amt').value)||0;
  if(amt<=0){ document.getElementById('sw-route').style.display='none'; return; }
  // mock quote — will be replaced with real API call
  const mockRate=2111;
  const out=(amt*mockRate*(1-0.001)).toFixed(2);
  const fee=(amt*mockRate*0.001).toFixed(2);
  const outEl=document.getElementById('sw-out-amt'); if(outEl) outEl.value=out;
  const inUsd=document.getElementById('sw-in-usd'); if(inUsd) inUsd.textContent='≈ $'+(amt*mockRate).toFixed(2);
  const outUsd=document.getElementById('sw-out-usd'); if(outUsd) outUsd.textContent='≈ $'+out;
  const rateEl=document.getElementById('sw-rate'); if(rateEl) rateEl.textContent='1 '+_swState.inSym+' = '+mockRate+' '+_swState.outSym;
  const impEl=document.getElementById('sw-impact'); if(impEl){ impEl.textContent='0.01% — excellent'; impEl.className='sw-rv good'; }
  const feeEl=document.getElementById('sw-fee'); if(feeEl) feeEl.textContent='$'+fee;
  const riEl=document.getElementById('sw-route-in'); if(riEl) riEl.textContent=_swState.inSym;
  const roEl=document.getElementById('sw-route-out'); if(roEl) roEl.textContent=_swState.outSym;
  document.getElementById('sw-route').style.display='';
}

function swFlip(){
  const tmpSym=_swState.inSym, tmpIcon=_swState.inIcon, tmpColor=_swState.inColor;
  _swState.inSym=_swState.outSym; _swState.inIcon=_swState.outIcon; _swState.inColor=_swState.outColor;
  _swState.outSym=tmpSym; _swState.outIcon=tmpIcon; _swState.outColor=tmpColor;
  const ii=document.getElementById('sw-in-icon'); if(ii&&_swState.inImg){ii.src=_swState.inImg;ii.alt=_swState.inSym;}
  const is=document.getElementById('sw-in-sym'); if(is) is.textContent=_swState.inSym;
  const oi=document.getElementById('sw-out-icon'); if(oi&&_swState.outImg){oi.src=_swState.outImg;oi.alt=_swState.outSym;}
  const os=document.getElementById('sw-out-sym'); if(os) os.textContent=_swState.outSym;
  swUpdateQuote();
}

function swPickToken(side){ showToast('Token picker coming soon','info',1500); }
function swSetMax(){ showToast('Connect wallet to use max','info',1500); }

function swMainAction(){
  if(!_swState.wallet){ swConnectWallet(); return; }
  showToast('Swap execution coming soon — wallet connected ✓','info',2500);
}

// ── END DEX SWAP ──

// Update tpSelectSide for spot/perpetual
var _origSelectSide = tpSelectSide;
tpSelectSide = function(side) {
  TP_STATE.side = side;
  document.getElementById('tp-side-long').classList.toggle('active', side === 'long');
  document.getElementById('tp-side-short').classList.toggle('active', side === 'short');
  tpUpdateSubmitButton();
  tpCalculate();
};

// ── PUSH NOTIFICATIONS ──
var _pushRegistration=null;

function pushPromptShow(){
  if(!('Notification' in window)||!('serviceWorker' in navigator))return;
  if(Notification.permission==='granted'||Notification.permission==='denied')return;
  if(localStorage.getItem('push_prompted'))return;
  
  setTimeout(()=>{
    const prompt=document.getElementById('push-prompt');
    if(prompt) prompt.classList.add('show');
  },5000);
}

function pushPromptLater(){
  const prompt=document.getElementById('push-prompt');
  if(prompt) prompt.classList.remove('show');
  localStorage.setItem('push_prompted',Date.now());
}

async function pushPromptEnable(){
  const prompt=document.getElementById('push-prompt');
  if(prompt) prompt.classList.remove('show');
  localStorage.setItem('push_prompted',Date.now());
  
  try{
    const permission=await Notification.requestPermission();
    if(permission==='granted'){
      showToast('Notifications enabled!','success');
      subscribeToPush();
    }else{
      showToast('Notifications blocked','info');
    }
  }catch(e){
    showToast('Could not enable notifications','error');
  }
}

async function subscribeToPush(){
  if(!('serviceWorker' in navigator))return;
  
  try{
    const reg=await navigator.serviceWorker.ready;
    _pushRegistration=reg;
    
    // For now, just local notifications
    // Full push requires VAPID keys + backend
    console.log('Push ready');
  }catch(e){
    console.error('Push subscription failed:',e);
  }
}

function sendLocalNotification(title,body,url='/'){
  if(Notification.permission!=='granted')return;
  
  const options={
    body,
    icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23000" width="100" height="100" rx="20"/><text y="65" x="50" text-anchor="middle" font-size="50" fill="%2300c47a">📊</text></svg>',
    badge:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23000" width="100" height="100" rx="20"/><text y="65" x="50" text-anchor="middle" font-size="50" fill="%2300c47a">📊</text></svg>',
    vibrate:[100,50,100],
    data:{url}
  };
  
  if(_pushRegistration){
    _pushRegistration.showNotification(title,options);
  }else{
    new Notification(title,options);
  }
}

// Check for shared preset in URL on load
function checkSharedPresetUrl(){
  const params=new URLSearchParams(window.location.search);
  const shareCode=params.get('p');
  if(shareCode){
    // Clean URL
    battNav('member');
    loadSharedPreset(shareCode);
  }
}

async function logActivity(action,details={}){
  if(!AUTH_TOKEN)return;
  try{
    // Get browser info
    const ua=navigator.userAgent;
    let browser='Unknown';
    if(ua.includes('Chrome')) browser='Chrome';
    else if(ua.includes('Firefox')) browser='Firefox';
    else if(ua.includes('Safari')) browser='Safari';
    else if(ua.includes('Edge')) browser='Edge';
    
    details.browser=browser;
    details.platform=navigator.platform||'Unknown';
    
    await fetch(AUTH_URL+'/activity/log',{
      method:'POST',
      headers:{'Authorization':'Bearer '+AUTH_TOKEN,'Content-Type':'application/json'},
      body:JSON.stringify({action,details})
    });
  }catch(e){/* silent fail */}
}

// ── LIVE CRYPTO PRICES ──
async function fetchLivePrices(){
  const container=document.getElementById('live-prices');
  if(!container)return;
  
  const coins=[
    {sym:'BTC',pair:'BTCUSDT',icon:'BTC'},
    {sym:'ETH',pair:'ETHUSDT',icon:'ETH'},
    {sym:'SOL',pair:'SOLUSDT',icon:'SOL'},
    {sym:'BNB',pair:'BNBUSDT',icon:'BNB'}
  ];
  
  // Helper to fetch with timeout
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
  
  try{
    // Fetch each ticker individually
    const results = await Promise.allSettled(coins.map(async c => {
      const r = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/24hr?symbol=${c.pair}`);
      return r.json();
    }));
    
    // Store BTC price globally for cockpit indicators
    const btcResult = results[0];
    if (btcResult.status === 'fulfilled' && btcResult.value?.lastPrice) {
      window.LIVE_BTC_PRICE = parseFloat(btcResult.value.lastPrice);
    }
    
    container.classList.remove('prices-loading');
    container.innerHTML=coins.map((c,i)=>{
      const result = results[i];
      const ticker = result.status === 'fulfilled' ? result.value : null;
      const price = parseFloat(ticker?.lastPrice)||0;
      const change = parseFloat(ticker?.priceChangePercent)||0;
      const isUp = change>=0;
      const priceStr = price > 0 ? fmtPrice(price) : '--';
      const changeStr = price > 0 ? ((isUp?'+':'')+change.toFixed(2)+'%') : '--';
      return `<div class="price-card">
        <div class="price-card-head">
          <span class="price-card-icon">${BATT_ICONS[c.icon]?`<img src="${BATT_ICONS[c.icon]}" width="18" height="18" style="border-radius:50%;object-fit:cover" alt="${c.sym}" onerror="this.style.display='none'">`:`${c.sym[0]}`}</span>
          <span class="price-card-sym">${c.sym}</span>
        </div>
        <div class="price-card-price">${priceStr}</div>
        <div class="price-card-change ${price > 0 ? (isUp?'up':'down') : ''}">${price > 0 ? `<span class="arrow">${isUp?'▲':'▼'}</span>` : ''}${changeStr}</div>
      </div>`;
    }).join('');
    
  }catch(e){
    // Silent fail - just show placeholder
    container.classList.remove('prices-loading');
    container.innerHTML=coins.map(c=>`<div class="price-card">
      <div class="price-card-head">
        <span class="price-card-icon">${BATT_ICONS[c.icon]?`<img src="${BATT_ICONS[c.icon]}" width="18" height="18" style="border-radius:50%;object-fit:cover" alt="${c.sym}" onerror="this.style.display='none'">`:`${c.sym[0]}`}</span>
        <span class="price-card-sym">${c.sym}</span>
      </div>
      <div class="price-card-price">--</div>
      <div class="price-card-change">--</div>
    </div>`).join('');
  }
}

// run on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async ()=>{
  // Check for shared preset in URL
  if(typeof checkSharedPresetUrl==='function') checkSharedPresetUrl();
  
  // Fetch live prices (with small delay for network init)
  setTimeout(fetchLivePrices, 500);
  // Refresh prices every 60 seconds
  if(window._livePriceInterval) clearInterval(window._livePriceInterval);
  window._livePriceInterval = setInterval(fetchLivePrices, 60000);
  
  // Check login streak
  if(typeof checkLoginStreak==='function') checkLoginStreak();
  
  const restored = await authRestoreSession();
  if(restored){
    // valid session — skip auth + layer1, go straight to layer3 (member area)
    const al=document.getElementById('auth-layer');
    if(al){al.classList.add('hidden');}
    const l1=document.getElementById('layer1');
    if(l1){l1.classList.add('hidden');}
    goLayer3();
    // restore to correct page on reload — covers cockpit, journal, account, trade, etc
    if(typeof battRestoreFromHash==='function') setTimeout(battRestoreFromHash,100);
    
    // Show push notification prompt after login
    if(typeof pushPromptShow==='function') pushPromptShow();
    
    // Check badges
    if(typeof checkBadges==='function') checkBadges();
  }
  // if not restored — show splash briefly then auto-proceed to auth
  if(!restored){
    setTimeout(()=>{ if(typeof goAuth==='function') goAuth(); }, 1200);
  }
});