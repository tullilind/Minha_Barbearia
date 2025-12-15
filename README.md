# 💈 Minha Barbearia – API Backend

> Sistema backend profissional para gestão de barbearias, desenvolvido em **Node.js**, com **SQLite**, **PM2** e arquitetura preparada para produção.

---

## 🏢 Empresa Criadora

**AR Solus**

## 👨‍💻 Criador

**João Vitor Tulli Ribeiro**

---

## 📌 Visão Geral

Este projeto é a **API oficial do sistema Minha Barbearia**, responsável por gerenciar:

* 👤 Usuários (admin, gerente, funcionário)
* ✂️ Barbeiros
* 🙋 Clientes
* 📅 Agendamentos
* 💰 Pagamentos
* 🧾 Vendas e produtos
* 🔔 Notificações
* 📲 Integração com WhatsApp
* ⏱️ Tarefas automáticas (cron)

A API foi pensada para **ambiente de produção**, com inicialização automática, recuperação de falhas e fácil manutenção.

---

## 🧱 Tecnologias Utilizadas

* **Node.js 20 (LTS)**
* **Express.js**
* **SQLite3**
* **PM2** (gerenciador de processos)
* **JWT** (autenticação)
* **bcrypt** (hash de senhas)
* **dotenv** (variáveis de ambiente)
* **node-cron** (tarefas agendadas)
* **Axios / Form-Data** (integrações externas)

---

## 📂 Estrutura do Projeto

```
Barbearia/
├── apis/
│   ├── api.js            # Backend principal
│   ├── node_modules/
│   ├── package.json
│   ├── package-lock.json
│   └── .env
├── Interfaceusuarios/    # Frontend (não Node)
├── LICENSE
└── README.md
```

---

## ⚙️ Instalação (Debian Linux)

### 1️⃣ Atualizar o sistema

```bash
sudo apt update -y && sudo apt upgrade -y
```

### 2️⃣ Instalar Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3️⃣ Instalar PM2

```bash
sudo npm install -g pm2
```

### 4️⃣ Entrar na pasta da API

```bash
cd Barbearia/apis
```

### 5️⃣ Instalar dependências

```bash
npm install express bcrypt jsonwebtoken sqlite3 multer archiver cors dotenv axios node-cron form-data
```

### 6️⃣ Criar arquivo `.env`

```env
PORT=40003
JWT_SECRET=sua_chave_secreta
WEBHOOK_API_URL=https://apiszap.appguardiaomais.com.br
```

---

## ▶️ Executar o Sistema

### 🔹 Teste local (sem PM2)

```bash
node api.js
```

### 🔹 Produção com PM2

```bash
pm2 start api.js --name barbearia-api
pm2 save
```

### 🔹 Inicialização automática no boot

```bash
pm2 startup systemd
# execute o comando que o PM2 mostrar
pm2 save
```

---

## 🔍 Comandos Úteis PM2

```bash
pm2 list
pm2 logs barbearia-api
pm2 restart barbearia-api
pm2 stop barbearia-api
pm2 delete barbearia-api
```

---

## 🔐 Segurança

* Senhas armazenadas com **bcrypt**
* Autenticação via **JWT**
* Recuperação de senha com token temporário
* Variáveis sensíveis protegidas via `.env`

---

## 📜 Licença

Este projeto está licenciado sob a **MIT License**.

Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.

---

## 🚀 Status do Projeto

✅ Backend funcional
✅ Produção validada em Debian
✅ PM2 configurado
✅ Banco inicializado automaticamente

🔜 Próximos passos:

* Nginx + HTTPS
* Deploy automatizado
* Docker oficial AR Solus
* Painel administrativo web

---

💡 *AR Solus — Transformando ideias em sistemas reais.*
