"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  ClientFieldDefinition,
  LIST_COLUMN_KEYS,
  PortfolioClient,
  formatAttributeValue,
} from "@/lib/clientFields";

export default function PortfolioPage() {
  const [clients, setClients] = useState<PortfolioClient[]>([]);
  const [definitions, setDefinitions] = useState<ClientFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/portfolio/clients/") as Promise<PortfolioClient[]>,
      apiFetch("/api/portfolio/client-fields/") as Promise<
        ClientFieldDefinition[]
      >,
    ])
      .then(([clientData, fieldData]) => {
        setClients(clientData);
        setDefinitions(fieldData);
      })
      .finally(() => setLoading(false));
  }, []);

  const columns = useMemo(() => {
    const enabled = definitions.filter((d) => d.enabled);
    const byKey = new Map(enabled.map((d) => [d.key, d]));
    const preferred = LIST_COLUMN_KEYS.map((key) => byKey.get(key)).filter(
      (d): d is ClientFieldDefinition => Boolean(d)
    );
    if (preferred.length > 0) return preferred;
    // Fallback: first few enabled fields by group/order.
    return enabled.slice(0, 4);
  }, [definitions]);

  if (loading) return <p className="text-zinc-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Portfolio</h1>
        <Link
          href="/portfolio/new"
          className="bg-zinc-100 text-zinc-900 px-4 py-2 rounded text-sm hover:bg-white"
        >
          Add Client
        </Link>
      </div>
      <div className="bg-zinc-900/60 rounded-lg border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-zinc-500">
              <th className="px-4 py-3 font-medium">Name</th>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const attrs = client.attributes || {};
              return (
                <tr
                  key={client.id}
                  className="border-b border-zinc-800/80 hover:bg-zinc-800/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/portfolio/${client.id}`}
                      className="text-sky-400 hover:underline"
                    >
                      {client.name}
                    </Link>
                  </td>
                  {columns.map((col) => {
                    const raw = attrs[col.key];
                    const display = formatAttributeValue(col, raw);
                    if (col.key === "risk_rating" && raw) {
                      const rating = String(raw);
                      return (
                        <td key={col.key} className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              rating === "high" || rating === "critical"
                                ? "bg-red-950 text-red-400"
                                : rating === "medium"
                                  ? "bg-amber-950 text-amber-400"
                                  : "bg-emerald-950 text-emerald-400"
                            }`}
                          >
                            {display}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className="px-4 py-3 text-zinc-400">
                        {display === "—" ? "—" : display}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {clients.length === 0 && (
          <p className="text-zinc-500 text-center py-8">No clients yet.</p>
        )}
      </div>
    </div>
  );
}
