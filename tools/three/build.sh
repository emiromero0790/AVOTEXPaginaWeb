#!/usr/bin/env bash
# Reconstruye assets/vendor/three/three.avotex.min.js (three.js r186, solo las clases de entry.js).
# Uso (desde la raíz del repositorio):  bash tools/three/build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
npm init -y >/dev/null
npm install --silent three@0.186.1 esbuild@0.24.0
cp "$ROOT/tools/three/entry.js" ./entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2019 \
  --legal-comments=inline --outfile="$ROOT/assets/vendor/three/three.avotex.min.js"
cp node_modules/three/LICENSE "$ROOT/assets/vendor/three/LICENSE"
echo "Listo: assets/vendor/three/three.avotex.min.js"
