(function(){
  function cmnSetActive(tab){
    document.querySelectorAll('.cmn-btn').forEach(function(b){b.classList.remove('active');});
    var b=document.getElementById('cmn-'+tab);
    if(b) b.classList.add('active');
  }
  window.cmnGo=function(tab){
    if(tab==='cockpit'){cmnClose();cmnSetActive('cockpit');return;}
    var map={ctrl:'left-panel',trade:'trade-panel',presets:'panel-presets'};
    var src=document.getElementById(map[tab]);
    var cnt=document.getElementById('cockpit-mob-content');
    if(src&&cnt){
      cnt.innerHTML='';
      var cl=src.cloneNode(true);
      cl.removeAttribute('id');
      cl.style.cssText='display:block!important;width:100%!important;height:auto!important;position:static!important;border:none!important;min-width:0!important;max-width:none!important';
      cnt.appendChild(cl);
    }
    cmnSetActive(tab);
    var sheet=document.getElementById('cockpit-mob-sheet');
    var ov=document.getElementById('cockpit-mob-overlay');
    if(sheet){sheet.style.display='flex';sheet.classList.add('open');}
    if(ov) ov.classList.add('open');
  };
  window.cmnClose=function(){
    var sheet=document.getElementById('cockpit-mob-sheet');
    var ov=document.getElementById('cockpit-mob-overlay');
    if(sheet){sheet.classList.remove('open');sheet.style.display='none';}
    if(ov) ov.classList.remove('open');
    cmnSetActive('cockpit');
  };
  var handle=document.getElementById('cockpit-mob-handle');
  var sheet=document.getElementById('cockpit-mob-sheet');
  if(handle&&sheet){
    var sy=0,cy=0,drag=false;
    handle.addEventListener('touchstart',function(e){sy=e.touches[0].clientY;drag=true;},{passive:true});
    handle.addEventListener('touchmove',function(e){if(!drag)return;cy=e.touches[0].clientY-sy;if(cy>0)sheet.style.transform='translateY('+cy+'px)';},{passive:true});
    handle.addEventListener('touchend',function(){drag=false;if(cy>80)cmnClose();sheet.style.transform='';cy=0;});
  }
})();