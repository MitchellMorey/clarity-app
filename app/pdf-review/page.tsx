"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { useApp } from "@/lib/store";
import type { PdfFinding } from "@/lib/types";

interface ApiResponse {
  error?: string;
  pdfName?: string;
  reportName?: string;
  pdfSize?: number;
  pdfSizeLabel?: string;
  findings?: PdfFinding[];
  score?: number;
}

export default function PdfReviewUploadPage() {
  const router = useRouter();
  const { isAuthed, hydrated, addPdfReview, pushToast } = useApp();

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/");
  }, [hydrated, isAuthed, router]);

  const handleSubmit = useCallback(async () => {
    if (!pdfFile || !reportFile) {
      pushToast("Upload both files before starting the review.");
      return;
    }
    setSubmitting(true);
    const fd = new FormData();
    fd.append("pdf", pdfFile);
    fd.append("report", reportFile);

    try {
      const res = await fetch("/api/pdf-review", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (
        !res.ok ||
        !Array.isArray(data.findings) ||
        typeof data.score !== "number"
      ) {
        throw new Error(data.error || `Review failed (${res.status})`);
      }
      const id = addPdfReview({
        pdfName: data.pdfName || pdfFile.name,
        reportName: data.reportName || reportFile.name,
        pdfSize: data.pdfSizeLabel || bytesLabel(pdfFile.size),
        score: data.score,
        findings: data.findings,
      });
      pushToast("Adobe report reviewed");
      router.push(`/pdf-reports/${id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not review the report.";
      pushToast(message);
      setSubmitting(false);
    }
  }, [pdfFile, reportFile, addPdfReview, pushToast, router]);

  if (!hydrated) return null;

  return (
    <div>
      <Topbar />
      <main className="mx-auto max-w-[1080px] px-7 pb-20 pt-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-[28px] font-semibold tracking-tight">
              Review Adobe Accessibility Report
            </h1>
            <div className="mt-1 text-muted">
              Upload your original PDF and the Adobe accessibility report.
              Clarity will turn each flagged rule into a plain-language fix you
              can apply in the source file.
            </div>
          </div>
          <Link href="/dashboard" className="btn btn-secondary">
            ← Back to dashboard
          </Link>
        </div>

        <div className="mx-auto max-w-[720px]">
          <div className="grid gap-4">
            <FileSlot
              label="Original PDF"
              description="The PDF you exported from Word, InDesign, Google Docs, etc."
              accept=".pdf"
              file={pdfFile}
              onFile={setPdfFile}
            />
            <FileSlot
              label="Adobe accessibility report"
              description="File → Save As → HTML from Acrobat's accessibility report is easiest to parse. PDF reports also work."
              accept=".html,.htm,.pdf,.txt"
              file={reportFile}
              onFile={setReportFile}
            />
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-lg2 border border-border bg-surface px-6 py-5">
            <div className="text-[14px] text-muted">
              Generate plain-language fixes to the accessibility issues
              identified by Adobe.
            </div>
            <button
              className="btn btn-primary"
              disabled={!pdfFile || !reportFile || submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Reviewing…" : "Review report"}
            </button>
          </div>

          <details className="mt-5 rounded-card border border-border bg-surface-alt px-5 py-4 text-[13.5px]">
            <summary className="cursor-pointer font-semibold">
              How do I generate the Adobe accessibility report?
            </summary>
            <ol className="ml-5 mt-3 list-decimal space-y-2 text-muted">
              <li>Open your PDF in Adobe Acrobat Pro.</li>
              <li>
                Go to <strong>All Tools → Prepare for Accessibility → Check for Accessibility</strong>.
              </li>
              <li>Click <strong>Start checking</strong>.</li>
              <li>
                In the results panel, right-click the report root → <strong>Create Accessibility Report</strong> (or File → Save As → HTML).
              </li>
              <li>Upload the resulting .html (or .pdf) alongside the original PDF here.</li>
            </ol>
          </details>
        </div>
      </main>
    </div>
  );
}

function FileSlot({
  label,
  description,
  accept,
  file,
  onFile,
}: {
  label: string;
  description: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`rounded-lg2 border-2 border-dashed bg-surface px-6 py-5 transition-colors ${
        dragging ? "border-accent bg-accent-soft" : "border-border-strong"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[15px] font-semibold">{label}</div>
          <div className="mt-0.5 text-[13px] text-muted">{description}</div>
          {file ? (
            <div className="mt-2 text-[13px] text-text">
              <span className="mr-2">📄</span>
              {file.name} · {bytesLabel(file.size)}
            </div>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => inputRef.current?.click()}
          >
            {file ? "Replace" : "Choose file"}
          </button>
          {file ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onFile(null)}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // Allow picking the same file twice in a row.
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}

function bytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
