#!/usr/bin/env node
// Minimal static dev server for the built site in www/.
// Replaces `harp server` / `gulp serve`. No external dependencies.
//
//   npm run serve            serve www/ on http://localhost:9000
//   npm run serve -- --watch rebuild automatically when public/ changes

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'www');
const PORT = process.env.PORT || 9000;
const watch = process.argv.includes('--watch');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.slfm': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.join(DEST, path.normalize(urlPath));
  // prevent path traversal outside www/
  if (!filePath.startsWith(DEST)) return send(res, 403, 'Forbidden');

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      const notFound = path.join(DEST, '404.html');
      if (fs.existsSync(notFound)) {
        return send(res, 404, fs.readFileSync(notFound), MIME['.html']);
      }
      return send(res, 404, 'Not found');
    }
    send(res, 200, buf, MIME[path.extname(filePath)] || 'application/octet-stream');
  });
});

function rebuild() {
  console.log('Change detected, rebuilding ...');
  spawnSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
}

if (!fs.existsSync(DEST)) {
  console.log('www/ not found; running an initial build ...');
  rebuild();
}

if (watch) {
  let timer = null;
  fs.watch(path.join(ROOT, 'public'), { recursive: true }, (_evt, file) => {
    if (file && /\.(jade|less|js|json)$/.test(file) && !file.startsWith('bower')) {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 150);
    }
  });
  console.log('Watching public/ for changes ...');
}

server.listen(PORT, () => {
  console.log(`Sliceform Studio dev server: http://localhost:${PORT}`);
});
