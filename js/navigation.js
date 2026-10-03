function goAuth(){
  // do NOT push #auth to history on page load — only update title
  document.title = 'BATT · Login';
  const l1=document.getElementById('layer1');if(!l1)return;
  const al=document.getElementById('auth-layer');
  // fade layer1 out
  l1.classList.add('out');
  setTimeout(()=>{
    l1.classList.add('hidden');
    // show auth layer
    if(al){
      al.classList.remove('hidden');
      requestAnimationFrame(()=>requestAnimationFrame(()=>{al.style.opacity='1';}));
    }
  },900);
}

function goLayer2(){
  const l2=document.getElementById('layer2');
  if(l2){
    l2.classList.remove('hidden','out');
    l2.style.opacity='0';
    // always reset launch button so it's clickable
    const lb=l2.querySelector('.launch-btn');
    if(lb){ lb.style.pointerEvents=''; lb.disabled=false; }
    requestAnimationFrame(()=>requestAnimationFrame(()=>{l2.style.opacity='1';}));
  }
}
// launchApp is defined in main script block

function showGuidePopup(){
  const p=document.getElementById('guide-popup');
  if(!p) return;
  // reset display in case it was hidden from a previous session
  p.style.display='';
  p.classList.remove('visible');
  // hide guest banner during guide popup so it doesn't interfere with spotlight positioning
  const guestBanner=document.getElementById('guest-mode-banner');
  if(guestBanner) guestBanner.style.display='none';
  // freeze ALL scroll and interaction while popup is showing
  document.body.style.overflow='hidden';
  document.documentElement.style.overflow='hidden';
  const pr=document.querySelector('.panel-right');
  if(pr) pr.style.overflow='hidden';
  const app=document.querySelector('.app');
  if(app) app.style.pointerEvents='none';
  // delay to let layout fully settle before spotlight positioning
  setTimeout(()=>{
    p.classList.add('visible');
    _spotlightGuideTab();
    window.addEventListener('resize',_onPopupResize);
  },600);
}

function _spotlightGuideTab(){
  const attempt=()=>{
    const vt=document.getElementById('vt');
    const btn=vt?vt.querySelector('.tb'):null;
    if(!btn){setTimeout(attempt,150);return;}

    // account for CSS zoom on html element
    const zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;

    const r=btn.getBoundingClientRect();
    const pad=10;
    // divide by zoom to get unscaled CSS pixel positions
    const cx=(r.left/zoom)-pad, cy=(r.top/zoom)-pad;
    const cw=(r.width/zoom)+pad*2, ch=(r.height/zoom)+pad*2;
    const W=window.innerWidth/zoom, H=window.innerHeight/zoom;

    // Position the 4 blur panels around the cutout
    const top=document.getElementById('bl-top');
    const bot=document.getElementById('bl-bot');
    const lft=document.getElementById('bl-lft');
    const rgt=document.getElementById('bl-rgt');
    if(top){top.style.cssText+=`;left:0;top:0;width:${W}px;height:${cy}px`;}
    if(bot){bot.style.cssText+=`;left:0;top:${cy+ch}px;width:${W}px;height:${H-(cy+ch)}px`;}
    if(lft){lft.style.cssText+=`;left:0;top:${cy}px;width:${cx}px;height:${ch}px`;}
    if(rgt){rgt.style.cssText+=`;left:${cx+cw}px;top:${cy}px;width:${W-(cx+cw)}px;height:${ch}px`;}

    // Show the 4 blur panels
    ['bl-top','bl-bot','bl-lft','bl-rgt'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){el.style.display='block';requestAnimationFrame(()=>el.classList.add('visible'));}
    });

    // Glow ring on the cutout
    const sl=document.getElementById('guide-spotlight');
    if(sl){
      sl.style.cssText=`display:block;left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px`;
      requestAnimationFrame(()=>sl.classList.add('visible'));
    }

    // Draw SVG arrow: start from popup bottom-center, curve down-left to OUTSIDE the guide tab
    requestAnimationFrame(()=>{
      const popup=document.querySelector('.popup-box');
      if(!popup) return;
      const pr=popup.getBoundingClientRect();
      // start: bottom-center of popup
      // start: bottom-LEFT of popup (avoids the okay button which is center/right)
      const sx=(pr.left/zoom)+24, sy=(pr.bottom/zoom)-2;
      // end: just outside bottom-right corner of guide tab
      const ex=cx+cw+6, ey=cy+ch-6;
      const svg=document.getElementById('popup-arrow-svg');
      if(!svg) return;
      svg.style.display='block';
      // cubic bezier: drop straight down, then sweep left-down to bottom-right corner
      const c1x=sx, c1y=sy+80;
      const c2x=ex+60, c2y=ey-40;
      svg.querySelector('path').setAttribute('d',`M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`);
      // arrowhead pointing toward the top-left corner
      const ang=Math.atan2(ey-c2y, ex-c2x);
      const al=13;
      const ax1=ex-al*Math.cos(ang-0.4), ay1=ey-al*Math.sin(ang-0.4);
      const ax2=ex-al*Math.cos(ang+0.4), ay2=ey-al*Math.sin(ang+0.4);
      svg.querySelector('polygon').setAttribute('points',`${ex},${ey} ${ax1},${ay1} ${ax2},${ay2}`);
      requestAnimationFrame(()=>svg.classList.add('visible'));
      // position "find me here" label ABOVE the guide tab, centered on it
      const lbl=document.getElementById('find-me-label');
      const txt=document.getElementById('find-me-txt');
      const isId=typeof LANG!=='undefined'&&LANG==='id';
      if(txt) txt.textContent=isId?'temukan aku di sini':'find me here';
      if(lbl){
        lbl.style.display='flex';
        lbl.style.alignItems='center';
        lbl.style.gap='0';
        // center above the guide tab
        lbl.style.left=(cx + cw/2 - 60)+'px';
        lbl.style.top=(cy - 28)+'px';
        requestAnimationFrame(()=>lbl.style.opacity='1');
      }
    });
  };
  attempt();
}

function dismissPopup(instant){
  const p=document.getElementById('guide-popup');
  const sl=document.getElementById('guide-spotlight');
  const svg=document.getElementById('popup-arrow-svg');
  const lbl=document.getElementById('find-me-label');
  // restore cockpit interaction
  document.body.style.overflow='hidden';
  document.documentElement.style.overflow='';
  const pr=document.querySelector('.panel-right');
  if(pr) pr.style.overflow='';
  const app=document.querySelector('.app');
  if(app) app.style.pointerEvents='';
  // restore guest banner if in guest mode
  if(window.BATT_GUEST){
    const guestBanner=document.getElementById('guest-mode-banner');
    if(guestBanner) guestBanner.style.display='flex';
  }
  window.removeEventListener('resize',_onPopupResize);

  if(instant){
    // back button dismiss — hide everything instantly, cockpit unfreezes immediately
    if(p){p.classList.remove('visible');p.style.display='none';}
    if(sl){sl.classList.remove('visible');sl.style.display='none';}
    if(svg){svg.classList.remove('visible');svg.style.display='none';}
    if(lbl){lbl.style.opacity='0';lbl.style.display='none';}
    ['bl-top','bl-bot','bl-lft','bl-rgt'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){el.classList.remove('visible');el.style.display='none';}
    });
  } else {
    // button dismiss — smooth fade out
    if(p){p.classList.remove('visible');setTimeout(()=>p.style.display='none',400);}
    if(sl){sl.classList.remove('visible');setTimeout(()=>{sl.style.display='none';},500);}
    if(svg){svg.classList.remove('visible');setTimeout(()=>{svg.style.display='none';},500);}
    if(lbl){lbl.style.opacity='0';setTimeout(()=>{lbl.style.display='none';},500);}
    ['bl-top','bl-bot','bl-lft','bl-rgt'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){el.classList.remove('visible');setTimeout(()=>{el.style.display='none';},500);}
    });
  }
}

function _onPopupResize(){
  // recalculate blur panels + spotlight + arrow on resize
  ['bl-top','bl-bot','bl-lft','bl-rgt'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.style.cssText='position:fixed;z-index:8880;background:rgba(0,0,0,0.52);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);display:block';}
  });
  const sl=document.getElementById('guide-spotlight');
  if(sl){sl.style.cssText='display:none';sl.classList.remove('visible');}
  const svg=document.getElementById('popup-arrow-svg');
  if(svg){svg.style.display='none';svg.classList.remove('visible');}
  const lbl=document.getElementById('find-me-label');
  if(lbl){lbl.style.opacity='0';}
  _spotlightGuideTab();
}