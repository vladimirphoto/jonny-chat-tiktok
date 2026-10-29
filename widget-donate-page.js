'use strict';
// Страница виджета донатов (прозрачный фон). Показывает по одному донату: картинка в тему суммы, имя, сумма.
// Настройки и донаты приходят по SSE от приложения (как у виджета чата) и применяются на лету.
module.exports = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Донаты</title>
<style>
html,body{margin:0;background:transparent;overflow:hidden;font-family:"Segoe UI",Arial,sans-serif;height:100%}
#stage{position:fixed;inset:0;display:flex;padding:18px;box-sizing:border-box}
#stage.l{justify-content:flex-start}#stage.c{justify-content:center}#stage.r{justify-content:flex-end}
#stage.t{align-items:flex-start}#stage.m{align-items:center}#stage.b{align-items:flex-end}
.card{position:relative;display:flex;align-items:center;gap:18px;min-width:320px;max-width:560px;padding:16px 26px 16px 18px;border-radius:22px;color:#fff;
 background:linear-gradient(135deg,rgba(24,24,38,.94),rgba(40,22,36,.94));border:1px solid rgba(255,255,255,.14);
 box-shadow:0 10px 36px rgba(0,0,0,.55),0 0 0 2px var(--ac,#f14635),0 0 34px var(--ac,#f14635);
 animation:pop .55s cubic-bezier(.2,1.4,.4,1) both;box-sizing:border-box}
.card.out{animation:bye .45s ease-in both}
.art{flex:none;width:92px;height:92px;border-radius:50%;display:grid;place-items:center;font-size:54px;line-height:1;
 background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.28),rgba(255,255,255,.06));box-shadow:inset 0 0 0 2px rgba(255,255,255,.18);
 font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;animation:bob 1.8s ease-in-out infinite}
.tx{min-width:0}
.cap{font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.62)}
.nm{font-size:30px;font-weight:800;line-height:1.15;margin-top:2px;word-break:break-word}
.am{font-size:38px;font-weight:900;line-height:1.1;margin-top:2px;color:var(--ac,#f14635);text-shadow:0 0 18px color-mix(in srgb,var(--ac,#f14635) 55%,transparent)}
.ms{margin-top:6px;font-size:19px;line-height:1.3;color:rgba(255,255,255,.92);word-break:break-word}
.sp{position:absolute;left:50%;top:50%;width:8px;height:8px;border-radius:50%;background:var(--ac,#f14635);opacity:0;animation:spark 1.1s ease-out both}
@keyframes pop{from{opacity:0;transform:translateY(24px) scale(.82)}to{opacity:1;transform:none}}
@keyframes bye{to{opacity:0;transform:translateY(-14px) scale(.96)}}
@keyframes bob{50%{transform:translateY(-5px) rotate(-4deg)}}
@keyframes spark{0%{opacity:1;transform:translate(-50%,-50%)}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(.4)}}
</style></head><body>
<div id="nc" style="display:none;position:fixed;left:10px;top:10px;z-index:9999;background:rgba(0,0,0,.65);color:#fff;font:600 13px/1.3 'Segoe UI',Arial,sans-serif;padding:7px 12px;border-radius:999px">Нет связи с приложением ЭхоЧат — запустите его на этом компьютере</div>
<div id="stage" class="c b"></div>
<script>
var S={duration:8,scale:100,align:'center',vpos:'bottom',showMessage:true};
var stage=document.getElementById('stage');
// картинка в тему суммы (в тенге)
var TIERS=[
 {max:500,art:'\\u2615',cap:'Кофе',ac:'#f59e0b'},
 {max:2000,art:'\\ud83c\\udf55',cap:'Пицца',ac:'#fb7185'},
 {max:5000,art:'\\ud83c\\udf81',cap:'Подарок',ac:'#f14635'},
 {max:10000,art:'\\ud83d\\udc8e',cap:'Бриллиант',ac:'#22d3ee'},
 {max:Infinity,art:'\\ud83d\\ude80',cap:'Ракета',ac:'#a78bfa'}
];
function tierOf(a){for(var i=0;i<TIERS.length;i++)if(a<TIERS[i].max)return TIERS[i];return TIERS[TIERS.length-1];}
function fmt(n){return String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g,'\\u00a0')+'\\u00a0\\u20b8';}
function zoomOf(){return Math.max(40,Math.min(250,+S.scale||100))/100;}
function apply(){
  stage.className=({left:'l',center:'c',right:'r'}[S.align]||'c')+' '+({top:'t',center:'m',bottom:'b'}[S.vpos]||'b');
  var c=stage.firstChild;if(c&&c.style)c.style.zoom=zoomOf();
}
var queue=[],busy=false;
function sparks(card,ac){
  for(var i=0;i<14;i++){var s=document.createElement('i');s.className='sp';var a=Math.random()*6.283,d=70+Math.random()*90;
    s.style.setProperty('--x',Math.cos(a)*d+'px');s.style.setProperty('--y',Math.sin(a)*d+'px');s.style.animationDelay=(Math.random()*.25)+'s';card.appendChild(s);}
}
function show(d){
  var t=tierOf(+d.amount||0);
  var c=document.createElement('div');c.className='card';c.style.setProperty('--ac',t.ac);
  var a=document.createElement('div');a.className='art';a.textContent=t.art;
  var x=document.createElement('div');x.className='tx';
  var cap=document.createElement('div');cap.className='cap';cap.textContent='Донат · '+t.cap;
  var nm=document.createElement('div');nm.className='nm';nm.textContent=d.name||'Аноним';
  var am=document.createElement('div');am.className='am';am.textContent=fmt(+d.amount||0);
  x.appendChild(cap);x.appendChild(nm);x.appendChild(am);
  if(S.showMessage&&d.message){var m=document.createElement('div');m.className='ms';m.textContent=d.message;x.appendChild(m);}
  c.style.zoom=zoomOf();c.appendChild(a);c.appendChild(x);stage.innerHTML='';stage.appendChild(c);sparks(c,t.ac);
  var ms=Math.max(2,+S.duration||8)*1000;
  setTimeout(function(){c.classList.add('out');setTimeout(function(){c.remove();busy=false;next();},500);},ms);
}
function next(){if(busy||!queue.length)return;busy=true;show(queue.shift());}
function add(d){queue.push(d);if(queue.length>20)queue.shift();next();}
var Q=new URLSearchParams(location.search),FIXED=+Q.get('port')||0;
var REMOTE=!(/^(127\\.0\\.0\\.1|localhost)$/.test(location.hostname)&&!FIXED);
var PORTS=[];if(FIXED)PORTS=[FIXED];else for(var pp=7878;pp<=7898;pp++)PORTS.push(pp);
var nc=document.getElementById('nc'),ncT=null;
function offline(){if(REMOTE&&!ncT)ncT=setTimeout(function(){nc.style.display='block'},4000);}
function online(){clearTimeout(ncT);ncT=null;nc.style.display='none';}
var told=false;
function tellReady(){if(told)return;told=true;try{if(window.parent&&window.parent!==window)window.parent.postMessage({echochat:'donate-ready'},'*');}catch(_){}}
function bind(es){
  es.addEventListener('dsettings',function(e){S=Object.assign(S,JSON.parse(e.data));apply();tellReady();});
  es.addEventListener('donate',function(e){add(JSON.parse(e.data));});
  es.addEventListener('clear',function(){queue=[];});
}
function connect(){
  if(!REMOTE){bind(new EventSource('/events'));return;}
  var i=0;
  (function probe(){
    var port=PORTS[i%PORTS.length];i++;
    var es=new EventSource('http://127.0.0.1:'+port+'/events'),got=false,t;
    function fail(){if(got)return;clearTimeout(t);es.close();offline();setTimeout(probe,PORTS.length>1&&i%PORTS.length?30:2500);}
    t=setTimeout(fail,1500);
    es.addEventListener('settings',function(){if(!got){got=true;clearTimeout(t);online();}});
    es.onerror=function(){if(got)offline();else fail();};
    es.onopen=function(){if(got)online();};
    bind(es);
  })();
}
apply();connect();
</script></body></html>`;
