"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { FileIcon } from "@/components/FileIcon";
import { ScoreBar } from "@/components/ScoreBar";
import { currentVersionOf, useApp } from "@/lib/store";
import type { Document, PdfReview } from "@/lib/types";

type ReviewRow =
  | { kind: "doc"; uploadedAt: string; doc: Document }
  | { kind: "pdf"; uploadedAt: string; review: PdfReview };

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthed, hydrated, userEmail, documents, pdfReviews } = useApp();

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/");
  }, [hydrated, isAuthed, router]);

  const stats = useMemo(() => {
    const docCurrent = documents.map(currentVersionOf);
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
    };
  }, [documents, pdfReviews]);

  // Unified, most-recent-first list of every review (DOCX, PPTX, PDF) so the
  // dashboard shows one coherent history regardless of which workflow produced
  // each entry.
  const reviewRows: ReviewRow[] = useMemo(() => {
    const rows: ReviewRow[] = [
      ...documents.map((d) => ({
        kind: "doc" as const,
        uploadedAt: d.uploadedAt,
        doc: d,
      })),
      ...pdfReviews.map((r) => ({
        kind: "pdf" as const,
        uploadedAt: r.uploadedAt,
        review: r,
      })),
    ];
    return rows.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
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
          />
          <CtaCard
            href="/pdf-review"
            eyebrow="PDF + Adobe report"
            title="Review Adobe Accessibility Report"
            body="Upload your original PDF and the Adobe accessibility report. Clarity turns each flagged rule into a plain-language fix you can apply in the source file — before re-exporting."
            cta="Review an accessibility report"
          />
        </div>

        {!isEmpty ? (
          <>
            <div className="mb-7 grid grid-cols-2 gap-4">
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
            </div>

            <section className="mb-8">
              <div className="mb-3.5 flex items-center justify-between">
                <h2 className="m-0 text-[16px] font-semibold">
                  Your reviews
                </h2>
                <span className="text-[13px] text-muted">
                  Click a row to open the report
                </span>
              </div>

              <div className="grid gap-3">
                {reviewRows.map((row) =>
                  row.kind === "doc" ? (
                    <DocReviewRow key={row.doc.id} doc={row.doc} />
                  ) : (
                    <PdfReviewRow key={row.review.id} review={row.review} />
                  ),
                )}
              </div>
            </section>
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
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
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
        <span className="btn btn-primary">{cta} →</span>
      </div>
    </Link>
  );
}

function DocReviewRow({ doc }: { doc: Document }) {
  const v = currentVersionOf(doc);
  const open = v.issues.filter((i) => !i.resolved).length;
  const crit = v.issues.filter(
    (i) => i.severity === "critical" && !i.resolved,
  ).length;
  const resolved = v.issues.filter((i) => i.resolved).length;
  const versionLabel =
    doc.versions.length > 1 ? ` · v${doc.versions.length}` : "";
  return (
    <Link
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
          {resolved > 0 ? (
            <span className="text-success"> · {resolved} resolved</span>
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
}

function PdfReviewRow({ review }: { review: PdfReview }) {
  const open = review.findings.filter(
    (f) => !f.resolved && (f.status === "failed" || f.status === "needs-check"),
  ).length;
  const failed = review.findings.filter(
    (f) => f.status === "failed" && !f.resolved,
  ).length;
  const resolved = review.findings.filter((f) => f.resolved).length;
  return (
    <Link
      href={`/pdf-reports/${review.id}`}
      className="grid grid-cols-[40px_1.8fr_1fr_1fr_140px] items-center gap-4 rounded-card border border-border bg-surface px-5 py-4 transition hover:border-border-strong hover:shadow-soft-sm"
    >
      <div className="grid h-10 w-10 place-items-center rounded-lg2 bg-accent-soft text-[13px] font-semibold text-accent">
        PDF
      </div>
      <div>
        <div className="font-medium">{review.pdfName}</div>
        <div className="mt-0.5 text-[13px] text-subtle">
          {review.pdfSize} · Report: {review.reportName} · Reviewed{" "}
          {review.uploadedAt}
        </div>
      </div>
      <div>
        <div className="text-[12.5px] text-subtle">Issues</div>
        <div className="text-[14px]">
          {open} open
          {failed > 0 ? (
            <span className="text-error"> · {failed} critical</span>
          ) : null}
          {resolved > 0 ? (
            <span className="text-success"> · {resolved} resolved</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 tabular-nums">
        <ScoreBar score={review.score} />
        <span>{review.score}</span>
      </div>
      <div className="flex justify-end">
        <span className="btn btn-secondary btn-sm">View report</span>
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
