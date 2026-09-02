import { z } from "zod";

export const VIN_LENGTH = 17;

/** ISO 3779 excludes I, O and Q to avoid confusion with 1 and 0. */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export const normalizeVin = (value: string): string =>
  value.replace(/[\s-]/g, "").toUpperCase().slice(0, VIN_LENGTH);

export const vinSchema = z
  .string()
  .trim()
  .transform(normalizeVin)
  .refine((value) => value.length === VIN_LENGTH, {
    message: `A VIN has exactly ${VIN_LENGTH} characters`,
  })
  .refine((value) => VIN_PATTERN.test(value), {
    message: "A VIN uses A–Z (without I, O, Q) and 0–9 only",
  });

export type VinCheck = { ok: true; vin: string } | { ok: false; error: string };

export const checkVin = (value: string): VinCheck => {
  const result = vinSchema.safeParse(value);
  if (result.success) return { ok: true, vin: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Invalid VIN" };
};

export const isVinValid = (value: string): boolean => vinSchema.safeParse(value).success;

/** Formats as 3-6-8 groups so technicians can read it off the windscreen plate. */
export const formatVinGroups = (vin: string): string => {
  const clean = normalizeVin(vin);
  if (clean.length !== VIN_LENGTH) return clean;
  return `${clean.slice(0, 3)} ${clean.slice(3, 9)} ${clean.slice(9)}`;
};
