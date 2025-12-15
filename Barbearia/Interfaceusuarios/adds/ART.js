/**
 * LOCAL: Barbearia/adds/ART.js
 * FUNÇÃO: Segurança Front-End (Anti-Cópia e Anti-Inspeção).
 */

(function () {
    "use strict";
    console.log("🛡️ Sistema de Proteção ART.js Ativo");

    // 1. Bloqueia Botão Direito do Mouse
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        return false;
    });

    // 2. Bloqueia Teclas de Atalho de Dev (F12, Ctrl+Shift+I, etc)
    document.addEventListener('keydown', function (e) {
        // Bloqueia F12
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault();
            return false;
        }
        // Bloqueia Ctrl+Shift+I (Inspecionar) e Ctrl+U (Ver Fonte)
        if ((e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
            (e.ctrlKey && ['U', 'S'].includes(e.key.toUpperCase()))) {
            e.preventDefault();
            return false;
        }
    });

    
    setInterval(function () {
        const start = performance.now();
        debugger; 
        const end = performance.now();
        if (end - start > 100) {
            document.body.innerHTML = '<h1 style="color:red;text-align:center;">Acesso Negado. Feche o console.</h1>';
        }
    }, 2000);
    

})();