"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiPost, apiUpload } from "@/lib/api";

interface Assessment {
  id: string;
  title: string;
  client: string;
  client_name: string;
  status: string;
  site_address: string;
  assessor_name: string;
  assessment_date: string | null;
  notes: string;
}

interface EvidenceItem {
  id: string;
  evidence_type: string;
  title: string;
  description: string;
  text_content: string;
  file: string | null;
  created_at: string;
}

interface Report {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

interface TemplateOption {
  id: string;
  name: string;
  client: string | null;
  client_name: string | null;
  is_default: boolean;
  version_count?: number;
}

interface VersionOption {
  id: string;
  version_number: number;
  section_count: number;
}

const REPORT_POLL_MS = 2000;

function reportStatusClass(status: string) {
  switch (status) {
    case "completed":
      return "text-emerald-400";
    case "generating":
      return "text-amber-400";
    case "failed":
      return "text-red-400";
    default:
      return "text-zinc-500";
  }
}

export default function AssessmentDetailPage() {
  const { id } = useParams();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refreshReports = () =>
    apiFetch(`/api/reports/?assessment=${id}`).then(setReports);

  useEffect(() => {
    apiFetch(`/api/assessments/${id}/`).then((data: Assessment) => {
      setAssessment(data);
      apiFetch(`/api/report-templates/?for_client=${data.client}`).then(
        (tpls: TemplateOption[]) => {
          setTemplates(tpls);
          // Prefer a portfolio template with versions, else the global default.
          const preferred =
            tpls.find((t) => t.client && (t.version_count ?? 0) > 0) ||
            tpls.find((t) => t.is_default && (t.version_count ?? 0) > 0) ||
            tpls.find((t) => (t.version_count ?? 0) > 0) ||
            tpls[0];
          if (preferred) setSelectedTemplateId(preferred.id);
        }
      );
    });
    apiFetch(`/api/evidence/?assessment=${id}`).then(setEvidence);
    refreshReports();
  }, [id]);

  // Poll while any report is generating
  const hasGenerating = reports.some((r) => r.status === "generating");
  useEffect(() => {
    if (!hasGenerating) return;
    const timer = setInterval(() => {
      refreshReports();
    }, REPORT_POLL_MS);
    return () => clearInterval(timer);
  }, [id, hasGenerating]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setVersions([]);
      setSelectedVersionId("");
      return;
    }
    apiFetch(`/api/report-templates/${selectedTemplateId}/versions/`).then(
      (data: VersionOption[]) => {
        setVersions(data);
        setSelectedVersionId(data[0]?.id ?? "");
      }
    );
  }, [selectedTemplateId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("assessment", id as string);
    formData.append("title", file.name);
    formData.append(
      "evidence_type",
      file.type.startsWith("image/") ? "image" : "document"
    );

    await apiUpload("/api/evidence/", formData);
    apiFetch(`/api/evidence/?assessment=${id}`).then(setEvidence);
    e.target.value = "";
  };

  const handleAddNote = async () => {
    const text = prompt("Enter observation note:");
    if (!text) return;

    await apiPost("/api/evidence/", {
      assessment: id,
      evidence_type: "note",
      title: "Field observation",
      text_content: text,
    });
    apiFetch(`/api/evidence/?assessment=${id}`).then(setEvidence);
  };

  const handleGenerate = async () => {
    if (!selectedTemplateId) {
      alert("Select a report template before generating.");
      return;
    }
    if (!selectedVersionId) {
      alert("Selected template has no versions. Create a version first.");
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const report = await apiPost("/api/reports/", {
        assessment: id,
        title: "",
        status: "pending",
        template_version: selectedVersionId,
      });

      // 202 Accepted — generation runs in the background via Celery
      await apiPost(`/api/reports/${report.id}/generate/`, {
        template: selectedTemplateId,
        template_version: selectedVersionId,
      });

      setStatusMessage(
        "Generation started. You’ll be notified when it’s ready."
      );
      await refreshReports();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Generation failed: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!assessment) return <p className="text-zinc-500">Loading...</p>;

  const canGenerate =
    !submitting &&
    !hasGenerating &&
    evidence.length > 0 &&
    Boolean(selectedTemplateId) &&
    Boolean(selectedVersionId);

  return (
    <div>
      <Link
        href="/assessments"
        className="text-sm text-zinc-500 hover:text-zinc-300"
      >
        ← Assessments
      </Link>
      <h1 className="text-2xl font-bold mt-1 mb-1 text-zinc-100">
        {assessment.title}
      </h1>
      <p className="text-zinc-500 text-sm mb-6">
        {assessment.client_name} · {assessment.site_address || "No address"} ·{" "}
        {assessment.assessment_date || "No date"}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evidence panel */}
        <section className="bg-zinc-900/60 rounded-lg border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-zinc-100">
              Evidence ({evidence.length})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleAddNote}
                className="text-sm px-3 py-1.5 border border-zinc-700 rounded text-zinc-300 hover:border-zinc-500"
              >
                + Note
              </button>
              <label className="text-sm px-3 py-1.5 border border-zinc-700 rounded text-zinc-300 hover:border-zinc-500 cursor-pointer">
                + Upload
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept="image/*,.pdf,.doc,.docx,.txt"
                />
              </label>
            </div>
          </div>
          <div className="space-y-2">
            {evidence.map((e) => (
              <div
                key={e.id}
                className="p-3 rounded border border-zinc-800 bg-zinc-950/50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-zinc-500 uppercase">
                    {e.evidence_type}
                  </span>
                  <span className="text-sm font-medium text-zinc-200">
                    {e.title}
                  </span>
                </div>
                {e.text_content && (
                  <p className="text-xs text-zinc-400 line-clamp-2">
                    {e.text_content}
                  </p>
                )}
                {e.file && (
                  <p className="text-xs text-sky-400">
                    {e.file.split("/").pop()}
                  </p>
                )}
              </div>
            ))}
            {evidence.length === 0 && (
              <p className="text-zinc-500 text-sm text-center py-4">
                No evidence yet. Upload files or add notes.
              </p>
            )}
          </div>
        </section>

        {/* Reports panel */}
        <section className="bg-zinc-900/60 rounded-lg border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-zinc-100">Reports</h2>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="text-sm px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting || hasGenerating
                ? "Generating..."
                : "Generate Report"}
            </button>
          </div>

          <div className="mb-4 space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                disabled={submitting || hasGenerating || templates.length === 0}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
              >
                {templates.length === 0 && (
                  <option value="">No templates available</option>
                )}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default
                      ? " (default)"
                      : t.client_name
                        ? ` · ${t.client_name}`
                        : ""}
                    {(t.version_count ?? 0) === 0 ? " — no versions" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Version
              </label>
              <select
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                disabled={submitting || hasGenerating || versions.length === 0}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
              >
                {versions.length === 0 && (
                  <option value="">No versions for this template</option>
                )}
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version_number} · {v.section_count} sections
                  </option>
                ))}
              </select>
            </div>
            {templates.length === 0 && (
              <p className="text-xs text-zinc-500">
                No templates available. Create one for {assessment.client_name}{" "}
                or seed the global default.
              </p>
            )}
          </div>

          {statusMessage && (
            <div className="mb-4 px-3 py-2 rounded border border-sky-800/60 bg-sky-950/40 text-sm text-sky-200">
              {statusMessage}
            </div>
          )}

          <div className="space-y-2">
            {reports.length === 0 && (
              <p className="text-zinc-500 text-sm text-center py-4">
                No reports yet.
              </p>
            )}
            {reports.map((r) => (
              <Link
                key={r.id}
                href={`/reports/${r.id}`}
                className="block p-3 rounded border border-zinc-800 bg-zinc-950/50 hover:bg-zinc-800/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-zinc-200">
                    {r.title || "Untitled report"}
                  </div>
                  <span
                    className={`text-xs capitalize ${reportStatusClass(r.status)}`}
                  >
                    {r.status}
                    {r.status === "generating" && (
                      <span className="animate-pulse"> …</span>
                    )}
                  </span>
                </div>
                <div className="text-xs text-zinc-500">
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
