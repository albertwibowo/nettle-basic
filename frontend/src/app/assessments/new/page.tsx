"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiPost } from "@/lib/api";

interface Client {
  id: string;
  name: string;
}

export default function NewAssessmentPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState({
    title: "",
    client: "",
    site_address: "",
    assessor_name: "",
    assessment_date: "",
  });

  useEffect(() => {
    apiFetch("/api/portfolio/clients/").then(setClients);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await apiPost("/api/assessments/", {
      ...form,
      assessment_date: form.assessment_date || null,
    });
    router.push(`/assessments/${result.id}`);
  };

  return (
    <div className="max-w-xl">
      <Link
        href="/assessments"
        className="text-sm text-zinc-500 hover:text-zinc-300"
      >
        ← Assessments
      </Link>
      <h1 className="text-2xl font-bold mt-1 mb-6 text-zinc-100">
        New Assessment
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-zinc-300">
            Title
          </label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-zinc-300">
            Client
          </label>
          <select
            required
            value={form.client}
            onChange={(e) => setForm({ ...form, client: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">Select a client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-zinc-300">
            Site Address
          </label>
          <input
            type="text"
            value={form.site_address}
            onChange={(e) => setForm({ ...form, site_address: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-zinc-300">
            Assessor Name
          </label>
          <input
            type="text"
            value={form.assessor_name}
            onChange={(e) =>
              setForm({ ...form, assessor_name: e.target.value })
            }
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-zinc-300">
            Date
          </label>
          <input
            type="date"
            value={form.assessment_date}
            onChange={(e) =>
              setForm({ ...form, assessment_date: e.target.value })
            }
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
          />
        </div>
        <button
          type="submit"
          className="bg-zinc-100 text-zinc-900 px-4 py-2 rounded text-sm hover:bg-white"
        >
          Create Assessment
        </button>
      </form>
    </div>
  );
}
