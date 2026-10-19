/* ==========================================================================
   app.js —— 启动、状态、路由、全局共用流程（选城市 / 建档案）
   所有 Tab 页面在 js/views/ 里，这里负责把它们串起来。
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var DB = App.db;
  var R = App.rules;
  var W = App.weather;
  var UI = App.ui;
  var h = U.h;

  var A = App;

  /* ---------------------------------------------------------------------
     版本信息
     每次改完程序请同时更新这两行。手机上「我的 → 关于」会显示它，
     对一下就知道手机上是新版还是缓存的旧版。
     --------------------------------------------------------------------- */
  A.VERSION = 'v1.1';
  A.BUILD = '20261019.2';

  /* ---------------------------------------------------------------------
     全局状态
     --------------------------------------------------------------------- */
  A.state = {
    tab: 'home',
    profile: null,
    profiles: [],
    items: [],
    outfits: [],
    looks: [],
    weather: null,
    weatherError: '',
    scene: '休闲',
    booting: true,
    rulesFallback: false,
  };

  var TAB_ORDER = ['home', 'wardrobe', 'mixer', 'discover', 'me'];
  var scrollMemo = {};

  /* ---------------------------------------------------------------------
     场景的默认值与记忆
     --------------------------------------------------------------------- */
  A.sceneKey = function () {
    return 'last_scene_' + ((A.state.profile && A.state.profile.profile_id) || 'none');
  };

  A.getScene = function () {
    return A.state.scene || '休闲';
  };

  A.setScene = function (scene) {
    A.state.scene = scene;
    DB.meta.set(A.sceneKey(), scene);
    return scene;
  };

  A.loadScene = function () {
    return DB.meta.get(A.sceneKey(), '').then(function (v) {
      A.state.scene = (v && R.sceneConf(v) ? v : '') || '休闲';
      return A.state.scene;
    });
  };

  /* ---------------------------------------------------------------------
     Tab 切换
     --------------------------------------------------------------------- */
  A.go = function (tab, opts) {
    if (TAB_ORDER.indexOf(tab) === -1) tab = 'home';
    var changed = A.state.tab !== tab;
    if (changed) scrollMemo[A.state.tab] = window.scrollY || 0;
    A.state.tab = tab;
    updateTabbar();
    renderTab();
    if (changed) {
      var y = (opts && opts.top) ? 0 : scrollMemo[tab] || 0;
      requestAnimationFrame(function () {
        window.scrollTo(0, y);
      });
    }
    return tab;
  };

  function updateTabbar() {
    U.$$('#tabbar .tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === A.state.tab);
    });
  }

  /* 重新渲染当前 Tab（数据变了以后调用） */
  A.render = function () {
    renderTab();
  };

  function renderTab() {
    var view = document.getElementById('view');
    if (!view) return;
    var page = A.views && A.views[A.state.tab];
    U.clear(view);
    view.classList.remove('no-tabbar');
    if (!page) return;
    try {
      page.render(view);
    } catch (err) {
      console.error('[render]', err);
      U.mount(
        view,
        h(
          'div',
          { class: 'page' },
          UI.empty({
            icon: 'info',
            title: '这个页面出错了',
            text: '错误信息：' + (err && err.message ? err.message : String(err)),
            actionLabel: '回到首页',
            onAction: function () {
              A.go('home');
            },
          })
        )
      );
    }
  }

  /* ---------------------------------------------------------------------
     数据加载
     --------------------------------------------------------------------- */
  A.reloadProfileData = function () {
    var p = A.state.profile;
    if (!p) return Promise.resolve();
    return Promise.all([DB.items.list(p.profile_id), DB.outfits.list(p.profile_id)]).then(function (res) {
      A.state.items = res[0];
      A.state.outfits = res[1];
      return res;
    });
  };

  A.reloadItems = function () {
    var p = A.state.profile;
    if (!p) return Promise.resolve([]);
    return DB.items.list(p.profile_id).then(function (list) {
      A.state.items = list;
      return list;
    });
  };

  /* 切换档案：所有数据按 profile_id 隔离 */
  A.switchProfile = function (profileId) {
    return DB.profiles.get(profileId).then(function (p) {
      if (!p) throw new Error('档案不存在');
      A.state.profile = p;
      A.state.weather = null;
      A.state.weatherError = '';
      return DB.meta.set('last_profile_id', p.profile_id);
    })
      .then(function () {
        return A.loadScene();
      })
      .then(function () {
        return A.reloadProfileData();
      })
      .then(function () {
        /* 各页面自己的临时状态（天气、搭配、筛选）必须清掉，否则会串到别人档案上 */
        A.resetViewStates();
        A.render();
        return A.state.profile;
      });
  };

  /* 清空各页面的缓存状态 */
  A.resetViewStates = function () {
    ['home', 'wardrobe', 'mixer', 'discover', 'me'].forEach(function (name) {
      var view = A.views && A.views[name];
      if (view && typeof view.reset === 'function') view.reset();
    });
  };

  A.saveProfile = function (draft) {
    return DB.profiles.save(draft).then(function (saved) {
      return DB.profiles.list().then(function (list) {
        A.state.profiles = list;
        return saved;
      });
    });
  };

  /* 衣橱里有多少件、够不够推荐 */
  A.wardrobeStats = function () {
    var items = A.state.items || [];
    var scenes = {};
    var colors = {};
    items.forEach(function (it) {
      (it.scene_tags || []).forEach(function (s) {
        scenes[s] = (scenes[s] || 0) + 1;
      });
      if (it.color_main) colors[it.color_main] = (colors[it.color_main] || 0) + 1;
    });
    return { total: items.length, scenes: scenes, colors: colors };
  };

  /* ---------------------------------------------------------------------
     共用流程：选城市
     返回 Promise<string|null>（选中的城市名）
     --------------------------------------------------------------------- */
  A.pickCity = function (opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }

      var state = { mode: 'idle', busy: false, results: [], query: o.query || '' };
      var bodyHost = h('div');
      var sheetRef = null;

      function close() {
        if (sheetRef) sheetRef.close();
      }

      function choose(name) {
        done(name);
        close();
      }

      function renderBody() {
        U.clear(bodyHost);

        /* 1) 定位按钮 */
        bodyHost.appendChild(
          h(
            'button',
            {
              class: 'btn btn-soft btn-block',
              type: 'button',
              onclick: function () {
                state.mode = 'locating';
                state.busy = true;
                renderBody();
                W.locate()
                  .then(function (pos) {
                    var near = W.nearestPresetCity(pos.latitude, pos.longitude);
                    if (near) return near.name;
                    /* 附近没有内置城市就用坐标直接算天气，名字叫「当前位置」 */
                    return DB.meta
                      .get('geo_cache', {})
                      .then(function (cache) {
                        var c = cache || {};
                        c['当前位置'] = {
                          name: '当前位置',
                          latitude: pos.latitude,
                          longitude: pos.longitude,
                          ts: Date.now(),
                        };
                        return DB.meta.set('geo_cache', c);
                      })
                      .then(function () {
                        return '当前位置';
                      });
                  })
                  .then(function (name) {
                    choose(name);
                  })
                  .catch(function (err) {
                    state.mode = 'locateFail';
                    state.busy = false;
                    state.locateMsg = err.message || '定位失败，请手动选城市。';
                    renderBody();
                  });
              },
            },
            '📍 用我当前的位置'
          )
        );

        if (state.mode === 'locating' || state.busy) {
          bodyHost.appendChild(h('div', { class: 'small', style: { marginTop: '10px' } }, '正在定位…如果手机弹出授权，请点「允许」。'));
        }
        if (state.mode === 'locateFail' && state.locateMsg) {
          bodyHost.appendChild(
            h('div', { class: 'not-now', style: { marginTop: '10px' } }, state.locateMsg)
          );
        }

        /* 2) 搜索框 */
        var input = h('input', {
          type: 'search',
          placeholder: '输入城市名，例如 重庆',
          value: state.query,
          enterkeyhint: 'search',
        });
        input.addEventListener('input', function () {
          state.query = input.value;
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') doSearch();
        });

        var searchBox = h(
          'div',
          { class: 'search-box', style: { marginTop: '12px' } },
          h('span', { html: UI.icon.search, style: { display: 'flex', width: '17px' } }),
          input,
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', style: { flex: 'none' }, onclick: doSearch }, '搜索')
        );
        bodyHost.appendChild(searchBox);

        function doSearch() {
          var kw = input.value.trim();
          if (!kw) {
            U.toastWarn('先输入城市名');
            return;
          }
          state.query = kw;
          state.busy = true;
          state.mode = 'searching';
          renderBody();
          W.searchCity(kw)
            .then(function (list) {
              state.results = list;
              state.mode = list.length ? 'results' : 'noResult';
              state.busy = false;
              renderBody();
            })
            .catch(function (err) {
              state.results = [];
              state.mode = 'noResult';
              state.busy = false;
              state.searchError = err.message;
              renderBody();
            });
        }

        if (state.mode === 'searching') {
          bodyHost.appendChild(UI.loading('正在搜索城市…'));
        }

        if (state.mode === 'noResult') {
          bodyHost.appendChild(
            h(
              'div',
              { class: 'not-now', style: { marginTop: '12px' } },
              (state.searchError || '没找到这个城市，换个说法试试。') + ' 也可以直接从下面的常用城市里选。'
            )
          );
        }

        /* 3) 搜索结果 */
        if (state.results.length && state.mode === 'results') {
          var list = h('div', { class: 'list', style: { marginTop: '10px' } });
          state.results.forEach(function (r) {
            list.appendChild(
              h(
                'button',
                {
                  class: 'list-row',
                  type: 'button',
                  onclick: function () {
                    choose(r.name);
                  },
                },
                h('span', { class: 'li-ico', html: UI.icon.location }),
                h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, r.name), h('span', { class: 'li-sub' }, r.label)),
                h('span', { class: 'li-arrow' }, '›')
              )
            );
          });
          bodyHost.appendChild(list);
        }

        /* 4) 常用城市 */
        bodyHost.appendChild(h('div', { class: 'section-title', style: { marginTop: '18px', marginBottom: '8px', fontSize: '13px' } }, '常用城市'));
        var presets = W.presetCities().slice(0, 12);
        var chips = h('div', { class: 'chips' });
        presets.forEach(function (c) {
          chips.appendChild(
            h(
              'button',
              {
                class: 'chip chip-sm' + (o.current === c.name ? ' on-soft' : ''),
                type: 'button',
                onclick: function () {
                  choose(c.name);
                },
              },
              c.name
            )
          );
        });
        bodyHost.appendChild(chips);

        bodyHost.appendChild(
          h(
            'p',
            { class: 'field-hint', style: { marginTop: '14px' } },
            '城市只用来查天气。天气数据来自 Open-Meteo（免费、免注册、不需要 key）。'
          )
        );
      }

      renderBody();

      sheetRef = U.sheet({
        title: o.title || '选择城市',
        noAutoFocus: true,
        dismissible: true,
        onClose: function () {
          done(null);
        },
        body: bodyHost,
        footer: function (closeFn) {
          return h(
            'button',
            {
              class: 'btn btn-ghost btn-block',
              type: 'button',
              onclick: function () {
                done(null);
                closeFn();
              },
            },
            '取消'
          );
        },
      });
    });
  };

  /* ---------------------------------------------------------------------
     共用流程：新建 / 编辑档案
     返回 Promise<profile|'deleted'|null>
     --------------------------------------------------------------------- */
  A.profileForm = function (existing) {
    var isEdit = !!existing;
    var draft = {
      profile_id: existing ? existing.profile_id : '',
      nickname: existing ? existing.nickname : '',
      gender: existing ? existing.gender : '女',
      city: existing ? existing.city : '',
      height_weight: existing ? existing.height_weight : '',
      style_prefs: existing ? (existing.style_prefs || []).slice() : [],
    };

    return new Promise(function (resolve) {
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }

      var nicknameInput = h('input', {
        class: 'input',
        type: 'text',
        placeholder: '例如：妈妈、爸爸、小妹',
        maxlength: '12',
        value: draft.nickname,
      });
      nicknameInput.addEventListener('input', function () {
        draft.nickname = nicknameInput.value;
      });

      var genderChips = UI.chips(['女', '男'], {
        selected: draft.gender,
        onPick: function (v) {
          draft.gender = v;
        },
      });

      var cityBtn = h(
        'button',
        {
          class: 'btn btn-block',
          type: 'button',
          style: { justifyContent: 'space-between', paddingLeft: '14px', paddingRight: '14px' },
          onclick: function () {
            A.pickCity({ current: draft.city, query: draft.city }).then(function (name) {
              if (!name) return;
              draft.city = name;
              cityLabel.textContent = name;
              cityLabel.style.color = 'var(--text)';
            });
          },
        },
        h('span', null, '选择城市'),
        h('span', { class: 'muted', id: 'city-label' }, draft.city || '还没选')
      );
      var cityLabel = cityBtn.querySelector('#city-label');
      if (draft.city) cityLabel.style.color = 'var(--text)';

      var heightInput = h('input', {
        class: 'input',
        type: 'text',
        placeholder: '例如：165cm / 55kg（可跳过）',
        value: draft.height_weight,
      });
      heightInput.addEventListener('input', function () {
        draft.height_weight = heightInput.value;
      });

      var styleChips = UI.chips(R.STYLES, {
        multi: true,
        selected: draft.style_prefs,
        small: true,
        onPick: function (v, all) {
          draft.style_prefs = all;
        },
      });

      var body = h(
        'div',
        null,
        UI.field('怎么称呼（昵称）', nicknameInput, { required: true, hint: '每个家人一个档案，衣橱互相看不到。' }),
        UI.field('性别', genderChips, { required: true, hint: '会影响推荐的版型和热门穿搭板块。' }),
        UI.field('所在城市', cityBtn, { required: true, hint: '用来查明天的天气。' }),
        UI.field('身高体重（可跳过）', heightInput),
        UI.field('喜欢的风格（可跳过，可多选）', styleChips)
      );

      U.sheet({
        title: isEdit ? '编辑档案' : '新建一个档案',
        dismissible: true,
        onClose: function () {
          done(null);
        },
        body: body,
        footer: function (close) {
          return h(
            'button',
            {
              class: 'btn btn-primary btn-block',
              type: 'button',
              onclick: function () {
                if (!draft.nickname.trim()) {
                  U.toastWarn('先填一个昵称吧');
                  nicknameInput.focus();
                  return;
                }
                if (!draft.city) {
                  U.toastWarn('先选一个城市，不然查不了天气');
                  return;
                }
                var payload = Object.assign({}, draft, { nickname: draft.nickname.trim() });
                A.saveProfile(payload)
                  .then(function (saved) {
                    done(saved);
                    close();
                    U.toastOk(isEdit ? '档案已保存' : '档案「' + saved.nickname + '」建好了');
                  })
                  .catch(function (err) {
                    U.toastErr(err.message || '保存失败');
                  });
              },
            },
            isEdit ? '保存修改' : '创建档案'
          );
        },
      });
    });
  };

  /* ---------------------------------------------------------------------
     首次引导
     --------------------------------------------------------------------- */
  function showOnboarding() {
    var view = document.getElementById('view');
    var tabbar = document.getElementById('tabbar');
    if (tabbar) tabbar.hidden = true;
    view.classList.add('no-tabbar');
    U.clear(view);
    A.views.onboarding.render(view, {
      onDone: function (profile) {
        startWithProfile(profile);
      },
    });
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */
  function bindTabbar() {
    var tabbar = document.getElementById('tabbar');
    U.$$('.tab', tabbar).forEach(function (btn) {
      btn.addEventListener('click', function () {
        A.go(btn.dataset.tab);
      });
    });
  }

  /* 环境自检：直接双击 index.html（file:// 协议）时，浏览器不允许读取本地数据和定位，
     这里给一句人话提示，而不是白屏。 */
  function checkProtocol() {
    if (location.protocol === 'file:') {
      var view = document.getElementById('view');
      var tabbar = document.getElementById('tabbar');
      if (tabbar) tabbar.hidden = true;
      view.classList.add('no-tabbar');
      U.mount(
        view,
        h(
          'div',
          { class: 'page', style: { paddingTop: '40px' } },
          UI.appbar({ title: '明天穿什么' }),
          h(
            'div',
            { class: 'card' },
            h('h2', { class: 'h2' }, '请用「启动本地预览.bat」打开'),
            h(
              'p',
              { class: 'small', style: { lineHeight: '1.75' } },
              '你现在是直接双击 index.html 打开的（地址栏以 file:// 开头）。浏览器出于安全限制，禁止这种页面读取本地数据、调用相机和定位，所以应用无法运行。'
            ),
            h('hr', { class: 'divider' }),
            h('p', { class: 'small', style: { lineHeight: '1.9' } }, '正确做法：'),
            h(
              'ol',
              { class: 'small', style: { lineHeight: '1.9', paddingLeft: '20px', margin: '6px 0 0' } },
              h('li', null, '回到项目文件夹「明天穿什么」'),
              h('li', null, '双击「启动本地预览.bat」'),
              h('li', null, '它会自动打开浏览器，地址是 http://localhost:8080')
            ),
            h(
              'p',
              { class: 'field-hint', style: { marginTop: '14px' } },
              '如果 bat 打不开，说明电脑上没装 Python 或 Node，请按《部署说明.md》把项目上传到免费静态托管，用手机直接访问网址。'
            )
          )
        )
      );
      return true;
    }
    return false;
  }

  function showBootError(err) {
    var view = document.getElementById('view');
    var tabbar = document.getElementById('tabbar');
    if (tabbar) tabbar.hidden = true;
    U.mount(
      view,
      h(
        'div',
        { class: 'page', style: { paddingTop: '32px' } },
        h('h1', { style: { fontSize: '22px', fontWeight: '800' } }, '启动失败'),
        h(
          'div',
          { class: 'card', style: { marginTop: '16px' } },
          h('p', { class: 'small', style: { lineHeight: '1.75' } }, '错误信息：' + (err && err.message ? err.message : String(err))),
          h(
            'p',
            { class: 'field-hint', style: { marginTop: '10px' } },
            '常见原因：浏览器禁用了本地存储（无痕模式），或存储空间已满。可以换成普通模式重新打开试试。'
          ),
          h(
            'button',
            {
              class: 'btn btn-primary btn-block',
              type: 'button',
              style: { marginTop: '14px' },
              onclick: function () {
                location.reload();
              },
            },
            '重新加载'
          )
        )
      )
    );
  }

  function startWithProfile(profile) {
    A.state.profile = profile;
    var tabbar = document.getElementById('tabbar');
    if (tabbar) tabbar.hidden = false;
    A.state.booting = false;
    return A.loadScene()
      .then(function () {
        return A.reloadProfileData();
      })
      .then(function () {
        A.go('home', { top: true });
      });
  }

  function boot() {
    if (checkProtocol()) return;

    /* 全局异常兜底：不让任何错误把页面变成白屏 */
    window.addEventListener('error', function (e) {
      console.error('[window.error]', e.error || e.message);
    });
    window.addEventListener('unhandledrejection', function (e) {
      console.error('[unhandled]', e.reason);
    });

    bindTabbar();

    U.mount(document.getElementById('view'), h('div', { class: 'page', style: { paddingTop: '30px' } }, UI.loading('正在准备你的衣橱…')));

    Promise.all([DB.ready(), R.ready])
      .then(function () {
        A.state.rulesFallback = R.source === 'default';
        if (R.brokenFiles && R.brokenFiles.length) {
          console.warn('[rules] 用了内置默认规则：', R.brokenFiles.join('; '));
        }
        /* 首次启动：导入热门穿搭种子数据（48 条） */
        return DB.ensureSeed()
          .then(function (res) {
            A.state.seedResult = res;
            return res;
          })
          .catch(function (err) {
            console.warn('[seed]', err);
            A.state.seedError = err.message;
            return null;
          });
      })
      .then(function (seed) {
        return Promise.all([DB.profiles.list(), DB.hotLooks.list()]).then(function (res) {
          A.state.profiles = res[0];
          A.state.looks = res[1];
          if (seed && seed.imported > 0) {
            setTimeout(function () {
              U.toastOk('已加载 ' + seed.imported + ' 条热门穿搭');
            }, 700);
          }
          return res[0];
        });
      })
      .then(function (profiles) {
        if (!profiles.length) {
          showOnboarding();
          return null;
        }
        return DB.meta.get('last_profile_id', '').then(function (lastId) {
          var found =
            profiles.filter(function (p) {
              return p.profile_id === lastId;
            })[0] || profiles[0];
          return startWithProfile(found);
        });
      })
      .then(function () {
        /* 首次使用提示：只在已经进入主界面（有档案）时才弹，
           否则会在引导页上盖一个莫名其妙的提示 */
        if (!A.state.profile) return;
        return DB.meta.get('hint_shown', false).then(function (shown) {
          if (shown) return;
          DB.meta.set('hint_shown', true);
          setTimeout(function () {
            U.toast('先去「衣橱」拍几件衣服，再去「明天」生成穿搭', '', 4200);
          }, 1600);
        });
      })
      .catch(function (err) {
        console.error('[boot]', err);
        showBootError(err);
      });

    /* 从「新建档案」回来时用 */
    A.startWithProfile = startWithProfile;
  }

  /* ---------------------------------------------------------------------
     让页面在 PWA 模式（添加到主屏幕）下也正常
     --------------------------------------------------------------------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('sw.js')
        .then(function () {})
        .catch(function (err) {
          /* Service Worker 失败不影响使用 */
          console.warn('[sw]', err && err.message);
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
      registerSW();
    });
  } else {
    boot();
    registerSW();
  }
})();
