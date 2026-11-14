"use client";
// Global "Fixed" notification: when an issue this device reported becomes resolved.
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { myIssueIds, subscribeIssues } from "@/lib/api";
import { haptic } from "@/lib/haptics";
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
        haptic("success");
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
      <Link href={`/issue/${toast.id}`} onClick={() => setToast(null)} className="animate-toast glass flex items-center gap-3 rounded-2xl p-3 shadow-2xl shadow-resolved/20">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-resolved text-white"><CheckCircle2 size={22} /></div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Fixed: {toast.title}</p>
          <p className="text-xs text-muted">Thanks, Trojan. Your report made this happen. Fight On!</p>
        </div>
      </Link>
    </div>
  );
}
