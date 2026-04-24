"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { FileIcon } from "@/components/FileIcon";
import { ScoreBar } from "@/components/ScoreBar";
import { IssueItem } from "@/components/IssueItem";
import { Modal } from "@/components/Modal";
import { currentVersionOf, useApp } from "@/lib/store";
import type { Issue, IssueCategory, IssueSeverity } from "@/lib/types";
import { ISSUE_CATEGORY_META, SEVERITY_ORDER } from "@/lib/types";

type Filter = "all" | IssueSeverity | "resolved";

export default function ReportPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const {
    isAuthed,
    hydrated,
    documents,
    justReviewedDocId,
    clearJustReviewed,
    pushToast,
  } = useApp();

  const [filter, setFilter] = useState<Filter>("all");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/");
  }, [hydrated, isAuthed, router]);

  const doc = documents.find((d) => d.id === params.id);
  const showBanner = justReviewedDocId === params.id;

  // Clear the "just reviewed" flag after the user has seen the banner
  useEffect(() => {
    if (!showBanner) return;
    const t = setTimeout(clearJustReviewed, 6000);
    return () => clearTimeout(t);
  }, [showBanner, clearJustReviewed]);

  const version = doc ? currentVersionOf(doc) : null;

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0, resolved: 0 };
    version?.issues.forEach((i) => {
      if (i.resolved) c.resolved++;
      else c[i.severity]++;
    });
    return c;
  }, [version]);

  const groupedFiltered = useMemo(() => {
    if (!version) return [] as { cat: IssueCategory; issues: Issue[] }[];
    const byCat: Record<IssueCategory, Issue[]> = {
      contrast: [],
      font: [],
      alt: [],
      heading: [],
    };
    for (const i of version.issues) byCat[i.category].push(i);

    function filtered(arr: Issue[]): Issue[] {
      let result = arr;
      if (filter === "resolved") result = arr.filter((i) => i.resolved);
      else if (filter !== "all")
        result = arr.filter((i) => !i.resolved && i.severity === filter);
      return [...result].sort((a, b) => {
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      });
    }

    return (Object.keys(byCat) as IssueCategory[])
      .map((cat) => ({ cat, issues: filtered(byCat[cat]) }))
      .filter((g) => g.issues.length > 0);
  }, [version, filter]);

  if (!hydrated) return null;
  if (!doc || !version) {
    return (
      <div>
        <Topbar />
        <main className="mx-auto max-w-[1080px] px-7 pb-20 pt-8">
          <div className="card p-8 text-center">
            <h1 className="m-0 text-[20px] font-semibold">Report not found</h1>
            <p className="mt-1 text-muted">
              This report may have been removed or never existed.
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

  const versionLabel =
    doc.versions.length > 1
      ? ` · Version ${version.version} of ${doc.versions.length}`
      : "";

  const scoreClass =
    version.score >= 85
      ? "text-emerald-600"
      : version.score >= 70
        ? "text-amber-600"
        : "text-red-600";
  void scoreClass; // reserved for future use

  const openTotal = counts.critical + counts.warning + counts.info;
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${openTotal + counts.resolved})` },
    { key: "critical", label: `Critical (${counts.critical})` },
    { key: "warning", label: `Warnings (${counts.warning})` },
    { key: "info", label: `Info (${counts.info})` },
    { key: "resolved", label: `Resolved (${counts.resolved})` },
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

        {showBanner && version.resolvedSinceLast ? (
          <div className="mb-5 flex items-center gap-3 rounded-card border border-emerald-200 bg-success-soft px-5 py-3.5">
            <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-success text-[14px] text-white">
              ✓
            </div>
            <div>
              <strong className="text-success">Nice progress.</strong>{" "}
              <span className="text-text">
                {version.resolvedSinceLast} issue
                {version.resolvedSinceLast === 1 ? " has" : "s have"} been
                resolved since your last review.{" "}
                {openTotal} {openTotal === 1 ? "issue" : "issues"} still need
                attention.
              </span>
            </div>
          </div>
        ) : null}

        <section className="mb-6 rounded-lg2 border border-border bg-surface px-7 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <FileIcon type={doc.type} size="lg" />
              <div>
                <h1 className="m-0 text-[22px] font-semibold tracking-tight">
                  {doc.name}
                </h1>
                <div className="mt-1 text-[13.5px] text-muted">
                  {doc.size} · Reviewed {version.reviewedAt}
                  {versionLabel}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => pushToast("Report export is not wired up yet")}
              >
                Export report
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setModalOpen(true)}
              >
                Re-upload revised version
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 border-t border-border pt-5 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
            <div>
              <div className="text-[12.5px] uppercase tracking-wider text-muted">
                Overall score
              </div>
              <div className="mt-0.5 text-[22px] font-semibold tracking-tight text-accent">
                {version.score}
                <span className="ml-1 text-[15px] font-medium text-subtle">
                  / 100
                </span>
              </div>
              <div className="mt-1.5">
                <ScoreBar score={version.score} width="w-full" />
              </div>
            </div>
            <ScoreBlock
              label="Critical"
              value={counts.critical}
              accent={counts.critical ? "text-error" : "text-text"}
            />
            <ScoreBlock
              label="Warnings"
              value={counts.warning}
              accent={counts.warning ? "text-warn" : "text-text"}
            />
            <ScoreBlock label="Info" value={counts.info} accent="text-text" />
            <ScoreBlock
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

        {groupedFiltered.length > 0 ? (
          groupedFiltered.map((g) => (
            <div
              key={g.cat}
              className="mb-3 overflow-hidden rounded-card border border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border bg-surface-alt px-5 py-3.5">
                <h3 className="m-0 text-[14px] font-semibold">
                  {ISSUE_CATEGORY_META[g.cat].label}
                </h3>
                <span className="text-[13px] text-muted">
                  {g.issues.length} {g.issues.length === 1 ? "item" : "items"}
                </span>
              </div>
              <ul className="m-0 list-none p-0">
                {g.issues.map((issue) => (
                  <IssueItem key={issue.id} issue={issue} />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <div className="rounded-card border border-border bg-surface p-8 text-center text-muted">
            No issues in this filter. Try a different one.
          </div>
        )}
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Re-upload revised version"
        footer={
          <button
            className="btn btn-secondary"
            onClick={() => setModalOpen(false)}
          >
            Cancel
          </button>
        }
      >
        <p className="m-0 mb-4 text-muted">
          Upload your revised {doc.type.toUpperCase()}. We&apos;ll run a fresh
          accessibility review and compare it against the previous version so
          you can see exactly which issues have been resolved.
        </p>
        <div className="rounded-lg2 border-2 border-dashed border-border-strong bg-surface px-5 py-8 text-center">
          <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-[18px] text-accent">
            ↑
          </div>
          <h3 className="m-0 text-[15px] font-semibold">
            Choose the revised file to continue
          </h3>
          <p className="mb-3 mt-1 text-[13px] text-muted">
            A fresh review will start as soon as the file is uploaded.
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setModalOpen(false);
              router.push(`/upload?review=${doc.id}`);
            }}
          >
            Choose revised file
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ScoreBlock({
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
