import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1, "Nom d'entreprise requis"),
  teamName: z.string().min(1, "Nom d'équipe requis"),
  teamCode: z
    .string()
    .min(3, "Code d'équipe : 3 caractères minimum")
    .regex(/^[A-Za-z0-9-]+$/, "Lettres, chiffres et tirets uniquement"),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const createTeamSchema = z.object({
  name: z.string().min(1, "Nom d'équipe requis"),
  teamCode: z
    .string()
    .min(3, "Code d'équipe : 3 caractères minimum")
    .regex(/^[A-Za-z0-9-]+$/, "Lettres, chiffres et tirets uniquement"),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
