import { getBrowserSnapshot } from "./browserDb";

export async function downloadResume(id: string, format: "pdf" | "docx" | "txt"): Promise<void> {
  const data = getBrowserSnapshot();
  const application = data.applications.find(item => item.id === id);
  if (!application) throw new Error("This resume is no longer saved in this browser.");
  const response = await fetch(`/api/applications/${encodeURIComponent(id)}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studioData: { profile: data.profile, applications: [application], projects: [], projectIdeas: [], atsChecks: [] }, format }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? "Could not download your resume.");
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `Resume.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
