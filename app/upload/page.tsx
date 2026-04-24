"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { Dropzone } from "@/components/Dropzone";
import { AnalysisSteps } from "@/components/AnalysisSteps";
import { useApp } from "@/lib/store";
import type { AddReviewPayload } from "@/lib/store";
import type { DocType, Issue } from "@/lib/types";
import { bytesToLabel, generateMockIssuesFor, inferType } from "@/lib/mock-data";

interface PendingReview {
  payload: AddReviewPayload;
}

function UploadView() {
  const router = useRouter();
  const params = useSearchParams();
  const reviewDocId = params.get("review");

  const {
    isAuthed,
    hydrated,
    documents,
    addReviewedDocument,
    addReReview,
    pushToast,
  } = useApp();

  const [analyzing, setAnalyzing] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingReview | null>(null);
  const [animDone, setAnimDone] = useState(false);

  // Make sure we don't double-finalize if both Promises resolve in the same tick
  const finalizedRef = useRef(false);

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/");
  }, [hydrated, isAuthed, router]);

  const reReviewDoc = reviewDocId
    ? documents.find((d) => d.id === reviewDocId)
    : undefined;

  const resetAnalysis = useCallback(() => {
    setAnalyzing(false);
    setFilename(null);
    setPending(null);
    setAnimDone(false);
    finalizedRef.current = false;
  }, []);

  const handleFile = useCallback(
    async (f: File | { name: string; size: number }) => {
      // Starting a fresh analysis — clear any prior state.
      finalizedRef.current = false;
      setAnimDone(false);
      setPending(null);
      setFilename(f.name);
      setAnalyzing(true);

      const isRealFile = f instanceof File;
      const name = f.name;
      const type: DocType = inferType(name);
      const ext = name.split(".").pop()?.toLowerCase();

      // Sample-file click from the Dropzone (not a real File) always uses mocks.
      if (!isRealFile) {
        setPending({
          payload: {
            name,
            type,
            size: "2.1 MB",
            score: 71,
            issues: generateMockIssuesFor(type),
          },
        });
        return;
      }

      if (ext !== "docx" && ext !== "pptx") {
        pushToast("Only .docx and .pptx files are supported right now.");
        resetAnalysis();
        return;
      }

      // Re-review mode: the revised file should match the original's type so
      // we're actually comparing apples to apples.
      if (reReviewDoc && type !== reReviewDoc.type) {
        pushToast(
          `This document was originally reviewed as ${reReviewDoc.type.toUpperCase()}. Please upload a ${reReviewDoc.type.toUpperCase()} file for the revised version.`,
        );
        resetAnalysis();
        return;
      }

      // Both DOCX and PPTX are routed through the real analyzer API.
      const fd = new FormData();
      fd.append("file", f);

      try {
        const res = await fetch("/api/review", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          issues?: Issue[];
          score?: number;
          sizeLabel?: string;
        };
        if (!res.ok || !Array.isArray(data.issues) || typeof data.score !== "number") {
          throw new Error(data.error || `Review failed (${res.status})`);
        }
        setPending({
          payload: {
            name,
            type,
            size: data.sizeLabel || bytesToLabel(f.size),
            score: data.score,
            issues: data.issues,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not analyze the document.";
        pushToast(message);
        resetAnalysis();
      }
    },
    [pushToast, resetAnalysis, reReviewDoc],
  );

  // Finalize once both the animation has played out AND we have a pending result.
  useEffect(() => {
    if (!analyzing || !animDone || !pending) return;
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    if (reReviewDoc) {
      // Real re-review: feed the fresh analysis into the store, which diffs
      // it against the previous version to figure out which issues are
      // actually resolved.
      addReReview(reReviewDoc.id, {
        size: pending.payload.size,
        score: pending.payload.score,
        issues: pending.payload.issues,
      });
      pushToast("Re-review complete");
      router.push(`/reports/${reReviewDoc.id}`);
    } else {
      const id = addReviewedDocument(pending.payload);
      pushToast("Review complete");
      router.push(`/reports/${id}`);
    }
  }, [
    analyzing,
    animDone,
    pending,
    reReviewDoc,
    addReReview,
    addReviewedDocument,
    pushToast,
    router,
  ]);

  if (!hydrated) return null;

  const title = reReviewDoc
    ? `Re-review ${reReviewDoc.name}`
    : "Upload a document";
  const subtitle = reReviewDoc
    ? `Upload your revised ${reReviewDoc.type.toUpperCase()} and we'll compare it against the previous review.`
    : "Upload a Word document or PowerPoint deck and we'll flag accessibility problems you can fix in the source file.";

  return (
    <div>
      <Topbar />
      <main className="mx-auto max-w-[1080px] px-7 pb-20 pt-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-[28px] font-semibold tracking-tight">
              {title}
            </h1>
            <div className="mt-1 text-muted">{subtitle}</div>
          </div>
          <Link
            href={reReviewDoc ? `/reports/${reReviewDoc.id}` : "/dashboard"}
            className="btn btn-secondary"
          >
            ← {reReviewDoc ? "Back to report" : "Back to dashboard"}
          </Link>
        </div>

        <div className="mx-auto max-w-[720px]">
          <div className={analyzing ? "opacity-60" : ""}>
            <Dropzone
              onFile={handleFile}
              accept={
                reReviewDoc?.type === "pptx" ? ".pptx" : ".docx,.pptx"
              }
            />
          </div>

          {analyzing && filename ? (
            <AnalysisSteps
              filename={filename}
              onComplete={() => setAnimDone(true)}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadView />
    </Suspense>
  );
}
