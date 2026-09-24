"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsUpdate, UserSettings } from "@/lib/schemas";

export const DEFAULT_SETTINGS: UserSettings = {
  emailNotifications: true,
  smsNotifications: true,
  marketingEmails: false,
  moderationReminders: true,
  language: "en",
  theme: "system",
};

/**
 * Loads `/api/v1/settings` once and exposes an optimistic `update` that rolls
 * back on failure. The server is the source of truth — its response (defaults
 * merged with stored values) replaces the optimistic value on success.
 */
export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/settings");
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          const merged = { ...DEFAULT_SETTINGS, ...(json.data ?? {}) };
          setSettings(merged);
          settingsRef.current = merged;
          setError(null);
        } else {
          setError(json.error || "Failed to load settings");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: SettingsUpdate): Promise<boolean> => {
    const previous = settingsRef.current;
    const optimistic = { ...previous, ...patch };
    setSettings(optimistic);
    settingsRef.current = optimistic;
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to save settings");
      }
      const merged = { ...DEFAULT_SETTINGS, ...(json.data ?? {}) };
      setSettings(merged);
      settingsRef.current = merged;
      setError(null);
      return true;
    } catch (err) {
      setSettings(previous);
      settingsRef.current = previous;
      setError(err instanceof Error ? err.message : "Network error");
      return false;
    }
  }, []);

  return { settings, loading, error, update };
}
