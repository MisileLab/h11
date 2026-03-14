#!/bin/sh
set -eu

db_url="${DATABASE_URL:-sqlite:///./arxgorithm.db}"

case "$db_url" in
  sqlite:///*)
    db_path="${db_url#sqlite:///}"
    ;;
  sqlite://*)
    db_path="${db_url#sqlite://}"
    ;;
  *)
    db_path=""
    ;;
esac

if [ -n "$db_path" ] && [ "$db_path" != ":memory:" ]; then
  db_dir=$(dirname "$db_path")
  mkdir -p "$db_dir"
  chown -R appuser:appuser "$db_dir"
fi

exec su -s /bin/sh appuser -c 'uvicorn app.main:app --host 0.0.0.0 --port 8000'
