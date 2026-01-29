#!/bin/sh
set -e

: "${NEXT_PUBLIC_API_URL:=}"

cat <<EOF > /app/public/runtime-env.js
window.__env = {
  NEXT_PUBLIC_API_URL: "${NEXT_PUBLIC_API_URL}"
};
EOF

exec "$@"
