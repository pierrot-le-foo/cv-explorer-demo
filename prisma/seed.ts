import { PrismaClient } from "./client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding...");
  // No seed data needed for now, as resumes are loaded via the vectorization process
  console.log("Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });