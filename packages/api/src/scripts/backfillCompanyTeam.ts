/**
 * Étape B du plan multi-entreprises/multi-équipes : script ponctuel, à lancer une seule fois
 * manuellement (jamais depuis le pipeline de déploiement) après l'étape A (schéma additif).
 *
 * Pour chaque Organization existante, crée une Company et une Team correspondantes (même
 * teamCode, pour ne pas casser l'inscription en cours), crée une TeamMembership par User
 * (reprenant son role/active actuels), et renseigne le nouveau teamId sur Task, SchedulePreset,
 * WorkSchedule, PlanningBlock, Absence et EmployeeTaskSkill.
 *
 * Tout se passe dans UNE seule transaction (le volume de données est faible — une poignée
 * d'organisations, dizaines d'employés) : soit tout réussit, soit rien n'est écrit. Utiliser
 * --dry-run pour prévisualiser les compteurs sans rien écrire (la transaction est exécutée en
 * entier puis délibérément annulée).
 *
 * Usage : npm run backfill:company-team --workspace packages/api [-- --dry-run]
 */
import "dotenv/config";
import { prisma } from "../db.js";

const DRY_RUN = process.argv.includes("--dry-run");

class DryRunAbort extends Error {
  constructor(public summary: string) {
    super("dry-run-abort");
  }
}

async function run() {
  const summary = await prisma.$transaction(async (tx) => {
    const organizations = await tx.organization.findMany();
    if (organizations.length === 0) {
      return "Aucune Organization trouvée — rien à faire.";
    }

    const lines: string[] = [];
    let totalMemberships = 0;

    for (const organization of organizations) {
      const company = await tx.company.create({
        data: { name: organization.name },
      });
      const team = await tx.team.create({
        data: { companyId: company.id, name: organization.name, teamCode: organization.teamCode },
      });

      const users = await tx.user.findMany({ where: { organizationId: organization.id } });
      for (const user of users) {
        await tx.teamMembership.create({
          data: { userId: user.id, teamId: team.id, role: user.role, active: user.active },
        });
      }
      totalMemberships += users.length;

      const [taskResult, presetResult, scheduleResult, blockResult, absenceResult, skillResult] = await Promise.all([
        tx.task.updateMany({ where: { organizationId: organization.id }, data: { teamId: team.id } }),
        tx.schedulePreset.updateMany({ where: { organizationId: organization.id }, data: { teamId: team.id } }),
        tx.workSchedule.updateMany({
          where: { employee: { organizationId: organization.id } },
          data: { teamId: team.id },
        }),
        tx.planningBlock.updateMany({
          where: { task: { organizationId: organization.id } },
          data: { teamId: team.id },
        }),
        tx.absence.updateMany({
          where: { employee: { organizationId: organization.id } },
          data: { teamId: team.id },
        }),
        tx.employeeTaskSkill.updateMany({
          where: { task: { organizationId: organization.id } },
          data: { teamId: team.id },
        }),
      ]);

      lines.push(
        `Organization "${organization.name}" (${organization.teamCode}) → Team ${team.id} sous Company ${company.id} : ` +
          `${users.length} membre(s), ${taskResult.count} tâche(s), ${presetResult.count} préréglage(s), ` +
          `${scheduleResult.count} horaire(s), ${blockResult.count} bloc(s) de planning, ` +
          `${absenceResult.count} absence(s), ${skillResult.count} compétence(s).`
      );
    }

    // Assertions : aucune ligne orpheline ne doit rester sans teamId après le backfill.
    const [usersCount, membershipsCount, nullTask, nullPreset, nullSchedule, nullBlock, nullAbsence, nullSkill] =
      await Promise.all([
        tx.user.count(),
        tx.teamMembership.count(),
        tx.task.count({ where: { teamId: null } }),
        tx.schedulePreset.count({ where: { teamId: null } }),
        tx.workSchedule.count({ where: { teamId: null } }),
        tx.planningBlock.count({ where: { teamId: null } }),
        tx.absence.count({ where: { teamId: null } }),
        tx.employeeTaskSkill.count({ where: { teamId: null } }),
      ]);

    if (membershipsCount !== usersCount) {
      throw new Error(
        `Assertion échouée : ${usersCount} User(s) mais ${membershipsCount} TeamMembership(s) — écart de ${usersCount - membershipsCount}.`
      );
    }
    const orphans = { nullTask, nullPreset, nullSchedule, nullBlock, nullAbsence, nullSkill };
    const orphanTotal = Object.values(orphans).reduce((a, b) => a + b, 0);
    if (orphanTotal > 0) {
      throw new Error(`Assertion échouée : lignes restées sans teamId : ${JSON.stringify(orphans)}`);
    }

    const summary = [
      ...lines,
      "",
      `Vérification : ${usersCount} User(s) == ${membershipsCount} TeamMembership(s). Zéro ligne orpheline sans teamId sur les 6 tables.`,
    ].join("\n");

    if (DRY_RUN) {
      throw new DryRunAbort(summary);
    }

    return summary;
  }, { timeout: 60000 });

  console.log(DRY_RUN ? "[DRY RUN — rien n'a été écrit]\n" : "[BACKFILL APPLIQUÉ]\n");
  console.log(summary);
}

run()
  .catch((error) => {
    if (error instanceof DryRunAbort) {
      console.log("[DRY RUN — rien n'a été écrit, transaction annulée volontairement]\n");
      console.log(error.summary);
      return;
    }
    console.error("Échec du backfill (transaction annulée, aucune donnée modifiée) :");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
