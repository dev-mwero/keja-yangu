"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OwnerPaymentConfigView } from "@/lib/payments/methods";
import type { OwnerPaymentConfigInput } from "@/lib/schemas";

const ENDPOINT = "/api/v1/owner/payment-config";

const EMPTY_CONFIG: OwnerPaymentConfigView = {
  daraja: {
    enabled: false,
    environment: "sandbox",
    shortcode: "",
    consumerKeyConfigured: false,
    consumerSecretConfigured: false,
    passphraseConfigured: false,
  },
  mpesaConfigured: false,
  availableMethods: ["manual"],
};

/**
 * Loads the owner's payment configuration (secrets masked) and exposes a
 * `save` that upserts it. The server response replaces local state, so
 * `*Configured` flags stay accurate after a write.
 */
export function useOwnerPaymentConfig() {
  const [config, setConfig] = useState<OwnerPaymentConfigView>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configRef = useRef<OwnerPaymentConfigView>(EMPTY_CONFIG);

  const apply = useCallback((next: OwnerPaymentConfigView) => {
    setConfig(next);
    configRef.current = next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(ENDPOINT);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          apply(json.data as OwnerPaymentConfigView);
          setError(null);
        } else {
          setError(json.error || "Failed to load payment settings");
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
  }, [apply]);

  const save = useCallback(
    async (input: OwnerPaymentConfigInput): Promise<boolean> => {
      const previous = configRef.current;
      setSaving(true);
      try {
        const res = await fetch(ENDPOINT, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to save payment settings");
        }
        apply(json.data as OwnerPaymentConfigView);
        setError(null);
        return true;
      } catch (err) {
        apply(previous);
        setError(err instanceof Error ? err.message : "Network error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [apply],
  );

  return { config, loading, saving, error, save };
}
