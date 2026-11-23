import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { resumeProfile } from "./resumeContent";
import { groupedResumeSkills } from "./resumeSkills";
import { experiencePeriod, experienceTitle } from "./experience";
import type { Application, Profile, ResumeLayout, ResumeTemplate } from "./types";

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };
type Contact = { icon: "phone" | "email" | "github" | "linkedin" | "globe"; text: string; href: string };
type Block = { text: string; size: number; bold?: boolean; color?: string; indent?: number; before?: number; after?: number; centered?: boolean; rule?: boolean; keepNext?: boolean; label?: string; rightText?: string; contacts?: Contact[]; columns?: { label: string; text: string }[] };
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export function pdfText(text: string): string {
  const replacements: Record<string, string> = { "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "✓": "", "✔": "", "✗": "x", "₹": "Rs. ", "★": "*", "☆": "*", "\u00a0": " ", "\u202f": " ", "\u200b": "", "\ufeff": "" };
  const extras = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178]);
  return [...text].map(ch => {
    if (ch in replacements) return replacements[ch];
    const cp = ch.codePointAt(0)!;
    return (cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255) || extras.has(cp) ? ch : ch === "\n" ? "\n" : "";
  }).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfText(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function resumeFonts(doc: PDFDocument, template: ResumeTemplate): Promise<Fonts> {
  const serif = template === "classic";
  return { regular: await doc.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica), bold: await doc.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold), italic: await doc.embedFont(serif ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique) };
}

function blocks(profile: Profile, app: Application, size: number, spacing: number): Block[] {
  const modern = app.resumeTemplate === "modern";
  const result: Block[] = [{ text: profile.name.toUpperCase(), size: modern ? 20 : 18, bold: true, centered: !modern, after: 3 * spacing }];
  const url = (value: string) => /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const contacts: Contact[] = [
    { icon: "phone", text: profile.phone, href: `tel:${profile.phone.replace(/[^+0-9]/g, "")}` },
    { icon: "email", text: profile.email, href: `mailto:${profile.email}` },
  ];
  for (const contact of contacts.filter(contact => contact.text)) result.push({ text: contact.text, contacts: [contact], size: 8.6, centered: !modern, after: spacing });
  const links: Contact[] = [
    { icon: "github", text: profile.github, href: url(profile.github) },
    { icon: "linkedin", text: profile.linkedin, href: url(profile.linkedin) },
    { icon: "globe", text: profile.portfolio, href: url(profile.portfolio) },
  ].filter(contact => contact.text) as Contact[];
  if (links.length) result.push({ text: links.map(link => link.text).join(" "), contacts: links, size: 8.6, centered: !modern, after: 3 * spacing });
  const section = (title: string) => result.push({ text: title.toUpperCase(), size: 10.5, bold: true, before: 8 * spacing, after: 5 * spacing, rule: app.showSectionRules ?? true, keepNext: true });
  const body = (text: string, bullet = false) => result.push({ text, size, indent: bullet ? 10 : 0, after: 2 * spacing });
  const education = () => {
    if (!profile.education.length) return;
    section("Education");
    for (const item of profile.education) {
      result.push({ text: `• ${item.title}`, rightText: item.period, size, bold: true, indent: 10, before: 3 * spacing, after: spacing, keepNext: !!item.org || !!item.detail });
      if (item.org || item.detail) result.push({ text: item.org || " ", rightText: item.detail, size, indent: 10, after: 3 * spacing });
    }
  };
  const skills = () => {
    const groups = groupedResumeSkills(profile, app);
    if (app.interests?.length) groups.push({ label: "Interests", items: app.interests });
    if (!groups.length) return;
    section("Technical Skills");
    if (app.skillLayout === "columns") {
      for (let index = 0; index < groups.length; index += 2) {
        const columns = groups.slice(index, index + 2).map(group => ({ label: group.label, text: group.items.join(", ") }));
        result.push({ text: columns.map(column => column.text).join(" "), columns, size, after: 2 * spacing });
      }
    } else for (const group of groups) result.push({ text: group.items.join(", "), label: group.label, size, after: 2 * spacing });
  };
  if (app.summary.trim()) { section("Professional Summary"); body(app.summary); }
  if (app.resumeTemplate !== "modern") education();
  skills();
  if (app.experience?.length) {
    section("Work Experience");
    for (const item of app.experience) {
      result.push({ text: experienceTitle(item), rightText: experiencePeriod(item), size, bold: true, before: 4 * spacing, after: spacing, keepNext: true });
      if (item.location) result.push({ text: item.location, size: size - 0.7, after: 2 * spacing, keepNext: item.bullets.length > 0 });
      for (const bullet of item.bullets) body(`• ${bullet}`, true);
    }
  }
  if (app.projects.length) {
    section("Projects");
    for (const project of app.projects) {
      result.push({ text: project.title, size, bold: true, before: 4 * spacing, after: spacing, keepNext: true });
      if (project.tech) result.push({ text: project.tech, size: size - 0.7, color: "#444444", after: 2 * spacing, keepNext: project.bullets.length > 0 });
      for (const bullet of project.bullets) body(`• ${bullet}`, true);
      if (project.github) result.push({ text: `GitHub: ${project.github}`, size: 8.5, color: "#444444", after: 2 * spacing });
    }
  }
  for (const extra of app.additionalSections ?? []) {
    if (!extra.lines.length) continue;
    section(extra.title);
    for (const line of extra.lines) body(line, /^[•-]\s/.test(line));
  }
  if (app.resumeTemplate === "modern") education();
  if (profile.certifications.length) { section("Certifications"); for (const certificate of profile.certifications) body(`• ${certificate}`, true); }
  return result;
}

type Drawing = ResumeLayout["pages"][number]["items"][number];
type Prepared = { block: Block; rows: Drawing[][]; lineHeight: number };

function prepare(block: Block, width: number, fonts: Fonts, showIcons: boolean): Prepared {
  const font = block.bold ? fonts.bold : fonts.regular;
  const color = block.color ?? "#111111";
  const lineHeight = block.size * 1.18;
  const text = (value: string, x: number, bold = !!block.bold, italic = false, href?: string): Drawing => ({
    kind: "text", text: value, x, y: block.size, size: block.size, bold, italic, color,
    width: (italic ? fonts.italic : bold ? fonts.bold : fonts.regular).widthOfTextAtSize(value, block.size), href,
  });
  const cell = (label: string, value: string, x: number, available: number): Drawing[][] => {
    const prefix = `${label}: `;
    const labelWidth = fonts.bold.widthOfTextAtSize(prefix, block.size);
    if (labelWidth > available - 60) return [...wrap(prefix, fonts.bold, block.size, available).map(line => [text(line, x, true)]), ...wrap(value, fonts.regular, block.size, available).map(line => [text(line, x, false)])];
    return wrap(value, fonts.regular, block.size, Math.max(50, available - labelWidth)).map((line, index) => [
      ...(index === 0 ? [text(prefix, x, true)] : []), text(line, x + labelWidth, false),
    ]);
  };
  if (block.columns) {
    const columnWidth = (width - 20) / 2;
    const cells = block.columns.map((column, index) => cell(column.label, column.text, index * (columnWidth + 20), columnWidth));
    return { block, lineHeight, rows: Array.from({ length: Math.max(...cells.map(rows => rows.length)) }, (_, index) => cells.flatMap(rows => rows[index] ?? [])) };
  }
  if (block.contacts) {
    const iconWidth = showIcons ? 11 : 0;
    const groupWidth = (contacts: Contact[]) => contacts.reduce((sum, contact) => sum + fonts.regular.widthOfTextAtSize(pdfText(contact.text), block.size) + iconWidth, 0) + (contacts.length - 1) * 12;
    const groups = groupWidth(block.contacts) <= width ? [block.contacts] : block.contacts.map(contact => [contact]);
    const rows: Drawing[][] = [];
    for (const group of groups) {
      if (group.length === 1 && groupWidth(group) > width) {
        const lines = wrap(group[0].text, fonts.regular, block.size, width - iconWidth);
        lines.forEach((line, index) => {
          const lineWidth = fonts.regular.widthOfTextAtSize(line, block.size) + iconWidth;
          const x = block.centered ? (width - lineWidth) / 2 : 0;
          rows.push([...(showIcons && index === 0 ? [{ kind: "icon" as const, icon: group[0].icon, x, y: block.size - 8, size: 8, color }] : []), text(line, x + iconWidth, false, false, group[0].href)]);
        });
      } else {
        let x = block.centered ? (width - groupWidth(group)) / 2 : 0;
        const row: Drawing[] = [];
        for (const contact of group) {
          if (showIcons) row.push({ kind: "icon", icon: contact.icon, x, y: block.size - 8, size: 8, color });
          const item = text(pdfText(contact.text), x + iconWidth, false, false, contact.href);
          row.push(item);
          x += (item.kind === "text" ? item.width : 0) + iconWidth + 12;
        }
        rows.push(row);
      }
    }
    return { block, rows, lineHeight };
  }
  if (block.label) return { block, rows: cell(block.label, block.text, 0, width), lineHeight };
  const indent = block.indent ?? 0;
  const rightWidth = block.rightText ? Math.min(width * 0.32, fonts.italic.widthOfTextAtSize(pdfText(block.rightText), block.size)) : 0;
  const leftWidth = width - indent - (rightWidth ? rightWidth + 12 : 0);
  const bullet = indent > 0 && /^[•-]\s/.test(block.text);
  const left = wrap(bullet ? block.text.replace(/^[•-]\s*/, "") : block.text, font, block.size, leftWidth);
  const right = block.rightText ? wrap(block.rightText, fonts.italic, block.size, Math.max(50, rightWidth)) : [];
  const rows = Array.from({ length: Math.max(left.length, right.length) }, (_, index) => {
    const line = left[index];
    const items: Drawing[] = [];
    if (line) {
      if (bullet && index === 0) items.push(text("•", 0, false));
      const lineWidth = font.widthOfTextAtSize(line, block.size);
      items.push(text(line, block.centered ? (width - lineWidth) / 2 : indent));
    }
    if (right[index]) {
      const lineWidth = fonts.italic.widthOfTextAtSize(right[index], block.size);
      items.push(text(right[index], width - lineWidth, false, true));
    }
    return items;
  });
  return { block, rows, lineHeight };
}

function paginate(profile: Profile, app: Application, fonts: Fonts, bodySize: number, spacing: number): ResumeLayout {
  const template = app.resumeTemplate ?? "compact";
  const margin = template === "compact" ? 36 : 38;
  const width = PAGE_WIDTH - 2 * margin;
  const measured = blocks(profile, app, bodySize, spacing).filter(block => block.text.trim() || block.rightText)
    .map(block => prepare(block, width, fonts, app.showContactIcons ?? true));
  const pages: ResumeLayout["pages"] = [{ items: [] }];
  let y = margin;
  let items = pages[0].items;
  const newPage = () => { items = []; pages.push({ items }); y = margin; };
  const height = (item: Prepared) => (item.block.before ?? 0) + item.rows.length * item.lineHeight + (item.block.after ?? 0);
  for (let index = 0; index < measured.length; index++) {
    const { block, rows, lineHeight } = measured[index];
    let keep = height(measured[index]);
    if (block.keepNext) {
      for (let next = index + 1; next < measured.length; next++) {
        const target = measured[next];
        keep += (target.block.before ?? 0) + target.lineHeight * (target.block.keepNext ? target.rows.length : 1) + (target.block.after ?? 0);
        if (!target.block.keepNext) break;
      }
    }
    if (items.length && keep <= PAGE_HEIGHT - 2 * margin && y + keep > PAGE_HEIGHT - margin) newPage();
    y += block.before ?? 0;
    for (const row of rows) {
      if (y + lineHeight > PAGE_HEIGHT - margin && items.length) newPage();
      for (const item of row) items.push({ ...item, x: margin + item.x, y: y + item.y });
      y += lineHeight;
    }
    if (block.rule) items.push({ kind: "rule", x: margin, y: y + 1, width, color: block.color ?? "#111111" });
    y += block.after ?? 0;
  }
  return { width: PAGE_WIDTH, height: PAGE_HEIGHT, template, fontFamily: template === "classic" ? "Times New Roman, Times, serif" : "Arial, Helvetica, sans-serif", bodySize, pages };
}

/** Preview, print and PDF consume these exact line breaks and coordinates. */
export function layoutWithFonts(profile: Profile, app: Application, fonts: Fonts): ResumeLayout {
  const snapshot = resumeProfile(app, profile);
  const options = [[10.5, 1], [10.5, 0.75], [10, 0.65]];
  const layouts = options.map(([size, spacing]) => paginate(snapshot, app, fonts, size, spacing));
  return layouts.find(layout => layout.pages.length === 1) ?? layouts[0];
}

export async function buildResumeLayout(profile: Profile, app: Application): Promise<ResumeLayout> {
  const doc = await PDFDocument.create();
  return layoutWithFonts(profile, app, await resumeFonts(doc, app.resumeTemplate ?? "compact"));
}
