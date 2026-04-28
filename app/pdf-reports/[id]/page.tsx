"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { ScoreBar } from "@/components/ScoreBar";
import { PdfPreview } from "@/components/PdfPreview";
import { useApp } from "@/lib/store";
import type {
  PdfFinding,
  PdfFindingSource,
  PdfRuleStatus,
} from "@/lib/types";

type Filter = "all" | "failed" | "needs-check" | "passed" | "resolved";

export default function PdfReportPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const {
    isAuthed,
    hydrated,
    pdfReviews,
    togglePdfFindingResolved,
    deletePdfReview,
    pushToast,
  } = useApp();

  const [filter, setFilter] = useState<Filter>("failed");

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/");
  }, [hydrated, isAuthed, router]);

  const review = pdfReviews.find((r) => r.id === params.id);

  const counts = useMemo(() => {
    const c = {
      all: 0,
      failed: 0,
      "needs-check": 0,
      passed: 0,
      resolved: 0,
      "not-applicable": 0,
    };
    if (!review) return c;
    c.all = review.findings.length;
    for (const f of review.findings) {
      if (f.resolved) c.resolved++;
      else c[f.status]++;
    }
    return c;
  }, [review]);

  const filtered = useMemo(() => {
    if (!review) return [] as PdfFinding[];
    return review.findings
      .filter((f) => {
        if (filter === "all") return true;
        if (filter === "resolved") return f.resolved;
        return !f.resolved && f.status === filter;
      })
      .slice()
      .sort((a, b) => {
        // Within a filter, sort by status severity then resolved at the bottom.
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        return statusWeight(a.status) - statusWeight(b.status);
      });
  }, [review, filter]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, PdfFinding[]>();
    for (const f of filtered) {
      const arr = byCategory.get(f.category) ?? [];
      arr.push(f);
      byCategory.set(f.category, arr);
    }
    return [...byCategory.entries()];
  }, [filtered]);

  if (!hydrated) return null;
  if (!review) {
    return (
      <div>
        <Topbar />
        <main className="mx-auto max-w-[1080px] px-7 pb-20 pt-8">
          <div className="card p-8 text-center">
            <h1 className="m-0 text-[20px] font-semibold">Report not found</h1>
            <p className="mt-1 text-muted">
              This PDF review may have been removed or never existed.
            </p>
            <div className="mt-4">
              <Link href="/dashboard" className="btn btn-primary">
                Back to dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "failed", label: `Failed (${counts.failed})` },
    { key: "needs-check", label: `Manual check (${counts["needs-check"]})` },
    { key: "passed", label: `Passed (${counts.passed})` },
    { key: "resolved", label: `Resolved (${counts.resolved})` },
    { key: "all", label: `All (${counts.all})` },
  ];

  return (
    <div>
      <Topbar />
      <main className="mx-auto max-w-[1080px] px-7 pb-20 pt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            ← All reviews
          </Link>
          <div />
        </div>

        <section className="mb-6 rounded-lg2 border border-border bg-surface px-7 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="grid h-11 w-11 place-items-center rounded-lg2 bg-accent-soft text-[14px] font-semibold text-accent">
                PDF
              </div>
              <div>
                <h1 className="m-0 text-[22px] font-semibold tracking-tight">
                  {review.pdfName}
                </h1>
                <div className="mt-1 text-[13.5px] text-muted">
                  {review.pdfSize} · Report: {review.reportName} · Reviewed{" "}
                  {review.uploadedAt}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    window.confirm(
                      "Delete this PDF review? The suggestions will be gone.",
                    )
                  ) {
                    deletePdfReview(review.id);
                    pushToast("PDF review deleted");
                    router.push("/dashboard");
                  }
                }}
              >
                Delete review
              </button>
              <Link href="/pdf-review" className="btn btn-primary">
                New PDF review
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-4 border-t border-border pt-5 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
            <div>
              <div className="text-[12.5px] uppercase tracking-wider text-muted">
                Overall score
              </div>
              <div className="mt-0.5 text-[22px] font-semibold tracking-tight text-accent">
                {review.score}
                <span className="ml-1 text-[15px] font-medium text-subtle">
                  / 100
                </span>
              </div>
              <div className="mt-1.5">
                <ScoreBar score={review.score} width="w-full" />
              </div>
            </div>
            <StatBlock
              label="Failed"
              value={counts.failed}
              accent={counts.failed ? "text-error" : "text-text"}
            />
            <StatBlock
              label="Manual"
              value={counts["needs-check"]}
              accent={counts["needs-check"] ? "text-warn" : "text-text"}
            />
            <StatBlock label="Passed" value={counts.passed} accent="text-text" />
            <StatBlock
              label="Resolved"
              value={counts.resolved}
              accent={counts.resolved ? "text-success" : "text-text"}
            />
          </div>
        </section>

        <div className="mb-3.5 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? "chip-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {grouped.length > 0 ? (
          grouped.map(([category, findings]) => (
            <div
              key={category}
              className="mb-3 overflow-hidden rounded-card border border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border bg-surface-alt px-5 py-3.5">
                <h3 className="m-0 text-[14px] font-semibold">{category}</h3>
                <span className="text-[13px] text-muted">
                  {findings.length}{" "}
                  {findings.length === 1 ? "rule" : "rules"}
                </span>
              </div>
              <ul className="m-0 list-none p-0">
                {findings.map((f) => (
                  <FindingRow
                    key={f.id}
                    finding={f}
                    onToggle={() =>
                      togglePdfFindingResolved(review.id, f.id)
                    }
                  />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <div className="rounded-card border border-border bg-surface p-8 text-center text-muted">
            No findings in this filter. Try a different one.
          </div>
        )}
      </main>
    </div>
  );
}

function FindingRow({
  finding,
  onToggle,
}: {
  finding: PdfFinding;
  onToggle: () => void;
}) {
  const evidence = finding.evidence ?? [];
  // Treat older saved reviews (no source field) as Adobe-sourced — they
  // were all from the Adobe report parse before this feature shipped.
  const source: PdfFindingSource = finding.source ?? "adobe";
  const descriptionPrefix =
    source === "clarity" ? "Clarity says:" : "Adobe says:";

  return (
    <li className="flex items-start gap-4 border-b border-border px-5 py-4 last:border-b-0">
      <div className="mt-0.5 flex-shrink-0">
        <StatusBadge status={finding.status} resolved={finding.resolved} />
      </div>
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4
                className={`m-0 text-[15px] font-semibold ${finding.resolved ? "text-muted line-through" : ""}`}
              >
                {finding.rule}
              </h4>
              <SourceBadge source={source} />
            </div>
            {finding.description ? (
              <div className="mt-0.5 text-[13px] text-muted">
                {descriptionPrefix} {finding.description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`btn btn-sm ${finding.resolved ? "btn-secondary" : "btn-primary"}`}
            onClick={onToggle}
          >
            {finding.resolved ? "Mark open" : "Mark resolved"}
          </button>
        </div>
        {evidence.length > 0 ? (
          <div className="mt-3">
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-subtle">
              {evidence.length === 1
                ? "Where Clarity found this in the PDF"
                : `Where Clarity found this in the PDF (${evidence.length} instance${evidence.length === 1 ? "" : "s"})`}
            </div>
            <div className="mt-1 space-y-2">
              {evidence.map((ev) => (
                <PdfPreview key={ev.id} evidence={ev} />
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-3 rounded-card border border-accent-soft bg-accent-soft px-4 py-3 text-[13.5px] text-text">
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-accent">
            How to fix in the source file
          </div>
          <div className="mt-1 leading-snug">{finding.suggestion}</div>
        </div>
      </div>
    </li>
  );
}

function SourceBadge({ source }: { source: PdfFindingSource }) {
  const isAdobe = source === "adobe";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
        isAdobe
          ? "bg-info-soft text-info"
          : "bg-accent-soft text-accent-hover"
      }`}
      title={
        isAdobe
          ? "Surfaced by the Adobe accessibility report"
          : "Surfaced by Clarity's source-side scan of the PDF"
      }
    >
      {isAdobe ? "Adobe" : "Clarity"}
    </span>
  );
}

function StatusBadge({
  status,
  resolved,
}: {
  status: PdfRuleStatus;
  resolved: boolean;
}) {
  if (resolved) {
    return (
      <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-0.5 text-[12px] font-medium text-success">
        Resolved
      </span>
    );
  }
  const map: Record<PdfRuleStatus, { label: string; className: string }> = {
    failed: {
      label: "Failed",
      className: "bg-error-soft text-error",
    },
    "needs-check": {
      label: "Manual check",
      className: "bg-warn-soft text-warn",
    },
    passed: {
      label: "Passed",
      className: "bg-success-soft text-success",
    },
    "not-applicable": {
      label: "N/A",
      className: "bg-surface-alt text-muted",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div>
      <div className="text-[12.5px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div
        className={`mt-0.5 text-[22px] font-semibold tracking-tight ${accent}`}
      >
        {value}
      </div>
    </div>
  );
}

function statusWeight(status: PdfRuleStatus): number {
  switch (status) {
    case "failed":
      return 0;
    case "needs-check":
      return 1;
    case "passed":
      return 2;
    case "not-applicable":
      return 3;
  }
}
