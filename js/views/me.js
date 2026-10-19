/* ==========================================================================
   views/me.js —— 「我的」：档案管理、衣柜报告、备份、存储、关于
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var R = App.rules;
  var UI = App.ui;
  var DB = App.db;
  var h = U.h;

  var V = (App.views = App.views || {});

  var S = {
    logs: null,
    loadingLogs: false,
    storage: null,
    logsFor: '',
  };

  /* ---------------------------------------------------------------------
     渲染
     --------------------------------------------------------------------- */
  function render(root) {
    var p = App.state.profile;
    if (!p) return;

    U.clear(root);
    root.appendChild(UI.appbar({ title: '我的' }));

    var page = h('div', { class: 'page' });
    var items = App.state.items || [];
    var outfits = App.state.outfits || [];

    /* --- 当前档案 --- */
    page.appendChild(buildCurrentProfile(p));

    /* --- 概览 --- */
    page.appendChild(
      h(
        'div',
        { class: 'stat-grid', style: { marginTop: '12px' } },
        stat(items.length, '件衣服'),
        stat(outfits.length, '套搭配'),
        stat(S.logs ? S.logs.length : '—', '次打卡')
      )
    );

    /* --- 档案管理 --- */
    page.appendChild(
      h(
        'div',
        { class: 'section' },
        h(
          'div',
          { class: 'section-head' },
          h('div', { class: 'section-title' }, '家人档案'),
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: addProfile }, '＋ 新建')
        ),
        buildProfileList()
      )
    );

    /* --- 衣柜报告 --- */
    page.appendChild(buildReport());

    /* --- 打卡记录 --- */
    page.appendChild(buildLogs());

    /* --- 数据与备份 --- */
    page.appendChild(buildDataSection());

    /* --- 关于 --- */
    page.appendChild(buildAbout());

    root.appendChild(page);

    /* 异步加载打卡记录 */
    if (!S.logs && !S.loadingLogs) {
      loadLogs();
    }
    if (!S.storage) {
      DB.estimate().then(function (e) {
        S.storage = e;
        var host = document.getElementById('storage-line');
        if (host) {
          host.textContent =
            '已用 ' + U.fmtBytes(e.usage) + (e.quota ? ' / 可用约 ' + U.fmtBytes(e.quota) : '');
        }
      });
    }
  }

  function stat(num, label) {
    return h('div', { class: 'stat' }, h('b', null, String(num)), h('span', null, label));
  }

  /* ---------------- 当前档案 ---------------- */
  function buildCurrentProfile(p) {
    return h(
      'div',
      { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '13px' } },
      h('div', { class: 'avatar ' + (p.gender === '男' ? 'male' : 'female') }, (p.nickname || '我').slice(0, 1)),
      h(
        'div',
        { class: 'grow' },
        h('div', { style: { fontSize: '17px', fontWeight: '700' } }, p.nickname),
        h(
          'div',
          { class: 'small', style: { marginTop: '2px' } },
          [p.gender, p.city || '未设城市', p.height_weight || ''].filter(Boolean).join(' · ')
        ),
        (p.style_prefs || []).length
          ? h(
              'div',
              { class: 'wrap', style: { marginTop: '6px' } },
              (p.style_prefs || []).map(function (s) {
                return UI.tag(s);
              })
            )
          : null
      ),
      h(
        'button',
        { class: 'btn btn-sm', type: 'button', onclick: function () { editProfile(p); } },
        '编辑'
      )
    );
  }

  /* ---------------- 档案列表 ---------------- */
  function buildProfileList() {
    var box = h('div');
    (App.state.profiles || []).forEach(function (p) {
      var on = App.state.profile && p.profile_id === App.state.profile.profile_id;
      var row = h(
        'div',
        {
          class: 'profile-card' + (on ? ' on' : ''),
          role: 'button',
          tabindex: '0',
          onclick: function () {
            switchTo(p);
          },
        },
        h('div', { class: 'avatar ' + (p.gender === '男' ? 'male' : 'female') }, (p.nickname || '我').slice(0, 1)),
        h(
          'div',
          { class: 'grow' },
          h('div', { style: { fontWeight: '600' } }, p.nickname),
          h('div', { class: 'tiny' }, [p.gender, p.city || '未设城市'].join(' · '))
        ),
        on
          ? h('span', { class: 'tag tag-brand' }, '当前')
          : h('span', { class: 'li-arrow' }, '切换')
      );
      box.appendChild(row);
    });
    return box;
  }

  function switchTo(p) {
    if (App.state.profile && p.profile_id === App.state.profile.profile_id) return;
    /* switchProfile 内部已经会清空各页面的临时状态（天气、搭配、筛选、打卡记录） */
    App.switchProfile(p.profile_id)
      .then(function () {
        U.toastOk('已切换到「' + p.nickname + '」');
        App.go('home', { top: true });
      })
      .catch(function (err) {
        U.toastErr(err.message || '切换失败');
      });
  }

  function addProfile() {
    App.profileForm(null).then(function (saved) {
      if (!saved) return;
      /* App.saveProfile 内部已经把 state.profiles 刷新过了，这里只要重绘 */
      App.render();
    });
  }

  function editProfile(p) {
    App.profileForm(p).then(function (saved) {
      if (!saved) return;
      return App.switchProfile(saved.profile_id).then(function () {
        return DB.profiles.list().then(function (list) {
          App.state.profiles = list;
          App.render();
        });
      });
    });
  }

  /* ---------------- 衣柜报告 ---------------- */
  function buildReport() {
    var items = App.state.items || [];
    var box = h('div', { class: 'section' });
    box.appendChild(
      h(
        'div',
        { class: 'section-head' },
        h('div', { class: 'section-title' }, '衣柜报告'),
        h('div', { class: 'section-hint' }, '看清自己有什么')
      )
    );

    if (!items.length) {
      box.appendChild(h('p', { class: 'field-hint' }, '衣橱里有衣服以后，这里会显示品类和颜色的分布，还有哪些衣服很久没穿了。'));
      return box;
    }

    var card = h('div', { class: 'card' });

    /* 品类分布 */
    var byCat = {};
    items.forEach(function (it) {
      byCat[it.category] = (byCat[it.category] || 0) + 1;
    });
    var catKeys = Object.keys(byCat).sort(function (a, b) {
      return byCat[b] - byCat[a];
    });
    var maxCat = Math.max.apply(
      null,
      catKeys.map(function (k) {
        return byCat[k];
      })
    );
    card.appendChild(h('div', { class: 'section-title', style: { fontSize: '13px', marginBottom: '10px' } }, '品类分布'));
    catKeys.forEach(function (k) {
      card.appendChild(UI.barRow(k, byCat[k], maxCat));
    });

    /* 颜色分布 */
    var byColor = {};
    items.forEach(function (it) {
      if (!it.color_main) return;
      byColor[it.color_main] = (byColor[it.color_main] || 0) + 1;
    });
    var colorKeys = Object.keys(byColor).sort(function (a, b) {
      return byColor[b] - byColor[a];
    });
    if (colorKeys.length) {
      card.appendChild(h('hr', { class: 'divider' }));
      card.appendChild(h('div', { class: 'section-title', style: { fontSize: '13px', marginBottom: '10px' } }, '颜色分布（前 6）'));
      var maxColor = Math.max.apply(
        null,
        colorKeys.map(function (k) {
          return byColor[k];
        })
      );
      colorKeys.slice(0, 6).forEach(function (k) {
        card.appendChild(UI.barRow(k, byColor[k], maxColor));
      });
    }

    /* 穿得最多 / 最久没穿 */
    var sorted = items.slice().sort(function (a, b) {
      return (Number(b.wear_count) || 0) - (Number(a.wear_count) || 0);
    });
    var mostWorn = sorted.filter(function (it) {
      return Number(it.wear_count) > 0;
    }).slice(0, 3);
    var neverWorn = sorted.filter(function (it) {
      return !Number(it.wear_count);
    }).slice(0, 5);

    if (mostWorn.length) {
      card.appendChild(h('hr', { class: 'divider' }));
      card.appendChild(h('div', { class: 'section-title', style: { fontSize: '13px', marginBottom: '8px' } }, '穿得最多'));
      mostWorn.forEach(function (it) {
        card.appendChild(
          h(
            'div',
            { class: 'row', style: { marginBottom: '6px', fontSize: '13px' } },
            UI.colorDot(it.color_main, 12),
            h('span', { class: 'grow truncate' }, (it.color_main || '') + ' ' + (it.category || '')),
            h('b', null, '穿 ' + it.wear_count + ' 次')
          )
        );
      });
    }

    if (neverWorn.length) {
      card.appendChild(h('hr', { class: 'divider' }));
      card.appendChild(h('div', { class: 'section-title', style: { fontSize: '13px', marginBottom: '8px' } }, '还没穿过'));
      neverWorn.forEach(function (it) {
        card.appendChild(
          h(
            'div',
            { class: 'row', style: { marginBottom: '6px', fontSize: '13px' } },
            UI.colorDot(it.color_main, 12),
            h('span', { class: 'grow truncate' }, (it.color_main || '') + ' ' + (it.category || '')),
            h('span', { class: 'tiny' }, U.fmtDate(String(it.created_at || '').slice(0, 10)) + ' 加入')
          )
        );
      });
    }

    box.appendChild(card);
    return box;
  }

  /* ---------------- 打卡记录 ---------------- */
  function loadLogs() {
    var p = App.state.profile;
    if (!p) return;
    S.loadingLogs = true;
    S.logsFor = p.profile_id;
    DB.logs
      .list(p.profile_id)
      .then(function (list) {
        S.loadingLogs = false;
        if (S.logsFor !== p.profile_id) return; // 期间切了档案，丢弃
        S.logs = list;
        App.render();
      })
      .catch(function () {
        S.loadingLogs = false;
      });
  }

  function buildLogs() {
    var box = h('div', { class: 'section' });
    box.appendChild(
      h(
        'div',
        { class: 'section-head' },
        h('div', { class: 'section-title' }, '打卡记录'),
        h('div', { class: 'section-hint' }, '最近穿了什么')
      )
    );

    if (!S.logs) {
      box.appendChild(h('p', { class: 'field-hint' }, '加载中…'));
      return box;
    }
    if (!S.logs.length) {
      box.appendChild(h('p', { class: 'field-hint' }, '还没有打卡。在首页生成一套后点「就穿它了」，就会记在这里。'));
      return box;
    }

    var outfitsById = {};
    (App.state.outfits || []).forEach(function (o) {
      outfitsById[o.outfit_id] = o;
    });

    var list = h('div', { class: 'list' });
    S.logs.slice(0, 8).forEach(function (log) {
      var o = outfitsById[log.outfit_id];
      var count = o ? (o.items || []).length : 0;
      list.appendChild(
        h(
          'div',
          { class: 'list-row' },
          h('span', { class: 'li-ico', html: UI.icon.calendar }),
          h(
            'span',
            { class: 'li-main' },
            h('span', { class: 'li-title' }, U.fmtDate(log.date) + (o && o.scene ? ' · ' + o.scene : '')),
            h('span', { class: 'li-sub' }, count ? count + ' 件单品' : '搭配已删除')
          )
        )
      );
    });
    box.appendChild(list);
    return box;
  }

  /* ---------------- 数据与备份 ---------------- */
  function buildDataSection() {
    var box = h('div', { class: 'section' });
    box.appendChild(
      h(
        'div',
        { class: 'section-head' },
        h('div', { class: 'section-title' }, '数据'),
        h('span', { id: 'storage-line', class: 'section-hint' }, '统计中…')
      )
    );

    var list = h('div', { class: 'list' });

    list.appendChild(
      h(
        'button',
        { class: 'list-row', type: 'button', onclick: exportBackup },
        h('span', { class: 'li-ico', html: UI.icon.download }),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, '导出备份'), h('span', { class: 'li-sub' }, '存成一个 JSON 文件，换手机时能导回来')),
        h('span', { class: 'li-arrow' }, '›')
      )
    );

    var importInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
    importInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) importBackup(file);
    });
    list.appendChild(importInput);

    list.appendChild(
      h(
        'button',
        {
          class: 'list-row',
          type: 'button',
          onclick: function () {
            importInput.click();
          },
        },
        h('span', { class: 'li-ico', html: UI.icon.upload }),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, '导入备份'), h('span', { class: 'li-sub' }, '选择之前导出的 JSON 文件')),
        h('span', { class: 'li-arrow' }, '›')
      )
    );

    list.appendChild(
      h(
        'button',
        {
          class: 'list-row',
          type: 'button',
          onclick: function () {
            App.db.ensureSeed({ force: true }).then(function (res) {
              return App.db.hotLooks.list().then(function (list2) {
                App.state.looks = list2;
                App.render();
                U.toastOk('热门穿搭已重新导入 ' + res.imported + ' 条');
              });
            });
          },
        },
        h('span', { class: 'li-ico', html: UI.icon.refresh }),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, '重新导入热门穿搭'), h('span', { class: 'li-sub' }, '把 48 条种子数据重新写进本地')),
        h('span', { class: 'li-arrow' }, '›')
      )
    );

    list.appendChild(
      h(
        'button',
        {
          class: 'list-row danger',
          type: 'button',
          onclick: wipeAll,
        },
        h('span', { class: 'li-ico', html: UI.icon.trash }),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, '清空全部数据'), h('span', { class: 'li-sub' }, '所有档案、衣服、搭配都会消失')),
        h('span', { class: 'li-arrow' }, '›')
      )
    );

    box.appendChild(list);
    return box;
  }

  function exportBackup() {
    DB.exportAll()
      .then(function (data) {
        var text = JSON.stringify(data, null, 2);
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = h('a', {
          href: url,
          download: '明天穿什么-备份-' + U.todayStr() + '.json',
        });
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(url);
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 1500);
        U.toastOk('备份已导出（约 ' + U.fmtBytes(blob.size) + '）');
      })
      .catch(function (err) {
        U.toastErr(err.message || '导出失败');
      });
  }

  function importBackup(file) {
    U.confirm({
      title: '导入备份？',
      message: '导入会用备份里的内容覆盖同一条记录（不会删除备份里没有的东西）。建议先导出一份当前数据再导入。',
      okText: '导入',
    }).then(function (yes) {
      if (!yes) return;
      var fr = new FileReader();
      fr.onload = function () {
        var data;
        try {
          data = JSON.parse(String(fr.result));
        } catch (e) {
          U.toastErr('这个文件不是有效的备份文件');
          return;
        }
        DB.importAll(data)
          .then(function (count) {
            return Promise.all([DB.profiles.list(), DB.hotLooks.list()]).then(function (res) {
              App.state.profiles = res[0];
              App.state.looks = res[1];
              var current =
                res[0].filter(function (p) {
                  return App.state.profile && p.profile_id === App.state.profile.profile_id;
                })[0] || res[0][0];
              if (current) {
                return App.switchProfile(current.profile_id).then(function () {
                  return count;
                });
              }
              return count;
            });
          })
          .then(function (count) {
            S.logs = null;
            App.render();
            U.toastOk('已导入 ' + count + ' 条记录');
          })
          .catch(function (err) {
            U.toastErr(err.message || '导入失败');
          });
      };
      fr.onerror = function () {
        U.toastErr('文件读不出来，换一个试试');
      };
      fr.readAsText(file);
    });
  }

  function wipeAll() {
    U.confirm({
      title: '确定清空全部数据？',
      message: '所有家人的档案、每一件衣服的照片、保存的搭配和打卡记录都会从这台设备上删除，无法恢复。建议先导出备份。',
      okText: '我知道了，清空',
      danger: true,
    }).then(function (yes) {
      if (!yes) return;
      return U.confirm({
        title: '最后确认',
        message: '真的要清空吗？清空后要重新拍所有衣服。',
        okText: '确认清空',
        danger: true,
      }).then(function (yes2) {
        if (!yes2) return;
        DB.wipe()
          .then(function () {
            U.toastOk('已清空，页面将重新加载');
            setTimeout(function () {
              location.reload();
            }, 900);
          })
          .catch(function (err) {
            U.toastErr(err.message || '清空失败');
          });
      });
    });
  }

  /* ---------------- 关于 ---------------- */
  function buildAbout() {
    var box = h('div', { class: 'section' });
    box.appendChild(
      h('div', { class: 'section-head' }, h('div', { class: 'section-title' }, '关于'))
    );

    var list = h('div', { class: 'list' });

    list.appendChild(
      h(
        'button',
        {
          class: 'list-row',
          type: 'button',
          onclick: function () {
            if (App.openSelfTest) App.openSelfTest();
          },
        },
        h('span', { class: 'li-ico', html: UI.icon.chart }),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, '程序自检'), h('span', { class: 'li-sub' }, '用假数据跑一遍推荐引擎，检查规则是否生效')),
        h('span', { class: 'li-arrow' }, '›')
      )
    );

    list.appendChild(
      h(
        'div',
        { class: 'list-row', style: { alignItems: 'flex-start' } },
        h('span', { class: 'li-ico', html: UI.icon.info }),
        h(
          'span',
          { class: 'li-main' },
          h('span', { class: 'li-title' }, '明天穿什么 ' + (App.VERSION || 'v1.0')),
          h(
            'span',
            { class: 'li-sub', style: { lineHeight: '1.7', display: 'block', marginTop: '4px' } },
            '纯前端网页应用：没有后端、没有账号、不需要注册。'
          ),
          h(
            'span',
            { class: 'li-sub', style: { lineHeight: '1.7', display: 'block', marginTop: '2px' } },
            '构建号：' + (App.BUILD || '20261019') + '（更新后对一下这串数字，变了就是新版）'
          ),
          h(
            'span',
            { class: 'li-sub', style: { lineHeight: '1.9', display: 'block', marginTop: '6px' } },
            '本地存储：localForage + IndexedDB（当前：' + DB.driver + '）',
            h('br'),
            '天气：Open-Meteo 免费接口',
            h('br'),
            '抠图：@imgly/background-removal（浏览器本地运行）',
            h('br'),
            '规则：data/rules/ 下的 3 个 JSON 文件'
          )
        )
      )
    );

    list.appendChild(
      h(
        'a',
        {
          class: 'list-row',
          href: 'https://open-meteo.com/en/docs',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        h('span', { class: 'li-ico', html: UI.icon.info }),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Open-Meteo 官方文档')),
        h('span', { class: 'li-arrow' }, '›')
      )
    );

    list.appendChild(
      h(
        'a',
        {
          class: 'list-row',
          href: 'https://github.com/imgly/background-removal-js',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        h('span', { class: 'li-ico', html: UI.icon.scissors }),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, '抠图库 GitHub')),
        h('span', { class: 'li-arrow' }, '›')
      )
    );

    box.appendChild(list);
    return box;
  }

  V.me = {
    render: render,
    reset: function () {
      S.logs = null;
    },
  };
})();
