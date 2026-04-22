"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { useApp } from "@/lib/store";

export default function LandingPage() {
  const router = useRouter();
  const { isAuthed, hydrated, login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (hydrated && isAuthed) {
      router.replace("/dashboard");
    }
  }, [hydrated, isAuthed, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email || "you@example.com");
    router.push("/dashboard");
  };

  return (
    <div className="grid min-h-screen bg-gradient-to-b from-white to-bg md:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-center gap-6 px-8 py-12 md:px-[72px] md:py-20">
        <BrandMark />
        <h1 className="m-0 text-[44px] font-semibold leading-[1.1] tracking-tight">
          Find and fix accessibility issues in your documents.
        </h1>
        <p className="m-0 max-w-[460px] text-[17px] text-muted">
          Upload a Word document or PowerPoint deck. Clarity reviews the formatting
          for color contrast, font size, alt text, and heading structure — so your
          content works for everyone.
        </p>
        <div className="mt-2 grid gap-3.5">
          <FeatureRow
            letter="A"
            title="Works with DOCX and PPTX"
            blurb="Drag and drop a file and get a report in seconds."
          />
          <FeatureRow
            letter="B"
            title="WCAG-aligned checks"
            blurb="Color contrast, text size, alternative text, and heading order."
          />
          <FeatureRow
            letter="C"
            title="Re-review after you fix"
            blurb="Upload a revised version to confirm issues are resolved."
          />
        </div>
      </section>

      <section className="grid place-items-center px-8 py-12">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg2 border border-border bg-surface p-8 shadow-soft-md"
        >
          <h2 className="m-0 mb-1 text-[22px] font-semibold tracking-tight">
            Sign in
          </h2>
          <div className="mb-5 text-[14px] text-muted">
            Welcome back. Enter anything to continue.
          </div>
          <div className="mb-3.5 grid gap-1.5">
            <label htmlFor="login-email" className="text-[13px] font-medium">
              Work email
            </label>
            <input
              id="login-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              autoComplete="email"
            />
          </div>
          <div className="mb-3.5 grid gap-1.5">
            <label htmlFor="login-password" className="text-[13px] font-medium">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary w-full py-2.5">
            Sign in
          </button>
          <div className="mt-4 text-center text-[13px] text-subtle">
            No account?{" "}
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => {
                login(email || "you@example.com");
                router.push("/dashboard");
              }}
            >
              Create one
            </button>
          </div>
          <div className="mt-4 rounded-md bg-info-soft px-3 py-2.5 text-[12.5px] leading-snug text-info">
            This is a prototype — login is a placeholder and no account is created
            or stored.
          </div>
        </form>
      </section>
    </div>
  );
}

function FeatureRow({
  letter,
  title,
  blurb,
}: {
  letter: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-accent-soft text-[14px] font-bold text-accent">
        {letter}
      </div>
      <div>
        <strong className="block font-semibold">{title}</strong>
        <span className="text-[14px] text-muted">{blurb}</span>
      </div>
    </div>
  );
}
