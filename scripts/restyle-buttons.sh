#!/usr/bin/env bash
# Uso (desde la raíz del proyecto): bash scripts/restyle-buttons.sh
set -e
cd src/renderer/src/components
perl -pi -e '
  s/rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500( disabled:opacity-50)?/btn btn-primary/g;
  s/rounded(?:-md)? bg-blue-600 px-3 py-1\.5 (?:text-xs )?font-semibold text-white hover:bg-blue-500(?: disabled:[a-z0-9:-]+)*/btn btn-primary btn-sm/g;
  s/rounded-md px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200/btn btn-ghost/g;
' *.tsx
echo "Listo. Revisa los cambios con: git diff --stat"