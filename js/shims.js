// localStorage safety shim — silently falls back to in-memory if blocked (private mode etc)
(function(){
  try{ localStorage.getItem('__batt_test__'); }
  catch(e){
    var _mem={};
    window.localStorage={
      getItem:function(k){return _mem.hasOwnProperty(k)?_mem[k]:null;},
      setItem:function(k,v){_mem[k]=String(v);},
      removeItem:function(k){delete _mem[k];},
      clear:function(){_mem={};},
      key:function(i){return Object.keys(_mem)[i]||null;},
      get length(){return Object.keys(_mem).length;}
    };
  }
})();

// Safe JSON parse helper — returns fallback instead of throwing on bad data
function _safeJSON(str, fallback){
  if(str===null||str===undefined) return fallback;
  try{ return JSON.parse(str); }
  catch(e){ return fallback; }
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}
// Dark mode auto-detect
if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
  document.documentElement.setAttribute('data-system-theme','dark');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{
  document.documentElement.setAttribute('data-system-theme',e.matches?'dark':'light');
});