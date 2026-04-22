import type { IssueSeverity } from "@/lib/types";

export function SeverityBadge({
  severity,
  resolved,
}: {
  severity: IssueSeverity;
  resolved?: boolean;
}) {
  if (resolved) {
    return <span className="badge badge-ok">Resolved</span>;
  }
  if (severity === "critical") {
    return <span className="badge badge-crit">Critical</span>;
  }
  if (severity === "warning") {
    return <span className="badge badge-warn">Warning</span>;
  }
  return <span className="badge badge-info">Info</span>;
}
