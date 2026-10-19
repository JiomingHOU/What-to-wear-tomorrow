/* ==========================================================================
   image.js —— 图片处理（压缩 + 自动抠图）
   1) 上传前一定先用 canvas 压缩：最长边 ≤ 1600px，JPEG 质量 0.8，只保存压缩图
   2) 抠图用 @imgly/background-removal，完全在浏览器本地跑，照片不上传
      官方仓库：https://github.com/imgly/background-removal-js
   3) 抠图失败 / 断网 / 超时 → 自动降级成原图，流程绝不卡住
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;

  var IM = {};

  IM.MAX_SIDE = 1600; // 最长边上限
  IM.JPEG_QUALITY = 0.8; // 压缩质量
  IM.BG_TIMEOUT = 180000; // 抠图最长等 3 分钟（首次要下载模型，慢是正常的）

  /* 抠图库的 CDN 地址（都是免费开源的，不需要 key）
     1.5.8 版本带 +esm 会自动把 onnxruntime 一起打包好 */
  var BG_MODULES = [
    'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.8/+esm',
    'https://esm.sh/@imgly/background-removal@1.5.8',
  ];

  /* ---------------------------------------------------------------------
     基础工具
     --------------------------------------------------------------------- */
  function bytesOfDataUrl(dataUrl) {
    var s = String(dataUrl || '');
    var i = s.indexOf(',');
    if (i < 0) return 0;
    var b64 = s.slice(i + 1);
    var pad = 0;
    if (b64.slice(-1) === '=') pad++;
    if (b64.slice(-2, -1) === '=') pad++;
    return Math.floor((b64.length * 3) / 4) - pad;
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1]);
    var len = bin.length;
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        resolve(fr.result);
      };
      fr.onerror = function () {
        reject(new Error('图片读取失败'));
      };
      fr.readAsDataURL(blob);
    });
  }

  IM.bytesOfDataUrl = bytesOfDataUrl;
  IM.dataUrlToBlob = dataUrlToBlob;
  IM.blobToDataUrl = blobToDataUrl;

  /* 能不能导出带透明通道的 WebP（体积比 PNG 小很多）
     Safari 14+ / Chrome / 安卓都支持，不支持就用 PNG */
  var webpAlphaOk = null;
  function canUseWebpAlpha() {
    if (webpAlphaOk !== null) return webpAlphaOk;
    try {
      var c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      webpAlphaOk = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
      webpAlphaOk = false;
    }
    return webpAlphaOk;
  }

  /* ---------------------------------------------------------------------
     解码：把 File 变成可以画到 canvas 的图
     --------------------------------------------------------------------- */
  function decodeFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('没有选择图片'));
        return;
      }
      if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|heic|heif|bmp)$/i.test(file.name || '')) {
        reject(new Error('这个文件不是图片，请重新选择'));
        return;
      }

      /* 优先用 createImageBitmap（快，而且会自动纠正手机照片的朝向） */
      if (window.createImageBitmap) {
        createImageBitmap(file, { imageOrientation: 'from-image' })
          .then(function (bmp) {
            resolve({ source: bmp, width: bmp.width, height: bmp.height, revoke: null });
          })
          .catch(function () {
            fallbackImage();
          });
        return;
      }
      fallbackImage();

      function fallbackImage() {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          resolve({
            source: img,
            width: img.naturalWidth,
            height: img.naturalHeight,
            revoke: function () {
              URL.revokeObjectURL(url);
            },
          });
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('这张图片打不开，可能是格式不支持（比如电脑上的 HEIC）。试试从相册里重新选一张 JPG 照片。'));
        };
        img.src = url;
      }
    });
  }

  /* 把任意图片源按最长边限制画到 canvas 上 */
  function drawToCanvas(source, srcW, srcH, maxSide) {
    var limit = maxSide || IM.MAX_SIDE;
    var scale = Math.min(1, limit / Math.max(srcW, srcH));
    var w = Math.max(1, Math.round(srcW * scale));
    var h = Math.max(1, Math.round(srcH * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    /* 白底：手机照片带透明通道时，转 JPG 不会变成黑底 */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return { canvas: canvas, width: w, height: h, scale: scale };
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(
          function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('图片压缩失败'));
          },
          mime,
          quality
        );
        return;
      }
      /* 极老的浏览器兜底 */
      try {
        resolve(dataUrlToBlob(canvas.toDataURL(mime, quality)));
      } catch (e) {
        reject(new Error('图片压缩失败：' + e.message));
      }
    });
  }

  /* ---------------------------------------------------------------------
     压缩：最长边 ≤1600，JPEG 0.8
     返回 { blob, dataUrl, width, height, origBytes, newBytes }
     --------------------------------------------------------------------- */
  IM.compressFile = function (file, opts) {
    var o = opts || {};
    return decodeFile(file).then(function (decoded) {
      var drawn;
      try {
        drawn = drawToCanvas(decoded.source, decoded.width, decoded.height, o.maxSide || IM.MAX_SIDE);
      } finally {
        if (decoded.revoke) decoded.revoke();
        if (decoded.source && decoded.source.close) decoded.source.close();
      }
      return canvasToBlob(drawn.canvas, 'image/jpeg', o.quality || IM.JPEG_QUALITY).then(function (blob) {
        return blobToDataUrl(blob).then(function (dataUrl) {
          return {
            blob: blob,
            dataUrl: dataUrl,
            width: drawn.width,
            height: drawn.height,
            origBytes: file.size || 0,
            newBytes: blob.size || bytesOfDataUrl(dataUrl),
            scaled: drawn.scale < 1,
            origWidth: decoded.width,
            origHeight: decoded.height,
          };
        });
      });
    });
  };

  /* 压缩一段 dataURL（抠图结果用，保持透明通道） */
  IM.compactDataUrl = function (dataUrl, maxSide) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        var scale = Math.min(1, (maxSide || IM.MAX_SIDE) / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        /* 这里不铺白底，保留抠图的透明 */
        ctx.clearRect(0, 0, cw, ch);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);

        /* 优先 WebP（有透明、体积小），否则 PNG */
        if (canUseWebpAlpha()) {
          try {
            var webp = canvas.toDataURL('image/webp', 0.8);
            if (webp.indexOf('data:image/webp') === 0) {
              resolve({ dataUrl: webp, width: cw, height: ch, bytes: bytesOfDataUrl(webp), mime: 'image/webp' });
              return;
            }
          } catch (e) {
            /* 继续走 PNG */
          }
        }
        var png = canvas.toDataURL('image/png');
        resolve({ dataUrl: png, width: cw, height: ch, bytes: bytesOfDataUrl(png), mime: 'image/png' });
      };
      img.onerror = function () {
        reject(new Error('抠图结果读取失败'));
      };
      img.src = dataUrl;
    });
  };

  /* ---------------------------------------------------------------------
     抠图
     --------------------------------------------------------------------- */
  var bgModulePromise = null;

  function loadBgModule() {
    if (bgModulePromise) return bgModulePromise;
    var p = Promise.reject(new Error('init'));
    BG_MODULES.forEach(function (url) {
      p = p.catch(function () {
        /* 动态 import 在普通脚本里也能用（Chrome 63+ / Safari 11+） */
        return import(url).then(function (mod) {
          var fn = mod && (mod.default || mod.removeBackground);
          if (typeof fn !== 'function') throw new Error('抠图模块导出异常');
          return fn;
        });
      });
    });
    bgModulePromise = p.catch(function (err) {
      bgModulePromise = null; // 允许下次重试
      throw new Error('抠图模型加载失败（可能是断网）：' + (err.message || err));
    });
    return bgModulePromise;
  }

  /* 是否能尝试抠图：目标浏览器（iPhone Safari 11+ / 安卓 Chrome 63+）都支持动态 import。
     即使这里返回 true，断网或加载失败时也会自动降级，不影响录入流程。 */
  IM.canTryCutout = function () {
    return typeof Promise !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined';
  };

  IM.removeBackground = function (file, onProgress) {
    return loadBgModule().then(function (removeBackground) {
      var config = {
        /* 只在浏览器本地计算，不上传 */
        output: { format: 'image/png' },
        progress: function (key, current, total) {
          if (typeof onProgress !== 'function') return;
          var ratio = total ? current / total : 0;
          onProgress({ key: key, current: current, total: total, ratio: ratio });
        },
      };
      var job;
      try {
        job = removeBackground(file, config);
      } catch (e) {
        return Promise.reject(new Error('抠图失败：' + (e.message || e)));
      }
      return U.withTimeout(
        Promise.resolve(job),
        IM.BG_TIMEOUT,
        '抠图超时（首次使用需要下载模型，网络慢的话请点「跳过抠图」）'
      );
    });
  };

  /* ---------------------------------------------------------------------
     一条龙：压缩 →（可选）抠图 → 输出可保存的 dataURL
     返回 {
       dataUrl, width, height, bytes,
       origBytes, compressedBytes, cutout, degraded, reason, mime
     }
     --------------------------------------------------------------------- */
  IM.process = function (file, opts) {
    var o = opts || {};
    var onStage = typeof o.onStage === 'function' ? o.onStage : function () {};
    var onProgress = typeof o.onProgress === 'function' ? o.onProgress : function () {};

    onStage('compress');
    return IM.compressFile(file).then(function (cmp) {
      onStage('compressed', cmp);

      if (o.skipCutout) {
        return {
          dataUrl: cmp.dataUrl,
          width: cmp.width,
          height: cmp.height,
          bytes: cmp.newBytes,
          origBytes: cmp.origBytes,
          compressedBytes: cmp.newBytes,
          cutout: false,
          degraded: false,
          reason: '你选择了跳过抠图',
          mime: 'image/jpeg',
          scaled: cmp.scaled,
          origWidth: cmp.origWidth,
          origHeight: cmp.origHeight,
        };
      }

      onStage('cutout');
      return IM.removeBackground(cmp.blob, onProgress)
        .then(function (pngBlob) {
          if (!pngBlob) throw new Error('抠图没有返回结果');
          return blobToDataUrl(pngBlob).then(function (raw) {
            return IM.compactDataUrl(raw);
          });
        })
        .then(function (cut) {
          onStage('done');
          return {
            dataUrl: cut.dataUrl,
            width: cut.width,
            height: cut.height,
            bytes: cut.bytes,
            origBytes: cmp.origBytes,
            compressedBytes: cmp.newBytes,
            cutout: true,
            degraded: false,
            reason: '',
            mime: cut.mime,
            scaled: cmp.scaled,
            origWidth: cmp.origWidth,
            origHeight: cmp.origHeight,
          };
        })
        .catch(function (err) {
          /* 关键：抠图失败也一定要能继续保存 */
          onStage('degraded', err);
          return {
            dataUrl: cmp.dataUrl,
            width: cmp.width,
            height: cmp.height,
            bytes: cmp.newBytes,
            origBytes: cmp.origBytes,
            compressedBytes: cmp.newBytes,
            cutout: false,
            degraded: true,
            reason: err && err.message ? err.message : '抠图失败',
            mime: 'image/jpeg',
            scaled: cmp.scaled,
            origWidth: cmp.origWidth,
            origHeight: cmp.origHeight,
          };
        });
    });
  };

  App.image = IM;
})();
