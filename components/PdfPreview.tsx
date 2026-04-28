import type { PdfEvidence } from "@/lib/types";

/**
 * Renders a single piece of evidence behind a PDF finding. For text
 * evidence we mimic a snippet of a PDF page, drawing the offending text
 * with the detected font size and color so the user can recognize it
 * visually in the source file. For image evidence we render a labelled
 * placeholder card.
 */

const PT_TO_PX = 1.25; // approximate 100% zoom in our preview

function fontStack(family: string | undefined): string {
  // Reuse the same logic shape as DocPreview: name the detected font first,
  // fall back to the closest open-source / system equivalents.
  if (!family) return "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";
  const lower = family.toLowerCase();
  if (lower.includes("calibri")) {
    return `"${family}", Calibri, Carlito, "Segoe UI", Arial, sans-serif`;
  }
  if (lower.includes("times") || lower.includes("cambria")) {
    return `"${family}", Cambria, "Times New Roman", Times, serif`;
  }
  if (
    lower.includes("courier") ||
    lower.includes("consolas") ||
    lower.includes("mono")
  ) {
    return `"${family}", Consolas, "Courier New", monospace`;
  }
  if (
    lower.includes("arial") ||
    lower.includes("helvetica") ||
    lower.includes("sans")
  ) {
    return `"${family}", Arial, Helvetica, sans-serif`;
  }
  return `"${family}", Calibri, Carlito, Arial, sans-serif`;
}

export function PdfPreview({ evidence }: { evidence: PdfEvidence }) {
  if (evidence.kind === "image") {
    return <ImageEvidence evidence={evidence} />;
  }
  return <TextEvidence evidence={evidence} />;
}

function TextEvidence({ evidence }: { evidence: PdfEvidence }) {
  const fg = evidence.fg ?? "#000000";
  const bg = evidence.bg ?? "#ffffff";
  const sizePt = evidence.fontSize ?? 11;
  // Clamp display size so that 1pt previews are still legible while
  // preserving relative smallness vs. a 12pt baseline.
  const displayPx = Math.max(8, Math.min(sizePt * PT_TO_PX, 28));

  const detailBits: string[] = [];
  if (evidence.fontFamily) detailBits.push(evidence.fontFamily);
  if (evidence.fontSize !== undefined) {
    detailBits.push(
      Number.isInteger(evidence.fontSize)
        ? `${evidence.fontSize}pt`
        : `${evidence.fontSize.toFixed(1)}pt`,
    );
  }
  if (evidence.page) detailBits.push(`Page ${evidence.page}`);

  return (
    <div className="mt-2">
      <div className="mb-1 text-[11.5px] uppercase tracking-wide text-subtle">
        As it appears in your PDF
        {detailBits.length > 0 ? (
          <span className="ml-2 normal-case tracking-normal text-subtle/80">
            · {detailBits.join(" · ")}
          </span>
        ) : null}
      </div>
      <div
        className="rounded-md border border-border bg-[#f3f3f1] p-3 shadow-soft-sm"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #f6f6f4 0%, #f2f2f0 100%)",
        }}
      >
        <div
          className="rounded-[3px] border border-black/5"
          style={{ background: "#ffffff" }}
        >
          <div
            style={{
              fontFamily: fontStack(evidence.fontFamily),
              fontSize: `${displayPx}px`,
              lineHeight: 1.4,
              color: fg,
              backgroundColor: bg,
              padding: "10px 14px",
              borderRadius: 4,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {evidence.text || "(no text captured)"}
          </div>
        </div>
      </div>
      {evidence.ratio || evidence.detail ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          {evidence.ratio && evidence.required ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[12px] font-medium"
              style={{ background: bg, color: fg }}
            >
              <span
                className="h-3 w-3 rounded-sm border border-black/10"
                style={{ background: fg }}
              />
              <span>
                {fg} on {bg}
              </span>
              <span className="ml-1.5 text-muted">
                Ratio {evidence.ratio} (needs {evidence.required})
              </span>
            </span>
          ) : null}
          {evidence.detail ? <span>{evidence.detail}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ImageEvidence({ evidence }: { evidence: PdfEvidence }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-surface-alt px-3 py-2.5 text-[13px]">
      <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md border border-border bg-surface text-[11px] uppercase tracking-wide text-subtle">
        IMG
      </div>
      <div>
        <div className="font-semibold text-text">
          {evidence.imageLabel || "Untitled figure"}
          {evidence.page ? (
            <span className="ml-2 text-[12px] font-medium text-muted">
              · Page {evidence.page}
            </span>
          ) : null}
        </div>
        {evidence.detail ? (
          <div className="mt-0.5 text-muted">{evidence.detail}</div>
        ) : null}
      </div>
    </div>
  );
}
