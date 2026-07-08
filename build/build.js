#!/usr/bin/env node
// Static-site build for Sliceform Studio.
//
// Replaces the old Harp + Gulp 3 pipeline. It:
//   1. renders the Jade/Pug templates in public/ into www/*.html, replicating
//      the small subset of Harp semantics the templates rely on
//      (layouts, partial(), yield, per-page _data.json metadata, globals);
//   2. compiles public/css/*.less into www/css/*.css;
//   3. copies the static assets (js, bower, images, slfm_files) into www/.
//
// The app itself is entirely client-side, so this is purely a build-time tool.

'use strict';

const fs = require('fs');
const path = require('path');
const pug = require('pug');
const less = require('less');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DEST = path.join(ROOT, 'www');

const globals = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8')).globals;
const data = JSON.parse(fs.readFileSync(path.join(PUBLIC, '_data.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Pug / Harp compatibility layer
// ---------------------------------------------------------------------------

const templateCache = new Map();

function loadTemplate(file) {
  if (templateCache.has(file)) return templateCache.get(file);
  let src = fs.readFileSync(file, 'utf8');
  // Harp exposes `yield` as a plain local; Pug reserves the word in its strict
  // compiled output, so rename it to a normal identifier.
  src = src.replace(/\byield\b/g, '__yield');
  // Harp's markdown filters -> jstransformer-markdown-it (installed as a dep).
  src = src.replace(/:markdown\b/g, ':markdown-it').replace(/include:md\b/g, 'include:markdown-it');
  const fn = pug.compile(src, { filename: file, basedir: PUBLIC });
  templateCache.set(file, fn);
  return fn;
}

// Renders a template relative to public/ with the given locals. Exposed to
// templates as the Harp `partial()` helper.
function render(relPath, locals) {
  let file = path.join(PUBLIC, relPath);
  if (!file.endsWith('.jade')) file += '.jade';
  return loadTemplate(file)(locals);
}

function buildLocals(name, extra) {
  const locals = Object.assign({}, globals, data[name] || {}, extra);
  locals.current = { source: name, path: name === 'index' ? '/' : '/' + name + '.html' };
  locals.public = { _data: data };
  // Harp partial(): render another template with the current locals.
  locals.partial = (p) => render(p, locals);
  return locals;
}

function renderPage(name) {
  const locals = buildLocals(name, {});
  const content = render(name, locals);
  const layout = (data[name] && data[name].layout) || '_layout';
  return render(layout, Object.assign({}, locals, { __yield: content }));
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function pageNames() {
  return fs.readdirSync(PUBLIC)
    .filter((f) => f.endsWith('.jade') && !f.startsWith('_'))
    .map((f) => f.replace(/\.jade$/, ''));
}

function renderHtml() {
  fs.mkdirSync(DEST, { recursive: true });
  for (const name of pageNames()) {
    const html = renderPage(name);
    fs.writeFileSync(path.join(DEST, name + '.html'), html);
    console.log(`  html: ${name}.html`);
  }
}

async function compileCss() {
  const cssSrc = path.join(PUBLIC, 'css');
  const cssDest = path.join(DEST, 'css');
  fs.mkdirSync(cssDest, { recursive: true });
  const files = fs.readdirSync(cssSrc).filter((f) => f.endsWith('.less') && !f.startsWith('_'));
  for (const f of files) {
    const input = fs.readFileSync(path.join(cssSrc, f), 'utf8');
    const out = await less.render(input, { filename: path.join(cssSrc, f), paths: [cssSrc] });
    fs.writeFileSync(path.join(cssDest, f.replace(/\.less$/, '.css')), out.css);
    console.log(`  css:  ${f.replace(/\.less$/, '.css')}`);
  }
}

function copyAssets() {
  const copy = (rel) => {
    const src = path.join(PUBLIC, rel);
    if (!fs.existsSync(src)) return;
    fs.cpSync(src, path.join(DEST, rel), { recursive: true });
    console.log(`  copy: ${rel}/`);
  };
  copy('js');
  copy('bower');
  copy('images');
  copy('slfm_files');
  const htaccess = path.join(PUBLIC, '.htaccess');
  if (fs.existsSync(htaccess)) fs.copyFileSync(htaccess, path.join(DEST, '.htaccess'));
}

(async () => {
  console.log('Building into www/ ...');
  copyAssets();
  await compileCss();
  renderHtml();
  console.log('Build complete.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
