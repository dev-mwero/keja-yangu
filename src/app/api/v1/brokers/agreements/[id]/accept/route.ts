import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { acceptCommissionAgreement } from "@/lib/brokers";
import { authenticate } from "@/lib/permissions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const updated = await acceptCommissionAgreement(auth.userId, id);
    return NextResponse.json({ agreement: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to accept agreement" },
      { status: 400 },
    );
  }
}
