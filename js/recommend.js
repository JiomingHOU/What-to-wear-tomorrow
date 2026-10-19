/* ==========================================================================
   recommend.js —— 规则推荐引擎
   流程（与阶段4要求一一对应）：
     S1 硬过滤：按明日温度筛掉厚薄不符的，按场景筛掉风格明确冲突的
     S2 风格匹配：色彩和谐 + 风格一致性给候选组合打分
     S3 排序：得分降序，并预留「穿着频率降权」开关（默认关闭）
   两个入口：
     A 每日推荐  recommend.daily({gender, tempC, scene, items})
     B 单品延伸  recommend.extend({item, ...})
   规则数字全部来自 data/rules/*.json，改 JSON 就能改推荐结果。
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var R = App.rules;

  var RC = {};

  /* 分数换算成 0~100 的「匹配度」，70 分算满分参考值 */
  RC.SCORE_FULL = 70;

  /* 预留接口：把这几个开关打开就能启用穿着频率降权（阶段4先不启用） */
  RC.OPTIONS = {
    useWearCount: false,
    wearCountWeight: 0.4,
    maxCombos: 260,
    perSlotTop: 6,
    altCount: 3,
  };

  /* ---------------------------------------------------------------------
     小工具
     --------------------------------------------------------------------- */
  function uniq(arr) {
    var out = [];
    arr.forEach(function (x) {
      if (out.indexOf(x) === -1) out.push(x);
    });
    return out;
  }

  function countOf(arr, v) {
    var n = 0;
    arr.forEach(function (x) {
      if (x === v) n++;
    });
    return n;
  }

  function mostCommon(arr) {
    var best = null;
    var bestN = 0;
    uniq(arr).forEach(function (v) {
      var n = countOf(arr, v);
      if (n > bestN) {
        bestN = n;
        best = v;
      }
    });
    return best;
  }

  /* 一件衣物属于哪个搭配槽位 */
  RC.slotOfItem = function (item) {
    if (!item) return null;
    if (item.category === '连体装') return 'onepiece';
    return R.slotOf(item.category) || null;
  };

  /* 某个品类在该温度区间下允许的厚薄档位。
     鞋、帽子、配饰按 temperature.json 的 level_tolerance 放宽：
     一双薄款运动鞋一年四季都能穿，若严格按档位筛，20℃ 想运动时
     会因为「运动鞋是薄夏装」而凑不齐一套。 */
  RC.levelsFor = function (band, category) {
    var allowed = (band && band.levels) || [2, 3];
    var tolMap = (R.temperature && R.temperature.level_tolerance) || {};
    var tol = tolMap[category];
    if (!tol) return allowed;

    var out = allowed.slice();
    allowed.forEach(function (lv) {
      for (var d = -tol; d <= tol; d++) {
        var v = lv + d;
        if (v >= 1 && v <= 5 && out.indexOf(v) === -1) out.push(v);
      }
    });
    return out;
  };

  /* 把衣物按槽位分组 */
  function groupBySlot(items) {
    var g = { top: [], bottom: [], onepiece: [], shoes: [], outer: [], acc: [] };
    items.forEach(function (it) {
      var s = RC.slotOfItem(it);
      if (s && g[s]) g[s].push(it);
    });
    return g;
  }

  /* 该搭配用到的所有颜色 */
  function colorsOf(items) {
    var list = [];
    items.forEach(function (it) {
      if (it.color_main) list.push(it.color_main);
      if (it.color_sub) list.push(it.color_sub);
    });
    return list;
  }

  /* ---------------------------------------------------------------------
     S1 硬过滤
     --------------------------------------------------------------------- */
  RC.hardFilter = function (items, ctx) {
    var band = R.bandForTemp(ctx.tempC);
    var allowed = band.levels || [2, 3];
    var sceneConf = R.sceneConf(ctx.scene) || {};
    var banStyles = sceneConf.hard_ban_styles || [];

    var kept = [];
    var rejected = [];

    items.forEach(function (it) {
      var why = null;
      var gender = it.gender || '中性';
      if (ctx.gender && gender !== '中性' && gender !== ctx.gender) why = '性别不符';

      var lv = R.levelIndex(it.season_thickness);
      if (!why && lv && RC.levelsFor(band, it.category).indexOf(lv) === -1) {
        why = '厚薄不适合' + (band.label || '') + '（' + Math.round(ctx.tempC) + '℃）';
      }
      if (!why && banStyles.indexOf(it.style) !== -1) {
        why = '风格不适合「' + (sceneConf.label || ctx.scene) + '」';
      }

      if (why) rejected.push({ item: it, reason: why });
      else kept.push(it);
    });

    return { kept: kept, rejected: rejected, band: band, sceneConf: sceneConf };
  };

  /* ---------------------------------------------------------------------
     单件衣物质量分（用来给每个槽位预排序，避免组合爆炸）
     --------------------------------------------------------------------- */
  function scoreItem(it, ctx, band, sceneConf) {
    var sc = R.temperature.scores || {};
    var dsc = R.scene.default_scores || { prefer_style: 8, soft_ban_style: -10, prefer_category: 3, scene_tag_bonus: 6 };
    var score = 0;

    var lv = R.levelIndex(it.season_thickness);
    var idx = lv ? RC.levelsFor(band, it.category).indexOf(lv) : -1;
    if (idx === 0) score += sc.level_first || 10;
    else if (idx > 0) score += sc.level_second || 4;
    else if (lv) score -= 4;

    if ((sceneConf.prefer_styles || []).indexOf(it.style) !== -1) score += dsc.prefer_style;
    if ((sceneConf.soft_ban_styles || []).indexOf(it.style) !== -1) score += dsc.soft_ban_style;
    if ((sceneConf.prefer_categories || []).indexOf(it.category) !== -1) score += dsc.prefer_category;

    if (Array.isArray(it.scene_tags) && it.scene_tags.length) {
      if (R.sceneOverlap(it.scene_tags, [ctx.scene])) score += dsc.scene_tag_bonus;
      else score -= Math.round(dsc.scene_tag_bonus / 2);
    }

    /* 中性色单件更百搭，轻微加分 */
    if (R.isNeutral(it.color_main)) score += 2;

    return score;
  }

  /* ---------------------------------------------------------------------
     S2 组合打分
     --------------------------------------------------------------------- */
  RC.scoreCombo = function (items, ctx) {
    var band = R.bandForTemp(ctx.tempC);
    var sceneConf = R.sceneConf(ctx.scene) || {};
    var sc = R.temperature.scores || {};
    var dsc = R.scene.default_scores || { prefer_style: 8, soft_ban_style: -10, prefer_category: 3, scene_tag_bonus: 6 };

    var score = 0;

    /* 1) 温度厚薄 */
    items.forEach(function (it) {
      var lv = R.levelIndex(it.season_thickness);
      if (!lv) return;
      var idx = RC.levelsFor(band, it.category).indexOf(lv);
      if (idx === 0) score += sc.level_first || 10;
      else if (idx > 0) score += sc.level_second || 4;
      else score -= 5;
    });

    /* 2) 场景风格 */
    items.forEach(function (it) {
      if ((sceneConf.prefer_styles || []).indexOf(it.style) !== -1) score += dsc.prefer_style;
      if ((sceneConf.soft_ban_styles || []).indexOf(it.style) !== -1) score += dsc.soft_ban_style;
      if ((sceneConf.prefer_categories || []).indexOf(it.category) !== -1) score += dsc.prefer_category;
      if (Array.isArray(it.scene_tags) && it.scene_tags.length) {
        if (R.sceneOverlap(it.scene_tags, [ctx.scene])) score += dsc.scene_tag_bonus;
        else score -= Math.round(dsc.scene_tag_bonus / 2);
      }
    });

    /* 3) 色彩和谐 */
    var colorList = colorsOf(items);
    var colorResult = R.scoreColors(colorList);
    score += colorResult.score;

    /* 4) 风格一致性：同一风格件数越多越统一 */
    var styles = items
      .map(function (it) {
        return it.style;
      })
      .filter(Boolean);
    var modeStyle = mostCommon(styles);
    if (modeStyle) score += countOf(styles, modeStyle) * 3;

    /* 5) 外套：冷天没有外套要扣分 */
    var hasOuter = items.some(function (it) {
      return it.category === '外套';
    });
    if (band.outerwear === 'required' || band.outerwear === 'recommend') {
      score += hasOuter ? sc.outerwear_needed_bonus || 6 : sc.outerwear_missing_penalty || -12;
    } else if (hasOuter) {
      score += sc.outerwear_not_needed_penalty || -6;
    }

    /* 6) 穿着频率降权（预留，默认关闭） */
    if (RC.OPTIONS.useWearCount) {
      var totalWear = 0;
      items.forEach(function (it) {
        totalWear += Number(it.wear_count) || 0;
      });
      score -= totalWear * (RC.OPTIONS.wearCountWeight || 0.4);
    }

    return {
      score: score,
      scorePct: U.clamp(Math.round((score / RC.SCORE_FULL) * 100), 40, 99),
      colorResult: colorResult,
      band: band,
      modeStyle: modeStyle,
    };
  };

  /* ---------------------------------------------------------------------
     A 每日推荐
     返回 {
       ok, band, sceneConf, main:{items, score, scorePct, reasons}, alts:[...],
       missing:[槽位], missingText, advice, poolSize
     }
     --------------------------------------------------------------------- */
  RC.daily = function (opts) {
    var ctx = {
      gender: opts.gender || '',
      tempC: Number(opts.tempC),
      scene: opts.scene || '休闲',
    };
    if (!isFinite(ctx.tempC)) ctx.tempC = 20;

    var all = opts.items || [];
    var f = RC.hardFilter(all, ctx);
    var band = f.band;
    var sceneConf = f.sceneConf;
    var kept = f.kept;
    var g = groupBySlot(kept);

    /* 每个槽位先按单件质量分排序，只保留前 N 件参与组合，控制计算量 */
    function sortSlot(list) {
      return list
        .slice()
        .sort(function (a, b) {
          return scoreItem(b, ctx, band, sceneConf) - scoreItem(a, ctx, band, sceneConf);
        })
        .slice(0, RC.OPTIONS.perSlotTop);
    }

    var tops = sortSlot(g.top);
    var bottoms = sortSlot(g.bottom);
    var onepieces = sortSlot(g.onepiece);
    var shoes = sortSlot(g.shoes);
    var outers = sortSlot(g.outer);
    var accs = sortSlot(g.acc);

    /* 缺件判断（连体装可以同时顶替上衣和下装） */
    var missing = [];
    var hasTopOrOp = tops.length > 0 || onepieces.length > 0;
    var hasBottomOrOp = bottoms.length > 0 || onepieces.length > 0;
    if (!hasTopOrOp) missing.push('top');
    if (!hasBottomOrOp) missing.push('bottom');
    if (!shoes.length) missing.push('shoes');

    if (missing.length) {
      /* 注意：失败结果也要带上 tempC / scene / gender，
         否则界面会拿到 undefined，显示成「当前筛选条件：0℃」这种假信息 */
      return {
        ok: false,
        band: band,
        sceneConf: sceneConf,
        missing: missing,
        missingText: RC.missingText(missing, ctx.scene),
        advice: band.advice || '',
        poolSize: kept.length,
        totalItems: all.length,
        rejected: f.rejected.length,
        tempC: ctx.tempC,
        scene: ctx.scene,
        gender: ctx.gender,
      };
    }

    /* 生成候选组合 */
    var combos = [];
    function pushCombo(list) {
      if (combos.length >= RC.OPTIONS.maxCombos) return;
      combos.push(list);
    }

    if (onepieces.length) {
      onepieces.forEach(function (op) {
        shoes.forEach(function (sh) {
          pushCombo([op, sh]);
        });
      });
    }
    if (tops.length && bottoms.length) {
      tops.forEach(function (t) {
        bottoms.forEach(function (b) {
          shoes.forEach(function (sh) {
            pushCombo([t, b, sh]);
          });
        });
      });
    }
    /* 连体装 + 下装 的组合也允许（比如衬衫裙配裤子），但优先级放后面 */
    if (onepieces.length && bottoms.length) {
      onepieces.forEach(function (op) {
        bottoms.forEach(function (b) {
          shoes.forEach(function (sh) {
            pushCombo([op, b, sh]);
          });
        });
      });
    }

    /* 外套：按温度需要时，给每个组合挑一件最搭的外套 */
    var needOuter = band.outerwear === 'required' || band.outerwear === 'recommend';
    if (needOuter && outers.length) {
      combos = combos.map(function (list) {
        var best = null;
        var bestS = -Infinity;
        outers.forEach(function (o) {
          var c = RC.scoreCombo(list.concat([o]), ctx);
          if (c.score > bestS) {
            bestS = c.score;
            best = o;
          }
        });
        return best ? list.concat([best]) : list;
      });
    }

    /* 打分排序 */
    var scored = combos.map(function (list) {
      var c = RC.scoreCombo(list, ctx);
      return { items: list, score: c.score, scorePct: c.scorePct, colorResult: c.colorResult };
    });
    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    /* 去重：同一套衣服只留一次；备选要跟主推有区别 */
    function keyOf(list) {
      return list
        .map(function (it) {
          return it.item_id;
        })
        .sort()
        .join('|');
    }
    var seen = {};
    var unique = [];
    scored.forEach(function (s) {
      var k = keyOf(s.items);
      if (seen[k]) return;
      seen[k] = true;
      unique.push(s);
    });

    if (!unique.length) {
      return {
        ok: false,
        band: band,
        sceneConf: sceneConf,
        missing: missing,
        missingText:
          '这次的衣物都被温度或场景筛掉了（' +
          Math.round(ctx.tempC) +
          '℃ · ' +
          ctx.scene +
          '），试试放松场景或者补一件合适的衣服。',
        advice: band.advice || '',
        poolSize: kept.length,
        totalItems: all.length,
        rejected: f.rejected.length,
        tempC: ctx.tempC,
        scene: ctx.scene,
        gender: ctx.gender,
      };
    }

    /* 配饰：给主推挑一件颜色最搭的 */
    function attachAcc(list) {
      if (!accs.length) return list;
      var best = null;
      var bestS = -Infinity;
      accs.forEach(function (a) {
        var c = RC.scoreCombo(list.concat([a]), ctx);
        if (c.score > bestS) {
          bestS = c.score;
          best = a;
        }
      });
      /* 只有加了配饰确实更好看才加 */
      var base = RC.scoreCombo(list, ctx).score;
      return best && bestS > base ? list.concat([best]) : list;
    }

    var mainCombo = unique[0];
    var mainItems = attachAcc(mainCombo.items);
    var mainScore = RC.scoreCombo(mainItems, ctx);

    /* 备选：要跟主推在品类组合上有区别 */
    var alts = [];
    var mainKey = keyOf(mainItems);
    for (var i = 1; i < unique.length && alts.length < RC.OPTIONS.altCount; i++) {
      var cand = unique[i];
      if (keyOf(cand.items) === mainKey) continue;
      /* 不能跟已有的备选重复 */
      var dup = alts.some(function (a) {
        return keyOf(a.items) === keyOf(cand.items);
      });
      if (dup) continue;
      alts.push({ items: cand.items, score: cand.score, scorePct: cand.scorePct, colorResult: cand.colorResult });
    }

    /* 理由文案 */
    var reasons = [];
    if (mainScore.colorResult && mainScore.colorResult.notes.length) {
      reasons.push(mainScore.colorResult.notes[0]);
    }
    if (band.advice) reasons.push(band.advice);
    if (mainScore.modeStyle && countOf(
      mainItems.map(function (i) {
        return i.style;
      }),
      mainScore.modeStyle
    ) >= 2) {
      reasons.push('整体偏' + mainScore.modeStyle + '风，风格统一');
    }

    return {
      ok: true,
      band: band,
      sceneConf: sceneConf,
      main: {
        items: mainItems,
        score: Math.round(mainScore.score),
        scorePct: mainScore.scorePct,
        colorResult: mainScore.colorResult,
      },
      alts: alts,
      missing: [],
      missingText: '',
      reasons: reasons,
      advice: band.advice || '',
      poolSize: kept.length,
      totalItems: all.length,
      rejected: f.rejected.length,
      tempC: ctx.tempC,
      scene: ctx.scene,
      gender: ctx.gender,
    };
  };

  /* 缺件文案：尽量说人话，例如「缺少适合通勤的深色长裤或半身裙」
     scene.json 的 missing_hint 按槽位分开写（也兼容只写一段文字的老格式）。 */
  RC.missingText = function (slots, scene) {
    var conf = R.sceneConf(scene) || {};
    var sceneLabel = conf.label || scene || '';
    var list = slots || [];

    function slotNoun(s) {
      if (s === 'top') return '上衣';
      if (s === 'bottom') return '下装（裤装或裙装）';
      if (s === 'shoes') return '鞋';
      if (s === 'outer') return '外套';
      return R.SLOT_LABEL[s] || s;
    }

    /* 槽位专属的提示，比「下装」这种大类更好懂 */
    function hintFor(s) {
      var h = conf.missing_hint;
      if (!h) return '';
      if (typeof h === 'object') return String(h[s] || '').trim();
      /* 老格式：一段文字，去掉开头的「适合…的」，并且只在内容确实对应这个槽位时才用 */
      var text = String(h).replace(/^适合.+?的/, '').trim();
      var KEY = { top: /衣|衫|T恤/, bottom: /裤|裙/, shoes: /鞋/, outer: /外套|大衣|羽绒/ };
      return KEY[s] && KEY[s].test(text) ? text : '';
    }

    /* 只缺一类：直接说具体该买什么 */
    if (list.length === 1) {
      var hint = hintFor(list[0]);
      if (hint) return '缺少适合' + sceneLabel + '的' + hint;
    }

    var names = list.map(function (s) {
      return hintFor(s) || slotNoun(s);
    });
    return '缺少适合' + sceneLabel + '的' + uniq(names).join('、');
  };

  /* ---------------------------------------------------------------------
     B 单品延伸：给一件衣服找下装 / 鞋 / 配饰
     返回 { ok, anchor, bottoms, shoes, accs, missingText, note }
     --------------------------------------------------------------------- */
  RC.extend = function (opts) {
    var anchor = opts.item;
    if (!anchor) return { ok: false, missingText: '没有指定要搭配的衣服' };

    var ctx = {
      gender: opts.gender || '',
      tempC: isFinite(Number(opts.tempC)) ? Number(opts.tempC) : 20,
      scene: opts.scene || '休闲',
    };

    var f = RC.hardFilter(opts.items || [], ctx);
    var band = f.band;
    var sceneConf = f.sceneConf;
    var g = groupBySlot(f.kept);
    var anchorSlot = RC.slotOfItem(anchor);

    /* 要配的槽位：上衣/连体装 → 找下装；下装 → 找上衣 */
    var wantBottoms = anchorSlot === 'top' || anchorSlot === 'onepiece';
    var wantTops = anchorSlot === 'bottom';

    function rank(list) {
      return list
        .map(function (it) {
          var combo = [anchor, it];
          var c = RC.scoreCombo(combo, ctx);
          var cr = c.colorResult || { score: 0, notes: [] };
          return {
            item: it,
            score: c.score,
            scorePct: c.scorePct,
            colorResult: cr,
            why: cr.notes[0] || '',
          };
        })
        .sort(function (a, b) {
          return b.score - a.score;
        });
    }

    var bottoms = wantBottoms ? rank(g.bottom).slice(0, 6) : [];
    var tops = wantTops ? rank(g.top).slice(0, 6) : [];
    var shoes = rank(g.shoes).slice(0, 4);
    var accs = rank(g.acc).slice(0, 4);

    var missing = [];
    if (wantBottoms && !bottoms.length) missing.push('bottom');
    if (wantTops && !tops.length) missing.push('top');
    if (!shoes.length) missing.push('shoes');

    var note = '';
    var cr = R.scoreColors(colorsOf([anchor]));
    if (cr.accents.length === 1) {
      note = '「' + anchor.color_main + '」已经是亮色，下装和鞋优先用黑、白、灰、米这些中性色压住，整套才不乱。';
    } else if (cr.accents.length === 0) {
      note = '这件是中性色，很好搭，可以放心加一件亮色单品做重点。';
    }

    return {
      ok: !!(bottoms.length || tops.length),
      anchor: anchor,
      anchorSlot: anchorSlot,
      band: band,
      sceneConf: sceneConf,
      bottoms: bottoms,
      tops: tops,
      shoes: shoes,
      accs: accs,
      missing: missing,
      missingText: missing.length ? RC.missingText(missing, ctx.scene) : '',
      note: note,
      tempC: ctx.tempC,
      scene: ctx.scene,
    };
  };

  /* 给一个搭配算「一句话解释」，首页和搭配台都用得上 */
  RC.explain = function (items, ctx) {
    var c = RC.scoreCombo(items, ctx || { tempC: 20, scene: '休闲' });
    return {
      score: Math.round(c.score),
      scorePct: c.scorePct,
      notes: (c.colorResult && c.colorResult.notes) || [],
      band: c.band,
    };
  };

  App.recommend = RC;
})();
