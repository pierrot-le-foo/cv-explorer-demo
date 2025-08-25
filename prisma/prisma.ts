import { PrismaClient } from "./client";
import { withAccelerate } from "@prisma/extension-accelerate";

// Create the extended client type
const createExtendedClient = () => {
  return new PrismaClient({
    errorFormat: "minimal",
    log: ["query", "info", "warn", "error"],
  }).$extends(withAccelerate());
};

type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

const globalForPrisma = global as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? createExtendedClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
export type { ExtendedPrismaClient };
