#!/bin/bash
# Setup Marketing Manager Bot — Oracle Cloud Ubuntu 22.04 ARM
# Esegui come: bash setup_oracle.sh
set -e

echo "=== [1/7] Aggiornamento sistema ==="
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
    python3 python3-pip python3-venv \
    ffmpeg git curl wget unzip \
    nodejs npm \
    chromium-browser \
    build-essential libssl-dev

echo "=== [2/7] Struttura cartelle ==="
mkdir -p ~/marketing-manager/{OUTPUT,logs,deploy}
mkdir -p ~/marketing-manager/OUTPUT/"VideoCraft Studio"/{Video,Covers,Caroselli}

echo "=== [3/7] Python virtualenv + dipendenze ==="
cd ~/marketing-manager
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install \
    python-telegram-bot==20.* \
    openai-whisper \
    anthropic \
    python-dotenv \
    requests

echo "=== [4/7] Node.js — Remotion ==="
cd ~/marketing-manager/video-editor
npm install

echo "=== [5/7] Claude CLI ==="
mkdir -p ~/.local/bin
# Scarica Claude CLI per Linux ARM64
curl -fsSL "https://storage.googleapis.com/anthropic-release/claude-cli/latest/linux-arm64/claude" \
    -o ~/.local/bin/claude 2>/dev/null || \
    curl -fsSL "https://claude.ai/cli/install.sh" | bash
chmod +x ~/.local/bin/claude

# Aggiunge al PATH se non presente
grep -q 'local/bin' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"

echo ""
echo "=== [6/7] Claude CLI — AUTENTICAZIONE RICHIESTA ==="
echo "Verrà aperto il browser per il login. Se sei in SSH usa il link che appare."
claude --version && claude login || echo "⚠️  Autenticati manualmente con: claude login"

echo "=== [7/7] File .env ==="
if [ ! -f ~/marketing-manager/.env ]; then
    cp ~/marketing-manager/deploy/oracle.env ~/marketing-manager/.env
    echo "⚠️  Modifica ~/marketing-manager/.env con le tue API keys:"
    echo "    nano ~/marketing-manager/.env"
else
    echo "✅ .env già presente"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Setup completato!                           ║"
echo "║                                              ║"
echo "║  Prossimi passi:                             ║"
echo "║  1. nano ~/marketing-manager/.env            ║"
echo "║     → inserisci ANTHROPIC_API_KEY            ║"
echo "║  2. sudo cp deploy/marketing-manager.service ║"
echo "║        /etc/systemd/system/                  ║"
echo "║  3. sudo systemctl enable marketing-manager  ║"
echo "║  4. sudo systemctl start marketing-manager   ║"
echo "╚══════════════════════════════════════════════╝"
