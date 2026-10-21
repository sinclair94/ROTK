/* people.html：把事件详解从「首屏全量加载」改为「按批次按需加载」 */
const fs = require('fs');
const F = 'people.html';
let s = fs.readFileSync(F, 'utf8');

/* 第一步：15 个详解脚本改为 data-src（浏览器不会自动请求），并插入索引脚本 */
s = s.replace(/<script src="(data-detail-\d\d\.js)"><\/script>/g, '<script data-src="$1"></script>');
if (!/<script src="data-detail-index\.js"><\/script>/.test(s)) {
  s = s.replace(/<script data-src="data-detail-01\.js"><\/script>/,
    '<script src="data-detail-index.js"></script>\n' +
    '<!-- 事件详解改为按需加载：data-src 不会被浏览器自动请求，由页面按人物所属批次动态注入。\n' +
    '     打包离线版时 _bundle.js 会把这 15 个 data-src 内联进单文件，离线版仍带完整详解。 -->\n' +
    '<script data-src="data-detail-01.js"></script>');
}

const START = '    document.getElementById("m-desc").textContent=p.g;\n    var ev="";';
const END = '    document.getElementById("m-events").innerHTML=ev;\n    mask.classList.add("show");\n  }';

const i = s.indexOf(START), j = s.indexOf(END);
if (i < 0 || j < 0) { console.error('锚点未找到 i=' + i + ' j=' + j); process.exit(1); }

const NEW =
`    document.getElementById("m-desc").textContent=p.g;
    curP=p;
    document.getElementById("m-events").innerHTML=buildEvents(p);
    mask.classList.add("show");
    /* 详解按需加载：命中索引才取对应分片；取到后若弹窗仍开着，重绘事件区补上详解 */
    ensureDetail(p.n,function(){ if(curP===p) document.getElementById("m-events").innerHTML=buildEvents(p); });
  }`;

/* 在 openPerson 之前插入加载器 */
const ANCHOR = '  // 详情弹窗\n  var mask=document.getElementById("mask");\n';
if (s.indexOf(ANCHOR) < 0) { console.error('openPerson 锚点未找到'); process.exit(1); }

const LOADER =
`  /* ---------- 事件详解：按批次按需加载（首屏不再下载 380KB 详解） ---------- */
  var curP=null, dBatch={}, dWait={};
  function loadBatch(b,cb){
    if(dBatch[b]){ cb(); return; }
    if(dWait[b]){ dWait[b].push(cb); return; }
    dWait[b]=[cb];
    var s=document.createElement("script");
    s.src="data-detail-"+(b<10?"0":"")+b+".js";
    function done(){ dBatch[b]=1; var q=dWait[b]||[]; dWait[b]=null; q.forEach(function(f){try{f();}catch(e){}}); }
    s.onload=done; s.onerror=done;   /* 取失败也要放行，退回只显示事件标题 */
    document.head.appendChild(s);
  }
  function ensureDetail(name,cb){
    var D=window.PEOPLE_DETAIL;
    if(D&&D[name]){ cb(); return; }
    var b=(window.DETAIL_INDEX||{})[name];
    if(!b){ cb(); return; }
    loadBatch(b,cb);
  }
  function buildEvents(p){
    var ev="",D=window.PEOPLE_DETAIL?window.PEOPLE_DETAIL[p.n]:null;
    if(!D&&(window.DETAIL_INDEX||{})[p.n])
      ev+='<div class="evx" style="text-align:center;color:#9a8657">事件详解加载中…</div>';
    p.e.forEach(function(x,i){
      var dx=null;
      if(D){
        if(D.length===p.e.length) dx=D[i]||null;                                /* 平行数组（主用法） */
        else dx=D[String(x[0])+"|"+String(x[1]).slice(0,8)]||null;              /* 兼容键值形式 */
      }
      if(dx){
        ev+='<div class="event-row has-x"><span class="event-year">'+x[0]+'</span><span class="event-text">'+x[1]+'</span></div>';
        ev+='<div class="evx">';
        if(dx.b)ev+='<p><b>背景</b>'+dx.b+'</p>';
        if(dx.p)ev+='<p><b>经过</b>'+dx.p+'</p>';
        if(dx.i)ev+='<p><b>影响</b>'+dx.i+'</p>';
        if(dx.s)ev+='<span class="evx-src"><b>史料</b>'+dx.s+'</span>';
        ev+='</div>';
      }else{
        ev+='<div class="event-row"><span class="event-year">'+x[0]+'</span><span class="event-text">'+x[1]+'</span></div>';
      }
    });
    return ev;
  }
`;

s = s.slice(0, i) + NEW + s.slice(j + END.length);
s = s.replace(ANCHOR, ANCHOR + LOADER);
fs.writeFileSync(F, s, 'utf8');
console.log('people.html 已改造：详解改为按需加载  (' + (s.length / 1024).toFixed(0) + ' KB)');
console.log('  data-src 详解标记: ' + (s.match(/data-src="data-detail-/g) || []).length);
console.log('  残留 src= 详解标签: ' + (s.match(/<script src="data-detail-\d/g) || []).length);
console.log('  索引脚本: ' + /<script src="data-detail-index\.js">/.test(s));
console.log('  含 loadBatch: ' + /function loadBatch/.test(s));
console.log('  含 buildEvents: ' + /function buildEvents/.test(s));
console.log('  残留同步 innerHTML=ev: ' + /innerHTML=ev;/.test(s));
