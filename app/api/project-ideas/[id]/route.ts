import { NextRequest, NextResponse } from "next/server";
import { deleteProjectIdea } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const removed = await deleteProjectIdea(id);
  if (!removed) {
    return NextResponse.json(
      { ok: false, error: "Idea not found." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
