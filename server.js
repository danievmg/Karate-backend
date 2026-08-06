const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const prisma = new PrismaClient();

// ==========================================
// --- CONFIGURAÇÃO DE CORS CONFIGURADA ---
// ==========================================
const allowedOrigins = [
  'https://karate-frontend-psi.vercel.app', 
  'https://karate-frontend-git-projetogit-daniel-rls-projects.vercel.app', 
  'http://localhost:5173',                  
  'http://localhost:3000'                   
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado pelo CORS: Origem não permitida pela política de segurança.'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "223155ç"; 

// --- MIDDLEWARE DE AUTORIZAÇÃO ---
const verificarPermissao = (rolesPermitidos) => {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "Token não fornecido. Acesso negado." });

        const token = authHeader.split(' ')[1];

        try {
            const dados = jwt.verify(token, JWT_SECRET);
            req.usuarioLogado = dados; 

            if (rolesPermitidos && !rolesPermitidos.includes(dados.role)) {
                return res.status(403).json({ error: "Acesso negado: O seu cargo não tem permissão para esta ação." });
            }
            next(); 
        } catch (err) {
            return res.status(401).json({ error: "Token inválido ou expirado. Faça login novamente." });
        }
    };
};

// ==========================================
// --- AUTENTICAÇÃO E UTILIZADORES ---
// ==========================================

// Setup do primeiro admin
app.post('/api/usuarios/setup', async (req, res) => {
    try {
        const adminJaExiste = await prisma.usuario.findFirst({ where: { role: 'admin' } });
        if (adminJaExiste) return res.status(403).json({ error: "O sistema já possui um Administrador." });

        const { nome, email, senha, role } = req.body;
        const existe = await prisma.usuario.findUnique({ where: { email } });
        if (existe) return res.status(400).json({ error: "Email já cadastrado." });

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        await prisma.usuario.create({
            data: { nome, email, senha: senhaHash, role: role || 'admin', email_verificado: true }
        });
        res.json({ message: "Usuário Admin criado com sucesso!" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao criar usuário" });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await prisma.usuario.findUnique({ where: { email } });
        
        if (!usuario) return res.status(404).json({ error: "Utilizador não encontrado." });
        
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ error: "Palavra-passe incorreta." });

        const token = jwt.sign(
            { id: usuario.id, role: usuario.role, nome: usuario.nome },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, role: usuario.role } });
    } catch (error) {
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

// Cadastro
app.post('/api/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const existe = await prisma.usuario.findUnique({ where: { email } });
        if (existe) return res.status(400).json({ error: "Este email já está em uso." });

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        await prisma.usuario.create({
            data: { nome, email, senha: senhaHash, role: 'aluno' }
        });
        
        res.json({ message: "Conta criada com sucesso! Verifique seu e-mail para validar a conta." });
    } catch (error) {
        res.status(500).json({ error: "Erro interno ao criar a conta." });
    }
});

// ==========================================
// --- NOVAS ROTAS: GESTÃO DE DOJOS ---
// ==========================================

// 1. Criar um Dojo (O criador vira ADMIN automaticamente)
app.post('/api/dojos', verificarPermissao(['admin', 'sensei', 'aluno']), async (req, res) => {
    try {
        const { nome, logo_url } = req.body;
        const usuarioId = req.usuarioLogado.id;

        // Inicia uma transação: Cria o Dojo e já insere o criador como ADMIN e ACEITO
        const novoDojo = await prisma.$transaction(async (tx) => {
            const dojo = await tx.dojo.create({
                data: { nome, logo_url, criador_id: usuarioId }
            });

            await tx.membroDojo.create({
                data: {
                    dojo_id: dojo.id,
                    usuario_id: usuarioId,
                    papel: 'ADMIN',
                    status: 'ACEITO'
                }
            });

            return dojo;
        });

        res.json({ message: "Dojo criado com sucesso!", dojo: novoDojo });
    } catch (error) {
        res.status(500).json({ error: "Erro ao criar Dojo", detalhe: error.message });
    }
});

// 2. Aluno solicita entrada em um Dojo
app.post('/api/dojos/:id/solicitar', verificarPermissao(['aluno', 'mesario', 'sensei']), async (req, res) => {
    try {
        const dojoId = parseInt(req.params.id);
        const usuarioId = req.usuarioLogado.id;

        const solicitacao = await prisma.membroDojo.create({
            data: {
                dojo_id: dojoId,
                usuario_id: usuarioId,
                papel: 'ALUNO',
                status: 'PENDENTE'
            }
        });

        res.json({ message: "Solicitação enviada! Aguarde a aprovação.", solicitacao });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: "Você já enviou uma solicitação para este Dojo." });
        }
        res.status(500).json({ error: "Erro ao solicitar entrada." });
    }
});

// 3. Admin do Dojo Aceita ou Recusa a solicitação
app.put('/api/dojos/solicitacoes/:id_solicitacao', verificarPermissao(['admin', 'sensei']), async (req, res) => {
    try {
        const idSolicitacao = parseInt(req.params.id_solicitacao);
        const { status } = req.body; // Esperado: 'ACEITO' ou 'RECUSADO'
        const usuarioLogadoId = req.usuarioLogado.id;

        if (!['ACEITO', 'RECUSADO'].includes(status)) {
            return res.status(400).json({ error: "Status inválido." });
        }

        const solicitacaoExistente = await prisma.membroDojo.findUnique({
            where: { id: idSolicitacao }
        });

        if (!solicitacaoExistente) {
            return res.status(404).json({ error: "Solicitação não encontrada." });
        }

        // Verifica se quem está aceitando é ADMIN daquele Dojo específico
        const isAdmin = await prisma.membroDojo.findFirst({
            where: {
                dojo_id: solicitacaoExistente.dojo_id,
                usuario_id: usuarioLogadoId,
                papel: 'ADMIN'
            }
        });

        // Se não for admin daquele dojo específico, e não for o super admin geral
        if (!isAdmin && req.usuarioLogado.role !== 'admin') {
            return res.status(403).json({ error: "Você não tem permissão para gerir este Dojo." });
        }

        const atualizada = await prisma.membroDojo.update({
            where: { id: idSolicitacao },
            data: { status }
        });

        res.json({ message: `Solicitação marcada como ${status}`, solicitacao: atualizada });
    } catch (error) {
        res.status(500).json({ error: "Erro ao processar solicitação." });
    }
});

// ==========================================
// --- NOVAS ROTAS: RESPONSÁVEIS ---
// ==========================================

// Vincular um pai/responsável a um atleta
app.post('/api/vinculos', verificarPermissao(['admin', 'sensei', 'aluno']), async (req, res) => {
    try {
        const { atleta_id, responsavel_email, parentesco } = req.body;

        const responsavel = await prisma.usuario.findUnique({ where: { email: responsavel_email } });
        if (!responsavel) return res.status(404).json({ error: "Responsável não possui cadastro no sistema." });

        const vinculo = await prisma.vinculoResponsavel.create({
            data: {
                atleta_id: parseInt(atleta_id),
                responsavel_id: responsavel.id,
                parentesco: parentesco || "Responsável"
            }
        });

        res.json({ message: "Vínculo criado com sucesso!", vinculo });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ error: "Este responsável já está vinculado a este atleta." });
        res.status(500).json({ error: "Erro ao criar vínculo." });
    }
});

// ==========================================
// --- ATLETAS ---
// ==========================================

app.get('/api/atletas', verificarPermissao(['admin', 'sensei', 'mesario', 'aluno']), async (req, res) => {
    try {
        const atletas = await prisma.atleta.findMany({ orderBy: { nome: 'asc' } });
        res.json(atletas);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar atletas" });
    }
});

app.post('/api/atletas', verificarPermissao(['admin', 'sensei']), async (req, res) => {
    try {
        const { nome, faixa, peso, sexo, data_nascimento } = req.body;
        const novoAtleta = await prisma.atleta.create({
            data: {
                nome, faixa, sexo,
                peso: peso ? parseFloat(peso) : null,
                data_nascimento: data_nascimento ? new Date(data_nascimento) : null
            }
        });
        res.json(novoAtleta);
    } catch (error) {
        res.status(500).json({ error: "Erro ao criar atleta" });
    }
});

app.put('/api/atletas/:id', verificarPermissao(['admin', 'sensei']), async (req, res) => {
    try {
        const { nome, faixa, peso, sexo, data_nascimento } = req.body;
        const atualizado = await prisma.atleta.update({
            where: { id: parseInt(req.params.id) },
            data: {
                nome, faixa, sexo,
                peso: peso ? parseFloat(peso) : null,
                data_nascimento: data_nascimento ? new Date(data_nascimento) : null
            }
        });
        res.json(atualizado);
    } catch (error) {
        res.status(500).json({ error: "Erro ao atualizar atleta" });
    }
});

app.delete('/api/atletas/:id', verificarPermissao(['admin']), async (req, res) => {
    try {
        await prisma.atleta.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: "Atleta apagado com sucesso" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao apagar atleta" });
    }
});

// ==========================================
// --- EVENTOS ---
// ==========================================

app.get('/api/eventos', verificarPermissao(['admin', 'sensei', 'mesario', 'aluno']), async (req, res) => {
    try {
        const eventos = await prisma.evento.findMany({ orderBy: { data: 'desc' } });
        res.json(eventos);
    } catch (e) {
        res.status(500).json({ error: "Erro ao buscar eventos" });
    }
});

app.post('/api/eventos', verificarPermissao(['admin', 'sensei']), async (req, res) => {
    try {
        const { nome, tipo, data, local, observacoes } = req.body;
        const novo = await prisma.evento.create({
            data: { nome, tipo, local, observacoes, data: new Date(data) }
        });
        res.json(novo);
    } catch (e) {
        res.status(500).json({ error: "Erro ao salvar evento" });
    }
});

app.put('/api/eventos/:id', verificarPermissao(['admin', 'sensei']), async (req, res) => {
    try {
        const { nome, tipo, data, local, observacoes } = req.body;
        const atualizado = await prisma.evento.update({
            where: { id: parseInt(req.params.id) },
            data: { nome, tipo, local, observacoes, data: new Date(data) }
        });
        res.json(atualizado);
    } catch (e) {
        res.status(500).json({ error: "Erro ao atualizar evento" });
    }
});

app.delete('/api/eventos/:id', verificarPermissao(['admin']), async (req, res) => {
    try {
        await prisma.evento.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: "Evento apagado com sucesso" });
    } catch (e) {
        res.status(500).json({ error: "Erro ao apagar evento" });
    }
});

// ==========================================
// --- PONTUAÇÕES (KATA) ---
// ==========================================

app.get('/api/pontuacoes/kata', verificarPermissao(['admin', 'sensei', 'mesario', 'aluno']), async (req, res) => {
    try {
        const notas = await prisma.pontuacaoKata.findMany({ 
            include: { atleta: true, evento: true },
            orderBy: { data: 'desc' } 
        });
        res.json(notas);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar Katas" });
    }
});

app.post('/api/pontuacoes/kata', verificarPermissao(['admin', 'sensei', 'mesario']), async (req, res) => {
    try {
        const { atleta_id, evento_id, data, nome_kata, nota_tecnica, nota_atletica, nota_final, resultado, observacoes } = req.body;
        
        const dataInput = {
            atleta: { connect: { id: parseInt(atleta_id) } },
            nome_kata: nome_kata || "",
            nota_tecnica: parseFloat(nota_tecnica || 0),
            nota_atletica: parseFloat(nota_atletica || 0),
            nota_final: parseFloat(nota_final || 0),
            resultado, observacoes: observacoes || "", data: new Date(data)
        };

        if (evento_id && evento_id !== "" && evento_id !== "null") {
            dataInput.evento = { connect: { id: parseInt(evento_id) } };
        }

        const nota = await prisma.pontuacaoKata.create({ data: dataInput });
        res.json(nota);
    } catch (error) {
        res.status(500).json({ error: "Erro ao salvar Kata" });
    }
});

app.put('/api/pontuacoes/kata/:id', verificarPermissao(['admin', 'sensei', 'mesario']), async (req, res) => {
    try {
        const { id } = req.params;
        const { atleta_id, evento_id, data, nome_kata, nota_tecnica, nota_atletica, nota_final, resultado, observacoes } = req.body;
        
        const dataUpdate = {
            atleta: { connect: { id: parseInt(atleta_id) } },
            nome_kata: nome_kata || "",
            nota_tecnica: parseFloat(nota_tecnica || 0),
            nota_atletica: parseFloat(nota_atletica || 0),
            nota_final: parseFloat(nota_final || 0),
            resultado, observacoes: observacoes || "", data: new Date(data)
        };

        if (evento_id && evento_id !== "" && evento_id !== "null") {
            dataUpdate.evento = { connect: { id: parseInt(evento_id) } };
        } else {
            dataUpdate.evento = { disconnect: true };
        }

        const atualizado = await prisma.pontuacaoKata.update({
            where: { id: parseInt(id) }, data: dataUpdate
        });
        res.json(atualizado);
    } catch (error) {
        res.status(500).json({ error: "Erro ao atualizar Kata" });
    }
});

app.delete('/api/pontuacoes/kata/:id', verificarPermissao(['admin', 'sensei']), async (req, res) => {
    try {
        await prisma.pontuacaoKata.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: "Kata apagado" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao apagar Kata" });
    }
});

// ==========================================
// --- PONTUAÇÕES (KUMITE) ---
// ==========================================

app.get('/api/pontuacoes/kumite', verificarPermissao(['admin', 'sensei', 'mesario', 'aluno']), async (req, res) => {
    try {
        const lutas = await prisma.pontuacaoKumite.findMany({ 
            include: { atleta: true, evento: true },
            orderBy: { data: 'desc' } 
        });
        res.json(lutas);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar Kumites" });
    }
});

app.post('/api/pontuacoes/kumite', verificarPermissao(['admin', 'sensei', 'mesario']), async (req, res) => {
    try {
        const { atleta_id, evento_id, data, adversario_nome, ippon, waza_ari, yuko, pontos_sofridos, pontos_totais, resultado, observacoes } = req.body;
        
        const dataInput = {
            atleta: { connect: { id: parseInt(atleta_id) } },
            data: new Date(data),
            adversario_nome: adversario_nome || "",
            ippon: parseInt(ippon || 0), waza_ari: parseInt(waza_ari || 0), yuko: parseInt(yuko || 0),
            pontos_sofridos: parseInt(pontos_sofridos || 0), pontos_totais: parseInt(pontos_totais || 0),
            resultado, observacoes: observacoes || ""
        };

        if (evento_id && evento_id !== "" && evento_id !== "null") {
            dataInput.evento = { connect: { id: parseInt(evento_id) } };
        }

        const luta = await prisma.pontuacaoKumite.create({ data: dataInput }); 
        res.json(luta);
    } catch (error) {
        res.status(500).json({ error: "Erro ao salvar Kumite" });
    }
});

app.put('/api/pontuacoes/kumite/:id', verificarPermissao(['admin', 'sensei', 'mesario']), async (req, res) => {
    try {
        const { id } = req.params;
        const { atleta_id, evento_id, data, adversario_nome, ippon, waza_ari, yuko, pontos_sofridos, pontos_totais, resultado, observacoes } = req.body;

        const dataUpdate = {
            atleta: { connect: { id: parseInt(atleta_id) } },
            data: new Date(data),
            adversario_nome: adversario_nome || "",
            ippon: parseInt(ippon || 0), waza_ari: parseInt(waza_ari || 0), yuko: parseInt(yuko || 0),
            pontos_sofridos: parseInt(pontos_sofridos || 0), pontos_totais: parseInt(pontos_totais || 0),
            resultado, observacoes: observacoes || ""
        };

        if (evento_id && evento_id !== "" && evento_id !== "null") {
            dataUpdate.evento = { connect: { id: parseInt(evento_id) } };
        } else {
            dataUpdate.evento = { disconnect: true };
        }

        const atualizado = await prisma.pontuacaoKumite.update({
            where: { id: parseInt(id) }, data: dataUpdate
        });
        res.json(atualizado);
    } catch (error) {
        res.status(500).json({ error: "Erro ao atualizar Kumite" });
    }
});

app.delete('/api/pontuacoes/kumite/:id', verificarPermissao(['admin', 'sensei']), async (req, res) => {
    try {
        await prisma.pontuacaoKumite.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: "Kumite apagado" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao apagar Kumite" });
    }
});
//GESTÂO DOJO
// 1. Listar todos os Dojos (Vitrine para os alunos verem)
app.get('/api/dojos', verificarPermissao(['admin', 'sensei', 'mesario', 'aluno']), async (req, res) => {
    try {
        const dojos = await prisma.dojo.findMany({
            include: { criador: { select: { nome: true } } },
            orderBy: { nome: 'asc' }
        });
        res.json(dojos);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar a lista de Dojos." });
    }
});

// 2. Buscar Dojos onde o usuário logado é ADMIN (Para o painel de aprovação)
app.get('/api/dojos/gerenciar', verificarPermissao(['admin', 'sensei', 'aluno']), async (req, res) => {
    try {
        const usuarioId = req.usuarioLogado.id;
        
        // Busca os vínculos onde o usuário é ADMIN, trazendo os dados do Dojo e as solicitações pendentes
        const dojosAdmin = await prisma.membroDojo.findMany({
            where: { usuario_id: usuarioId, papel: 'ADMIN' },
            include: {
                dojo: {
                    include: {
                        membros: {
                            where: { status: 'PENDENTE' },
                            include: { usuario: { select: { id: true, nome: true, email: true } } }
                        }
                    }
                }
            }
        });
        
        // Formata a resposta para entregar apenas os Dojos
        const dojosGerenciados = dojosAdmin.map(vinculo => vinculo.dojo);
        res.json(dojosGerenciados);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar Dojos para gerenciamento." });
    }
});
// ==========================================
// --- GESTÃO DE UTILIZADORES (ADMIN) ---
// ==========================================

app.get('/api/usuarios', verificarPermissao(['admin']), async (req, res) => {
    try {
        const usuarios = await prisma.usuario.findMany({
            select: { id: true, nome: true, email: true, role: true, email_verificado: true },
            orderBy: { nome: 'asc' }
        });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar utilizadores." });
    }
});

app.put('/api/usuarios/:id/role', verificarPermissao(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        
        const atualizado = await prisma.usuario.update({
            where: { id: parseInt(id) },
            data: { role }
        });
        res.json({ message: "Cargo atualizado com sucesso!", role: atualizado.role });
    } catch (error) {
        res.status(500).json({ error: "Erro ao atualizar cargo." });
    }
});

app.delete('/api/usuarios/:id', verificarPermissao(['admin']), async (req, res) => {
    try {
        await prisma.usuario.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: "Utilizador removido do sistema." });
    } catch (error) {
        res.status(500).json({ error: "Erro ao remover utilizador." });
    }
});

// ==========================================
// --- INICIALIZAÇÃO DO SERVIDOR ---
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}!`);
});

module.exports = app;