/* ==========================================================================
   store.js —— 本地数据层
   1) 优先用 localForage 封装 IndexedDB（需求指定）
   2) 如果 CDN 拿不到 localForage，自动降级到内置的 IndexedDB 简易封装
   3) 如果浏览器连 IndexedDB 都没有，再降级到 localStorage（功能可用但容量小）
   数据永远只存在用户自己的手机里，不上传任何服务器。
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;

  /* 数据库名（IndexedDB 里的名字，改它会等于清空数据，请不要改） */
  var DB_NAME = 'mingtian-chuanshenme';
  var DB_VERSION = 1;

  /* 六张表 + 一张内部使用的 meta 表 */
  var STORES = ['profiles', 'clothing_items', 'outfits', 'wear_logs', 'hot_looks', 'wishlist', 'meta'];

  /* 每张表的主键字段名 */
  var PK = {
    profiles: 'profile_id',
    clothing_items: 'item_id',
    outfits: 'outfit_id',
    wear_logs: 'log_id',
    hot_looks: 'look_id',
    wishlist: 'wish_id',
    meta: 'id',
  };

  /* 衣物入库必须保留的字段（阶段1约定，别随意改名） */
  var ITEM_FIELDS = [
    'item_id',
    'profile_id',
    'photo_url',
    'category',
    'color_main',
    'color_sub',
    'style',
    'season_thickness',
    'material',
    'scene_tags',
    'purchase_date',
    'purchase_price',
    'wear_count',
    'created_at',
    'gender', // 适用性别（阶段2要求，额外增加，不影响上面的字段名）
    'cutout', // 是否已抠图（true/false），仅用于提示
    'note', // 备用备注，暂未在界面使用
  ];

  /* 热门穿搭种子数据的字段（必须与 hot_looks_seed.json 完全一致，一个字都不许改） */
  var HOT_LOOK_FIELDS = [
    'look_id',
    'gender',
    'season',
    'style_theme',
    'items_desc',
    'colors',
    'temp_min',
    'temp_max',
    'scene',
    'source',
    'source_url',
  ];

  var SEED_URL = 'data/hot_looks_seed.json';

  var DB = {
    DB_NAME: DB_NAME,
    STORES: STORES,
    PK: PK,
    ITEM_FIELDS: ITEM_FIELDS,
    HOT_LOOK_FIELDS: HOT_LOOK_FIELDS,
    driver: 'pending',
    seedCount: 0,
  };

  /* ======================================================================
     一、底层适配器
     ====================================================================== */

  /* ---------- 1.1 localForage 加载 ---------- */
  var LF_CDNS = [
    'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js',
    'https://unpkg.com/localforage@1.10.0/dist/localforage.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
  ];

  function loadScript(src, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = function () {
        if (done) return;
        done = true;
        resolve(src);
      };
      el.onerror = function () {
        if (done) return;
        done = true;
        reject(new Error('加载失败'));
      };
      document.head.appendChild(el);
      setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('加载超时'));
      }, timeoutMs || 6000);
    });
  }

  /* 三个 CDN 并行抢，谁先回来用谁。
     以前是一个失败才试下一个，三个都超时会让手机白等 18 秒。 */
  function loadLocalforage() {
    if (window.localforage) return Promise.resolve(window.localforage);

    return new Promise(function (resolve, reject) {
      var settled = false;
      var tried = 0;
      var total = LF_CDNS.length;

      function failOne(err) {
        if (settled) return;
        tried++;
        if (tried >= total) {
          settled = true;
          reject(err || new Error('localforage 的 CDN 都拿不到'));
        }
      }

      LF_CDNS.forEach(function (url) {
        loadScript(url, 5000)
          .then(function () {
            if (settled) return;
            if (!window.localforage) {
              failOne(new Error('localforage 未挂载'));
              return;
            }
            settled = true;
            resolve(window.localforage);
          })
          .catch(failOne);
      });
    });
  }

  /* ---------- 1.2 内置 IndexedDB 兜底（localForage 拿不到时使用） ---------- */
  var idbPromise = null;

  function openIdb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('浏览器不支持 IndexedDB'));
        return;
      }
      var req;
      try {
        req = indexedDB.open(DB_NAME + '-idl', DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error('IndexedDB 打开失败'));
      };
      req.onblocked = function () {
        reject(new Error('IndexedDB 被其它标签页占用'));
      };
    });
    return idbPromise;
  }

  /* 对 kv 表做一次操作，txMode: 'readonly' | 'readwrite' */
  function idbRun(txMode, fn) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', txMode);
        var store = tx.objectStore('kv');
        var out;
        try {
          out = fn(store);
        } catch (e) {
          reject(e);
          return;
        }
        tx.oncomplete = function () {
          resolve(out && out.__req ? out.__req.result : out);
        };
        tx.onerror = function () {
          reject(tx.error || new Error('IndexedDB 事务失败'));
        };
        tx.onabort = function () {
          reject(tx.error || new Error('IndexedDB 事务被中断'));
        };
      });
    });
  }

  function wrapReq(req) {
    return { __req: req };
  }

  /* ---------- 1.3 localStorage 兜底 ---------- */
  function makeLocalStorageStore(storeName) {
    var prefix = DB_NAME + '::' + storeName + '::';
    function keyOf(k) {
      return prefix + k;
    }
    return {
      get: function (k) {
        return Promise.resolve().then(function () {
          var raw = localStorage.getItem(keyOf(k));
          if (raw === null) return null;
          try {
            return JSON.parse(raw);
          } catch (e) {
            return null;
          }
        });
      },
      set: function (k, v) {
        return Promise.resolve().then(function () {
          localStorage.setItem(keyOf(k), JSON.stringify(v));
          return v;
        });
      },
      del: function (k) {
        return Promise.resolve().then(function () {
          localStorage.removeItem(keyOf(k));
        });
      },
      keys: function () {
        return Promise.resolve().then(function () {
          var out = [];
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) out.push(k.slice(prefix.length));
          }
          return out;
        });
      },
      clear: function () {
        return Promise.resolve().then(function () {
          var toDel = [];
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) toDel.push(k);
          }
          toDel.forEach(function (k) {
            localStorage.removeItem(k);
          });
        });
      },
    };
  }

  /* ---------- 1.4 统一适配器（把三种实现包成同样的接口） ---------- */
  function makeIndexedDbStore(storeName) {
    var prefix = storeName + '::';
    function fullKey(k) {
      return prefix + k;
    }
    return {
      get: function (k) {
        return idbRun('readonly', function (store) {
          return wrapReq(store.get(fullKey(k)));
        });
      },
      set: function (k, v) {
        return idbRun('readwrite', function (store) {
          return wrapReq(store.put(v, fullKey(k)));
        }).then(function () {
          return v;
        });
      },
      del: function (k) {
        return idbRun('readwrite', function (store) {
          return wrapReq(store.delete(fullKey(k)));
        });
      },
      keys: function () {
        return idbRun('readonly', function (store) {
          return wrapReq(store.getAllKeys());
        }).then(function (all) {
          return (all || [])
            .filter(function (k) {
              return typeof k === 'string' && k.indexOf(prefix) === 0;
            })
            .map(function (k) {
              return k.slice(prefix.length);
            });
        });
      },
      clear: function () {
        return idbRun('readwrite', function (store) {
          return wrapReq(store.clear());
        });
      },
    };
  }

  function makeLocalforageStore(name) {
    var inst = window.localforage.createInstance({ name: DB_NAME, storeName: name });
    return {
      get: function (k) {
        return inst.getItem(k);
      },
      set: function (k, v) {
        return inst.setItem(k, v);
      },
      del: function (k) {
        return inst.removeItem(k);
      },
      keys: function () {
        return inst.keys();
      },
      clear: function () {
        return inst.clear();
      },
    };
  }

  var adapters = {}; // storeName -> adapter
  var readyPromise = null;

  function buildAdapters(driver) {
    STORES.forEach(function (name) {
      if (driver === 'localforage') adapters[name] = makeLocalforageStore(name);
      else if (driver === 'indexeddb') adapters[name] = makeIndexedDbStore(name);
      else adapters[name] = makeLocalStorageStore(name);
    });
  }

  /* 启动时决定用哪一层，并做一次真实读写自检 */
  function init() {
    if (readyPromise) return readyPromise;

    readyPromise = loadLocalforage()
      .then(function () {
        buildAdapters('localforage');
        DB.driver = 'localforage';
        /* 自检：写一个探针，确认 IndexedDB 真的能用（隐私模式可能拒绝） */
        return adapters.meta
          .set('__probe', { t: Date.now() })
          .then(function () {
            return adapters.meta.get('__probe');
          })
          .then(function (v) {
            if (!v) throw new Error('localForage 写入后读不到数据');
            return adapters.meta.del('__probe');
          })
          .then(function () {
            return 'localforage';
          });
      })
      .catch(function () {
        /* localForage 不可用（CDN 打不开 / 隐私模式），用内置 IndexedDB */
        buildAdapters('indexeddb');
        DB.driver = 'indexeddb';
        return adapters.meta
          .set('__probe', { t: Date.now() })
          .then(function () {
            return adapters.meta.get('__probe');
          })
          .then(function (v) {
            if (!v) throw new Error('IndexedDB 写入后读不到数据');
            return adapters.meta.del('__probe');
          })
          .then(function () {
            return 'indexeddb';
          });
      })
      .catch(function () {
        /* 最后兜底：localStorage */
        buildAdapters('localstorage');
        DB.driver = 'localstorage';
        return 'localstorage';
      })
      .then(function (driver) {
        DB.driver = driver;
        return driver;
      });

    return readyPromise;
  }

  /* 把底层错误翻译成人话，并按类型提示 */
  function normalizeError(err, action) {
    var name = (err && (err.name || err.code)) || '';
    var msg = (err && err.message) || String(err);
    if (/Quota|quota/.test(name) || /Quota|quota/i.test(msg) || name === 22) {
      var e1 = new Error('手机本地存储空间已满，请到「衣橱」里删除一些不常穿的衣服，或降低照片清晰度后重试。');
      e1.code = 'QUOTA';
      return e1;
    }
    var e2 = new Error('保存失败（' + (action || '操作') + '）：' + msg);
    e2.code = 'WRITE';
    e2.raw = err;
    return e2;
  }

  /* ======================================================================
     二、通用表操作
     ====================================================================== */

  function adapterOf(storeName) {
    var a = adapters[storeName];
    if (!a) throw new Error('未知数据表：' + storeName);
    return a;
  }

  /* 读取一张表里的全部记录 */
  DB.all = function (storeName) {
    return init().then(function () {
      var a = adapterOf(storeName);
      return a
        .keys()
        .then(function (keys) {
          return Promise.all(
            keys.map(function (k) {
              return a.get(k).catch(function () {
                return null;
              });
            })
          );
        })
        .then(function (list) {
          return list.filter(Boolean);
        });
    });
  };

  /* 读一条 */
  DB.get = function (storeName, id) {
    if (id === null || id === undefined) return Promise.resolve(null);
    return init().then(function () {
      return adapterOf(storeName).get(String(id));
    });
  };

  /* 写一条（按主键覆盖） */
  DB.put = function (storeName, obj) {
    return init().then(function () {
      var pk = PK[storeName];
      var id = obj && obj[pk];
      if (!id) throw new Error('记录缺少主键 ' + pk);
      return adapterOf(storeName)
        .set(String(id), obj)
        .catch(function (err) {
          throw normalizeError(err, '保存');
        })
        .then(function () {
          return obj;
        });
    });
  };

  /* 批量写（导入、种子数据用） */
  DB.putMany = function (storeName, list) {
    return init().then(function () {
      var a = adapterOf(storeName);
      var pk = PK[storeName];
      var chain = Promise.resolve();
      list.forEach(function (obj) {
        chain = chain.then(function () {
          var id = obj && obj[pk];
          if (!id) return null;
          return a.set(String(id), obj);
        });
      });
      return chain
        .catch(function (err) {
          throw normalizeError(err, '批量保存');
        })
        .then(function () {
          return list.length;
        });
    });
  };

  /* 删一条 */
  DB.remove = function (storeName, id) {
    return init().then(function () {
      return adapterOf(storeName).del(String(id));
    });
  };

  /* 清空一张表 */
  DB.clear = function (storeName) {
    return init().then(function () {
      return adapterOf(storeName).clear();
    });
  };

  /* ======================================================================
     三、meta 表（应用自己的小状态）
     ====================================================================== */
  DB.meta = {
    /* 取内部状态。注意：meta 表存的是 { id, value, updated_at }，
       这里必须把 value 取出来，否则调用方拿到的是整条记录。 */
    get: function (key, fallback) {
      return DB.get('meta', key).then(function (rec) {
        if (!rec || rec.value === undefined || rec.value === null || rec.value === '') {
          return fallback;
        }
        return rec.value;
      });
    },
    set: function (key, value) {
      return DB.put('meta', { id: key, value: value, updated_at: new Date().toISOString() });
    },
  };

  /* ======================================================================
     四、档案 profiles
     ====================================================================== */
  DB.profiles = {
    list: function () {
      return DB.all('profiles').then(function (list) {
        return list.sort(function (a, b) {
          return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        });
      });
    },
    get: function (id) {
      return DB.get('profiles', id);
    },
    save: function (p) {
      var now = new Date().toISOString();
      return DB.profiles.get(p.profile_id).then(function (old) {
        var rec = Object.assign({}, old || {}, p, {
          profile_id: p.profile_id || U.uid('pf'),
          created_at: (old && old.created_at) || p.created_at || now,
          updated_at: now,
        });
        /* 字段顺序与阶段1约定一致 */
        var clean = {
          profile_id: rec.profile_id,
          nickname: rec.nickname || '家人',
          gender: rec.gender === '男' ? '男' : '女',
          city: rec.city || '',
          height_weight: rec.height_weight || '',
          style_prefs: Array.isArray(rec.style_prefs) ? rec.style_prefs : [],
          created_at: rec.created_at,
          updated_at: rec.updated_at,
        };
        return DB.put('profiles', clean);
      });
    },
    /* 删除档案 + 连带删除它的衣橱、搭配、打卡、心愿单 */
    remove: function (profileId) {
      return Promise.all([
        DB.items.list(profileId),
        DB.outfits.list(profileId),
        DB.wishlist.list(profileId),
        DB.logs.list(profileId),
      ])
        .then(function (res) {
          var items = res[0];
          var outfits = res[1];
          var wishes = res[2];
          var logs = res[3];
          var chain = Promise.resolve();
          items.forEach(function (it) {
            chain = chain.then(function () {
              return DB.remove('clothing_items', it.item_id);
            });
          });
          outfits.forEach(function (o) {
            chain = chain.then(function () {
              return DB.remove('outfits', o.outfit_id);
            });
          });
          wishes.forEach(function (w) {
            chain = chain.then(function () {
              return DB.remove('wishlist', w.wish_id);
            });
          });
          logs.forEach(function (l) {
            chain = chain.then(function () {
              return DB.remove('wear_logs', l.log_id);
            });
          });
          return chain;
        })
        .then(function () {
          return DB.remove('profiles', profileId);
        });
    },
  };

  /* ======================================================================
     五、衣物 clothing_items
     ====================================================================== */
  DB.items = {
    list: function (profileId) {
      return DB.all('clothing_items').then(function (list) {
        if (!profileId) return list;
        return list.filter(function (it) {
          return it.profile_id === profileId;
        });
      });
    },
    get: function (id) {
      return DB.get('clothing_items', id);
    },
    save: function (item) {
      var now = new Date().toISOString();
      return DB.items.get(item.item_id).then(function (old) {
        var rec = Object.assign({}, old || {}, item, {
          item_id: item.item_id || U.uid('item'),
          created_at: (old && old.created_at) || item.created_at || now,
          updated_at: now,
        });
        rec.wear_count = Number(rec.wear_count) || 0;
        rec.scene_tags = Array.isArray(rec.scene_tags) ? rec.scene_tags : [];
        return DB.put('clothing_items', rec);
      });
    },
    /* 删除衣物时，同时把它从已保存的搭配里摘掉，避免出现空图 */
    remove: function (itemId) {
      return DB.items
        .get(itemId)
        .then(function (item) {
          return DB.outfits.list(item ? item.profile_id : null).then(function (outfits) {
            var chain = Promise.resolve();
            outfits.forEach(function (o) {
              if (!Array.isArray(o.items) || o.items.indexOf(itemId) === -1) return;
              chain = chain.then(function () {
                var left = o.items.filter(function (x) {
                  return x !== itemId;
                });
                if (!left.length) return DB.remove('outfits', o.outfit_id);
                return DB.put('outfits', Object.assign({}, o, { items: left }));
              });
            });
            return chain;
          });
        })
        .then(function () {
          return DB.remove('clothing_items', itemId);
        });
    },
  };

  /* ======================================================================
     六、搭配 outfits
     ====================================================================== */
  DB.outfits = {
    list: function (profileId) {
      return DB.all('outfits').then(function (list) {
        var arr = !profileId
          ? list
          : list.filter(function (o) {
              return o.profile_id === profileId;
            });
        return arr.sort(function (a, b) {
          return String(b.created_at || '').localeCompare(String(a.created_at || ''));
        });
      });
    },
    get: function (id) {
      return DB.get('outfits', id);
    },
    save: function (outfit) {
      var now = new Date().toISOString();
      return DB.outfits.get(outfit.outfit_id).then(function (old) {
        var rec = Object.assign({}, old || {}, outfit, {
          outfit_id: outfit.outfit_id || U.uid('outfit'),
          created_at: (old && old.created_at) || outfit.created_at || now,
          updated_at: now,
        });
        rec.items = Array.isArray(rec.items) ? rec.items : [];
        return DB.put('outfits', rec);
      });
    },
    remove: function (id) {
      return DB.remove('outfits', id);
    },
  };

  /* ======================================================================
     七、打卡记录 wear_logs
     ====================================================================== */
  DB.logs = {
    list: function (profileId) {
      return DB.all('wear_logs').then(function (list) {
        var arr = !profileId
          ? list
          : list.filter(function (l) {
              return l.profile_id === profileId;
            });
        return arr.sort(function (a, b) {
          return String(b.date || '').localeCompare(String(a.date || ''));
        });
      });
    },
    /* 打卡：写一条记录，并给这套搭配里的每件衣物 wear_count +1 */
    add: function (profileId, outfitId, date, itemIds) {
      var rec = {
        log_id: U.uid('log'),
        profile_id: profileId,
        outfit_id: outfitId || '',
        date: date || U.tomorrowStr(),
        created_at: new Date().toISOString(),
      };
      return DB.put('wear_logs', rec)
        .then(function () {
          var ids = itemIds || [];
          var chain = Promise.resolve();
          ids.forEach(function (id) {
            chain = chain.then(function () {
              return DB.items.get(id).then(function (it) {
                if (!it) return null;
                return DB.put('clothing_items', Object.assign({}, it, { wear_count: (Number(it.wear_count) || 0) + 1 }));
              });
            });
          });
          return chain;
        })
        .then(function () {
          return rec;
        });
    },
    /* 同一天同一条记录只保留一条（避免连点） */
    existsToday: function (profileId, outfitId, date) {
      return DB.logs.list(profileId).then(function (logs) {
        return logs.some(function (l) {
          return l.outfit_id === outfitId && l.date === date;
        });
      });
    },
  };

  /* ======================================================================
     八、心愿单 wishlist
     ====================================================================== */
  DB.wishlist = {
    list: function (profileId) {
      return DB.all('wishlist').then(function (list) {
        var arr = !profileId
          ? list
          : list.filter(function (w) {
              return w.profile_id === profileId;
            });
        return arr.sort(function (a, b) {
          return String(b.created_at || '').localeCompare(String(a.created_at || ''));
        });
      });
    },
    save: function (wish) {
      var rec = Object.assign({}, wish, {
        wish_id: wish.wish_id || U.uid('wish'),
        created_at: wish.created_at || new Date().toISOString(),
      });
      return DB.put('wishlist', rec);
    },
    remove: function (id) {
      return DB.remove('wishlist', id);
    },
  };

  /* ======================================================================
     九、热门穿搭 hot_looks（首次启动从 data/hot_looks_seed.json 导入）
     ====================================================================== */
  DB.hotLooks = {
    list: function () {
      return DB.all('hot_looks').then(function (list) {
        return list.sort(function (a, b) {
          return String(a.look_id || '').localeCompare(String(b.look_id || ''));
        });
      });
    },
    get: function (id) {
      return DB.get('hot_looks', id);
    },
  };

  /* 校验单条数据是否具备 11 个字段，返回缺失字段数组 */
  function missingFields(obj, fields) {
    return fields.filter(function (f) {
      return !(f in obj);
    });
  }

  /* 读取种子文件（exactUrl 可覆盖，方便以后换文件） */
  function fetchSeed(url) {
    return fetch(url || SEED_URL, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('热门穿搭种子文件读取失败：HTTP ' + res.status);
      return res.json();
    });
  }

  /* 首次启动导入：hot_looks 为空时导入 48 条
     返回 { imported, total, intended: 48, exact } */
  DB.ensureSeed = function (opts) {
    var force = !!(opts && opts.force);
    return DB.hotLooks.list().then(function (existing) {
      if (existing.length && !force) {
        DB.seedCount = existing.length;
        return { imported: 0, total: existing.length, missing: [] };
      }
      return fetchSeed()
        .then(function (data) {
          if (!Array.isArray(data)) throw new Error('种子文件格式不对，应该是一个数组');
          var problems = [];
          var rows = data.map(function (row) {
            var miss = missingFields(row, HOT_LOOK_FIELDS);
            if (miss.length) problems.push((row && row.look_id) + ' 缺字段 ' + miss.join('/'));
            var out = {};
            HOT_LOOK_FIELDS.forEach(function (f) {
              out[f] = row[f];
            });
            return out;
          });
          if (problems.length) {
            throw new Error('热门穿搭字段和约定不一致：' + problems.slice(0, 3).join('；'));
          }
          var prep = force ? DB.clear('hot_looks') : Promise.resolve();
          return prep
            .then(function () {
              return DB.putMany('hot_looks', rows);
            })
            .then(function () {
              DB.seedCount = rows.length;
              return DB.meta.set('seed_imported_at', new Date().toISOString());
            })
            .then(function () {
              return {
                imported: rows.length,
                total: rows.length,
                missing: [],
                intended: 48,
                exact: rows.length === 48,
              };
            });
        });
    });
  };

  /* ======================================================================
     十、容量、导入导出（备份）
     ====================================================================== */
  DB.estimate = function () {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (e) {
        return {
          usage: e.usage || 0,
          quota: e.quota || 0,
          ratio: e.quota ? (e.usage || 0) / e.quota : 0,
        };
      });
    }
    return Promise.resolve({ usage: 0, quota: 0, ratio: 0 });
  };

  /* 导出全部数据为 JSON（备份/换手机用） */
  DB.exportAll = function () {
    var out = { app: '明天穿什么', version: 1, exported_at: new Date().toISOString() };
    var chain = Promise.resolve();
    ['profiles', 'clothing_items', 'outfits', 'wear_logs', 'hot_looks', 'wishlist'].forEach(function (name) {
      chain = chain.then(function () {
        return DB.all(name).then(function (list) {
          out[name] = list;
        });
      });
    });
    return chain.then(function () {
      return out;
    });
  };

  /* 导入备份（覆盖同主键记录，不删除其它记录） */
  DB.importAll = function (data) {
    if (!data || typeof data !== 'object') throw new Error('备份文件格式不对');
    var chain = Promise.resolve();
    var count = 0;
    ['profiles', 'clothing_items', 'outfits', 'wear_logs', 'hot_looks', 'wishlist'].forEach(function (name) {
      var list = data[name];
      if (!Array.isArray(list) || !list.length) return;
      chain = chain.then(function () {
        return DB.putMany(name, list).then(function (n) {
          count += n;
        });
      });
    });
    return chain.then(function () {
      return count;
    });
  };

  /* 清空全部数据（危险操作，界面上会二次确认） */
  DB.wipe = function () {
    var chain = Promise.resolve();
    STORES.forEach(function (name) {
      if (name === 'meta') return;
      chain = chain.then(function () {
        return DB.clear(name);
      });
    });
    return chain;
  };

  DB.ready = function () {
    return init();
  };

  App.db = DB;
})();
