/**
 * Dev-only fixture for manually exercising the planning engine (packages/api/src/planning)
 * before the Jalon 4 skills-management UI exists. Not part of the shipped app.
 */
import bcrypt from "bcrypt";
import { prisma } from "./db.js";

const TEST_DATE = "2026-07-20";
const YESTERDAY = "2026-07-19";

async function upsertEmployee(organizationId: string, name: string, email: string) {
  const passwordHash = await bcrypt.hash("password123", 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { organizationId, name, email, passwordHash, role: "EMPLOYEE", hireDate: new Date("2026-01-01") },
  });
}

async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { teamCode: "LABO2026" } });

  const alice = await upsertEmployee(organization.id, "Alice Dupont", "alice@labo.local");
  const bob = await upsertEmployee(organization.id, "Bob Martin", "bob@labo.local");
  const chloe = await upsertEmployee(organization.id, "Chloé Bernard", "chloe@labo.local");
  // David rejoint le planning du TEST_DATE sans jamais recevoir de PlanningBlock via une
  // génération : il sert de remplaçant "disponible" pour tester la suggestion d'absence (jalon 5),
  // qui ne considère occupé que ce qui existe réellement en base ce jour-là.
  const david = await upsertEmployee(organization.id, "David Rousseau", "david@labo.local");

  for (const employee of [alice, bob, chloe]) {
    for (const date of [TEST_DATE, YESTERDAY]) {
      await prisma.workSchedule.upsert({
        where: { employeeId_date: { employeeId: employee.id, date: new Date(`${date}T00:00:00.000Z`) } },
        update: { startTime: "08:00", endTime: "16:00" },
        create: {
          employeeId: employee.id,
          date: new Date(`${date}T00:00:00.000Z`),
          startTime: "08:00",
          endTime: "16:00",
        },
      });
    }
  }

  await prisma.workSchedule.upsert({
    where: { employeeId_date: { employeeId: david.id, date: new Date(`${TEST_DATE}T00:00:00.000Z`) } },
    update: { startTime: "08:00", endTime: "16:00" },
    create: { employeeId: david.id, date: new Date(`${TEST_DATE}T00:00:00.000Z`), startTime: "08:00", endTime: "16:00" },
  });

  const tasks = await prisma.task.findMany({ where: { organizationId: organization.id } });
  const encodage = tasks.find((t) => t.name.toLowerCase() === "encodage");
  const reencodage = tasks.find((t) => t.name.toLowerCase().startsWith("réencodage"));
  const signaletique = tasks.find((t) => t.name.toLowerCase().startsWith("signal"));
  if (!encodage || !reencodage || !signaletique) {
    throw new Error("Attendu : les tâches Encodage, Réencodage et Signalétique (créées via le jalon 2) doivent exister.");
  }

  await prisma.task.update({ where: { id: encodage.id }, data: { requiresTraining: false } });
  await prisma.task.update({
    where: { id: signaletique.id },
    data: { maxTraineeSlots: 1, minStaff: 1, targetStaff: 2, maxStaff: 2 },
  });
  await prisma.task.update({
    where: { id: reencodage.id },
    data: { minStaff: 1, targetStaff: 2, maxStaff: 3 },
  });

  const skill = (employeeId: string, taskId: string, status: string, hoursRequired = 20) =>
    prisma.employeeTaskSkill.upsert({
      where: { employeeId_taskId: { employeeId, taskId } },
      update: { status },
      create: { employeeId, taskId, status, hoursRequired, hoursCompleted: hoursRequired },
    });

  await skill(alice.id, reencodage.id, "FORME");
  await skill(alice.id, signaletique.id, "EN_FORMATION", 10);
  await skill(bob.id, signaletique.id, "REFERENT");
  await skill(bob.id, reencodage.id, "FORME");
  await skill(chloe.id, reencodage.id, "FORME");
  await skill(david.id, signaletique.id, "FORME");

  // Simule un historique "hier" : Alice a fait Réencodage, pour tester la rotation aujourd'hui.
  await prisma.planningBlock.deleteMany({ where: { date: new Date(`${YESTERDAY}T00:00:00.000Z`) } });
  await prisma.planningBlock.create({
    data: {
      employeeId: alice.id,
      taskId: reencodage.id,
      date: new Date(`${YESTERDAY}T00:00:00.000Z`),
      startTime: "08:00",
      endTime: "16:00",
      source: "MANUAL",
      justification: "Fixture de test (rotation).",
    },
  });

  console.log(`Fixture prête pour le ${TEST_DATE} (org ${organization.teamCode}).`);
  console.log(`Employés : Alice (${alice.id}), Bob (${bob.id}), Chloé (${chloe.id}), David (${david.id})`);
  console.log(`Tâches : Encodage (${encodage.id}), Réencodage (${reencodage.id}), Signalétique (${signaletique.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
