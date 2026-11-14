import Link from "next/link";
import { CATEGORIES, timeAgo } from "@/lib/campus";
import { describeLocation, photoUrl } from "@/lib/api";
import type { Issue } from "@/lib/types";
import StatusBadge from "./StatusBadge";

export function Thumb({ issue, size = 56 }: { issue: Issue; size?: number }) {
  const src = photoUrl(issue.before_photo_path);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid shrink-0 place-items-center rounded-xl bg-canvas text-2xl" style={{ width: size, height: size }}>
      {CATEGORIES[issue.category].icon}
    </div>
  );
}

export default function IssueCard({ issue }: { issue: Issue }) {
  return (
    <Link href={`/issue/${issue.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 active:scale-[0.98] transition">
      <Thumb issue={issue} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{issue.title}</p>
        <p className="truncate text-xs text-muted">
          {describeLocation(issue)} · {timeAgo(issue.created_at)}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusBadge status={issue.status} />
          <span className="text-xs text-muted">👥 {issue.reporter_count}</span>
        </div>
      </div>
    </Link>
  );
}
