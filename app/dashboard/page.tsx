"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { FileIcon } from "@/components/FileIcon";
import { ScoreBar } from "@/components/ScoreBar";
import { currentVersionOf, useApp } from "@/lib/store";

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthed, hydrated, documents } = useApp();

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/");
  }, [hydrated, isAuthed, router]);

  const stats = useMemo(() => {
    if (documents.length === 0) {
      return { reviewed: 0, avg: 0, critical: 0, resolved: 0 };
    }
    const allCurrent = documents.map(currentVersionOf);
    const allIssues = allCurrent.flatMap((v) => v.issues);
    const critical = allIssues.filter(
      (i) => i.severity === "critical" && !i.resolved,
    ).length;
    const resolved = documents.reduce((sum, d) => {
      if (d.versions.length < 2) return sum;
      return sum + d.versions[d.versions.length - 1].issues.filter((i) => i.resolved).length;
    }, 0);
    const avg = Math.round(
      allCurrent.reduce((s, v) => s + v.score, 0) / allCurrent.length,
    );
    return { reviewed: documents.length, avg, critical, resolved };
  }, [documents]);

  if (!hydrated) return null;

  return (
    <div>
      <Topbar />
      <main className="mx-auto max-w-[1080px] px-7 pb-20 pt-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-[28px] font-semibold tracking-tight">
              Dashboard
            </h1>
            <div className="mt-1 text-muted">
              Your document accessibility reviews
            </div>
          </div>
          <Link href="/upload" className="btn btn-primary">
            <span>+</span> Upload document
          </Link>
        </div>

        <div className="mb-7 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Documents reviewed"
            value={stats.reviewed}
            trend="Across DOCX, PPTX, PDF"
          />
          <StatCard label="Average score" value={stats.avg} trend="Out of 100" />
          <StatCard
            label="Critical issues open"
            value={stats.critical}
            trend="Need immediate attention"
          />
          <StatCard
            label="Issues resolved"
            value={stats.resolved}
            trend="From re-reviews"
          />
        </div>

        <div className="mb-7 flex items-center justify-between gap-5 rounded-lg2 border border-dashed border-border-strong bg-surface p-7">
          <div>
            <strong className="block text-[16px] font-semibold">
              Ready to review another document?
            </strong>
            <span className="text-[14px] text-muted">
              DOCX, PPTX, and PDF files up to 50 MB are supported.
            </span>
          </div>
          <Link href="/upload" className="btn btn-primary">
            Upload a file
          </Link>
        </div>

        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="m-0 text-[16px] font-semibold">Completed reviews</h2>
          <span className="text-[13px] text-muted">
            Click a row to open the report
          </span>
        </div>

        <div className="grid gap-3">
          {documents.map((doc) => {
            const v = currentVersionOf(doc);
            const open = v.issues.filter((i) => !i.resolved).length;
            const crit = v.issues.filter(
              (i) => i.severity === "critical" && !i.resolved,
            ).length;
            const versionLabel =
              doc.versions.length > 1 ? ` · v${doc.versions.length}` : "";
            return (
              <Link
                key={doc.id}
                href={`/reports/${doc.id}`}
                className="grid grid-cols-[40px_1.8fr_1fr_1fr_140px] items-center gap-4 rounded-card border border-border bg-surface px-5 py-4 transition hover:border-border-strong hover:shadow-soft-sm"
              >
                <FileIcon type={doc.type} />
                <div>
                  <div className="font-medium">{doc.name}</div>
                  <div className="mt-0.5 text-[13px] text-subtle">
                    {doc.size} · Reviewed {v.reviewedAt}
                    {versionLabel}
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] text-subtle">Issues</div>
                  <div className="text-[14px]">
                    {open} open
                    {crit > 0 ? (
                      <span className="text-error"> · {crit} critical</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 tabular-nums">
                  <ScoreBar score={v.score} />
                  <span>{v.score}</span>
                </div>
                <div className="flex justify-end">
                  <span className="btn btn-secondary btn-sm">View report</span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: number;
  trend: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-5 py-4">
      <div className="text-[12.5px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-1 text-[26px] font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[12.5px] text-subtle">{trend}</div>
    </div>
  );
}
