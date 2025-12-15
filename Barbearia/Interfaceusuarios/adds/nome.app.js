/**
 * LOCAL: Barbearia/adds/nome.app.js
 * FUNÇÃO: Identidade visual (Nome, Versão, Título da Aba).
 */

const APP_CONFIG = {
    nome: "Barbearia Bioteste",
    versao: "2.1 Ultimate",
    descricao: "Gestão Inteligente",
    autor: "Seu Sistema"
};

function aplicarIdentidade() {
    // Muda o título da aba do navegador
    document.title = `${APP_CONFIG.nome} - ${APP_CONFIG.versao}`;
    
    // Se existir um elemento H1 com id="app-titulo", muda o texto dele
    const tituloDisplay = document.getElementById('app-titulo');
    if (tituloDisplay) {
        tituloDisplay.innerText = APP_CONFIG.nome;
    }
    
    console.log(`📱 App: ${APP_CONFIG.nome} carregado.`);
}

// Executa assim que a tela abrir
document.addEventListener("DOMContentLoaded", aplicarIdentidade);