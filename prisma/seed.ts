import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

const ADMIN_QUOTA = {
  tier: "ADMIN" as const,
  maxPapersPerDay: 1000,
  maxPapersPerMonth: 10000,
  maxTokensPerMonth: 100000000,
};

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? null;

  if (!email || !password) {
    console.error(
      "Missing required environment variables: ADMIN_EMAIL and ADMIN_PASSWORD"
    );
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const existing = await prisma.user.findUnique({ where: { email } });

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name,
        role: "ADMIN",
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
      },
      update: {
        role: "ADMIN",
        passwordHash,
        name,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        deletedAt: null,
        deletedById: null,
      },
    });

    await prisma.userQuota.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...ADMIN_QUOTA },
      update: { ...ADMIN_QUOTA },
    });

    if (existing) {
      console.log(
        `Promoted existing user ${user.email} to ADMIN (updated password, name, and quota)`
      );
    } else {
      console.log(`Created admin user ${user.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
