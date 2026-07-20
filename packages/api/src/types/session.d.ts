import "express-session";
import type { Role } from "@aplan/shared";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: Role;
    organizationId?: string;
  }
}
