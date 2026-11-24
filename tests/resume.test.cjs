const nodeTest = require('node:test');
const test = (name, callback) => nodeTest(name, () => runWithStudioData(undefined, callback));
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

const { runWithStudioData } = require('../lib/requestDb.ts');
const { seedProfile, seedProjects } = require('../lib/seed.ts');
const { tailorRules, buildResumeText, trimSummary, extractKeywords, skillSupported } = require('../lib/tailor.ts');
const { buildPdfBuffer, buildDocxBuffer } = require('../lib/resumeFiles.ts');
const { buildResumeLayout } = require('../lib/resumeLayout.ts');
const { prepareAutoFix } = require('../lib/fix.ts');
const { PDFDocument } = require('pdf-lib');
const { extractText, getDocumentProxy } = require('unpdf');
const mammoth = require('mammoth');
const normalized = text => text.replace(/\s+/g, ' ').trim();
const makeApp = (role = 'Frontend Developer', jdText = 'Build responsive frontend interfaces with JavaScript, TypeScript, React and Next.js.') => ({
  ...tailorRules({ company: 'Regression Example', role, jdText, profile: seedProfile, projects: seedProjects }),
  id: 'test', status: 'Saved', createdAt: '2026-11-23T00:00:00Z',
});

test('summary segmentation preserves technology names, decimals and trailing sentences', () => {
  const text = 'Built Node.js and Next.js apps with 99.5% uptime. Used Python. Delivered accessible interfaces';
  assert.equal(trimSummary(text), text);
  assert.equal(trimSummary('Built Node. js apps. Used Next. js.'), 'Built Node.js apps. Used Next.js.');
  assert.ok(trimSummary(Array(100).fill('word').join(' ')).split(/\s+/).length <= 75);
  assert.ok(!makeApp().summary.includes('applying for'));
  assert.ok(!makeApp().summary.includes('production-grade'));
});

test('JavaScript is distinct from Java and related tools do not imply equivalent experience', () => {
  assert.deepEqual(extractKeywords('JavaScript and GitHub.'), ['JavaScript', 'GitHub']);
  assert.equal(skillSupported('TensorFlow', ['TensorFlow Lite']), false);
  assert.equal(skillSupported('React Native', ['React']), false);
  assert.equal(skillSupported('Node.js', ['NodeJS']), true);
});

for (const template of ['classic', 'modern', 'compact']) {
  test(`${template}: preview and PDF use the same pages and baseline positions`, async () => {
    const app = { ...makeApp(), resumeTemplate: template };
    const layout = await buildResumeLayout(seedProfile, app);
    const bytes = await buildPdfBuffer(seedProfile, app);
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    assert.equal(doc.numPages, layout.pages.length);
    assert.equal(layout.pages.length, 1);
    assert.ok(layout.bodySize >= 10);
    const content = await (await doc.getPage(1)).getTextContent();
    for (const name of [seedProfile.name.toUpperCase(), 'PROFESSIONAL SUMMARY', 'TECHNICAL SKILLS', 'CERTIFICATIONS']) {
      const planned = layout.pages[0].items.find(item => item.kind === 'text' && item.text === name);
      const actual = content.items.find(item => item.str === name);
      assert.ok(actual, `${name} was preserved in PDF`);
      assert.ok(Math.abs(actual.transform[4] - planned.x) < 0.01);
      assert.ok(Math.abs(actual.transform[5] - (layout.height - planned.y)) < 0.01);
    }
    for (const page of layout.pages) for (const item of page.items) if (item.kind === 'text') {
      assert.ok(item.x >= 0 && item.x + item.width <= layout.width + 0.01);
      assert.ok(item.y >= 0 && item.y <= layout.height);
    }
  });
}

test('the older mobile resume with 26 skills and all certifications fits one A4 page', async () => {
  const app = makeApp('Mobile Developer', 'Build Android apps with Kotlin and offline USSD payments.');
  app.skills = seedProfile.skillGroups.flatMap(group => group.items);
  app.summary = 'Mobile software engineer with experience delivering Android applications across accessibility, AI/ML, education, and payments. Built production-oriented products using Kotlin, Python, KivyMD, OpenCV, MNN, MediaPipe, TensorFlow Lite, and OCR, including offline and on-device experiences. Brings end-to-end product development experience, with strengths in mobile application development, privacy-conscious AI, accessibility, and designing reliable user experiences for low-connectivity environments.';
  const selected = ['VisionAid++', 'AuraOnDevice', 'TurantPay', 'Backlog Wallah'];
  app.projects = selected.map(title => seedProjects.find(project => project.title.startsWith(title))).map(project => ({ projectId: project.id, title: project.title, tech: project.tags.slice(0, 6).join(', '), bullets: project.bullets, github: project.github }));
  const pdf = await buildPdfBuffer(seedProfile, app);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
  const text = normalized((await extractText(new Uint8Array(pdf), { mergePages: true })).text);
  for (const certificate of seedProfile.certifications) assert.ok(text.includes(normalized(certificate)));
});

test('long project headers wrap and preserve the complete technology list', async () => {
  const app = makeApp();
  app.projects = [{ projectId: 'long', title: 'An Extended Project Title That Must Wrap Without Losing Any Resume Content or Technology Evidence', tech: 'TypeScript, React, Next.js, PostgreSQL, Docker, Kubernetes, UniqueTechMarker', bullets: ['Built a working application for 42 users.'], github: 'https://github.com/example/extended-project-name' }];
  const bytes = await buildPdfBuffer(seedProfile, app);
  const text = normalized((await extractText(new Uint8Array(bytes), { mergePages: true })).text);
  assert.ok(text.includes('UniqueTechMarker'));
  assert.ok(text.includes(normalized(app.projects[0].title)));
  assert.ok(text.includes('42 users'));
});

test('contact icons can be disabled while visible contact text and clickable PDF links remain', async () => {
  const app = makeApp();
  const withIcons = await buildResumeLayout(seedProfile, app);
  assert.equal(withIcons.pages.flatMap(page => page.items).filter(item => item.kind === 'icon').length, 5);
  const without = await buildResumeLayout(seedProfile, { ...app, showContactIcons: false });
  assert.equal(without.pages.flatMap(page => page.items).filter(item => item.kind === 'icon').length, 0);
  const text = without.pages.flatMap(page => page.items).filter(item => item.kind === 'text').map(item => item.text).join(' ');
  assert.ok(text.includes(seedProfile.email));
  assert.ok(text.includes(seedProfile.github));
  const pdf = await PDFDocument.load(await buildPdfBuffer(seedProfile, app));
  assert.equal(pdf.getPage(0).node.Annots().size(), 5);
});

test('education has bold degree names, a separate institution line and right-aligned dates and grades', async () => {
  const app = { ...makeApp(), resumeTemplate: 'classic' };
  const layout = await buildResumeLayout(seedProfile, app);
  const items = layout.pages.flatMap(page => page.items).filter(item => item.kind === 'text');
  const degree = items.find(item => item.text === seedProfile.education[0].title);
  const date = items.find(item => item.text === seedProfile.education[0].period);
  const institution = items.find(item => item.text === seedProfile.education[0].org);
  const grade = items.find(item => item.text === seedProfile.education[0].detail);
  assert.equal(degree.bold, true);
  assert.equal(date.y, degree.y);
  assert.ok(date.x > degree.x);
  assert.ok(institution.y > degree.y);
  assert.equal(grade.y, institution.y);
  assert.ok(grade.x > institution.x);
});

test('grouped skills render only selected skills and support compact columns without overflow', async () => {
  for (const skillLayout of ['stacked', 'columns']) {
    const app = { ...makeApp(), skills: ['Python', 'React', 'TypeScript'], skillGroups: [{ label: 'Languages', items: ['Python', 'TypeScript'] }, { label: 'Frameworks', items: ['React'] }], interests: ['Full-Stack Development'], skillLayout, showSectionRules: false };
    const layout = await buildResumeLayout(seedProfile, app);
    const items = layout.pages.flatMap(page => page.items);
    assert.equal(items.filter(item => item.kind === 'rule').length, 0);
    const start = items.findIndex(item => item.kind === 'text' && item.text === 'TECHNICAL SKILLS');
    const end = items.findIndex(item => item.kind === 'text' && item.text === 'PROJECTS');
    const skills = items.slice(start, end).filter(item => item.kind === 'text').map(item => item.text).join(' ');
    assert.ok(skills.includes('Languages:'));
    assert.ok(skills.includes('TypeScript'));
    assert.ok(skills.includes('Frameworks:'));
    assert.ok(skills.includes('Interests:'));
    assert.ok(!skills.includes('Kotlin'));
    for (const item of items.filter(item => item.kind === 'text')) assert.ok(item.x + item.width <= layout.width);
  }
});

test('long resumes retain all content across real multiple pages', async () => {
  const app = makeApp();
  app.projects[0].bullets = Array.from({ length: 70 }, (_, i) => `Implemented FeatureMarker${i} for a production workflow with database integration, application monitoring and a complete user interface.`);
  const layout = await buildResumeLayout(seedProfile, app);
  assert.ok(layout.pages.length > 1);
  const pdf = await buildPdfBuffer(seedProfile, app);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), layout.pages.length);
  const text = (await extractText(new Uint8Array(pdf), { mergePages: true })).text;
  for (let i = 0; i < 70; i++) assert.ok(text.includes(`FeatureMarker${i}`));
});

test('saved and legacy resumes keep their own details when the profile changes', async () => {
  for (const legacy of [false, true]) {
    const app = makeApp();
    if (legacy) delete app.profileSnapshot;
    const changed = { ...seedProfile, name: 'Changed Name', email: 'changed@example.com', education: [], certifications: [] };
    const pdf = await buildPdfBuffer(changed, app);
    const docx = await buildDocxBuffer(changed, app);
    const text = (await extractText(new Uint8Array(pdf), { mergePages: true })).text;
    const wordText = (await mammoth.extractRawText({ buffer: docx })).value;
    assert.ok(text.includes(seedProfile.name.toUpperCase()));
    assert.ok(wordText.includes(seedProfile.email));
    assert.ok(!wordText.includes(changed.email));
    assert.ok(wordText.includes(seedProfile.certifications[0]));
  }
});

test('Auto-Fix works with no addable keywords and accepts selected additional skills', async () => {
  const base = makeApp('Mobile Developer', 'Build mobile applications using Flutter and Dart.');
  for (const additionalSkills of [[], ['Flutter', 'Dart']]) {
    const fixed = await prepareAutoFix({ resumeText: base.text, jdText: base.jdText, profile: seedProfile, projects: seedProjects, baseApplication: base, additionalSkills });
    assert.ok(fixed.applicationPayload);
    assert.ok(!/truth|fake/i.test(fixed.report.message));
    if (additionalSkills.length) for (const skill of additionalSkills) assert.ok(fixed.applicationPayload.skills.includes(skill));
    else assert.ok(!fixed.applicationPayload.skills.includes('Flutter'));
  }
});

test('AI Auto-Fix rewrites existing content even when every JD keyword is already present', async () => {
  const llm = require('../lib/llm.ts');
  const settings = llm.getEffectiveSettings;
  const json = llm.llmJson;
  const base = makeApp();
  let request;
  llm.getEffectiveSettings = async () => ({ apiKey: 'mock', provider: 'custom', model: 'mock', baseUrl: 'http://unused', source: 'none' });
  llm.llmJson = async options => {
    request = JSON.parse(options.user);
    return { summary: 'Software engineer building React interfaces and Next.js applications. Created project workflows connecting frontend interfaces to backend APIs.', bullets: Object.fromEntries(base.projects.map(project => [project.projectId, project.bullets])) };
  };
  try {
    const fixed = await prepareAutoFix({ resumeText: base.text, jdText: base.jdText, profile: seedProfile, projects: seedProjects, baseApplication: base });
    assert.equal(request.jdText, base.jdText);
    assert.equal(fixed.applicationPayload.generationSource, 'ai');
    assert.ok(fixed.applicationPayload.summary.includes('React interfaces'));
    assert.equal(fixed.applicationPayload.projects.length, base.projects.length);
  } finally { llm.getEffectiveSettings = settings; llm.llmJson = json; }
});

test('uploaded content preserves identity, project metrics, experience and education', async () => {
  const resume = 'OTHER CANDIDATE\n+91 9876543210 | other@example.com\nSUMMARY\nDeveloper who builds reliable software.\nSKILLS\nPython, SQL\nPROJECTS\nInventory Tracker\n• Built an inventory tracker serving 42 users.\nWORK EXPERIENCE\nDeveloper — Other Company (2024–2026)\n• Delivered 12 releases.\nEDUCATION\nBachelor of Science — Other University';
  const fixed = await prepareAutoFix({ resumeText: resume, jdText: 'Build reliable applications using Python and SQL.', profile: seedProfile, projects: seedProjects });
  assert.ok(fixed.applicationPayload.text.includes('OTHER CANDIDATE'));
  assert.ok(fixed.applicationPayload.text.includes('42 users'));
  assert.ok(fixed.applicationPayload.text.includes('12 releases'));
  assert.ok(fixed.applicationPayload.text.includes('Other University'));
  assert.ok(!fixed.applicationPayload.text.includes(seedProfile.email));
  assert.deepEqual(fixed.applicationPayload.profileSnapshot.certifications, []);
});

test('editing summary, skills and template updates all saved export content and validates input', async () => {
  const db = require('../lib/db.ts');
  const route = require('../app/api/applications/[id]/route.ts');
  const { NextRequest } = require('next/server');
  const app = await db.createApplication(makeApp());
  const request = body => new NextRequest(`http://localhost/api/applications/${app.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await route.PATCH(request({ summary: 'Built Next.js applications and reliable React interfaces.', skills: ['React', 'Next.js', 'React'], resumeTemplate: 'modern' }), { params: Promise.resolve({ id: app.id }) });
  assert.equal(response.status, 200);
  const edited = (await response.json()).application;
  assert.ok(edited.text.includes('Built Next.js applications'));
  assert.deepEqual(edited.skills, ['React', 'Next.js']);
  assert.equal(edited.resumeTemplate, 'modern');
  assert.ok(edited.profileSnapshot);
  assert.equal((await route.PATCH(request({ resumeTemplate: 'invalid' }), { params: Promise.resolve({ id: app.id }) })).status, 400);
  assert.equal((await route.PATCH(request({ skills: [123] }), { params: Promise.resolve({ id: app.id }) })).status, 400);
  const options = await route.PATCH(request({ skillGroups: [{ label: 'Languages', items: ['Dart', 'Python'] }], interests: ['Mobile Development'], skillLayout: 'columns', showContactIcons: false, showSectionRules: false }), { params: Promise.resolve({ id: app.id }) });
  const savedOptions = (await options.json()).application;
  assert.deepEqual(savedOptions.skills, ['Dart', 'Python']);
  assert.ok(savedOptions.text.includes('Languages: Dart, Python'));
  assert.ok(savedOptions.text.includes('Interests: Mobile Development'));
  assert.equal(savedOptions.showContactIcons, false);
  assert.equal((await route.PATCH(request({ skillGroups: [null] }), { params: Promise.resolve({ id: app.id }) })).status, 400);
  assert.equal((await route.PATCH(request({ showContactIcons: 'false' }), { params: Promise.resolve({ id: app.id }) })).status, 400);
});
