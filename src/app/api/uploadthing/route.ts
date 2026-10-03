import type { NextRequest } from "next/server";
import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

function assertUploadthingEnv() {
  const token = process.env.UPLOADTHING_TOKEN;
  const legacy = process.env.UPLOADTHING_SECRET && process.env.UPLOADTHING_APP_ID;
  if (!token && !legacy) {
    throw new Error(
      "UploadThing is not configured: set UPLOADTHING_TOKEN (or UPLOADTHING_SECRET and UPLOADTHING_APP_ID) in your environment.",
    );
  }
}

const handler = createRouteHandler({ router: ourFileRouter });

export async function GET(request: NextRequest) {
  assertUploadthingEnv();
  return handler.GET(request);
}

export async function POST(request: NextRequest) {
  assertUploadthingEnv();
  return handler.POST(request);
}
