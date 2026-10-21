/* 将整站打包为单文件离线版：7 页内联数据/样式，外壳 hash 路由 + srcdoc iframe */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;                            // 脚本所在目录（scripts/）
const SRC = path.join(__dirname, '..', 'docs');    // 站点源目录

const PAGES = ['index.html', 'people.html', 'timeline.html', 'states.html', 'network.html', 'map.html', 'game.html', 'insights.html'];

function inlinePage(file) {
  let s = fs.readFileSync(path.join(SRC, file), 'utf8');
  // 内联 mobile.css / wx-compat.css（CSS 注释里的 </style> 字样必须转义，否则会提前闭合标签）
  s = s.replace(/<link rel="stylesheet" href="assets\/(mobile|wx-compat)\.css">/g, (m, f) => {
    const css = fs.readFileSync(path.join(SRC, f + '.css'), 'utf8')
      .replace(/<\/(style)/gi, '<\\/$1');
    return '<style>\n' + css + '\n</style>';
  });
  // 内联 Leaflet 样式与脚本、简版示意图渲染器（本地库一并打包，离线可用）
  s = s.replace(/<link rel="stylesheet" href="assets\/(leaflet\.css)">/g, (m, f) => {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) { console.log('  ⚠ 缺少 ' + f); return m; }
    const css = fs.readFileSync(p, 'utf8').replace(/<\/(style)/gi, '<\\/$1');
    return '<style>\n' + css + '\n</style>';
  });
  // 内联全部数据脚本（同理防 </script> 提前闭合）
  s = s.replace(/<script src="(data\/[^"]+\.js)"><\/script>/g, (m, f) => {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) { console.log('  ⚠ 缺少 ' + f); return m; }
    const js = fs.readFileSync(p, 'utf8').replace(/<\/(script)/gi, '<\\/$1');
    return '<script>\n' + js + '\n</script>';
  });
  // 内联本地库脚本（leaflet.js、map-svg.js、wx-compat.js）；内联后 onerror 无意义，直接去掉
  s = s.replace(/<script src="assets\/(leaflet\.js|map-svg\.js|wx-compat\.js)"[^>]*><\/script>/g, (m, f) => {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) { console.log('  ⚠ 缺少 ' + f); return m; }
    const js = fs.readFileSync(p, 'utf8').replace(/<\/(script)/gi, '<\\/$1');
    return '<script>\n' + js + '\n</script>';
  });
  // 内联按需加载脚本（data-src）：线上按用户操作动态取，离线版直接内联，保证功能完整不降级
  s = s.replace(/<script data-src="([^"]+\.js)"><\/script>/g, (m, f) => {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) { console.log('  ⚠ 缺少 ' + f); return m; }
    const js = fs.readFileSync(p, 'utf8').replace(/<\/(script)/gi, '<\\/$1');
    return '<script>\n' + js + '\n</script>';
  });
  // 页面间链接 → 外壳 hash 路由（#/page.html 或 #/page.html@anchor）
  s = s.replace(/href="(index|people|timeline|states|network|map|game|insights)\.html(#[A-Za-z0-9_-]+)?"/g,
    (m, pg, anch) => 'href="#/' + pg + '.html' + (anch ? '@' + anch.slice(1) : '') + '"');
  // 注入：iframe 内点击转发 + 锚点滚动（__ANCHOR_PLACE__ 由外壳替换）
  const inject = `<script>
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a[href^="#/"]'):null;
  if(a){e.preventDefault();parent.location.hash=a.getAttribute('href');}
});
(function(){
  function go(){ try{ var A='__ANCHOR_PLACE__'; if(!A) return; var el=document.getElementById(A); if(el) el.scrollIntoView({behavior:'smooth'}); }catch(err){} }
  window.addEventListener('load',function(){ setTimeout(go,350); setTimeout(go,900); });
})();
</script>`;
  s = s.replace('</body>', inject + '\n</body>');
  return s;
}

const pages = {};
for (const f of PAGES) {
  pages[f] = inlinePage(f);
  console.log('内联 ' + f.padEnd(15) + (pages[f].length / 1024).toFixed(0) + ' KB');
}

// 作为 JSON 字符串嵌入外壳；转义 </script 防止提前闭合
const payload = JSON.stringify(pages).replace(/<\//g, '<\\/');

const shell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>三国演义 · 群英谱（离线版）</title>
<style>
html,body{margin:0;padding:0;height:100%;background:#f2eee6}
#frame{display:block;width:100%;height:100%;border:0}
#tip{position:fixed;left:50%;top:42%;transform:translateX(-50%);font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#716960;background:#fffdf8;border:1px solid #ded6c9;border-radius:10px;padding:14px 22px;box-shadow:0 8px 24px rgba(42,31,21,.08);z-index:9}
</style>
</head>
<body>
<div id="tip">正在打开…</div>
<iframe id="frame" title="内容" src="about:blank" scrolling="yes"></iframe>
<script>
var PAGES=${payload};
var frame=document.getElementById('frame'),tip=document.getElementById('tip');
/* 微信 X5 内核对 iframe srcdoc 支持不佳，改用文档写入（同源，兼容性最好），失败再降级 srcdoc */
function render(html){
  try{
    var doc=frame.contentDocument||(frame.contentWindow&&frame.contentWindow.document);
    if(doc&&doc.open){ doc.open(); doc.write(html); doc.close(); return; }
  }catch(e){}
  try{ frame.srcdoc=html; return; }catch(e2){}
  tip.style.display=''; tip.textContent='当前浏览器无法渲染该页面，请在 Safari / Chrome 中打开。';
}
function route(){
  var h=location.hash||'#/index.html';
  var m=h.match(/^#\\/([A-Za-z0-9_-]+\\.html)(?:@([A-Za-z0-9_-]+))?$/);
  var page=m?m[1]:'index.html';
  var anchor=(m&&m[2])?m[2]:'';
  if(!PAGES[page])page='index.html';
  var html=PAGES[page].replace(/__ANCHOR_PLACE__/g,anchor);
  tip.style.display='none';
  render(html);
}
window.addEventListener('hashchange',route);
route();
</script>
</body>
</html>`;

const OUT = path.join(__dirname, '..', '三国群英谱-离线版.html');   // 仓库根，已被 .gitignore 忽略
fs.writeFileSync(OUT, shell, 'utf8');
console.log('----');
console.log('输出 ' + OUT);
console.log('总大小 ' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');

// 校验：payload 中不能出现裸 </script>
if (payload.includes('</' + 'script>')) console.log('⚠ payload 存在未转义的 </script>');
else console.log('payload 转义 ✓');
// 校验：锚点占位符已埋入
['index.html','timeline.html'].forEach(f=>{ if(!pages[f].includes('__ANCHOR_PLACE__')) console.log('⚠ '+f+' 未埋锚点占位'); });
