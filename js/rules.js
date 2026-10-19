/* ==========================================================================
   rules.js —— 规则加载与查询
   规则都在 data/rules/ 下的三个 JSON 文件里，改 JSON 就能调整推荐逻辑。
   如果 JSON 读不到（文件缺失 / 格式写错），会自动用文件末尾内置的默认规则兜底，
   并在界面上给出提示，保证不会白屏。
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;

  var R = {};

  /* 固定的基础词表（与 JSON 里的配置配合使用） */
  R.CATEGORIES = ['上衣', '裤装', '裙装', '连体装', '鞋', '帽子', '配饰', '外套'];
  R.STYLES = ['极简', '通勤', '街头', '学院', '度假', '运动', '商务'];
  R.MATERIALS = ['棉', '麻', '针织', '牛仔', '皮革', '羽绒', '羊毛', '丝', '涤纶', '混纺'];
  R.GENDERS = ['男', '女', '中性'];
  R.DEFAULT_SCENES = ['通勤', '约会', '运动', '商务', '休闲', '度假', '校园'];

  /* 品类 → 搭配槽位。连体装单独一槽，能同时顶替上衣和下装。 */
  R.CATEGORY_SLOT = {
    上衣: 'top',
    裤装: 'bottom',
    裙装: 'bottom',
    连体装: 'onepiece',
    鞋: 'shoes',
    帽子: 'acc',
    配饰: 'acc',
    外套: 'outer',
  };

  R.SLOT_LABEL = {
    top: '上衣',
    bottom: '下装',
    onepiece: '连体装',
    shoes: '鞋',
    outer: '外套',
    acc: '配饰',
  };

  /* ---------------------------------------------------------------------
     一、内置默认规则（JSON 读取失败时使用）
     结构跟 data/rules/ 里的 JSON 一致，但内容做了精简：
     这里只保证「页面不白屏、推荐还能跑」，真正生效的是 JSON 文件。
     --------------------------------------------------------------------- */
  var DEFAULTS = {
    temperature: {
      levels: [
        { name: '薄夏装', index: 1, desc: '短袖、薄衬衫、薄裙、凉鞋' },
        { name: '春秋常规', index: 2, desc: '长袖T、薄卫衣、薄外套、长裤' },
        { name: '厚针织', index: 3, desc: '厚卫衣、毛衣、针织开衫、夹克' },
        { name: '厚外套', index: 4, desc: '呢大衣、风衣加厚、厚夹克' },
        { name: '棉服羽绒', index: 5, desc: '棉服、羽绒服、加厚冲锋衣' },
      ],
      bands: [
        { id: 'very_hot', label: '炎热', temp_min: 28, temp_max: 99, levels: [1], outerwear: 'none', advice: '短袖 + 薄短裤/裙' },
        { id: 'hot', label: '热', temp_min: 22, temp_max: 28, levels: [1, 2], outerwear: 'optional', advice: '短袖或薄长袖 + 薄外套备用' },
        { id: 'mild', label: '舒适', temp_min: 15, temp_max: 22, levels: [2, 3], outerwear: 'optional', advice: '卫衣 / 针织 / 薄外套' },
        { id: 'cool', label: '凉', temp_min: 8, temp_max: 15, levels: [3, 4], outerwear: 'recommend', advice: '毛衣 + 夹克或风衣' },
        { id: 'cold', label: '冷', temp_min: 0, temp_max: 8, levels: [4, 5], outerwear: 'required', advice: '棉服 / 羽绒 + 毛衣' },
        { id: 'freezing', label: '严寒', temp_min: -99, temp_max: 0, levels: [5], outerwear: 'required', advice: '厚羽绒 + 叠穿' },
      ],
      scores: {
        level_first: 10,
        level_second: 4,
        outerwear_needed_bonus: 6,
        outerwear_missing_penalty: -12,
        outerwear_not_needed_penalty: -6,
      },
      outerwear_categories: ['外套'],
      /* 鞋和配饰放宽厚薄档位，见 temperature.json 里的 说明_宽容度 */
      level_tolerance: { 鞋: 1, 帽子: 2, 配饰: 2 },
    },
    scene: {
      default_scores: { prefer_style: 8, soft_ban_style: -10, prefer_category: 3, scene_tag_bonus: 6 },
      required_slots: ['上衣', '下装', '鞋'],
      scenes: {
        通勤: { label: '通勤', emoji: '💼', hard_ban_styles: ['运动'], soft_ban_styles: ['街头'], prefer_styles: ['通勤', '商务', '极简'], prefer_categories: ['外套'], advice: '偏正式、不露肤', missing_hint: '适合通勤的长裤或半身裙' },
        约会: { label: '约会', emoji: '💗', hard_ban_styles: [], soft_ban_styles: ['商务'], prefer_styles: ['极简', '度假', '学院'], prefer_categories: [], advice: '风格统一优先', missing_hint: '有点设计感的上衣或裙子' },
        运动: { label: '运动', emoji: '🏃', hard_ban_styles: ['商务'], soft_ban_styles: ['通勤'], prefer_styles: ['运动'], prefer_categories: ['鞋'], advice: '运动套装、运动鞋优先', missing_hint: '运动鞋或速干运动上衣' },
        商务: { label: '商务', emoji: '🤝', hard_ban_styles: ['运动', '街头'], soft_ban_styles: [], prefer_styles: ['商务', '通勤', '极简'], prefer_categories: ['外套'], advice: '西装或正式外套', missing_hint: '西装外套或正装长裤' },
        休闲: { label: '休闲', emoji: '☕', hard_ban_styles: [], soft_ban_styles: ['商务'], prefer_styles: ['街头', '运动', '学院'], prefer_categories: [], advice: '怎么舒服怎么穿', missing_hint: '一条百搭的休闲裤和一双好走的鞋' },
        度假: { label: '度假', emoji: '🏖️', hard_ban_styles: ['商务'], soft_ban_styles: ['通勤'], prefer_styles: ['度假', '学院'], prefer_categories: [], advice: '轻薄、有度假感', missing_hint: '轻薄透气的上衣或裙子' },
        校园: { label: '校园', emoji: '🎒', hard_ban_styles: ['商务'], soft_ban_styles: [], prefer_styles: ['学院', '休闲', '街头'], prefer_categories: ['鞋'], advice: '学院风、休闲风都合适', missing_hint: '学院风上衣或好走的运动鞋' },
      },
      场景别名: { 职场: '通勤', 上班: '通勤', 户外: '休闲', 逛街: '休闲', 聚会: '约会', 上课: '校园' },
    },
    color: {
      palette: [
        { name: '白', hex: '#FFFFFF', family: '白' },
        { name: '米白', hex: '#F3EDE2', family: '米' },
        { name: '米', hex: '#E8DCC6', family: '米' },
        { name: '卡其', hex: '#C3B091', family: '卡其' },
        { name: '浅灰', hex: '#D5D5D5', family: '灰' },
        { name: '灰', hex: '#9E9E9E', family: '灰' },
        { name: '深灰', hex: '#5E5E5E', family: '灰' },
        { name: '黑', hex: '#1C1C1C', family: '黑' },
        { name: '藏青', hex: '#1F2A44', family: '蓝' },
        { name: '蓝', hex: '#2F6FD0', family: '蓝' },
        { name: '浅蓝', hex: '#A8CBEA', family: '蓝' },
        { name: '牛仔蓝', hex: '#4A6C8C', family: '蓝' },
        { name: '正红', hex: '#D8202A', family: '红' },
        { name: '粉', hex: '#E8A0B8', family: '粉' },
        { name: '黄', hex: '#F2C300', family: '黄' },
        { name: '绿', hex: '#2E8B57', family: '绿' },
        { name: '军绿', hex: '#4B5320', family: '绿' },
        { name: '棕', hex: '#6B4A2F', family: '棕' },
        { name: '紫', hex: '#6B4B8A', family: '紫' },
        { name: '橙', hex: '#E07B39', family: '橙' },
      ],
      alias: {},
      neutral_colors: ['白', '米白', '米', '卡其', '浅灰', '灰', '深灰', '黑'],
      neutral_words: ['中性色', '基础色', '无彩色'],
      scores: {
        base: 6,
        全部中性色: 14,
        中性色为主加一点亮色: 11,
        同色系深浅搭配: 9,
        全套同色: 12,
        两个亮色互相撞: -8,
        亮色加亮色但同色系: 3,
        主色超过三个: -14,
        上衣下装同色无变化: 2,
      },
      max_main_colors: 3,
    },
  };

  R.temperature = DEFAULTS.temperature;
  R.scene = DEFAULTS.scene;
  R.color = DEFAULTS.color;
  R.source = 'default'; // 'default' | 'json'
  R.brokenFiles = [];

  /* ---------------------------------------------------------------------
     二、读取 JSON
     --------------------------------------------------------------------- */
  function fetchJson(url) {
    return U.withTimeout(
      fetch(url, { cache: 'no-cache' }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }),
      8000,
      '读取规则超时'
    );
  }

  R.ready = Promise.all([
    fetchJson('data/rules/temperature.json').catch(function (e) {
      R.brokenFiles.push('temperature.json（' + e.message + '）');
      return null;
    }),
    fetchJson('data/rules/scene.json').catch(function (e) {
      R.brokenFiles.push('scene.json（' + e.message + '）');
      return null;
    }),
    fetchJson('data/rules/color.json').catch(function (e) {
      R.brokenFiles.push('color.json（' + e.message + '）');
      return null;
    }),
  ]).then(function (res) {
    if (res[0] && res[0].bands && res[0].levels) R.temperature = res[0];
    if (res[1] && res[1].scenes) R.scene = res[1];
    if (res[2] && res[2].palette && res[2].palette.length) R.color = res[2];
    R.source = R.brokenFiles.length ? 'default' : 'json';

    /* 索引，便于快速查 */
    R._levelByName = {};
    (R.temperature.levels || []).forEach(function (l) {
      R._levelByName[l.name] = l;
    });
    R._paletteByName = {};
    (R.color.palette || []).forEach(function (c) {
      R._paletteByName[c.name] = c;
    });
    R.sceneList = Object.keys(R.scene.scenes || {});
    R.neutralSet = {};
    (R.color.neutral_colors || []).forEach(function (n) {
      R.neutralSet[n] = true;
    });
    return R;
  });

  /* ---------------------------------------------------------------------
     三、温度规则查询
     --------------------------------------------------------------------- */
  /* 返回该温度所处的区间对象 */
  R.bandForTemp = function (t) {
    var temp = Number(t);
    if (!isFinite(temp)) temp = 20;
    var bands = (R.temperature.bands || []).slice().sort(function (a, b) {
      return b.temp_min - a.temp_min;
    });
    for (var i = 0; i < bands.length; i++) {
      if (temp >= bands[i].temp_min && temp < bands[i].temp_max) return bands[i];
    }
    /* 极端值兜底 */
    if (temp < -99) return bands[bands.length - 1];
    return bands[0];
  };

  /* 档位名 → 数字序号（1 最薄） */
  R.levelIndex = function (name) {
    var l = R._levelByName && R._levelByName[name];
    return l ? l.index : 0;
  };

  R.levelNames = function () {
    return (R.temperature.levels || []).map(function (l) {
      return l.name;
    });
  };

  R.levelDesc = function (name) {
    var l = R._levelByName && R._levelByName[name];
    return l ? l.desc || '' : '';
  };

  /* 该温度下可穿的档位序号数组，第一个是首选 */
  R.allowedLevels = function (t) {
    var band = R.bandForTemp(t);
    return (band && band.levels) || [2, 3];
  };

  /* ---------------------------------------------------------------------
     四、场景规则查询
     --------------------------------------------------------------------- */
  /* 把「职场」「户外」这类别名统一成标准场景 */
  R.canonicalScene = function (name) {
    var s = String(name || '').trim();
    if (!s) return null;
    if (R.scene.scenes && R.scene.scenes[s]) return s;
    var alias = (R.scene && R.scene['场景别名']) || {};
    if (alias[s]) return alias[s];
    /* 兜底：模糊匹配，例如「通勤/上班」取第一段 */
    var head = s.split(/[\/、,，]/)[0];
    if (R.scene.scenes && R.scene.scenes[head]) return head;
    if (alias[head]) return alias[head];
    return null;
  };

  R.sceneConf = function (name) {
    var c = R.canonicalScene(name);
    return (c && R.scene.scenes[c]) || null;
  };

  /* 两个场景标签是否算「有交集」（会把别名先归一） */
  R.sceneOverlap = function (a, b) {
    var A = (Array.isArray(a) ? a : [a]).map(R.canonicalScene).filter(Boolean);
    var B = (Array.isArray(b) ? b : [b]).map(R.canonicalScene).filter(Boolean);
    return A.some(function (x) {
      return B.indexOf(x) !== -1;
    });
  };

  R.slotOf = function (category) {
    return R.CATEGORY_SLOT[category] || null;
  };

  R.categoriesOfSlot = function (slot) {
    return Object.keys(R.CATEGORY_SLOT).filter(function (c) {
      return R.CATEGORY_SLOT[c] === slot;
    });
  };

  /* ---------------------------------------------------------------------
     五、颜色规则与工具
     --------------------------------------------------------------------- */
  R.palette = function () {
    return (R.color.palette || []).slice();
  };

  R.colorInfo = function (name) {
    if (!name) return null;
    var p = R._paletteByName && R._paletteByName[name];
    if (p) return p;
    var alias = (R.color.alias || {})[name];
    if (alias && R._paletteByName[alias]) return R._paletteByName[alias];
    return null;
  };

  R.hexOf = function (name) {
    var c = R.colorInfo(name);
    return c ? c.hex : '#CFC7BC';
  };

  R.familyOf = function (name) {
    var c = R.colorInfo(name);
    if (c) return c.family || c.name;
    if (/黑|gray|灰/.test(name || '')) return '灰';
    return String(name || '其他');
  };

  R.isNeutral = function (name) {
    if (!name) return false;
    if (R.neutralSet && R.neutralSet[name]) return true;
    var a = (R.color.alias || {})[name];
    if (a && R.neutralSet && R.neutralSet[a]) return true;
    /* 中性色家族兜底 */
    var fam = R.familyOf(name);
    return ['白', '米', '灰', '黑', '卡其'].indexOf(fam) !== -1;
  };

  /* 从一段文字里解析出颜色名（用于热门穿搭的 colors 字段）
     例：「深蓝 × 巧克力 × 奶白」→ ['深蓝','巧克力','奶白']
         「黑白灰 + 一处亮色」→ ['黑','白','灰']
  */
  R.extractColors = function (text) {
    var s = String(text || '');
    if (!s) return [];
    var info = R.extractColorInfo(text);
    return info.colors;
  };

  /* 更详细版：额外告诉调用方「有没有提到中性色 / 亮色」 */
  R.extractColorInfo = function (text) {
    var s = String(text || '');
    var out = { colors: [], mentionsNeutral: false, mentionsColorful: false };

    /* 1) 先把别名展开（长的优先，避免「藏蓝」被「蓝」抢先命中） */
    var alias = R.color.alias || {};
    Object.keys(alias)
      .sort(function (a, b) {
        return b.length - a.length;
      })
      .forEach(function (k) {
        if (s.indexOf(k) === -1) return;
        s = s.split(k).join('、' + alias[k] + '、');
      });

    /* 2) 再按色板名字从长到短匹配，命中后把原文抹掉，避免短名重复命中 */
    var names = (R.color.palette || [])
      .map(function (c) {
        return c.name;
      })
      .sort(function (a, b) {
        return b.length - a.length;
      });

    names.forEach(function (n) {
      if (s.indexOf(n) === -1) return;
      if (out.colors.indexOf(n) === -1) out.colors.push(n);
      s = s.split(n).join('、');
    });

    /* 3) 兜底：一些写法只用单字（「红×白×蓝」「薄荷曼波绿」），
          上面已经把成对的长颜色名抹掉了，剩下的单字就当作颜色看待 */
    var SINGLE_CHAR = {
      红: '正红',
      绿: '绿',
      黄: '黄',
      蓝: '蓝',
      橙: '橙',
      紫: '紫',
      棕: '棕',
      粉: '粉',
      灰: '灰',
      黑: '黑',
      白: '白',
      米: '米',
    };
    Object.keys(SINGLE_CHAR).forEach(function (ch) {
      if (s.indexOf(ch) === -1) return;
      var target = SINGLE_CHAR[ch];
      if (out.colors.indexOf(target) === -1) out.colors.push(target);
    });

    (R.color.neutral_words || []).forEach(function (w) {
      if (String(text).indexOf(w) !== -1) out.mentionsNeutral = true;
    });
    if (/彩色|撞色|亮色|多巴胺|流行色/.test(String(text))) out.mentionsColorful = true;

    return out;
  };

  /* 给一组颜色打分：越高说明越协调 */
  R.scoreColors = function (colorNames) {
    var sc = R.color.scores || DEFAULTS.color.scores;
    var list = (colorNames || []).filter(Boolean);
    var uniq = [];
    list.forEach(function (c) {
      if (uniq.indexOf(c) === -1) uniq.push(c);
    });

    var notes = [];
    if (!uniq.length) {
      return { score: sc.base || 6, accents: [], families: [], notes: ['没有填颜色，配色无法判断'] };
    }

    var families = uniq.map(R.familyOf);
    var uniqFamilies = [];
    families.forEach(function (f) {
      if (uniqFamilies.indexOf(f) === -1) uniqFamilies.push(f);
    });

    var accents = uniq.filter(function (c) {
      return !R.isNeutral(c);
    });

    var score = sc.base || 6;

    if (!accents.length) {
      score += sc['全部中性色'] || 14;
      notes.push('全是中性色，安全百搭');
    } else if (accents.length === 1) {
      score += sc['中性色为主加一点亮色'] || 11;
      notes.push('一个亮色 + 中性色，有重点不花');
    } else {
      var firstFam = R.familyOf(accents[0]);
      var sameFamily = accents.every(function (a) {
        return R.familyOf(a) === firstFam;
      });
      if (sameFamily) {
        score += sc['亮色加亮色但同色系'] || 3;
        notes.push('两个亮色但同色系，勉强协调');
      } else {
        score += sc['两个亮色互相撞'] || -8;
        notes.push('亮色偏多，容易显乱');
      }
    }

    if (uniqFamilies.length === 1 && uniq.length > 1) {
      score += sc['同色系深浅搭配'] || 9;
      notes.push('同色系深浅搭配，显高级');
    }
    if (uniq.length === 1) {
      score += sc['全套同色'] || 12;
      notes.push('全身一个颜色，极简但不单调要靠材质');
    }
    if (uniqFamilies.length > (R.color.max_main_colors || 3)) {
      score += sc['主色超过三个'] || -14;
      notes.push('主色超过三个了，建议收一收');
    }

    return { score: score, accents: accents, families: uniqFamilies, notes: notes };
  };

  App.rules = R;
})();
