const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-settings-test-'));
process.env.DATA_FILE = path.join(temp, 'db.json');
delete process.env.DATABASE_URL;

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.resolve(__dirname, '..', request.slice(2)) : request, parent, ...args);
};

const db = require('../lib/db.ts');
const llm = require('../lib/llm.ts');
const settingsRoute = require('../app/api/llm-settings/route.ts');
const testRoute = require('../app/api/test-llm/route.ts');
const { NextRequest } = require('next/server');
const originalFetch = global.fetch;
const custom = { provider: 'custom', baseUrl: 'https://coarena.ai/api/v1', model: 'gpt-6-luna', apiKey: 'coa_regression_test_only_1234' };
const envNames = ['VERCEL', 'LLM_API_KEY', 'LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_MODEL', 'GROQ_API_KEY'];
const setCustomEnv = () => {
  process.env.VERCEL = '1';
  process.env.LLM_API_KEY = custom.apiKey;
  process.env.LLM_PROVIDER = custom.provider;
  process.env.LLM_BASE_URL = `${custom.baseUrl}/`;
  process.env.LLM_MODEL = custom.model;
};

test.beforeEach(() => {
  for (const name of envNames) delete process.env[name];
  fs.rmSync(process.env.DATA_FILE, { force: true });
  global.fetch = originalFetch;
});
test.after(() => { global.fetch = originalFetch; fs.rmSync(temp, { recursive: true, force: true }); });

test('local settings keep a saved key when the password field is blank', async () => {
  const saved = await llm.saveSettings(custom);
  assert.equal(saved.canSave, true);
  assert.equal(saved.hasKey, true);
  assert.equal(saved.statusLabel, 'AI: Custom (OpenAI-compatible) Configured');
  await llm.saveSettings({ ...custom, model: 'updated-model', apiKey: ' ' });
  const actual = await llm.getEffectiveSettings();
  assert.equal(actual.apiKey, custom.apiKey);
  assert.equal(actual.model, 'updated-model');
});

test('legacy Groq environment configuration retains its provider defaults', async () => {
  process.env.GROQ_API_KEY = 'gsk_regression_test_only_5678';
  const actual = await llm.getEffectiveSettings();
  assert.equal(actual.provider, 'groq');
  assert.equal(actual.baseUrl, llm.PROVIDER_PRESETS.groq.baseUrl);
  assert.equal(actual.model, llm.PROVIDER_PRESETS.groq.model);
  assert.equal(actual.source, 'env');
  assert.equal((await llm.getPublicSettings()).keyEnvVar, 'GROQ_API_KEY');
});

test('custom Vercel configuration survives temporary-file loss and overrides stale instance settings', async () => {
  await db.saveRawLlmSettings({ ...custom, provider: 'xai', apiKey: 'stale-instance-key' });
  setCustomEnv();
  process.env.GROQ_API_KEY = 'gsk_legacy_key';
  assert.deepEqual(await llm.getEffectiveSettings(), { ...custom, source: 'env', keyEnvVar: 'LLM_API_KEY' });
  fs.rmSync(process.env.DATA_FILE);
  assert.deepEqual(await llm.getEffectiveSettings(), { ...custom, source: 'env', keyEnvVar: 'LLM_API_KEY' });
  assert.equal(fs.existsSync(process.env.DATA_FILE), false);
  const publicConfig = await llm.getPublicSettings();
  assert.equal(publicConfig.canSave, false);
  assert.equal(publicConfig.hasKey, true);
  assert.equal(JSON.stringify(publicConfig).includes(custom.apiKey), false);
});

test('Vercel refuses a temporary save and gives actionable environment instructions', async () => {
  process.env.VERCEL = '1';
  const response = await settingsRoute.PUT(new NextRequest('http://localhost/api/llm-settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(custom),
  }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /LLM_API_KEY/);
  await assert.rejects(llm.saveSettings(custom), /Vercel cannot permanently save/);
  assert.equal(fs.existsSync(process.env.DATA_FILE), false);
});

test('Vercel without a key reports missing deployment configuration instead of asking for Groq', async () => {
  process.env.VERCEL = '1';
  const result = await llm.testConnection();
  assert.equal(result.ok, false);
  assert.match(result.message, /Vercel/);
  assert.match(result.message, /LLM_API_KEY/);
  assert.doesNotMatch(result.message, /Add your Groq/);
  assert.equal(fs.existsSync(process.env.DATA_FILE), false);
});

test('connection route uses the custom environment endpoint and returns only masked settings', async () => {
  setCustomEnv();
  let called = false;
  global.fetch = async (url, options) => {
    called = true;
    assert.equal(url, `${custom.baseUrl}/chat/completions`);
    assert.equal(options.headers.Authorization, `Bearer ${custom.apiKey}`);
    assert.equal(JSON.parse(options.body).model, custom.model);
    return Response.json({ choices: [{ message: { content: 'OK' } }] });
  };
  const response = await testRoute.POST();
  const payload = await response.json();
  assert.equal(called, true);
  assert.equal(payload.ok, true);
  assert.match(payload.message, /gpt-6-luna/);
  assert.equal(payload.settings.provider, 'custom');
  assert.equal(payload.settings.keyEnvVar, 'LLM_API_KEY');
  assert.equal(JSON.stringify(payload).includes(custom.apiKey), false);
});

test('preset environment providers use their own defaults and local saved keys take precedence', async () => {
  process.env.LLM_API_KEY = custom.apiKey;
  process.env.LLM_PROVIDER = 'xai';
  const env = await llm.getEffectiveSettings();
  assert.equal(env.baseUrl, llm.PROVIDER_PRESETS.xai.baseUrl);
  assert.equal(env.model, llm.PROVIDER_PRESETS.xai.model);
  await llm.saveSettings({ ...custom, apiKey: 'local-key' });
  assert.equal((await llm.getEffectiveSettings()).apiKey, 'local-key');
});

test('a blank local save preserves the environment key instead of losing it', async () => {
  process.env.LLM_API_KEY = custom.apiKey;
  await llm.saveSettings({ ...custom, apiKey: '' });
  assert.equal((await llm.getEffectiveSettings()).apiKey, custom.apiKey);
});

test('incomplete custom environment configuration fails before calling the provider', async () => {
  process.env.VERCEL = '1';
  process.env.LLM_API_KEY = custom.apiKey;
  global.fetch = async () => { assert.fail('must not call an incomplete endpoint'); };
  const result = await llm.testConnection();
  assert.equal(result.ok, false);
  assert.match(result.message, /LLM_BASE_URL and LLM_MODEL/);
});

test('Groq key prefix validation applies only to the official Groq endpoint', async () => {
  global.fetch = async () => Response.json({ choices: [{ message: { content: 'OK' } }] });
  const proxy = await llm.testConnection({ ...custom, provider: 'groq', source: 'env' });
  assert.equal(proxy.ok, true);
  const direct = await llm.testConnection({ ...custom, provider: 'groq', baseUrl: llm.PROVIDER_PRESETS.groq.baseUrl, source: 'env' });
  assert.equal(direct.ok, false);
  assert.match(direct.message, /gsk_/);
});
