import { type InferSchemaType, model, models, Schema } from "mongoose";

export interface IUserSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  moderationReminders: boolean;
  language: string;
  theme: string;
}

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
  settings: IUserSettings;
}

const userSettingsSchema = new Schema<IUserSettings>(
  {
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false },
    moderationReminders: { type: Boolean, default: true },
    language: { type: String, default: "en" },
    theme: { type: String, default: "system" },
  },
  { _id: false },
);

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
        "manage_complaints",
        "manage_announcements",
        "send_messages",
        "manage_documents",
      ],
      default: [],
    },
    managedByOwnerId: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpiry: { type: Date },
    invoiceCounters: { type: Schema.Types.Map, of: Number, default: {} },
    settings: { type: userSettingsSchema, default: () => ({}) },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ role: 1, managedByOwnerId: 1 });

export type UserDocument = InferSchemaType<IUser>;

export const User = models.User || model<IUser>("User", userSchema);
