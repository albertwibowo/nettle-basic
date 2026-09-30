"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiFetch, apiPatch, apiPost } from "@/lib/api";
import {
  ClientFieldDefinition,
  FIELD_TYPES,
  FieldType,
  groupDefinitions,
  groupLabel,
} from "@/lib/clientFields";

interface DraftField {
  key: string;
  label: string;
  field_type: FieldType;
  group: string;
  required: boolean;
  enabled: boolean;
  order: number;
  help_text: string;
  choicesText: string;
}

function emptyDraft(order: number): DraftField {
  return {
    key: "",
    label: "",
    field_type: "text",
    group: "company",
    required: false,
    enabled: true,
    order,
    help_text: "",
    choicesText: "",
  };
}

function parseChoices(text: string): { value: string; label: string }[] | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return lines.map((line) => {
    const sep = line.indexOf("|");
    if (sep === -1) {
      const value = line.toLowerCase().replace(/\s+/g, "_");
      return { value, label: line };
    }
    return {
      value: line.slice(0, sep).trim(),
      label: line.slice(sep + 1).trim() || line.slice(0, sep).trim(),
    };
  });
}

export default function ClientFieldsPage() {
  const [definitions, setDefinitions] = useState<ClientFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    label: string;
    required: boolean;
    enabled: boolean;
    order: number;
    help_text: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<DraftField>(emptyDraft(1));

  const loadDefinitions = useCallback(async () => {
    const data: ClientFieldDefinition[] = await apiFetch(
      "/api/portfolio/client-fields/"
    );
    setDefinitions(data);
    setLoading(false);
    return data;
  }, []);

  useEffect(() => {
    loadDefinitions().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load fields");
      setLoading(false);
    });
  }, [loadDefinitions]);

  const grouped = useMemo(
    () => groupDefinitions(definitions),
    [definitions]
  );

  const startEdit = (def: ClientFieldDefinition) => {
    setCreating(false);
    setEditingId(def.id);
    setEditDraft({
      label: def.label,
      required: def.required,
      enabled: def.enabled,
      order: def.order,
      help_text: def.help_text || "",
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editDraft) return;
    if (!editDraft.label.trim()) {
      setError("Label is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated: ClientFieldDefinition = await apiPatch(
        `/api/portfolio/client-fields/${editingId}/`,
        {
          label: editDraft.label.trim(),
          required: editDraft.required,
          enabled: editDraft.enabled,
          order: editDraft.order,
          help_text: editDraft.help_text.trim(),
        }
      );
      setDefinitions((prev) =>
        prev
          .map((d) => (d.id === updated.id ? updated : d))
          .sort(
            (a, b) =>
              a.group.localeCompare(b.group) ||
              a.order - b.order ||
              a.key.localeCompare(b.key)
          )
      );
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save field");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (def: ClientFieldDefinition) => {
    setSaving(true);
    setError(null);
    try {
      const updated: ClientFieldDefinition = await apiPatch(
        `/api/portfolio/client-fields/${def.id}/`,
        { enabled: !def.enabled }
      );
      setDefinitions((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
      );
      if (editingId === def.id && editDraft) {
        setEditDraft({ ...editDraft, enabled: updated.enabled });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update field");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setError(null);
    if (!createDraft.key.trim()) {
      setError("Key is required (e.g. custom_score).");
      return;
    }
    if (!/^[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$/.test(createDraft.key.trim())) {
      setError("Key must be a slug (letters, numbers, hyphens or underscores).");
      return;
    }
    if (!createDraft.label.trim()) {
      setError("Label is required.");
      return;
    }
    if (createDraft.field_type === "choice") {
      const choices = parseChoices(createDraft.choicesText);
      if (!choices) {
        setError("Choice fields need at least one option (one per line).");
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        key: createDraft.key.trim(),
        label: createDraft.label.trim(),
        field_type: createDraft.field_type,
        group: createDraft.group.trim(),
        required: createDraft.required,
        enabled: createDraft.enabled,
        order: createDraft.order,
        help_text: createDraft.help_text.trim(),
      };
      if (createDraft.field_type === "choice") {
        payload.choices = parseChoices(createDraft.choicesText);
      } else {
        payload.choices = null;
      }

      await apiPost("/api/portfolio/client-fields/", payload);
      await loadDefinitions();
      setCreating(false);
      setCreateDraft(emptyDraft(definitions.length + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create field");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (def: ClientFieldDefinition) => {
    if (
      !confirm(
        `Remove field "${def.label}" (${def.key})? Existing client attribute values for this key are kept but will no longer appear in forms.`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiDelete(`/api/portfolio/client-fields/${def.id}/`);
      setDefinitions((prev) => prev.filter((d) => d.id !== def.id));
      if (editingId === def.id) cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete field");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-zinc-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Client Fields</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Customise which attributes appear on portfolio clients. Disable
            fields you do not need (e.g. insurance) or add your own.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            cancelEdit();
            const maxOrder = definitions.reduce(
              (m, d) => Math.max(m, d.order),
              0
            );
            setCreateDraft(emptyDraft(maxOrder + 1));
            setError(null);
          }}
          className="shrink-0 text-sm px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded hover:bg-white"
        >
          Add field
        </button>
      </div>

      {error && (
        <div className="mb-4 border border-red-800/60 bg-red-950/40 rounded-lg px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {creating && (
        <div className="mb-6 border border-zinc-800 rounded-lg bg-zinc-900/60 p-5 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            New custom field
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Key (immutable)
              </label>
              <input
                type="text"
                value={createDraft.key}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, key: e.target.value }))
                }
                placeholder="e.g. safety_score"
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Label</label>
              <input
                type="text"
                value={createDraft.label}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, label: e.target.value }))
                }
                placeholder="Safety Score"
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Type</label>
              <select
                value={createDraft.field_type}
                onChange={(e) =>
                  setCreateDraft((d) => ({
                    ...d,
                    field_type: e.target.value as FieldType,
                  }))
                }
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Group</label>
              <input
                type="text"
                value={createDraft.group}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, group: e.target.value }))
                }
                placeholder="company"
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Order</label>
              <input
                type="number"
                min={0}
                value={createDraft.order}
                onChange={(e) =>
                  setCreateDraft((d) => ({
                    ...d,
                    order: Number(e.target.value) || 0,
                  }))
                }
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={createDraft.required}
                  onChange={(e) =>
                    setCreateDraft((d) => ({
                      ...d,
                      required: e.target.checked,
                    }))
                  }
                  className="rounded border-zinc-600"
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={createDraft.enabled}
                  onChange={(e) =>
                    setCreateDraft((d) => ({
                      ...d,
                      enabled: e.target.checked,
                    }))
                  }
                  className="rounded border-zinc-600"
                />
                Enabled
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">
                Help text
              </label>
              <input
                type="text"
                value={createDraft.help_text}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, help_text: e.target.value }))
                }
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            {createDraft.field_type === "choice" && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">
                  Choices (one per line; optional{" "}
                  <code className="text-zinc-400">value|Label</code>)
                </label>
                <textarea
                  value={createDraft.choicesText}
                  onChange={(e) =>
                    setCreateDraft((d) => ({
                      ...d,
                      choicesText: e.target.value,
                    }))
                  }
                  rows={4}
                  placeholder={"low|Low\nmedium|Medium"}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 font-mono"
                />
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="text-sm px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded hover:bg-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create field"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setError(null);
              }}
              className="text-sm px-3 py-1.5 text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(({ group, fields }) => (
          <section
            key={group || "other"}
            className="border border-zinc-800 rounded-lg bg-zinc-900/60 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">
                {groupLabel(group)}
              </h2>
              <span className="text-xs text-zinc-500">
                {fields.filter((f) => f.enabled).length}/{fields.length} enabled
              </span>
            </div>
            <ul className="divide-y divide-zinc-800/80">
              {fields.map((def) => {
                const isEditing = editingId === def.id && editDraft;
                return (
                  <li key={def.id} className="px-4 py-3">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <code className="text-zinc-400">{def.key}</code>
                          <span>·</span>
                          <span>{def.field_type}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">
                              Label
                            </label>
                            <input
                              type="text"
                              value={editDraft.label}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  label: e.target.value,
                                })
                              }
                              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">
                              Order
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={editDraft.order}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  order: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-zinc-500 mb-1">
                              Help text
                            </label>
                            <input
                              type="text"
                              value={editDraft.help_text}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  help_text: e.target.value,
                                })
                              }
                              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
                            />
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-zinc-300">
                              <input
                                type="checkbox"
                                checked={editDraft.required}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    required: e.target.checked,
                                  })
                                }
                                className="rounded border-zinc-600"
                              />
                              Required
                            </label>
                            <label className="flex items-center gap-2 text-sm text-zinc-300">
                              <input
                                type="checkbox"
                                checked={editDraft.enabled}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    enabled: e.target.checked,
                                  })
                                }
                                className="rounded border-zinc-600"
                              />
                              Enabled
                            </label>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="text-sm px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded hover:bg-white disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-sm px-3 py-1.5 text-zinc-500 hover:text-zinc-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-medium text-sm ${
                                def.enabled
                                  ? "text-zinc-100"
                                  : "text-zinc-500 line-through"
                              }`}
                            >
                              {def.label}
                            </span>
                            {def.required && (
                              <span className="text-[10px] uppercase tracking-wide text-amber-500/80">
                                required
                              </span>
                            )}
                            {!def.enabled && (
                              <span className="text-[10px] uppercase tracking-wide text-zinc-600">
                                disabled
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            <code className="text-zinc-600">{def.key}</code>
                            {" · "}
                            {def.field_type}
                            {" · "}
                            order {def.order}
                            {def.help_text ? ` · ${def.help_text}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleEnabled(def)}
                            disabled={saving}
                            className={`text-xs px-2.5 py-1 rounded border disabled:opacity-50 ${
                              def.enabled
                                ? "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                                : "border-emerald-900/60 text-emerald-400 hover:border-emerald-700"
                            }`}
                          >
                            {def.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(def)}
                            className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(def)}
                            disabled={saving}
                            className="text-xs px-2.5 py-1 text-zinc-600 hover:text-red-400 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {definitions.length === 0 && !creating && (
          <p className="text-zinc-500 text-center py-8">
            No field definitions yet. Add a field or run the seed command.
          </p>
        )}
      </div>
    </div>
  );
}
