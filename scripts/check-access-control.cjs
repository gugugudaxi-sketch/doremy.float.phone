// Run: node scripts/check-access-control.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto, randomBytes } = require('node:crypto');
const next = require('next/server');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = { 'next/server': next,
    '@/lib/access/session': () => load('lib/access/session.ts'),
    './lib/access/session': () => load('lib/access/session.ts'),
    './lib/self-hosting': { isSelfHostedModeEnabled: () => true },
    './lib/account-cookie-constants': { ACCOUNT_SESSION_COOKIE: 'old-session', ACCOUNT_GATE_COOKIE: 'old-gate' },
    './lib/account-gate-cookie': { verifyAccountGateCookieValue: async () => false },
  };
  vm.runInNewContext(code, { exports: module.exports, module, require: name => typeof imports[name] === 'function' ? imports[name]() : imports[name], process, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Date, URL, console }, { filename: file });
  cache.set(file, module.exports); return module.exports;
}
(async () => {
  process.env.FLOAT_ACCESS_KEY = randomBytes(24).toString('hex');
  process.env.FLOAT_SESSION_SECRET = randomBytes(32).toString('hex');
  const session = load('lib/access/session.ts');
  const token = await session.createAccessSession();
  assert.equal(await session.verifyAccessSession(token), true);
  assert.equal(await session.verifyAccessSession(token.slice(0,-1) + (token.endsWith('0') ? '1' : '0')), false);
  assert.equal(await session.verifyAccessSession(token, Date.now() + session.SESSION_SECONDS * 1000 + 1000), false);
  const oldKey = process.env.FLOAT_ACCESS_KEY;
  process.env.FLOAT_ACCESS_KEY = 'rotated-test-key';
  assert.equal(await session.verifyAccessSession(token), false);
  process.env.FLOAT_ACCESS_KEY = oldKey;
  const oldSecret = process.env.FLOAT_SESSION_SECRET;
  delete process.env.FLOAT_SESSION_SECRET;
  assert.equal(await session.verifyAccessSession(token), false);
  process.env.FLOAT_SESSION_SECRET = oldSecret;
  const { middleware } = load('middleware.ts');
  for (const path of ['/', '/verify', '/api/auth/me', '/api/push/bridge-wake', '/api/test.json', '/api/test.js', '/api/verify/test', '/api/access/session/extra']) {
    const r = await middleware(new next.NextRequest('https://test.invalid' + path));
    assert.equal(r.status, path.startsWith('/api/') ? 401 : 307, path);
  }
  const apiFiles = fs.readdirSync('app/api', { recursive: true }).filter(name => name.endsWith('/route.ts'));
  for (const file of apiFiles) {
    const path = '/api/' + file.replace(/\/route\.ts$/, '').replace(/\[.*?\]/g, 'test');
    if (path === '/api/access/session') continue;
    assert.equal((await middleware(new next.NextRequest('https://test.invalid' + path))).status, 401, path);
  }
  console.log(`PASS: unauthorized access rejected for ${apiFiles.length - 1} API route patterns`);
  assert.equal((await middleware(new next.NextRequest('https://test.invalid/', { headers: { Cookie: `${session.ACCESS_COOKIE}=${token}` } }))).status, 200);
  const api = load('app/api/access/session/route.ts');
  const request = (key, ip = 'test', origin = 'https://test.invalid') => new next.NextRequest('https://test.invalid/api/access/session', { method: 'POST', headers: { origin, 'x-nf-client-connection-ip': ip }, body: JSON.stringify({ key }) });
  assert.equal((await api.POST(request(oldKey, 'cross-origin', 'https://other.invalid'))).status, 403);
  const login = await api.POST(request(oldKey));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=strict', 'Path=/']) assert.ok(cookie.includes(flag), flag);
  assert.ok(!cookie.includes(oldKey));
  for (let i = 0; i < 5; i++) assert.equal((await api.POST(request('wrong', 'limited'))).status, 401);
  assert.equal((await api.POST(request(oldKey, 'limited'))).status, 429);
  assert.equal((await api.POST(new next.NextRequest('https://test.invalid/api/access/session', { method: 'POST', headers: { origin: 'https://test.invalid', 'x-nf-client-connection-ip': 'large' }, body: 'x'.repeat(5000) }))).status, 400);
  const logout = await api.DELETE(new next.NextRequest('https://test.invalid/api/access/session', { method: 'DELETE', headers: { origin: 'https://test.invalid' } }));
  assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
  console.log('PASS: signed/expired/tampered/rotated sessions, fail-closed config, self-hosted/API bypass protection, origin, cookie flags, rate limit, body bound and logout');
})().catch(error => { console.error(error); process.exitCode = 1; });
