import type { Application, EducationItem, Profile } from "./types";

const SECTION_NAMES: Record<string, string> = {
  "professional summary": "summary", summary: "summary", profile: "summary", objective: "summary",
  "technical skills": "skills", skills: "skills", "core competencies": "skills", technologies: "skills",
  projects: "projects", "selected projects": "projects", "project experience": "projects",
  experience: "experience", "work experience": "experience", "professional experience": "experience", internships: "experience",
  education: "education", "academic background": "education",
  certifications: "certifications", certificates: "certifications", awards: "awards",
};

export function resumeSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let active = "header";
  sections.header = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const key = SECTION_NAMES[line.replace(/[:]/g, "").toLowerCase()];
    if (key) {
      active = key;
      sections[active] ??= [];
    } else if (line) {
      sections[active].push(line);
    }
  }
  return sections;
}

export function educationText(item: EducationItem): string {
  return [item.title, [item.org, item.period ? `(${item.period})` : ""].filter(Boolean).join(" "), item.detail]
    .filter(Boolean).join(" — ");
}

export function contactText(profile: Profile): string {
  return [profile.phone, profile.email, profile.github, profile.linkedin, profile.portfolio].filter(Boolean).join(" | ");
}

/** Older saved resumes retain their original details from the stored TXT. */
export function profileFromResumeText(text: string, fallback: Profile): Profile {
  const sections = resumeSections(text);
  const header = sections.header.join("\n");
  const contact = sections.header.find(line => line.includes("@"));
  const name = sections.header.find(line => !line.includes("@") && !/https?:|github\.|linkedin\.|\+?\d[\d ()-]{8,}/i.test(line));
  const links = contact?.split("|").map(part => part.trim()) ?? [];
  const email = header.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  const phone = header.match(/\+?\d[\d\s()-]{8,}\d/)?.[0]?.trim();
  const link = (pattern: RegExp) => links.find(value => pattern.test(value)) ?? header.match(pattern)?.[0] ?? "";
  const education = sections.education?.map(line => {
    const parts = line.replace(/^[•\-]\s*/, "").split(" — ");
    const index = parts.findIndex(part => /\([\d–— -]+\)/.test(part));
    if (index < 0) return { title: parts[0], org: parts.slice(1).join(" — "), period: "", detail: "" };
    const organization = parts[index].match(/^(.*?)\s*\(([^)]+)\)$/);
    return { title: parts.slice(0, index).join(" — "), org: organization?.[1] ?? "", period: organization?.[2] ?? "", detail: parts.slice(index + 1).join(" — ") };
  });
  return {
    ...structuredClone(fallback),
    name: name ?? fallback.name,
    ...(contact ? { email: email ?? "", phone: phone ?? "", github: link(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|]+/), linkedin: link(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/), portfolio: links.find(value => !value.includes("@") && !/github\.|linkedin\.|\+?\d[\d ()-]{8,}/i.test(value) && /\.[a-z]{2,}/i.test(value)) ?? "" } : {}),
    education: education ?? [],
    certifications: sections.certifications?.map(line => line.replace(/^[•\-]\s*/, "")) ?? [],
    summary: sections.summary?.join(" ") ?? fallback.summary,
    experience: [],
  };
}

export function resumeProfile(app: Pick<Application, "text" | "profileSnapshot">, fallback: Profile): Profile {
  return app.profileSnapshot ?? profileFromResumeText(app.text, fallback);
}
