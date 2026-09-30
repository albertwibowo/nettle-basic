"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiFetch, apiPost } from "@/lib/api";

interface Client {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  client: string | null;
  client_name: string | null;
  is_default: boolean;
  version_count?: number;
  created_at: string;
}

interface VersionSummary {
  id: string;
  template: string;
  version_number: number;
  section_count: number;
  created_at: string;
}

interface Question {
  id?: string;
  prompt: string;
  guidance: string;
  order: number;
}

interface Section {
  id?: string;
  title: string;
  instructions: string;
  order: number;
  questions: Question[];
}

interface VersionDetail {
  id: string;
  template: string;
  version_number: number;
  sections: Section[];
  created_at: string;
}

function emptySection(order: number): Section {
  return {
    title: "",
    instructions: "",
    order,
    questions: [{ prompt: "", guidance: "", order: 1 }],
  };
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionDetail, setVersionDetail] = useState<VersionDetail | null>(
    null
  );
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftClientId, setDraftClientId] = useState("");
  const [draftSections, setDraftSections] = useState<Section[]>([
    emptySection(1),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTemplates = useCallback(async () => {
    const data: Template[] = await apiFetch("/api/report-templates/");
    setTemplates(data);
    setLoading(false);
    return data;
  }, []);

  useEffect(() => {
    loadTemplates().then((data) => {
      setSelectedId((current) => current ?? (data[0]?.id ?? null));
    });
    apiFetch("/api/portfolio/clients/").then(setClients);
  }, [loadTemplates]);

  useEffect(() => {
    if (!selectedId) {
      setVersions([]);
      setVersionDetail(null);
      return;
    }
    setError(null);
    setCreatingVersion(false);
    setCreatingTemplate(false);
    setVersionDetail(null);
    apiFetch(`/api/report-templates/${selectedId}/versions/`).then(
      (data: VersionSummary[]) => {
        setVersions(data);
        if (data.length > 0) {
          loadVersionDetail(selectedId, data[0].id);
        }
      }
    );
  }, [selectedId]);

  const loadVersionDetail = (templateId: string, versionId: string) => {
    apiFetch(
      `/api/report-templates/${templateId}/versions/${versionId}/`
    ).then(setVersionDetail);
  };

  const selected = templates.find((t) => t.id === selectedId) || null;
  const canDeleteTemplate = Boolean(selected?.client);

  const updateSection = (index: number, patch: Partial<Section>) => {
    setDraftSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  };

  const updateQuestion = (
    sectionIndex: number,
    questionIndex: number,
    patch: Partial<Question>
  ) => {
    setDraftSections((prev) =>
      prev.map((s, i) => {
        if (i !== sectionIndex) return s;
        return {
          ...s,
          questions: s.questions.map((q, qi) =>
            qi === questionIndex ? { ...q, ...patch } : q
          ),
        };
      })
    );
  };

  const resetTemplateDraft = () => {
    setDraftName("");
    setDraftDescription("");
    setDraftClientId(clients[0]?.id ?? "");
  };

  const handleCreateTemplate = async () => {
    setError(null);
    if (!draftName.trim()) {
      setError("Template name is required.");
      return;
    }
    if (!draftClientId) {
      setError("Select a portfolio company for this template.");
      return;
    }

    setSaving(true);
    try {
      const created: Template = await apiPost("/api/report-templates/", {
        name: draftName.trim(),
        description: draftDescription.trim(),
        client: draftClientId,
        is_default: false,
      });
      const refreshed = await loadTemplates();
      setCreatingTemplate(false);
      resetTemplateDraft();
      setSelectedId(created.id);
      // Prefer the freshly created row if list is briefly stale.
      if (!refreshed.find((t) => t.id === created.id)) {
        setTemplates((prev) => [...prev, created]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selected || !canDeleteTemplate) return;
    if (
      !confirm(
        `Delete template "${selected.name}" and all of its versions? This cannot be undone.`
      )
    ) {
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await apiDelete(`/api/report-templates/${selected.id}/`);
      const remaining = await loadTemplates();
      setSelectedId(remaining[0]?.id ?? null);
      setVersions([]);
      setVersionDetail(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete template");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVersion = async (version: VersionSummary) => {
    if (!selectedId) return;
    if (
      !confirm(
        `Delete version v${version.version_number}? Reports pinned to it will lose their template pin.`
      )
    ) {
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await apiDelete(
        `/api/report-templates/${selectedId}/versions/${version.id}/`
      );
      const refreshed: VersionSummary[] = await apiFetch(
        `/api/report-templates/${selectedId}/versions/`
      );
      setVersions(refreshed);
      setCreatingVersion(false);
      if (refreshed.length > 0) {
        loadVersionDetail(selectedId, refreshed[0].id);
      } else {
        setVersionDetail(null);
      }
      loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete version");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!selectedId) return;
    setError(null);

    for (const section of draftSections) {
      if (!section.title.trim()) {
        setError("Each section needs a title.");
        return;
      }
      if (!section.questions.some((q) => q.prompt.trim())) {
        setError(`Section "${section.title}" needs at least one question.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        sections: draftSections.map((s, si) => ({
          title: s.title.trim(),
          instructions: s.instructions.trim(),
          order: s.order || si + 1,
          questions: s.questions
            .filter((q) => q.prompt.trim())
            .map((q, qi) => ({
              prompt: q.prompt.trim(),
              guidance: q.guidance.trim(),
              order: q.order || qi + 1,
            })),
        })),
      };
      const created: VersionDetail = await apiPost(
        `/api/report-templates/${selectedId}/versions/`,
        payload
      );
      setCreatingVersion(false);
      setDraftSections([emptySection(1)]);
      const refreshed: VersionSummary[] = await apiFetch(
        `/api/report-templates/${selectedId}/versions/`
      );
      setVersions(refreshed);
      setVersionDetail(created);
      loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create version");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-zinc-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 text-zinc-100">Report Templates</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Templates are versioned. Structure is immutable after create — submit a
        new version to change sections or questions. Portfolio companies may
        have many templates.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template list */}
        <aside className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-300">Templates</h2>
            <button
              type="button"
              onClick={() => {
                setCreatingTemplate(true);
                setCreatingVersion(false);
                setVersionDetail(null);
                setSelectedId(null);
                resetTemplateDraft();
                setError(null);
              }}
              className="text-xs px-2.5 py-1 bg-zinc-100 text-zinc-900 rounded hover:bg-white"
            >
              New template
            </button>
          </div>
          <ul className="space-y-1">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingTemplate(false);
                    setSelectedId(t.id);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    !creatingTemplate && selectedId === t.id
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                  }`}
                >
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {t.is_default
                      ? "Default"
                      : t.client_name || "Unassigned"}
                    {" · "}
                    {t.version_count ?? 0} version
                    {(t.version_count ?? 0) === 1 ? "" : "s"}
                  </div>
                </button>
              </li>
            ))}
            {templates.length === 0 && (
              <li className="text-zinc-500 text-sm px-3 py-4">
                No templates yet. Create one for a portfolio company.
              </li>
            )}
          </ul>
        </aside>

        {/* Detail / versions */}
        <div className="lg:col-span-2 space-y-4">
          {error && (
            <div className="border border-red-800/60 bg-red-950/40 rounded-lg px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {creatingTemplate ? (
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-5 space-y-4">
              <h2 className="text-lg font-semibold text-zinc-100">
                New portfolio template
              </h2>
              <p className="text-sm text-zinc-500">
                Attach this template to an existing portfolio company. You can
                add versions after it is created.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Portfolio company
                  </label>
                  <select
                    value={draftClientId}
                    onChange={(e) => setDraftClientId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="">Select a company...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="e.g. Manufacturing risk template"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Description
                  </label>
                  <textarea
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional notes about when to use this template"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCreateTemplate}
                  disabled={saving || clients.length === 0}
                  className="text-sm px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded hover:bg-white disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create template"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingTemplate(false);
                    setError(null);
                    setSelectedId(templates[0]?.id ?? null);
                  }}
                  className="text-sm px-3 py-1.5 text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
              {clients.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Add a portfolio company before creating a template.
                </p>
              )}
            </div>
          ) : selected ? (
            <>
              <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">
                      {selected.name}
                    </h2>
                    {selected.description && (
                      <p className="text-sm text-zinc-500 mt-1">
                        {selected.description}
                      </p>
                    )}
                    <p className="text-xs text-zinc-500 mt-2">
                      {selected.is_default
                        ? "Global default"
                        : selected.client_name
                          ? `Portfolio: ${selected.client_name}`
                          : "No portfolio assigned"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {canDeleteTemplate && (
                      <button
                        type="button"
                        onClick={handleDeleteTemplate}
                        disabled={saving}
                        className="text-sm px-3 py-1.5 border border-red-900/60 text-red-400 rounded hover:border-red-700 hover:text-red-300 disabled:opacity-50"
                      >
                        Delete template
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingVersion(true);
                        setVersionDetail(null);
                        setDraftSections([emptySection(1)]);
                        setError(null);
                      }}
                      className="text-sm px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded hover:bg-white"
                    >
                      New version
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingVersion(false);
                          loadVersionDetail(selected.id, v.id);
                        }}
                        className={`text-xs px-2.5 py-1 rounded border ${
                          !creatingVersion && versionDetail?.id === v.id
                            ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                        }`}
                      >
                        v{v.version_number} · {v.section_count} sections
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteVersion(v)}
                        disabled={saving}
                        title={`Delete v${v.version_number}`}
                        className="text-xs px-1.5 py-1 text-zinc-600 hover:text-red-400 disabled:opacity-50"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {versions.length === 0 && !creatingVersion && (
                    <p className="text-sm text-zinc-500">No versions yet.</p>
                  )}
                </div>
              </div>

              {creatingVersion ? (
                <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-5 space-y-6">
                  <h3 className="font-semibold text-zinc-100">
                    Create new version
                  </h3>

                  {draftSections.map((section, si) => (
                    <div
                      key={si}
                      className="border border-zinc-800 rounded p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wide text-zinc-500">
                          Section {si + 1}
                        </span>
                        {draftSections.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraftSections((prev) =>
                                prev.filter((_, i) => i !== si)
                              )
                            }
                            className="text-xs text-zinc-500 hover:text-red-400"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Section title"
                        value={section.title}
                        onChange={(e) =>
                          updateSection(si, { title: e.target.value })
                        }
                        className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                      />
                      <textarea
                        placeholder="Instructions (AI guidance)"
                        value={section.instructions}
                        onChange={(e) =>
                          updateSection(si, { instructions: e.target.value })
                        }
                        rows={2}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                      />
                      <div className="space-y-2 pl-2 border-l border-zinc-800">
                        {section.questions.map((q, qi) => (
                          <div key={qi} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">
                                Question {qi + 1}
                              </span>
                              {section.questions.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSection(si, {
                                      questions: section.questions.filter(
                                        (_, i) => i !== qi
                                      ),
                                    })
                                  }
                                  className="text-xs text-zinc-500 hover:text-red-400"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="Question prompt"
                              value={q.prompt}
                              onChange={(e) =>
                                updateQuestion(si, qi, {
                                  prompt: e.target.value,
                                })
                              }
                              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                            />
                            <input
                              type="text"
                              placeholder="Guidance (optional)"
                              value={q.guidance}
                              onChange={(e) =>
                                updateQuestion(si, qi, {
                                  guidance: e.target.value,
                                })
                              }
                              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            updateSection(si, {
                              questions: [
                                ...section.questions,
                                {
                                  prompt: "",
                                  guidance: "",
                                  order: section.questions.length + 1,
                                },
                              ],
                            })
                          }
                          className="text-xs text-zinc-400 hover:text-zinc-200"
                        >
                          + Add question
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSections((prev) => [
                          ...prev,
                          emptySection(prev.length + 1),
                        ])
                      }
                      className="text-sm px-3 py-1.5 border border-zinc-700 rounded text-zinc-300 hover:border-zinc-500"
                    >
                      + Add section
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateVersion}
                      disabled={saving}
                      className="text-sm px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded hover:bg-white disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Create version"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingVersion(false);
                        setError(null);
                      }}
                      className="text-sm px-3 py-1.5 text-zinc-500 hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : versionDetail ? (
                <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-5 space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-zinc-100">
                      Version {versionDetail.version_number}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteVersion({
                          id: versionDetail.id,
                          template: versionDetail.template,
                          version_number: versionDetail.version_number,
                          section_count: versionDetail.sections.length,
                          created_at: versionDetail.created_at,
                        })
                      }
                      disabled={saving}
                      className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      Delete version
                    </button>
                  </div>
                  {versionDetail.sections.map((section) => (
                    <div key={section.id}>
                      <h4 className="text-sm font-medium text-zinc-200">
                        {section.title}
                      </h4>
                      {section.instructions && (
                        <p className="text-xs text-zinc-500 mt-0.5 mb-2">
                          {section.instructions}
                        </p>
                      )}
                      <ul className="mt-1 space-y-1 pl-4 list-disc text-sm text-zinc-400">
                        {section.questions.map((q) => (
                          <li key={q.id}>
                            {q.prompt}
                            {q.guidance ? (
                              <span className="text-zinc-600">
                                {" "}
                                — {q.guidance}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-zinc-500 text-sm">Select a template.</p>
          )}
        </div>
      </div>
    </div>
  );
}
