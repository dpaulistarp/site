@echo off
title Distrito Paulista RP — Servidor Local
echo ============================================================
echo   DISTRITO PAULISTA RP - SERVIDOR LOCAL
echo ============================================================
echo.
echo Iniciando servidor em http://localhost:5500 ...
echo Abrindo o navegador automaticamente...
echo.
start http://localhost:5500/regras.html
node server.js
pause
