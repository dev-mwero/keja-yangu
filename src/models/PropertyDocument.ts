import { type InferSchemaType, model, models, Schema } from "mongoose";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SCOPES,
  type DocumentCategory,
  type DocumentScope,
} from "@/lib/domain-enums";

export type { DocumentCategory, DocumentScope };
export { DOCUMENT_CATEGORIES, DOCUMENT_SCOPES };

export interface IPropertyDocument {
  name: string;
  category: DocumentCategory;
  scope: DocumentScope;
  propertyId: string;
  tenantId: string;
  ownerId: string;
  uploadedById: string;
  uploadedByName: string;
  sizeLabel: string;
}

const propertyDocumentSchema = new Schema<IPropertyDocument>(
  {
    name: { type: String, required: true },
    category: { type: String, enum: [...DOCUMENT_CATEGORIES], required: true },
    scope: { type: String, enum: [...DOCUMENT_SCOPES], required: true },
    propertyId: { type: String, default: "" },
    // Empty unless the document is scoped to a specific tenant row.
    tenantId: { type: String, default: "" },
    ownerId: { type: String, required: true },
    uploadedById: { type: String, required: true },
    uploadedByName: { type: String, required: true },
    sizeLabel: { type: String, default: "—" },
  },
  {
    timestamps: true,
  },
);

propertyDocumentSchema.index({ tenantId: 1, createdAt: -1 });
propertyDocumentSchema.index({ propertyId: 1, createdAt: -1 });
propertyDocumentSchema.index({ ownerId: 1, createdAt: -1 });

export type PropertyDocumentDocument = InferSchemaType<IPropertyDocument>;

export const PropertyDocument =
  models.PropertyDocument || model<IPropertyDocument>("PropertyDocument", propertyDocumentSchema);
