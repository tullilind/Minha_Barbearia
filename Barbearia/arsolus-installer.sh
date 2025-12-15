#!/bin/bash

# =========================================================
#  AR SOLUS - SISTEMA DE INSTALAÇÃO AUTOMÁTICA
# =========================================================
#  Empresa Criadora : AR Solus
#  Criador          : João Vitor Tulli Ribeiro
#  Sistema          : API Node.js + PM2
#  Plataforma       : Debian Linux
# =========================================================
#  Este script:
#   ✔ Instala Node.js LTS
#   ✔ Instala PM2
#   ✔ Instala dependências do projeto
#   ✔ Inicia o sistema
#   ✔ Configura inicialização automática
# =========================================================

APP_NAME="barbearia-api"
APP_FILE="api.js"
NODE_VERSION="20"

clear
echo "================================================="
echo "🚀 AR SOLUS - INSTALADOR OFICIAL"
echo "Criador: João Vitor Tulli Ribeiro"
echo "================================================="
echo ""

# -------------------------------
# VERIFICA SE É ROOT
# -------------------------------
if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root ou com sudo"
  exit 1
fi

# -------------------------------
# ATUALIZA SISTEMA
# -------------------------------
echo "🔄 Atualizando sistema..."
apt update -y && apt upgrade -y

# -------------------------------
# DEPENDÊNCIAS BÁSICAS
# -------------------------------
echo "📦 Instalando dependências básicas..."
apt install -y curl git build-essential

# -------------------------------
# NODE.JS
# -------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "🟢 Instalando Node.js LTS $NODE_VERSION..."
  curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
  apt install -y nodejs
else
  echo "✅ Node.js já instalado"
fi

# -------------------------------
# PM2
# -------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  echo "📦 Instalando PM2..."
  npm install -g pm2
else
  echo "✅ PM2 já instalado"
fi

# -------------------------------
# DEPENDÊNCIAS DO PROJETO
# -------------------------------
echo "📦 Instalando dependências do projeto..."
npm install

# -------------------------------
# PM2 - START
# -------------------------------
echo "♻️ Reiniciando aplicação no PM2..."
pm2 delete $APP_NAME 2>/dev/null

pm2 start $APP_FILE --name "$APP_NAME"

# -------------------------------
# PM2 STARTUP
# -------------------------------
echo "💾 Salvando estado do PM2..."
pm2 save

echo "🔁 Configurando PM2 para iniciar com o sistema..."
pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER

# -------------------------------
# FINAL
# -------------------------------
clear
echo "================================================="
echo "✅ SISTEMA INSTALADO COM SUCESSO"
echo ""
echo "Empresa : AR Solus"
echo "Criador : João Vitor Tulli Ribeiro"
echo ""
echo "📡 Aplicação: $APP_NAME"
echo "📂 Arquivo : $APP_FILE"
echo ""
echo "📊 Status PM2:"
pm2 list
echo "================================================="
