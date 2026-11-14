import { STATUS } from "@/lib/campus";
import type { Status } from "@/lib/types";

export default function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: s.color, background: s.bg }}>
      <span className="relative flex h-1.5 w-1.5">
        {status === "open" && <span className="absolute inset-0 animate-ping rounded-full" style={{ background: s.color }} />}
        <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      </span>
      {s.label}
    </span>
  );
}
