/* ==========================================================================
   views/home.js —— 首页「明天穿什么」
   天气卡 + 场景选择 + 生成明日穿搭 + 主推/备选 + 换一套/保存/打卡
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var R = App.rules;
  var UI = App.ui;
  var W = App.weather;
  var RC = App.recommend;
  var DB = App.db;
  var h = U.h;

  var V = (App.views = App.views || {});

  /* 页面内的临时状态（切 Tab 不丢） */
  var S = {
    weather: null,
    weatherErr: '',
    weatherLoading: false,
    result: null,
    outfitId: null,
    checkedIn: false,
    generating: false,
  };

  V.home = {
    render: render,
    /* 换档案时清空，避免看到上一个档案的天气和搭配 */
    reset: function () {
      S.weather = null;
      S.weatherErr = '';
      S.weatherLoading = false;
      S.result = null;
      S.outfitId = null;
      S.checkedIn = false;
      S.generating = false;
      App.state.weather = null;
    },
  };

  /* ---------------------------------------------------------------------
     渲染
     --------------------------------------------------------------------- */
  function render(root) {
    var p = App.state.profile;
    if (!p) return;

    U.clear(root);
    root.classList.remove('no-tabbar');

    root.appendChild(
      UI.appbar({
        title: '明天穿什么',
        sub: p.nickname + ' · ' + (p.city || '还没设城市'),
        right: h(
          'button',
          {
            class: 'btn btn-icon btn-sm',
            type: 'button',
            'aria-label': '刷新天气',
            style: { minHeight: '38px', width: '38px' },
            onclick: function () {
              if (!p.city) {
                pickCityNow();
                return;
              }
              loadWeather(true);
            },
          },
          h('span', { html: UI.icon.refresh, style: { display: 'flex', width: '18px' } })
        ),
      })
    );

    var page = h('div', { class: 'page' });

    /* ---- 1. 天气卡 ---- */
    page.appendChild(buildWeatherSection(p));

    /* ---- 2. 场景选择 ---- */
    page.appendChild(buildSceneSection());

    /* ---- 3. 生成按钮 ---- */
    page.appendChild(
      h(
        'div',
        { style: { marginTop: '16px' } },
        h(
          'button',
          {
            class: 'btn btn-primary btn-lg',
            type: 'button',
            disabled: S.generating,
            onclick: generate,
          },
          S.generating ? h('span', { class: 'spinner' }) : null,
          S.generating ? '正在挑衣服…' : S.result ? '重新生成一套' : '生成明日穿搭'
        )
      )
    );

    /* ---- 4. 结果区 ---- */
    var resultBox = h('div', { style: { marginTop: '18px' } });
    page.appendChild(resultBox);
    renderResult(resultBox);

    root.appendChild(page);

    /* 自动取一次天气 */
    if (p.city && !S.weather && !S.weatherLoading) {
      loadWeather(false);
    }
  }

  /* ---------------- 天气区 ---------------- */
  function buildWeatherSection(p) {
    var box = h('div');

    if (!p.city) {
      box.appendChild(
        h(
          'div',
          { class: 'card' },
          h('h2', { class: 'h2' }, '先选一个城市'),
          h('p', { class: 'small' }, '知道明天的天气，才能推荐合适的厚薄。城市只用来查天气，不会上传任何个人信息。'),
          h(
            'button',
            { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '12px' }, onclick: pickCityNow },
            '选择城市'
          )
        )
      );
      return box;
    }

    if (S.weather) {
      box.appendChild(
        UI.weatherCard(S.weather, {
          onEditCity: pickCityNow,
        })
      );
      return box;
    }

    if (S.weatherErr) {
      box.appendChild(
        h(
          'div',
          { class: 'card' },
          h('h2', { class: 'h2' }, '天气没取到'),
          h('p', { class: 'small', style: { lineHeight: '1.7' } }, S.weatherErr),
          h(
            'div',
            { class: 'wrap', style: { marginTop: '12px' } },
            h(
              'button',
              {
                class: 'btn btn-primary',
                type: 'button',
                onclick: function () {
                  loadWeather(true);
                },
              },
              '重试'
            ),
            h('button', { class: 'btn', type: 'button', onclick: pickCityNow }, '手动选城市')
          ),
          h(
            'p',
            { class: 'field-hint', style: { marginTop: '10px' } },
            '如果一直失败，检查一下手机有没有联网；也可以在没网的情况下先用「搭配」页手动搭配。'
          )
        )
      );
      return box;
    }

    box.appendChild(h('div', { class: 'weather-skeleton' }));
    return box;
  }

  /* ---------------- 场景区 ---------------- */
  function buildSceneSection() {
    var list = R.sceneList && R.sceneList.length ? R.sceneList : R.DEFAULT_SCENES;
    var box = h('div', { class: 'section' });
    box.appendChild(
      h(
        'div',
        { class: 'section-head' },
        h('div', { class: 'section-title' }, '明天去哪？'),
        h('div', { class: 'section-hint' }, '选一个主要场合')
      )
    );

    var chips = h('div', { class: 'chips' });
    list.forEach(function (scene) {
      var conf = R.sceneConf(scene) || {};
      var on = App.getScene() === scene;
      var btn = h(
        'button',
        { class: 'chip' + (on ? ' on' : ''), type: 'button' },
        (conf.emoji ? conf.emoji + ' ' : '') + scene
      );
      btn.addEventListener('click', function () {
        App.setScene(scene);
        U.$$('.chip', chips).forEach(function (el) {
          el.classList.remove('on');
        });
        btn.classList.add('on');
        /* 场景变了，旧结果作废 */
        S.result = null;
        S.outfitId = null;
        S.checkedIn = false;
        App.render();
      });
      chips.appendChild(btn);
    });
    box.appendChild(chips);

    var conf = R.sceneConf(App.getScene());
    if (conf && conf.advice) {
      box.appendChild(h('div', { class: 'field-hint', style: { marginTop: '8px' } }, '场景提示：' + conf.advice));
    }
    return box;
  }

  /* ---------------- 结果区 ---------------- */
  function renderResult(box) {
    U.clear(box);
    var p = App.state.profile;

    if (!App.state.items.length) {
      box.appendChild(
        UI.empty({
          icon: 'hanger',
          title: '衣橱还是空的',
          text: '先拍 3~5 件常穿的衣服（上衣、裤子、鞋各一件就够生成一套），再来这里生成明日穿搭。',
          actionLabel: '去添加衣服',
          onAction: function () {
            App.go('wardrobe');
          },
        })
      );
      return;
    }

    if (S.generating) {
      box.appendChild(UI.loading('正在从你的衣橱里挑衣服…'));
      return;
    }

    if (!S.result) {
      box.appendChild(
        h(
          'div',
          { class: 'card', style: { textAlign: 'center', padding: '22px 16px' } },
          h('div', { class: 'small', style: { lineHeight: '1.7' } }, '选好场景，点上面的按钮，看看明天穿什么。'),
          h(
            'div',
            { class: 'tiny', style: { marginTop: '8px' } },
            '衣橱里现在有 ' + App.state.items.length + ' 件衣服'
          )
        )
      );
      return;
    }

    var res = S.result;

    if (!res.ok) {
      box.appendChild(
        h(
          'div',
          { class: 'card' },
          h('h2', { class: 'h2' }, '还凑不齐一套'),
          h('p', { class: 'small', style: { lineHeight: '1.75' } }, res.missingText || '衣物不足'),
          h(
            'p',
            { class: 'field-hint', style: { marginTop: '8px' } },
            '当前筛选条件：' + Math.round(res.tempC || 0) + '℃ · ' + (res.scene || App.getScene()) +
              '，衣橱里符合条件的有 ' + (res.poolSize || 0) + ' 件。'
          ),
          h(
            'button',
            {
              class: 'btn btn-primary btn-block',
              type: 'button',
              style: { marginTop: '12px' },
              onclick: function () {
                App.go('wardrobe');
              },
            },
            '去衣橱补充衣物'
          )
        )
      );
      return;
    }

    /* --- 主推 --- */
    var main = res.main;
    var notes = (main.colorResult && main.colorResult.notes) || [];

    var hero = h('div', { class: 'hero-look' });
    hero.appendChild(
      h(
        'div',
        { class: 'hero-look-head' },
        h('div', { class: 'hero-look-title' }, '明日主推'),
        h('span', { class: 'score-pill' }, '匹配度 ' + main.scorePct)
      )
    );
    hero.appendChild(UI.lookGrid(main.items));

    var reasonLines = [];
    if (notes.length) reasonLines.push(notes[0]);
    if (res.band && res.band.advice) reasonLines.push(res.band.advice);
    if (reasonLines.length) {
      var rBox = h('div', { class: 'hero-look-reason' });
      rBox.appendChild(h('b', null, '为什么是这套：'));
      rBox.appendChild(document.createTextNode(reasonLines.join('；') + '。'));
      hero.appendChild(rBox);
    }

    /* 单品清单 */
    var listBox = h('div', { class: 'wrap', style: { marginTop: '10px' } });
    main.items.forEach(function (it) {
      listBox.appendChild(
        h(
          'span',
          { class: 'tag' },
          (R.SLOT_LABEL[RC.slotOfItem(it)] || '') + '：' + (it.color_main || '') + (it.style ? '·' + it.style : '')
        )
      );
    });
    hero.appendChild(listBox);

    box.appendChild(hero);

    /* --- 操作按钮 --- */
    var actions = h('div', { class: 'wrap', style: { marginTop: '12px' } });

    actions.appendChild(
      h(
        'button',
        {
          class: 'btn grow',
          type: 'button',
          onclick: rotate,
        },
        '换一套'
      )
    );

    actions.appendChild(
      h(
        'button',
        {
          class: 'btn grow',
          type: 'button',
          onclick: saveOutfit,
        },
        '保存为我的搭配'
      )
    );

    actions.appendChild(
      h(
        'button',
        {
          class: 'btn ' + (S.checkedIn ? 'btn-ok' : 'btn-primary') + ' btn-block',
          type: 'button',
          disabled: S.checkedIn,
          onclick: checkIn,
        },
        S.checkedIn ? '✓ 已打卡（衣服穿着次数 +1）' : '就穿它了（打卡）'
      )
    );

    box.appendChild(actions);

    /* --- 备选 --- */
    if (res.alts && res.alts.length) {
      var altSection = h('div', { class: 'section' });
      altSection.appendChild(
        h(
          'div',
          { class: 'section-head' },
          h('div', { class: 'section-title' }, '其他 ' + res.alts.length + ' 套备选'),
          h('div', { class: 'section-hint' }, '点一下换到主推')
        )
      );

      var strip = h('div', { class: 'alt-strip' });
      res.alts.forEach(function (alt) {
        var card = h(
          'button',
          {
            class: 'alt-card',
            type: 'button',
            onclick: function () {
              swapWith(alt);
            },
          },
          h(
            'div',
            { class: 'alt-thumbs' },
            alt.items.slice(0, 4).map(function (it) {
              return UI.thumb(it);
            })
          ),
          h(
            'div',
            { class: 'alt-meta' },
            h('div', null, '匹配度 ' + alt.scorePct),
            h('div', { class: 'tiny' }, (alt.items[0] && alt.items[0].color_main ? alt.items[0].color_main : '') + ' 打头')
          )
        );
        strip.appendChild(card);
      });
      altSection.appendChild(strip);
      box.appendChild(altSection);
    }

    /* --- 底部小字 --- */
    box.appendChild(
      h(
        'p',
        { class: 'tiny', style: { marginTop: '14px', textAlign: 'center', lineHeight: '1.6' } },
        '这套从 ' + (res.poolSize || 0) + ' 件符合条件的衣服里挑出来的' +
          (res.rejected ? '（另有 ' + res.rejected + ' 件因为厚薄或场景不合适被排除）' : '')
      )
    );
  }

  /* ---------------------------------------------------------------------
     行为
     --------------------------------------------------------------------- */
  function pickCityNow() {
    var p = App.state.profile;
    App.pickCity({ current: p.city, query: p.city }).then(function (name) {
      if (!name) return;
      p.city = name;
      App.saveProfile(p).then(function (saved) {
        App.state.profile = saved;
        S.weather = null;
        S.weatherErr = '';
        S.result = null;
        App.render();
      });
    });
  }

  function loadWeather(force) {
    var p = App.state.profile;
    if (!p || !p.city) return;
    S.weatherLoading = true;
    S.weatherErr = '';
    if (!S.weather) App.render();

    W.load(p.city, { force: force })
      .then(function (w) {
        S.weatherLoading = false;
        S.weather = w;
        S.weatherErr = '';
        /* 同步到全局：搭配台和借鉴区都要用「明天多少度」来打分 */
        App.state.weather = w;
        if (w.stale && w.error) {
          U.toastWarn('网络不太好，显示的是上次的天气');
        }
        App.render();
      })
      .catch(function (err) {
        S.weatherLoading = false;
        S.weatherErr = err.message || '获取天气失败';
        App.state.weather = null;
        App.render();
      });
  }

  function generate() {
    var p = App.state.profile;
    if (!S.weather) {
      U.toastWarn(S.weatherErr ? '天气没取到，先重试或选城市' : '正在取天气，稍等一下');
      return;
    }
    if (!App.state.items.length) {
      U.toastWarn('衣橱还是空的，先去添加衣服');
      App.go('wardrobe');
      return;
    }

    S.generating = true;
    S.checkedIn = false;
    S.outfitId = null;
    App.render();

    /* 放到下一帧再算，让「正在挑衣服」先显示出来 */
    setTimeout(function () {
      var res;
      try {
        res = RC.daily({
          gender: p.gender,
          tempC: S.weather.tempAvg,
          scene: App.getScene(),
          items: App.state.items,
        });
      } catch (err) {
        S.generating = false;
        App.render();
        U.toastErr('生成失败：' + (err.message || err));
        return;
      }
      S.result = res;
      S.generating = false;
      App.render();
      if (!res.ok) {
        U.toastWarn(res.missingText || '衣物不足');
      }
    }, 50);
  }

  function rotate() {
    var res = S.result;
    if (!res || !res.ok) return;
    if (!res.alts || !res.alts.length) {
      U.toast('没有更多备选了，去衣橱多放几件衣服就有啦');
      return;
    }
    var next = res.alts.shift();
    res.alts.push(res.main);
    res.main = next;
    S.outfitId = null;
    S.checkedIn = false;
    App.render();
  }

  function swapWith(alt) {
    var res = S.result;
    if (!res || !res.ok) return;
    var idx = res.alts.indexOf(alt);
    if (idx === -1) return;
    var oldMain = res.main;
    res.main = alt;
    res.alts.splice(idx, 1, oldMain);
    S.outfitId = null;
    S.checkedIn = false;
    App.render();
    U.scrollTop();
  }

  /* 把当前主推存成一条 outfits 记录（保存和打卡共用） */
  function ensureOutfit() {
    var p = App.state.profile;
    if (S.outfitId) {
      return DB.outfits.get(S.outfitId).then(function (o) {
        if (o) return o;
        S.outfitId = null;
        return ensureOutfit();
      });
    }
    var items = (S.result.main.items || []).map(function (it) {
      return it.item_id;
    });
    return DB.outfits
      .save({
        profile_id: p.profile_id,
        items: items,
        scene: App.getScene(),
        source: 'daily',
      })
      .then(function (saved) {
        S.outfitId = saved.outfit_id;
        return saved;
      });
  }

  function saveOutfit() {
    if (!S.result || !S.result.ok) return;
    ensureOutfit()
      .then(function () {
        U.toastOk('已保存到「我的搭配」');
      })
      .catch(function (err) {
        U.toastErr(err.message || '保存失败');
      });
  }

  function checkIn() {
    if (!S.result || !S.result.ok || S.checkedIn) return;
    var p = App.state.profile;
    ensureOutfit()
      .then(function (outfit) {
        var ids = (S.result.main.items || []).map(function (it) {
          return it.item_id;
        });
        return DB.logs.add(p.profile_id, outfit.outfit_id, U.tomorrowStr(), ids);
      })
      .then(function () {
        S.checkedIn = true;
        return App.reloadItems();
      })
      .then(function () {
        App.render();
        U.toastOk('已打卡，这套衣服各 +1 次穿着');
      })
      .catch(function (err) {
        U.toastErr(err.message || '打卡失败');
      });
  }
})();
