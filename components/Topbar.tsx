"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "./BrandMark";
import { initialsOf, useApp } from "@/lib/store";

export function Topbar() {
  const { userEmail, logout, pushToast } = useApp();
  const router = useRouter();
  const initials = initialsOf(userEmail);

  const handleLogout = () => {
    logout();
    pushToast("Signed out");
    router.push("/");
  };

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-7 py-3.5">
      <Link href="/dashboard" className="hover:opacity-90">
        <BrandMark />
      </Link>
      <div className="flex items-center gap-4 text-[14px] text-muted">
        <Link
          href="/dashboard"
          className="rounded-md px-2 py-1.5 hover:bg-surface-alt hover:text-text"
        >
          Dashboard
        </Link>
        <Link
          href="/upload"
          className="rounded-md px-2 py-1.5 hover:bg-surface-alt hover:text-text"
        >
          Upload
        </Link>
        <div
          className="grid h-[30px] w-[30px] place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-hover"
          title={userEmail || undefined}
        >
          {initials}
        </div>
        <button onClick={handleLogout} className="btn btn-ghost btn-sm">
          Sign out
        </button>
      </div>
    </div>
  );
}
