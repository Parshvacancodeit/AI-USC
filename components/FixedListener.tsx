"use client";
// Global "Fixed" notification: when an issue this device reported becomes resolved.
import Link from "next/link";
import { useEffect, useState } from "react";
import { myIssueIds, subscribeIssues } from "@/lib/api";
import type { Issue } from "@/lib/types";

const KEY = "ripple-notified";

export default function FixedListener() {
  const [toast, setToast] = useState<Issue | null>(null);

  useEffect(
    () =>
      subscribeIssues((issue) => {
        if (issue.status !== "resolved" || !myIssueIds().includes(issue.id)) return;
        const seen: string[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
        if (seen.includes(issue.id)) return;
        localStorage.setItem(KEY, JSON.stringify([...seen, issue.id]));
        navigator.vibrate?.(200);
        setToast(issue);
      }),
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 mx-auto max-w-[480px] px-3 pt-[max(12px,env(safe-area-inset-top))]">
      <Link href={`/issue/${toast.id}`} onClick={() => setToast(null)} className="animate-toast glass flex items-center gap-3 rounded-2xl border border-line p-3 shadow-xl">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-resolved text-lg text-white">✓</div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Fixed: {toast.title}</p>
          <p className="text-xs text-muted">Thanks for reporting, Trojan. You made this happen.</p>
        </div>
      </Link>
    </div>
  );
}
