/**
 * LOCAL: Barbearia/adds/apibase.js
 * FUNÇÃO: Define o endereço do servidor (Backend) para todo o sistema.
 */

// Endereço da sua API (Porta 30007 conforme configurado no api.js)
const API_BASE_URL = "http://localhost:30007";

// Função para formatar URLs (ex: 'clientes' vira 'http://localhost:30007/api/clientes')
function getApiUrl(endpoint) {
    // Remove a barra inicial se houver
    const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return `${API_BASE_URL}/api/${path}`;
}

console.log(`📡 Sistema conectado em: ${API_BASE_URL}`);