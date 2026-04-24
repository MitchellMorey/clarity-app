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
  const { isAuthed, hydrated, userEmail, documents, pdfReviews } = useApp();

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/");
  }, [hydrated, isAuthed, router]);

  const stats = useMemo(() => {
    const docCurrent = documents.map(currentVersionOf);
    const docIssues = docCurrent.flatMap((v) => v.issues);
    const openCritical =
      docIssues.filter((i) => i.severity === "critical" && !i.resolved).length +
      pdfReviews.flatMap((r) => r.findings).filter(
        (f) => f.status === "failed" && !f.resolved,
      ).length;
    const resolved =
      documents.reduce((sum, d) => {
        if (d.versions.length < 2) return sum;
        return (
          sum +
          d.versions[d.versions.length - 1].issues.filter((i) => i.resolved)
            .length
        );
      }, 0) +
      pdfReviews.reduce(
        (sum, r) => sum + r.findings.filter((f) => f.resolved).length,
        0,
      );
    const allScores = [
      ...docCurrent.map((v) => v.score),
      ...pdfReviews.map((r) => r.score),
    ];
    const avg = allScores.length
      ? Math.round(allScores.reduce((s, n) => s + n, 0) / allScores.length)
      : 0;
    return {
      reviewed: documents.length + pdfReviews.length,
      avg,
      critical: openCritical,
      resolved,
    };
  }, [documents, pdfReviews]);

  if (!hydrated) return null;

  const isEmpty = documents.length === 0 && pdfReviews.length === 0;
  const greetingName = userEmail ? userEmail.split("@")[0] : "there";

  return (
    <div>
      <Topbar />
      <main className="mx-auto max-w-[1080px] px-7 pb-20 pt-8">
        <div className="mb-7">
          <h1 className="m-0 text-[28px] font-semibold tracking-tight">
            {isEmpty ? `Welcome, ${greetingName}` : "Dashboard"}
          </h1>
          <div className="mt-1 text-muted">
            {isEmpty
              ? "Pick a workflow below to get started."
              : "Your accessibility reviews"}
          </div>
        </div>

        {/* Two primary CTAs — always present, even for returning users. */}
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <CtaCard
            href="/upload"
            eyebrow="Word + PowerPoint"
            title="Review Document Accessibility"
            body="Upload a DOCX or PPTX. Clarity walks every paragraph or slide and flags contrast, font size, alt text, and heading issues you can fix in the source file."
            cta="Start a document review"
            accent="primary"
          />
          <CtaCard
            href="/pdf-review"
            eyebrow="PDF + Adobe report"
            title="Review Adobe Accessibility Report"
            body="Upload your PDF and the Adobe accessibility report. Clarity turns each flagged rule into a plain-language fix you can apply in the source file — before re-exporting."
            cta="Start a PDF review"
            accent="secondary"
          />
        </div>

        {!isEmpty ? (
          <>
            <div className="mb-7 grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                label="Reviews completed"
                value={stats.reviewed}
                trend="Across DOCX, PPTX, and PDF"
              />
              <StatCard
                label="Average score"
                value={stats.avg}
                trend="Out of 100"
              />
              <StatCard
                label="Critical issues open"
                value={stats.critical}
                trend="Need immediate attention"
              />
              <StatCard
                label="Issues resolved"
                value={stats.resolved}
                trend="From re-reviews + check-offs"
              />
            </div>

            {documents.length > 0 ? (
              <section className="mb-8">
                <div className="mb-3.5 flex items-center justify-between">
                  <h2 className="m-0 text-[16px] font-semibold">
                    Document reviews
                  </h2>
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
                              <span className="text-error">
                                {" "}· {crit} critical
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 tabular-nums">
                          <ScoreBar score={v.score} />
                          <span>{v.score}</span>
                        </div>
                        <div className="flex justify-end">
                          <span className="btn btn-secondary btn-sm">
                            View report
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {pdfReviews.length > 0 ? (
              <section className="mb-8">
                <div className="mb-3.5 flex items-center justify-between">
                  <h2 className="m-0 text-[16px] font-semibold">
                    Adobe PDF reviews
                  </h2>
                  <span className="text-[13px] text-muted">
                    Plain-language fix suggestions per rule
                  </span>
                </div>

                <div className="grid gap-3">
                  {pdfReviews.map((r) => {
                    const failed = r.findings.filter(
                      (f) => f.status === "failed" && !f.resolved,
                    ).length;
                    const manual = r.findings.filter(
                      (f) => f.status === "needs-check" && !f.resolved,
                    ).length;
                    return (
                      <Link
                        key={r.id}
                        href={`/pdf-reports/${r.id}`}
                        className="grid grid-cols-[40px_1.8fr_1fr_1fr_140px] items-center gap-4 rounded-card border border-border bg-surface px-5 py-4 transition hover:border-border-strong hover:shadow-soft-sm"
                      >
                        <div className="grid h-10 w-10 place-items-center rounded-lg2 bg-accent-soft text-[13px] font-semibold text-accent">
                          PDF
                        </div>
                        <div>
                          <div className="font-medium">{r.pdfName}</div>
                          <div className="mt-0.5 text-[13px] text-subtle">
                            {r.pdfSize} · Report: {r.reportName} · Reviewed{" "}
                            {r.uploadedAt}
                          </div>
                        </div>
                        <div>
                          <div className="text-[12.5px] text-subtle">
                            Findings
                          </div>
                          <div className="text-[14px]">
                            {failed > 0 ? (
                              <span className="text-error">{failed} failed</span>
                            ) : (
                              <span>No failures</span>
                            )}
                            {manual > 0 ? (
                              <span className="text-warn">
                                {" "}· {manual} manual
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 tabular-nums">
                          <ScoreBar score={r.score} />
                          <span>{r.score}</span>
                        </div>
                        <div className="flex justify-end">
                          <span className="btn btn-secondary btn-sm">
                            View suggestions
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

function CtaCard({
  href,
  eyebrow,
  title,
  body,
  cta,
  accent,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  accent: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col justify-between rounded-lg2 border border-border bg-surface p-6 transition hover:border-border-strong hover:shadow-soft-sm"
    >
      <div>
        <div className="text-[12px] uppercase tracking-wider text-subtle">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-[20px] font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-[14.5px] text-muted">{body}</p>
      </div>
      <div className="mt-5">
        <span
          className={`btn ${accent === "primary" ? "btn-primary" : "btn-secondary"}`}
        >
          {cta} →
        </span>
      </div>
    </Link>
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
      <div className="mt-1 text-[26px] font-semibold tracking-tight">
        {value}
      </div>
      <div className="mt-0.5 text-[12.5px] text-subtle">{trend}</div>
    </div>
  );
}
