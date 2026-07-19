#!/bin/bash
# Double-click this file to start Airline Points Search.
# Keep this Terminal window open while you use the app; closing it stops
# the website and search worker. Press Ctrl+C here to stop everything.

cd "$(dirname "$0")"

fail() {
  echo ""
  echo "ERROR: $1"
  echo ""
  read -p "Press Enter to close this window..."
  exit 1
}

echo "Starting Docker containers (Postgres + Redis)..."
docker compose up -d || fail "Docker Desktop doesn't seem to be running. Open the Docker Desktop app, wait until it says it's running, then double-click this file again."

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies (this can take a few minutes the first time — it also downloads a headless browser)..."
  npm install || fail "npm install failed. Scroll up for the actual error message."
fi

echo "Setting up the database..."
npm run db:migrate || fail "Database setup failed. Make sure the Docker containers above started successfully."

echo "Starting the app... your browser will open automatically once it's ready."
(
  for i in $(seq 1 90); do
    if curl -s -o /dev/null http://localhost:3000; then
      open http://localhost:3000
      break
    fi
    sleep 1
  done
) &

npm run dev
