const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.resolve(__dirname, '..', request.slice(2)) : request, parent, ...args);
};

const llm = require('../lib/llm.ts');
const { normalizeLlmSettings, publicSettings } = require('../lib/llmSettings.ts');
const local = require('../lib/localLlmSettings.ts');
const settingsRoute = require('../app/api/llm-settings/route.ts');
const testRoute = require('../app/api/test-llm/route.ts');
const { NextRequest } = require('next/server');
const originalFetch = global.fetch;
const originalWindow = global.window;
const custom = { provider: 'custom', baseUrl: 'https://coarena.ai/api/v1', model: 'gpt-6-luna', apiKey: 'coa_regression_test_only_1234' };
const request = (route, body) => new NextRequest(`http://localhost${route}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const browserStorage = (entries = new Map()) => ({
  getItem: key => entries.get(key) ?? null,
  setItem: (key, value) => { entries.set(key, String(value)); },
  removeItem: key => { entries.delete(key); },
});

test.beforeEach(() => {
  global.window = { localStorage: browserStorage() };
  global.fetch = originalFetch;
});
test.after(() => { global.fetch = originalFetch; global.window = originalWindow; });

test('API settings survive a new browser runtime reading the same local storage', () => {
  const entries = new Map();
  global.window = { localStorage: browserStorage(entries) };
  local.saveLocalLlmSettings({ ...custom, baseUrl: ` ${custom.baseUrl}/ ` });
  global.window = { localStorage: browserStorage(entries) };
  assert.deepEqual(local.getLocalLlmSettings(), custom);
  assert.equal(local.getLocalPublicSettings().source, 'local');
  assert.match(local.getLocalPublicSettings().statusLabel, /on this device/);
  assert.equal(JSON.stringify(local.getLocalPublicSettings()).includes(custom.apiKey), false);
});

test('replacing an API key and model updates the next request snapshot and removal clears it', async () => {
  local.saveLocalLlmSettings(custom);
  const updated = { ...custom, apiKey: 'coa_replacement_test_only_5678', model: 'new-model' };
  local.saveLocalLlmSettings(updated);
  assert.deepEqual(await llm.getEffectiveSettings(local.getLocalLlmSettings()), { ...updated, source: 'local' });
  local.clearLocalLlmSettings();
  assert.equal(local.getLocalLlmSettings(), null);
  assert.equal(local.getLocalPublicSettings().hasKey, false);
  assert.equal((await llm.getEffectiveSettings(local.getLocalLlmSettings())).apiKey, '');
});

test('invalid or corrupt saved settings do not become usable credentials', () => {
  window.localStorage.setItem(local.LOCAL_LLM_SETTINGS_KEY, '{not-json');
  assert.equal(local.getLocalLlmSettings(), null);
  for (const change of [{ apiKey: '' }, { provider: '__proto__' }, { baseUrl: 'javascript:alert(1)' }, { baseUrl: 'https://user:password@example.com' }, { model: 42 }]) {
    assert.equal(normalizeLlmSettings({ ...custom, ...change }), null);
  }
  local.saveLocalLlmSettings(custom);
  assert.throws(() => local.saveLocalLlmSettings({ ...custom, apiKey: '' }), /API key/);
  assert.deepEqual(local.getLocalLlmSettings(), custom);
});

test('blocked browser storage reports a save or removal failure', () => {
  global.window = { localStorage: {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('blocked'); },
  } };
  assert.equal(local.getLocalLlmSettings(), null);
  assert.throws(() => local.saveLocalLlmSettings(custom), /could not save/);
  assert.throws(() => local.clearLocalLlmSettings(), /could not remove/);
});

test('server settings ignore environment credentials and require a request snapshot', async () => {
  const originalKey = process.env.LLM_API_KEY;
  const originalGroq = process.env.GROQ_API_KEY;
  process.env.LLM_API_KEY = custom.apiKey;
  process.env.GROQ_API_KEY = 'gsk_env_key_not_used';
  try {
    assert.equal((await llm.getEffectiveSettings()).apiKey, '');
    assert.equal((await llm.getPublicSettings()).hasKey, false);
    assert.equal((await settingsRoute.GET()).status, 200);
    const save = await settingsRoute.PUT();
    assert.equal(save.status, 405);
    assert.match((await save.json()).error, /Save on this device/);
  } finally {
    if (originalKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = originalKey;
    if (originalGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalGroq;
  }
});

test('connection route forwards the browser key to its endpoint and masks the response', async () => {
  let called = false;
  global.fetch = async (url, options) => {
    called = true;
    assert.equal(url, `${custom.baseUrl}/chat/completions`);
    assert.equal(options.headers.Authorization, `Bearer ${custom.apiKey}`);
    assert.equal(JSON.parse(options.body).model, custom.model);
    return Response.json({ choices: [{ message: { content: 'OK' } }] });
  };
  const response = await testRoute.POST(request('/api/test-llm', { llmSettings: custom }));
  const payload = await response.json();
  assert.equal(called, true);
  assert.equal(payload.ok, true);
  assert.equal(payload.settings.source, 'local');
  assert.equal(JSON.stringify(payload).includes(custom.apiKey), false);
  assert.match(payload.message, /gpt-6-luna/);
});

test('two concurrent AI calls use their own keys and models', async () => {
  const other = { ...custom, apiKey: 'coa_other_browser_key_5678', model: 'other-model' };
  const sent = [];
  global.fetch = async (_url, options) => {
    sent.push({ key: options.headers.Authorization, model: JSON.parse(options.body).model });
    await new Promise(resolve => setTimeout(resolve, 5));
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };
  const results = await Promise.all([custom, other].map(async config => llm.llmJson({
    system: 'Reply in JSON', user: 'test', settings: await llm.getEffectiveSettings(config),
  })));
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.deepEqual(sent, [{ key: `Bearer ${custom.apiKey}`, model: custom.model }, { key: `Bearer ${other.apiKey}`, model: other.model }]);
  assert.equal((await llm.getEffectiveSettings()).apiKey, '');
});

test('provider errors redact a reflected API key', async () => {
  global.fetch = async () => new Response(`Error for key ${custom.apiKey}`, { status: 429 });
  const result = await llm.testConnection(await llm.getEffectiveSettings(custom));
  assert.equal(result.ok, false);
  assert.match(result.message, /\[redacted\]/);
  assert.equal(result.message.includes(custom.apiKey), false);
});

test('missing or malformed browser settings do not call a provider', async () => {
  global.fetch = async () => { assert.fail('must not call provider without valid settings'); };
  for (const config of [null, { ...custom, baseUrl: 'bad-url' }]) {
    const response = await testRoute.POST(request('/api/test-llm', { llmSettings: config }));
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.match(result.message, /Save on this device/);
  }
});

test('public masks do not expose even a short key in full', () => {
  assert.equal(publicSettings({ ...custom, apiKey: 'short' }).maskedKey, '••••••••');
});

test('Groq prefix validation applies only to the official Groq endpoint', async () => {
  global.fetch = async () => Response.json({ choices: [{ message: { content: 'OK' } }] });
  assert.equal((await llm.testConnection({ ...custom, provider: 'groq', source: 'local' })).ok, true);
  const direct = await llm.testConnection({ ...custom, provider: 'groq', baseUrl: llm.PROVIDER_PRESETS.groq.baseUrl, source: 'local' });
  assert.equal(direct.ok, false);
  assert.match(direct.message, /gsk_/);
});

test('job analysis, resume generation, AI notes and Auto-Fix forward the request settings', async () => {
  const { createStudioData } = require('../lib/requestDb.ts');
  const { seedProfile, seedProjects } = require('../lib/seed.ts');
  const { tailorRules } = require('../lib/tailor.ts');
  const jdText = 'Build responsive frontend interfaces with React, TypeScript and Next.js.';
  const base = { ...tailorRules({ company: 'Test Company', role: 'Frontend Developer', jdText, profile: seedProfile, projects: seedProjects }), id: 'local-resume', status: 'Saved', createdAt: '2026-11-24T00:00:00Z' };
  const cases = [
    ['/api/analyze-job', { jdText, company: 'Test Company', role: 'Frontend Developer' }, { domainPrimary: 'Full-Stack', keywords: ['React', 'TypeScript'] }],
    ['/api/tailor-resume', { jdText, company: 'Test Company', role: 'Frontend Developer', selectedProjectIds: [seedProjects[0].id] }, { summary: 'Software engineer building reliable React interfaces and TypeScript applications with tested API integration.' }],
    ['/api/ats-ai-notes', { resumeText: base.text, jdText, score: 80 }, 'Strengths: React project evidence. Weaknesses: limited work experience. Top fixes: clarify testing.'],
    ['/api/auto-fix-ats', { resumeText: base.text, jdText, applicationId: base.id }, { summary: 'Software engineer building reliable React interfaces and TypeScript applications with tested API integration.' }],
  ];
  for (const [endpoint, body, reply] of cases) {
    const config = { ...custom, apiKey: `${custom.apiKey}-${endpoint.split('/').at(-1)}` };
    let called = false;
    global.fetch = async (url, options) => {
      called = true;
      assert.equal(url, `${config.baseUrl}/chat/completions`);
      assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`);
      assert.equal(JSON.parse(options.body).model, config.model);
      return Response.json({ choices: [{ message: { content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }] });
    };
    const studioData = createStudioData();
    studioData.applications = [base];
    const response = await require(`../app${endpoint}/route.ts`).POST(request(endpoint, { ...body, studioData, llmSettings: config }));
    assert.equal(response.status, 200, endpoint);
    assert.equal(called, true, `${endpoint} must use the supplied browser settings`);
    const payload = await response.json();
    assert.equal(JSON.stringify(payload).includes(config.apiKey), false);
    assert.deepEqual(studioData.applications, [base]);
  }
});
