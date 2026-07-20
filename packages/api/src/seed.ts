import bcrypt from "bcrypt";
import { prisma } from "./db.js";

async function main() {
  const organization = await prisma.organization.upsert({
    where: { teamCode: "LABO2026" },
    update: {},
    create: { name: "Laboratoire", teamCode: "LABO2026" },
  });

  const adminPasswordHash = await bcrypt.hash("admin1234", 12);
  await prisma.user.upsert({
    where: { email: "admin@labo.local" },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Admin",
      email: "admin@labo.local",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      hireDate: new Date("2020-01-01"),
    },
  });

  console.log(`Organisation prête. Code d'équipe: ${organization.teamCode}`);
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
