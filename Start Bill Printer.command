#!/bin/bash
cd "$(dirname "$0")"

PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()")

echo "Starting Bill Printer at http://localhost:$PORT/"
echo "Keep this window open while you print. Close it (or press Ctrl+C) to stop."
echo ""

(sleep 1; open "http://localhost:$PORT/index.html") &

python3 -m http.server "$PORT" --bind 127.0.0.1
