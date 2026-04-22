"use client";

import { useEffect, useState } from "react";

const STEPS: { key: string; label: string }[] = [
  { key: "parse", label: "Parsing document structure" },
  { key: "contrast", label: "Checking color contrast" },
  { key: "typography", label: "Measuring font sizes" },
  { key: "alt", label: "Scanning for alternative text" },
  { key: "headings", label: "Evaluating heading structure" },
];

interface Props {
  filename: string;
  /** Called once all steps are marked done */
  onComplete: () => void;
  /** ms per step */
  stepDuration?: number;
}

export function AnalysisSteps({ filename, onComplete, stepDuration = 600 }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    function tick(i: number) {
      if (cancelled) return;
      if (i >= STEPS.length) {
        setTimeout(() => {
          if (!cancelled) onComplete();
        }, 400);
        return;
      }
      setActiveIndex(i);
      const timer = setTimeout(() => {
        if (cancelled) return;
        setDoneSet((prev) => {
          const next = new Set(prev);
          next.add(i);
          return next;
        });
        tick(i + 1);
      }, stepDuration);
      return () => clearTimeout(timer);
    }

    tick(0);

    return () => {
      cancelled = true;
    };
    // Intentionally run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-5 rounded-lg2 border border-border bg-surface p-6">
      <h3 className="m-0 mb-3.5 text-[16px] font-semibold">
        Analyzing <span>{filename}</span>…
      </h3>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {STEPS.map((step, i) => {
          const isDone = doneSet.has(i);
          const isActive = !isDone && i === activeIndex;
          return (
            <li
              key={step.key}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-colors ${
                isDone
                  ? "bg-success-soft text-success"
                  : isActive
                    ? "bg-accent-soft text-accent"
                    : "bg-surface-alt text-muted"
              }`}
            >
              <span
                className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border-2 ${
                  isActive ? "border-t-transparent animate-spin-ring" : ""
                }`}
                style={{ borderColor: "currentColor", ...(isActive ? { borderTopColor: "transparent" } : {}) }}
              >
                {isDone ? (
                  <span className="text-[10px] leading-none">✓</span>
                ) : null}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
