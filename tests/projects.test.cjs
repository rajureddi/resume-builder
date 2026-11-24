const nodeTest = require('node:test');
const test = (name, callback) => nodeTest(name, () => runWithStudioData(undefined, callback));
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...args) { return resolve.call(this, request.startsWith('@/') ? path.resolve(__dirname, '..', request.slice(2)) : request, parent, ...args); };

const { PROJECT_TEMPLATES, draftFromTemplate } = require('../lib/projectTemplates.ts');
const { parseProjectBlocks, canonicalProject, projectForVariant, roleProjectBullets, projectRewriteBullets, validRewrittenBullets } = require('../lib/projectContent.ts');
const { buildSkillSuggestions } = require('../lib/buildSkills.ts');
const { createStudioData, getStudioData, runWithStudioData } = require('../lib/requestDb.ts');
const { seedProfile, seedProjects } = require('../lib/seed.ts');
const { tailorRules } = require('../lib/tailor.ts');
const { validExperience } = require('../lib/profileValidation.ts');
const { validProjectFields } = require('../lib/projectValidation.ts');
const { buildPdfBuffer, buildDocxBuffer } = require('../lib/resumeFiles.ts');
const { extractText } = require('unpdf');
const { NextRequest } = require('next/server');
const mammoth = require('mammoth');
const db = require('../lib/db.ts');
const request = (url, body, method = 'PUT') => new NextRequest(`http://localhost${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const exp = { id: 'internship-one', title: 'Software Engineering Intern', company: 'Example Company', location: 'Remote', startDate: '2025-05', endDate: '2025-08', current: false, type: 'Internship', skills: ['React', 'TypeScript'], bullets: ['Built React interfaces for an internal support tool.', 'Implemented typed API integration and component tests.'] };

test('catalog offers starter and real-world projects across the requested domains', () => {
  assert.ok(PROJECT_TEMPLATES.length >= 26);
  for (const domain of ['Flutter', 'AI/ML', 'RAG', 'Full-Stack', 'React', 'Database', 'Data', 'Cloud', 'Testing']) assert.ok(PROJECT_TEMPLATES.some(project => project.domains.includes(domain)), domain);
  for (const template of PROJECT_TEMPLATES) {
    assert.ok(['Starter', 'Real-world'].includes(template.level));
    assert.ok(validProjectFields(draftFromTemplate(template)));
    assert.ok(template.bullets.length >= 2 && template.bullets.length <= 3);
    assert.ok(template.recommendedSkills.length);
  }
});

test('imported descriptions and action sentences never become project names', () => {
  const vision = seedProjects.find(project => project.title.startsWith('VisionAid++'));
  const aura = seedProjects.find(project => project.title.startsWith('AuraOnDevice'));
  const parsed = parseProjectBlocks([vision.title, vision.tags.join(', '), 'Developed an Android assistive app with offline navigation.', 'and readable voice feedback.', '• Developed an Android assistive app with offline navigation and readable voice feedback.', `GitHub: ${vision.github}`, aura.title, aura.tags.join(', '), 'Engineered an on-device inference pipeline for local models.', '• Built an offline multimodal app for chat and retrieval.', `GitHub: ${aura.github}`], seedProjects);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map(project => project.title), [vision.title, aura.title]);
  assert.ok(parsed[0].bullets[0].includes('readable voice feedback'));
  assert.equal(parsed[0].bullets.length, 1);
  assert.equal(parsed[1].github, aura.github);
  assert.ok(parsed[1].bullets.some(bullet => bullet.startsWith('Engineered')));
});

test('canonical project identity repairs a wrong GitHub link without changing the intended project', () => {
  const pay = seedProjects.find(project => project.title.startsWith('TurantPay'));
  const aura = seedProjects.find(project => project.title.startsWith('AuraOnDevice'));
  const parsed = parseProjectBlocks([pay.title, 'Android, USSD, Payments', '• Developed an offline payment workflow.', `GitHub: ${aura.github}`], seedProjects);
  const fixed = canonicalProject(parsed[0], seedProjects);
  assert.equal(fixed.title, pay.title);
  assert.equal(fixed.github, pay.github);
  assert.ok(fixed.tech.includes('USSD'));
});

test('the first project point stays an overview while later points adapt to the role', () => {
  const project = { id: 'booking', title: 'Booking Portal', year: '', description: 'Built a booking portal for reserving available appointments.', tags: ['React', 'TypeScript', 'FastAPI', 'PostgreSQL'], domains: ['Full-Stack'], github: '', bullets: ['Built a booking portal for reserving available appointments.', 'Developed React screens and TypeScript form validation.', 'Implemented FastAPI booking endpoints and request validation.', 'Optimized PostgreSQL queries and transaction-safe reservations.'] };
  const frontend = roleProjectBullets(project, 'Frontend Developer', ['React', 'TypeScript']);
  const backend = roleProjectBullets(project, 'Backend Developer', ['FastAPI', 'PostgreSQL']);
  assert.equal(frontend[0], backend[0]);
  assert.ok(frontend[1].includes('React'));
  assert.ok(backend[1].includes('FastAPI'));
  assert.ok(backend[2].includes('PostgreSQL'));
  assert.equal(frontend.length, 3);
});

test('selected stack versions change the stack and bullets without mixing implementations', () => {
  const template = PROJECT_TEMPLATES.find(project => project.id === 'fullstack-tracker');
  const project = { ...draftFromTemplate(template), id: 'tracker' };
  const flutter = projectForVariant(project, 'flutter');
  assert.ok(flutter.tags.includes('Flutter'));
  assert.ok(!flutter.tags.includes('React'));
  const payload = tailorRules({ company: 'Example', role: 'Flutter Developer', jdText: 'Build Flutter mobile applications using Dart and Supabase.', profile: seedProfile, projects: [project], selectedProjectIds: ['tracker'], projectVariants: { tracker: 'flutter' }, selectedSkills: ['Flutter', 'Dart', 'Supabase'] });
  assert.deepEqual(payload.skills, ['Flutter', 'Dart', 'Supabase']);
  assert.equal(payload.projects[0].variantId, 'flutter');
  assert.ok(payload.projects[0].tech.includes('Flutter'));
  assert.ok(!payload.projects[0].tech.includes('React'));
  assert.ok(payload.projects[0].bullets[0].includes('mobile job-application tracker'));
});

test('unsupported frameworks and invented metrics are rejected in project rewrites', () => {
  const project = { id: 'mobile', title: 'Mobile Tracker', year: '', description: 'Built an Android tracker for 42 users.', tags: ['Android', 'Kotlin'], domains: ['Android'], github: '', bullets: ['Built an Android tracker for 42 users.', 'Implemented Kotlin screens and local input validation.'] };
  assert.equal(validRewrittenBullets(project, ['Built an Android tracker for 500 users.', 'Implemented Kotlin screens and input validation.'], ['Kotlin']), false);
  assert.equal(validRewrittenBullets(project, ['Built an Android tracker for 42 users.', 'Implemented React interfaces and data integration.'], ['React']), false);
  assert.equal(validRewrittenBullets(project, project.bullets, ['Kotlin']), true);
});

test('keeping the project overview cannot remove its implementation point', () => {
  const project = { ...draftFromTemplate(PROJECT_TEMPLATES.find(project => project.id === 'flutter-campus')), id: 'campus' };
  const rewritten = projectRewriteBullets(project, ['Developed a coursework and reminder application.', project.bullets[0]], 'Flutter Developer', ['Flutter', 'SQLite']);
  assert.equal(rewritten[0], project.bullets[0]);
  assert.ok(rewritten.length >= 2);
  assert.ok(rewritten[1].includes('Flutter'));
});

test('adapting a template stack preserves the other implementations', () => {
  const template = PROJECT_TEMPLATES.find(project => project.id === 'fullstack-tracker');
  const draft = draftFromTemplate(template, 'flutter');
  assert.ok(draft.tags.includes('Flutter'));
  assert.ok(!draft.tags.includes('React'));
  assert.ok(projectForVariant(draft, 'original').tags.includes('Node.js'));
  assert.ok(projectForVariant(draft, 'python').tags.includes('FastAPI'));
  assert.ok(!projectForVariant(draft, 'python').tags.includes('Flutter'));
  assert.ok(template.tags.includes('React'));
  assert.ok(validProjectFields(draft));
});

test('build-time skill suggestions follow the chosen stack and selected experience', () => {
  const project = { ...draftFromTemplate(PROJECT_TEMPLATES.find(project => project.id === 'fullstack-tracker')), id: 'tracker' };
  const profile = { ...seedProfile, experience: [exp] };
  const suggestions = buildSkillSuggestions(profile, [project], { keywords: ['Flutter', 'Dart', 'TypeScript', 'GraphQL'], mustHave: ['Flutter'] }, ['tracker'], { tracker: 'flutter' }, [exp.id]);
  assert.ok(suggestions.find(item => item.skill === 'Flutter').recommended);
  assert.ok(suggestions.find(item => item.skill === 'TypeScript').source.includes('Example Company'));
  assert.equal(suggestions.find(item => item.skill === 'GraphQL').source, 'Job description');
  assert.equal(suggestions.find(item => item.skill === 'React').recommended, false);
});

test('experience is optional, selected explicitly, and included consistently in PDF and DOCX', async () => {
  const profile = { ...seedProfile, experience: [exp] };
  const generate = selectedExperienceIds => ({ ...tailorRules({ company: 'Example', role: 'Frontend Developer', jdText: 'Develop React interfaces using TypeScript and tested API integrations.', profile, projects: seedProjects, selectedProjectIds: [seedProjects[0].id], selectedExperienceIds }), id: 'example', status: 'Saved', createdAt: '2026-11-23T00:00:00Z' });
  const included = generate([exp.id]);
  assert.ok(included.text.includes('WORK EXPERIENCE'));
  assert.ok(included.text.includes('Example Company'));
  assert.ok(included.text.includes('May 2025 – Aug 2025'));
  const pdfText = (await extractText(new Uint8Array(await buildPdfBuffer(profile, included)), { mergePages: true })).text;
  const docxText = (await mammoth.extractRawText({ buffer: await buildDocxBuffer(profile, included) })).value;
  assert.ok(pdfText.includes('Example Company'));
  assert.ok(docxText.includes('Example Company'));
  const excluded = generate([]);
  assert.equal(excluded.experience.length, 0);
  assert.ok(!excluded.text.includes('WORK EXPERIENCE'));
});

test('experience validation rejects incomplete dates and duplicate identities', () => {
  assert.equal(validExperience([exp]), true);
  assert.equal(validExperience([{ ...exp, endDate: '2025-01' }]), false);
  assert.equal(validExperience([{ ...exp, startDate: '2025-13' }]), false);
  assert.equal(validExperience([exp, exp]), false);
  assert.equal(validExperience([{ ...exp, current: true, endDate: '' }]), true);
});

test('saving profile skills and experience preserves the other profile fields', async () => {
  const experienceRoute = require('../app/api/experience/route.ts');
  const skillsRoute = require('../app/api/skills/route.ts');
  const first = await experienceRoute.PUT(request('/api/experience', { experience: [exp] }));
  assert.equal(first.status, 200);
  const second = await skillsRoute.PUT(request('/api/skills', { skillGroups: [{ label: 'Languages', items: ['Python', 'Dart'] }] }));
  assert.equal(second.status, 200);
  const profile = await db.getProfile();
  assert.equal(profile.name, seedProfile.name);
  assert.equal(profile.experience[0].company, exp.company);
  assert.deepEqual(profile.skillGroups[0].items, ['Python', 'Dart']);
  assert.equal((await experienceRoute.PUT(request('/api/experience', { experience: [{ ...exp, title: '' }] }))).status, 400);
});

test('project template versions survive saving to the project library', async () => {
  const route = require('../app/api/projects/route.ts');
  const draft = draftFromTemplate(PROJECT_TEMPLATES.find(project => project.id === 'fullstack-tracker'));
  const response = await route.POST(request('/api/projects', draft, 'POST'));
  assert.equal(response.status, 200);
  const saved = (await response.json()).project;
  assert.ok(saved.id);
  assert.ok(saved.stackVariants.some(variant => variant.id === 'flutter'));
  assert.equal(saved.templateId, 'fullstack-tracker');
});

test('generation respects selected skills, project versions and experience while rejecting unavailable versions', async () => {
  const route = require('../app/api/tailor-resume/route.ts');
  await db.saveExperience([exp]);
  const project = await db.createProject(draftFromTemplate(PROJECT_TEMPLATES.find(project => project.id === 'fullstack-tracker')));
  const body = { company: 'Example', role: 'Flutter Developer', jdText: 'Build Flutter applications with Dart and Supabase storage.', selectedProjectIds: [project.id], projectVariants: { [project.id]: 'flutter' }, selectedSkills: ['Flutter', 'Dart'], selectedExperienceIds: [exp.id] };
  const response = await route.POST(request('/api/tailor-resume', body, 'POST'));
  assert.equal(response.status, 200);
  const app = (await response.json()).application;
  assert.deepEqual(app.skills, ['Flutter', 'Dart']);
  assert.equal(app.projects[0].variantId, 'flutter');
  assert.equal(app.experience[0].id, exp.id);
  assert.equal((await route.POST(request('/api/tailor-resume', { ...body, projectVariants: { [project.id]: 'missing' } }, 'POST'))).status, 400);
});

test('concurrent browser snapshots keep profiles and deleted project lists isolated', async () => {
  const left = createStudioData();
  const right = createStudioData();
  left.profile.name = 'Left Browser';
  left.projects = [];
  right.profile.name = 'Right Browser';
  const results = await Promise.all([left, right].map(snapshot => runWithStudioData(snapshot, async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    const profile = await db.getProfile();
    const updated = { ...profile, summary: `${profile.name} request summary` };
    await db.saveProfile(updated);
    return { name: (await db.getProfile()).name, summary: (await db.getProfile()).summary, projects: (await db.listProjects()).length };
  })));
  assert.deepEqual(results[0], { name: 'Left Browser', summary: 'Left Browser request summary', projects: 0 });
  assert.deepEqual(results[1], { name: 'Right Browser', summary: 'Right Browser request summary', projects: seedProjects.length });
  assert.equal(left.profile.summary, seedProfile.summary);
  assert.equal(right.profile.summary, seedProfile.summary);
  assert.equal((await db.getProfile()).name, seedProfile.name);
});

test('server mutation returns a result without saving it in another request context', async () => {
  const route = require('../app/api/projects/route.ts');
  const studioData = createStudioData();
  studioData.projects = [];
  const draft = draftFromTemplate(PROJECT_TEMPLATES.find(project => project.id === 'fullstack-tracker'));
  const response = await route.POST(request('/api/projects', { ...draft, studioData }, 'POST'));
  assert.equal(response.status, 200);
  const created = (await response.json()).project;
  assert.ok(created.id);
  assert.deepEqual(studioData.projects, []);
  assert.equal(getStudioData().projects.some(project => project.id === created.id), false);
  assert.equal(await runWithStudioData(undefined, async () => (await db.listProjects()).some(project => project.id === created.id)), false);
});
