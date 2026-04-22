"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Document, DocType, Issue } from "./types";
import { SEVERITY_ORDER } from "./types";
import {
  generateMockIssuesFor,
  inferType,
  todayString,
} from "./mock-data";

const SESSION_KEY = "clarity_session_v1";
const ACCOUNT_KEY_PREFIX = "clarity_account_v1:";

function accountKey(email: string | null) {
  if (!email) return null;
  return ACCOUNT_KEY_PREFIX + email.trim().toLowerCase();
}

interface SessionState {
  isAuthed: boolean;
  userEmail: string | null;
}

interface AccountState {
  documents: Document[];
  justReviewedDocId: string | null;
}

interface Toast {
  id: string;
  message: string;
}

interface AppContextValue {
  hydrated: boolean;
  isAuthed: boolean;
  userEmail: string | null;
  documents: Document[];
  justReviewedDocId: string | null;
  toasts: Toast[];
  login: (email: string) => void;
  logout: () => void;
  pushToast: (message: string) => void;
  dismissToast: (id: string) => void;
  clearJustReviewed: () => void;
  addReviewedDocument: (filename: string) => string;
  addReReview: (docId: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function emptyAccount(): AccountState {
  return { documents: [], justReviewedDocId: null };
}

function loadSession(): SessionState {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      return {
        isAuthed: !!parsed.isAuthed,
        userEmail: parsed.userEmail ?? null,
      };
    }
  } catch {
    // ignore parse errors
  }
  return { isAuthed: false, userEmail: null };
}

function loadAccount(email: string | null): AccountState {
  const key = accountKey(email);
  if (!key) return emptyAccount();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AccountState>;
      return {
        documents: Array.isArray(parsed.documents) ? parsed.documents : [],
        justReviewedDocId: parsed.justReviewedDocId ?? null,
      };
    }
  } catch {
    // ignore parse errors
  }
  return emptyAccount();
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<SessionState>({
    isAuthed: false,
    userEmail: null,
  });
  const [account, setAccount] = useState<AccountState>(emptyAccount);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Track the account key we're currently persisting under so we don't
  // accidentally write an empty account over someone else's data during
  // a login handoff.
  const activeAccountKeyRef = useRef<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const s = loadSession();
    setSession(s);
    const acc = loadAccount(s.userEmail);
    setAccount(acc);
    activeAccountKeyRef.current = accountKey(s.userEmail);
    setHydrated(true);
  }, []);

  // Persist session state when it changes (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // ignore
    }
  }, [session, hydrated]);

  // Persist account state when it changes (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    const key = activeAccountKeyRef.current;
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(account));
    } catch {
      // ignore
    }
  }, [account, hydrated]);

  const login = useCallback((email: string) => {
    const normalized = (email || "").trim() || "guest@example.com";
    const key = accountKey(normalized);
    // Load that account's stored data before flipping the ref, so the
    // write-on-change effect doesn't clobber the new account with stale data.
    const loaded = loadAccount(normalized);
    activeAccountKeyRef.current = key;
    setAccount(loaded);
    setSession({ isAuthed: true, userEmail: normalized });
  }, []);

  const logout = useCallback(() => {
    // Keep account data in localStorage so the user can log back in and see it.
    activeAccountKeyRef.current = null;
    setAccount(emptyAccount());
    setSession({ isAuthed: false, userEmail: null });
  }, []);

  const pushToast = useCallback((message: string) => {
    const id = "t_" + Math.random().toString(36).slice(2, 8);
    setToasts((arr) => [...arr, { id, message }]);
    setTimeout(() => {
      setToasts((arr) => arr.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  const clearJustReviewed = useCallback(() => {
    setAccount((s) =>
      s.justReviewedDocId ? { ...s, justReviewedDocId: null } : s,
    );
  }, []);

  const addReviewedDocument = useCallback((filename: string) => {
    const type: DocType = inferType(filename);
    const newDoc: Document = {
      id: "doc_" + Math.random().toString(36).slice(2, 7),
      name: filename,
      type,
      size: "2.1 MB",
      uploadedAt: todayString(),
      versions: [
        {
          version: 1,
          reviewedAt: todayString(),
          score: 71,
          issues: generateMockIssuesFor(type),
        },
      ],
    };
    setAccount((s) => ({
      documents: [newDoc, ...s.documents],
      justReviewedDocId: newDoc.id,
    }));
    return newDoc.id;
  }, []);

  const addReReview = useCallback((docId: string) => {
    setAccount((s) => {
      const docs = s.documents.map((d) => {
        if (d.id !== docId) return d;
        const prev = d.versions[d.versions.length - 1];
        const open = prev.issues.filter((i) => !i.resolved);
        // Resolve ~70% of open issues, prioritizing critical
        const toResolveCount = Math.max(1, Math.floor(open.length * 0.7));
        const sorted = [...open].sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
        );
        const resolveIds = new Set(sorted.slice(0, toResolveCount).map((i) => i.id));
        const newIssues: Issue[] = prev.issues.map((i) =>
          i.resolved || resolveIds.has(i.id) ? { ...i, resolved: true } : i,
        );
        const resolvedNow = newIssues.filter((i) => i.resolved).length;
        const total = newIssues.length;
        const newScore = Math.min(
          100,
          Math.round(60 + (resolvedNow / total) * 40),
        );
        return {
          ...d,
          versions: [
            ...d.versions,
            {
              version: prev.version + 1,
              reviewedAt: todayString(),
              score: newScore,
              issues: newIssues,
              resolvedSinceLast: toResolveCount,
            },
          ],
        };
      });
      return { documents: docs, justReviewedDocId: docId };
    });
  }, []);

  const value: AppContextValue = useMemo(
    () => ({
      hydrated,
      isAuthed: session.isAuthed,
      userEmail: session.userEmail,
      documents: account.documents,
      justReviewedDocId: account.justReviewedDocId,
      toasts,
      login,
      logout,
      pushToast,
      dismissToast,
      clearJustReviewed,
      addReviewedDocument,
      addReReview,
    }),
    [
      hydrated,
      session,
      account,
      toasts,
      login,
      logout,
      pushToast,
      dismissToast,
      clearJustReviewed,
      addReviewedDocument,
      addReReview,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function currentVersionOf(doc: Document) {
  return doc.versions[doc.versions.length - 1];
}

export function initialsOf(email: string | null): string {
  if (!email) return "U";
  const handle = email.split("@")[0] || email;
  return (
    handle
      .split(/[._-]/)
      .map((s) => s[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"
  );
}
