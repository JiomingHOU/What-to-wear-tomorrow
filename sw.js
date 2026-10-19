/* ==========================================================================
   sw.js —— Service Worker（离线缓存 + 添加到主屏幕）
   策略：同源请求「网络优先，失败回缓存」，保证内容永远是最新的，
         断网时还能打开应用外壳。跨域请求（天气接口、抠图模型）不拦截。
   改完代码要更新版本号，否则手机会继续用旧缓存。
   ========================================================================== */

var CACHE_NAME = 'mingtian-chuanshenme-v1';

/* 需要预缓存的应用外壳 */
var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './css/app.css',
  './js/util.js',
  './js/store.js',
  './js/rules.js',
  './js/weather.js',
  './js/image.js',
  './js/recommend.js',
  './js/ui.js',
  './js/views/onboarding.js',
  './js/views/home.js',
  './js/views/wardrobe.js',
  './js/views/mixer.js',
  './js/views/discover.js',
  './js/views/me.js',
  './js/views/selftest.js',
  './js/app.js',
  './data/hot_looks_seed.json',
  './data/rules/temperature.json',
  './data/rules/scene.json',
  './data/rules/color.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        /* 单个文件失败不影响整体安装 */
        return Promise.all(
          PRECACHE.map(function (url) {
            return cache.add(url).catch(function () {
              return null;
            });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== CACHE_NAME) return caches.delete(key);
            return null;
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  /* 只处理 GET，同源的请求 */
  if (req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        /* 成功就顺手更新缓存 */
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy).catch(function () {});
          });
        }
        return res;
      })
      .catch(function () {
        /* 断网：用缓存，找不到就回首页 */
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          return caches.match('./index.html');
        });
      })
  );
});
