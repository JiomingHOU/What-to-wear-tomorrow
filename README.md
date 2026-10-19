# 明天穿什么

一个手机浏览器用的服装搭配小应用。拍下自己的衣服，结合明天的天气和场合，每天推荐一套出门穿搭。

**纯前端、没有后端、没有账号、不需要注册、不需要任何 API key。** 照片只存在你自己的手机里。

> ✅ **已实测通过**：85 项自动化断言（推荐引擎 20 条 + 真实浏览器端到端 55 项 + 真实天气接口 10 项），
> 包括用真实照片走完「录入 → 生成明日穿搭 → 打卡」全流程。详见 [docs/交付说明与自检报告.md](docs/交付说明与自检报告.md)。

---

## 30 秒上手（电脑上先看一眼）

1. 双击项目里的 **`启动本地预览.bat`**
2. 浏览器会自动打开 `http://localhost:8080/index.html`
3. 建一个档案 → 去「衣橱」加几件衣服 → 回「明天」点生成

> 不要直接双击 `index.html`。浏览器不允许 `file://` 页面读本地数据库、调相机和定位，应用会提示你改用 bat 打开。

**想马上用手机试试**：bat 启动后窗口里会打印两三个 `http://192.168.x.x:8080/...` 地址，
手机连同一个 Wi-Fi，在浏览器里打开其中一个就能用（相机、相册正常；定位会被浏览器禁用，手动选城市即可）。

## 装到手机上

看 [docs/部署说明.md](docs/部署说明.md)。免费 HTTPS 托管，10 分钟能搞定，之后家人用手机直接打开网址。

## 三份说明

| 文档 | 什么时候看 |
|---|---|
| [docs/部署说明.md](docs/部署说明.md) | 要把网址发给家人之前 |
| [docs/家人使用说明.md](docs/家人使用说明.md) | 发给家人（可以直接微信转发） |
| [docs/交付说明与自检报告.md](docs/交付说明与自检报告.md) | 想知道每个文件干什么、规则怎么改 |

## 想改推荐规则？

不用动代码。改 `data/rules/` 下这三个 JSON 文件，刷新页面就生效：

- `temperature.json` —— 温度 → 穿多厚
- `scene.json` —— 场合 → 适合什么风格
- `color.json` —— 颜色怎么搭才好看

改坏了页面也不会白屏：读不到规则时会自动用内置默认值，并提示你。

## 目录结构

```
明天穿什么/
├── index.html              入口页面
├── manifest.webmanifest    添加到主屏幕用
├── sw.js                   离线缓存
├── icon.svg                桌面图标
├── 启动本地预览.bat         电脑上一键预览
├── css/app.css             全部样式
├── js/
│   ├── util.js             工具函数（DOM、提示、弹层）
│   ├── store.js            本地数据层（localForage + IndexedDB）
│   ├── rules.js            规则加载与查询
│   ├── weather.js          天气（Open-Meteo）
│   ├── image.js            图片压缩 + 抠图
│   ├── recommend.js        推荐引擎
│   ├── ui.js               界面零件
│   ├── app.js              启动、路由、共用流程
│   └── views/              五个 Tab 页面 + 引导 + 自检
├── data/
│   ├── hot_looks_seed.json 48 条热门穿搭（2025–2026，字段不许改）
│   ├── hot_looks_extra.json 100 条（2020–2024 历年 50 + 经典 50）
│   └── rules/              三个可编辑的规则文件
├── tools/static-server.js  Node 静态服务器（会打印手机可访问的局域网地址）
├── tools/serve-fallback.ps1  没有 node/python 时的纯 PowerShell 兜底服务器
└── docs/                   说明文档
```

## 用到的库（全部免费开源，无需注册）

| 库 / 接口 | 用途 | 官方文档 |
|---|---|---|
| localForage | 封装 IndexedDB 做本地存储 | https://localforage.github.io/localForage/ |
| @imgly/background-removal | 浏览器本地抠图 | https://github.com/imgly/background-removal-js |
| Open-Meteo 预报 | 天气数据 | https://open-meteo.com/en/docs |
| Open-Meteo 城市搜索 | 城市名 → 经纬度 | https://open-meteo.com/en/docs/geocoding-api |
