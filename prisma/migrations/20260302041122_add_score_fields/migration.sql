-- AlterTable
ALTER TABLE "pontuacoes_kata" ADD COLUMN     "nota_atletica" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "nota_final" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "nota_tecnica" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "resultado" TEXT;

-- AlterTable
ALTER TABLE "pontuacoes_kumite" ADD COLUMN     "ippon" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "pontos_sofridos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pontos_totais" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resultado" TEXT,
ADD COLUMN     "waza_ari" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "yuko" INTEGER NOT NULL DEFAULT 0;
