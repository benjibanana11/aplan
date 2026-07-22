import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "./db.js";

async function main() {
  const company = await prisma.company.upsert({
    where: { id: "seed-company" },
    update: {},
    create: { id: "seed-company", name: "Laboratoire" },
  });
  const team = await prisma.team.upsert({
    where: { teamCode: "LABO2026" },
    update: {},
    create: { companyId: company.id, name: "Laboratoire", teamCode: "LABO2026" },
  });

  const adminPasswordHash = await bcrypt.hash("admin1234", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@labo.local" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@labo.local",
      passwordHash: adminPasswordHash,
      hireDate: new Date("2020-01-01"),
    },
  });
  await prisma.teamMembership.upsert({
    where: { userId_teamId: { userId: admin.id, teamId: team.id } },
    update: {},
    create: { userId: admin.id, teamId: team.id, role: "ADMIN", active: true },
  });

  console.log(`Équipe prête. Code d'équipe: ${team.teamCode}`);
  console.log("Admin: admin@labo.local / admin1234");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
