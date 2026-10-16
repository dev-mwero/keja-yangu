import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { User } from "@/models/User";

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
      // Re-verify against the database: the JWT alone would let a deactivated
      // account keep uploading until its 7-day token expires.
      await connectToDatabase();
      const user = await User.findById(auth.userId).select("isActive role").lean();
      if (!user?.isActive) {
        throw new UploadThingError("Unauthorized");
      }
      return {
        uploadedBy: auth.userId,
        role: user.role ?? auth.role,
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
