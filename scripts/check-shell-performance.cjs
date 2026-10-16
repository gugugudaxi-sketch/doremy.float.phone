const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const next = require('next/server');
function load(file, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, setTimeout, clearTimeout, process, ...globals }, { filename: file });
  return exports;
}
(async () => {
  let count = 0;
  class Image {
    constructor() { count++; }
    set src(url) { queueMicrotask(() => url.includes('failed') ? this.onerror?.() : this.onload?.()); }
  }
  let queries = 0;
  const node = { getClientRects: () => [1] };
  const meta = { content: '' };
  const document = { documentElement: {}, head: { appendChild() {} }, querySelector: () => meta,
    createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) }) }) };
  const bg = load('lib/bg-tone.ts', { Image, document, Uint8ClampedArray,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', backgroundColor: 'rgb(0,0,0)', backgroundImage: 'none', getPropertyValue: () => '' }) });
  const tones = await Promise.all(Array.from({ length: 50 }, () => bg.detectImageBrightness('same-background')));
  assert.equal(count, 1); assert.ok(tones.every(value => value === 'dark'));
  await bg.detectImageBrightness('failed-image'); await bg.detectImageBrightness('failed-image');
  assert.equal(count, 3); // failures may retry; they are never permanently cached
  for (let i = 0; i < 17; i++) await bg.detectImageBrightness('other-' + i);
  const before = count; await bg.detectImageBrightness('same-background'); assert.equal(count, before + 1);
  const shell = { querySelectorAll: () => { queries++; return [node]; }, style: { setProperty() {} } };
  await bg.updateStatusBarTone(shell, 'chat'); assert.equal(queries, 1); // stop searching once the first visible background resolves
  let selfHosted = true, cloudConfig = null;
  const api = load('app/api/online/config/route.ts', { require: name => ({
    'next/server': next,
    '@/lib/self-hosting': { isSelfHostedModeEnabled: () => selfHosted },
    '@/lib/server/supabase-rest': { getSupabaseServerConfig: () => cloudConfig },
  })[name] });
  let response = await api.GET(); let body = await response.json();
  assert.equal(body.shellPushSupported, false); assert.equal(body.configured, false);
  selfHosted = false; body = await (await api.GET()).json(); assert.equal(body.shellPushSupported, true);
  const previousKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_ANON_KEY = 'public-test-anon'; cloudConfig = { url: 'https://example.invalid' };
  body = await (await api.GET()).json(); assert.equal(body.configured, true); assert.equal(body.shellPushSupported, true);
  selfHosted = true; body = await (await api.GET()).json(); assert.equal(body.configured, true); assert.equal(body.shellPushSupported, false);
  if (previousKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousKey;
  console.log('PASS: 50 concurrent background checks share one decode; bounded cache retries errors and evicts; DOM search stops early; local/cloud push capabilities remain separate');
})().catch(error => { console.error(error); process.exitCode = 1; });
