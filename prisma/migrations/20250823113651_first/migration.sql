CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "public"."Resume" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);
