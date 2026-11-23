"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import type { Profile } from "@/lib/types";
import { SkillRow } from "./ResumeEditor";
import { BackBtn } from "./StudioUI";

export default function SkillsView({ profile, goBack, refresh, showToast }: { profile: Profile; goBack: () => void; refresh: () => Promise<unknown>; showToast: (message: string) => void }) {
  const [groups, setGroups] = useState(structuredClone(profile.skillGroups));
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    try { await api("/api/skills", { method: "PUT", json: { skillGroups: groups } }); await refresh(); showToast("Profile skills saved"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save skills"); }
    finally { setBusy(false); }
  };
  return <div>
    <BackBtn label="More" onClick={goBack} /><p className="eyebrow">Profile skills</p><h1 className="page-title">Skills</h1>
    <p className="lede">Keep your full skill library here. Select a smaller job-specific list while building each resume.</p>
    {groups.map(group => <div key={group.label}><SkillRow group={group} suggestions={[]} add={skill => setGroups(groups.map(item => item.label === group.label ? { ...item, items: [...new Set([...item.items, skill])] } : item))} remove={skill => setGroups(groups.map(item => item.label === group.label ? { ...item, items: item.items.filter(value => value !== skill) } : item))} /><button className="btn btn-ghost small" onClick={() => setGroups(groups.filter(item => item.label !== group.label))}>Remove {group.label} category</button></div>)}
    <div className="skill-add-row section-gap"><input aria-label="New profile skill category" placeholder="New category, e.g. Databases" value={label} maxLength={40} onChange={event => setLabel(event.target.value)} /><button className="btn" disabled={!label.trim() || groups.length >= 12} onClick={() => { if (!groups.some(group => group.label.toLowerCase() === label.trim().toLowerCase())) setGroups([...groups, { label: label.trim(), items: [] }]); setLabel(""); }}>Add category</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save profile skills"}</button>
  </div>;
}
