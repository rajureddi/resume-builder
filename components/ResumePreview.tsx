"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CONTACT_ICONS } from "@/lib/contactIcons";
import type { Application, ResumeLayout } from "@/lib/types";

function Pages({ layout }: { layout: ResumeLayout }) {
  return <>{layout.pages.map((page, pageIndex) => (
    <svg key={pageIndex} className="resume-page" viewBox={`0 0 ${layout.width} ${layout.height}`} xmlns="http://www.w3.org/2000/svg" role="document" aria-label={`Resume page ${pageIndex + 1} of ${layout.pages.length}`}>
      <rect width={layout.width} height={layout.height} fill="white" />
      {page.items.map((item, index) => item.kind === "text" ? (
        <a key={index} href={item.href && /^(https?:|mailto:|tel:)/i.test(item.href) ? item.href : undefined}><text xmlSpace="preserve" x={item.x} y={item.y} fontFamily={layout.fontFamily} fontSize={item.size} fontWeight={item.bold ? 700 : 400} fontStyle={item.italic ? "italic" : "normal"} fill={item.color} textLength={item.width || undefined} lengthAdjust="spacingAndGlyphs">{item.text}</text></a>
      ) : item.kind === "icon" ? <g key={index} transform={`translate(${item.x} ${item.y}) scale(${item.size / 24})`} aria-hidden="true">{CONTACT_ICONS[item.icon].map((path, i) => <path key={i} d={path} fill="none" stroke={item.color} strokeWidth={1.5} />)}</g> : <line key={index} x1={item.x} y1={item.y} x2={item.x + item.width} y2={item.y} stroke={item.color} strokeWidth={0.6} />)}
    </svg>
  ))}</>;
}

export default function ResumePreview({ app, onReady }: { app: Application; onReady: (ready: boolean) => void }) {
  const [layout, setLayout] = useState<ResumeLayout | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLayout(null);
    setError("");
    onReady(false);
    fetch(`/api/applications/${app.id}/layout`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load the resume preview.");
        if (!controller.signal.aborted) { setLayout(data.layout); onReady(true); }
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the resume preview."); });
    return () => controller.abort();
  }, [app, retry, onReady]);

  if (error) return <div className="form-warn">{error} <button className="btn" onClick={() => setRetry(value => value + 1)}>Retry preview</button></div>;
  if (!layout) return <p role="status" className="small muted">Preparing the PDF layout…</p>;
  return <>
    <div className="resume-preview-meta">
      <strong>{layout.pages.length} {layout.pages.length === 1 ? "page" : "pages"} · A4</strong>
      <span>PDF and print match this preview.</span>
    </div>
    <div className="resume-pages"><Pages layout={layout} /></div>
    {createPortal(<div className="print-resume"><Pages layout={layout} /></div>, document.body)}
  </>;
}
