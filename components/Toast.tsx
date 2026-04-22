"use client";

import { useApp } from "@/lib/store";

export function ToastHost() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[200] grid gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto animate-slide-up rounded-lg bg-text px-3.5 py-2.5 text-[14px] text-white shadow-soft-md"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
