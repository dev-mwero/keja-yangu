"use client";

import { Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOwnerPaymentConfig } from "@/hooks/use-owner-payment-config";
import { type DarajaEnvironment, PAYMENT_METHOD_META } from "@/lib/payments/methods";

/**
 * Owner settings: how tenants can pay rent. Manual recording is always on;
 * M-Pesa (Daraja) turns on only with a complete, saved credential set; Paystack
 * reflects the platform's own configuration.
 */
export function PaymentMethodsSettings() {
  const { config, loading, saving, save } = useOwnerPaymentConfig();

  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState<DarajaEnvironment>("sandbox");
  const [shortcode, setShortcode] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");

  useEffect(() => {
    setEnabled(config.daraja.enabled);
    setEnvironment(config.daraja.environment);
    setShortcode(config.daraja.shortcode);
    setConsumerKey("");
    setConsumerSecret("");
    setPassphrase("");
  }, [config]);

  const paystackAvailable = config.availableMethods.includes("paystack");

  const handleSave = async () => {
    const daraja: Record<string, string> = {
      environment,
      shortcode: shortcode.trim(),
    };
    if (consumerKey.trim()) daraja.consumerKey = consumerKey.trim();
    if (consumerSecret.trim()) daraja.consumerSecret = consumerSecret.trim();
    if (passphrase.trim()) daraja.passphrase = passphrase.trim();

    const okay = await save({ darajaEnabled: enabled, daraja });
    if (okay) toast.success("Payment settings saved");
    else toast.error("Could not save payment settings");
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">Payment methods</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose how tenants can settle their rent. You can always record payments by hand.
      </p>

      <div className="mt-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{PAYMENT_METHOD_META.manual.label}</p>
            <p className="text-xs text-muted-foreground">
              {PAYMENT_METHOD_META.manual.description}
            </p>
          </div>
          <Badge className="shrink-0 bg-primary/10 text-primary hover:bg-primary/10">
            Always on
          </Badge>
        </div>

        <div className="border-t border-border pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{PAYMENT_METHOD_META.mpesa.label}</p>
              <p className="text-xs text-muted-foreground">
                {PAYMENT_METHOD_META.mpesa.description}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={loading}
              aria-label="Enable M-Pesa (Daraja)"
            />
          </div>

          {enabled && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daraja-environment">Environment</Label>
                <Select
                  value={environment}
                  onValueChange={(v) => setEnvironment(v as DarajaEnvironment)}
                >
                  <SelectTrigger id="daraja-environment" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="daraja-shortcode">Paybill / Till shortcode</Label>
                <Input
                  id="daraja-shortcode"
                  value={shortcode}
                  onChange={(e) => setShortcode(e.target.value)}
                  placeholder="e.g. 174379"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daraja-consumer-key">Consumer key</Label>
                <Input
                  id="daraja-consumer-key"
                  type="password"
                  value={consumerKey}
                  onChange={(e) => setConsumerKey(e.target.value)}
                  placeholder={config.daraja.consumerKeyConfigured ? "•••••••• saved" : "Paste key"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daraja-consumer-secret">Consumer secret</Label>
                <Input
                  id="daraja-consumer-secret"
                  type="password"
                  value={consumerSecret}
                  onChange={(e) => setConsumerSecret(e.target.value)}
                  placeholder={
                    config.daraja.consumerSecretConfigured ? "•••••••• saved" : "Paste secret"
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="daraja-passphrase">Lipa na M-Pesa passkey</Label>
                <Input
                  id="daraja-passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={
                    config.daraja.passphraseConfigured ? "•••••••• saved" : "Paste passkey"
                  }
                />
              </div>
            </div>
          )}

          {enabled && !config.mpesaConfigured && (
            <p className="mt-3 text-xs text-muted-foreground">
              Add every credential and save to turn M-Pesa on for your tenants.
            </p>
          )}
          {config.mpesaConfigured && (
            <p className="mt-3 text-xs text-success">M-Pesa is active for your tenants.</p>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
          <div>
            <p className="text-sm font-medium">{PAYMENT_METHOD_META.paystack.label}</p>
            <p className="text-xs text-muted-foreground">
              {PAYMENT_METHOD_META.paystack.description}
            </p>
          </div>
          <Badge
            className={
              paystackAvailable
                ? "shrink-0 bg-success/15 capitalize text-success hover:bg-success/15"
                : "shrink-0 bg-muted capitalize text-muted-foreground hover:bg-muted"
            }
          >
            {paystackAvailable ? "Available" : "Not configured"}
          </Badge>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button className="rounded-full" disabled={loading || saving} onClick={handleSave}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save payment settings
        </Button>
      </div>
    </section>
  );
}
