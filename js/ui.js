/* ==========================================================================
   ui.js —— 可复用的界面零件（衣物缩略图、芯片、空状态、顶栏等）
   所有页面都从这里取，保证风格统一。
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var R = App.rules;
  var h = U.h;

  var UI = {};

  /* ---------------- 图标（内联 SVG，避免额外请求） ---------------- */
  UI.icon = {
    shirt:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3.5 12 6l3-2.5 4.5 2.5-2 4-2-.8V20h-7V9.2l-2 .8-2-4z"/></svg>',
    hanger:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5a2 2 0 1 1 2-2"/><path d="m12 7.5-8 6.2a1 1 0 0 0 .6 1.8h14.8a1 1 0 0 0 .6-1.8z"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5h2.5L8 6.5h8l1.5 2H20v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>',
    image:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4.5 17 5-5 4 4 3-3 3.5 3.5"/></svg>',
    sparkle:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z"/><path d="M18.5 15.5 19.3 18l2.5.8-2.5.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z"/></svg>',
    user:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.7-3.6 3.6-5.5 7.2-5.5s6.5 1.9 7.2 5.5"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/></svg>',
    chart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg>',
    edit:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m14.5 5.5 4 4"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10m0 0 3.5-3.5M12 14 8.5 10.5"/><path d="M4.5 17v2.5h15V17"/></svg>',
    upload:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V5m0 0L8.5 8.5M12 5l3.5 3.5"/><path d="M4.5 17v2.5h15V17"/></svg>',
    heart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 3c0 4.8-7.5 9.4-7.5 9.4z"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.7-6"/><path d="M20 4v5h-5"/></svg>',
    location:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6.5-6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    arrow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 8v.6"/></svg>',
    scissors:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6.5" r="2.5"/><circle cx="6" cy="17.5" r="2.5"/><path d="M8 8.2 19.5 18M8 15.8 19.5 6"/></svg>',
  };

  UI.iconEl = function (name, cls) {
    var span = h('span', { class: cls || '' });
    span.innerHTML = UI.icon[name] || '';
    return span;
  };

  /* ---------------- 顶部标题栏 ---------------- */
  /* 全局只挂一个滚动监听，避免每次重绘都新增一个 listener */
  var appbarScrollBound = false;
  function bindAppbarScroll() {
    if (appbarScrollBound) return;
    appbarScrollBound = true;
    window.addEventListener(
      'scroll',
      function () {
        var scrolled = window.scrollY > 4;
        U.$$('.appbar').forEach(function (bar) {
          bar.classList.toggle('scrolled', scrolled);
        });
      },
      { passive: true }
    );
  }

  UI.appbar = function (opts) {
    var o = opts || {};
    bindAppbarScroll();
    var bar = h(
      'div',
      { class: 'appbar' + (window.scrollY > 4 ? ' scrolled' : '') },
      U.h(
        'div',
        { class: 'grow' },
        h('div', { class: 'appbar-title' }, o.title || ''),
        o.sub ? h('div', { class: 'appbar-sub' }, o.sub) : null
      ),
      o.right || null
    );
    return bar;
  };

  /* ---------------- 小圆点（显示颜色） ---------------- */
  UI.colorDot = function (name, size) {
    var s = size || 14;
    return h('i', {
      class: 'color-dot',
      style: {
        background: R.hexOf(name),
        width: s + 'px',
        height: s + 'px',
      },
      title: name || '',
    });
  };

  /* ---------------- 衣物缩略图 ---------------- */
  /* item 可以是衣物对象，也可以是 null（空槽位） */
  UI.thumb = function (item, opts) {
    var o = opts || {};
    var box = h('div', { class: 'thumb' + (o.cover ? ' thumb-cover' : '') });
    if (o.style) Object.assign(box.style, o.style);

    if (!item) {
      var empty = h('div', { class: 'thumb-empty' });
      empty.innerHTML = UI.icon[o.emptyIcon || 'hanger'];
      U.append(empty, h('span', null, o.emptyText || '还没有'));
      box.appendChild(empty);
      return box;
    }

    var src = item.photo_url;
    if (src) {
      var img = h('img', {
        src: src,
        alt: item.note || item.category || '衣物',
        loading: 'lazy',
        decoding: 'async',
      });
      img.addEventListener('error', function () {
        U.mount(box, h('div', { class: 'thumb-empty' }, '图片损坏'));
      });
      box.appendChild(img);
    } else {
      var e2 = h('div', { class: 'thumb-empty' });
      e2.innerHTML = UI.icon.shirt;
      U.append(e2, h('span', null, item.category || '衣物'));
      box.appendChild(e2);
    }
    return box;
  };

  /* ---------------- 衣物卡片（衣橱用） ---------------- */
  UI.itemCard = function (item, onClick) {
    var card = h(
      'button',
      { class: 'item-card', type: 'button', onclick: function () { onClick && onClick(item); } },
      UI.thumb(item),
      h(
        'div',
        { class: 'item-card-meta' },
        h('div', { class: 'item-card-name' }, item.style ? item.style + '款' : item.category || '衣物'),
        h(
          'div',
          { class: 'item-card-sub' },
          item.color_main ? UI.colorDot(item.color_main, 9) : null,
          h('span', { class: 'truncate' }, item.color_main || '未填颜色')
        )
      ),
      Number(item.wear_count) > 0
        ? h('span', { class: 'wear-badge' }, '穿' + item.wear_count + '次')
        : null
    );
    return card;
  };

  /* ---------------- 搭配槽位图（2×2 展示一套） ---------------- */
  /* items 是衣物数组；按槽位排成 上衣/下装/鞋/配饰/外套 */
  UI.lookGrid = function (items) {
    var order = ['top', 'bottom', 'onepiece', 'shoes', 'acc', 'outer'];
    var buckets = {};
    (items || []).forEach(function (it) {
      if (!it) return;
      var s = App.recommend.slotOfItem(it) || 'acc';
      if (!buckets[s]) buckets[s] = [];
      buckets[s].push(it);
    });

    var cells = [];
    order.forEach(function (slot) {
      var list = buckets[slot] || [];
      list.forEach(function (it) {
        var isOuter = slot === 'outer';
        var tile = h('div', { class: 'look-tile' + (isOuter ? ' is-outer' : '') });
        tile.appendChild(h('span', { class: 'slot-label' }, R.SLOT_LABEL[slot] || slot));
        tile.appendChild(UI.thumb(it, { emptyText: R.SLOT_LABEL[slot] }));
        cells.push(tile);
      });
    });

    if (!cells.length) {
      cells.push(
        h(
          'div',
          { class: 'look-tile', style: { gridColumn: 'span 2', aspectRatio: '2 / 1' } },
          h('div', { class: 'thumb' }, h('div', { class: 'thumb-empty' }, '这套还没有衣服'))
        )
      );
    }

    return h('div', { class: 'look-grid' }, cells);
  };

  /* 单个槽位方块（空槽位也显示占位） */
  UI.slotTile = function (slot, item, onClick) {
    var tile = h(
      'button',
      { class: 'look-tile', type: 'button', onclick: onClick || null },
      h('span', { class: 'slot-label' }, R.SLOT_LABEL[slot] || slot),
      UI.thumb(item, { emptyText: '点这里选' })
    );
    if (slot === 'outer') {
      tile.classList.add('is-outer');
    }
    return tile;
  };

  /* ---------------- 芯片组 ---------------- */
  /* opts: {multi, small, selected(数组或字符串), onPick(value, allSelected)} */
  UI.chips = function (options, opts) {
    var o = opts || {};
    var multi = !!o.multi;
    var selected = [];

    if (Array.isArray(o.selected)) selected = o.selected.slice();
    else if (o.selected !== null && o.selected !== undefined && o.selected !== '') selected = [o.selected];

    var box = h('div', { class: 'chips' });

    options.forEach(function (opt) {
      var value = typeof opt === 'string' ? opt : opt.value;
      var label = typeof opt === 'string' ? opt : opt.label;
      var isOn = selected.indexOf(value) !== -1;

      var btn = h(
        'button',
        {
          class: 'chip' + (o.small ? ' chip-sm' : '') + (isOn ? ' on' : ''),
          type: 'button',
        },
        label
      );

      btn.addEventListener('click', function () {
        if (multi) {
          var i = selected.indexOf(value);
          if (i === -1) selected.push(value);
          else selected.splice(i, 1);
          btn.classList.toggle('on', selected.indexOf(value) !== -1);
        } else {
          selected = [value];
          U.$$('.chip', box).forEach(function (el) {
            el.classList.remove('on');
          });
          btn.classList.add('on');
        }
        if (o.onPick) o.onPick(value, selected.slice());
      });

      box.appendChild(btn);
    });

    box.getValue = function () {
      return multi ? selected.slice() : selected[0] || '';
    };
    box.setValue = function (v) {
      selected = typeof v === 'string' ? [v] : (v || []).slice();
      U.$$('.chip', box).forEach(function (el, idx) {
        var ov = options[idx];
        if (ov === undefined) return; /* 允许外部往 box 里追加自定义 chip（比如「不限」） */
        var val = typeof ov === 'string' ? ov : ov.value;
        el.classList.toggle('on', selected.indexOf(val) !== -1);
      });
    };
    return box;
  };

  /* ---------------- 分段控件 ---------------- */
  UI.segmented = function (options, current, onPick) {
    var box = h('div', { class: 'segmented' });
    var value = current;
    options.forEach(function (opt) {
      var v = typeof opt === 'string' ? opt : opt.value;
      var label = typeof opt === 'string' ? opt : opt.label;
      var b = h('button', { class: v === value ? 'on' : '', type: 'button' }, label);
      b.addEventListener('click', function () {
        value = v;
        U.$$('button', box).forEach(function (el) {
          el.classList.remove('on');
        });
        b.classList.add('on');
        if (onPick) onPick(v);
      });
      box.appendChild(b);
    });
    return box;
  };

  /* ---------------- 表单字段 ---------------- */
  UI.field = function (labelText, control, opts) {
    var o = opts || {};
    return h(
      'div',
      { class: 'field' },
      h(
        'label',
        { class: 'label' },
        labelText,
        o.required ? h('span', { class: 'req' }, '*') : null
      ),
      control,
      o.hint ? h('div', { class: 'field-hint' }, o.hint) : null
    );
  };

  /* ---------------- 空状态 ---------------- */
  UI.empty = function (opts) {
    var o = opts || {};
    var box = h('div', { class: 'empty' });
    var ico = h('div', { class: 'empty-ico' });
    ico.innerHTML = UI.icon[o.icon || 'hanger'];
    box.appendChild(ico);
    if (o.title) box.appendChild(h('h3', null, o.title));
    if (o.text) box.appendChild(h('p', null, o.text));
    if (o.actionLabel) {
      box.appendChild(
        h(
          'button',
          { class: 'btn btn-primary', type: 'button', onclick: o.onAction || null },
          o.actionLabel
        )
      );
    }
    return box;
  };

  /* ---------------- 加载中 ---------------- */
  UI.loading = function (text) {
    return h('div', { class: 'loading-row' }, h('span', { class: 'spinner dark' }), h('span', null, text || '加载中…'));
  };

  /* ---------------- 统计条 ---------------- */
  UI.barRow = function (label, value, max) {
    var pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return h(
      'div',
      { class: 'bar-row' },
      h('span', { class: 'bar-label truncate' }, label),
      h('span', { class: 'bar-track' }, h('i', { style: { width: pct + '%' } })),
      h('span', { class: 'bar-val' }, String(value))
    );
  };

  /* ---------------- 天气卡 ----------------
     版式：今天在最上面、最醒目（带日期），明天在下面一条（也带日期）。
     opts: { onEditCity }
     -------------------------------------------------- */
  UI.weatherCard = function (w, opts) {
    var o = opts || {};
    if (!w) return h('div', { class: 'weather-skeleton' });

    var today = w.today || {};
    var tm = w.tomorrow || {};
    var card = h('div', { class: 'weather-card w-' + (w.iconClass || 'cloudy') });

    function dayLabel(day, prefix) {
      var parts = [prefix];
      if (day.date) {
        parts.push(U.fmtDate(day.date));
        var wd = U.weekdayOf(day.date);
        if (wd) parts.push(wd);
      }
      return parts.join(' ');
    }

    function num(v) {
      return v === undefined || v === null ? '-' : String(v);
    }

    /* 顶部：城市 + 改城市 */
    card.appendChild(
      h(
        'div',
        { class: 'weather-top' },
        h('div', { class: 'weather-city' }, h('span', null, w.city || '未设置城市')),
        h(
          'button',
          { class: 'weather-edit', type: 'button', onclick: o.onEditCity || null },
          '改城市'
        )
      )
    );

    /* 今天：大字温度 + 天气 + 温度区间 */
    var todayTemp = w.currentTemp === null || w.currentTemp === undefined ? today.tmax : w.currentTemp;
    var todayText = w.currentText || today.text || '天气未知';

    card.appendChild(
      h('div', { class: 'weather-day' }, dayLabel(today, '今天'))
    );

    card.appendChild(
      h(
        'div',
        { class: 'weather-main' },
        h('div', { class: 'weather-temp' }, num(todayTemp), h('span', null, '°')),
        h(
          'div',
          { class: 'weather-desc' },
          h('strong', null, todayText),
          h(
            'span',
            null,
            '今天 ' + num(today.tmin) + '° ~ ' + num(today.tmax) + '°' +
              (today.precip === null || today.precip === undefined ? '' : '　降水 ' + today.precip + '%')
          )
        )
      )
    );

    /* 明天：一条紧凑的信息行 */
    card.appendChild(
      h(
        'div',
        { class: 'weather-next' },
        h('span', { class: 'weather-next-day' }, dayLabel(tm, '明天')),
        h('span', { class: 'weather-next-main' }, tm.text || '天气未知'),
        h('span', { class: 'weather-next-temp' }, num(tm.tmax) + '° / ' + num(tm.tmin) + '°')
      )
    );

    card.appendChild(
      h(
        'div',
        { class: 'weather-foot' },
        h('span', null, '明天降水 ', h('b', null, tm.precip === null || tm.precip === undefined ? '—' : tm.precip + '%')),
        h('span', null, '明天体感 ', h('b', null, Math.round(w.tempAvg) + '°')),
        w.stale ? h('span', null, '（离线缓存）') : null
      )
    );

    if (w.tip) {
      card.appendChild(h('div', { class: 'weather-tip' }, '💡 ' + w.tip));
    }

    if (w.stale) {
      card.appendChild(h('div', { class: 'tiny', style: { marginTop: '8px', opacity: '0.8' } }, '网络不太好，显示的是上次获取的天气'));
    }

    return card;
  };

  /* ---------------- 标签 ---------------- */
  UI.tag = function (text, cls) {
    return h('span', { class: 'tag ' + (cls || '') }, text);
  };

  App.ui = UI;
})();
