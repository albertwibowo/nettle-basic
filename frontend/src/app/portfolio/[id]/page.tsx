"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, apiDelete } from "@/lib/api";
import Link from "next/link";
import {
  ClientFieldDefinition,
  PortfolioClient,
  formatAttributeValue,
  groupDefinitions,
  groupLabel,
} from "@/lib/clientFields";

function Field({
  label,
  value,
  helpText,
}: {
  label: string;
  value: string;
  helpText?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-zinc-200">{value}</dd>
      {helpText ? (
        <p className="text-xs text-zinc-600 mt-0.5">{helpText}</p>
      ) : null}
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<PortfolioClient | null>(null);
  const [definitions, setDefinitions] = useState<ClientFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`/api/portfolio/clients/${id}/`) as Promise<PortfolioClient>,
      apiFetch("/api/portfolio/client-fields/") as Promise<
        ClientFieldDefinition[]
      >,
    ])
      .then(([clientData, fieldData]) => {
        setClient(clientData);
        setDefinitions(fieldData);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load client");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const sections = useMemo(() => {
    const enabled = definitions.filter((d) => d.enabled);
    return groupDefinitions(enabled);
  }, [definitions]);

  if (loading) return <p className="text-zinc-500">Loading...</p>;
  if (error) {
    return (
      <div className="border border-red-800/60 bg-red-950/40 rounded-lg px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    );
  }
  if (!client) return <p className="text-zinc-500">Client not found.</p>;

  const attrs = client.attributes || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/portfolio"
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            ← Portfolio
          </Link>
          <h1 className="text-2xl font-bold mt-1 text-zinc-100">
            {client.name}
          </h1>
        </div>
        <button
          onClick={async () => {
            if (confirm("Delete this client?")) {
              await apiDelete(`/api/portfolio/clients/${id}/`);
              router.push("/portfolio");
            }
          }}
          className="text-red-400 text-sm hover:underline"
        >
          Delete
        </button>
      </div>

      <div className="space-y-6">
        {sections.map(({ group, fields }) => (
          <section
            key={group || "other"}
            className="bg-zinc-900/60 rounded-lg border border-zinc-800 p-6"
          >
            <h2 className="font-semibold mb-4 text-zinc-100">
              {groupLabel(group)}
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fields.map((def) => (
                <Field
                  key={def.key}
                  label={def.label}
                  value={formatAttributeValue(def, attrs[def.key])}
                  helpText={def.help_text || undefined}
                />
              ))}
            </dl>
          </section>
        ))}

        {sections.length === 0 && (
          <p className="text-zinc-500 text-sm">
            No enabled client fields. Configure them under Client Fields.
          </p>
        )}
      </div>
    </div>
  );
}
