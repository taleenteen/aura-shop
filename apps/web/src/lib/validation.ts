import { z } from "zod";

/**
 * Form validation shared by every form: each form defines a zod schema, checks its values with
 * `validate` before submitting, and shows `fields` under the matching inputs. Field keys use
 * the API's paths ("email", "variants.0.sku"), so client and server errors share one map.
 */
export type FieldErrors = Record<string, string>;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; fields: FieldErrors };

export function validate<S extends z.ZodType>(schema: S, values: unknown): ValidationResult<z.output<S>> {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    fields[key] ??= issue.message; // first problem per field
  }
  return { ok: false, fields };
}

// ---------------------------------------------------------------- shared rules (mirror the API)

/** Same rule as the API's validate.Email: plain local@domain with a dot in the domain. */
export const email = (message = "Enter a valid email address.") =>
  z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your email.")
    .max(254, message)
    .pipe(z.email({ message }));

export const password = z.string().min(6, "Use at least 6 characters.");

export const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}.`).max(max, `Keep it under ${max} characters.`);

export const optionalText = (max: number, message = `Keep it under ${max} characters.`) => z.string().trim().max(max, message);

/** A site path ("/catalog?category=mac") or an absolute http(s) URL; matches the API. */
export const link = (message = "Use a site path like /catalog or an https:// link.") =>
  z
    .string()
    .trim()
    .refine((s) => {
      if (s.startsWith("/") && !s.startsWith("//")) return true;
      try {
        const u = new URL(s);
        return (u.protocol === "http:" || u.protocol === "https:") && !!u.host;
      } catch {
        return false;
      }
    }, message);

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(60, "Use lowercase letters, digits and dashes (max 60).")
  .regex(/^([a-z0-9]+(?:-[a-z0-9]+)*)?$/, "Use lowercase letters, digits and dashes (max 60).");
