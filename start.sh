#!/usr/bin/env bash
# L1 Support for MR & CP — launcher for macOS / Linux
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js was not found on this machine."
  echo "  Install it from https://nodejs.org (the LTS version), then run this script again."
  echo ""
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies the first time this runs - this can take a minute..."
  npm install
fi

export PORT=3002

echo ""
echo "Starting L1 Support for MR & CP ..."
echo "Once you see \"is running\" below, open http://localhost:3002 in your browser."
echo "Press Ctrl+C to stop the server."
echo ""

( sleep 1 && (command -v open >/dev/null 2>&1 && open http://localhost:3002 || command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:3002 || true) ) &

npm start
