#!/usr/bin/env bash
# Local PostgreSQL for development without Docker.
# Usage: scripts/db-local.sh start|stop|status|reset
# Creates a cluster in ./.pgdata (git-ignored) on port ${PGPORT:-5433}
# with databases "salamat" (dev) and "salamat_test" (automated tests).
set -euo pipefail
cd "$(dirname "$0")/.."
PGPORT="${PGPORT:-5433}"
PGDATA_DIR="$(pwd)/.pgdata"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [ -z "${PGBIN}" ] || [ ! -x "${PGBIN}/pg_ctl" ]; then
  PGBIN="$(dirname "$(command -v pg_ctl || true)")"
fi
[ -x "${PGBIN}/pg_ctl" ] || { echo "pg_ctl not found. Install PostgreSQL 16 or use: docker compose up -d db"; exit 1; }

# PostgreSQL refuses to run as root: run server commands as the "postgres" user then.
as_pg() { if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

start() {
  if [ ! -f "${PGDATA_DIR}/PG_VERSION" ]; then
    mkdir -p "${PGDATA_DIR}"
    [ "$(id -u)" = "0" ] && chown postgres "${PGDATA_DIR}"
    as_pg "${PGBIN}/initdb" -D "${PGDATA_DIR}" -U salamat --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
    echo "Initialised cluster in ${PGDATA_DIR}"
  fi
  if as_pg "${PGBIN}/pg_ctl" -D "${PGDATA_DIR}" status >/dev/null 2>&1; then
    echo "PostgreSQL already running on port ${PGPORT}"
  else
    as_pg "${PGBIN}/pg_ctl" -D "${PGDATA_DIR}" -o "-p ${PGPORT} -k /tmp -c listen_addresses=127.0.0.1" -l "${PGDATA_DIR}/server.log" -w start >/dev/null
    echo "PostgreSQL started on 127.0.0.1:${PGPORT}"
  fi
  for db in salamat salamat_test salamat_e2e_test; do
    "${PGBIN}/psql" -h 127.0.0.1 -p "${PGPORT}" -U salamat -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1 \
      || "${PGBIN}/createdb" -h 127.0.0.1 -p "${PGPORT}" -U salamat "${db}"
  done
  echo "DATABASE_URL=postgresql://salamat@127.0.0.1:${PGPORT}/salamat"
}
stop() { as_pg "${PGBIN}/pg_ctl" -D "${PGDATA_DIR}" -m fast stop || true; }
status() { as_pg "${PGBIN}/pg_ctl" -D "${PGDATA_DIR}" status || true; }
reset() { stop; rm -rf "${PGDATA_DIR}"; start; }

case "${1:-start}" in
  start) start ;; stop) stop ;; status) status ;; reset) reset ;;
  *) echo "usage: $0 start|stop|status|reset"; exit 2 ;;
esac
