import { type InferSchemaType, model, models, Schema } from "mongoose";

export interface IUser {
  email: string;
  name: string;
  passwordHash: string;
  role: "tenant" | "caretaker" | "owner" | "system-admin";
  privileges: string[];
  managedByOwnerId: string;
  isActive: boolean;
  isVerified: boolean;
  verificationToken?: string;
  verificationTokenExpiry?: Date;
  invoiceCounters: Record<string, number>;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["tenant", "caretaker", "owner", "system-admin"],
      required: true,
    },
    privileges: {
      type: [String],
      enum: [
        "create_property",
        "edit_property",
        "delete_assigned_property",
        "manage_tenants",
        "manage_invoices",
      ],
      default: [],
    },
    managedByOwnerId: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpiry: { type: Date },
    invoiceCounters: { type: Schema.Types.Map, of: Number, default: {} },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ role: 1, managedByOwnerId: 1 });

export type UserDocument = InferSchemaType<IUser>;

export const User = models.User || model<IUser>("User", userSchema);
