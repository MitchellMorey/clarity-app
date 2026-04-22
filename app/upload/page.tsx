"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { Dropzone } from "@/components/Dropzone";
import { AnalysisSteps } from "@/components/AnalysisSteps";
import { useApp } from "@/lib/store";

function UploadView() {
  const router = useRouter();
  const params = useSearchParams();
  const reviewDocId = params.get("review");

  const { isAuthed, hydrated, documents, addReviewedDocument, addReReview, pushToast } =
    useApp();

  const [analyzing, setAnalyzing] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/");
  }, [hydrated, isAuthed, router]);

  const reReviewDoc = reviewDocId
    ? documents.find((d) => d.id === reviewDocId)
    : undefined;

  // If we arrived on /upload?review=docId, auto-kick off a re-review
  useEffect(() => {
    if (!hydrated || !reReviewDoc) return;
    if (analyzing) return;
    setFilename(`${reReviewDoc.name} (revised)`);
    setAnalyzing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, reReviewDoc?.id]);

  const handleFile = (f: File | { name: string; size: number }) => {
    setFilename(f.name);
    setAnalyzing(true);
  };

  const handleComplete = () => {
    if (reReviewDoc) {
      addReReview(reReviewDoc.id);
      pushToast(`Re-review complete`);
      router.push(`/reports/${reReviewDoc.id}`);
    } else if (filename) {
      const id = addReviewedDocument(filename);
      pushToast("Review complete");
      router.push(`/reports/${id}`);
    }
  };

  if (!hydrated) return null;

  const title = reReviewDoc
    ? `Re-reviewing ${reReviewDoc.name}`
    : "Upload a document";
  const subtitle = reReviewDoc
    ? "Analyzing your revised document against the previous review."
    : "We'll review it for accessibility issues and give you a report in seconds.";

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
          <Link href="/dashboard" className="btn btn-secondary">
            ← Back to dashboard
          </Link>
        </div>

        <div className="mx-auto max-w-[720px]">
          <div className={analyzing ? "opacity-60" : ""}>
            <Dropzone
              onFile={handleFile}
              suggestedFile="Q4_marketing_deck.pptx"
            />
          </div>

          {analyzing && filename ? (
            <AnalysisSteps filename={filename} onComplete={handleComplete} />
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
