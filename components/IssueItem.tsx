import type { Issue } from "@/lib/types";
import { ISSUE_CATEGORY_META } from "@/lib/types";
import { SeverityBadge } from "./SeverityBadge";
import { DocPreview } from "./DocPreview";

export function IssueItem({ issue }: { issue: Issue }) {
  const showContrast =
    issue.category === "contrast" && issue.fg && issue.bg && issue.ratio;
  // Only show a visual preview when we have real text to render. Alt-text
  // issues have no readable text, so we skip them.
  const showPreview =
    !!issue.preview && !!issue.preview.text && issue.category !== "alt";

  return (
    <li
      className={`grid grid-cols-[90px_1fr_auto] items-start gap-4 border-b border-border px-4 py-3.5 last:border-b-0 ${
        issue.resolved
          ? "bg-gradient-to-r from-success-soft/70 to-transparent"
          : ""
      }`}
    >
      <div>
        <SeverityBadge severity={issue.severity} resolved={issue.resolved} />
      </div>
      <div>
        <p className="m-0 font-medium">{issue.title}</p>
        <p className="m-0 text-[13.5px] text-muted">
          {ISSUE_CATEGORY_META[issue.category].description}
        </p>
        <div className="mt-1.5 font-mono text-[12.5px] text-subtle">
          {issue.location}
        </div>
        {issue.detail ? (
          <div className="mt-0.5 font-mono text-[12.5px] text-subtle">
            {issue.detail}
          </div>
        ) : null}
        {showContrast ? (
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[12.5px] font-medium"
            style={{ background: issue.bg, color: issue.fg }}
          >
            <span
              className="h-3 w-3 rounded-sm border border-black/10"
              style={{ background: issue.fg }}
            />
            <span>
              {issue.fg} on {issue.bg}
            </span>
            <span className="ml-1.5 text-muted">
              Ratio {issue.ratio} (needs {issue.required})
            </span>
          </div>
        ) : null}
        {showPreview ? <DocPreview preview={issue.preview!} /> : null}
        {issue.suggestion && !issue.resolved ? (
          <div className="mt-2 rounded-md border-l-[3px] border-info bg-info-soft px-3 py-2 text-[13px]">
            <strong className="text-info">Fix:</strong> {issue.suggestion}
          </div>
        ) : null}
      </div>
      <div className="text-right">
        {issue.resolved ? (
          <span className="badge badge-ok">✓ Fixed</span>
        ) : null}
      </div>
    </li>
  );
}
