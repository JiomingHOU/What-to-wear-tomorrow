/* ==========================================================================
   views/selftest.js —— 程序自检页
   用一组构造出来的假衣橱，把阶段4的自检清单跑一遍：
     1) 32℃ 和 3℃ 推荐的厚薄明显不同
     2) 选「通勤」不会推运动背心短裤，选「运动」会推运动类
     3) 红色上衣会优先配中性色下装
     4) 衣物不足时能正确提示缺什么
   另外检查热门穿搭是不是 48 条、字段名是否完全一致。
   入口：我的 → 关于 → 程序自检
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

  /* ---------------------------------------------------------------------
     构造一套假衣橱：6 件上衣 + 5 件下装 + 3 双鞋 + 3 件外套
     --------------------------------------------------------------------- */
  function fakeWardrobe() {
    var i = 0;
    function mk(category, color, style, thickness, sceneTags, gender) {
      i++;
      return {
        item_id: 'fake_' + i,
        profile_id: 'fake_profile',
        photo_url: '',
        category: category,
        color_main: color,
        color_sub: '',
        style: style,
        season_thickness: thickness,
        material: '棉',
        scene_tags: sceneTags || [],
        purchase_date: '',
        purchase_price: '',
        wear_count: 0,
        created_at: new Date().toISOString(),
        gender: gender || '女',
      };
    }
    return [
      mk('上衣', '白', '休闲', '薄夏装', ['休闲']),
      mk('上衣', '黑', '运动', '薄夏装', ['运动']),
      mk('上衣', '正红', '休闲', '薄夏装', ['休闲', '约会']),
      mk('上衣', '灰', '极简', '春秋常规', ['通勤']),
      mk('上衣', '驼', '极简', '厚针织', ['通勤']),
      mk('上衣', '黑', '极简', '厚外套', ['通勤', '商务']),
      mk('裤装', '卡其', '运动', '薄夏装', ['运动']),
      mk('裤装', '牛仔蓝', '休闲', '薄夏装', ['休闲']),
      mk('裤装', '黑', '通勤', '春秋常规', ['通勤', '商务']),
      mk('裤装', '深灰', '极简', '厚外套', ['通勤']),
      mk('鞋', '白', '运动', '薄夏装', ['运动', '休闲']),
      mk('鞋', '黑', '商务', '春秋常规', ['通勤', '商务']),
      mk('鞋', '黑', '休闲', '棉服羽绒', ['通勤']),
      mk('外套', '藏青', '商务', '厚外套', ['通勤', '商务']),
      mk('外套', '深蓝', '休闲', '棉服羽绒', ['休闲', '通勤']),
    ];
  }

  function avgLevel(items) {
    if (!items || !items.length) return 0;
    var sum = 0;
    items.forEach(function (it) {
      sum += R.levelIndex(it.season_thickness) || 0;
    });
    return sum / items.length;
  }

  function describe(res) {
    if (!res || !res.ok) return res && res.missingText ? res.missingText : '无结果';
    return res.main.items
      .map(function (it) {
        return it.category + '(' + it.color_main + '/' + it.season_thickness + ')';
      })
      .join(' + ');
  }

  /* ---------------------------------------------------------------------
     测试用例
     --------------------------------------------------------------------- */
  function buildTests() {
    var ward = fakeWardrobe();
    var tests = [];

    tests.push({
      name: '① 32℃ 与 3℃ 推荐的厚薄明显不同',
      run: function () {
        var hot = RC.daily({ gender: '女', tempC: 32, scene: '休闲', items: ward });
        var cold = RC.daily({ gender: '女', tempC: 3, scene: '休闲', items: ward });
        var a = avgLevel(hot.ok ? hot.main.items : []);
        var b = avgLevel(cold.ok ? cold.main.items : []);
        var pass = hot.ok && cold.ok && b - a >= 1.5;
        /* 热天不应该出现厚外套档位 */
        var hotHasThick = hot.ok
          ? hot.main.items.some(function (it) {
              return R.levelIndex(it.season_thickness) >= 4;
            })
          : true;
        return {
          pass: pass && !hotHasThick,
          detail:
            '32℃ → ' + describe(hot) + '（平均档位 ' + a.toFixed(1) + '）\n' +
            '3℃ → ' + describe(cold) + '（平均档位 ' + b.toFixed(1) + '）\n' +
            '要求：冷天平均档位至少比热天高 1.5，且热天不出现厚外套档位。',
        };
      },
    });

    tests.push({
      name: '② 选「通勤」不会推荐运动背心短裤',
      run: function () {
        /* 24℃ 时那件运动背心和运动短裤的厚薄是符合的，只能靠场景规则筛掉 */
        var res = RC.daily({ gender: '女', tempC: 24, scene: '通勤', items: ward });
        var all = res.ok ? res.main.items.concat.apply(res.main.items, res.alts.map(function (a) { return a.items; })) : [];
        var sporty = all.filter(function (it) {
          return it.style === '运动';
        });
        return {
          pass: res.ok && sporty.length === 0,
          detail:
            '通勤推荐：' + describe(res) + '\n' +
            '被场景规则排除的件数：' + (res.rejected || 0) + '\n' +
            '要求：推荐结果里不出现 style=运动 的单品。',
        };
      },
    });

    tests.push({
      name: '③ 选「运动」会推荐运动类单品',
      run: function () {
        var res = RC.daily({ gender: '女', tempC: 24, scene: '运动', items: ward });
        var hasSporty = res.ok
          ? res.main.items.some(function (it) {
              return it.style === '运动';
            })
          : false;
        return {
          pass: hasSporty,
          detail: '运动场景推荐：' + describe(res) + '\n要求：主推里至少有一件 style=运动 的单品。',
        };
      },
    });

    tests.push({
      name: '④ 红色上衣优先配中性色下装',
      run: function () {
        var red = ward.filter(function (it) {
          return it.color_main === '正红';
        })[0];
        var ex = RC.extend({ item: red, gender: '女', tempC: 24, scene: '休闲', items: ward });
        var top1 = ex.bottoms[0];
        var pass = !!top1 && R.isNeutral(top1.item.color_main);
        return {
          pass: pass,
          detail:
            '候选下装排序：' +
            (ex.bottoms.length
              ? ex.bottoms
                  .map(function (b) {
                    return b.item.color_main + '（' + b.score + '分）';
                  })
                  .join(' > ')
              : '无') +
            '\n第一名是：' + (top1 ? top1.item.color_main : '无') +
            '\n要求：第一名应该是中性色（黑/白/灰/米/卡其…）。',
        };
      },
    });

    tests.push({
      name: '⑤ 衣物不足时提示缺什么',
      run: function () {
        var noShoes = ward.filter(function (it) {
          return it.category !== '鞋';
        });
        var res = RC.daily({ gender: '女', tempC: 24, scene: '休闲', items: noShoes });
        var pass = !res.ok && (res.missing || []).indexOf('shoes') !== -1 && /鞋/.test(res.missingText || '');
        return {
          pass: pass,
          detail: '去掉所有鞋以后：ok=' + res.ok + '，提示=' + (res.missingText || '（没有提示）') + '\n要求：返回「缺少…鞋」这样的提示。',
        };
      },
    });

    tests.push({
      name: '⑥ 色彩规则：中性色组合优于三个亮色撞在一起',
      run: function () {
        var good = R.scoreColors(['黑', '白', '灰']);
        var bad = R.scoreColors(['正红', '黄', '紫']);
        return {
          pass: good.score > bad.score,
          detail:
            '黑+白+灰 = ' + good.score + ' 分（' + good.notes.join('；') + '）\n' +
            '正红+黄+紫 = ' + bad.score + ' 分（' + bad.notes.join('；') + '）\n' +
            '要求：前者高于后者。',
        };
      },
    });

    tests.push({
      name: '⑦ 热门穿搭 148 条，字段名与种子文件完全一致',
      run: function () {
        return DB.hotLooks.list().then(function (list) {
          var want = DB.HOT_LOOK_FIELDS;
          var bad = [];
          list.forEach(function (row) {
            var missing = want.filter(function (f) {
              return !(f in row);
            });
            var extra = Object.keys(row).filter(function (k) {
              return want.indexOf(k) === -1;
            });
            if (missing.length || extra.length) bad.push((row.look_id || '?') + ' 缺[' + missing.join(',') + '] 多[' + extra.join(',') + ']');
          });
          var female = list.filter(function (r) {
            return r.gender === '女';
          }).length;
          var male = list.filter(function (r) {
            return r.gender === '男';
          }).length;
          var seasons = {};
          list.forEach(function (r) {
            if (r.season) seasons[r.season] = (seasons[r.season] || 0) + 1;
          });
          return {
            pass: list.length === 148 && bad.length === 0 && female === 81 && male === 67,
            detail:
              '实际条数：' + list.length + '（要求 148 = 48 热门 + 50 历年 + 50 经典）\n' +
              '女 ' + female + ' 条 / 男 ' + male + ' 条（要求 81 / 67）\n' +
              '季节：' + Object.keys(seasons).sort().join('、') + '\n' +
              '字段要求：' + want.join('、') + '\n' +
              (bad.length ? '有问题的记录：' + bad.slice(0, 5).join('；') : '所有记录字段完全一致 ✓'),
          };
        });
      },
    });

    tests.push({
      name: '⑧ 规则文件是从 data/rules/ 读到的（不是内置默认值）',
      run: function () {
        return {
          pass: R.source === 'json',
          detail:
            '当前规则来源：' + R.source +
            (R.brokenFiles && R.brokenFiles.length ? '（读取失败：' + R.brokenFiles.join('；') + '）' : '') +
            '\n规则文件：data/rules/temperature.json、scene.json、color.json',
        };
      },
    });

    return tests;
  }

  /* ---------------------------------------------------------------------
     渲染自检页
     --------------------------------------------------------------------- */
  function renderTest(root, onBack) {
    U.clear(root);
    var prevHidden = document.getElementById('tabbar').hidden;
    document.getElementById('tabbar').hidden = true;
    root.classList.add('no-tabbar');

    root.appendChild(
      UI.appbar({
        title: '程序自检',
        sub: '用假数据验证推荐规则',
        right: h(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            onclick: function () {
              document.getElementById('tabbar').hidden = prevHidden;
              onBack();
            },
          },
          '返回'
        ),
      })
    );

    var page = h('div', { class: 'page' });
    var summary = h('div', { class: 'card', style: { marginBottom: '12px' } }, UI.loading('正在跑测试…'));
    page.appendChild(summary);
    var listBox = h('div');
    page.appendChild(listBox);
    root.appendChild(page);

    var tests = buildTests();
    var results = [];
    var chain = Promise.resolve();

    tests.forEach(function (t, idx) {
      chain = chain.then(function () {
        return Promise.resolve()
          .then(function () {
            return t.run();
          })
          .then(function (r) {
            results.push({ name: t.name, pass: !!(r && r.pass), detail: (r && r.detail) || '' });
          })
          .catch(function (err) {
            results.push({ name: t.name, pass: false, detail: '运行出错：' + (err && err.message ? err.message : String(err)) });
          })
          .then(function () {
            /* 每跑完一条就刷一次，进度看得见 */
            U.clear(summary);
            var passCount = results.filter(function (r) {
              return r.pass;
            }).length;
            summary.appendChild(
              h(
                'div',
                { class: 'row-between' },
                h('div', { style: { fontWeight: '700' } }, '进度 ' + (idx + 1) + ' / ' + tests.length),
                h('span', { class: passCount === results.length ? 'pass' : 'fail' }, '通过 ' + passCount + ' 条')
              )
            );
            summary.appendChild(
              h('div', { class: 'progress', style: { marginTop: '10px' } }, h('i', { style: { width: Math.round(((idx + 1) / tests.length) * 100) + '%' } }))
            );
          });
      });
    });

    chain.then(function () {
      U.clear(listBox);
      results.forEach(function (r) {
        listBox.appendChild(
          h(
            'div',
            { class: 'test-block' },
            h(
              'div',
              { class: 'test-head' },
              h('h3', null, r.name),
              h('span', { class: r.pass ? 'pass' : 'fail' }, r.pass ? '✓ 通过' : '✗ 未通过')
            ),
            r.detail ? h('pre', { class: 'code' }, r.detail) : null
          )
        );
      });

      var passCount = results.filter(function (r) {
        return r.pass;
      }).length;
      U.clear(summary);
      summary.appendChild(
        h(
          'div',
          { class: 'row-between' },
          h('div', { style: { fontWeight: '700' } }, '自检结果'),
          h('span', { class: passCount === results.length ? 'pass' : 'fail' }, passCount + ' / ' + results.length + ' 通过')
        )
      );
      summary.appendChild(
        h(
          'p',
          { class: 'small', style: { marginTop: '8px', lineHeight: '1.65' } },
          passCount === results.length
            ? '推荐引擎的规则都按预期生效了。这套数据是程序自己造的，不会影响你真实的衣橱。'
            : '有项目没通过，说明规则文件可能被改过，或者代码有问题。可以到 data/rules/ 里检查对应的配置。'
        )
      );
      summary.appendChild(
        h(
          'button',
          {
            class: 'btn btn-block',
            type: 'button',
            style: { marginTop: '12px' },
            onclick: function () {
              document.getElementById('tabbar').hidden = prevHidden;
              onBack();
            },
          },
          '返回'
        )
      );
    });
  }

  App.openSelfTest = function () {
    var prevTab = App.state.tab;
    renderTest(document.getElementById('view'), function () {
      App.go(prevTab || 'home');
    });
  };

  V.selftest = { renderTest: renderTest };
})();
