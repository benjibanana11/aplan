export const Role = {
  ADMIN: "ADMIN",
  EMPLOYEE: "EMPLOYEE",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const SkillStatus = {
  EN_FORMATION: "EN_FORMATION",
  FORME: "FORME",
  REFERENT: "REFERENT",
} as const;
export type SkillStatus = (typeof SkillStatus)[keyof typeof SkillStatus];

export const AllowedSlot = {
  MORNING: "MORNING",
  AFTERNOON: "AFTERNOON",
  EVENING: "EVENING",
  ALL_DAY: "ALL_DAY",
  CUSTOM: "CUSTOM",
} as const;
export type AllowedSlot = (typeof AllowedSlot)[keyof typeof AllowedSlot];

export const PlanningSource = {
  GENERATED: "GENERATED",
  MANUAL: "MANUAL",
} as const;
export type PlanningSource = (typeof PlanningSource)[keyof typeof PlanningSource];

export const AbsenceStatus = {
  PENDING: "PENDING",
  VALIDATED: "VALIDATED",
  REJECTED: "REJECTED",
} as const;
export type AbsenceStatus = (typeof AbsenceStatus)[keyof typeof AbsenceStatus];
