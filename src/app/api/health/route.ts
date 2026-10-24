import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 轻量健康检查：供部署平台探活与 Supabase 保活任务使用。 */
export async function GET() {
  return NextResponse.json({ ok: true, app: "zhimy" });
}
