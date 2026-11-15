"use client";
// One post in a Help SC feed: text first, one quiet meta line, latest reply preview.
import { Camera, CornerDownRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import { fmtDistance, KIND, shortPlace } from "@/lib/help";
import type { FeedRow as Row } from "@/lib/use-help";

export default function FeedRow({ row, fresh }: { row: Row; fresh?: boolean }) {
  const { post: p, latest, distance } = row;
  const m = KIND[p.kind];
  const solved = p.status === "resolved";
  const tagged = p.kind === "lost" || p.kind === "found";
  return (
    <Link href={`/help/post/${p.id}`} onClick={() => haptic()} className={`block px-4 py-3.5 transition-colors active:bg-surface-2 ${fresh ? "bg-gold/[0.07]" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {(tagged || solved) && (
            <p className="mb-0.5 text-[12px] font-semibold" style={{ color: solved ? "var(--color-resolved)" : m.tint }}>
              {solved ? m.doneLabel : m.label}
            </p>
          )}
          <p className={`line-clamp-3 text-[16px] leading-snug ${solved ? "text-muted" : ""}`}>{p.title}</p>
          <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
            <span className="truncate">{shortPlace(p.location_name)}</span>
            {distance !== null && <span className="shrink-0">· {fmtDistance(distance)}</span>}
            <span className="shrink-0">· {timeAgo(p.created_at)}</span>
            {p.photo_path && <Camera size={13} className="ml-0.5 shrink-0" aria-label="Has photo" />}
          </p>
        </div>
        {p.reply_count > 0 && (
          <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted">
            <MessageCircle size={15} /> {p.reply_count}
          </span>
        )}
      </div>
      {latest?.body && (
        <p className="mt-2 flex items-start gap-1.5 text-[14px] text-muted">
          <CornerDownRight size={14} className="mt-[3px] shrink-0" />
          <span className="line-clamp-1 text-ink/80">{latest.body}</span>
          <span className="shrink-0">· {timeAgo(latest.created_at)}</span>
        </p>
      )}
    </Link>
  );
}
