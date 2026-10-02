#!/bin/sh
# Copies the IdeaLens design system into public/ds, verbatim.
# The platform links these files directly; nothing in them is edited here.
# Usage: npm run sync:ds [path-to-design-system]
set -eu
SRC="${1:-$HOME/Downloads/IdeaLens-design-system}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/ds"

rm -rf "$DEST"
mkdir -p "$DEST/components" "$DEST/fonts"
cp "$SRC/tokens.css" "$SRC/tokens.json" "$SRC/README.md" "$DEST/"
cp "$SRC/components/bundle.css" "$DEST/components/"
cp "$SRC"/fonts/*.ttf "$SRC"/fonts/*.txt "$DEST/fonts/"
echo "Design system copied from $SRC"
