"use client";
import Link from "next/link";
import { Users } from "lucide-react";
import { timeAgo } from "@/lib/campus";
import { describeLocation, photoUrl } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type { Issue } from "@/lib/types";
import { CategoryIcon } from "./Icon";
import StatusBadge from "./StatusBadge";

export function Thumb({ issue, size = 56 }: { issue: Issue; size?: number }) {
  const src = photoUrl(issue.before_photo_path);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cardinal to-cardinal-dark text-gold" style={{ width: size, height: size }}>
      <CategoryIcon category={issue.category} size={size * 0.42} />
    </div>
  );
}

export default function IssueCard({ issue }: { issue: Issue }) {
  return (
    <Link href={`/issue/${issue.id}`} onClick={() => haptic()} className="flex items-center gap-3 rounded-2xl bg-surface p-3  transition active:scale-[0.98]">
      <Thumb issue={issue} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{issue.title}</p>
        <p className="truncate text-xs text-muted">
          {describeLocation(issue)} · {timeAgo(issue.created_at)}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusBadge status={issue.status} />
          <span className="flex items-center gap-1 text-xs text-muted">
            <Users size={12} /> {issue.reporter_count}
          </span>
        </div>
      </div>
    </Link>
  );
}
