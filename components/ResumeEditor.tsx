"use client";

import { useState } from "react";
import { groupedResumeSkills } from "@/lib/resumeSkills";
import { resumeProfile } from "@/lib/resumeContent";
import type { Application, Profile, SkillGroup } from "@/lib/types";

export type ResumeEdits = Pick<Application, "summary" | "skills" | "skillGroups" | "interests" | "skillLayout" | "showContactIcons" | "showSectionRules">;

export function SkillRow({ group, suggestions, add, remove }: { group: SkillGroup; suggestions: string[]; add: (skill: string) => void; remove: (skill: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => { if (draft.trim()) { add(draft.trim()); setDraft(""); } };
  return <div className="skill-group-editor">
    <h3>{group.label}</h3>
    <div className="skill-chips">{group.items.map(skill => <span className="skill-chip" key={skill}>{skill}<button type="button" aria-label={`Remove ${skill} from ${group.label}`} onClick={() => remove(skill)}>×</button></span>)}</div>
    <div className="skill-add-row">
      <input aria-label={`New ${group.label} skill`} placeholder={group.label === "Interests" ? "Add an interest" : "Add a skill"} value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} />
      <button type="button" className="btn" disabled={!draft.trim()} onClick={submit}>Add</button>
    </div>
    {suggestions.length > 0 && <div className="skill-suggestions">{suggestions.filter(skill => !group.items.includes(skill)).map(skill => <button type="button" key={skill} onClick={() => add(skill)}>+ {skill}</button>)}</div>}
  </div>;
}

export default function ResumeEditor({ app, profile, saving, onSave, onCancel }: { app: Application; profile: Profile; saving: boolean; onSave: (changes: ResumeEdits) => void; onCancel: () => void }) {
  const snapshot = resumeProfile(app, profile);
  const [summary, setSummary] = useState(app.summary);
  const [groups, setGroups] = useState<SkillGroup[]>(() => {
    const initial = groupedResumeSkills(snapshot, app);
    for (const label of ["Languages", "Frameworks", "ML/AI", "Tools"]) if (!initial.some(group => group.label === label)) initial.push({ label, items: [] });
    initial.push({ label: "Interests", items: [...(app.interests ?? [])] });
    return initial;
  });
  const [skillLayout, setSkillLayout] = useState(app.skillLayout ?? "stacked");
  const [icons, setIcons] = useState(app.showContactIcons ?? true);
  const [rules, setRules] = useState(app.showSectionRules ?? true);
  const [groupDraft, setGroupDraft] = useState("");
  const change = (label: string, skill: string, add: boolean) => setGroups(groups => groups.map(group => group.label === label ? { ...group, items: add ? [...new Set([...group.items, skill])] : group.items.filter(item => item !== skill) } : group));
  const selectedSkills = groups.filter(group => group.label !== "Interests").flatMap(group => group.items);
  return <div className="card resume-editor">
    <h2>Edit this resume</h2>
    <label className="field"><span>Professional summary</span><textarea value={summary} maxLength={2000} onChange={event => setSummary(event.target.value)} /><span className="hint">{summary.trim() ? summary.trim().split(/\s+/).length : 0} words</span></label>
    <div className="editor-heading"><strong>Technical skills</strong><span>{new Set(selectedSkills).size} selected</span></div>
    <p className="small muted">Use × to remove a skill. Add from your profile suggestions or type a new one.</p>
    {groups.map(group => <SkillRow key={group.label} group={group} suggestions={snapshot.skillGroups.find(source => source.label === group.label)?.items ?? []} add={skill => change(group.label, skill, true)} remove={skill => change(group.label, skill, false)} />)}
    <div className="skill-add-row">
      <input aria-label="New skill category" placeholder="New category, e.g. Cloud" maxLength={40} value={groupDraft} onChange={event => setGroupDraft(event.target.value)} />
      <button className="btn" disabled={!groupDraft.trim() || groups.length >= 10} onClick={() => { if (!groups.some(group => group.label.toLowerCase() === groupDraft.trim().toLowerCase())) setGroups([...groups, { label: groupDraft.trim(), items: [] }]); setGroupDraft(""); }}>Add category</button>
    </div>
    <label className="field"><span>Technical skills layout</span><select value={skillLayout} onChange={event => setSkillLayout(event.target.value as "stacked" | "columns")}><option value="stacked">Grouped rows (recommended)</option><option value="columns">Compact two columns</option></select></label>
    <label className="checkbox-row"><input type="checkbox" checked={icons} onChange={event => setIcons(event.target.checked)} />Show phone, email and link icons</label>
    <label className="checkbox-row"><input type="checkbox" checked={rules} onChange={event => setRules(event.target.checked)} />Show thin section dividers</label>
    <div className="btn-row">
      <button className="btn btn-primary" disabled={saving} onClick={() => onSave({ summary, skills: [...new Set(selectedSkills)], skillGroups: groups.filter(group => group.label !== "Interests" && group.items.length), interests: groups.find(group => group.label === "Interests")?.items ?? [], skillLayout, showContactIcons: icons, showSectionRules: rules })}>{saving ? "Saving…" : "Save resume"}</button>
      <button className="btn" disabled={saving} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}
