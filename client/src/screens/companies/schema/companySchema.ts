import { z } from "zod";

// Validation messages are i18n keys, resolved with t() at render.
export const companySchema = z.object({
  name: z.string().min(1, "companies.errName"),
});

export type CompanyFormValues = z.infer<typeof companySchema>;
