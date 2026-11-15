// POST /api/admin/login { passcode } → 200 if it matches ADMIN_PASSCODE. No database involved.
// Preview gate only; production uses USC SSO + an admin role (docs/ADMIN_BACKEND_REQUIREMENTS.md).
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { passcode } = (await req.json().catch(() => ({}))) as { passcode?: string };
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Staff access isn't configured (set ADMIN_PASSCODE)" }, { status: 503 });
    return NextResponse.json({ ok: true, dev: true }); // local dev only
  }
  if (typeof passcode === "string" && passcode === expected) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
}
