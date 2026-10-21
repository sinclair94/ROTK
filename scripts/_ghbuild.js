/* 构建 GitHub Pages 部署目录 gh-pages/
 * 站点本身是零构建的多页静态站，这里只做：筛选文件 → 生成 sw.js / .nojekyll / README → 体检
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const OUT = path.join(DIR, 'gh-pages');

const PAGES = ['index.html', 'people.html', 'timeline.html', 'states.html',
  'network.html', 'map.html', 'game.html', 'insights.html', 'about.html'];
const CORE = ['mobile.css', 'wx-compat.css', 'wx-compat.js', 'map-svg.js'];
/* 全平铺：不建子目录（GitHub 网页上传会把子目录拍平，lib/ 路径会断） */
const LIBS = ['leaflet.css', 'leaflet.js'];

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const dataFiles = fs.readdirSync(DIR).filter(f => /^data-.*\.js$/.test(f)).sort();
const copied = [];
function cp(rel, dest) {
  const src = path.join(DIR, rel);
  if (!fs.existsSync(src)) { console.log('  ⚠ 缺少 ' + rel); return; }
  const target = path.join(OUT, dest || rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fs.readFileSync(src));
  copied.push(dest || rel);
}
PAGES.forEach(f => cp(f));
CORE.forEach(f => cp(f));
LIBS.forEach(f => cp(f));
dataFiles.forEach(f => cp(f));
/* 离线单文件版不再进部署目录：1.9 MB 由 Release 附件提供，见 README「构建与维护」。
   本地生成：node _bundle.js → 三国群英谱-离线版.html */

/* ---- sw.js：预缓存核心资源；事件详解分片与 Leaflet 走运行时缓存（用到才存） ---- */
const VERSION = 'sg-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-1';
const precache = PAGES.concat(CORE).concat(LIBS)
  .concat(dataFiles.filter(f => !/^data-detail-\d\d\.js$/.test(f)));

const sw = `/* 三国演义 · 群英谱 Service Worker
 * 预缓存核心资源，事件详解分片（data-detail-*.js）与 Leaflet 走运行时缓存 —— 用到才下载、用到才存。
 * 跨域请求（高德地图瓦片等）一律不拦截。版本变化即整体换缓存。
 * 本文件由 _ghbuild.js 生成，勿手改。
 */
var VERSION = '${VERSION}';
var PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) {
      return c.add(u).catch(function () { });   /* 单个失败不影响整体安装 */
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;      /* 跨域交给网络 */

  /* 页面：网络优先（拿得到新版本），失败回缓存 */
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    e.respondWith(fetch(req).then(function (r) {
      var c = r.clone();
      caches.open(VERSION).then(function (cc) { cc.put(req, c); }).catch(function () { });
      return r;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || caches.match('index.html'); });
    }));
    return;
  }
  /* 静态资源：缓存优先，未命中再取网络并回写 */
  e.respondWith(caches.match(req).then(function (r) {
    return r || fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var c = res.clone();
        caches.open(VERSION).then(function (cc) { cc.put(req, c); }).catch(function () { });
      }
      return res;
    });
  }));
});
`;
fs.writeFileSync(path.join(OUT, 'sw.js'), sw, 'utf8');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');   /* 跳过 Jekyll，保证 _ 开头与原始字节不被处理 */

/* 仓库文档一并进部署目录：页脚与 README 互相链接，Pages 上可直接访问 */
['README.md', 'DATA.md', 'CHANGELOG.md', 'LICENSE'].forEach(f => cp(f));

/* ---- 体检：页内引用的资源必须都在目录里 ---- */
let bad = 0;
PAGES.forEach(f => {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  const refs = new Set();
  [...s.matchAll(/<script src="([^"]+)"/g)].forEach(m => refs.add(m[1]));
  [...s.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].forEach(m => refs.add(m[1]));
  [...s.matchAll(/data-src="([^"]+)"/g)].forEach(m => refs.add(m[1]));
  refs.forEach(r => {
    if (/^https?:/.test(r) || r.startsWith('data:')) return;
    if (!fs.existsSync(path.join(OUT, r))) { console.log('  ✗ ' + f + ' 引用了不存在的文件: ' + r); bad++; }
  });
});

let total = 0;
function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else total += fs.statSync(p).size;
  });
}
walk(OUT);

console.log('输出目录: ' + OUT);
console.log('文件数: ' + fs.readdirSync(OUT, { recursive: true }).filter(p => fs.statSync(path.join(OUT, p)).isFile()).length);
console.log('总体积: ' + (total / 1024).toFixed(0) + ' KB  (离线单文件版已改由 Release 附件提供，不在此目录)');
console.log('预缓存: ' + precache.length + ' 项；运行时缓存: 15 个详解分片 + Leaflet');
console.log('引用体检: ' + (bad ? bad + ' 处缺失' : '全部通过 ✓'));

/* 首屏体积对比 */
const first = ['index.html', 'mobile.css', 'wx-compat.css', 'wx-compat.js'];
const firstKB = first.reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
const peopleKB = ['people.html', 'mobile.css', 'wx-compat.css', 'wx-compat.js', 'data-detail-index.js']
  .concat(dataFiles.filter(f => !/^data-detail-\d\d\.js$/.test(f)))
  .reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
console.log('首屏（首页）约 ' + firstKB.toFixed(0) + ' KB；人物页首屏约 ' + peopleKB.toFixed(0) + ' KB（改造前约 600 KB）');
