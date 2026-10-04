import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { authenticate } from "@/lib/permissions";

const f = createUploadthing();

export const ourFileRouter = {
  propertyImages: f({
    image: { maxFileSize: "4MB", maxFileCount: 8, acl: "public-read" },
  })
    .middleware(async ({ req }) => {
      const auth = authenticate(req);
      if (!auth) {
        throw new UploadThingError("Unauthorized");
      }
      return {
        uploadedBy: auth.userId,
        role: auth.role,
        // Stable public prefix for the files this endpoint returns
        fileUrlPrefix: "https://utfs.io/f",
      };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      return {
        uploadedBy: metadata.uploadedBy,
        role: metadata.role,
        fileUrlPrefix: metadata.fileUrlPrefix,
        ufsUrl: file.ufsUrl,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
