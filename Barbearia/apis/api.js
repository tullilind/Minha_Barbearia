

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

// Inativar barbeiro (admin ou gerente)
app.delete('/api/barbeiros/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  db.run(
    'UPDATE barbeiros SET ativo = 0 WHERE id = ?',
    [req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao inativar barbeiro'
        });
      }
      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Barbeiro não encontrado'
        });
      }
      res.json({
        sucesso: true,
        mensagem: 'Barbeiro inativado com sucesso'
      });
    }
  );
});

// Inativar usuário (admin ou gerente)
app.delete('/api/usuarios/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  db.run(
    'UPDATE usuarios SET ativo = 0 WHERE id = ?',
    [req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao inativar usuário'
        });
      }
      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Usuário não encontrado'
        });
      }
      res.json({
        sucesso: true,
        mensagem: 'Usuário inativado com sucesso'
      });
    }
  );
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
// 📂 ROTAS PARA UNIDADES
// ============================================
// As unidades representam os endereços físicos da barbearia. Estas
// rotas permitem criar, listar, atualizar e inativar unidades. Somente
// usuários com permissão de admin ou gerente podem criar, editar ou
// excluir unidades.

// Criar unidade
app.post('/api/unidades', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, endereco, telefone } = req.body;
  if (!nome) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome é obrigatório'
    });
  }
  db.run(
    'INSERT INTO unidades (nome, endereco, telefone) VALUES (?, ?, ?)',
    [nome, endereco, telefone],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao criar unidade: ' + err.message
        });
      }
      res.status(201).json({
        sucesso: true,
        mensagem: 'Unidade criada com sucesso',
        dados: { id: this.lastID }
      });
    }
  );
});

// Listar unidades (com filtros de ativo)
app.get('/api/unidades', authMiddleware, (req, res) => {
  const { ativo } = req.query;
  let query = 'SELECT * FROM unidades WHERE 1=1';
  const params = [];
  if (ativo !== undefined) {
    query += ' AND ativo = ?';
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao listar unidades'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Obter unidade por ID
app.get('/api/unidades/:id', authMiddleware, (req, res) => {
  db.get(
    'SELECT * FROM unidades WHERE id = ?',
    [req.params.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao obter unidade'
        });
      }
      if (!row) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Unidade não encontrada'
        });
      }
      res.json({
        sucesso: true,
        dados: row
      });
    }
  );
});

// Atualizar unidade
app.put('/api/unidades/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, endereco, telefone, ativo } = req.body;
  // Monta consulta dinamicamente conforme campos fornecidos
  let query = 'UPDATE unidades SET ';
  const updates = [];
  const params = [];
  if (nome !== undefined) {
    updates.push('nome = ?');
    params.push(nome);
  }
  if (endereco !== undefined) {
    updates.push('endereco = ?');
    params.push(endereco);
  }
  if (telefone !== undefined) {
    updates.push('telefone = ?');
    params.push(telefone);
  }
  if (ativo !== undefined) {
    updates.push('ativo = ?');
    params.push(ativo ? 1 : 0);
  }
  if (updates.length === 0) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nenhum campo para atualizar'
    });
  }
  query += updates.join(', ') + ' WHERE id = ?';
  params.push(req.params.id);
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao atualizar unidade: ' + err.message
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Unidade não encontrada'
      });
    }
    res.json({
      sucesso: true,
      mensagem: 'Unidade atualizada com sucesso'
    });
  });
});

// Inativar (deletar) unidade
app.delete('/api/unidades/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  db.run(
    'UPDATE unidades SET ativo = 0 WHERE id = ?',
    [req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao inativar unidade'
        });
      }
      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Unidade não encontrada'
        });
      }
      res.json({
        sucesso: true,
        mensagem: 'Unidade inativada com sucesso'
      });
    }
  );
});

// ============================================
// 🛠️ ROTAS PARA CATEGORIAS DE SERVIÇOS
// ============================================
// Categorias ajudam a organizar os serviços oferecidos. As rotas
// permitem cadastrar, listar, atualizar e excluir categorias. Apenas
// administradores ou gerentes podem modificar as categorias.

// Criar categoria
app.post('/api/categorias-servicos', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, descricao } = req.body;
  if (!nome) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome é obrigatório'
    });
  }
  db.run(
    'INSERT INTO categorias_servicos (nome, descricao) VALUES (?, ?)',
    [nome, descricao],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao criar categoria: ' + err.message
        });
      }
      res.status(201).json({
        sucesso: true,
        mensagem: 'Categoria criada com sucesso',
        dados: { id: this.lastID }
      });
    }
  );
});

// Listar categorias
app.get('/api/categorias-servicos', authMiddleware, (req, res) => {
  db.all('SELECT * FROM categorias_servicos', [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao listar categorias'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Obter categoria por ID
app.get('/api/categorias-servicos/:id', authMiddleware, (req, res) => {
  db.get('SELECT * FROM categorias_servicos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao obter categoria'
      });
    }
    if (!row) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Categoria não encontrada'
      });
    }
    res.json({
      sucesso: true,
      dados: row
    });
  });
});

// Atualizar categoria
app.put('/api/categorias-servicos/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, descricao } = req.body;
  if (!nome && !descricao) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nenhum campo para atualizar'
    });
  }
  let query = 'UPDATE categorias_servicos SET ';
  const updates = [];
  const params = [];
  if (nome !== undefined) {
    updates.push('nome = ?');
    params.push(nome);
  }
  if (descricao !== undefined) {
    updates.push('descricao = ?');
    params.push(descricao);
  }
  query += updates.join(', ') + ' WHERE id = ?';
  params.push(req.params.id);
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao atualizar categoria'
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Categoria não encontrada'
      });
    }
    res.json({
      sucesso: true,
      mensagem: 'Categoria atualizada com sucesso'
    });
  });
});

// Deletar categoria
app.delete('/api/categorias-servicos/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  db.run('DELETE FROM categorias_servicos WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao excluir categoria'
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Categoria não encontrada'
      });
    }
    res.json({
      sucesso: true,
      mensagem: 'Categoria excluída com sucesso'
    });
  });
});

// ============================================
// ✂️ ROTAS PARA SERVIÇOS
// ============================================
// Os serviços representam os cortes, barbas ou qualquer outro serviço
// oferecido pela barbearia. Cada serviço pertence a uma unidade e
// opcionalmente a uma categoria. Estas rotas permitem gerenciar
// serviços com suporte a criação, listagem, atualização e exclusão.

// Criar serviço
app.post('/api/servicos', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, descricao, preco, duracao_minutos, categoria_id, unidade_id, ativo } = req.body;
  if (!nome || preco === undefined || duracao_minutos === undefined || !unidade_id) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome, preço, duração e unidade_id são obrigatórios'
    });
  }
  db.run(
    'INSERT INTO servicos (nome, descricao, preco, duracao_minutos, categoria_id, unidade_id, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nome, descricao, preco, duracao_minutos, categoria_id || null, unidade_id, ativo !== undefined ? (ativo ? 1 : 0) : 1],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao criar serviço: ' + err.message
        });
      }
      res.status(201).json({
        sucesso: true,
        mensagem: 'Serviço criado com sucesso',
        dados: { id: this.lastID }
      });
    }
  );
});

// Listar serviços com filtros
app.get('/api/servicos', authMiddleware, (req, res) => {
  const { unidade_id, categoria_id, ativo } = req.query;
  let query = `SELECT s.*, c.nome as categoria_nome FROM servicos s LEFT JOIN categorias_servicos c ON s.categoria_id = c.id WHERE 1=1`;
  const params = [];
  if (unidade_id) {
    query += ' AND s.unidade_id = ?';
    params.push(unidade_id);
  }
  if (categoria_id) {
    query += ' AND s.categoria_id = ?';
    params.push(categoria_id);
  }
  if (ativo !== undefined) {
    query += ' AND s.ativo = ?';
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao listar serviços'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Obter serviço por ID
app.get('/api/servicos/:id', authMiddleware, (req, res) => {
  db.get(
    `SELECT s.*, c.nome as categoria_nome FROM servicos s LEFT JOIN categorias_servicos c ON s.categoria_id = c.id WHERE s.id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao obter serviço'
        });
      }
      if (!row) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Serviço não encontrado'
        });
      }
      res.json({
        sucesso: true,
        dados: row
      });
    }
  );
});

// Atualizar serviço
app.put('/api/servicos/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, descricao, preco, duracao_minutos, categoria_id, unidade_id, ativo } = req.body;
  let query = 'UPDATE servicos SET ';
  const updates = [];
  const params = [];
  if (nome !== undefined) {
    updates.push('nome = ?');
    params.push(nome);
  }
  if (descricao !== undefined) {
    updates.push('descricao = ?');
    params.push(descricao);
  }
  if (preco !== undefined) {
    updates.push('preco = ?');
    params.push(preco);
  }
  if (duracao_minutos !== undefined) {
    updates.push('duracao_minutos = ?');
    params.push(duracao_minutos);
  }
  if (categoria_id !== undefined) {
    updates.push('categoria_id = ?');
    params.push(categoria_id || null);
  }
  if (unidade_id !== undefined) {
    updates.push('unidade_id = ?');
    params.push(unidade_id);
  }
  if (ativo !== undefined) {
    updates.push('ativo = ?');
    params.push(ativo ? 1 : 0);
  }
  if (updates.length === 0) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nenhum campo para atualizar'
    });
  }
  query += updates.join(', ') + ' WHERE id = ?';
  params.push(req.params.id);
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao atualizar serviço'
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Serviço não encontrado'
      });
    }
    res.json({
      sucesso: true,
      mensagem: 'Serviço atualizado com sucesso'
    });
  });
});

// Inativar serviço
app.delete('/api/servicos/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  db.run('UPDATE servicos SET ativo = 0 WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao inativar serviço'
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Serviço não encontrado'
      });
    }
    res.json({
      sucesso: true,
      mensagem: 'Serviço inativado com sucesso'
    });
  });
});

// ============================================
// 🛍️ ROTAS PARA PRODUTOS
// ============================================
// Produtos são itens comercializados na barbearia (por exemplo
// pomadas, shampoos). As rotas abaixo permitem cadastrar, listar,
// atualizar e inativar produtos, bem como ajustar o estoque.

// Criar produto
app.post('/api/produtos', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, descricao, preco, estoque, unidade_id, ativo } = req.body;
  if (!nome || preco === undefined || !unidade_id) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome, preço e unidade_id são obrigatórios'
    });
  }
  db.run(
    'INSERT INTO produtos (nome, descricao, preco, estoque, unidade_id, ativo) VALUES (?, ?, ?, ?, ?, ?)',
    [nome, descricao, preco, estoque || 0, unidade_id, ativo !== undefined ? (ativo ? 1 : 0) : 1],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao criar produto: ' + err.message
        });
      }
      res.status(201).json({
        sucesso: true,
        mensagem: 'Produto criado com sucesso',
        dados: { id: this.lastID }
      });
    }
  );
});

// Listar produtos com filtros
app.get('/api/produtos', authMiddleware, (req, res) => {
  const { unidade_id, ativo } = req.query;
  let query = 'SELECT * FROM produtos WHERE 1=1';
  const params = [];
  if (unidade_id) {
    query += ' AND unidade_id = ?';
    params.push(unidade_id);
  }
  if (ativo !== undefined) {
    query += ' AND ativo = ?';
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao listar produtos'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Obter produto por ID
app.get('/api/produtos/:id', authMiddleware, (req, res) => {
  db.get('SELECT * FROM produtos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao obter produto'
      });
    }
    if (!row) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Produto não encontrado'
      });
    }
    res.json({
      sucesso: true,
      dados: row
    });
  });
});

// Atualizar produto
app.put('/api/produtos/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, descricao, preco, estoque, unidade_id, ativo } = req.body;
  let query = 'UPDATE produtos SET ';
  const updates = [];
  const params = [];
  if (nome !== undefined) {
    updates.push('nome = ?');
    params.push(nome);
  }
  if (descricao !== undefined) {
    updates.push('descricao = ?');
    params.push(descricao);
  }
  if (preco !== undefined) {
    updates.push('preco = ?');
    params.push(preco);
  }
  if (estoque !== undefined) {
    updates.push('estoque = ?');
    params.push(estoque);
  }
  if (unidade_id !== undefined) {
    updates.push('unidade_id = ?');
    params.push(unidade_id);
  }
  if (ativo !== undefined) {
    updates.push('ativo = ?');
    params.push(ativo ? 1 : 0);
  }
  if (updates.length === 0) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nenhum campo para atualizar'
    });
  }
  query += updates.join(', ') + ' WHERE id = ?';
  params.push(req.params.id);
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao atualizar produto'
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Produto não encontrado'
      });
    }
    res.json({
      sucesso: true,
      mensagem: 'Produto atualizado com sucesso'
    });
  });
});

// Inativar produto
app.delete('/api/produtos/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  db.run('UPDATE produtos SET ativo = 0 WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao inativar produto'
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Produto não encontrado'
      });
    }
    res.json({
      sucesso: true,
      mensagem: 'Produto inativado com sucesso'
    });
  });
});

// Ajustar estoque de produto (adicionar ou remover quantidade)
app.post('/api/produtos/:id/ajustar-estoque', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { quantidade } = req.body;
  if (quantidade === undefined || isNaN(quantidade)) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Quantidade é obrigatória e deve ser numérica'
    });
  }
  db.get('SELECT estoque FROM produtos WHERE id = ?', [req.params.id], (err, produto) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao buscar produto'
      });
    }
    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Produto não encontrado'
      });
    }
    const novoEstoque = (produto.estoque || 0) + parseInt(quantidade);
    db.run('UPDATE produtos SET estoque = ? WHERE id = ?', [novoEstoque, req.params.id], function(updateErr) {
      if (updateErr) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao ajustar estoque'
        });
      }
      res.json({
        sucesso: true,
        mensagem: 'Estoque ajustado com sucesso',
        dados: { estoque: novoEstoque }
      });
    });
  });
});

// ============================================
// 💸 ROTAS PARA PAGAMENTOS
// ============================================
// Permitem criar e atualizar registros de pagamento. Normalmente, os
// pagamentos são vinculados a agendamentos ou vendas. Os admins ou
// gerentes podem alterar o status ou detalhes do pagamento.

// Criar pagamento
app.post('/api/pagamentos', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { agendamento_id, venda_id, forma_pagamento, valor, status_pagamento, codigo_transacao, data_pagamento } = req.body;
  if (!valor) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Valor é obrigatório'
    });
  }
  db.run(
    `INSERT INTO pagamentos (agendamento_id, venda_id, forma_pagamento, valor, status_pagamento, codigo_transacao, data_pagamento)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [agendamento_id || null, venda_id || null, forma_pagamento, valor, status_pagamento || 'pendente', codigo_transacao, data_pagamento],
    function(err) {
      if (err) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao criar pagamento: ' + err.message
        });
      }
      res.status(201).json({
        sucesso: true,
        mensagem: 'Pagamento criado com sucesso',
        dados: { id: this.lastID }
      });
    }
  );
});

// Listar pagamentos
app.get('/api/pagamentos', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { status_pagamento, data_inicio, data_fim } = req.query;
  let query = 'SELECT * FROM pagamentos WHERE 1=1';
  const params = [];
  if (status_pagamento) {
    query += ' AND status_pagamento = ?';
    params.push(status_pagamento);
  }
  if (data_inicio && data_fim) {
    query += ' AND date(data_pagamento) BETWEEN date(?) AND date(?)';
    params.push(data_inicio, data_fim);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao listar pagamentos'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Obter pagamento por ID
app.get('/api/pagamentos/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  db.get('SELECT * FROM pagamentos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao obter pagamento'
      });
    }
    if (!row) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Pagamento não encontrado'
      });
    }
    res.json({
      sucesso: true,
      dados: row
    });
  });
});

// Atualizar pagamento (status ou outros dados)
app.put('/api/pagamentos/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { status_pagamento, codigo_transacao, data_pagamento, forma_pagamento, valor } = req.body;
  let query = 'UPDATE pagamentos SET ';
  const updates = [];
  const params = [];
  if (status_pagamento !== undefined) {
    updates.push('status_pagamento = ?');
    params.push(status_pagamento);
  }
  if (codigo_transacao !== undefined) {
    updates.push('codigo_transacao = ?');
    params.push(codigo_transacao);
  }
  if (data_pagamento !== undefined) {
    updates.push('data_pagamento = ?');
    params.push(data_pagamento);
  }
  if (forma_pagamento !== undefined) {
    updates.push('forma_pagamento = ?');
    params.push(forma_pagamento);
  }
  if (valor !== undefined) {
    updates.push('valor = ?');
    params.push(valor);
  }
  if (updates.length === 0) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nenhum campo para atualizar'
    });
  }
  query += updates.join(', ') + ' WHERE id = ?';
  params.push(req.params.id);
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao atualizar pagamento'
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Pagamento não encontrado'
      });
    }
    res.json({
      sucesso: true,
      mensagem: 'Pagamento atualizado com sucesso'
    });
  });
});

// ============================================
// 🧾 ROTAS DE VENDAS E ITENS DE VENDA
// ============================================
// Abaixo são definidas as rotas para registrar vendas e seus itens. Uma
// venda pode incluir produtos e/ou serviços. Ao criar uma venda é
// necessário fornecer os itens através do corpo da requisição. A rota
// também permite listar vendas e obter detalhes de uma venda
// específica, incluindo seus itens.

// Criar venda
app.post('/api/vendas', authMiddleware, (req, res) => {
  const { cliente_id, unidade_id, itens, forma_pagamento } = req.body;
  // itens deve ser um array de objetos { produto_id?, servico_id?, quantidade }
  if (!unidade_id || !itens || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({
      sucesso: false,
      erro: 'unidade_id e itens são obrigatórios'
    });
  }
  // Calcula total e prepara dados para inserção
  const calcularTotal = async () => {
    let total = 0;
    for (const item of itens) {
      if (item.produto_id) {
        const produto = await new Promise((resolve, reject) => {
          db.get('SELECT preco, estoque FROM produtos WHERE id = ? AND ativo = 1', [item.produto_id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        if (!produto) {
          throw new Error(`Produto ID ${item.produto_id} não encontrado`);
        }
        if (produto.estoque < item.quantidade) {
          throw new Error(`Estoque insuficiente para o produto ID ${item.produto_id}`);
        }
        total += produto.preco * item.quantidade;
      } else if (item.servico_id) {
        const servico = await new Promise((resolve, reject) => {
          db.get('SELECT preco FROM servicos WHERE id = ? AND ativo = 1', [item.servico_id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        if (!servico) {
          throw new Error(`Serviço ID ${item.servico_id} não encontrado`);
        }
        total += servico.preco * item.quantidade;
      } else {
        throw new Error('Item deve possuir produto_id ou servico_id');
      }
    }
    return total;
  };
  calcularTotal().then((total) => {
    // Inserir venda
    db.run(
      'INSERT INTO vendas (cliente_id, unidade_id, total) VALUES (?, ?, ?)',
      [cliente_id || null, unidade_id, total],
      function(err) {
        if (err) {
          return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao criar venda: ' + err.message
          });
        }
        const vendaId = this.lastID;
        // Inserir itens
        const inserirItens = () => {
          return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT INTO venda_itens (venda_id, produto_id, servico_id, quantidade, valor_unitario) VALUES (?, ?, ?, ?, ?)');
            let processed = 0;
            itens.forEach(async (item) => {
              try {
                let valorUnitario;
                if (item.produto_id) {
                  const produto = await new Promise((resolve2, reject2) => {
                    db.get('SELECT preco, estoque FROM produtos WHERE id = ?', [item.produto_id], (err2, row2) => {
                      if (err2) reject2(err2);
                      else resolve2(row2);
                    });
                  });
                  valorUnitario = produto.preco;
                  // atualizar estoque do produto
                  db.run('UPDATE produtos SET estoque = estoque - ? WHERE id = ?', [item.quantidade, item.produto_id]);
                } else {
                  const servico = await new Promise((resolve2, reject2) => {
                    db.get('SELECT preco FROM servicos WHERE id = ?', [item.servico_id], (err2, row2) => {
                      if (err2) reject2(err2);
                      else resolve2(row2);
                    });
                  });
                  valorUnitario = servico.preco;
                }
                stmt.run(vendaId, item.produto_id || null, item.servico_id || null, item.quantidade, valorUnitario, (err3) => {
                  if (err3) {
                    reject(err3);
                  } else {
                    processed++;
                    if (processed === itens.length) {
                      stmt.finalize();
                      resolve();
                    }
                  }
                });
              } catch (erroItem) {
                reject(erroItem);
              }
            });
          });
        };
        inserirItens().then(() => {
          // Se houver forma de pagamento, criar registro de pagamento associado
          if (forma_pagamento) {
            db.run(
              'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, status_pagamento) VALUES (?, ?, ?, ?)',
              [vendaId, forma_pagamento, total, 'pago'],
              function(errPag) {
                if (errPag) {
                  return res.status(500).json({
                    sucesso: false,
                    erro: 'Erro ao registrar pagamento da venda: ' + errPag.message
                  });
                }
                const pagamentoId = this.lastID;
                db.run(
                  'UPDATE vendas SET pagamento_id = ? WHERE id = ?',
                  [pagamentoId, vendaId],
                  () => {
                    res.status(201).json({
                      sucesso: true,
                      mensagem: 'Venda criada com sucesso',
                      dados: { id: vendaId, total }
                    });
                  }
                );
              }
            );
          } else {
            res.status(201).json({
              sucesso: true,
              mensagem: 'Venda criada com sucesso',
              dados: { id: vendaId, total }
            });
          }
        }).catch((erroItens) => {
          res.status(400).json({
            sucesso: false,
            erro: erroItens.message
          });
        });
      }
    );
  }).catch((erroCalc) => {
    res.status(400).json({
      sucesso: false,
      erro: erroCalc.message
    });
  });
});

// Listar vendas
app.get('/api/vendas', authMiddleware, (req, res) => {
  const { data_inicio, data_fim, cliente_id, unidade_id } = req.query;
  let query = 'SELECT * FROM vendas WHERE 1=1';
  const params = [];
  if (data_inicio && data_fim) {
    query += ' AND date(criado_em) BETWEEN date(?) AND date(?)';
    params.push(data_inicio, data_fim);
  }
  if (cliente_id) {
    query += ' AND cliente_id = ?';
    params.push(cliente_id);
  }
  if (unidade_id) {
    query += ' AND unidade_id = ?';
    params.push(unidade_id);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao listar vendas'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Obter detalhes da venda, incluindo itens
app.get('/api/vendas/:id', authMiddleware, (req, res) => {
  const vendaId = req.params.id;
  db.get('SELECT * FROM vendas WHERE id = ?', [vendaId], (err, venda) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao obter venda'
      });
    }
    if (!venda) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Venda não encontrada'
      });
    }
    db.all('SELECT * FROM venda_itens WHERE venda_id = ?', [vendaId], (err2, itens) => {
      if (err2) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao obter itens da venda'
        });
      }
      res.json({
        sucesso: true,
        dados: { ...venda, itens }
      });
    });
  });
});

// ============================================
// 🔄 ROTAS PARA HISTÓRICO E STATUS DE AGENDAMENTO
// ============================================
// As rotas a seguir permitem consultar o histórico de alterações de
// agendamentos e atualizar o status de um agendamento, registrando o
// histórico.

// Listar histórico de um agendamento
app.get('/api/agendamentos/:id/historico', authMiddleware, (req, res) => {
  db.all('SELECT * FROM historico_agendamentos WHERE agendamento_id = ? ORDER BY data_alteracao ASC', [req.params.id], (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao obter histórico'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Atualizar status do agendamento
app.put('/api/agendamentos/:id/status', authMiddleware, (req, res) => {
  const { novo_status } = req.body;
  const statusValidos = ['agendado', 'confirmado', 'cancelado', 'concluido'];
  if (!novo_status || !statusValidos.includes(novo_status)) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Status inválido'
    });
  }
  // Buscar agendamento atual
  db.get('SELECT status_agendamento FROM agendamentos WHERE id = ?', [req.params.id], (err, agendamento) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao buscar agendamento'
      });
    }
    if (!agendamento) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Agendamento não encontrado'
      });
    }
    const statusAnterior = agendamento.status_agendamento;
    if (statusAnterior === novo_status) {
      return res.status(400).json({
        sucesso: false,
        erro: 'O agendamento já está com esse status'
      });
    }
    db.run('UPDATE agendamentos SET status_agendamento = ? WHERE id = ?', [novo_status, req.params.id], function(updateErr) {
      if (updateErr) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao atualizar status'
        });
      }
      // Registrar histórico
      db.run(
        'INSERT INTO historico_agendamentos (agendamento_id, status_anterior, status_novo) VALUES (?, ?, ?)',
        [req.params.id, statusAnterior, novo_status],
        (histErr) => {
          if (histErr) {
            return res.status(500).json({
              sucesso: false,
              erro: 'Erro ao registrar histórico'
            });
          }
          res.json({
            sucesso: true,
            mensagem: 'Status atualizado com sucesso'
          });
        }
      );
    });
  });
});

// ============================================
// 👥 ROTAS PARA LISTAGEM DE BARBEIROS E CLIENTES
// ============================================
// Fornecem consultas básicas para listar barbeiros e clientes. É
// possível filtrar barbeiros por unidade e clientes por nome ou CPF.

// Listar barbeiros
app.get('/api/barbeiros', authMiddleware, (req, res) => {
  const { unidade_id, ativo } = req.query;
  let query = 'SELECT id, nome, cpf, telefone, email, unidade_id, percentual_comissao, foto_base64, ativo FROM barbeiros WHERE 1=1';
  const params = [];
  if (unidade_id) {
    query += ' AND unidade_id = ?';
    params.push(unidade_id);
  }
  if (ativo !== undefined) {
    query += ' AND ativo = ?';
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao listar barbeiros'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Obter barbeiro por ID
app.get('/api/barbeiros/:id', authMiddleware, (req, res) => {
  db.get('SELECT * FROM barbeiros WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao obter barbeiro'
      });
    }
    if (!row) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Barbeiro não encontrado'
      });
    }
    res.json({
      sucesso: true,
      dados: row
    });
  });
});

// Listar clientes
app.get('/api/clientes', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { nome, cpf, ativo } = req.query;
  let query = 'SELECT id, nome, cpf, telefone, email, ativo, criado_em FROM clientes WHERE 1=1';
  const params = [];
  if (nome) {
    query += ' AND nome LIKE ?';
    params.push(`%${nome}%`);
  }
  if (cpf) {
    query += ' AND cpf = ?';
    params.push(limparCPF(cpf));
  }
  if (ativo !== undefined) {
    query += ' AND ativo = ?';
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao listar clientes'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Obter cliente por ID
app.get('/api/clientes/:id', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  db.get('SELECT id, nome, cpf, telefone, email, ativo, criado_em FROM clientes WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao obter cliente'
      });
    }
    if (!row) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Cliente não encontrado'
      });
    }
    res.json({
      sucesso: true,
      dados: row
    });
  });
});

// ============================================
// 📊 ROTAS DE RELATÓRIOS
// ============================================
// Os relatórios fornecem visões agregadas sobre vendas, agendamentos e
// comissões. Estes endpoints geram somatórios e agrupamentos para
// facilitar a gestão financeira e operacional. Somente admins e
// gerentes têm acesso aos relatórios.

// Relatório de vendas por período
app.get('/api/relatorios/vendas', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { data_inicio, data_fim } = req.query;
  const params = [];
  let query = `SELECT date(criado_em) as data, SUM(total) as total_vendas, COUNT(*) as quantidade_vendas
               FROM vendas WHERE 1=1`;
  if (data_inicio && data_fim) {
    query += ' AND date(criado_em) BETWEEN date(?) AND date(?)';
    params.push(data_inicio, data_fim);
  }
  query += ' GROUP BY date(criado_em) ORDER BY date(criado_em) ASC';
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao gerar relatório de vendas'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Relatório de agendamentos por status em período
app.get('/api/relatorios/agendamentos', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { data_inicio, data_fim } = req.query;
  const params = [];
  let query = `SELECT status_agendamento, COUNT(*) as quantidade
               FROM agendamentos WHERE 1=1`;
  if (data_inicio && data_fim) {
    query += ' AND date(data_agendamento) BETWEEN date(?) AND date(?)';
    params.push(data_inicio, data_fim);
  }
  query += ' GROUP BY status_agendamento';
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao gerar relatório de agendamentos'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
});

// Relatório de comissões por barbeiro
app.get('/api/relatorios/comissoes', authMiddleware, checkPermission('admin', 'gerente'), (req, res) => {
  const { data_inicio, data_fim } = req.query;
  const params = [];
  let query = `SELECT b.id as barbeiro_id, b.nome as barbeiro_nome,
               SUM(s.preco * (b.percentual_comissao / 100.0)) as total_comissao
               FROM agendamentos a
               JOIN barbeiros b ON a.barbeiro_id = b.id
               JOIN servicos s ON a.servico_id = s.id
               WHERE a.status_agendamento = 'concluido'`;
  if (data_inicio && data_fim) {
    query += ' AND date(a.data_agendamento) BETWEEN date(?) AND date(?)';
    params.push(data_inicio, data_fim);
  }
  query += ' GROUP BY b.id, b.nome';
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao gerar relatório de comissões'
      });
    }
    res.json({
      sucesso: true,
      dados: rows
    });
  });
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

