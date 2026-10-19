/* ==========================================================================
   views/onboarding.js —— 首次打开的引导：建第一个档案
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var R = App.rules;
  var UI = App.ui;
  var h = U.h;

  var V = (App.views = App.views || {});

  V.onboarding = {
    render: function (root, opts) {
      var onDone = (opts && opts.onDone) || function () {};

      var draft = { nickname: '', gender: '女', city: '', height_weight: '', style_prefs: [] };

      var nicknameInput = h('input', {
        class: 'input',
        type: 'text',
        placeholder: '例如：妈妈、爸爸、我',
        maxlength: '12',
        enterkeyhint: 'done',
      });
      nicknameInput.addEventListener('input', function () {
        draft.nickname = nicknameInput.value;
      });

      var genderChips = UI.chips(['女', '男'], {
        selected: '女',
        onPick: function (v) {
          draft.gender = v;
        },
      });

      var cityLabel = h('span', { class: 'muted' }, '还没选');
      var cityBtn = h(
        'button',
        {
          class: 'btn btn-block',
          type: 'button',
          style: { justifyContent: 'space-between' },
          onclick: function () {
            App.pickCity({ current: draft.city, query: draft.city }).then(function (name) {
              if (!name) return;
              draft.city = name;
              cityLabel.textContent = name;
              cityLabel.style.color = 'var(--text)';
            });
          },
        },
        h('span', null, '选择城市'),
        cityLabel
      );

      var submitBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button' }, '开始使用');
      submitBtn.addEventListener('click', function () {
        if (!draft.nickname.trim()) {
          U.toastWarn('先填一个昵称吧');
          nicknameInput.focus();
          return;
        }
        if (!draft.city) {
          U.toastWarn('选一个城市，才能查明天的天气');
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = '正在创建…';
        App.saveProfile(Object.assign({}, draft, { nickname: draft.nickname.trim() }))
          .then(function (saved) {
            U.toastOk('档案建好了，开始拍衣服吧');
            App.state.profile = saved;
            onDone(saved);
          })
          .catch(function (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = '开始使用';
            U.toastErr(err.message || '创建失败');
          });
      });

      var page = h(
        'div',
        { class: 'onboard' },
        h('div', { class: 'onboard-logo' }, '衣'),
        h('h1', null, '明天穿什么'),
        h('p', { class: 'lead' }, '拍下你自己的衣服，结合明天的天气和你要去的场合，每天给你挑一套出门搭配。照片只存在你手机里，不会上传。'),
        h(
          'div',
          { class: 'onboard-form' },
          UI.field('先给你自己建一个档案', nicknameInput, { required: true }),
          UI.field('性别', genderChips, { required: true }),
          UI.field('所在城市', cityBtn, { required: true, hint: '只用来查明天的天气' }),
          h(
            'button',
            { class: 'field-hint', type: 'button', style: { textAlign: 'left', padding: '4px 0' } },
            '身高体重、风格偏好可以以后再填，先开始也行'
          ),
          submitBtn
        ),
        h(
          'div',
          { class: 'onboard-points' },
          point('1', '每个家人一个档案，衣橱互相看不到'),
          point('2', '上传的照片会先压缩，最多 1600px，只存压缩后的图'),
          point('3', '天气来自 Open-Meteo，免费、不用注册、不用填 key')
        )
      );

      root.appendChild(page);

      function point(n, text) {
        return h('div', { class: 'onboard-point' }, h('i', null, n), h('span', null, text));
      }
    },
  };
})();
