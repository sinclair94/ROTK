/* 微信内置浏览器（Android X5 / XWEB、iOS WKWebView）兼容补丁
 * 只做「能力缺失时的兜底」与「微信环境修正」，不改变既有视觉与交互
 */
(function () {
  'use strict';
  var d = document, w = window;
  var ua = navigator.userAgent || '';
  var isWX = /MicroMessenger/i.test(ua);
  var isQQ = /\sQQ\//i.test(ua) || /QQBrowser/i.test(ua);
  d.documentElement.setAttribute('data-wx', isWX ? '1' : '0');
  d.documentElement.setAttribute('data-qq', isQQ ? '1' : '0');

  /* 1. 视口高度：微信 iOS 地址栏伸缩会让 100vh 抖动，写入 --vh 供 CSS 使用 */
  function setVH() {
    var h = w.innerHeight || d.documentElement.clientHeight || 0;
    if (h) d.documentElement.style.setProperty('--vh', (h * 0.01) + 'px');
  }
  setVH();
  w.addEventListener('resize', setVH);
  w.addEventListener('orientationchange', function () { setTimeout(setVH, 300); });

  /* 2. URLSearchParams 兜底（老 X5 内核缺失） */
  if (typeof w.URLSearchParams === 'undefined') {
    function USP(s) {
      this._p = {};
      var q = String(s || '').replace(/^[?&#]/, '');
      var a = q.split('&');
      for (var i = 0; i < a.length; i++) {
        if (!a[i]) continue;
        var kv = a[i].split('=');
        var k = decodeURIComponent(kv[0] || '');
        var v = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
        if (k) this._p[k] = v;
      }
    }
    USP.prototype.get = function (k) { return this._p[k] === undefined ? null : this._p[k]; };
    USP.prototype.has = function (k) { return this._p[k] !== undefined; };
    USP.prototype.set = function (k, v) { this._p[k] = String(v); };
    USP.prototype.toString = function () {
      var o = [], k;
      for (k in this._p) if (Object.prototype.hasOwnProperty.call(this._p, k)) o.push(encodeURIComponent(k) + '=' + encodeURIComponent(this._p[k]));
      return o.join('&');
    };
    w.URLSearchParams = USP;
  }

  /* 3. scrollIntoView 带 options 在老内核会抛错，降级为布尔参数 */
  if (w.Element && Element.prototype.scrollIntoView) {
    var _siv = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (opt) {
      try { _siv.call(this, opt); }
      catch (e) { try { _siv.call(this, true); } catch (e2) { } }
    };
  }

  /* 4. 脚本异常兜底：微信里一旦 JS 挂掉往往整屏空白且毫无提示，这里给一条可读信息 */
  var shown = false;
  function showErr(msg) {
    if (shown) return;
    shown = true;
    var box = d.createElement('div');
    box.setAttribute('style', 'position:fixed;left:12px;right:12px;top:12px;z-index:99999;padding:12px 14px;border-radius:10px;background:#fff4f2;border:1px solid #e5b9b2;color:#7a2d24;font:13px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif');
    box.innerHTML = '<b>页面脚本未能正常执行</b><br>已避免白屏，但部分功能可能不可用。可尝试刷新，或点右上角「···」在浏览器中打开。<br><span style="opacity:.7">' + String(msg || '').replace(/[<>&]/g, '') + '</span>';
    if (d.body) d.body.appendChild(box);
    else d.addEventListener('DOMContentLoaded', function () { d.body.appendChild(box); });
  }
  w.addEventListener('error', function (e) {
    if (e && e.target && e.target !== w && e.target.tagName) return; // 资源加载失败不处理
    showErr(e && e.message);
  }, true);

  /* 5. 微信内轻提示（首次进入出现一次，可关闭并记住） */
  if (isWX) {
    w.addEventListener('load', function () {
      setTimeout(function () {
        var t = d.getElementById('wx-tip');
        if (!t) return;
        var closed = false;
        try { closed = w.localStorage && w.localStorage.getItem('wx_tip_closed') === '1'; } catch (e) { }
        if (closed) return;
        t.className = 'wx-show';
        var x = t.querySelector('.wx-x');
        if (x) x.onclick = function () { t.className = ''; try { w.localStorage.setItem('wx_tip_closed', '1'); } catch (e) { } };
        setTimeout(function () { t.className = ''; }, 9000);
      }, 1200);
    });
  }

  /* 6. Service Worker：仅在 https 下注册，缓存站内资源（离线可开、二次进入秒开）。
   *    file:// 与 http 环境静默跳过，不影响任何既有功能；注册失败也忽略。 */
  try {
    if ('serviceWorker' in navigator && w.location && w.location.protocol === 'https:') {
      w.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { });
      });
    }
  } catch (e) { }
})();
