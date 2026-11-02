import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCapabilities } from "@/lib/authorization";
import { authenticate } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const capabilities = await getCapabilities(auth.userId);
  if (!capabilities) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ data: capabilities });
}
