"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/phone";

interface CountryCodeSelectProps {
  value: string;
  onChange: (dial: string) => void;
  className?: string;
}

/** Compact dial-code picker used wherever a phone number is entered. */
export const CountryCodeSelect = ({ value, onChange, className }: CountryCodeSelectProps) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className={className ?? "w-32 shrink-0"} aria-label="Country code">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {COUNTRIES.map((country) => (
        <SelectItem key={country.code} value={country.dial}>
          {country.code} {country.dial}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
