/* ==========================================================================
   tools/static-server.js —— 零依赖的极简静态服务器
   用途：`启动本地预览.bat` 在电脑上有 Node.js 但没有 Python 时用它。
   用法：node tools/static-server.js 8080
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname || '/');
  } catch (e) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  /* 防目录穿越 */
  const target = path.normalize(path.join(ROOT, pathname));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 找不到文件：' + pathname);
      return;
    }

    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'Content-Length': stat.size,
    });
    fs.createReadStream(target).pipe(res);
  });
});

/* 找出这台电脑在局域网里的地址，方便手机直接访问 */
function lanAddresses() {
  const os = require('os');
  const out = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((net) => {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (v4 && !net.internal) out.push(net.address);
    });
  });
  return out;
}

server.listen(PORT, () => {
  const lan = lanAddresses();

  console.log('');
  console.log('  本地预览已启动');
  console.log('');
  console.log('  电脑打开：  http://localhost:' + PORT + '/index.html');
  if (lan.length) {
    console.log('  手机打开（要连同一个 Wi-Fi）：');
    lan.forEach((ip) => {
      console.log('              http://' + ip + ':' + PORT + '/index.html');
    });
  } else {
    console.log('  手机打开：  没检测到局域网地址，请确认已连 Wi-Fi');
  }
  console.log('');
  console.log('  提示：手机用局域网地址访问不是 HTTPS，浏览器会禁用定位；');
  console.log('        相机和相册可以正常用，天气在「改城市」里手动选即可。');
  console.log('        「添加到主屏幕」必须部署到 https 网址后才能用。');
  console.log('');
  console.log('  按 Ctrl+C 停止。');
  console.log('');
});
