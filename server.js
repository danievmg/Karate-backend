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
  'https://karate-frontend-psi.vercel.app', // Seu frontend na Vercel
  'http://localhost:5173',                  // Porta padrão do Vite (Local)
  'http://localhost:3000'                   // Outras portas locais comuns
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origem (como ferramentas de teste tipo Insomnia/Postman ou Mobile)
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

// ==========================================
// --- AUTENTICAÇÃO E UTILIZADORES ---
// ==========================================

// Lê a chave secreta do ficheiro .env (Muito importante para a Vercel)
const JWT_SECRET = process.env.JWT_SECRET || "223155ç"; 

// --- MIDDLEWARE DE AUTORIZAÇÃO (O "Porteiro") ---
const verificarPermissao = (rolesPermitidos) => {
    return (req, res, next) => {
        // 1. Verifica se o token foi enviado
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: "Token não fornecido. Acesso negado." });
        }

        // O token vem no formato "Bearer TOKEN_AQUI", então separamos
        const token = authHeader.split(' ')[1];

        try {
            // 2. Tenta decifrar o token
            const dados = jwt.verify(token, JWT_SECRET);
            req.usuarioLogado = dados; // Guarda os dados do utilizador no pedido

            // 3. Verifica se o cargo do utilizador está na lista de permitidos
            if (rolesPermitidos && !rolesPermitidos.includes(dados.role)) {
                return res.status(403).json({ error: "Acesso negado: O seu cargo não tem permissão para esta ação." });
            }

            next(); // Permissão concedida, pode prosseguir
        } catch (err) {
            return res.status(401).json({ error: "Token inválido ou expirado. Faça login novamente." });
        }
    };
};

// 1. Rota para criar o primeiro Admin (AGORA PROTEGIDA)
app.post('/api/usuarios/setup', async (req, res) => {
    try {
        // --- A TRAVA DE SEGURANÇA ---
        // Verifica se já existe ALGUÉM com o cargo de 'admin' no banco inteiro
        const adminJaExiste = await prisma.usuario.findFirst({ where: { role: 'admin' } });
        
        if (adminJaExiste) {
            return res.status(403).json({ error: "Acesso negado! O sistema já possui um Administrador." });
        }
        // ----------------------------

        const { nome, email, senha, role } = req.body;
        
        const existe = await prisma.usuario.findUnique({ where: { email } });
        if (existe) return res.status(400).json({ error: "Email já cadastrado." });

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        const novoUser = await prisma.usuario.create({
            data: { nome, email, senha: senhaHash, role: role || 'admin' }
        });
        res.json({ message: "Usuário Admin criado com sucesso!" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao criar usuário" });
    }
});

// 2. Rota de Login (Pública)
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario) return res.status(404).json({ error: "Utilizador não encontrado." });

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ error: "Palavra-passe incorreta." });

        // Adicionamos o 'role' no token para sabermos quem é nas outras rotas
        const token = jwt.sign(
            { id: usuario.id, role: usuario.role, nome: usuario.nome },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ 
            token, 
            usuario: { id: usuario.id, nome: usuario.nome, role: usuario.role } 
        });

    } catch (error) {
        console.log("ERRO NO SERVIDOR:", error);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

// 3. Rota Pública de Auto-Cadastro (Pais e Alunos)
app.post('/api/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        
        const existe = await prisma.usuario.findUnique({ where: { email } });
        if (existe) return res.status(400).json({ error: "Este email já está em uso." });

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        // Cria o utilizador com o nível 'aluno' por defeito
        await prisma.usuario.create({
            data: { nome, email, senha: senhaHash, role: 'aluno' }
        });
        
        res.json({ message: "Conta criada com sucesso! Faça login para continuar." });
    } catch (error) {
        res.status(500).json({ error: "Erro interno ao criar a conta." });
    }
});

// ==========================================
// --- ATLETAS ---
// ==========================================

// Todos os utilizadores logados podem ver os atletas
app.get('/api/atletas', verificarPermissao(['admin', 'sensei', 'mesario', 'aluno']), async (req, res) => {
    try {
        const atletas = await prisma.atleta.findMany({ orderBy: { nome: 'asc' } });
        res.json(atletas);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar atletas" });
    }
});

// Apenas Admin e Sensei podem adicionar atletas
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
        res.status(500).json({ error: "Erro ao criar atleta", detalhe: error.message });
    }
});

// Apenas Admin e Sensei podem editar
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
        res.status(500).json({ error: "Erro ao atualizar atleta", detalhe: error.message });
    }
});

// Apenas Admin pode apagar registos
app.delete('/api/atletas/:id', verificarPermissao(['admin']), async (req, res) => {
    try {
        await prisma.atleta.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: "Atleta apagado com sucesso" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao apagar atleta", detalhe: error.message });
    }
});

// ==========================================
// --- EVENTOS ---
// ==========================================

// Todos podem ver os eventos
app.get('/api/eventos', verificarPermissao(['admin', 'sensei', 'mesario', 'aluno']), async (req, res) => {
    try {
        const eventos = await prisma.evento.findMany({ orderBy: { data: 'desc' } });
        res.json(eventos);
    } catch (e) {
        res.status(500).json({ error: "Erro ao buscar eventos" });
    }
});

// Admin e Sensei podem gerir eventos
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

// Todos podem ver
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

// Admin, Sensei e Mesários podem adicionar notas
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
        res.status(500).json({ error: "Erro ao salvar Kata", detalhe: error.message });
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
        res.status(500).json({ error: "Erro ao atualizar Kata", detalhe: error.message });
    }
});

app.delete('/api/pontuacoes/kata/:id', verificarPermissao(['admin', 'sensei']), async (req, res) => {
    try {
        // CORREÇÃO APLICADA: Corrigido o modelo alvo de exclusão
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
        res.status(500).json({ error: "Erro ao salvar Kumite", detalhe: error.message });
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
        res.status(500).json({ error: "Erro ao atualizar Kumite", detalhe: error.message });
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

// ==========================================
// --- GESTÃO DE UTILIZADORES (ADMIN) ---
// ==========================================

// 1. Listar todos os utilizadores (Ocultando as senhas por segurança)
app.get('/api/usuarios', verificarPermissao(['admin']), async (req, res) => {
    try {
        const usuarios = await prisma.usuario.findMany({
            select: { id: true, nome: true, email: true, role: true },
            orderBy: { nome: 'asc' }
        });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar utilizadores." });
    }
});

// 2. Mudar o cargo de um utilizador
app.put('/api/usuarios/:id/role', verificarPermissao(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        
        const atualizado = await prisma.usuario.update({
            where: { id: parseInt(id) },
            data: { role }
        });
        // CORREÇÃO APLICADA: A variável agora é "atualizado" em vez de "updated"
        res.json({ message: "Cargo atualizado com sucesso!", role: atualizado.role });
    } catch (error) {
        res.status(500).json({ error: "Erro ao atualizar cargo." });
    }
});

// 3. Apagar um utilizador
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

// CORREÇÃO APLICADA: Bloco movido para o final do arquivo após o registro de todas as rotas
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}!`);
});

// CORREÇÃO APLICADA: Adicionado para garantir o funcionamento em ambientes Serverless como a Vercel
module.exports = app;