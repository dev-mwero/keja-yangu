"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AMENITY_OPTIONS, normalizeAmenities } from "@/lib/amenities";
import { cn } from "@/lib/utils";

export interface AmenityPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

const CATEGORY_ORDER = [
  "Recreation",
  "Outdoor",
  "Convenience",
  "Utilities",
  "Security",
  "Services",
  "Unit",
];

export const AmenityPicker = ({ value, onChange, disabled = false }: AmenityPickerProps) => {
  const [custom, setCustom] = useState("");
  const selectedKeys = new Set(value.map((v) => v.toLowerCase()));

  const toggle = (label: string) => {
    if (selectedKeys.has(label.toLowerCase())) {
      onChange(value.filter((v) => v.toLowerCase() !== label.toLowerCase()));
    } else {
      onChange(normalizeAmenities([...value, label]));
    }
  };

  const addCustom = () => {
    const next = normalizeAmenities([...value, custom]);
    onChange(next);
    setCustom("");
  };

  const customSelected = value.filter(
    (v) => !AMENITY_OPTIONS.some((a) => a.label.toLowerCase() === v.toLowerCase()),
  );

  const byCategory = new Map<string, string[]>();
  for (const option of AMENITY_OPTIONS) {
    const list = byCategory.get(option.category) ?? [];
    list.push(option.label);
    byCategory.set(option.category, list);
  }

  return (
    <div className="space-y-3">
      {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => (
        <div key={category} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{category}</p>
          <div className="flex flex-wrap gap-2">
            {(byCategory.get(category) ?? []).map((label) => {
              const selected = selectedKeys.has(label.toLowerCase());
              return (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(label)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Input
          value={custom}
          disabled={disabled}
          placeholder="Add a custom amenity…"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (custom.trim()) addCustom();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !custom.trim()}
          onClick={addCustom}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {customSelected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customSelected.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {label}
              <button
                type="button"
                aria-label={`Remove ${label}`}
                disabled={disabled}
                onClick={() => toggle(label)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
