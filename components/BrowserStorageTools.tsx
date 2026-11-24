"use client";

import { useRef, useState } from "react";
import { exportBrowserBackup, importBrowserBackup } from "@/lib/browserDb";

export default function BrowserStorageTools({ refresh }: { refresh: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const backup = () => {
    try {
      const url = URL.createObjectURL(new Blob([exportBrowserBackup()], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "Resume-Studio-Backup.json";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage("Backup downloaded. API keys are kept separately and are not included.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create a backup."); }
  };

  return <div className="section-gap">
    <p className="eyebrow">Browser storage</p>
    <p className="small muted">Keep a backup before clearing site data. Restoring a backup replaces the studio data in this browser and keeps your saved API key.</p>
    <div className="btn-row">
      <button className="btn" onClick={backup} disabled={busy}>Download backup</button>
      <button className="btn" onClick={() => input.current?.click()} disabled={busy}>Restore backup</button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !window.confirm("Replace this browser’s saved projects, resumes, profile and ATS history with this backup? Your saved API key will stay unchanged.")) return;
        setBusy(true);
        try {
          importBrowserBackup(await file.text());
          await refresh();
          setMessage("Backup restored in this browser.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Could not restore this backup."); }
        finally { setBusy(false); }
      }} />
    </div>
    {message && <p role="status" className="small">{message}</p>}
  </div>;
}
