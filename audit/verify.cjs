// Reproduce the initial audit against the existing application code.
// Run: node audit/verify.cjs. All database writes use a temporary local file.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-builder-audit-'));
process.env.DATA_FILE = path.join(tempDir, 'db.json');
delete process.env.DATABASE_URL;
delete process.env.GROQ_API_KEY;

const { seedProfile, seedProjects } = require('../lib/seed.ts');
const { tailorRules, trimSummary, extractKeywords, skillSupported } = require('../lib/tailor.ts');
const { checkAtsEngine } = require('../lib/ats.ts');
const { buildPdfBuffer, buildDocxBuffer } = require('../lib/resumeFiles.ts');
const { PDFDocument } = require('pdf-lib');
const { extractText } = require('unpdf');
const mammoth = require('mammoth');

async function main() {
  const evidence = {};
  evidence.summaryTrim = {
    input: 'Built APIs with Node.js and Next.js. Used Python and SQL. Deployed models. Tested systems. Delivered apps.',
  };
  evidence.summaryTrim.output = trimSummary(evidence.summaryTrim.input);
  evidence.keywordMatching = {
    input: 'JavaScript and GitHub experience.',
    extracted: extractKeywords('JavaScript and GitHub experience.'),
    tensorflowSupportedByLiteOnly: skillSupported('TensorFlow', ['TensorFlow Lite']),
  };

  const scenarios = [
    ['Computer Vision Engineer', 'Build computer vision systems using Python, OpenCV, YOLO and object detection. Develop real-time image and video inference pipelines.'],
    ['Frontend Developer', 'Develop responsive frontend web applications using JavaScript, TypeScript, React and Next.js. Build accessible HTML and CSS interfaces.'],
    ['Android Developer', 'Develop Android mobile applications using Kotlin, TensorFlow Lite and on-device inference. Integrate offline USSD payments.'],
  ];
  const generated = [];
  for (const [role, jdText] of scenarios) {
    const payload = tailorRules({ company: 'Audit Example', role, jdText, profile: seedProfile, projects: seedProjects });
    payload.summary = trimSummary(payload.summary);
    const app = { ...payload, id: 'audit', status: 'Saved', createdAt: new Date().toISOString() };
    const pdf = await buildPdfBuffer(seedProfile, app);
    const pdfDoc = await PDFDocument.load(pdf);
    const text = (await extractText(new Uint8Array(pdf), { mergePages: true })).text;
    const ats = checkAtsEngine({ resumeText: app.text, jdText, sourceType: 'saved' });
    const artifact = path.join(tempDir, role.replaceAll(' ', '-') + '.pdf');
    fs.writeFileSync(artifact, pdf);
    generated.push({ role, domain: app.domainPrimary, summary: app.summary, summaryWords: app.summary.split(/\s+/).length, skillsCount: app.skills.length, projects: app.projects.map(p => p.title), pdfPages: pdfDoc.getPageCount(), atsScore: ats.score, lengthCheck: ats.categories[0].checks.find(c => c.id === 'f_length'), pdfArtifact: artifact, pdfCharacters: String(text).length });
  }
  evidence.generated = generated;

  const payload = tailorRules({ company: 'Audit', role: 'Developer', jdText: scenarios[1][1], profile: seedProfile, projects: seedProjects });
  const app = { ...payload, id: 'audit-export', status: 'Saved', createdAt: new Date().toISOString() };
  const longTitleApp = { ...app, projects: [{ projectId: 'long-title', title: 'A Long Project Title Demonstrating the Resume Export Layout Limitation', tech: 'TypeScript, React, Next.js, PostgreSQL, Docker, Kubernetes, LongUniqueTechToken', bullets: ['Built an application with a working user interface.'], github: '' }] };
  const exported = await buildPdfBuffer(seedProfile, longTitleApp);
  const exportedText = String((await extractText(new Uint8Array(exported), { mergePages: true })).text);
  evidence.pdfTechOmission = { techPresentInSource: true, techPresentInPdf: exportedText.includes('LongUniqueTechToken') };

  const renamed = { ...seedProfile, name: 'Changed Profile Name', email: 'changed@example.com' };
  const docx = await buildDocxBuffer(renamed, app);
  const docxText = (await mammoth.extractRawText({ buffer: docx })).value;
  evidence.profileSnapshot = { oldNamePresentInTxt: app.text.includes(seedProfile.name.toUpperCase()), changedNamePresentInDocx: docxText.includes('CHANGED PROFILE NAME'), changedEmailPresentInDocx: docxText.includes('changed@example.com') };

  const db = require('../lib/db.ts');
  const { prepareAutoFix } = require('../lib/fix.ts');
  const externalResume = 'OTHER CANDIDATE\n+91 9876543210 | other@example.com\nPROFILE\nDeveloper who builds reliable applications.\nSKILLS\nPython, SQL\nPROJECTS\nExternal Inventory Tracker\n• Built an inventory tracker serving 42 users.\nEDUCATION\nBachelor of Science — Other University';
  const fixed = await prepareAutoFix({ resumeText: externalResume, jdText: 'Use Python, React and SQL to develop reliable applications.', profile: seedProfile, projects: seedProjects });
  evidence.uploadAutoFix = { createdResume: Boolean(fixed.applicationPayload), originalBulletPreserved: fixed.applicationPayload?.text.includes('42 users') ?? null, profileNameUsed: fixed.applicationPayload?.text.includes(seedProfile.name.toUpperCase()) ?? null, originalNamePreserved: fixed.applicationPayload?.text.includes('OTHER CANDIDATE') ?? null };

  const projects = await db.listProjects();
  for (const project of projects) await db.deleteProject(project.id);
  evidence.emptyLibrary = { beforeDeletion: projects.length, afterDeletingAllAndReloading: (await db.listProjects()).length };
  fs.writeFileSync(process.env.DATA_FILE, '{corrupted JSON');
  const recovered = await db.getProfile();
  evidence.corruptStore = { silentlyReturnsSeedProfile: recovered.name === seedProfile.name, originalCorruptFileOverwritten: fs.readFileSync(process.env.DATA_FILE, 'utf8') !== '{corrupted JSON' };

  fs.writeFileSync(path.join(tempDir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ evidencePath: path.join(tempDir, 'evidence.json'), ...evidence }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
