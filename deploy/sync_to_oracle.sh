#!/bin/bash
# Sincronizza i file dal PC al server Oracle
# Uso: bash sync_to_oracle.sh <IP_SERVER>
# Es:  bash sync_to_oracle.sh 130.61.45.22
#
# Prima volta: copia la chiave SSH con
#   ssh-copy-id ubuntu@<IP_SERVER>

SERVER="ubuntu@${1:?Passa l'IP del server come argomento}"
REMOTE="~/marketing-manager"

echo "=== Sync verso $SERVER ==="

rsync -avz --progress \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'bot.log' \
    --exclude 'video-editor/node_modules' \
    --exclude 'video-editor/out' \
    "/c/Users/super/Desktop/MARKETING MANAGER/" \
    "$SERVER:$REMOTE/"

echo "✅ Sync completato"
echo "Per riavviare il bot:"
echo "  ssh $SERVER 'sudo systemctl restart marketing-manager'"
