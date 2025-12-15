// ============================================
// 📦 DEPENDÊNCIAS
// ============================================
// npm install express bcrypt jsonwebtoken sqlite3 multer archiver cors dotenv axios node-cron form-data

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const cron = require('node-cron');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 40003;
const JWT_SECRET = process.env.JWT_SECRET || '1526105';
const DB_PATH = './barbearia.db';
const WEBHOOK_API_URL = process.env.WEBHOOK_API_URL || 'https://apiszap.appguardiaomais.com.br';

// ============================================
// 🔧 CONFIGURAÇÕES
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuração do multer para upload de arquivos
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// ============================================
// 🗄️ CONEXÃO COM BANCO DE DADOS
// ============================================
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
  } else {
    console.log('✅ Conectado ao banco SQLite');
    initDatabase();
  }
});

// Inicializar banco com as tabelas
function initDatabase() {
  const schema = `
    CREATE TABLE IF NOT EXISTS unidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      endereco TEXT,
      telefone TEXT,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      email TEXT,
      telefone TEXT,
      senha_hash TEXT NOT NULL,
      tipo TEXT CHECK (tipo IN ('admin','gerente','funcionario')) NOT NULL,
      unidade_id INTEGER,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (unidade_id) REFERENCES unidades(id)
    );

    CREATE TABLE IF NOT EXISTS barbeiros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      telefone TEXT,
      email TEXT,
      foto_base64 TEXT,
      percentual_comissao REAL,
      senha_hash TEXT NOT NULL,
      unidade_id INTEGER NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (unidade_id) REFERENCES unidades(id)
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      telefone TEXT,
      email TEXT,
      senha_hash TEXT NOT NULL,
      observacoes TEXT,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categorias_servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT
    );

    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      preco REAL NOT NULL,
      duracao_minutos INTEGER NOT NULL,
      categoria_id INTEGER,
      unidade_id INTEGER NOT NULL,
      ativo INTEGER DEFAULT 1,
      FOREIGN KEY (categoria_id) REFERENCES categorias_servicos(id),
      FOREIGN KEY (unidade_id) REFERENCES unidades(id)
    );

    CREATE TABLE IF NOT EXISTS pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agendamento_id INTEGER,
      venda_id INTEGER,
      forma_pagamento TEXT,
      valor REAL NOT NULL,
      status_pagamento TEXT CHECK (
        status_pagamento IN ('pendente','pago','cancelado','estornado')
      ) DEFAULT 'pendente',
      codigo_transacao TEXT,
      data_pagamento DATETIME,
      FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id),
      FOREIGN KEY (venda_id) REFERENCES vendas(id)
    );

    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      barbeiro_id INTEGER NOT NULL,
      servico_id INTEGER NOT NULL,
      unidade_id INTEGER NOT NULL,
      data_agendamento TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fim TEXT NOT NULL,
      status_agendamento TEXT CHECK (
        status_agendamento IN ('agendado','confirmado','cancelado','concluido')
      ) DEFAULT 'agendado',
      pagamento_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (barbeiro_id) REFERENCES barbeiros(id),
      FOREIGN KEY (servico_id) REFERENCES servicos(id),
      FOREIGN KEY (unidade_id) REFERENCES unidades(id),
      FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id)
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      preco REAL NOT NULL,
      estoque INTEGER DEFAULT 0,
      unidade_id INTEGER NOT NULL,
      ativo INTEGER DEFAULT 1,
      FOREIGN KEY (unidade_id) REFERENCES unidades(id)
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      unidade_id INTEGER NOT NULL,
      total REAL NOT NULL,
      pagamento_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (unidade_id) REFERENCES unidades(id),
      FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id)
    );

    CREATE TABLE IF NOT EXISTS venda_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      produto_id INTEGER,
      servico_id INTEGER,
      quantidade INTEGER NOT NULL,
      valor_unitario REAL NOT NULL,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id),
      FOREIGN KEY (servico_id) REFERENCES servicos(id)
    );

    CREATE TABLE IF NOT EXISTS historico_agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agendamento_id INTEGER NOT NULL,
      status_anterior TEXT,
      status_novo TEXT,
      data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id)
    );

    CREATE TABLE IF NOT EXISTS notificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      barbeiro_id INTEGER,
      cliente_id INTEGER,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      lida INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (barbeiro_id) REFERENCES barbeiros(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS tokens_recuperacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      barbeiro_id INTEGER,
      cliente_id INTEGER,
      cpf TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      tipo_conta TEXT NOT NULL,
      usado INTEGER DEFAULT 0,
      expira_em DATETIME NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (barbeiro_id) REFERENCES barbeiros(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );
  `;

  db.exec(schema, (err) => {
    if (err) {
      console.error('❌ Erro ao criar tabelas:', err.message);
    } else {
      console.log('✅ Tabelas verificadas/criadas com sucesso');
    }
  });
}

// ============================================
// 🛠️ FUNÇÕES AUXILIARES
// ============================================

// Validar CPF
function validarCPF(cpf) {
  cpf = cpf.replace(/[^\d]/g, '');
  
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  
  let soma = 0;
  let resto;
  
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }
  
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;
  
  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }
  
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(10, 11))) return false;
  
  return true;
}

// Limpar CPF (remover pontos e traços)
function limparCPF(cpf) {
  return cpf.replace(/[^\d]/g, '');
}

// Formatar número de telefone para WhatsApp (formato internacional)
function formatarNumeroWhatsApp(telefone) {
  let numero = telefone.replace(/\D/g, '');
  if (!numero.startsWith('55')) {
    numero = '55' + numero;
  }
  return numero;
}

// Gerar token de recuperação de senha
function gerarTokenRecuperacao() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// ============================================
// 📱 FUNÇÕES DE ENVIO DE WHATSAPP
// ============================================

async function enviarWhatsApp(numero, mensagem, metadata = null) {
  try {
    const FormData = require('form-data');
    const form = new FormData();
    
    form.append('numero', numero);
    form.append('mensagem', mensagem);
    if (metadata) {
      form.append('metadata', JSON.stringify(metadata));
    }

    const response = await axios.post(
      `${WEBHOOK_API_URL}/api/webhook/enviar`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000
      }
    );

    console.log(`✅ WhatsApp enviado para ${numero}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Erro ao enviar WhatsApp para ${numero}:`, error.message);
    throw error;
  }
}

async function notificarNovoAgendamento(agendamentoId) {
  try {
    const agendamento = await new Promise((resolve) => {
      db.get(
        `SELECT 
          a.*,
          c.nome as cliente_nome, c.telefone as cliente_telefone,
          b.nome as barbeiro_nome, b.telefone as barbeiro_telefone,
          s.nome as servico_nome, s.preco as servico_preco,
          u.nome as unidade_nome
         FROM agendamentos a
         JOIN clientes c ON a.cliente_id = c.id
         JOIN barbeiros b ON a.barbeiro_id = b.id
         JOIN servicos s ON a.servico_id = s.id
         JOIN unidades u ON a.unidade_id = u.id
         WHERE a.id = ?`,
        [agendamentoId],
        (err, row) => resolve(row)
      );
    });

    if (!agendamento) return;

    const dataFormatada = new Date(agendamento.data_agendamento + 'T00:00:00').toLocaleDateString('pt-BR');

    // Mensagem para o CLIENTE
    const mensagemCliente = `✅ *Agendamento Confirmado!*

Olá, ${agendamento.cliente_nome}! 

Seu agendamento foi realizado com sucesso:

📅 *Data:* ${dataFormatada}
⏰ *Horário:* ${agendamento.hora_inicio}
✂️ *Serviço:* ${agendamento.servico_nome}
👤 *Barbeiro:* ${agendamento.barbeiro_nome}
📍 *Local:* ${agendamento.unidade_nome}
💰 *Valor:* R$ ${agendamento.servico_preco.toFixed(2)}

Aguardamos você! 💈`;

    // Mensagem para o BARBEIRO
    const mensagemBarbeiro = `📋 *Novo Agendamento*

Olá, ${agendamento.barbeiro_nome}!

Você tem um novo agendamento:

👤 *Cliente:* ${agendamento.cliente_nome}
📅 *Data:* ${dataFormatada}
⏰ *Horário:* ${agendamento.hora_inicio}
✂️ *Serviço:* ${agendamento.servico_nome}
📍 *Local:* ${agendamento.unidade_nome}

Prepare-se! 💈`;

    // Enviar para cliente
    if (agendamento.cliente_telefone) {
      const numeroCliente = formatarNumeroWhatsApp(agendamento.cliente_telefone);
      await enviarWhatsApp(numeroCliente, mensagemCliente, {
        tipo: 'agendamento_criado',
        agendamento_id: agendamentoId
      });
    }

    // Enviar para barbeiro
    if (agendamento.barbeiro_telefone) {
      const numeroBarbeiro = formatarNumeroWhatsApp(agendamento.barbeiro_telefone);
      await enviarWhatsApp(numeroBarbeiro, mensagemBarbeiro, {
        tipo: 'agendamento_criado',
        agendamento_id: agendamentoId
      });
    }

  } catch (error) {
    console.error('Erro ao notificar agendamento:', error);
  }
}

async function notificarNovoCliente(clienteId) {
  try {
    const cliente = await new Promise((resolve) => {
      db.get('SELECT * FROM clientes WHERE id = ?', [clienteId], (err, row) => resolve(row));
    });

    if (!cliente || !cliente.telefone) return;

    const mensagem = `🎉 *Bem-vindo à Barbearia!*

Olá, ${cliente.nome}!

Sua conta foi criada com sucesso! 

Agora você pode:
✅ Agendar seus cortes
✅ Escolher seu barbeiro favorito
✅ Acompanhar seu histórico

Estamos prontos para te atender! 💈`;

    const numero = formatarNumeroWhatsApp(cliente.telefone);
    await enviarWhatsApp(numero, mensagem, {
      tipo: 'novo_cliente',
      cliente_id: clienteId
    });

  } catch (error) {
    console.error('Erro ao notificar novo cliente:', error);
  }
}

async function notificarNovoBarbeiro(barbeiroId) {
  try {
    const barbeiro = await new Promise((resolve) => {
      db.get(
        `SELECT b.*, u.nome as unidade_nome 
         FROM barbeiros b
         LEFT JOIN unidades u ON b.unidade_id = u.id
         WHERE b.id = ?`,
        [barbeiroId],
        (err, row) => resolve(row)
      );
    });

    if (!barbeiro) return;

    // Mensagem para o barbeiro
    if (barbeiro.telefone) {
      const mensagemBarbeiro = `🎉 *Bem-vindo à Equipe!*

Olá, ${barbeiro.nome}!

Sua conta de barbeiro foi criada com sucesso!

📍 *Unidade:* ${barbeiro.unidade_nome || 'A definir'}
💰 *Comissão:* ${barbeiro.percentual_comissao || 0}%

Você já pode começar a receber agendamentos! 

Sucesso! 💈✂️`;

      const numero = formatarNumeroWhatsApp(barbeiro.telefone);
      await enviarWhatsApp(numero, mensagemBarbeiro, {
        tipo: 'novo_barbeiro',
        barbeiro_id: barbeiroId
      });
    }

    // Notificar admins
    const admins = await new Promise((resolve) => {
      db.all(
        'SELECT * FROM usuarios WHERE tipo = "admin" AND telefone IS NOT NULL',
        (err, rows) => resolve(rows || [])
      );
    });

    for (const admin of admins) {
      const mensagemAdmin = `👤 *Novo Barbeiro Cadastrado*

*Nome:* ${barbeiro.nome}
*CPF:* ${barbeiro.cpf}
*Telefone:* ${barbeiro.telefone || 'Não informado'}
*Unidade:* ${barbeiro.unidade_nome || 'Não definida'}
*Comissão:* ${barbeiro.percentual_comissao || 0}%`;

      const numeroAdmin = formatarNumeroWhatsApp(admin.telefone);
      await enviarWhatsApp(numeroAdmin, mensagemAdmin, {
        tipo: 'novo_barbeiro_admin',
        barbeiro_id: barbeiroId
      });
    }

  } catch (error) {
    console.error('Erro ao notificar novo barbeiro:', error);
  }
}

async function enviarLembretesDoDia() {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    const agendamentos = await new Promise((resolve) => {
      db.all(
        `SELECT 
          a.*,
          c.nome as cliente_nome, c.telefone as cliente_telefone,
          b.nome as barbeiro_nome,
          s.nome as servico_nome,
          u.nome as unidade_nome, u.endereco as unidade_endereco
         FROM agendamentos a
         JOIN clientes c ON a.cliente_id = c.id
         JOIN barbeiros b ON a.barbeiro_id = b.id
         JOIN servicos s ON a.servico_id = s.id
         JOIN unidades u ON a.unidade_id = u.id
         WHERE a.data_agendamento = ? 
         AND a.status_agendamento IN ('agendado', 'confirmado')`,
        [hoje],
        (err, rows) => resolve(rows || [])
      );
    });

    for (const agendamento of agendamentos) {
      const mensagem = `🔔 *Lembrete de Agendamento*

Olá, ${agendamento.cliente_nome}!

Você tem um agendamento HOJE:

⏰ *Horário:* ${agendamento.hora_inicio}
✂️ *Serviço:* ${agendamento.servico_nome}
👤 *Barbeiro:* ${agendamento.barbeiro_nome}
📍 *Local:* ${agendamento.unidade_nome}
${agendamento.unidade_endereco ? `📌 ${agendamento.unidade_endereco}` : ''}

Não esqueça! Te esperamos! 💈`;

      if (agendamento.cliente_telefone) {
        const numero = formatarNumeroWhatsApp(agendamento.cliente_telefone);
        await enviarWhatsApp(numero, mensagem, {
          tipo: 'lembrete_dia',
          agendamento_id: agendamento.id
        });
      }
    }

    console.log(`✅ Lembretes do dia enviados: ${agendamentos.length} agendamentos`);
  } catch (error) {
    console.error('Erro ao enviar lembretes do dia:', error);
  }
}

async function enviarLembretes30Minutos() {
  try {
    const agora = new Date();
    const em30min = new Date(agora.getTime() + 30 * 60000);
    
    const horaAtual = agora.toTimeString().substring(0, 5);
    const horaEm30 = em30min.toTimeString().substring(0, 5);
    const hoje = agora.toISOString().split('T')[0];

    const agendamentos = await new Promise((resolve) => {
      db.all(
        `SELECT 
          a.*,
          c.nome as cliente_nome, c.telefone as cliente_telefone,
          b.nome as barbeiro_nome,
          s.nome as servico_nome,
          u.nome as unidade_nome, u.endereco as unidade_endereco
         FROM agendamentos a
         JOIN clientes c ON a.cliente_id = c.id
         JOIN barbeiros b ON a.barbeiro_id = b.id
         JOIN servicos s ON a.servico_id = s.id
         JOIN unidades u ON a.unidade_id = u.id
         WHERE a.data_agendamento = ? 
         AND a.hora_inicio BETWEEN ? AND ?
         AND a.status_agendamento IN ('agendado', 'confirmado')`,
        [hoje, horaAtual, horaEm30],
        (err, rows) => resolve(rows || [])
      );
    });

    for (const agendamento of agendamentos) {
      const mensagem = `⚠️ *ATENÇÃO - Agendamento em 30 minutos!*

${agendamento.cliente_nome}, seu horário está chegando:

⏰ *Horário:* ${agendamento.hora_inicio}
✂️ *Serviço:* ${agendamento.servico_nome}
👤 *Barbeiro:* ${agendamento.barbeiro_nome}
📍 *Local:* ${agendamento.unidade_nome}
${agendamento.unidade_endereco ? `📌 ${agendamento.unidade_endereco}` : ''}

⏱️ Estamos te esperando! Não se atrase! 💈`;

      if (agendamento.cliente_telefone) {
        const numero = formatarNumeroWhatsApp(agendamento.cliente_telefone);
        await enviarWhatsApp(numero, mensagem, {
          tipo: 'lembrete_30min',
          agendamento_id: agendamento.id
        });
      }
    }

    console.log(`✅ Lembretes 30min enviados: ${agendamentos.length} agendamentos`);
  } catch (error) {
    console.error('Erro ao enviar lembretes 30min:', error);
  }
}

// ============================================
// 🛡️ MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Token não fornecido'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Token inválido ou expirado'
    });
  }
}

// Middleware para verificar permissões
function checkPermission(...allowedTypes) {
  return (req, res, next) => {
    if (!allowedTypes.includes(req.usuario.tipo)) {
      return res.status(403).json({
        sucesso: false,
        erro: 'Permissão negada'
      });
    }
    next();
  };
}

// ============================================
// 🔐 ROTAS DE AUTENTICAÇÃO
// ============================================

// Registrar novo usuário (apenas admin pode criar)
app.post('/api/auth/usuarios/registrar', authMiddleware, checkPermission('admin'), async (req, res) => {
  try {
    const { nome, cpf, email, telefone, senha, tipo, unidade_id } = req.body;

    if (!nome || !cpf || !senha || !tipo) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Campos obrigatórios: nome, cpf, senha, tipo'
      });
    }

    const cpfLimpo = limparCPF(cpf);
    
    if (!validarCPF(cpfLimpo)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF inválido'
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    db.run(
      'INSERT INTO usuarios (nome, cpf, email, telefone, senha_hash, tipo, unidade_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome, cpfLimpo, email, telefone, senhaHash, tipo, unidade_id || null],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({
              sucesso: false,
              erro: 'CPF já cadastrado'
            });
          }
          return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao registrar usuário'
          });
        }

        res.status(201).json({
          sucesso: true,
          mensagem: 'Usuário registrado com sucesso',
          dados: { id: this.lastID }
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: 'Erro no servidor: ' + error.message
    });
  }
});

// Registrar novo barbeiro (admin ou gerente)
app.post('/api/auth/barbeiros/registrar', authMiddleware, checkPermission('admin', 'gerente'), async (req, res) => {
  try {
    const { nome, cpf, email, telefone, senha, percentual_comissao, unidade_id, foto_base64 } = req.body;

    if (!nome || !cpf || !senha || !unidade_id) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Campos obrigatórios: nome, cpf, senha, unidade_id'
      });
    }

    const cpfLimpo = limparCPF(cpf);
    
    if (!validarCPF(cpfLimpo)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF inválido'
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    db.run(
      'INSERT INTO barbeiros (nome, cpf, email, telefone, senha_hash, percentual_comissao, unidade_id, foto_base64) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, cpfLimpo, email, telefone, senhaHash, percentual_comissao || 0, unidade_id, foto_base64],
      async function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({
              sucesso: false,
              erro: 'CPF já cadastrado'
            });
          }
          return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao registrar barbeiro'
          });
        }

        const barbeiroId = this.lastID;

        // ENVIAR NOTIFICAÇÃO WHATSAPP
        await notificarNovoBarbeiro(barbeiroId);

        res.status(201).json({
          sucesso: true,
          mensagem: 'Barbeiro registrado com sucesso',
          dados: { id: barbeiroId }
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: 'Erro no servidor: ' + error.message
    });
  }
});

// Registrar novo cliente (público - qualquer pessoa pode se cadastrar)
app.post('/api/auth/clientes/registrar', async (req, res) => {
  try {
    const { nome, cpf, email, telefone, senha } = req.body;

    if (!nome || !cpf || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Campos obrigatórios: nome, cpf, senha'
      });
    }

    const cpfLimpo = limparCPF(cpf);
    
    if (!validarCPF(cpfLimpo)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF inválido'
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    db.run(
      'INSERT INTO clientes (nome, cpf, email, telefone, senha_hash) VALUES (?, ?, ?, ?, ?)',
      [nome, cpfLimpo, email, telefone, senhaHash],
      async function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({
              sucesso: false,
              erro: 'CPF já cadastrado'
            });
          }
          return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao registrar cliente'
          });
        }

        const clienteId = this.lastID;

        // ENVIAR NOTIFICAÇÃO WHATSAPP
        await notificarNovoCliente(clienteId);

        res.status(201).json({
          sucesso: true,
          mensagem: 'Cliente registrado com sucesso',
          dados: { id: clienteId }
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: 'Erro no servidor: ' + error.message
    });
  }
});

// Login unificado (usuários, barbeiros e clientes)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, senha } = req.body;

    if (!cpf || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF e senha são obrigatórios'
      });
    }

    const cpfLimpo = limparCPF(cpf);

    if (!validarCPF(cpfLimpo)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF inválido'
      });
    }

    // Tentar buscar como usuário primeiro
    db.get(
      'SELECT *, "usuario" as tipo_conta FROM usuarios WHERE cpf = ? AND ativo = 1',
      [cpfLimpo],
      async (err, usuario) => {
        if (err) {
          return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao buscar usuário'
          });
        }

        if (usuario) {
          const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

          if (!senhaValida) {
            return res.status(401).json({
              sucesso: false,
              erro: 'Credenciais inválidas'
            });
          }

          const token = jwt.sign(
            { 
              id: usuario.id,
              cpf: usuario.cpf,
              tipo: usuario.tipo,
              tipo_conta: 'usuario',
              unidade_id: usuario.unidade_id
            },
            JWT_SECRET,
            { expiresIn: '24h' }
          );

          return res.json({
            sucesso: true,
            mensagem: 'Login realizado com sucesso',
            dados: {
              token,
              usuario: {
                id: usuario.id,
                nome: usuario.nome,
                cpf: usuario.cpf,
                email: usuario.email,
                telefone: usuario.telefone,
                tipo: usuario.tipo,
                tipo_conta: 'usuario',
                unidade_id: usuario.unidade_id
              }
            }
          });
        }

        // Se não encontrou como usuário, buscar como barbeiro
        db.get(
          'SELECT *, "barbeiro" as tipo_conta FROM barbeiros WHERE cpf = ? AND ativo = 1',
          [cpfLimpo],
          async (err, barbeiro) => {
            if (err) {
              return res.status(500).json({
                sucesso: false,
                erro: 'Erro ao buscar barbeiro'
              });
            }

            if (barbeiro) {
              const senhaValida = await bcrypt.compare(senha, barbeiro.senha_hash);

              if (!senhaValida) {
                return res.status(401).json({
                  sucesso: false,
                  erro: 'Credenciais inválidas'
                });
              }

              const token = jwt.sign(
                { 
                  id: barbeiro.id,
                  cpf: barbeiro.cpf,
                  tipo: 'barbeiro',
                  tipo_conta: 'barbeiro',
                  unidade_id: barbeiro.unidade_id
                },
                JWT_SECRET,
                { expiresIn: '24h' }
              );

              return res.json({
                sucesso: true,
                mensagem: 'Login realizado com sucesso',
                dados: {
                  token,
                  usuario: {
                    id: barbeiro.id,
                    nome: barbeiro.nome,
                    cpf: barbeiro.cpf,
                    email: barbeiro.email,
                    telefone: barbeiro.telefone,
                    foto_base64: barbeiro.foto_base64,
                    percentual_comissao: barbeiro.percentual_comissao,
                    tipo: 'barbeiro',
                    tipo_conta: 'barbeiro',
                    unidade_id: barbeiro.unidade_id
                  }
                }
              });
            }

            // Se não encontrou como barbeiro, buscar como cliente
            db.get(
              'SELECT *, "cliente" as tipo_conta FROM clientes WHERE cpf = ? AND ativo = 1',
              [cpfLimpo],
              async (err, cliente) => {
                if (err) {
                  return res.status(500).json({
                    sucesso: false,
                    erro: 'Erro ao buscar cliente'
                  });
                }

                if (!cliente) {
                  return res.status(401).json({
                    sucesso: false,
                    erro: 'Credenciais inválidas'
                  });
                }

                const senhaValida = await bcrypt.compare(senha, cliente.senha_hash);

                if (!senhaValida) {
                  return res.status(401).json({
                    sucesso: false,
                    erro: 'Credenciais inválidas'
                  });
                }

                const token = jwt.sign(
                  { 
                    id: cliente.id,
                    cpf: cliente.cpf,
                    tipo: 'cliente',
                    tipo_conta: 'cliente'
                  },
                  JWT_SECRET,
                  { expiresIn: '24h' }
                );

                res.json({
                  sucesso: true,
                  mensagem: 'Login realizado com sucesso',
                  dados: {
                    token,
                    usuario: {
                      id: cliente.id,
                      nome: cliente.nome,
                      cpf: cliente.cpf,
                      email: cliente.email,
                      telefone: cliente.telefone,
                      tipo: 'cliente',
                      tipo_conta: 'cliente'
                    }
                  }
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: 'Erro no servidor: ' + error.message
    });
  }
});

// Verificar token
app.get('/api/auth/verificar', authMiddleware, (req, res) => {
  res.json({
    sucesso: true,
    mensagem: 'Token válido',
    dados: { usuario: req.usuario }
  });
});

// Alterar senha
app.put('/api/auth/alterar-senha', authMiddleware, async (req, res) => {
  try {
    const { senha_atual, senha_nova } = req.body;

    if (!senha_atual || !senha_nova) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Senha atual e nova senha são obrigatórias'
      });
    }

    let tabela = 'usuarios';
    if (req.usuario.tipo_conta === 'barbeiro') tabela = 'barbeiros';
    if (req.usuario.tipo_conta === 'cliente') tabela = 'clientes';

    db.get(
      `SELECT senha_hash FROM ${tabela} WHERE id = ?`,
      [req.usuario.id],
      async (err, registro) => {
        if (err || !registro) {
          return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao buscar usuário'
          });
        }

        const senhaValida = await bcrypt.compare(senha_atual, registro.senha_hash);

        if (!senhaValida) {
          return res.status(401).json({
            sucesso: false,
            erro: 'Senha atual incorreta'
          });
        }

        const novaSenhaHash = await bcrypt.hash(senha_nova, 10);

        db.run(
          `UPDATE ${tabela} SET senha_hash = ? WHERE id = ?`,
          [novaSenhaHash, req.usuario.id],
          (err) => {
            if (err) {
              return res.status(500).json({
                sucesso: false,
                erro: 'Erro ao alterar senha'
              });
            }

            res.json({
              sucesso: true,
              mensagem: 'Senha alterada com sucesso'
            });
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: 'Erro no servidor: ' + error.message
    });
  }
});

// ============================================
// 🔐 RECUPERAÇÃO DE SENHA
// ============================================

// Solicitar recuperação de senha
app.post('/api/auth/recuperar-senha/solicitar', async (req, res) => {
  try {
    const { cpf } = req.body;

    if (!cpf) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF é obrigatório'
      });
    }

    const cpfLimpo = limparCPF(cpf);

    if (!validarCPF(cpfLimpo)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF inválido'
      });
    }

    // Buscar em todas as tabelas
    let usuarioEncontrado = null;
    let tipoConta = null;
    let tabelaId = null;

    // Buscar como usuário
    const usuario = await new Promise((resolve) => {
      db.get('SELECT * FROM usuarios WHERE cpf = ? AND ativo = 1', [cpfLimpo], (err, row) => {
        resolve(row);
      });
    });

    if (usuario) {
      usuarioEncontrado = usuario;
      tipoConta = 'usuario';
      tabelaId = { usuario_id: usuario.id };
    } else {
      // Buscar como barbeiro
      const barbeiro = await new Promise((resolve) => {
        db.get('SELECT * FROM barbeiros WHERE cpf = ? AND ativo = 1', [cpfLimpo], (err, row) => {
          resolve(row);
        });
      });

      if (barbeiro) {
        usuarioEncontrado = barbeiro;
        tipoConta = 'barbeiro';
        tabelaId = { barbeiro_id: barbeiro.id };
      } else {
        // Buscar como cliente
        const cliente = await new Promise((resolve) => {
          db.get('SELECT * FROM clientes WHERE cpf = ? AND ativo = 1', [cpfLimpo], (err, row) => {
            resolve(row);
          });
        });

        if (cliente) {
          usuarioEncontrado = cliente;
          tipoConta = 'cliente';
          tabelaId = { cliente_id: cliente.id };
        }
      }
    }

    if (!usuarioEncontrado) {
      // Por segurança, não revela se o CPF existe ou não
      return res.json({
        sucesso: true,
        mensagem: 'Se o CPF estiver cadastrado, você receberá um código via WhatsApp'
      });
    }

    if (!usuarioEncontrado.telefone) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Usuário não possui telefone cadastrado'
      });
    }

    // Gerar token
    const token = gerarTokenRecuperacao();
    const expiraEm = new Date();
    expiraEm.setMinutes(expiraEm.getMinutes() + 15);

    // Salvar token no banco
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO tokens_recuperacao 
         (${Object.keys(tabelaId)[0]}, cpf, token, tipo_conta, expira_em) 
         VALUES (?, ?, ?, ?, ?)`,
        [Object.values(tabelaId)[0], cpfLimpo, token, tipoConta, expiraEm.toISOString()],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // Enviar WhatsApp com o código
    const numeroFormatado = formatarNumeroWhatsApp(usuarioEncontrado.telefone);
    const mensagem = `🔐 *Recuperação de Senha - Barbearia*

Olá, ${usuarioEncontrado.nome}!

Seu código de recuperação de senha é: *${token}*

⏰ Este código é válido por 15 minutos.

🔒 Se você não solicitou esta recuperação, ignore esta mensagem.`;

    try {
      await enviarWhatsApp(numeroFormatado, mensagem, {
        tipo: 'recuperacao_senha',
        cpf: cpfLimpo
      });
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
    }

    res.json({
      sucesso: true,
      mensagem: 'Código de recuperação enviado via WhatsApp'
    });

  } catch (error) {
    console.error('Erro na recuperação de senha:', error);
    res.status(500).json({
      sucesso: false,
      erro: 'Erro ao processar solicitação: ' + error.message
    });
  }
});

// Validar token e redefinir senha
app.post('/api/auth/recuperar-senha/confirmar', async (req, res) => {
  try {
    const { cpf, token, senha_nova } = req.body;

    if (!cpf || !token || !senha_nova) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF, token e nova senha são obrigatórios'
      });
    }

    const cpfLimpo = limparCPF(cpf);

    if (!validarCPF(cpfLimpo)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'CPF inválido'
      });
    }

    // Buscar token
    const tokenRegistro = await new Promise((resolve) => {
      db.get(
        `SELECT * FROM tokens_recuperacao 
         WHERE cpf = ? AND token = ? AND usado = 0 AND expira_em > datetime('now')`,
        [cpfLimpo, token.toUpperCase()],
        (err, row) => {
          resolve(row);
        }
      );
    });

    if (!tokenRegistro) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Token inválido ou expirado'
      });
    }

    // Atualizar senha
    const novaSenhaHash = await bcrypt.hash(senha_nova, 10);
    let tabela = 'usuarios';
    let campoId = 'usuario_id';

    if (tokenRegistro.tipo_conta === 'barbeiro') {
      tabela = 'barbeiros';
      campoId = 'barbeiro_id';
    } else if (tokenRegistro.tipo_conta === 'cliente') {
      tabela = 'clientes';
      campoId = 'cliente_id';
    }

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE ${tabela} SET senha_hash = ? WHERE id = ?`,
        [novaSenhaHash, tokenRegistro[campoId]],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Marcar token como usado
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE tokens_recuperacao SET usado = 1 WHERE id = ?',
        [tokenRegistro.id],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      sucesso: true,
      mensagem: 'Senha redefinida com sucesso'
    });

  } catch (error) {
    console.error('Erro ao confirmar recuperação:', error);
    res.status(500).json({
      sucesso: false,
      erro: 'Erro ao processar solicitação: ' + error.message
    });
  }
});

// ============================================
// 👤 ROTAS DE PERFIL
// ============================================

// Obter perfil do usuário/barbeiro logado
app.get('/api/perfil', authMiddleware, (req, res) => {
  const tabela = req.usuario.tipo_conta === 'barbeiro' ? 'barbeiros' : req.usuario.tipo_conta === 'cliente' ? 'clientes' : 'usuarios';
  
  db.get(
    `SELECT id, nome, cpf, email, telefone, ${req.usuario.tipo_conta !== 'cliente' ? 'unidade_id,' : ''} ativo, criado_em 
     ${req.usuario.tipo_conta === 'barbeiro' ? ', foto_base64, percentual_comissao' : ''} 
     ${req.usuario.tipo_conta === 'usuario' ? ', tipo' : ''} 
     FROM ${tabela} WHERE id = ?`,
    [req.usuario.id],
    (err, perfil) => {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao buscar perfil'
        });
      }

      if (!perfil) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Perfil não encontrado'
        });
      }

      res.json({
        sucesso: true,
        dados: {
          ...perfil,
          tipo_conta: req.usuario.tipo_conta
        }
      });
    }
  );
});

// Atualizar perfil
app.put('/api/perfil', authMiddleware, (req, res) => {
  const { nome, email, telefone, foto_base64 } = req.body;
  const tabela = req.usuario.tipo_conta === 'barbeiro' ? 'barbeiros' : req.usuario.tipo_conta === 'cliente' ? 'clientes' : 'usuarios';

  if (!nome) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome é obrigatório'
    });
  }

  let query = `UPDATE ${tabela} SET nome = ?, email = ?, telefone = ?`;
  let params = [nome, email, telefone];

  if (req.usuario.tipo_conta === 'barbeiro' && foto_base64) {
    query += ', foto_base64 = ?';
    params.push(foto_base64);
  }

  query += ' WHERE id = ?';
  params.push(req.usuario.id);

  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao atualizar perfil'
      });
    }

    res.json({
      sucesso: true,
      mensagem: 'Perfil atualizado com sucesso'
    });
  });
});

// ============================================
// 📅 ROTAS DE AGENDAMENTOS
// ============================================

// Criar agendamento
app.post('/api/agendamentos', authMiddleware, async (req, res) => {
  try {
    const { cliente_id, barbeiro_id, servico_id, unidade_id, data_agendamento, hora_inicio, hora_fim } = req.body;

    if (!cliente_id || !barbeiro_id || !servico_id || !unidade_id || !data_agendamento || !hora_inicio || !hora_fim) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Todos os campos são obrigatórios'
      });
    }

    db.run(
      'INSERT INTO agendamentos (cliente_id, barbeiro_id, servico_id, unidade_id, data_agendamento, hora_inicio, hora_fim) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cliente_id, barbeiro_id, servico_id, unidade_id, data_agendamento, hora_inicio, hora_fim],
      async function(err) {
        if (err) {
          return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao criar agendamento: ' + err.message
          });
        }

        const agendamentoId = this.lastID;

        // ENVIAR NOTIFICAÇÃO WHATSAPP
        await notificarNovoAgendamento(agendamentoId);

        res.status(201).json({
          sucesso: true,
          mensagem: 'Agendamento criado com sucesso',
          dados: { id: agendamentoId }
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: 'Erro no servidor: ' + error.message
    });
  }
});

// Listar agendamentos
app.get('/api/agendamentos', authMiddleware, (req, res) => {
  const { status, data_inicio, data_fim, cliente_id, barbeiro_id, unidade_id } = req.query;

  let query = `SELECT a.*, 
    c.nome as cliente_nome,
    b.nome as barbeiro_nome,
    s.nome as servico_nome, s.preco as servico_preco,
    u.nome as unidade_nome
    FROM agendamentos a
    JOIN clientes c ON a.cliente_id = c.id
    JOIN barbeiros b ON a.barbeiro_id = b.id
    JOIN servicos s ON a.servico_id = s.id
    JOIN unidades u ON a.unidade_id = u.id
    WHERE 1=1`;
  
  const params = [];

  if (status) {
    query += ' AND a.status_agendamento = ?';
    params.push(status);
  }

  if (data_inicio && data_fim) {
    query += ' AND a.data_agendamento BETWEEN ? AND ?';
    params.push(data_inicio, data_fim);
  }

  if (cliente_id) {
    query += ' AND a.cliente_id = ?';
    params.push(cliente_id);
  }

  if (barbeiro_id) {
    query += ' AND a.barbeiro_id = ?';
    params.push(barbeiro_id);
  }

  if (unidade_id) {
    query += ' AND a.unidade_id = ?';
    params.push(unidade_id);
  }

  // Filtrar por permissão
  if (req.usuario.tipo_conta === 'cliente') {
    query += ' AND a.cliente_id = ?';
    params.push(req.usuario.id);
  } else if (req.usuario.tipo_conta === 'barbeiro') {
    query += ' AND a.barbeiro_id = ?';
    params.push(req.usuario.id);
  }

  query += ' ORDER BY a.data_agendamento DESC, a.hora_inicio DESC';

  db.all(query, params, (err, agendamentos) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao buscar agendamentos'
      });
    }

    res.json({
      sucesso: true,
      dados: agendamentos
    });
  });
});

// ============================================
// 🔔 ROTAS DE NOTIFICAÇÕES
// ============================================

// Listar notificações do usuário/barbeiro
app.get('/api/notificacoes', authMiddleware, (req, res) => {
  const { lida, limit = 50 } = req.query;
  let campo = 'usuario_id';
  
  if (req.usuario.tipo_conta === 'barbeiro') campo = 'barbeiro_id';
  if (req.usuario.tipo_conta === 'cliente') campo = 'cliente_id';

  let query = `SELECT * FROM notificacoes WHERE ${campo} = ?`;
  const params = [req.usuario.id];

  if (lida !== undefined) {
    query += ' AND lida = ?';
    params.push(lida === 'true' ? 1 : 0);
  }

  query += ' ORDER BY criado_em DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(query, params, (err, notificacoes) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao buscar notificações'
      });
    }

    res.json({
      sucesso: true,
      dados: notificacoes
    });
  });
});

// Contar notificações não lidas
app.get('/api/notificacoes/nao-lidas/count', authMiddleware, (req, res) => {
  let campo = 'usuario_id';
  
  if (req.usuario.tipo_conta === 'barbeiro') campo = 'barbeiro_id';
  if (req.usuario.tipo_conta === 'cliente') campo = 'cliente_id';

  db.get(
    `SELECT COUNT(*) as total FROM notificacoes WHERE ${campo} = ? AND lida = 0`,
    [req.usuario.id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao contar notificações'
        });
      }

      res.json({
        sucesso: true,
        dados: { total: result.total }
      });
    }
  );
});

// Marcar notificação como lida
app.put('/api/notificacoes/:id/marcar-lida', authMiddleware, (req, res) => {
  let campo = 'usuario_id';
  
  if (req.usuario.tipo_conta === 'barbeiro') campo = 'barbeiro_id';
  if (req.usuario.tipo_conta === 'cliente') campo = 'cliente_id';

  db.run(
    `UPDATE notificacoes SET lida = 1 WHERE id = ? AND ${campo} = ?`,
    [req.params.id, req.usuario.id],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao marcar notificação como lida'
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Notificação não encontrada'
        });
      }

      res.json({
        sucesso: true,
        mensagem: 'Notificação marcada como lida'
      });
    }
  );
});

// ============================================
// 💾 ROTAS DE BACKUP
// ============================================

// Criar backup do banco de dados
app.get('/api/backup/criar', authMiddleware, checkPermission('admin'), (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = './backups';
    const backupFileName = `backup_${timestamp}.zip`;
    const backupPath = path.join(backupDir, backupFileName);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.json({
        sucesso: true,
        mensagem: 'Backup criado com sucesso',
        dados: {
          arquivo: backupFileName,
          tamanho: archive.pointer() + ' bytes',
          data: new Date().toISOString()
        }
      });
    });

    archive.on('error', (err) => {
      res.status(500).json({
        sucesso: false,
        erro: 'Erro ao criar backup: ' + err.message
      });
    });

    archive.pipe(output);
    archive.file(DB_PATH, { name: 'barbearia.db' });
    archive.finalize();
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: 'Erro ao criar backup: ' + error.message
    });
  }
});

// ============================================
// 🧪 ROTA DE TESTE WHATSAPP
// ============================================

app.post('/api/webhook/teste', authMiddleware, checkPermission('admin'), async (req, res) => {
  try {
    const { telefone, mensagem } = req.body;

    if (!telefone || !mensagem) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Telefone e mensagem são obrigatórios'
      });
    }

    const numeroFormatado = formatarNumeroWhatsApp(telefone);
    const resultado = await enviarWhatsApp(numeroFormatado, mensagem, {
      tipo: 'teste'
    });

    res.json({
      sucesso: true,
      mensagem: 'Teste enviado com sucesso',
      dados: resultado
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: 'Erro ao enviar teste: ' + error.message
    });
  }
});

// ============================================
// ⏲️ AGENDAMENTO DE TAREFAS AUTOMÁTICAS
// ============================================

// Enviar lembretes do dia às 8h da manhã
cron.schedule('0 8 * * *', () => {
  console.log('🔔 Executando envio de lembretes do dia...');
  enviarLembretesDoDia();
});

// Verificar lembretes de 30 minutos a cada 10 minutos
cron.schedule('*/10 * * * *', () => {
  console.log('⏰ Verificando lembretes de 30 minutos...');
  enviarLembretes30Minutos();
});

// ============================================
// 🚀 INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
  console.log('\n🎉 ============================================');
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log('✅ Sistema de notificações WhatsApp ativo');
  console.log(`📱 API Webhook: ${WEBHOOK_API_URL}`);
  console.log('⏰ Lembretes do dia: Diariamente às 8h');
  console.log('⏱️ Lembretes 30min: A cada 10 minutos');
  console.log('🔐 Sistema de recuperação de senha: Ativo');
  console.log('============================================\n');

});

