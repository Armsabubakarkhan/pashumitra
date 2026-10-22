#!/bin/sh
# Starts a throwaway server for browser tests on port 3111 with a fresh database.
cd "$(dirname "$0")/.."
rm -f data/e2e.db data/e2e.db-wal data/e2e.db-shm
ENV_FILE=.env.e2e exec node --disable-warning=ExperimentalWarning server.js
