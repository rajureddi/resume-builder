import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import { PDFDocument, PDFName, PDFString, rgb } from "pdf-lib";
import { CONTACT_ICONS } from "./contactIcons";
import { groupedResumeSkills } from "./resumeSkills";
import { experiencePeriod, experienceTitle } from "./experience";
import { resumeProfile } from "./resumeContent";
import { layoutWithFonts, resumeFonts } from "./resumeLayout";
import type { Application, Profile } from "./types";

function slugPart(s: string): string {
  return s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function resumeFileStem(profile: Profile, app: Application): string {
  const snapshot = resumeProfile(app, profile);
  return [slugPart(snapshot.name) || "Resume", "Resume", slugPart(app.company), slugPart(app.role)].filter(Boolean).join("-");
}

export function resumeTxt(app: Application): string {
  return app.text.endsWith("\n") ? app.text : `${app.text}\n`;
}

export async function buildDocxBuffer(profile: Profile, app: Application): Promise<Buffer> {
  const snapshot = resumeProfile(app, profile);
  const heading = (text: string) => new Paragraph({ spacing: { before: 140, after: 60 }, keepNext: true, border: app.showSectionRules !== false ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: "111111", space: 1 } } : undefined, children: [new TextRun({ text, bold: true, size: 21 })] });
  const para = (text: string, bullet = false) => new Paragraph({ ...(bullet ? { bullet: { level: 0 } } : {}), spacing: { after: 30 }, children: [new TextRun({ text })] });
  const children: Paragraph[] = [
    new Paragraph({ alignment: app.resumeTemplate === "modern" ? AlignmentType.LEFT : AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: snapshot.name.toUpperCase(), bold: true, size: 36 })] }),
  ];
  for (const text of [snapshot.phone, snapshot.email, [snapshot.github, snapshot.linkedin, snapshot.portfolio].filter(Boolean).join(" | ")].filter(Boolean)) children.push(new Paragraph({ alignment: app.resumeTemplate === "modern" ? AlignmentType.LEFT : AlignmentType.CENTER, children: [new TextRun({ text, size: 17, color: "444444" })] }));
  const education = () => {
    if (!snapshot.education.length) return;
    children.push(heading("EDUCATION"));
    for (const item of snapshot.education) {
      children.push(new Paragraph({ keepNext: !!item.org || !!item.detail, tabStops: [{ type: TabStopType.RIGHT, position: 10300 }], children: [new TextRun({ text: item.title, bold: true }), new TextRun({ text: `\t${item.period}`, italics: true })] }));
      if (item.org || item.detail) children.push(new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 10300 }], children: [new TextRun({ text: item.org }), new TextRun({ text: `\t${item.detail}`, italics: true })] }));
    }
  };
  if (app.summary.trim()) children.push(heading("PROFESSIONAL SUMMARY"), para(app.summary));
  if (app.resumeTemplate !== "modern") education();
  if (app.skills.length || app.interests?.length) {
    children.push(heading("TECHNICAL SKILLS"));
    const groups = groupedResumeSkills(snapshot, app);
    if (app.interests?.length) groups.push({ label: "Interests", items: app.interests });
    for (const group of groups) children.push(new Paragraph({ children: [new TextRun({ text: `${group.label}: `, bold: true }), new TextRun({ text: group.items.join(", ") })] }));
  }
  if (app.experience?.length) {
    children.push(heading("WORK EXPERIENCE"));
    for (const item of app.experience) {
      children.push(new Paragraph({ keepNext: true, tabStops: [{ type: TabStopType.RIGHT, position: 10300 }], children: [new TextRun({ text: experienceTitle(item), bold: true }), new TextRun({ text: `\t${experiencePeriod(item)}`, italics: true })] }));
      if (item.location) children.push(para(item.location));
      for (const bullet of item.bullets) children.push(para(bullet, true));
    }
  }
  if (app.projects.length) children.push(heading("PROJECTS"));
  for (const project of app.projects) {
    children.push(new Paragraph({ keepNext: true, spacing: { before: 60, after: 20 }, children: [new TextRun({ text: project.title, bold: true })] }));
    if (project.tech) children.push(new Paragraph({ keepNext: project.bullets.length > 0, children: [new TextRun({ text: project.tech, size: 19, color: "444444" })] }));
    for (const bullet of project.bullets) children.push(para(bullet, true));
    if (project.github) children.push(new Paragraph({ children: [new TextRun({ text: `GitHub: ${project.github}`, size: 17 })] }));
  }
  for (const section of app.additionalSections ?? []) {
    if (!section.lines.length) continue;
    children.push(heading(section.title.toUpperCase()));
    for (const line of section.lines) children.push(para(line.replace(/^[•-]\s*/, ""), /^[•-]\s/.test(line)));
  }
  if (app.resumeTemplate === "modern") education();
  if (snapshot.certifications.length) {
    children.push(heading("CERTIFICATIONS"));
    for (const certificate of snapshot.certifications) children.push(para(certificate, true));
  }
  const doc = new Document({
    creator: snapshot.name,
    title: `${snapshot.name} — Resume — ${app.company} — ${app.role}`,
    styles: { default: { document: { run: { font: app.resumeTemplate === "classic" ? "Times New Roman" : "Arial", size: 21 }, paragraph: { spacing: { line: 252, after: 30 } } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 680, bottom: 680, left: 680, right: 680 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

export async function buildPdfBuffer(profile: Profile, app: Application): Promise<Buffer> {
  const snapshot = resumeProfile(app, profile);
  const doc = await PDFDocument.create();
  doc.setTitle(`${snapshot.name} — Resume — ${app.company} — ${app.role}`);
  doc.setAuthor(snapshot.name);
  doc.setCreator("Resume Studio");
  const fonts = await resumeFonts(doc, app.resumeTemplate ?? "compact");
  const layout = layoutWithFonts(snapshot, app, fonts);
  const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
  for (const planned of layout.pages) {
    const page = doc.addPage([layout.width, layout.height]);
    for (const item of planned.items) {
      if (item.kind === "text") {
        page.drawText(item.text, { x: item.x, y: layout.height - item.y, size: item.size, font: item.italic ? fonts.italic : item.bold ? fonts.bold : fonts.regular, color: color(item.color) });
        if (item.href && /^(https?:|mailto:|tel:)/i.test(item.href)) page.node.addAnnot(doc.context.register(doc.context.obj({ Type: PDFName.of("Annot"), Subtype: PDFName.of("Link"), Rect: [item.x, layout.height - item.y - 2, item.x + item.width, layout.height - item.y + item.size], Border: [0, 0, 0], A: { S: PDFName.of("URI"), URI: PDFString.of(item.href) } })));
      } else if (item.kind === "icon") {
        for (const path of CONTACT_ICONS[item.icon]) page.drawSvgPath(path, { x: item.x, y: layout.height - item.y, scale: item.size / 24, borderColor: color(item.color), borderWidth: 1.5 });
      } else page.drawLine({ start: { x: item.x, y: layout.height - item.y }, end: { x: item.x + item.width, y: layout.height - item.y }, thickness: 0.6, color: color(item.color) });
    }
  }
  return Buffer.from(await doc.save());
}
