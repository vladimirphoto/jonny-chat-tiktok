'use strict';
// Страница виджета чата (прозрачный фон, тень за текстом). Настройки приходят по SSE и применяются на лету.
module.exports = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Чат</title>
<style>
html,body{margin:0;background:transparent;overflow:hidden;font-family:"Segoe UI",Arial,sans-serif;height:100%}
#root{position:fixed;left:0;right:0;bottom:0;display:flex;flex-direction:column;justify-content:flex-end;gap:12px;padding:10px;box-sizing:border-box;overflow:hidden;transform-origin:bottom left}
.m{display:flex;align-items:flex-start;gap:9px;max-width:100%;color:#fff;font-size:20px;line-height:1.25;animation:in .25s ease-out;transition:opacity .6s}
.m.right{flex-direction:row-reverse;text-align:right;align-self:flex-end}
.m.out{opacity:0}
.av{width:38px;height:38px;border-radius:50%;flex:none;background:#6b7280 center/cover;display:grid;place-items:center;font-weight:700;font-size:16px}
.b{min-width:0;word-break:break-word}
.n{font-weight:700;display:flex;align-items:center;gap:6px}
.right .n{flex-direction:row-reverse}
.pi{width:18px;height:18px;flex:none}
.gift{display:flex;align-items:center;gap:6px;margin-top:2px}.right .gift{flex-direction:row-reverse}
.gift img{width:34px;height:34px}
.sh .n,.sh .t,.sh .gift{text-shadow:0 0 3px rgba(0,0,0,.95),0 1px 4px rgba(0,0,0,.9),0 2px 8px rgba(0,0,0,.8)}
.sh .av,.sh .pi{filter:drop-shadow(0 1px 3px rgba(0,0,0,.8))}
@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
</style></head><body class="sh">
<div id="wh" style="display:none;position:fixed;left:0;right:0;pointer-events:none;z-index:9999;box-sizing:border-box;border-top:2px solid rgba(139,92,246,.85);background:rgba(139,92,246,.07)"><div style="position:absolute;top:4px;left:50%;transform:translateX(-50%);background:rgba(139,92,246,.85);color:#fff;font:700 11px/1 sans-serif;padding:3px 8px;border-radius:6px;white-space:nowrap">граница чата</div></div><div id="root"></div>
<script>
var S={align:'split',icons:true,avatars:true,gifts:true,scale:100,height:100,fade:true,fadeSec:20,shadow:true};
var root=document.getElementById('root');
var TT='<svg class="pi" viewBox="0 0 24 24"><path fill="#fff" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9a7.3 7.3 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5z"/></svg>';
var TW='<svg class="pi" viewBox="0 0 24 24"><path fill="#a970ff" d="M4 2 2.5 6v14H8v2.5h3L13.5 20H18l3.5-3.5V2H4zm15.5 13-2.5 2.5h-4.5L10 20v-2.5H6V4h13.5v11zM16 7.5h-2v5h2v-5zm-5 0H9v5h2v-5z"/></svg>';
function applyPreviewHeight(on){
  var wh=document.getElementById('wh');
  if(!wh)return;
  var sc=Math.max(30,Math.min(300,+S.scale||100))/100;
  var hpct=Math.max(10,Math.min(100,+S.height||100));
  var px=window.innerHeight*hpct/100/sc;
  wh.style.display=on&&hpct<100?'block':'none';
  wh.style.top=(window.innerHeight-px)+'px';
  wh.style.bottom='0';
  wh.style.height=px+'px';
}
function apply(){
  document.body.className=S.shadow?'sh':'';
  var sc=Math.max(30,Math.min(300,+S.scale||100))/100;
  root.style.transform='scale('+sc+')';
  root.style.width=(100/sc)+'%';
  root.style.height=(Math.max(10,Math.min(100,+S.height||100))/sc)+'vh';
  root.style.maxHeight=(100/sc)+'vh';
  Array.prototype.forEach.call(root.children,restyle);
  applyPreviewHeight(S._previewHeight);
}
function sideOf(m){return S.align==='right'?'right':S.align==='split'&&m.dataset.p==='twitch'?'right':'left';}
function restyle(m){
  m.className='m '+sideOf(m);
  var a=m.querySelector('.av'),pi=m.querySelector('.pi'),g=m.querySelector('.gift');
  if(a)a.style.display=S.avatars?'':'none';
  if(pi)pi.style.display=S.icons?'':'none';
  if(g)g.style.display=S.gifts?'':'none';
}
function add(d){
  var m=document.createElement('div');m.dataset.p=d.platform;
  var av=document.createElement('div');av.className='av';
  if(d.avatar)av.style.backgroundImage='url("'+d.avatar.replace(/"/g,'%22')+'")';
  else{av.textContent=(d.name||'?')[0].toUpperCase();av.style.background=d.color||'#6b7280';}
  var b=document.createElement('div');b.className='b';
  var n=document.createElement('div');n.className='n';
  n.insertAdjacentHTML('beforeend',d.platform==='twitch'?TW:TT);
  var nm=document.createElement('span');nm.textContent=d.name;nm.style.color=d.color||'#fff';n.appendChild(nm);
  b.appendChild(n);
  if(d.text){var t=document.createElement('div');t.className='t';t.textContent=d.text;b.appendChild(t);}
  if(d.gift){var g=document.createElement('div');g.className='gift';
    if(d.gift.image){var im=document.createElement('img');im.src=d.gift.image;g.appendChild(im);}
    var gt=document.createElement('span');gt.textContent='🎁 '+d.gift.name+' ×'+d.gift.count;g.appendChild(gt);b.appendChild(g);}
  m.appendChild(av);m.appendChild(b);root.appendChild(m);restyle(m);
  while(root.children.length>40)root.firstChild.remove();
  if(S.fade){var ms=Math.max(2,+S.fadeSec||20)*1000;setTimeout(function(){m.classList.add('out');setTimeout(function(){m.remove()},700)},ms);}
}
function connect(){
  var es=new EventSource('/events');
  es.addEventListener('settings',function(e){var d=JSON.parse(e.data);var prev=d._previewHeight;delete d._previewHeight;S=Object.assign(S,d);apply();applyPreviewHeight(prev);});
  es.addEventListener('msg',function(e){add(JSON.parse(e.data));});
  es.addEventListener('clear',function(){root.innerHTML='';});
}
apply();connect();
</script></body></html>`;
