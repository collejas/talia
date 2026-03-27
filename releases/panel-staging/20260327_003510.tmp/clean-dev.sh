#!/usr/bin/env bash
  set -e

  cd /var/www/talia/frontend/panel

  echo "1) Cerrando procesos Next/Node del proyecto..."
  pkill -f "next dev" || true
  pkill -f "next-server" || true

  echo "2) Limpiando build/cache..."
  rm -rf .next
  rm -rf node_modules/.cache

  echo "3) Verificando uso actual de inotify (referencia)..."
  cat /proc/sys/fs/inotify/max_user_watches
  cat /proc/sys/fs/inotify/max_user_instances

  echo "Listo. Ahora ejecuta: npm run dev"