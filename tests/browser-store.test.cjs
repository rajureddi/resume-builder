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
Module._resolveFilename = function(request, parent, ...args) { return resolve.call(this, request.startsWith('@/') ? path.resolve(__dirname, '..', request.slice(2)) : request, parent, ...args); };

const entries = new Map();
const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
global.window = { localStorage: storage };
const originalFetch = global.fetch;
const db = require('../lib/browserDb.ts');
const { api } = require('../lib/apiClient.ts');
const { studioSnapshotForRequest } = require('../lib/localApi.ts');
const { saveLocalLlmSettings, LOCAL_LLM_SETTINGS_KEY } = require('../lib/localLlmSettings.ts');
const { tailorRules } = require('../lib/tailor.ts');
const { checkAtsEngine } = require('../lib/ats.ts');
const { seedProfile, seedProjects } = require('../lib/seed.ts');
const custom = { provider: 'custom', baseUrl: 'https://provider.example/v1', model: 'test-model', apiKey: 'device-test-key-only-1234' };
const makeApp = (id = 'local-app') => ({ ...tailorRules({ company: 'Browser Test', role: 'Frontend Developer', jdText: 'Build responsive React interfaces with JavaScript and TypeScript.', profile: seedProfile, projects: seedProjects }), id, createdAt: '2026-11-24T01:00:00Z', status: 'Saved' });
const makeCheck = (id = 'local-check', applicationId = 'local-app') => ({ ...checkAtsEngine({ resumeText: makeApp().text, jdText: makeApp().jdText, sourceType: 'saved' }), id, applicationId, createdAt: '2026-11-24T01:00:00Z', resumeName: 'Browser Test — Frontend Developer', sourceType: 'saved', resumeText: makeApp().text, jdText: makeApp().jdText, aiNotes: null });

test.beforeEach(() => { entries.clear(); global.window.localStorage = storage; global.fetch = async () => { throw new Error('Unexpected server request'); }; });
test.after(() => { global.fetch = originalFetch; delete global.window; });

test('bootstrap seeds this browser once and saved data survives a module reload', async () => {
  const boot = await api('/api/bootstrap');
  assert.equal(boot.profile.name, seedProfile.name);
  assert.ok(boot.projects.length);
  assert.ok(entries.has(db.BROWSER_STUDIO_KEY));
  await api('/api/profile', { method: 'PUT', json: { ...boot.profile, name: 'Device Profile', email: 'device@example.com' } });
  delete require.cache[require.resolve('../lib/browserDb.ts')];
  const reloaded = require('../lib/browserDb.ts');
  assert.equal(reloaded.getBrowserSnapshot().profile.name, 'Device Profile');
  assert.equal((await api('/api/bootstrap')).profile.email, 'device@example.com');
});

test('project create/edit/delete never calls the server and an empty library stays empty', async () => {
  const initial = await api('/api/projects');
  for (const project of initial.projects) await api(`/api/projects/${project.id}`, { method: 'DELETE' });
  assert.deepEqual((await api('/api/bootstrap')).projects, []);
  const created = await api('/api/projects', { method: 'POST', json: { title: 'Device-only project', tags: ['React'], domains: ['Frontend'], bullets: ['Built a browser tool.'] } });
  assert.ok(created.project.id.startsWith('proj_'));
  const updated = await api(`/api/projects/${created.project.id}`, { method: 'PUT', json: { title: 'Updated device project', id: 'attempted-replacement' } });
  assert.equal(updated.project.id, created.project.id);
  assert.equal((await api(`/api/projects/${created.project.id}`)).project.title, 'Updated device project');
  await api(`/api/projects/${created.project.id}`, { method: 'DELETE' });
  assert.deepEqual(db.getBrowserSnapshot().projects, []);
  assert.deepEqual(JSON.parse(entries.get(db.BROWSER_STUDIO_KEY)).projects, []);
});

test('skills and experience save locally while keeping the rest of the profile', async () => {
  const groups = [{ label: 'Languages', items: [' Python ', 'Python', 'TypeScript'] }];
  await api('/api/skills', { method: 'PUT', json: { skillGroups: groups } });
  const experience = [{ id: 'intern-one', title: 'Software Intern', company: 'Device Company', location: 'Remote', startDate: '2025-05', endDate: '2025-08', current: false, type: 'Internship', bullets: ['Built React screens.'], skills: ['React'] }];
  await api('/api/experience', { method: 'PUT', json: { experience } });
  assert.deepEqual((await api('/api/skills')).skillGroups, [{ label: 'Languages', items: ['Python', 'TypeScript'] }]);
  assert.deepEqual((await api('/api/experience')).experience, experience);
  assert.equal(db.getBrowserSnapshot().profile.email, seedProfile.email);
  assert.deepEqual(db.getBrowserSnapshot().profile.education, seedProfile.education);
});

test('manual ideas are deduplicated and conversion atomically adds a project and removes the idea', async () => {
  const added = await api('/api/project-ideas', { method: 'POST', json: { title: 'Local GraphQL Service', description: 'Build a typed GraphQL API.', keywords: ['GraphQL'], domain: 'Backend' } });
  await assert.rejects(api('/api/project-ideas', { method: 'POST', json: { title: 'Local GraphQL Service' } }), /already exists/);
  const result = await api(`/api/project-ideas/${added.idea.id}/convert`, { method: 'POST', json: {} });
  assert.equal(result.project.title, added.idea.title);
  assert.deepEqual(result.project.tags, ['GraphQL']);
  assert.deepEqual((await api('/api/project-ideas')).ideas, []);
  assert.ok((await api('/api/projects')).projects.some(project => project.id === result.project.id));
});

test('generated resumes are saved in the browser and edits preserve original profile details', async () => {
  const application = makeApp();
  global.fetch = async (url, options) => {
    assert.equal(url, '/api/tailor-resume');
    const body = JSON.parse(options.body);
    assert.equal(body.studioData.profile.name, seedProfile.name);
    return Response.json({ ok: true, application });
  };
  await api('/api/tailor-resume', { method: 'POST', json: { company: application.company, role: application.role, jdText: application.jdText } });
  global.fetch = async () => { throw new Error('CRUD must not call the server'); };
  const boot = await api('/api/bootstrap');
  await api('/api/profile', { method: 'PUT', json: { ...boot.profile, name: 'Changed Current Profile', email: 'changed@example.com' } });
  const edited = await api(`/api/applications/${application.id}`, { method: 'PATCH', json: { summary: 'Saved locally with React skills and reliable frontend workflows.', skills: ['React', 'TypeScript'], resumeTemplate: 'modern', showContactIcons: false } });
  assert.equal(edited.application.profileSnapshot.name, seedProfile.name);
  assert.ok(edited.application.text.toUpperCase().includes(seedProfile.name.toUpperCase()));
  assert.ok(edited.application.text.includes('Saved locally with React'));
  assert.equal(edited.application.resumeTemplate, 'modern');
  assert.equal((await api('/api/applications')).applications.length, 1);
  assert.equal((await api(`/api/applications/${application.id}`)).application.showContactIcons, false);
  await api(`/api/applications/${application.id}`, { method: 'PATCH', json: { status: 'Applied' } });
  assert.equal((await api(`/api/applications/${application.id}`)).application.status, 'Applied');
  await api(`/api/applications/${application.id}`, { method: 'DELETE' });
  assert.deepEqual((await api('/api/applications')).applications, []);
});

test('ATS checks, AI notes and Auto-Fix output are saved locally', async () => {
  const check = makeCheck();
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url === '/api/check-ats') return Response.json({ ok: true, check });
    if (url === '/api/ats-ai-notes') { assert.equal(body.studioData.atsChecks[0].id, check.id); return Response.json({ ok: true, aiReview: 'Device-specific review.' }); }
    if (url === '/api/auto-fix-ats') return Response.json({ ok: true, application: makeApp('fixed-app'), check: makeCheck('fixed-check', 'fixed-app') });
    throw new Error(`Unexpected request ${url}`);
  };
  await api('/api/check-ats', { method: 'POST', json: { resumeText: check.resumeText, jdText: check.jdText } });
  const history = await api('/api/ats-checks');
  assert.equal(history.checks.length, 1);
  assert.equal(history.checks[0].resumeText, undefined);
  assert.equal(history.checks[0].hasJd, true);
  await api('/api/ats-ai-notes', { method: 'POST', json: { checkId: check.id, resumeText: check.resumeText } });
  assert.equal((await api(`/api/ats-checks/${check.id}`)).check.aiNotes, 'Device-specific review.');
  await api('/api/auto-fix-ats', { method: 'POST', json: { checkId: check.id } });
  assert.equal(db.getBrowserSnapshot().applications[0].id, 'fixed-app');
  assert.equal(db.getBrowserSnapshot().atsChecks.length, 2);
  await api(`/api/ats-checks/${check.id}`, { method: 'DELETE' });
  assert.equal(db.getBrowserSnapshot().atsChecks.length, 1);
});

test('snapshots include only necessary history and never contain the separately saved API key', async () => {
  saveLocalLlmSettings(custom);
  db.updateBrowserStudioData(data => { data.applications = [makeApp('first'), makeApp('second')]; data.atsChecks = [makeCheck('check-first', 'first'), makeCheck('check-second', 'second')]; });
  const analysis = studioSnapshotForRequest('/api/analyze-job', {});
  assert.deepEqual(analysis.applications, []);
  assert.deepEqual(analysis.atsChecks, []);
  const layout = studioSnapshotForRequest('/api/applications/second/layout', {});
  assert.deepEqual(layout.applications.map(item => item.id), ['second']);
  assert.deepEqual(layout.projects, []);
  const fix = studioSnapshotForRequest('/api/auto-fix-ats', { checkId: 'check-first' });
  assert.deepEqual(fix.applications.map(item => item.id), ['first']);
  assert.deepEqual(fix.atsChecks.map(item => item.id), ['check-first']);
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.llmSettings.apiKey, custom.apiKey);
    assert.equal(JSON.stringify(body.studioData).includes(custom.apiKey), false);
    return Response.json({ ok: true, analysis: {}, ideasAdded: [] });
  };
  await api('/api/analyze-job', { method: 'POST', json: { jdText: 'Build local browser software with GraphQL and React.' } });
  assert.equal(entries.get(db.BROWSER_STUDIO_KEY).includes(custom.apiKey), false);
  assert.ok(entries.get(LOCAL_LLM_SETTINGS_KEY).includes(custom.apiKey));
});

test('a delayed computation result preserves unrelated changes made while it was running', async () => {
  let finish;
  global.fetch = async () => new Promise(resolveResponse => { finish = resolveResponse; });
  const pending = api('/api/tailor-resume', { method: 'POST', json: { company: 'Browser Test', role: 'Frontend Developer', jdText: 'Build React interfaces with typed JavaScript workflows.' } });
  const project = await api('/api/projects', { method: 'POST', json: { title: 'Added while AI runs', tags: [], domains: [], bullets: [] } });
  finish(Response.json({ ok: true, application: makeApp() }));
  await pending;
  assert.ok(db.getBrowserSnapshot().projects.some(item => item.id === project.project.id));
  assert.equal(db.getBrowserSnapshot().applications.length, 1);
});

test('storage failures reject saves without reporting success or losing existing data', async () => {
  db.getBrowserSnapshot();
  const before = entries.get(db.BROWSER_STUDIO_KEY);
  global.window.localStorage = { ...storage, setItem: () => { throw new Error('QuotaExceededError'); } };
  await assert.rejects(api('/api/projects', { method: 'POST', json: { title: 'Cannot save' } }), /could not save/);
  assert.equal(entries.get(db.BROWSER_STUDIO_KEY), before);
  global.window.localStorage = { ...storage, getItem: () => { throw new Error('SecurityError'); } };
  await assert.rejects(api('/api/bootstrap'), /could not read/);
});

test('backup export/import preserves all local records and excludes API credentials', async () => {
  saveLocalLlmSettings(custom);
  db.updateBrowserStudioData(data => { data.applications = [makeApp()]; data.atsChecks = [makeCheck()]; data.projects = []; });
  const raw = db.exportBrowserBackup();
  assert.equal(raw.includes(custom.apiKey), false);
  entries.delete(db.BROWSER_STUDIO_KEY);
  db.importBrowserBackup(raw);
  assert.deepEqual(db.getBrowserSnapshot().projects, []);
  assert.equal(db.getBrowserSnapshot().applications.length, 1);
  assert.equal(db.getBrowserSnapshot().atsChecks.length, 1);
  assert.throws(() => db.importBrowserBackup(JSON.stringify({ version: 1, ...db.createBrowserStudioData(), projects: ['invalid project'] })), /supported/);
  assert.equal(db.getBrowserSnapshot().applications.length, 1);
});

test('corrupt saved data is preserved and surfaces a clear error instead of silently reseeding', async () => {
  entries.set(db.BROWSER_STUDIO_KEY, '{corrupt-json');
  await assert.rejects(api('/api/bootstrap'), /could not be read/);
  assert.equal(entries.get(db.BROWSER_STUDIO_KEY), '{corrupt-json');
});
