// Verify the running local review app without changing profile or project data.
// Run: node audit/verify-live-projects.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const { extractText } = require('unpdf');
const mammoth = require('mammoth');

const base = 'http://127.0.0.1:3001';
const company = 'Project Review';
const role = 'Android AI Developer';
const jdText = 'Build Android applications in Kotlin with offline-first workflows and accessible mobile interfaces. Integrate on-device inference using MNN and MediaPipe, including retrieval-augmented generation (RAG), chat, and camera-based assistance. Implement clear error handling, local data flows and performance-conscious user interactions. Work with Git, REST APIs and automated testing where available. Prioritize relevant project implementation and concise descriptions of the user problems solved.';
const normalized = text => text.replace(/\s+/g, ' ').trim();

async function json(endpoint, payload) {
  const response = await fetch(`${base}${endpoint}`, { method: payload ? 'POST' : 'GET', headers: payload ? { 'Content-Type': 'application/json' } : undefined, body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(55000) });
  assert.ok(response.ok, `${endpoint} returned ${response.status}`);
  return response.json();
}

async function main() {
  const boot = await json('/api/bootstrap');
  assert.ok(boot.llm.hasKey, 'The review app needs its existing saved key.');
  const projects = ['visionaid', 'aura-hub', 'turantpay', 'backlog-wallah'].map(id => boot.projects.find(project => project.id === id));
  assert.ok(projects.every(Boolean), 'Review projects must exist in the source library.');
  const { analysis } = await json('/api/analyze-job', { company, role, jdText });
  console.log(JSON.stringify({ stage: 'analysis', engine: analysis.engine, domain: analysis.domainPrimary }));
  const selectedSkills = ['Kotlin', 'Android', 'MNN', 'MediaPipe', 'RAG', 'OCR', 'Text-to-Speech', 'Git', 'REST APIs'];
  const { application } = await json('/api/tailor-resume', { company, role, jdText, analysis, selectedProjectIds: projects.map(project => project.id), selectedSkills, selectedExperienceIds: [] });
  assert.equal(application.generationSource, 'ai', 'Live generation must use the saved key.');
  assert.deepEqual(application.skills, selectedSkills);
  assert.equal(application.projects.length, projects.length);
  assert.equal(application.experience.length, 0);
  for (const project of application.projects) {
    const source = projects.find(item => item.id === project.projectId);
    assert.ok(source);
    assert.equal(project.title, source.title);
    assert.equal(project.github, source.github);
    assert.ok(project.bullets.length >= 2 && project.bullets.length <= 3);
    assert.equal(new Set(project.bullets.map(bullet => normalized(bullet).toLowerCase())).size, project.bullets.length);
    assert.equal(project.bullets[0].replace(/[.!?]$/, ''), source.bullets[0].replace(/[.!?]$/, ''));
    for (const tag of source.tags) assert.ok(project.tech.includes(tag));
  }
  console.log(JSON.stringify({ stage: 'generation', id: application.id, engine: application.generationSource, projects: application.projects.length, skills: application.skills.length }));
  const { layout } = await json(`/api/applications/${application.id}/layout`);
  for (const format of ['pdf', 'docx', 'txt']) {
    const response = await fetch(`${base}/api/applications/${application.id}/download?format=${format}`);
    assert.ok(response.ok);
    fs.writeFileSync(path.join(__dirname, `project-review.${format}`), Buffer.from(await response.arrayBuffer()));
  }
  const pdf = fs.readFileSync(path.join(__dirname, 'project-review.pdf'));
  const pdfDocument = await PDFDocument.load(pdf);
  const pdfText = normalized((await extractText(new Uint8Array(pdf), { mergePages: true })).text);
  const docxText = normalized((await mammoth.extractRawText({ buffer: fs.readFileSync(path.join(__dirname, 'project-review.docx')) })).value);
  assert.equal(pdfDocument.getPageCount(), layout.pages.length);
  for (const project of application.projects) {
    assert.ok(pdfText.includes(project.title));
    assert.ok(docxText.includes(project.title));
    assert.ok(pdfText.includes(project.github));
    for (const bullet of project.bullets) {
      assert.ok(pdfText.includes(normalized(bullet)), `PDF must retain the bullet for ${project.title}.`);
      assert.ok(docxText.includes(normalized(bullet)), `DOCX must retain the bullet for ${project.title}.`);
    }
    const headings = layout.pages.flatMap(page => page.items).filter(item => item.kind === 'text' && item.bold && item.text === project.title);
    assert.equal(headings.length, 1, 'Each source project has exactly one bold heading.');
  }
  assert.ok(!pdfText.includes('WORK EXPERIENCE'));
  const evidence = { applicationId: application.id, analysisEngine: analysis.engine, generationEngine: application.generationSource, role, summary: application.summary, skills: application.skills, projects: application.projects, pdfPages: pdfDocument.getPageCount(), previewPages: layout.pages.length, titlesAndLinksPreserved: true, pdfAndDocxBulletsVerified: true };
  fs.writeFileSync(path.join(__dirname, 'project-review-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ stage: 'verified', applicationId: application.id, generation: application.generationSource, pdfPages: pdfDocument.getPageCount(), matchingPreview: true }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
