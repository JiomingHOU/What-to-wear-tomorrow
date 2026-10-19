/* ==========================================================================
   views/mixer.js —— 搭配 Tab
   1) 手动搭配台：按槽位挑衣服，实时预览，可保存为「我的搭配」
   2) 单品延伸：选一件衣服，推荐配套的下装 / 鞋 / 配饰
   3) 心愿单：记下缺的品类、颜色、预算
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var R = App.rules;
  var UI = App.ui;
  var RC = App.recommend;
  var DB = App.db;
  var h = U.h;

  var V = (App.views = App.views || {});

  var SLOTS = ['top', 'bottom', 'shoes', 'outer', 'acc'];

  var S = {
    picked: { top: null, bottom: null, shoes: null, outer: null, acc: null },
    extend: null,
    anchor: null,
    wishlist: [],
    savedOpen: true,
  };

  function tempNow() {
    var w = App.state.weather;
    if (w && typeof w.tempAvg === 'number') return w.tempAvg;
    return 20;
  }

  function pickedItems() {
    var arr = [];
    SLOTS.forEach(function (s) {
      if (S.picked[s]) arr.push(S.picked[s]);
    });
    return arr;
  }

  /* ---------------------------------------------------------------------
     主渲染
     --------------------------------------------------------------------- */
  function render(root) {
    var p = App.state.profile;
    if (!p) return;

    U.clear(root);
    root.appendChild(
      UI.appbar({
        title: '搭配',
        sub: p.nickname + ' · 手动搭配 / 单品延伸',
        right: h(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            style: { minHeight: '38px' },
            onclick: openWishlist,
          },
          '心愿单'
        ),
      })
    );

    var page = h('div', { class: 'page' });

    /* 临时提示（沿用首页的天气和场景） */
    page.appendChild(
      h(
        'div',
        { class: 'card', style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '11px 13px' } },
        h('span', { style: { fontSize: '17px' } }, '🌡️'),
        h(
          'div',
          { class: 'grow small' },
          '按 ' ,
          h('b', null, Math.round(tempNow()) + '℃'),
          ' · ',
          h('b', null, App.getScene()),
          ' 来打分（跟首页一致）'
        ),
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            type: 'button',
            style: { flex: 'none' },
            onclick: function () {
              App.go('home');
            },
          },
          '去改'
        )
      )
    );

    /* 单品延伸入口 */
    page.appendChild(
      h(
        'button',
        {
          class: 'btn btn-soft btn-block',
          type: 'button',
          style: { marginTop: '12px' },
          onclick: pickAnchor,
        },
        '🔍 选一件衣服，帮我配下装和鞋'
      )
    );

    /* 延伸结果 */
    if (S.extend) {
      page.appendChild(buildExtendBlock());
    }

    /* 搭配台 */
    var work = h('div', { class: 'section' });
    work.appendChild(
      h(
        'div',
        { class: 'section-head' },
        h('div', { class: 'section-title' }, '手动搭配台'),
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            type: 'button',
            onclick: function () {
              clearPicked();
            },
          },
          '清空'
        )
      )
    );

    var slots = h('div', { class: 'slot-list' });
    SLOTS.forEach(function (slot) {
      slots.appendChild(buildSlotRow(slot));
    });
    work.appendChild(slots);

    /* 预览 */
    var items = pickedItems();
    if (items.length) {
      var explain = RC.explain(items, { tempC: tempNow(), scene: App.getScene() });
      var preview = h('div', { class: 'card', style: { marginTop: '12px' } });
      preview.appendChild(
        h(
          'div',
          { class: 'row-between', style: { marginBottom: '10px' } },
          h('div', { style: { fontWeight: '700', fontSize: '14px' } }, '预览'),
          h('span', { class: 'score-pill' }, '匹配度 ' + explain.scorePct)
        )
      );
      preview.appendChild(UI.lookGrid(items));
      if (explain.notes.length) {
        preview.appendChild(h('div', { class: 'small', style: { marginTop: '10px', lineHeight: '1.6' } }, explain.notes.join('；')));
      }
      work.appendChild(preview);

      work.appendChild(
        h(
          'div',
          { class: 'row', style: { marginTop: '12px', gap: '8px' } },
          h(
            'button',
            { class: 'btn btn-primary grow', type: 'button', onclick: savePicked },
            '保存为我的搭配'
          ),
          h(
            'button',
            { class: 'btn grow', type: 'button', onclick: openWishForm },
            '缺一件？记心愿单'
          )
        )
      );
    } else {
      work.appendChild(
        h(
          'p',
          { class: 'field-hint', style: { marginTop: '10px' } },
          '点上面的槽位，从衣橱里挑衣服，挑好会显示预览和配色点评。'
        )
      );
    }

    page.appendChild(work);

    /* 我的搭配 */
    page.appendChild(buildSavedSection());
    /* 心愿单 */
    page.appendChild(buildWishSection());

    root.appendChild(page);

    /* 处理从衣橱点过来的「用它配一套」 */
    if (App.state.mixerAnchor) {
      var anchorItem = App.state.items.filter(function (it) {
        return it.item_id === App.state.mixerAnchor;
      })[0];
      App.state.mixerAnchor = '';
      if (anchorItem) {
        setTimeout(function () {
          runExtend(anchorItem);
        }, 30);
      }
    }

    loadWishlist();
  }

  /* ---------------------------------------------------------------------
     槽位行
     --------------------------------------------------------------------- */
  function buildSlotRow(slot) {
    var item = S.picked[slot];
    var label = R.SLOT_LABEL[slot] || slot;

    var row = h(
      'div',
      {
        class: 'slot' + (item ? '' : ' is-empty'),
        role: 'button',
        tabindex: '0',
        onclick: function () {
          openPicker(slot);
        },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') openPicker(slot);
        },
      },
      UI.thumb(item, { emptyText: '点这里选' }),
      h(
        'div',
        { class: 'slot-main' },
        h('div', { class: 'slot-name' }, item ? (item.color_main || '') + (item.style ? ' · ' + item.style : '') : label),
        h(
          'div',
          { class: 'slot-sub' },
          item
            ? [item.category, item.season_thickness, (item.scene_tags || []).slice(0, 2).join('/')].filter(Boolean).join(' · ')
            : '还没选' + label
        )
      ),
      item
        ? h(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              style: { flex: 'none' },
              onclick: function (e) {
                e.stopPropagation();
                S.picked[slot] = null;
                refreshExtend();
                App.render();
              },
            },
            '清空'
          )
        : h('span', { class: 'li-arrow' }, '›')
    );
    return row;
  }

  function openPicker(slot) {
    var cats = R.categoriesOfSlot(slot);
    var list = (App.state.items || []).filter(function (it) {
      return cats.indexOf(it.category) !== -1;
    });

    if (!list.length) {
      U.toast('这一类还没有衣服，先去衣橱添加');
      return;
    }

    /* 按厚薄是否适合当前温度排个序，合适的放前面 */
    var band = R.bandForTemp(tempNow());
    list.sort(function (a, b) {
      var ai = band.levels.indexOf(R.levelIndex(a.season_thickness));
      var bi = band.levels.indexOf(R.levelIndex(b.season_thickness));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    var grid = h('div', { class: 'picker-grid' });
    var sheet;

    list.forEach(function (it) {
      var on = S.picked[slot] && S.picked[slot].item_id === it.item_id;
      var cell = h(
        'button',
        { class: 'picker-cell' + (on ? ' on' : ''), type: 'button' },
        UI.thumb(it),
        h('div', { class: 'picker-cell-name' }, (it.color_main || '') + '·' + it.category)
      );
      cell.addEventListener('click', function () {
        S.picked[slot] = it;
        if (sheet) sheet.close();
        refreshExtend();
        App.render();
      });
      grid.appendChild(cell);
    });

    sheet = U.sheet({
      title: '选' + (R.SLOT_LABEL[slot] || slot),
      body: h('div', null, grid),
      footer: function (close) {
        return h(
          'button',
          {
            class: 'btn btn-block',
            type: 'button',
            onclick: function () {
              S.picked[slot] = null;
              close();
              refreshExtend();
              App.render();
            },
          },
          '不选这一类'
        );
      },
    });
  }

  function clearPicked() {
    SLOTS.forEach(function (s) {
      S.picked[s] = null;
    });
    S.extend = null;
    S.anchor = null;
    App.render();
  }

  /* ---------------------------------------------------------------------
     单品延伸
     --------------------------------------------------------------------- */
  function pickAnchor() {
    var items = App.state.items || [];
    if (!items.length) {
      U.toast('衣橱还是空的，先去添加衣服');
      return;
    }

    var byCat = {};
    R.CATEGORIES.forEach(function (c) {
      byCat[c] = [];
    });
    items.forEach(function (it) {
      (byCat[it.category] = byCat[it.category] || []).push(it);
    });

    var body = h('div');
    R.CATEGORIES.forEach(function (cat) {
      var group = byCat[cat] || [];
      if (!group.length) return;
      body.appendChild(h('div', { class: 'section-title', style: { fontSize: '13px', margin: '12px 0 8px' } }, cat));
      var grid = h('div', { class: 'picker-grid' });
      group.forEach(function (it) {
        var cell = h(
          'button',
          { class: 'picker-cell', type: 'button' },
          UI.thumb(it),
          h('div', { class: 'picker-cell-name' }, (it.color_main || '') + '·' + (it.style || ''))
        );
        cell.addEventListener('click', function () {
          sheet.close();
          runExtend(it);
        });
        grid.appendChild(cell);
      });
      body.appendChild(grid);
    });

    var sheet = U.sheet({ title: '选一件要配的衣服', body: body });
    void sheet;
  }

  function runExtend(item) {
    S.anchor = item;
    S.extend = RC.extend({
      item: item,
      gender: App.state.profile.gender,
      tempC: tempNow(),
      scene: App.getScene(),
      items: App.state.items,
    });
    App.render();
    U.scrollTop();
  }

  /* 搭配台里改动了衣服后，重新算一次延伸建议 */
  function refreshExtend() {
    if (!S.anchor) return;
    S.extend = RC.extend({
      item: S.anchor,
      gender: App.state.profile.gender,
      tempC: tempNow(),
      scene: App.getScene(),
      items: App.state.items,
    });
  }

  function buildExtendBlock() {
    var ex = S.extend;
    var box = h('div', { class: 'card', style: { marginTop: '12px' } });

    box.appendChild(
      h(
        'div',
        { class: 'row-between', style: { marginBottom: '10px' } },
        h('div', { style: { fontWeight: '700', fontSize: '14px' } }, '给「' + (ex.anchor.color_main || '') + ex.anchor.category + '」配'),
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            type: 'button',
            onclick: function () {
              S.extend = null;
              S.anchor = null;
              App.render();
            },
          },
          '关闭'
        )
      )
    );

    if (ex.note) {
      box.appendChild(h('p', { class: 'small', style: { lineHeight: '1.65' } }, h('b', null, '配色建议：'), ex.note));
    }

    function group(title, list, slot) {
      if (!list || !list.length) return;
      box.appendChild(h('div', { class: 'section-title', style: { fontSize: '13px', margin: '14px 0 8px' } }, title));
      var grid = h('div', { class: 'picker-grid' });
      list.forEach(function (cand) {
        var cell = h(
          'button',
          { class: 'picker-cell', type: 'button' },
          UI.thumb(cand.item),
          h('div', { class: 'picker-cell-name' }, (cand.item.color_main || '') + ' ' + (cand.why ? '' : ''))
        );
        cell.addEventListener('click', function () {
          S.picked[slot] = cand.item;
          if (cand.item.category === '连体装') S.picked.top = cand.item;
          App.render();
          U.toast('已放进搭配台');
        });
        grid.appendChild(cell);
      });
      box.appendChild(grid);
    }

    group('推荐的下装', ex.bottoms, 'bottom');
    group('推荐的上衣', ex.tops, 'top');
    group('推荐的鞋', ex.shoes, 'shoes');
    group('推荐的配饰', ex.accs, 'acc');

    if (ex.missingText) {
      box.appendChild(h('div', { class: 'not-now', style: { marginTop: '12px' } }, ex.missingText));
    }
    if (!ex.bottoms.length && !ex.tops.length && !ex.shoes.length) {
      box.appendChild(
        h(
          'p',
          { class: 'field-hint', style: { marginTop: '10px' } },
          '这次没有配到合适的单品，可能是温度或场景把候选都筛掉了。换一件衣服，或者去衣橱补几件。'
        )
      );
    }

    return box;
  }

  /* ---------------------------------------------------------------------
     保存搭配
     --------------------------------------------------------------------- */
  function savePicked() {
    var items = pickedItems();
    if (!items.length) {
      U.toastWarn('先挑几件衣服');
      return;
    }
    var p = App.state.profile;
    DB.outfits
      .save({
        profile_id: p.profile_id,
        items: items.map(function (it) {
          return it.item_id;
        }),
        scene: App.getScene(),
        source: 'manual',
      })
      .then(function () {
        return App.reloadProfileData();
      })
      .then(function () {
        App.render();
        U.toastOk('已保存到「我的搭配」');
      })
      .catch(function (err) {
        U.toastErr(err.message || '保存失败');
      });
  }

  /* ---------------------------------------------------------------------
     我的搭配
     --------------------------------------------------------------------- */
  function buildSavedSection() {
    var box = h('div', { class: 'section' });
    var outfits = App.state.outfits || [];

    box.appendChild(
      h(
        'div',
        { class: 'section-head' },
        h('div', { class: 'section-title' }, '我的搭配'),
        h('div', { class: 'section-hint' }, outfits.length + ' 套')
      )
    );

    if (!outfits.length) {
      box.appendChild(
        h(
          'p',
          { class: 'field-hint' },
          '还没有保存的搭配。上面挑好衣服点「保存为我的搭配」，或者去首页生成一套存下来。'
        )
      );
      return box;
    }

    var byId = {};
    (App.state.items || []).forEach(function (it) {
      byId[it.item_id] = it;
    });

    outfits.slice(0, 12).forEach(function (o) {
      var items = (o.items || [])
        .map(function (id) {
          return byId[id];
        })
        .filter(Boolean);
      if (!items.length) return;

      var card = h(
        'button',
        {
          class: 'slot',
          type: 'button',
          style: { marginBottom: '9px' },
          onclick: function () {
            openOutfitDetail(o, items);
          },
        },
        h(
          'div',
          { style: { display: 'flex', gap: '3px', flex: 'none' } },
          items.slice(0, 3).map(function (it) {
            return h(
              'div',
              { class: 'thumb', style: { width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--line)' } },
              it.photo_url ? h('img', { src: it.photo_url, alt: '' }) : null
            );
          })
        ),
        h(
          'div',
          { class: 'slot-main' },
          h('div', { class: 'slot-name' }, items.length + ' 件 · ' + (o.scene || '未标场景')),
          h(
            'div',
            { class: 'slot-sub' },
            (o.source === 'daily' ? '首页生成' : '手动搭配') + ' · ' + U.fmtDate(String(o.created_at || '').slice(0, 10))
          )
        ),
        h('span', { class: 'li-arrow' }, '›')
      );
      box.appendChild(card);
    });

    return box;
  }

  function openOutfitDetail(outfit, items) {
    U.sheet({
      title: '这套搭配',
      body: h(
        'div',
        null,
        UI.lookGrid(items),
        h(
          'div',
          { class: 'wrap', style: { marginTop: '12px' } },
          items.map(function (it) {
            return UI.tag((R.SLOT_LABEL[RC.slotOfItem(it)] || '') + '：' + (it.color_main || '') + (it.style ? '·' + it.style : ''));
          })
        ),
        h('hr', { class: 'divider' }),
        h('div', { class: 'small' }, '场景：' + (outfit.scene || '未标') + '　保存时间：' + U.fmtDate(String(outfit.created_at || '').slice(0, 10)))
      ),
      footer: function (close) {
        return h(
          'div',
          { style: { display: 'flex', gap: '8px', width: '100%' } },
          h(
            'button',
            {
              class: 'btn btn-primary grow',
              type: 'button',
              onclick: function () {
                var p = App.state.profile;
                DB.logs
                  .add(
                    p.profile_id,
                    outfit.outfit_id,
                    U.tomorrowStr(),
                    items.map(function (it) {
                      return it.item_id;
                    })
                  )
                  .then(function () {
                    close();
                    return App.reloadItems();
                  })
                  .then(function () {
                    App.render();
                    U.toastOk('已打卡，衣服穿着次数 +1');
                  })
                  .catch(function (err) {
                    U.toastErr(err.message || '打卡失败');
                  });
              },
            },
            '明天穿它（打卡）'
          ),
          h(
            'button',
            {
              class: 'btn btn-danger',
              type: 'button',
              style: { flex: 'none' },
              onclick: function () {
                U.confirm({
                  title: '删除这套搭配？',
                  message: '只删除这条搭配记录，衣服不会被删。',
                  okText: '删除',
                  danger: true,
                }).then(function (yes) {
                  if (!yes) return;
                  DB.outfits
                    .remove(outfit.outfit_id)
                    .then(function () {
                      return App.reloadProfileData();
                    })
                    .then(function () {
                      close();
                      App.render();
                      U.toastOk('已删除');
                    });
                });
              },
            },
            '删除'
          )
        );
      },
    });
  }

  /* ---------------------------------------------------------------------
     心愿单
     --------------------------------------------------------------------- */
  function loadWishlist() {
    var p = App.state.profile;
    if (!p) return;
    DB.wishlist.list(p.profile_id).then(function (list) {
      S.wishlist = list;
      /* 只重绘心愿单区域，避免整页重绘导致滚动跳动 */
      var host = document.getElementById('wish-section');
      if (host) paintWish(host);
    });
  }

  /* 心愿单区块：外层容器带 id，内容由 paintWish 填，便于局部刷新 */
  function buildWishSection() {
    var box = h('div', { class: 'section', id: 'wish-section' });
    paintWish(box);
    return box;
  }

  function paintWish(box) {
    U.clear(box);

    box.appendChild(
      h(
        'div',
        { class: 'section-head' },
        h('div', { class: 'section-title' }, '心愿单'),
        h(
          'button',
          { class: 'btn btn-sm btn-ghost', type: 'button', onclick: openWishForm },
          '＋ 记一个'
        )
      )
    );

    if (!S.wishlist.length) {
      box.appendChild(
        h('p', { class: 'field-hint' }, '缺什么记在这里，下次逛街照着买。比如「黑色直筒裤，预算 300」。')
      );
      return box;
    }

    var list = h('div', { class: 'list' });
    S.wishlist.forEach(function (w) {
      list.appendChild(
        h(
          'div',
          { class: 'list-row' },
          h('span', { class: 'li-ico', html: UI.icon.heart }),
          h(
            'span',
            { class: 'li-main' },
            h('span', { class: 'li-title' }, (w.color || '任意颜色') + ' · ' + (w.category || '任意品类')),
            h(
              'span',
              { class: 'li-sub' },
              (w.budget === '' || w.budget === undefined || w.budget === null ? '没定预算' : '预算 ' + U.fmtPrice(w.budget)) +
                ' · ' + U.fmtDate(String(w.created_at || '').slice(0, 10))
            )
          ),
          h(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              'aria-label': '删除心愿',
              onclick: function () {
                DB.wishlist.remove(w.wish_id).then(function () {
                  loadWishlist();
                  U.toast('已删除');
                });
              },
            },
            '✕'
          )
        )
      );
    });
    box.appendChild(list);
    return box;
  }

  function openWishlist() {
    U.sheet({
      title: '心愿单',
      body: function () {
        var box = h('div');
        paintWish(box);
        return box;
      },
      footer: function (close) {
        return h(
          'button',
          { class: 'btn btn-primary btn-block', type: 'button', onclick: function () { close(); openWishForm(); } },
          '＋ 记一个新的'
        );
      },
    });
  }

  function openWishForm() {
    var draft = { category: '', color: '', budget: '' };

    var catChips = UI.chips(R.CATEGORIES, {
      selected: '',
      small: true,
      onPick: function (v) {
        draft.category = v;
      },
    });
    var colorBox = App.ui.swatchGrid('', function (v) {
      draft.color = v;
    }, { allowClear: true });
    var budgetInput = h('input', {
      class: 'input',
      type: 'number',
      inputmode: 'decimal',
      min: '0',
      placeholder: '例如 300（可跳过）',
    });
    budgetInput.addEventListener('input', function () {
      draft.budget = budgetInput.value;
    });

    U.sheet({
      title: '记一个心愿',
      body: h(
        'div',
        null,
        UI.field('想买的品类', catChips),
        UI.field('想要的颜色', colorBox),
        UI.field('预算（可跳过）', budgetInput),
        h('p', { class: 'field-hint' }, '存下来以后，逛街或者网购时可以对着这个清单买，补上衣橱缺的那一块。')
      ),
      footer: function (close) {
        return h(
          'button',
          {
            class: 'btn btn-primary btn-block',
            type: 'button',
            onclick: function () {
              if (!draft.category && !draft.color) {
                U.toastWarn('至少选个品类或颜色');
                return;
              }
              var p = App.state.profile;
              DB.wishlist
                .save({
                  profile_id: p.profile_id,
                  category: draft.category,
                  color: draft.color,
                  budget: draft.budget === '' ? '' : Number(draft.budget),
                })
                .then(function () {
                  close();
                  loadWishlist();
                  U.toastOk('已记到心愿单');
                })
                .catch(function (err) {
                  U.toastErr(err.message || '保存失败');
                });
            },
          },
          '保存心愿'
        );
      },
    });
  }

  V.mixer = {
    render: render,
    reset: function () {
      S.picked = { top: null, bottom: null, shoes: null, outer: null, acc: null };
      S.extend = null;
      S.anchor = null;
      S.wishlist = [];
    },
  };
})();
