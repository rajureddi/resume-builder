"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { normalizeLlmSettings, PROVIDER_PRESETS, publicSettings } from "@/lib/llmSettings";
import { clearLocalLlmSettings, getLocalLlmSettings, saveLocalLlmSettings } from "@/lib/localLlmSettings";
import type { LlmSettingsPublic } from "@/lib/types";
import Orb from "./Orb";

export default function SettingsView({ llm, goBack, goHome, refresh, showToast }: {
  llm: LlmSettingsPublic;
  goBack: () => void;
  goHome: () => void;
  refresh: () => Promise<unknown>;
  showToast: (message: string) => void;
}) {
  const [provider, setProvider] = useState(llm.provider);
  const [baseUrl, setBaseUrl] = useState(llm.baseUrl);
  const [model, setModel] = useState(llm.model);
  const [apiKey, setApiKey] = useState("");
  const [current, setCurrent] = useState(llm);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCurrent(llm); }, [llm]);

  const draft = () => {
    const settings = normalizeLlmSettings({ provider, baseUrl, model, apiKey: apiKey.trim() || getLocalLlmSettings()?.apiKey || "" });
    if (!settings) throw new Error("Enter a provider, a valid HTTP(S) base URL, a model and an API key.");
    return settings;
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const settings = saveLocalLlmSettings(draft());
      setCurrent(publicSettings(settings));
      setProvider(settings.provider);
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
      setApiKey("");
      await refresh();
      setMsg({ kind: "ok", text: "Saved on this device. Your next AI request will use these settings." });
    } catch (error) {
      setMsg({ kind: "err", text: error instanceof Error ? error.message : "Save failed" });
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const settings = draft();
      const result = await api<{ ok: boolean; message: string }>("/api/test-llm", { method: "POST", json: { llmSettings: settings } });
      const saved = getLocalLlmSettings();
      const changed = !saved || JSON.stringify(saved) !== JSON.stringify(settings);
      setMsg({ kind: result.ok ? "ok" : "err", text: result.message + (result.ok && changed ? " Save on this device to keep these settings." : "") });
    } catch (error) {
      setMsg({ kind: "err", text: error instanceof Error ? error.message : "Test failed" });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    try {
      clearLocalLlmSettings();
      setCurrent(publicSettings(null));
      setApiKey("");
      await refresh();
      showToast("API settings removed from this device");
      setMsg({ kind: "ok", text: "Removed. AI will use the built-in engine until you save a new key on this device." });
    } catch (error) {
      setMsg({ kind: "err", text: error instanceof Error ? error.message : "Could not remove settings" });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="back-row">
        <button className="back-btn" onClick={goBack}><span className="chev">‹</span> More</button>
        <button className="home-btn" onClick={goHome}>Home</button>
      </div>
      <p className="eyebrow">AI / LLM settings</p>
      <h1 className="page-title" style={{ fontSize: 28 }}>Your AI provider</h1>
      <p className="lede">
        Save your API key, provider and model in this browser on this device.
        Change them whenever you need — no redeployment required.
        Currently: <strong>{current.maskedKey ?? "no key saved"}</strong> · {current.statusLabel}
      </p>
      <label className="field">
        <span>Provider</span>
        <select value={provider} disabled={busy} onChange={event => {
          const value = event.target.value;
          setProvider(value); setBaseUrl(PROVIDER_PRESETS[value].baseUrl); setModel(PROVIDER_PRESETS[value].model); setMsg(null);
        }}>
          {Object.entries(PROVIDER_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
        </select>
      </label>
      <label className="field"><span>Base URL</span><input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} disabled={busy} /></label>
      <label className="field"><span>Model</span><input value={model} onChange={event => setModel(event.target.value)} disabled={busy} /></label>
      <label className="field">
        <span>API key {current.hasKey ? "(leave blank to keep the key saved on this device)" : ""}</span>
        <input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={current.maskedKey ?? "Paste your API key"} autoComplete="off" disabled={busy} />
        <span className="hint">For your own API URL, choose Custom (OpenAI-compatible) and enter the model it supports.</span>
      </label>
      {msg && <p role="status" className={msg.kind === "ok" ? "form-ok" : "form-error"}>{msg.text}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" onClick={save} disabled={busy}>Save on this device</button>
        <button className="btn" onClick={test} disabled={busy}>{busy ? <><Orb state="connecting" size={20} /> Working…</> : "Test Connection"}</button>
        {current.hasKey && <button className="btn btn-ghost" onClick={remove} disabled={busy}>Remove saved key</button>}
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>
        Your key is stored in this browser’s local storage. It is sent to the server
        only for an AI request and forwarded to your chosen provider; the app does
        not save it on Vercel. Clearing site data removes the key. Other devices
        and browsers need their own settings. The ATS score uses fixed rules.
      </p>
    </div>
  );
}
