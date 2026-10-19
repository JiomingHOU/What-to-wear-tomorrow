/* ==========================================================================
   weather.js —— 天气（Open-Meteo 免费接口，不需要 API key、不需要注册）
   文档：
     - 预报  https://open-meteo.com/en/docs
     - 城市搜索 https://open-meteo.com/en/docs/geocoding-api
   接口地址：
     - https://api.open-meteo.com/v1/forecast
     - https://geocoding-api.open-meteo.com/v1/search  (参数 language=zh)
   ========================================================================== */
(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var DB = App.db;

  var W = {};

  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

  /* WMO weather code → 中文天气
     参考 https://open-meteo.com/en/docs 的 Weather variable documentation 表格 */
  var WMO = {
    0: '晴',
    1: '晴间多云',
    2: '多云',
    3: '阴',
    45: '有雾',
    48: '雾凇',
    51: '毛毛雨',
    53: '小雨',
    55: '中雨',
    56: '冻毛毛雨',
    57: '冻雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '阵雨',
    81: '强阵雨',
    82: '暴雨',
    85: '阵雪',
    86: '强阵雪',
    95: '雷阵雨',
    96: '雷雨伴冰雹',
    99: '强雷雨伴冰雹',
  };

  /* 天气 → 视觉风格类名（决定天气卡颜色） */
  function wmoClass(code) {
    var c = Number(code);
    if (c === 0 || c === 1) return 'sunny';
    if (c === 2 || c === 3 || c === 45 || c === 48) return 'cloudy';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if (c >= 51) return 'rain';
    return 'cloudy';
  }

  /* 天气 → 一句出行提醒 */
  function wmoTip(code, tmax, tmin) {
    var c = Number(code);
    var tips = [];
    if (c >= 51 && c <= 67) tips.push('可能下雨，记得带伞');
    if (c >= 80 && c <= 82) tips.push('有阵雨，带把伞更稳妥');
    if (c >= 95) tips.push('雷雨天气，尽量减少户外停留');
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) tips.push('有雪，穿防滑的鞋');
    if (c === 45 || c === 48) tips.push('有雾，出门注意安全');
    if (typeof tmax === 'number' && typeof tmin === 'number' && tmax - tmin >= 10) {
      tips.push('早晚温差 ' + Math.round(tmax - tmin) + '℃，建议穿脱方便');
    }
    if (typeof tmax === 'number' && tmax >= 32) tips.push('很热，注意防晒补水');
    if (typeof tmin === 'number' && tmin <= 0) tips.push('低于 0℃，注意保暖');
    return tips.slice(0, 2).join('；');
  }

  W.wmo = WMO;
  W.wmoText = function (code) {
    if (code === null || code === undefined) return '天气未知';
    var t = WMO[Number(code)];
    return t || '天气未知';
  };
  W.wmoClass = wmoClass;
  W.wmoTip = wmoTip;

  /* ---------------------------------------------------------------------
     内置常用城市坐标：作用是「城市搜索接口抽风时也能用」
     --------------------------------------------------------------------- */
  var PRESET_CITIES = [
    { name: '北京', latitude: 39.9042, longitude: 116.4074 },
    { name: '上海', latitude: 31.2304, longitude: 121.4737 },
    { name: '广州', latitude: 23.1291, longitude: 113.2644 },
    { name: '深圳', latitude: 22.5431, longitude: 114.0579 },
    { name: '重庆', latitude: 29.563, longitude: 106.5516 },
    { name: '成都', latitude: 30.5728, longitude: 104.0668 },
    { name: '杭州', latitude: 30.2741, longitude: 120.1551 },
    { name: '南京', latitude: 32.0603, longitude: 118.7969 },
    { name: '武汉', latitude: 30.5928, longitude: 114.3055 },
    { name: '西安', latitude: 34.3416, longitude: 108.9398 },
    { name: '天津', latitude: 39.3434, longitude: 117.3616 },
    { name: '青岛', latitude: 36.0671, longitude: 120.3826 },
    { name: '长沙', latitude: 28.2282, longitude: 112.9388 },
    { name: '郑州', latitude: 34.7466, longitude: 113.6253 },
    { name: '沈阳', latitude: 41.8057, longitude: 123.4315 },
    { name: '哈尔滨', latitude: 45.8038, longitude: 126.5349 },
    { name: '昆明', latitude: 25.0389, longitude: 102.7183 },
    { name: '厦门', latitude: 24.4798, longitude: 118.0894 },
    { name: '苏州', latitude: 31.2989, longitude: 120.5853 },
    { name: '香港', latitude: 22.3193, longitude: 114.1694 },
  ];

  W.presetCities = function () {
    return PRESET_CITIES.slice();
  };

  W.presetCity = function (name) {
    for (var i = 0; i < PRESET_CITIES.length; i++) {
      if (PRESET_CITIES[i].name === name) return PRESET_CITIES[i];
    }
    return null;
  };

  /* ---------------------------------------------------------------------
     城市搜索
     --------------------------------------------------------------------- */
  function withQuery(url, params) {
    var qs = Object.keys(params)
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      })
      .join('&');
    return url + '?' + qs;
  }

  /* 返回 [{name, label, latitude, longitude, country, admin1}] */
  W.searchCity = function (keyword) {
    var kw = String(keyword || '').trim();
    if (!kw) return Promise.resolve([]);

    var url = withQuery(GEOCODE_URL, {
      name: kw,
      count: 8,
      language: 'zh',
      format: 'json',
    });

    return U.withTimeout(
      fetch(url).then(function (res) {
        if (!res.ok) throw new Error('城市搜索接口返回 ' + res.status);
        return res.json();
      }),
      9000,
      '城市搜索超时'
    )
      .then(function (data) {
        var list = (data && data.results) || [];
        return list.map(function (r) {
          var parts = [r.name];
          if (r.admin1 && r.admin1 !== r.name) parts.push(r.admin1);
          if (r.country && r.country !== '中国') parts.push(r.country);
          return {
            name: r.name,
            label: parts.join(' · '),
            latitude: r.latitude,
            longitude: r.longitude,
            country: r.country || '',
            admin1: r.admin1 || '',
            population: r.population || 0,
          };
        });
      })
      .catch(function (err) {
        /* 搜索失败时，用内置城市做本地匹配，保证「能选到城市」 */
        var local = PRESET_CITIES.filter(function (c) {
          return c.name.indexOf(kw) !== -1;
        }).map(function (c) {
          return {
            name: c.name,
            label: c.name + '（内置）',
            latitude: c.latitude,
            longitude: c.longitude,
            country: '中国',
            admin1: '',
            local: true,
          };
        });
        if (local.length) return local;
        throw new Error('城市搜索失败：' + (err.message || '网络异常') + '。可以试试直接选下面的常用城市。');
      });
  };

  /* ---------------------------------------------------------------------
     坐标缓存（避免每次打开都重新搜索城市）
     --------------------------------------------------------------------- */
  function getCachedCoords(cityName) {
    var preset = W.presetCity(cityName);
    if (preset) return Promise.resolve(preset);
    return DB.meta.get('geo_cache', {}).then(function (cache) {
      var hit = cache && cache[cityName];
      if (hit && hit.latitude && hit.longitude) return hit;
      return null;
    });
  }

  function setCachedCoords(cityName, coords) {
    return DB.meta.get('geo_cache', {}).then(function (cache) {
      var c = cache || {};
      c[cityName] = {
        name: cityName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        admin1: coords.admin1 || '',
        ts: Date.now(),
      };
      return DB.meta.set('geo_cache', c);
    });
  }

  W.resolveCity = function (cityName) {
    var name = String(cityName || '').trim();
    if (!name) return Promise.resolve(null);
    return getCachedCoords(name).then(function (cached) {
      if (cached) return cached;
      return W.searchCity(name).then(function (list) {
        if (!list.length) {
          throw new Error('没找到城市「' + name + '」，请换个说法，或从常用城市里选。');
        }
        var best = list[0];
        return setCachedCoords(name, best).then(function () {
          return best;
        });
      });
    });
  };

  /* ---------------------------------------------------------------------
     天气预报
     --------------------------------------------------------------------- */
  /* 返回 { city, latitude, longitude, days:[{date,tmax,tmin,code,precip,text}], tomorrow, updatedAt, stale } */
  W.fetchForecast = function (cityName) {
    return W.resolveCity(cityName).then(function (coords) {
      if (!coords) throw new Error('还没有设置城市，请先选一个城市。');
      var url = withQuery(FORECAST_URL, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        /* weather_code 是新参数名，老版本接口叫 weathercode，下面两个字段都读一遍 */
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'auto',
        forecast_days: 3,
        wind_speed_unit: 'kmh',
      });

      return U.withTimeout(
        fetch(url).then(function (res) {
          if (!res.ok) throw new Error('天气接口返回 ' + res.status);
          return res.json();
        }),
        10000,
        '获取天气超时'
      ).then(function (data) {
        var d = (data && data.daily) || {};
        var dates = d.time || [];
        if (!dates.length) throw new Error('天气接口没有返回预报数据');

        var codes = d.weather_code || d.weathercode || [];
        var maxs = d.temperature_2m_max || [];
        var mins = d.temperature_2m_min || [];
        var precs = d.precipitation_probability_max || [];

        var days = dates.map(function (date, i) {
          return {
            date: date,
            tmax: Math.round(maxs[i]),
            tmin: Math.round(mins[i]),
            code: codes[i],
            text: W.wmoText(codes[i]),
            precip:
              precs[i] === null || precs[i] === undefined ? null : Math.round(precs[i]),
          };
        });

        /* 找到「明天」那一天：优先按本地日期匹配，找不到就用第 2 天 */
        var tomorrowKey = U.tomorrowStr();
        var tomorrow = null;
        for (var i = 0; i < days.length; i++) {
          if (days[i].date === tomorrowKey) {
            tomorrow = days[i];
            break;
          }
        }
        if (!tomorrow) tomorrow = days[1] || days[0];

        var result = {
          city: cityName,
          latitude: coords.latitude,
          longitude: coords.longitude,
          days: days,
          tomorrow: tomorrow,
          updatedAt: Date.now(),
          stale: false,
          /* 明日体感温度：最高最低取平均，再四舍五入 */
          tempAvg: Math.round(((tomorrow.tmax + tomorrow.tmin) / 2) * 10) / 10,
          iconClass: wmoClass(tomorrow.code),
          tip: wmoTip(tomorrow.code, tomorrow.tmax, tomorrow.tmin),
        };

        /* 缓存一份，断网时还能显示上一次的结果 */
        DB.meta.set('weather_cache', { city: cityName, data: result, ts: Date.now() });
        return result;
      });
    });
  };

  /* 带缓存的读取：
     - 有当天缓存且 30 分钟内 → 直接用
     - 取不到网络数据 → 用旧缓存（标记 stale: true）
     - 都没有 → 抛出错误，界面提示手动选城市 */
  W.load = function (cityName, opts) {
    var force = opts && opts.force;
    var now = Date.now();
    var key = cityName || '';

    return DB.meta.get('weather_cache', null).then(function (cache) {
      var sameCity = cache && cache.city === key;
      var fresh = cache && now - (cache.ts || 0) < 30 * 60 * 1000;
      if (!force && sameCity && fresh) {
        var c = Object.assign({}, cache.data);
        c.cached = true;
        return c;
      }
      return W.fetchForecast(cityName)
        .then(function (res) {
          return res;
        })
        .catch(function (err) {
          if (sameCity && cache.data) {
            var old = Object.assign({}, cache.data);
            old.stale = true;
            old.cached = true;
            old.error = err.message;
            return old;
          }
          throw err;
        });
    });
  };

  /* ---------------------------------------------------------------------
     定位（失败就交给调用方走「手动选城市」）
     --------------------------------------------------------------------- */
  W.locate = function () {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('这台手机/浏览器不支持定位，请手动选城市。'));
        return;
      }
      /* 非 HTTPS 环境（例如用电脑本地文件打开）浏览器会直接拒绝定位，这是浏览器规则 */
      if (!window.isSecureContext) {
        reject(new Error('当前不是 HTTPS 安全环境，浏览器不允许定位。请手动选城市。'));
        return;
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('定位超时，请手动选城市。'));
      }, 12000);

      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          var msg = '定位失败，请手动选城市。';
          if (err && err.code === 1) msg = '你拒绝了定位授权，请手动选城市。';
          else if (err && err.code === 3) msg = '定位超时，请手动选城市。';
          reject(new Error(msg));
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
      );
    });
  };

  /* 反查坐标对应的城市名（Open-Meteo 没有反查接口，用内置城市里最近的一个兜底） */
  W.nearestPresetCity = function (lat, lon) {
    var best = null;
    var bestD = Infinity;
    PRESET_CITIES.forEach(function (c) {
      var d = Math.pow(c.latitude - lat, 2) + Math.pow(c.longitude - lon, 2);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    });
    /* 0.6 度大约 60 公里，超出就认为不是熟悉城市 */
    return best && Math.sqrt(bestD) < 0.6 ? best : null;
  };

  App.weather = W;
})();
