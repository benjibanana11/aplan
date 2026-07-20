import { z } from "zod";

export const createEmployeeSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
  hireDate: z.string().date("Date d'entrée invalide (AAAA-MM-JJ)").optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email("Email invalide").optional(),
  active: z.boolean().optional(),
  hireDate: z.string().date("Date d'entrée invalide (AAAA-MM-JJ)").optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
