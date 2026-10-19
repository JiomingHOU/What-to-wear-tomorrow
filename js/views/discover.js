/* ==========================================================================
   views/discover.js —— 热门穿搭借鉴区
   - 顶部男女两个板块（默认当前档案性别，可切换）
   - 按季节、风格筛选
   - 每张卡片可以「用我的衣服复刻」：用纯规则匹配当前档案的衣橱
   - 当前天气和这条穿搭的温度区间明显不符时，给「不适合明天」的浅色提示
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var R = App.rules;
  var UI = App.ui;
  var h = U.h;

  var V = (App.views = App.views || {});

  var S = {
    gender: '',
    season: '',
    style: '',
    expanded: {},
  };

  var SEASONS = ['2026秋冬', '2026春夏', '2025秋冬', '2025春夏'];

  /* 风格筛选：热门穿搭的风格主题是自由文本，这里用关键词归到 7 个标准风格里 */
  var STYLE_KEYWORDS = {
    极简: ['极简', '静奢', '简约', 'Cleanfit', '老钱', '高级极简', '中性', '极简回潮', '智性'],
    通勤: ['通勤', '轻熟', '西装', 'Tailoring', '职场', '智性'],
    街头: ['街头', '高街', 'Y2K', '机能', 'Oversized', 'oversized', '松弛廓形', '复古运动', 'Retro', '解构'],
    学院: ['学院', 'Preppy', '校园', '少年感', '芭蕾'],
    度假: ['度假', '亚麻', 'Boho', '波嬉', '盐系', '海蓝', '帕斯蒂尔', '薄荷', '曼波'],
    运动: ['运动', '瑜伽', 'Athflow', 'Sportswear', '泳'],
    商务: ['商务', '正式', '动感西装'],
  };

  /* 场景 → 风格（辅助判断） */
  var SCENE_STYLE = {
    通勤: '通勤',
    商务: '商务',
    运动: '运动',
    校园: '学院',
    度假: '度假',
    街头: '街头',
  };

  function styleTagsOf(look) {
    var text = String(look.style_theme || '') + ' ' + String(look.items_desc || '');
    var tags = [];
    Object.keys(STYLE_KEYWORDS).forEach(function (style) {
      var hit = STYLE_KEYWORDS[style].some(function (kw) {
        return text.indexOf(kw) !== -1;
      });
      if (hit) tags.push(style);
    });
    (look.scene || []).forEach(function (scene) {
      var canonical = R.canonicalScene(scene);
      var mapped = SCENE_STYLE[canonical || scene];
      if (mapped && tags.indexOf(mapped) === -1) tags.push(mapped);
    });
    return tags;
  }

  /* ---------------------------------------------------------------------
     渲染
     --------------------------------------------------------------------- */
  function render(root) {
    var p = App.state.profile;
    U.clear(root);

    if (!S.gender) S.gender = p && p.gender === '男' ? '男' : '女';

    var looks = App.state.looks || [];
    var femaleCount = looks.filter(function (l) {
      return l.gender === '女';
    }).length;
    var maleCount = looks.filter(function (l) {
      return l.gender === '男';
    }).length;

    root.appendChild(
      UI.appbar({
        title: '借鉴区',
        sub: '热门穿搭 ' + looks.length + ' 条（女 ' + femaleCount + ' / 男 ' + maleCount + '）',
      })
    );

    var page = h('div', { class: 'page' });

    /* 男女切换 */
    page.appendChild(
      UI.segmented(
        [
          { value: '女', label: '女装 · ' + femaleCount },
          { value: '男', label: '男装 · ' + maleCount },
        ],
        S.gender,
        function (v) {
          S.gender = v;
          App.render();
        }
      )
    );

    /* 季节筛选 */
    page.appendChild(
      h('div', { class: 'section-title', style: { fontSize: '13px', margin: '16px 2px 8px' } }, '季节')
    );
    var seasonRow = h('div', { class: 'chip-scroll' });
    [{ v: '', label: '全部' }]
      .concat(
        SEASONS.map(function (s) {
          return { v: s, label: s };
        })
      )
      .forEach(function (opt) {
        var on = S.season === opt.v;
        var b = h('button', { class: 'chip chip-sm' + (on ? ' on' : ''), type: 'button' }, opt.label);
        b.addEventListener('click', function () {
          S.season = opt.v;
          App.render();
        });
        seasonRow.appendChild(b);
      });
    page.appendChild(seasonRow);

    /* 风格筛选 */
    page.appendChild(
      h('div', { class: 'section-title', style: { fontSize: '13px', margin: '14px 2px 8px' } }, '风格')
    );
    var styleRow = h('div', { class: 'chip-scroll' });
    [{ v: '', label: '全部' }]
      .concat(
        R.STYLES.map(function (s) {
          return { v: s, label: s };
        })
      )
      .forEach(function (opt) {
        var on = S.style === opt.v;
        var b = h('button', { class: 'chip chip-sm' + (on ? ' on' : ''), type: 'button' }, opt.label);
        b.addEventListener('click', function () {
          S.style = opt.v;
          App.render();
        });
        styleRow.appendChild(b);
      });
    page.appendChild(styleRow);

    /* 列表 */
    var listBox = h('div', { style: { marginTop: '16px' } });
    page.appendChild(listBox);

    if (!looks.length) {
      listBox.appendChild(
        UI.empty({
          icon: 'info',
          title: '热门穿搭还没加载',
          text: App.state.seedError
            ? '种子数据导入失败：' + App.state.seedError
            : '第一次打开时应该自动导入 48 条热门穿搭。可以点下面重新导入试试。',
          actionLabel: '重新导入',
          onAction: function () {
            App.db.ensureSeed({ force: true }).then(function (res) {
              U.toastOk('已加载 ' + res.imported + ' 条');
              return App.db.hotLooks.list().then(function (list) {
                App.state.looks = list;
                App.render();
              });
            });
          },
        })
      );
      root.appendChild(page);
      return;
    }

    var filtered = looks.filter(function (l) {
      if (l.gender !== S.gender) return false;
      if (S.season && l.season !== S.season) return false;
      if (S.style && styleTagsOf(l).indexOf(S.style) === -1) return false;
      return true;
    });

    if (!filtered.length) {
      listBox.appendChild(
        UI.empty({
          icon: 'search',
          title: '这个筛选下没有穿搭',
          text: '换个季节或风格试试，或者点「全部」看这一性别的所有穿搭。',
          actionLabel: '清除筛选',
          onAction: function () {
            S.season = '';
            S.style = '';
            App.render();
          },
        })
      );
      root.appendChild(page);
      return;
    }

    var tomorrow = App.state.weather && App.state.weather.tomorrow;
    var tempNow = App.state.weather && typeof App.state.weather.tempAvg === 'number' ? App.state.weather.tempAvg : null;

    filtered.forEach(function (look) {
      listBox.appendChild(buildCard(look, tempNow));
    });

    listBox.appendChild(
      h(
        'p',
        { class: 'tiny', style: { marginTop: '14px', textAlign: 'center', lineHeight: '1.6' } },
        '共 ' + filtered.length + ' 条' +
          (tempNow === null ? '（还没取到明天天气，温度提示暂不显示）' : '（明天约 ' + Math.round(tempNow) + '℃，已标注适不适合）')
      )
    );

    root.appendChild(page);
  }

  /* ---------------------------------------------------------------------
     单张卡片
     --------------------------------------------------------------------- */
  function buildCard(look, tempNow) {
    var colors = R.extractColors(look.colors);
    var tags = styleTagsOf(look);

    /* 温度是否匹配明天 */
    var tempMismatch = false;
    var tempNote = '';
    if (tempNow !== null && tempNow !== undefined) {
      var lo = Number(look.temp_min);
      var hi = Number(look.temp_max);
      if (tempNow < lo - 2) {
        tempMismatch = true;
        tempNote = '明天约 ' + Math.round(tempNow) + '℃，比这套的 ' + lo + '~' + hi + '℃ 还冷，穿它会冷，先看看别的。';
      } else if (tempNow > hi + 2) {
        tempMismatch = true;
        tempNote = '明天约 ' + Math.round(tempNow) + '℃，比这套的 ' + lo + '~' + hi + '℃ 热，穿它会热，先看看别的。';
      }
    }

    var card = h('div', { class: 'look-card' + (tempMismatch ? ' dim' : '') });

    card.appendChild(
      h(
        'div',
        { class: 'look-card-head' },
        h('div', { class: 'look-theme' }, look.style_theme || '（无风格主题）'),
        h('span', { class: 'look-temp' }, look.temp_min + '~' + look.temp_max + '℃')
      )
    );

    card.appendChild(h('div', { class: 'look-items' }, look.items_desc || ''));

    /* 颜色 */
    if (colors.length) {
      var colorRow = h('div', { class: 'look-colors' }, h('span', { class: 'tiny' }, '色系：'));
      colors.forEach(function (c) {
        colorRow.appendChild(UI.colorDot(c, 14));
        colorRow.appendChild(h('span', { style: { marginRight: '6px' } }, c));
      });
      card.appendChild(colorRow);
    } else if (look.colors) {
      card.appendChild(h('div', { class: 'look-colors' }, h('span', { class: 'tiny' }, '色系：' + look.colors)));
    }

    /* 标签：先场景（灰），再风格（粉），季节（绿）。
       注意要去重——「通勤」既是场景也是风格，不去重会显示两遍。 */
    var tagBox = h('div', { class: 'look-tags' });
    var shownTags = {};
    (look.scene || []).forEach(function (s) {
      if (shownTags[s]) return;
      shownTags[s] = true;
      tagBox.appendChild(UI.tag(s));
    });
    tags.forEach(function (t) {
      if (shownTags[t]) return;
      shownTags[t] = true;
      tagBox.appendChild(UI.tag(t, 'tag-brand'));
    });
    if (look.season && !shownTags[look.season]) {
      shownTags[look.season] = true;
      tagBox.appendChild(UI.tag(look.season, 'tag-ok'));
    }
    card.appendChild(tagBox);

    /* 不适合明天的提示 */
    if (tempMismatch) {
      card.appendChild(h('div', { class: 'not-now' }, '⏳ 不适合明天：' + tempNote));
    }

    /* 底部：来源 + 复刻 */
    var foot = h('div', { class: 'look-foot' });

    var sourceBtn = h(
      'button',
      {
        class: 'look-source',
        type: 'button',
        style: { textAlign: 'left', minHeight: '44px' },
        onclick: function () {
          S.expanded[look.look_id] = !S.expanded[look.look_id];
          App.render();
        },
      },
      '来源：' + (look.source || '未标注') + (look.source_url ? ' ⌄' : '')
    );
    foot.appendChild(sourceBtn);

    var rep = h(
      'button',
      {
        class: 'btn btn-sm btn-soft',
        type: 'button',
        style: { flex: 'none' },
        onclick: function () {
          openReplicate(look);
        },
      },
      '用我的衣服复刻'
    );
    foot.appendChild(rep);

    card.appendChild(foot);

    /* 展开的来源链接 */
    if (S.expanded[look.look_id] && look.source_url) {
      card.appendChild(
        h(
          'div',
          { style: { marginTop: '8px' } },
          h(
            'a',
            {
              href: look.source_url,
              target: '_blank',
              rel: 'noopener noreferrer',
              class: 'small',
              style: { wordBreak: 'break-all', display: 'block', minHeight: '44px', paddingTop: '10px' },
            },
            look.source_url
          ),
          h('div', { class: 'tiny' }, '链接会跳到外部网站，内容由原站负责。')
        )
      );
    }

    return card;
  }

  /* ---------------------------------------------------------------------
     复刻：纯规则匹配当前档案衣橱
     --------------------------------------------------------------------- */
  function openReplicate(look) {
    var items = (App.state.items || []).filter(function (it) {
      var g = it.gender || '中性';
      return g === '中性' || g === look.gender;
    });

    var lookColors = R.extractColors(look.colors);
    var colorInfo = R.extractColorInfo(look.colors);

    function colorMatch(item) {
      if (!lookColors.length) return true; // 这条穿搭没给出可解析的颜色，就不卡颜色
      var mine = [item.color_main, item.color_sub].filter(Boolean);
      if (!mine.length) return false;
      var hit = mine.some(function (c) {
        if (lookColors.indexOf(c) !== -1) return true;
        /* 同色系也算接近 */
        var fam = R.familyOf(c);
        return lookColors.some(function (lc) {
          return R.familyOf(lc) === fam;
        });
      });
      if (hit) return true;
      /* 这条穿搭强调中性色时，中性色的单品也算能配 */
      if (colorInfo.mentionsNeutral) {
        return mine.some(function (c) {
          return R.isNeutral(c);
        });
      }
      return false;
    }

    function sceneMatch(item) {
      var tags = item.scene_tags || [];
      if (!tags.length) return true; // 没打场景标签的当作万能
      return R.sceneOverlap(tags, look.scene || []);
    }

    var matched = items.filter(function (it) {
      return colorMatch(it) && sceneMatch(it);
    });

    /* 按槽位分组 */
    var bySlot = { top: [], bottom: [], shoes: [], outer: [], acc: [] };
    matched.forEach(function (it) {
      var s = App.recommend.slotOfItem(it);
      if (s === 'onepiece') s = 'top';
      if (bySlot[s]) bySlot[s].push(it);
    });

    var needed = ['top', 'bottom', 'shoes'];
    var missing = needed.filter(function (s) {
      return !bySlot[s].length;
    });

    var body = h('div');

    body.appendChild(
      h(
        'div',
        { class: 'small', style: { lineHeight: '1.7', marginBottom: '10px' } },
        h('b', null, look.style_theme || '这套穿搭'),
        h('br'),
        look.items_desc || ''
      )
    );

    body.appendChild(
      h(
        'div',
        { class: 'look-colors', style: { marginBottom: '10px' } },
        h('span', { class: 'tiny' }, '需要的主色：'),
        lookColors.length
          ? lookColors.map(function (c) {
              return h('span', { class: 'row', style: { gap: '4px', marginRight: '8px' } }, UI.colorDot(c, 14), h('span', { class: 'small' }, c));
            })
          : h('span', { class: 'small' }, look.colors || '未标注')
      )
    );

    if (!items.length) {
      body.appendChild(
        h('div', { class: 'not-now' }, '当前档案还没有' + look.gender + '装的衣服。先去衣橱录几件，再来复刻。')
      );
    } else if (!matched.length) {
      body.appendChild(
        h(
          'div',
          { class: 'not-now' },
          '衣橱里暂时没有能对上这套的衣服。' +
            (lookColors.length ? '缺少这些颜色的单品：' + lookColors.join('、') + '。' : '') +
            '先把颜色/场景标签补一补，匹配会更准。'
        )
      );
    } else {
      var slotNames = { top: '上衣', bottom: '下装', shoes: '鞋', outer: '外套', acc: '配饰' };
      ['top', 'bottom', 'shoes', 'outer', 'acc'].forEach(function (slot) {
        var list = bySlot[slot];
        if (!list.length) return;
        body.appendChild(
          h('div', { class: 'section-title', style: { fontSize: '13px', margin: '14px 0 8px' } }, slotNames[slot] + '（' + list.length + '）')
        );
        var grid = h('div', { class: 'picker-grid' });
        list.forEach(function (it) {
          grid.appendChild(
            h(
              'div',
              { class: 'picker-cell' },
              UI.thumb(it),
              h('div', { class: 'picker-cell-name' }, (it.color_main || '') + '·' + it.category)
            )
          );
        });
        body.appendChild(grid);
      });
    }

    /* 缺件提示 */
    if (missing.length) {
      var slotNames2 = { top: '上衣', bottom: '下装', shoes: '鞋' };
      var colorHint = lookColors.length ? lookColors.slice(0, 2).join('或') : '同色系';
      body.appendChild(
        h(
          'div',
          { class: 'not-now', style: { marginTop: '12px' } },
          '还缺：' +
            missing
              .map(function (s) {
                return colorHint + '的' + slotNames2[s];
              })
              .join('、')
        )
      );
    } else if (matched.length) {
      body.appendChild(
        h('div', { class: 'tag tag-ok', style: { marginTop: '12px' } }, '✓ 这套你的衣橱基本能凑齐')
      );
    }

    /* 加心愿单 */
    if (missing.length) {
      body.appendChild(
        h(
          'button',
          {
            class: 'btn btn-soft btn-block',
            type: 'button',
            style: { marginTop: '14px' },
            onclick: function () {
              var p = App.state.profile;
              var slotMap = { top: '上衣', bottom: '裤装', shoes: '鞋' };
              var chain = Promise.resolve();
              missing.forEach(function (s) {
                chain = chain.then(function () {
                  return App.db.wishlist.save({
                    profile_id: p.profile_id,
                    category: slotMap[s] || '上衣',
                    color: lookColors[0] || '',
                    budget: '',
                  });
                });
              });
              chain.then(function () {
                U.toastOk('已把这 ' + missing.length + ' 件缺的记到心愿单');
              });
            },
          },
          '把缺的记到心愿单'
        )
      );
    }

    U.sheet({ title: '用我的衣服复刻', body: body });
  }

  V.discover = {
    render: render,
    reset: function () {
      S.gender = '';
      S.season = '';
      S.style = '';
      S.expanded = {};
    },
  };
})();
