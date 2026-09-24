import { z } from "zod";

export const USER_SETTINGS_LANGUAGES = ["en", "sw", "fr"] as const;
export const USER_SETTINGS_THEMES = ["system", "light", "dark"] as const;

export interface UserSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  moderationReminders: boolean;
  language: (typeof USER_SETTINGS_LANGUAGES)[number];
  theme: (typeof USER_SETTINGS_THEMES)[number];
}

export const DEFAULT_SETTINGS: UserSettings = {
  emailNotifications: true,
  smsNotifications: true,
  marketingEmails: false,
  moderationReminders: true,
  language: "en",
  theme: "system",
};

// Non-strict: unknown keys are stripped. All keys optional — the route turns
// whatever subset arrives into dotted-path `$set` ops on `settings.<key>`.
export const settingsUpdate = z.object({
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  moderationReminders: z.boolean().optional(),
  language: z.enum(USER_SETTINGS_LANGUAGES).optional(),
  theme: z.enum(USER_SETTINGS_THEMES).optional(),
});

export type SettingsUpdate = z.infer<typeof settingsUpdate>;
