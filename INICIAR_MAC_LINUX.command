#!/bin/sh
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 app.py
fi
echo "Python 3 nao encontrado. Instale Python 3.10+ para continuar."
read -r _
