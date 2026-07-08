#!/usr/bin/env node
// Vendors all front-end libraries into public/bower/ so the app works offline
// and does not depend on any external CDN or on the (deprecated) Bower tool.
// Run once with: npm run vendor  (outputs are committed to the repo).

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BOWER = path.join(ROOT, 'public', 'bower');

// Map of destination path (relative to public/bower) -> download URL.
// Paths intentionally match the references already in public/_partials/*.jade
// and the Bootstrap @import paths in public/css/themes/flat/_bootstrap.less.
const FILES = {
  // libraries previously loaded from a CDN (now vendored)
  'jquery/dist/jquery.min.js': 'https://cdn.jsdelivr.net/npm/jquery@2.1.4/dist/jquery.min.js',
  'lodash/lodash.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/3.10.1/lodash.min.js',

  // former Bower dependencies (single files)
  'd3/d3.min.js': 'https://cdn.jsdelivr.net/npm/d3@3.5.17/d3.min.js',
  'numeric/src/numeric.js': 'https://cdn.jsdelivr.net/gh/sloisel/numeric@master/src/numeric.js',
  'bfgs-numericjs/bfgs.js': 'https://cdn.jsdelivr.net/gh/croquelois/bfgs-numericjs/bfgs.js',
  'convexhull-js/convexhull.js': 'https://cdn.jsdelivr.net/gh/indy256/convexhull-js/convexhull.js',
  'js-lru/lru.js': 'https://cdn.jsdelivr.net/gh/rsms/js-lru/lru.js',
  'optimization-js/js/optimization.js': 'https://cdn.jsdelivr.net/gh/iaroslav-ai/optimization-js@1.0.0/src/optimization.js',
  'spectrum/spectrum.js': 'https://cdn.jsdelivr.net/npm/spectrum-colorpicker@1.8.0/spectrum.js',
  'spectrum/spectrum.css': 'https://cdn.jsdelivr.net/npm/spectrum-colorpicker@1.8.0/spectrum.css',
  'seiyria-bootstrap-slider/dist/bootstrap-slider.min.js': 'https://cdn.jsdelivr.net/gh/seiyria/bootstrap-slider@v6.0.6/dist/bootstrap-slider.min.js',
  'seiyria-bootstrap-slider/dist/css/bootstrap-slider.min.css': 'https://cdn.jsdelivr.net/gh/seiyria/bootstrap-slider@v6.0.6/dist/css/bootstrap-slider.min.css',
  // pinned to 3.3.2 (the version the app code was written against): later 3.3.x
  // fire the `onInit` callback before the .bootstrap-switch-label element exists,
  // which breaks the autoSnap switch setup in js/init.js.
  'bootstrap-switch/dist/js/bootstrap-switch.js': 'https://cdn.jsdelivr.net/npm/bootstrap-switch@3.3.2/dist/js/bootstrap-switch.js',
  'bootstrap-switch/dist/css/bootstrap3/bootstrap-switch.min.css': 'https://cdn.jsdelivr.net/npm/bootstrap-switch@3.3.2/dist/css/bootstrap3/bootstrap-switch.min.css',
  'bootbox.js/bootbox.js': 'https://cdn.jsdelivr.net/npm/bootbox@4.4.0/bootbox.js',
  'selectize/dist/js/standalone/selectize.js': 'https://cdn.jsdelivr.net/npm/selectize@0.12.6/dist/js/standalone/selectize.js',
  'selectize/dist/css/selectize.css': 'https://cdn.jsdelivr.net/npm/selectize@0.12.6/dist/css/selectize.css',
  'selectize/dist/css/selectize.bootstrap3.css': 'https://cdn.jsdelivr.net/npm/selectize@0.12.6/dist/css/selectize.bootstrap3.css',
  'keyboardjs/dist/keyboard.min.js': 'https://cdn.jsdelivr.net/npm/keyboardjs@2.6.4/dist/keyboard.min.js',
  'html.sortable/dist/html.sortable.min.js': 'https://cdn.jsdelivr.net/gh/voidberg/html5sortable@0.3.1/dist/html.sortable.min.js',
  'saveSvgAsPng/saveSvgAsPng.js': 'https://cdn.jsdelivr.net/gh/exupero/saveSvgAsPng@v1.0.1/saveSvgAsPng.js',
  'file-saver/FileSaver.min.js': 'https://cdn.jsdelivr.net/npm/file-saver@1.3.8/FileSaver.min.js',
  'gifffer/build/gifffer.min.js': 'https://cdn.jsdelivr.net/npm/gifffer@1.5.3/build/gifffer.min.js',

  // three.js for the spherical-sliceform 3D preview. Pinned to r134, the last
  // line that still ships a UMD global build + classic (non-module) OrbitControls,
  // matching the app's no-bundler <script>-tag convention.
  'three/three.min.js': 'https://cdn.jsdelivr.net/npm/three@0.134.0/build/three.min.js',
  'three/OrbitControls.js': 'https://cdn.jsdelivr.net/npm/three@0.134.0/examples/js/controls/OrbitControls.js',

  // lightbox2 (gallery page): js, css and its ui images
  'lightbox2/dist/js/lightbox.js': 'https://cdn.jsdelivr.net/gh/lokesh/lightbox2@v2.8.1/dist/js/lightbox.js',
  'lightbox2/dist/css/lightbox.css': 'https://cdn.jsdelivr.net/gh/lokesh/lightbox2@v2.8.1/dist/css/lightbox.css',
  'lightbox2/dist/images/close.png': 'https://cdn.jsdelivr.net/gh/lokesh/lightbox2@v2.8.1/dist/images/close.png',
  'lightbox2/dist/images/loading.gif': 'https://cdn.jsdelivr.net/gh/lokesh/lightbox2@v2.8.1/dist/images/loading.gif',
  'lightbox2/dist/images/next.png': 'https://cdn.jsdelivr.net/gh/lokesh/lightbox2@v2.8.1/dist/images/next.png',
  'lightbox2/dist/images/prev.png': 'https://cdn.jsdelivr.net/gh/lokesh/lightbox2@v2.8.1/dist/images/prev.png',

  // font-awesome 4.7 (icons used throughout the UI): css + webfonts
  'font-awesome/css/font-awesome.min.css': 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css',
  'font-awesome/fonts/fontawesome-webfont.woff2': 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.woff2',
  'font-awesome/fonts/fontawesome-webfont.woff': 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.woff',
  'font-awesome/fonts/fontawesome-webfont.ttf': 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.ttf',
  'font-awesome/fonts/fontawesome-webfont.eot': 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.eot',
  'font-awesome/fonts/fontawesome-webfont.svg': 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.svg',
};

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// Bootstrap 3 is compiled from Less (see _bootstrap.less), so we need the whole
// less/ source tree plus dist js and glyphicon fonts. Grab the release tarball.
function vendorBootstrap() {
  const dest = path.join(BOWER, 'bootstrap');
  if (fs.existsSync(path.join(dest, 'less', 'bootstrap.less'))) {
    console.log('  bootstrap/ (already present, skipping)');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bs-'));
  const tgz = path.join(tmp, 'bootstrap.tgz');
  execFileSync('curl', ['-sL', '-o', tgz,
    'https://github.com/twbs/bootstrap/archive/refs/tags/v3.3.7.tar.gz']);
  execFileSync('tar', ['xzf', tgz, '-C', tmp]);
  const src = path.join(tmp, 'bootstrap-3.3.7');
  fs.mkdirSync(dest, { recursive: true });
  for (const d of ['less', 'dist', 'fonts']) {
    fs.cpSync(path.join(src, d), path.join(dest, d), { recursive: true });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('  bootstrap/ (less + dist + fonts)');
}

(async () => {
  console.log('Vendoring Bootstrap 3.3.7 ...');
  vendorBootstrap();

  console.log('Vendoring libraries into public/bower ...');
  const entries = Object.entries(FILES);
  let ok = 0;
  for (const [rel, url] of entries) {
    const dest = path.join(BOWER, rel);
    try {
      const bytes = await download(url, dest);
      console.log(`  ${rel}  (${bytes} bytes)`);
      ok++;
    } catch (err) {
      console.error(`  FAILED ${rel}: ${err.message}`);
    }
  }
  console.log(`\nDone: ${ok}/${entries.length} files + bootstrap.`);
  if (ok < entries.length) process.exit(1);
})();
