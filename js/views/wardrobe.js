/* ==========================================================================
   views/wardrobe.js —— 衣橱：列表 / 筛选 / 录入（拍照→压缩→抠图→打标签）/ 编辑 / 删除
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var R = App.rules;
  var UI = App.ui;
  var IM = App.image;
  var DB = App.db;
  var h = U.h;

  var V = (App.views = App.views || {});

  /* 页面状态 */
  var S = {
    q: '',
    cat: '',
    color: '',
    style: '',
    scene: '',
    busy: false,
    listHost: null,
  };

  /* ---------------------------------------------------------------------
     颜色色板选择器（放一个在 App.ui 上，方便其它页面复用）
     --------------------------------------------------------------------- */
  function swatchGrid(selected, onPick, opts) {
    var o = opts || {};
    var value = selected || '';
    var box = h('div', { class: 'swatches' });

    function paint() {
      U.$$('.swatch', box).forEach(function (el) {
        el.classList.toggle('on', el.dataset.color === value);
      });
    }

    R.palette().forEach(function (c) {
      var el = h(
        'button',
        {
          class: 'swatch' + (c.name === value ? ' on' : ''),
          type: 'button',
          dataset: { color: c.name },
          title: c.name,
        },
        h('span', { class: 'swatch-dot', style: { background: c.hex } }),
        h('span', null, c.name)
      );
      el.addEventListener('click', function () {
        if (o.allowClear && value === c.name) {
          value = '';
        } else {
          value = c.name;
        }
        paint();
        if (onPick) onPick(value);
      });
      box.appendChild(el);
    });

    if (o.allowClear) {
      var clr = h('button', { class: 'swatch' + (!value ? ' on' : ''), type: 'button' }, h('span', { class: 'swatch-dot', style: { background: '#fff', borderStyle: 'dashed' } }), h('span', null, '不选'));
      clr.addEventListener('click', function () {
        value = '';
        paint();
        clr.classList.add('on');
        if (onPick) onPick('');
      });
      box.appendChild(clr);
      if (value) clr.classList.remove('on');
    }

    box.getValue = function () {
      return value;
    };
    return box;
  }

  App.ui.swatchGrid = swatchGrid;

  /* ---------------------------------------------------------------------
     主渲染
     --------------------------------------------------------------------- */
  function render(root) {
    var p = App.state.profile;
    if (!p) return;

    U.clear(root);
    root.appendChild(
      UI.appbar({
        title: '衣橱',
        sub: p.nickname + ' · 共 ' + App.state.items.length + ' 件',
        right: h(
          'button',
          {
            class: 'btn btn-primary btn-sm',
            type: 'button',
            style: { minHeight: '38px' },
            onclick: startAdd,
          },
          '＋ 添加'
        ),
      })
    );

    var page = h('div', { class: 'page' });

    /* 搜索框 */
    var searchInput = h('input', {
      type: 'search',
      placeholder: '搜颜色、风格、材质、场景…',
      value: S.q,
      enterkeyhint: 'search',
    });
    /* 只重绘列表，不整页重绘，否则输入框会失去焦点、手机键盘会被收起 */
    searchInput.addEventListener(
      'input',
      U.debounce(function () {
        S.q = searchInput.value.trim();
        if (S.listHost) renderList(S.listHost);
      }, 220)
    );
    page.appendChild(
      h(
        'div',
        { class: 'search-box' },
        h('span', { html: UI.icon.search, style: { display: 'flex', width: '17px' } }),
        searchInput,
        S.q
          ? h(
              'button',
              {
                class: 'search-clear',
                type: 'button',
                'aria-label': '清空搜索',
                onclick: function () {
                  S.q = '';
                  App.render();
                },
              },
              '✕'
            )
          : null
      )
    );

    /* 品类快筛 + 更多筛选 */
    var catRow = h('div', { class: 'chip-scroll', style: { marginTop: '12px' } });
    function catChip(label, value) {
      var on = S.cat === value;
      var b = h(
        'button',
        { class: 'chip chip-sm' + (on ? ' on' : ''), type: 'button' },
        label
      );
      b.addEventListener('click', function () {
        S.cat = value;
        App.render();
      });
      return b;
    }
    catRow.appendChild(catChip('全部', ''));
    R.CATEGORIES.forEach(function (c) {
      catRow.appendChild(catChip(c, c));
    });
    page.appendChild(catRow);

    var activeCount = [S.color, S.style, S.scene].filter(Boolean).length;
    page.appendChild(
      h(
        'div',
        { class: 'row', style: { marginTop: '10px', gap: '8px' } },
        h(
          'button',
          {
            class: 'btn btn-sm grow',
            type: 'button',
            onclick: openFilterSheet,
          },
          '筛选' + (activeCount ? '（' + activeCount + '）' : '')
        ),
        activeCount
          ? h(
              'button',
              {
                class: 'btn btn-sm btn-ghost',
                type: 'button',
                onclick: function () {
                  S.color = S.style = S.scene = '';
                  S.cat = '';
                  App.render();
                },
              },
              '清除筛选'
            )
          : null
      )
    );

    /* 列表 */
    var listBox = h('div', { style: { marginTop: '4px' } });
    page.appendChild(listBox);
    S.listHost = listBox;
    renderList(listBox);

    root.appendChild(page);
  }

  /* 过滤后的衣物 */
  function filteredItems() {
    var items = App.state.items || [];
    var q = S.q.toLowerCase();
    return items.filter(function (it) {
      if (S.cat && it.category !== S.cat) return false;
      if (S.color && it.color_main !== S.color && it.color_sub !== S.color) return false;
      if (S.style && it.style !== S.style) return false;
      if (S.scene && (it.scene_tags || []).indexOf(S.scene) === -1) return false;
      if (q) {
        var hay = [it.category, it.color_main, it.color_sub, it.style, it.material, it.season_thickness]
          .concat(it.scene_tags || [])
          .join(' ')
          .toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderList(box) {
    U.clear(box);
    var items = filteredItems();

    if (!App.state.items.length) {
      box.appendChild(
        UI.empty({
          icon: 'camera',
          title: '衣橱是空的',
          text: '拍下你常穿的衣服。平铺在白底上、光线亮一点，抠出来最干净。先拍上衣、裤子、鞋各一件，就能生成搭配了。',
          actionLabel: '＋ 添加第一件',
          onAction: startAdd,
        })
      );
      return;
    }

    if (!items.length) {
      box.appendChild(
        UI.empty({
          icon: 'search',
          title: '没有符合条件的衣服',
          text: '换个筛选条件，或者点「清除筛选」看看全部。',
          actionLabel: '清除筛选',
          onAction: function () {
            S.q = '';
            S.cat = S.color = S.style = S.scene = '';
            App.render();
          },
        })
      );
      return;
    }

    /* 按品类分组 */
    R.CATEGORIES.forEach(function (cat) {
      var group = items.filter(function (it) {
        return it.category === cat;
      });
      if (!group.length) return;

      var g = h('div', { class: 'wardrobe-group' });
      g.appendChild(
        h(
          'div',
          { class: 'wardrobe-group-head' },
          h('h3', null, cat),
          h('span', { class: 'count-badge' }, String(group.length))
        )
      );

      var grid = h('div', { class: 'item-grid' });
      group.forEach(function (it) {
        grid.appendChild(
          UI.itemCard(it, function () {
            openDetail(it);
          })
        );
      });
      g.appendChild(grid);
      box.appendChild(g);
    });

    /* 其它未知品类，避免数据丢失看不见 */
    var known = {};
    R.CATEGORIES.forEach(function (c) {
      known[c] = true;
    });
    var others = items.filter(function (it) {
      return !known[it.category];
    });
    if (others.length) {
      var g2 = h('div', { class: 'wardrobe-group' });
      g2.appendChild(h('div', { class: 'wardrobe-group-head' }, h('h3', null, '其它')));
      var grid2 = h('div', { class: 'item-grid' });
      others.forEach(function (it) {
        grid2.appendChild(
          UI.itemCard(it, function () {
            openDetail(it);
          })
        );
      });
      g2.appendChild(grid2);
      box.appendChild(g2);
    }

    box.appendChild(
      h(
        'p',
        { class: 'tiny', style: { marginTop: '18px', textAlign: 'center' } },
        '共 ' + items.length + ' 件' + (items.length !== App.state.items.length ? '（已筛选，全部 ' + App.state.items.length + ' 件）' : '')
      )
    );
  }

  /* ---------------------------------------------------------------------
     筛选面板
     --------------------------------------------------------------------- */
  function openFilterSheet() {
    var draft = { color: S.color, style: S.style, scene: S.scene };

    var colorBox = swatchGrid(draft.color, function (v) {
      draft.color = v;
    }, { allowClear: true });

    var styleBox = UI.chips(R.STYLES, {
      selected: draft.style,
      small: true,
      onPick: function (v) {
        draft.style = v;
      },
    });
    styleBox.appendChild(
      h(
        'button',
        {
          class: 'chip chip-sm',
          type: 'button',
          onclick: function () {
            draft.style = '';
            styleBox.setValue('');
          },
        },
        '不限'
      )
    );

    var sceneBox = UI.chips(R.sceneList || R.DEFAULT_SCENES, {
      selected: draft.scene,
      small: true,
      onPick: function (v) {
        draft.scene = v;
      },
    });

    U.sheet({
      title: '筛选衣物',
      body: h(
        'div',
        null,
        UI.field('颜色', colorBox),
        UI.field('风格', styleBox),
        UI.field('场景', sceneBox)
      ),
      footer: function (close) {
        return [
          h(
            'button',
            {
              class: 'btn btn-ghost grow',
              type: 'button',
              onclick: function () {
                S.color = S.style = S.scene = '';
                close();
                App.render();
              },
            },
            '清除'
          ),
          h(
            'button',
            {
              class: 'btn btn-primary grow',
              type: 'button',
              onclick: function () {
                S.color = draft.color;
                S.style = draft.style;
                S.scene = draft.scene;
                close();
                App.render();
              },
            },
            '应用筛选'
          ),
        ];
      },
    });
  }

  /* ---------------------------------------------------------------------
     录入：第一步 拍摄引导
     --------------------------------------------------------------------- */
  function startAdd() {
    var cameraInput = h('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      style: { display: 'none' },
    });
    var albumInput = h('input', {
      type: 'file',
      accept: 'image/*',
      style: { display: 'none' },
    });

    function handleChange(e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = ''; // 允许重复选同一张
      if (!file) return;
      sheet.close();
      startCompress(file);
    }
    cameraInput.addEventListener('change', handleChange);
    albumInput.addEventListener('change', handleChange);

    var sheet = U.sheet({
      title: '拍一张衣服的照片',
      body: function () {
        return h(
          'div',
          null,
          h(
            'div',
            { class: 'shoot-guide' },
            h(
              'div',
              { class: 'shoot-figure' },
              h('div', {
                html:
                  '<svg viewBox="0 0 200 160" fill="none">' +
                  '<rect x="10" y="10" width="180" height="140" rx="10" fill="#fff" stroke="#e0d5c6" stroke-width="2"/>' +
                  '<path d="M78 42l22 16 22-16 26 14-12 24-12-5v52H64V75l-12 5-12-24z" fill="#f7ede3" stroke="#c9b8a4" stroke-width="2.5" stroke-linejoin="round"/>' +
                  '<circle cx="46" cy="36" r="9" fill="#f2c300" opacity=".45"/>' +
                  '<path d="M34 26l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#e0a03a" opacity=".7"/>' +
                  '</svg>',
              })
            ),
            h(
              'div',
              { class: 'guide-points' },
              gpoint('平铺', '衣服平铺在床上或桌面上，不要皱成一团'),
              gpoint('白底', '下面垫一块白布或白纸，抠图会更干净'),
              gpoint('亮一点', '白天靠窗拍，或者开灯，别背光'),
              gpoint('拍全', '衣服完整入镜，四周留一点空'),
            )
          ),
          h(
            'p',
            { class: 'field-hint', style: { marginTop: '14px' } },
            '照片会先自动压缩（最长边 1600px、JPEG 质量 0.8），只把压缩后的图存在你手机里，原图不会保存、也不会上传。'
          ),
          cameraInput,
          albumInput
        );
      },
      footer: function (close) {
        return [
          h(
            'button',
            {
              class: 'btn btn-primary grow',
              type: 'button',
              onclick: function () {
                cameraInput.click();
              },
            },
            '📷 拍照'
          ),
          h(
            'button',
            {
              class: 'btn grow',
              type: 'button',
              onclick: function () {
                albumInput.click();
              },
            },
            '🖼 从相册选'
          ),
        ];
      },
    });

    function gpoint(b, text) {
      return h('div', { class: 'guide-point' }, h('b', null, b), h('span', null, text));
    }
  }

  /* ---------------------------------------------------------------------
     录入：第二步 压缩 + 体积对比
     --------------------------------------------------------------------- */
  function startCompress(file) {
    var bar = h('div', { class: 'progress' }, h('i', { style: { width: '30%' } }));
    var sheet = U.sheet({
      title: '正在压缩照片',
      dismissible: false,
      body: h(
        'div',
        null,
        UI.loading('处理中，请稍等…'),
        bar,
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, '大图会被缩到最长边 1600px，并转成 JPEG（质量 0.8）。')
      ),
    });

    IM.compressFile(file)
      .then(function (cmp) {
        sheet.close();
        openCutoutChoice(cmp);
      })
      .catch(function (err) {
        sheet.close();
        U.toastErr(err.message || '照片处理失败');
      });
  }

  /* ---------------------------------------------------------------------
     录入：第三步 选择是否抠图
     --------------------------------------------------------------------- */
  function openCutoutChoice(cmp) {
    var sheet = U.sheet({
      title: '照片准备好了',
      body: function () {
        return h(
          'div',
          null,
          h(
            'div',
            { class: 'sheet-item-preview' },
            h(
              'div',
              { class: 'thumb', style: { width: '96px', height: '96px', flex: 'none', borderRadius: '12px', border: '1px solid var(--line)' } },
              h('img', { src: cmp.dataUrl, alt: '预览' })
            ),
            h(
              'div',
              { class: 'grow' },
              h('div', { style: { fontWeight: '700', fontSize: '14px' } }, '压缩完成'),
              h('div', { class: 'small', style: { marginTop: '4px' } }, cmp.origBytes ? U.fmtBytes(cmp.origBytes) + ' → ' : '', h('b', { style: { color: 'var(--ok)' } }, U.fmtBytes(cmp.newBytes))),
              h('div', { class: 'tiny', style: { marginTop: '2px' } }, cmp.width + '×' + cmp.height + (cmp.scaled ? '（已缩小）' : '（尺寸未超限）'))
            )
          ),
          h(
            'p',
            { class: 'small', style: { lineHeight: '1.7' } },
            '要不要自动去掉背景？去掉之后衣服会单独显示在白色卡片上，看起来更整齐。抠图在你的手机本地计算，照片不会上传。'
          ),
          h(
            'p',
            { class: 'field-hint', style: { marginTop: '8px' } },
            '第一次抠图需要下载模型（约几十 MB），网络慢可能等一会儿。不想等可以直接跳过，不影响保存。'
          )
        );
      },
      footer: function (close) {
        return [
          h(
            'button',
            {
              class: 'btn grow',
              type: 'button',
              onclick: function () {
                close();
                openTagForm({
                  dataUrl: cmp.dataUrl,
                  bytes: cmp.newBytes,
                  cutout: false,
                  degraded: false,
                  reason: '',
                  origBytes: cmp.origBytes,
                  compressedBytes: cmp.newBytes,
                  width: cmp.width,
                  height: cmp.height,
                });
              },
            },
            '跳过抠图'
          ),
          h(
            'button',
            {
              class: 'btn btn-primary grow',
              type: 'button',
              onclick: function () {
                close();
                runCutout(cmp);
              },
            },
            '自动抠图'
          ),
        ];
      },
    });
  }

  /* ---------------------------------------------------------------------
     录入：第四步 抠图（带进度 + 随时可跳过）
     --------------------------------------------------------------------- */
  function runCutout(cmp) {
    var finished = false;
    var barFill = h('i', { style: { width: '4%' } });
    var label = h('span', null, '准备中…');
    var pctLabel = h('span', null, '');

    var sheet = U.sheet({
      title: '正在抠图',
      dismissible: false,
      body: h(
        'div',
        null,
        h('div', { class: 'progress-label' }, label, pctLabel),
        h('div', { class: 'progress' }, barFill),
        h(
          'p',
          { class: 'field-hint', style: { marginTop: '12px' } },
          '第一次使用要下载 AI 模型，可能需要几十秒到几分钟。等不及就点下面的「跳过抠图」，直接用原图保存。'
        )
      ),
      footer: function (close) {
        return h(
          'button',
          {
            class: 'btn grow',
            type: 'button',
            onclick: function () {
              if (finished) return;
              finished = true;
              close();
              /* 用户主动跳过：用压缩后的原图 */
              openTagForm({
                dataUrl: cmp.dataUrl,
                bytes: cmp.newBytes,
                cutout: false,
                degraded: false,
                reason: '你选择了跳过抠图',
                origBytes: cmp.origBytes,
                compressedBytes: cmp.newBytes,
                width: cmp.width,
                height: cmp.height,
              });
            },
          },
          '跳过抠图'
        );
      },
    });

    function fallback(reason) {
      if (finished) return;
      finished = true;
      sheet.close();
      U.toastWarn('已自动改用原图：' + reason);
      openTagForm({
        dataUrl: cmp.dataUrl,
        bytes: cmp.newBytes,
        cutout: false,
        degraded: true,
        reason: reason,
        origBytes: cmp.origBytes,
        compressedBytes: cmp.newBytes,
        width: cmp.width,
        height: cmp.height,
      });
    }

    IM.removeBackground(cmp.blob, function (p) {
      if (finished) return;
      var pct = Math.round((p.ratio || 0) * 100);
      /* 下载阶段占前 80%，推理阶段占后 20% */
      var shown = Math.min(96, Math.round(pct * 0.8) + 8);
      barFill.style.width = shown + '%';
      pctLabel.textContent = shown + '%';
      label.textContent = /fetch|download/i.test(p.key || '') ? '正在下载模型…' : '正在识别衣服…';
    })
      .then(function (blob) {
        if (finished) return null;
        if (!blob) throw new Error('抠图没有返回结果');
        label.textContent = '正在整理图片…';
        barFill.style.width = '100%';
        pctLabel.textContent = '100%';
        return IM.blobToDataUrl(blob).then(function (raw) {
          return IM.compactDataUrl(raw);
        });
      })
      .then(function (cut) {
        if (finished || !cut) return;
        finished = true;
        sheet.close();
        openTagForm({
          dataUrl: cut.dataUrl,
          bytes: cut.bytes,
          cutout: true,
          degraded: false,
          reason: '',
          origBytes: cmp.origBytes,
          compressedBytes: cmp.newBytes,
          width: cut.width,
          height: cut.height,
        });
      })
      .catch(function (err) {
        fallback(err && err.message ? err.message : '抠图失败');
      });
  }

  /* ---------------------------------------------------------------------
     录入：第五步 打标签（新建 / 编辑共用）
     --------------------------------------------------------------------- */
  function openTagForm(photo, existing) {
    var p = App.state.profile;
    var isEdit = !!existing;

    var draft = {
      category: (existing && existing.category) || '',
      color_main: (existing && existing.color_main) || '',
      color_sub: (existing && existing.color_sub) || '',
      style: (existing && existing.style) || '',
      season_thickness: (existing && existing.season_thickness) || '',
      material: (existing && existing.material) || '',
      scene_tags: (existing && existing.scene_tags ? existing.scene_tags.slice() : []),
      purchase_date: (existing && existing.purchase_date) || '',
      purchase_price: (existing && existing.purchase_price !== undefined ? existing.purchase_price : ''),
      gender: (existing && existing.gender) || p.gender || '女',
    };

    var catChips = UI.chips(R.CATEGORIES, {
      selected: draft.category,
      small: true,
      onPick: function (v) {
        draft.category = v;
      },
    });

    var mainColors = swatchGrid(draft.color_main, function (v) {
      draft.color_main = v;
    });
    var subColors = swatchGrid(draft.color_sub, function (v) {
      draft.color_sub = v;
    }, { allowClear: true });

    var styleChips = UI.chips(R.STYLES, {
      selected: draft.style,
      small: true,
      onPick: function (v) {
        draft.style = v;
      },
    });

    var thickChips = UI.chips(R.levelNames(), {
      selected: draft.season_thickness,
      small: true,
      onPick: function (v) {
        draft.season_thickness = v;
      },
    });

    var materialChips = UI.chips(R.MATERIALS, {
      selected: draft.material,
      small: true,
      onPick: function (v) {
        draft.material = v;
      },
    });

    var sceneChips = UI.chips(R.sceneList || R.DEFAULT_SCENES, {
      multi: true,
      selected: draft.scene_tags,
      small: true,
      onPick: function (v, all) {
        draft.scene_tags = all;
      },
    });

    var genderChips = UI.chips(R.GENDERS, {
      selected: draft.gender,
      small: true,
      onPick: function (v) {
        draft.gender = v;
      },
    });

    var dateInput = h('input', { class: 'input', type: 'date', value: draft.purchase_date });
    dateInput.addEventListener('change', function () {
      draft.purchase_date = dateInput.value;
    });

    var priceInput = h('input', {
      class: 'input',
      type: 'number',
      inputmode: 'decimal',
      step: '0.01',
      min: '0',
      placeholder: '例如 399（可跳过）',
      value: draft.purchase_price === '' ? '' : String(draft.purchase_price),
    });
    priceInput.addEventListener('input', function () {
      draft.purchase_price = priceInput.value;
    });

    var thumbPreview = h(
      'div',
      { class: 'thumb', style: { width: '84px', height: '84px', flex: 'none', borderRadius: '12px', border: '1px solid var(--line)' } },
      h('img', { src: photo.dataUrl, alt: '衣服照片' })
    );

    var sizeText = isEdit
      ? '已保存的图片：' + U.fmtBytes(photo.bytes || IM.bytesOfDataUrl(photo.dataUrl))
      : (photo.origBytes ? U.fmtBytes(photo.origBytes) + ' → ' : '') + U.fmtBytes(photo.bytes) +
        (photo.cutout ? '（已抠图）' : photo.degraded ? '（抠图失败，已用原图）' : '');

    var sheet = U.sheet({
      title: isEdit ? '编辑这件衣服' : '给这件衣服打标签',
      body: function () {
        return h(
          'div',
          null,
          h(
            'div',
            { class: 'sheet-item-preview' },
            thumbPreview,
            h(
              'div',
              { class: 'grow' },
              h('div', { style: { fontWeight: '700', fontSize: '14px' } }, draft.category || '还没选品类'),
              h('div', { class: 'tiny', style: { marginTop: '3px' } }, sizeText),
              photo.degraded
                ? h('div', { class: 'tag tag-warn', style: { marginTop: '6px' } }, '抠图没成功，已用原图保存')
                : null
            )
          ),

          UI.field('品类', catChips, { required: true }),
          UI.field('主色', mainColors, { required: true, hint: '选一个最接近的主色' }),
          UI.field('辅色（可跳过）', subColors),
          UI.field('风格', styleChips),
          UI.field('季节厚薄', thickChips, { required: true, hint: '这决定它冬天还是夏天能被推荐出来' }),
          UI.field('材质（可跳过）', materialChips),
          UI.field('适合的场合（可多选）', sceneChips, { hint: '不选的话，所有场合都可能推荐它' }),
          UI.field('适用性别', genderChips, { hint: '默认跟你的档案一致' }),
          h(
            'div',
            { class: 'row', style: { gap: '10px' } },
            h('div', { class: 'grow' }, UI.field('购买时间（可跳过）', dateInput)),
            h('div', { class: 'grow' }, UI.field('购买价格（可跳过）', priceInput))
          )
        );
      },
      footer: function (close) {
        return h(
          'button',
          {
            class: 'btn btn-primary btn-block',
            type: 'button',
            onclick: function () {
              /* 必填校验 */
              if (!draft.category) {
                U.toastWarn('选一下品类（上衣/裤装/鞋…）');
                return;
              }
              if (!draft.color_main) {
                U.toastWarn('选一下主色');
                return;
              }
              if (!draft.season_thickness) {
                U.toastWarn('选一下季节厚薄');
                return;
              }

              var record = {
                item_id: existing ? existing.item_id : '',
                profile_id: p.profile_id,
                photo_url: photo.dataUrl,
                category: draft.category,
                color_main: draft.color_main,
                color_sub: draft.color_sub || '',
                style: draft.style || '',
                season_thickness: draft.season_thickness,
                material: draft.material || '',
                scene_tags: draft.scene_tags || [],
                purchase_date: draft.purchase_date || '',
                purchase_price: draft.purchase_price === '' ? '' : Number(draft.purchase_price),
                wear_count: existing ? Number(existing.wear_count) || 0 : 0,
                gender: draft.gender,
                cutout: !!photo.cutout,
                created_at: existing ? existing.created_at : '',
              };

              var btn = close && null;
              void btn;
              DB.items
                .save(record)
                .then(function () {
                  close();
                  return App.reloadItems();
                })
                .then(function () {
                  App.render();
                  U.toastOk(isEdit ? '已保存修改' : '衣服已加入衣橱');
                })
                .catch(function (err) {
                  U.toastErr(err.message || '保存失败');
                });
            },
          },
          isEdit ? '保存修改' : '保存到衣橱'
        );
      },
    });

    void sheet;
  }

  /* ---------------------------------------------------------------------
     详情 / 编辑 / 删除
     --------------------------------------------------------------------- */
  function openDetail(item) {
    var kv = h('dl', { class: 'kv' });
    function row(k, v) {
      if (v === '' || v === null || v === undefined) return;
      kv.appendChild(h('dt', null, k));
      kv.appendChild(h('dd', null, v));
    }
    row('品类', item.category);
    row('主色', item.color_main ? h('span', { class: 'row', style: { gap: '6px' } }, UI.colorDot(item.color_main), item.color_main) : '');
    row('辅色', item.color_sub);
    row('风格', item.style);
    row('厚薄', item.season_thickness);
    row('材质', item.material);
    row('场合', (item.scene_tags || []).join('、'));
    row('适用性别', item.gender);
    row('穿着次数', String(item.wear_count || 0));
    row('购买时间', item.purchase_date ? U.fmtDate(item.purchase_date) : '');
    row('购买价格', item.purchase_price === '' || item.purchase_price === undefined ? '' : U.fmtPrice(item.purchase_price));
    row('加入时间', item.created_at ? U.fmtDate(String(item.created_at).slice(0, 10)) : '');

    U.sheet({
      title: '这件衣服',
      body: h(
        'div',
        null,
        h(
          'div',
          { class: 'sheet-item-preview' },
          h(
            'div',
            { class: 'thumb', style: { width: '96px', height: '96px', flex: 'none', borderRadius: '12px', border: '1px solid var(--line)' } },
            item.photo_url ? h('img', { src: item.photo_url, alt: '衣服' }) : h('div', { class: 'thumb-empty' }, '没有图片')
          ),
          h(
            'div',
            { class: 'grow' },
            h('div', { style: { fontWeight: '700' } }, item.category || '衣物'),
            h('div', { class: 'tiny', style: { marginTop: '4px' } }, (item.color_main || '') + (item.style ? ' · ' + item.style : '') + (item.season_thickness ? ' · ' + item.season_thickness : ''))
          )
        ),
        kv
      ),
      footer: function (close) {
        return h(
          'div',
          { style: { display: 'flex', gap: '8px', width: '100%' } },
          h(
            'button',
            {
              class: 'btn grow',
              type: 'button',
              onclick: function () {
                App.state.mixerAnchor = item.item_id;
                close();
                App.go('mixer');
              },
            },
            '用它配一套'
          ),
          h(
            'button',
            {
              class: 'btn btn-soft grow',
              type: 'button',
              onclick: function () {
                close();
                openEdit(item);
              },
            },
            '编辑'
          ),
          h(
            'button',
            {
              class: 'btn btn-danger',
              type: 'button',
              style: { flex: 'none', width: '52px' },
              'aria-label': '删除',
              onclick: function () {
                confirmDelete(item, close);
              },
            },
            '删除'
          )
        );
      },
    });
  }

  function openEdit(item) {
    /* 编辑时不重新处理图片，直接复用已经压缩好的图 */
    openTagForm(
      {
        dataUrl: item.photo_url,
        bytes: IM.bytesOfDataUrl(item.photo_url),
        cutout: !!item.cutout,
        degraded: false,
        reason: '',
      },
      item
    );
  }

  function confirmDelete(item, closeDetail) {
    U.confirm({
      title: '删除这件衣服？',
      message:
        '「' + (item.color_main || '') + (item.style || '') + item.category + '」会从衣橱里删掉，同时从已保存的搭配里移除。删掉就找不回来了。',
      okText: '删除',
      cancelText: '算了',
      danger: true,
    }).then(function (yes) {
      if (!yes) return;
      DB.items
        .remove(item.item_id)
        .then(function () {
          if (closeDetail) closeDetail();
          return App.reloadProfileData();
        })
        .then(function () {
          App.render();
          U.toastOk('已删除');
        })
        .catch(function (err) {
          U.toastErr(err.message || '删除失败');
        });
    });
  }

  V.wardrobe = {
    render: render,
    startAdd: startAdd,
    /* 换档案时把筛选条件清掉，避免"看起来衣橱是空的" */
    reset: function () {
      S.q = '';
      S.cat = '';
      S.color = '';
      S.style = '';
      S.scene = '';
      S.listHost = null;
    },
  };
})();
