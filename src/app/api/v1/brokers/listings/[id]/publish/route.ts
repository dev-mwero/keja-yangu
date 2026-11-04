import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createBrokerListingPublisher } from "@/lib/brokers";
import { authenticate } from "@/lib/permissions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const publisher = await createBrokerListingPublisher(auth.userId, id);

    return NextResponse.json({
      publisher,
      shareUrl: `/marketplace/${id}?ref=${publisher.shareCode}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to publish listing for broker" },
      { status: 400 },
    );
  }
}
