"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import type { Project, ProjectStackVariant } from "@/lib/types";
import { BackBtn } from "./StudioUI";

export default function ProjectEditor({ project, goBack, refresh, showToast }: { project: Project | null; goBack: () => void; refresh: () => Promise<unknown>; showToast: (message: string) => void }) {
  const [draft, setDraft] = useState(project ?? { id: "", title: "", year: "", description: "", tags: [], domains: [], github: "", bullets: [] });
  const [tags, setTags] = useState(project?.tags.join(", ") ?? "");
  const [domains, setDomains] = useState(project?.domains.join(", ") ?? "");
  const [bullets, setBullets] = useState(project?.bullets.join("\n") ?? "");
  const [variants, setVariants] = useState<ProjectStackVariant[]>(structuredClone(project?.stackVariants ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    const split = (text: string) => text.split(",").map(value => value.trim()).filter(Boolean);
    try {
      await api(project?.id ? `/api/projects/${project.id}` : "/api/projects", { method: project?.id ? "PUT" : "POST", json: { ...draft, tags: split(tags), domains: split(domains), bullets: bullets.split("\n").map(bullet => bullet.trim().replace(/^[•-]\s*/, "")).filter(Boolean), stackVariants: variants } });
      await refresh(); showToast("Project saved"); goBack();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project"); }
    finally { setBusy(false); }
  };
  const updateVariant = (id: string, fields: Partial<ProjectStackVariant>) => setVariants(variants.map(variant => variant.id === id ? { ...variant, ...fields } : variant));
  return <div>
    <BackBtn label="Back" onClick={goBack} /><p className="eyebrow">Project library</p><h1 className="page-title">{project?.id ? "Edit project" : "Add a project"}</h1>
    <label className="field"><span>Project title</span><input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
    <label className="field"><span>Year</span><input value={draft.year} onChange={event => setDraft({ ...draft, year: event.target.value })} placeholder="2026" /></label>
    <label className="field"><span>Project overview</span><textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /><span className="hint">Describe what the project does and who it helps.</span></label>
    <label className="field"><span>Technologies used</span><input value={tags} onChange={event => setTags(event.target.value)} placeholder="Flutter, Dart, Supabase" /></label>
    <label className="field"><span>Domains</span><input value={domains} onChange={event => setDomains(event.target.value)} placeholder="Flutter, Full-Stack" /></label>
    <label className="field"><span>GitHub URL</span><input value={draft.github} onChange={event => setDraft({ ...draft, github: event.target.value })} placeholder="https://github.com/yourname/project" /></label>
    <label className="field"><span>Project bullet points</span><textarea value={bullets} onChange={event => setBullets(event.target.value)} style={{ minHeight: 145 }} /><span className="hint">First: project overview. Then: implementation, stack and results. One point per line.</span></label>
    <h2 className="section-title">Stack versions</h2><p className="small muted">Add alternative implementations here. The resume builder can select the version relevant to a job.</p>
    {variants.map(variant => <div className="card variant-editor" key={variant.id}>
      <label className="field"><span>Version name</span><input value={variant.label} onChange={event => updateVariant(variant.id, { label: event.target.value })} placeholder="React + FastAPI" /></label>
      <label className="field"><span>Version technologies</span><input value={variant.tags.join(", ")} onChange={event => updateVariant(variant.id, { tags: event.target.value.split(",").map(tag => tag.trim()) })} /></label>
      <label className="field"><span>Version overview</span><textarea value={variant.description} onChange={event => updateVariant(variant.id, { description: event.target.value })} /></label>
      <label className="field"><span>Version bullet points</span><textarea value={variant.bullets.join("\n")} onChange={event => updateVariant(variant.id, { bullets: event.target.value.split("\n") })} /></label>
      <button className="btn btn-ghost" onClick={() => setVariants(variants.filter(item => item.id !== variant.id))}>Remove version</button>
    </div>)}
    <button className="btn" onClick={() => setVariants([...variants, { id: crypto.randomUUID(), label: "", tags: [], description: "", bullets: [] }])}>Add stack version</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="btn-row section-gap"><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save project"}</button>{project?.id && <button className="btn btn-danger" disabled={busy} onClick={async () => { if (!window.confirm(`Delete ${project.title}?`)) return; setBusy(true); try { await api(`/api/projects/${project.id}`, { method: "DELETE" }); await refresh(); goBack(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete project"); setBusy(false); } }}>Delete project</button>}</div>
  </div>;
}
