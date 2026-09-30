"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface Answer {
  id: string;
  content: string;
  status: string;
}

interface Question {
  id: string;
  prompt: string;
  guidance: string;
  order: number;
  answer: Answer | null;
}

interface Section {
  id: string;
  title: string;
  instructions: string;
  order: number;
  questions: Question[];
}

interface Report {
  id: string;
  assessment: string;
  assessment_title: string;
  template_version: string | null;
  title: string;
  content: string;
  status: string;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

function statusClass(status: string) {
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

export default function ReportDetailPage() {
  const { id } = useParams();
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    apiFetch(`/api/reports/${id}/`).then(setReport);
  }, [id]);

  if (!report) return <p className="text-zinc-500">Loading...</p>;

  const hasStructured =
    report.sections && report.sections.length > 0;

  return (
    <div>
      <Link
        href="/reports"
        className="text-sm text-zinc-500 hover:text-zinc-300"
      >
        ← Reports
      </Link>
      <h1 className="text-2xl font-bold mt-1 mb-1 text-zinc-100">
        {report.title || "Untitled Report"}
      </h1>
      <p className="text-zinc-500 text-sm mb-6">
        {report.assessment_title} · Generated{" "}
        {new Date(report.created_at).toLocaleDateString()} ·{" "}
        <span className={statusClass(report.status)}>{report.status}</span>
      </p>

      {report.status === "completed" && hasStructured ? (
        <div className="space-y-8">
          {report.sections.map((section) => (
            <section
              key={section.id}
              className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-6"
            >
              <h2 className="text-lg font-semibold text-zinc-100 mb-1">
                {section.title}
              </h2>
              {section.instructions && (
                <p className="text-xs text-zinc-500 mb-4">
                  {section.instructions}
                </p>
              )}
              <div className="space-y-5">
                {section.questions.map((question) => (
                  <div key={question.id}>
                    <h3 className="text-sm font-medium text-zinc-300 mb-2">
                      {question.prompt}
                    </h3>
                    {question.answer?.status === "completed" &&
                    question.answer.content ? (
                      <div className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                        {question.answer.content}
                      </div>
                    ) : question.answer?.status === "failed" ? (
                      <p className="text-sm text-red-400">
                        Answer generation failed for this question.
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-500 italic">
                        No answer
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : report.status === "completed" && report.content ? (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-8">
          <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-zinc-200">
            {report.content}
          </div>
        </div>
      ) : report.status === "generating" ? (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-6 text-center">
          <p className="text-amber-200">
            This report is currently being generated. Please keep this tab
            open...
          </p>
        </div>
      ) : report.status === "failed" ? (
        <div className="bg-red-950/40 border border-red-800/60 rounded-lg p-6 text-center">
          <p className="text-red-300">
            Report generation failed. Please try again from the assessment page.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
          <p className="text-zinc-500">
            Report is pending. Generate it from the assessment page.
          </p>
        </div>
      )}
    </div>
  );
}
