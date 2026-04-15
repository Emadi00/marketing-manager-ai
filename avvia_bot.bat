@echo off
title Marketing Manager — Avvio Sistema
cd /d "C:\Users\super\Desktop\MARKETING MANAGER"

echo.
echo  Avvio Dashboard...
start "Dashboard" cmd /k "cd /d \"C:\Users\super\Desktop\MARKETING MANAGER\dashboard\" && npm run dev"

echo  Avvio Bot Telegram...
start "Bot Telegram" cmd /k "cd /d \"C:\Users\super\Desktop\MARKETING MANAGER\" && python bot_telegram.py"

echo.
echo  Sistema avviato.
echo  Dashboard  ^>  http://localhost:3000
echo  Chiudi questa finestra quando vuoi.
echo.
pause
