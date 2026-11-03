"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && data.ok) {
      window.location.href = "/";
    } else {
      setError(data.error ?? "Wrong password. Try again.");
    }
  };

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-orb" aria-hidden="true" />
        <p className="eyebrow">Resume Studio</p>
        <h1>This site is locked</h1>
        <p className="muted">
          Enter the site password to continue. Your resumes and API key stay
          private behind this lock.
        </p>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
