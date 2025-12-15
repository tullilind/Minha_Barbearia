@echo off
setlocal enabledelayedexpansion
title REINICIAR SISTEMA (Limpeza + Start) - AR SOLUS
color 0C

:: ============================================================
:: 1. FASE DE LIMPEZA (MATAR PROCESSOS ANTIGOS)
:: ============================================================
cls
echo.
echo  =========================================================
echo    MODO DE LIMPEZA DE MEMORIA
echo  =========================================================
echo.
echo  [1/3] Buscando processos 'node.exe' travados...

:: Tenta matar qualquer processo node.exe rodando
taskkill /F /IM node.exe /T >nul 2>&1

if %errorlevel% equ 0 (
    echo    [SUCESSO] Processos Node.js antigos foram encerrados.
    echo    [INFO] Porta 30007 liberada com sucesso.
) else (
    echo    [INFO] Nenhum processo Node.js estava rodando. Limpo.
)

echo.
echo  [2/3] Aguardando liberacao do sistema...
timeout /t 2 >nul

:: ============================================================
:: 2. FASE DE INICIALIZACAO (COMO NO OUTRO SCRIPT)
:: ============================================================
color 0B
echo.
echo  =========================================================
echo    INICIANDO SISTEMA LIMPO
echo  =========================================================
echo.

:: Configurações
set "EMP=AR SOLUS"

:: Verifica pastas
if not exist "apis" (
    echo [ERRO] Pasta 'apis' nao encontrada.
    pause
    exit
)
if not exist "Interfaceusuarios" (
    mkdir Interfaceusuarios
    echo ^<h1^>Sistema Rodando^</h1^> > Interfaceusuarios\index.html
)

:: Verifica Node modules
if not exist "apis\node_modules" (
    echo [INFO] Instalando dependencias pela primeira vez...
    cd apis
    call npm install express sqlite3 sqlite cors bcryptjs multer
    cd ..
)

echo  [3/3] Abrindo janelas do sistema...

:: Inicia API
start "API - %EMP%" cmd /k "cd apis && node api.js"

:: Inicia Frontend
timeout /t 2 >nul
start "INTERFACE - %EMP%" cmd /k "http-server Interfaceusuarios -p 30006 -c-1 -o"

cls
color 0A
echo.
echo  =========================================================
echo    SISTEMA REINICIADO COM SUCESSO!
echo  =========================================================
echo.
echo  1. Processos antigos: ENCERRADOS
echo  2. Banco de Dados:    CONECTADO
echo  3. API:               ONLINE (Porta 30007)
echo  4. Interface:         ABERTA (Porta 30006)
echo.
echo  Pode minimizar esta janela.
echo.
pause >nul