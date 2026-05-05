-- CreateTable
CREATE TABLE "atletas" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "data_nascimento" TIMESTAMP(3),
    "sexo" TEXT,
    "peso" DOUBLE PRECISION,
    "faixa" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atletas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pontuacoes_kata" (
    "id" SERIAL NOT NULL,
    "atleta_id" INTEGER NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "nome_kata" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pontuacoes_kata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pontuacoes_kumite" (
    "id" SERIAL NOT NULL,
    "atleta_id" INTEGER NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "adversario_nome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pontuacoes_kumite_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pontuacoes_kata" ADD CONSTRAINT "pontuacoes_kata_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "atletas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pontuacoes_kata" ADD CONSTRAINT "pontuacoes_kata_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pontuacoes_kumite" ADD CONSTRAINT "pontuacoes_kumite_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "atletas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pontuacoes_kumite" ADD CONSTRAINT "pontuacoes_kumite_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
