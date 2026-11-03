import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Application, Profile } from "./types";

/* ── Downloadable resume files ────────────────────────────────────────
   PDF, DOCX and TXT are all generated here from the saved
   application's own content, so a download always matches the paper
   view exactly. The PDF is a real file built server-side with pdf-lib
   — Download never detours through the browser print flow. */

function slugPart(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** e.g. "Raju-Bandam-Resume-Feedly-ML-Engineer" (extension added by caller). */
export function resumeFileStem(profile: Profile, app: Application): string {
  const name = profile.name
    .trim()
    .split(/\s+/)
    .map(slugPart)
    .filter(Boolean)
    .join("-");
  const parts = [
    name || "Resume",
    "Resume",
    slugPart(app.company),
    slugPart(app.role),
  ].filter(Boolean);
  return parts.join("-");
}

/** Plain-text download: the application's stored resume text. */
export function resumeTxt(app: Application): string {
  return app.text.endsWith("\n") ? app.text : `${app.text}\n`;
}

/**
 * A real .docx: single column, standard headings, real bullet lists —
 * the same content and order as the paper view, ATS-parseable.
 */
export async function buildDocxBuffer(
  profile: Profile,
  app: Application
): Promise<Buffer> {
  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text, bold: true })],
    });
  const para = (text: string) =>
    new Paragraph({ children: [new TextRun({ text })] });
  const bullet = (text: string) =>
    new Paragraph({
      bullet: { level: 0 },
      children: [new TextRun({ text })],
    });

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: profile.name.toUpperCase(), bold: true })],
    }),
    para(
      `${profile.phone} | ${profile.email} | ${profile.github} | ${profile.linkedin} | ${profile.portfolio}`
    ),
    heading("PROFESSIONAL SUMMARY"),
    para(app.summary),
    heading("TECHNICAL SKILLS"),
    para(app.skills.join(", ")),
    heading("PROJECTS"),
  ];

  for (const p of app.projects) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 40 },
        children: [
          new TextRun({ text: p.title, bold: true }),
          ...(p.tech ? [new TextRun({ text: ` (${p.tech})` })] : []),
        ],
      })
    );
    for (const b of p.bullets) children.push(bullet(b));
    if (p.github) children.push(para(`GitHub: ${p.github}`));
  }

  children.push(heading("EDUCATION"));
  for (const e of profile.education) {
    children.push(bullet(`${e.title} — ${e.org} (${e.period}) — ${e.detail}`));
  }
  children.push(heading("CERTIFICATIONS"));
  for (const c of profile.certifications) children.push(bullet(c));

  const doc = new Document({
    creator: profile.name,
    title: `${profile.name} — Resume — ${app.company} — ${app.role}`,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

/* ── PDF ───────────────────────────────────────────────────────────────
   Real PDF generated with pdf-lib (pure JS, standard embedded fonts):
   clean single column, same content and order as the paper view.
   A4 with 48pt margins; text is wrapped by measured font metrics and
   flows onto extra pages when needed. */

/** Characters the standard Helvetica (WinAnsi) encoding cannot draw. */
const PDF_CHAR_FALLBACKS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "⇒": "=>",
  "✓": "", // dropped — checkmark has no WinAnsi glyph
  "✔": "",
  "✗": "x",
  "★": "*",
  "☆": "*",
  "₹": "Rs. ",
  "·": "|",
  "•": "-", // bullets are drawn manually; inline ones become hyphens
  " ": " ",
  " ": " ",
  "​": "",
  "﻿": "",
};

/** Extra punctuation WinAnsi does include (beyond ASCII + Latin-1). */
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch in PDF_CHAR_FALLBACKS) {
      out += PDF_CHAR_FALLBACKS[ch];
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0;
    const printable =
      (cp >= 0x20 && cp <= 0x7e) || // ASCII
      (cp >= 0xa0 && cp <= 0xff) || // Latin-1 supplement
      WINANSI_EXTRA.has(cp);
    out += printable ? ch : "";
  }
  return out;
}

/** Greedy word-wrap using the font's real glyph widths. */
function wrapLines(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const raw of pdfSafe(text).split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the column: hard-split it.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) {
          cut -= 1;
        }
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function buildPdfBuffer(
  profile: Profile,
  app: Application
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${profile.name} — Resume — ${app.company} — ${app.role}`);
  doc.setAuthor(profile.name);
  doc.setCreator("Resume Studio");
  doc.setProducer("Resume Studio");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 48;
  const WIDTH = PAGE_W - MARGIN * 2;
  const ink = rgb(0.07, 0.07, 0.07);
  const gray = rgb(0.32, 0.32, 0.32);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  /** Make sure `height` fits on the current page, else start a new one. */
  const ensure = (height: number) => {
    if (y - height < MARGIN) newPage();
  };

  const drawLine = (
    text: string,
    font: PDFFont,
    size: number,
    x: number,
    color = ink,
    lineHeight?: number
  ) => {
    const lh = lineHeight ?? size * 1.35;
    ensure(lh);
    page.drawText(text, { x, y: y - size, size, font, color });
    y -= lh;
  };

  /** Wrapped paragraph; first-line x offset and continuation indent. */
  const paragraph = (
    text: string,
    font: PDFFont,
    size: number,
    opts: { indent?: number; gapAfter?: number; color?: typeof ink } = {}
  ) => {
    const indent = opts.indent ?? 0;
    const lh = size * 1.35;
    for (const line of wrapLines(font, text, size, WIDTH - indent)) {
      drawLine(line, font, size, MARGIN + indent, opts.color, lh);
    }
    y -= opts.gapAfter ?? 4;
  };

  const section = (title: string) => {
    y -= 10;
    ensure(24);
    drawLine(title, bold, 11.5, MARGIN, ink, 15);
    // Hairline rule under the heading.
    page.drawLine({
      start: { x: MARGIN, y: y + 3 },
      end: { x: PAGE_W - MARGIN, y: y + 3 },
      thickness: 0.6,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 4;
  };

  const bullet = (text: string, size = 10) => {
    const indent = 12;
    const lines = wrapLines(regular, text, size, WIDTH - indent);
    lines.forEach((line, i) => {
      if (i === 0) {
        ensure(size * 1.35);
        page.drawText("•", {
          x: MARGIN,
          y: y - size,
          size,
          font: regular,
          color: ink,
        });
      }
      drawLine(line, regular, size, MARGIN + indent);
    });
    y -= 1;
  };

  /* Header */
  drawLine(pdfSafe(profile.name).toUpperCase(), bold, 20, MARGIN, ink, 26);
  paragraph(
    `${profile.phone} | ${profile.email} | ${profile.github} | ${profile.linkedin} | ${profile.portfolio}`,
    regular,
    9.5,
    { color: gray, gapAfter: 2 }
  );

  section("PROFESSIONAL SUMMARY");
  paragraph(app.summary, regular, 10);

  section("TECHNICAL SKILLS");
  paragraph(app.skills.join(", "), regular, 10);

  section("PROJECTS");
  for (const p of app.projects) {
    y -= 4;
    // Keep the project title with at least its first bullet.
    ensure(30);
    const title = pdfSafe(p.title);
    page.drawText(title, { x: MARGIN, y: y - 10.5, size: 10.5, font: bold, color: ink });
    let tx = MARGIN + bold.widthOfTextAtSize(title, 10.5);
    if (p.tech) {
      const tech = pdfSafe(` (${p.tech})`);
      if (tx + regular.widthOfTextAtSize(tech, 10) <= PAGE_W - MARGIN) {
        page.drawText(tech, { x: tx, y: y - 10.5, size: 10, font: regular, color: gray });
        tx += regular.widthOfTextAtSize(tech, 10);
      }
    }
    y -= 15;
    for (const b of p.bullets) bullet(b);
    if (p.github) paragraph(`GitHub: ${p.github}`, regular, 9.5, { color: gray, gapAfter: 2 });
  }

  section("EDUCATION");
  for (const e of profile.education) {
    bullet(`${e.title} — ${e.org} (${e.period}) — ${e.detail}`);
  }

  section("CERTIFICATIONS");
  for (const c of profile.certifications) bullet(c);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
