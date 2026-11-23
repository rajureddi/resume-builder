"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { experiencePeriod } from "@/lib/experience";
import type { ExperienceItem, Profile } from "@/lib/types";
import { BackBtn } from "./StudioUI";

export default function ExperienceView({ profile, goBack, refresh, showToast }: { profile: Profile; goBack: () => void; refresh: () => Promise<unknown>; showToast: (message: string) => void }) {
  const [items, setItems] = useState(profile.experience ?? []);
  const [editing, setEditing] = useState<ExperienceItem | null>(null);
  const [bullets, setBullets] = useState("");
  const [skills, setSkills] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = (item?: ExperienceItem) => {
    setEditing(item ? structuredClone(item) : { id: crypto.randomUUID(), title: "", company: "", location: "", startDate: "", endDate: "", current: false, type: "Internship", bullets: [], skills: [] });
    setBullets(item?.bullets.join("\n") ?? ""); setSkills(item?.skills.join(", ") ?? ""); setError("");
  };
  const persist = async (experience: ExperienceItem[]) => {
    setBusy(true); setError("");
    try {
      await api("/api/experience", { method: "PUT", json: { experience } });
      setItems(experience); setEditing(null); await refresh(); showToast("Experience saved");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save experience"); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!editing) return;
    const entry = { ...editing, bullets: bullets.split("\n").map(bullet => bullet.trim().replace(/^[•-]\s*/, "")).filter(Boolean), skills: skills.split(",").map(skill => skill.trim()).filter(Boolean) };
    persist(items.some(item => item.id === entry.id) ? items.map(item => item.id === entry.id ? entry : item) : [...items, entry]);
  };
  return <div>
    <BackBtn label="More" onClick={goBack} />
    <p className="eyebrow">Profile experience</p><h1 className="page-title">Experience & internships</h1>
    <p className="lede">Add your roles and accomplishments here. Choose which entries to include while building a resume.</p>
    {!editing && <button className="btn btn-primary" onClick={() => open()}>Add experience</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {editing ? <div className="card section-gap">
      <label className="field"><span>Job title</span><input value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} placeholder="Software Engineering Intern" /></label>
      <label className="field"><span>Company / organization</span><input value={editing.company} onChange={event => setEditing({ ...editing, company: event.target.value })} /></label>
      <label className="field"><span>Location</span><input value={editing.location} onChange={event => setEditing({ ...editing, location: event.target.value })} placeholder="Hyderabad or Remote" /></label>
      <label className="field"><span>Experience type</span><select value={editing.type} onChange={event => setEditing({ ...editing, type: event.target.value as ExperienceItem["type"] })}>{["Internship", "Full-time", "Contract", "Part-time", "Freelance", "Volunteer"].map(type => <option key={type}>{type}</option>)}</select></label>
      <div className="form-columns">
        <label className="field"><span>Start date</span><input type="month" value={editing.startDate} onChange={event => setEditing({ ...editing, startDate: event.target.value })} /></label>
        <label className="field"><span>End date</span><input type="month" disabled={editing.current} value={editing.endDate} onChange={event => setEditing({ ...editing, endDate: event.target.value })} /></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" checked={editing.current} onChange={event => setEditing({ ...editing, current: event.target.checked })} />I currently work here</label>
      <label className="field"><span>Accomplishments — one point per line</span><textarea value={bullets} onChange={event => setBullets(event.target.value)} placeholder="Developed…&#10;Implemented…&#10;Improved…" /></label>
      <label className="field"><span>Technologies and skills used</span><input value={skills} onChange={event => setSkills(event.target.value)} placeholder="React, TypeScript, PostgreSQL" /></label>
      <div className="btn-row"><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save experience"}</button><button className="btn" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </div> : items.length ? <div className="section-gap">{items.map(item => <div className="card experience-card" key={item.id}>
      <div className="editor-heading"><strong>{item.title}</strong><span>{item.type}</span></div>
      <p className="small">{item.company} · {experiencePeriod(item)}{item.location ? ` · ${item.location}` : ""}</p>
      <ul className="project-points">{item.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>
      <p className="small muted">{item.skills.join(", ")}</p>
      <div className="btn-row"><button className="btn" onClick={() => open(item)}>Edit</button><button className="btn btn-danger" disabled={busy} onClick={() => { if (window.confirm(`Remove the ${item.title} entry?`)) persist(items.filter(entry => entry.id !== item.id)); }}>Remove</button></div>
    </div>)}</div> : <p className="empty">No experience added yet. This section is optional for freshers.</p>}
  </div>;
}
