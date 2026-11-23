"use client";

import { useState } from "react";
import { PROJECT_TEMPLATES, draftFromTemplate } from "@/lib/projectTemplates";
import type { Project } from "@/lib/types";

export default function ProjectTemplateGallery({ onChoose, domain }: { onChoose: (project: Project) => void; domain?: string }) {
  const [filter, setFilter] = useState(domain ?? "All domains");
  const [level, setLevel] = useState("All levels");
  const [search, setSearch] = useState("");
  const [variants, setVariants] = useState<Record<string, string>>({});
  const domains = [...new Set(PROJECT_TEMPLATES.flatMap(template => template.domains))].sort();
  const templates = PROJECT_TEMPLATES.filter(template => (filter === "All domains" || template.domains.includes(filter)) && (level === "All levels" || template.level === level) && `${template.title} ${template.tags.join(" ")} ${template.domains.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <div>
    <p className="small muted">{PROJECT_TEMPLATES.length} starter and real-world examples. Choose a stack, then edit the project details before adding it to your library.</p>
    <div className="form-columns"><label className="field"><span>Project domain</span><select value={filter} onChange={event => setFilter(event.target.value)}><option>All domains</option>{domains.map(domain => <option key={domain}>{domain}</option>)}</select></label><label className="field"><span>Project level</span><select value={level} onChange={event => setLevel(event.target.value)}><option>All levels</option><option>Starter</option><option>Real-world</option></select></label></div>
    <label className="field"><span>Search project templates</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Flutter, RAG, SQL, React…" /></label>
    <div className="template-grid">{templates.map(template => {
      const draft = draftFromTemplate(template, variants[template.id]);
      return <article className="card template-card" key={template.id}>
        <div className="editor-heading"><strong>{template.title}</strong><span className="chip">{template.level}</span></div>
        <p className="small muted">{draft.tags.join(", ")}</p>
        <ul className="project-points">{draft.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>
        {template.stackVariants?.length ? <label className="field"><span>Template stack</span><select value={variants[template.id] ?? ""} onChange={event => setVariants({ ...variants, [template.id]: event.target.value })}><option value="">{template.tags.slice(0, 3).join(" + ")}</option>{template.stackVariants.map(variant => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></label> : null}
        <p className="small"><strong>Skills to add:</strong> {draft.tags.join(", ")}</p>
        <button className="btn" onClick={() => onChoose(draft)}>Use this template</button>
      </article>;
    })}</div>
    {!templates.length && <p className="empty">No matching templates. Try another domain or search.</p>}
  </div>;
}
