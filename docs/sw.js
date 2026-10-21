/* 三国演义 · 群英谱 Service Worker
 * 预缓存核心资源，事件详解分片（data-detail-*.js）与 Leaflet 走运行时缓存 —— 用到才下载、用到才存。
 * 跨域请求（高德地图瓦片等）一律不拦截。版本变化即整体换缓存。
 * 本文件由 _ghbuild.js 生成，勿手改。
 */
var VERSION = 'sg-20261021-1';
var PRECACHE = ["index.html","people.html","timeline.html","states.html","network.html","map.html","game.html","insights.html","about.html","assets/mobile.css","assets/wx-compat.css","assets/wx-compat.js","assets/map-svg.js","assets/leaflet.css","assets/leaflet.js","data/data-detail-index.js","data/data-geo.js","data/data-insights.js","data/data-map-b1.js","data/data-map-b2.js","data/data-map.js","data/data-more-jin.js","data/data-more-qun.js","data/data-more-qun2.js","data/data-more-qun3.js","data/data-more-qun4.js","data/data-more-qun5.js","data/data-more-qun6.js","data/data-more-qun7.js","data/data-more-qun8.js","data/data-more-qun9.js","data/data-more-shu.js","data/data-more-shu2.js","data/data-more-wei.js","data/data-more-wei2.js","data/data-more-wu.js","data/data-more-wu2.js","data/data-more-wu3.js","data/data-network.js","data/data-quotes.js","data/data-riddles.js","data/data-scholar.js","data/data-shu.js","data/data-soup-a.js","data/data-soup-b.js","data/data-states.js","data/data-timeline-more.js","data/data-timeline-p0.js","data/data-timeline-pol.js","data/data-timeline-pol2.js","data/data-timeline.js","data/data-timeline2.js","data/data-wei.js","data/data-wu-qun.js"];

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
