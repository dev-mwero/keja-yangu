import { Schema, model, models, type InferSchemaType } from "mongoose";

export interface IUser {
  email: string;
  name: string;
  passwordHash: string;
  role: "tenant" | "caretaker" | "owner";
  isActive: boolean;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["tenant", "caretaker", "owner"], required: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export type UserDocument = InferSchemaType<IUser>;

export const User = models.User || model<IUser>("User", userSchema);
