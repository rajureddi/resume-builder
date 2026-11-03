import { NextRequest, NextResponse } from "next/server";
import { deleteAtsCheck, getAtsCheck } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const check = await getAtsCheck(id);
  if (!check) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, check });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const removed = await deleteAtsCheck(id);
  return NextResponse.json({ ok: removed });
}
