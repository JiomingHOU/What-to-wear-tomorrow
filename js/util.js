/* ==========================================================================
   util.js —— 基础工具（DOM 构建、提示、弹层、格式化）
   全局挂载在 window.App.util，供其它文件使用。
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = {};

  /* ---------------- 选择器 ---------------- */
  U.$ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  U.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* ---------------- 轻量 DOM 构建 ----------------
     用法：h('div', { class: 'x', onclick: fn }, '文字', h('span', null, '更多'))
     - 第二个参数可以是 null
     - 子节点支持字符串、数字、节点、数组、null/false（会被忽略）
  ------------------------------------------------ */
  U.h = function (tag, attrs) {
    var node = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;

      if (k === 'class' || k === 'className') {
        node.className = v;
      } else if (k === 'style' && typeof v === 'object') {
        Object.keys(v).forEach(function (sk) {
          node.style[sk] = v[sk];
        });
      } else if (k === 'dataset' && typeof v === 'object') {
        Object.keys(v).forEach(function (dk) {
          node.dataset[dk] = v[dk];
        });
      } else if (k === 'html') {
        node.innerHTML = v;
      } else if (k === 'value') {
        node.value = v;
      } else if (k === 'checked' || k === 'selected') {
        node[k] = !!v;
      } else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        node.setAttribute(k, v === true ? '' : v);
      }
    });

    for (var i = 2; i < arguments.length; i++) {
      U.append(node, arguments[i]);
    }
    return node;
  };

  /* 把任意子节点拼进父节点 */
  U.append = function (parent, child) {
    if (child === null || child === undefined || child === false || child === '') return parent;
    if (Array.isArray(child)) {
      child.forEach(function (c) {
        U.append(parent, c);
      });
      return parent;
    }
    if (child instanceof Node) {
      parent.appendChild(child);
      return parent;
    }
    parent.appendChild(document.createTextNode(String(child)));
    return parent;
  };

  /* 清空节点 */
  U.clear = function (node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  /* 用新内容替换节点内容 */
  U.mount = function (node, content) {
    U.clear(node);
    U.append(node, content);
    return node;
  };

  /* 转义 HTML（用于必须用 innerHTML 的地方） */
  U.escapeHtml = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /* ---------------- 唯一 ID ---------------- */
  U.uid = function (prefix) {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 7);
    return (prefix || 'id') + '_' + t + r;
  };

  /* ---------------- 小工具 ---------------- */
  U.clamp = function (n, min, max) {
    return Math.min(max, Math.max(min, n));
  };

  U.round = function (n, digits) {
    var p = Math.pow(10, digits || 0);
    return Math.round(n * p) / p;
  };

  U.sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };

  U.debounce = function (fn, wait) {
    var timer = null;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait || 200);
    };
  };

  /* 给 Promise 加超时：超时抛错，避免界面永远转圈 */
  U.withTimeout = function (promise, ms, message) {
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        reject(new Error(message || '超时'));
      }, ms);
    });
    return Promise.race([promise, timeout]).then(
      function (v) {
        clearTimeout(timer);
        return v;
      },
      function (e) {
        clearTimeout(timer);
        throw e;
      }
    );
  };

  /* ---------------- 单位格式化 ---------------- */
  /* 3.2MB / 260KB / 980B */
  U.fmtBytes = function (bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + 'B';
    if (b < 1024 * 1024) return Math.round(b / 1024) + 'KB';
    return (b / 1024 / 1024).toFixed(1) + 'MB';
  };

  U.fmtCount = function (n) {
    var v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(1) + '万';
    return String(v);
  };

  U.fmtPrice = function (v) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    if (!isFinite(n)) return '';
    return '¥' + (Math.round(n * 100) / 100).toString().replace(/\.00$/, '');
  };

  /* ---------------- 日期 ---------------- */
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /* 'YYYY-MM-DD'（本地时区，不用 toISOString 以免跨时区错一天） */
  U.dateStr = function (d) {
    var dt = d ? new Date(d) : new Date();
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  };

  U.todayStr = function () {
    return U.dateStr(new Date());
  };

  U.tomorrowStr = function () {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    return U.dateStr(d);
  };

  /* 明天是周几，例如「周三」 */
  U.tomorrowWeekday = function () {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    return '周' + '日一二三四五六'.charAt(d.getDay());
  };

  /* 2026-10-20 → 10月20日；当年的日期省略年份 */
  U.fmtDate = function (str) {
    if (!str) return '';
    var m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(str);
    var now = new Date().getFullYear();
    var txt = parseInt(m[2], 10) + '月' + parseInt(m[3], 10) + '日';
    return parseInt(m[1], 10) === now ? txt : m[1] + '年' + txt;
  };

  /* 相对天数描述，用于「最久没穿」 */
  U.daysBetween = function (fromStr, toStr) {
    if (!fromStr) return null;
    var a = new Date(fromStr + 'T00:00:00');
    var b = new Date((toStr || U.todayStr()) + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  };

  /* ---------------- 轻提示 ---------------- */
  var toastTimer = {};
  U.toast = function (message, type, ms) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    var box = U.h('div', { class: 'toast ' + (type || '') }, String(message));
    root.appendChild(box);

    /* 同一条消息连续弹出时，最多保留 3 条 */
    while (root.children.length > 3) root.removeChild(root.firstChild);

    var life = ms || (type === 'err' ? 3600 : 2400);
    var key = U.uid('t');
    toastTimer[key] = setTimeout(function () {
      box.classList.add('out');
      setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
        delete toastTimer[key];
      }, 220);
    }, life);
    return box;
  };

  U.toastOk = function (m, ms) {
    return U.toast(m, 'ok', ms);
  };
  U.toastErr = function (m, ms) {
    return U.toast(m, 'err', ms);
  };
  U.toastWarn = function (m, ms) {
    return U.toast(m, 'warn', ms);
  };

  /* ---------------- 底部抽屉 / 对话框 ----------------
     返回 { close(): void, root: Element }
     opts: { title, body(Node|string), footer(Node|array), center(boolean),
             onClose(fn), dismissible(boolean) }
     opts.body / footer 都可以给函数 (close) => Node，方便按钮里调用关闭
  -------------------------------------------------------- */
  U.sheet = function (opts) {
    var o = opts || {};
    var root = document.getElementById('sheet-root');
    var mask = U.h('div', { class: 'sheet-mask' });
    var closed = false;

    var bodyContent = typeof o.body === 'function' ? o.body(close) : o.body;
    var footContent = typeof o.footer === 'function' ? o.footer(close) : o.footer;

    var sheet = U.h(
      'div',
      { class: 'sheet' + (o.center ? ' sheet-center' : ''), role: 'dialog', 'aria-modal': 'true' },
      o.center ? null : U.h('div', { class: 'sheet-grip' }),
      U.h(
        'div',
        { class: 'sheet-head' },
        U.h('div', { class: 'sheet-title' }, o.title || ''),
        o.center || o.dismissible === false
          ? null
          : U.h(
              'button',
              {
                class: 'sheet-close',
                type: 'button',
                'aria-label': '关闭',
                onclick: function () {
                  close();
                },
              },
              '✕'
            )
      ),
      U.h('div', { class: 'sheet-body' }, bodyContent),
      footContent ? U.h('div', { class: 'sheet-foot' }, footContent) : null
    );

    mask.appendChild(sheet);

    /* 点击遮罩关闭（center 弹窗也允许） */
    mask.addEventListener('click', function (e) {
      if (e.target === mask && o.dismissible !== false) close();
    });

    /* 点弹层内部不冒泡到遮罩已由 target 判断处理；Esc 关闭 */
    function onKey(e) {
      if (e.key === 'Escape' && o.dismissible !== false) close();
    }
    document.addEventListener('keydown', onKey);

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      if (typeof o.onClose === 'function') o.onClose();
    }

    root.appendChild(mask);

    /* 自动聚焦第一个输入框（移动端体验好，但不强制弹键盘） */
    var firstInput = sheet.querySelector('input, select, textarea');
    if (firstInput && !o.noAutoFocus) {
      setTimeout(function () {
        try {
          firstInput.focus({ preventScroll: true });
        } catch (e) {
          /* 忽略聚焦失败 */
        }
      }, 60);
    }

    return { close: close, root: mask, sheet: sheet };
  };

  /* 确认对话框：返回 Promise<boolean> */
  U.confirm = function (opts) {
    var o = typeof opts === 'string' ? { message: opts } : opts || {};
    return new Promise(function (resolve) {
      var answered = false;
      function done(v) {
        if (answered) return;
        answered = true;
        resolve(v);
      }
      var ui = U.sheet({
        center: true,
        title: o.title || '请确认',
        dismissible: true,
        onClose: function () {
          done(false);
        },
        body: function () {
          return U.h('p', { class: 'small', style: { fontSize: '14px', lineHeight: '1.6' } }, o.message || '');
        },
        footer: function (close) {
          return [
            U.h(
              'button',
              {
                class: 'btn btn-ghost grow',
                type: 'button',
                onclick: function () {
                  done(false);
                  close();
                },
              },
              o.cancelText || '取消'
            ),
            U.h(
              'button',
              {
                class: 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + ' grow',
                type: 'button',
                onclick: function () {
                  done(true);
                  close();
                },
              },
              o.okText || '确定'
            ),
          ];
        },
      });
      void ui;
    });
  };

  /* 单项选择：返回 Promise<string|null> */
  U.pickOne = function (opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var answered = false;
      function done(v) {
        if (answered) return;
        answered = true;
        resolve(v);
      }
      U.sheet({
        title: o.title || '请选择',
        dismissible: true,
        onClose: function () {
          done(null);
        },
        body: function () {
          return U.h(
            'div',
            { class: 'list' },
            (o.options || []).map(function (opt) {
              return U.h(
                'button',
                {
                  class: 'list-row',
                  type: 'button',
                  onclick: function (e) {
                    done(opt.value);
                    /* 主动关闭：点按钮后移除遮罩 */
                    var mask = e.target.closest('.sheet-mask');
                    if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
                  },
                },
                U.h('span', { class: 'li-main' }, U.h('span', { class: 'li-title' }, opt.label)),
                opt.value === o.current ? U.h('span', { class: 'pass' }, '✓') : null
              );
            })
          );
        },
      });
    });
  };

  /* ---------------- 滚动到顶部 ---------------- */
  U.scrollTop = function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* 判断是否处于「独立窗口」（添加到主屏幕后全屏） */
  U.isStandalone = function () {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  };

  App.util = U;
})();
