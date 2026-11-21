#!/bin/bash
set -e

# Stellarium Web Engine Build & Deployment Script
#
# Responsabilité :
# - Clone ou met à jour stellarium-web-engine dans temp/stellarium-web-engine.
# - Compile le moteur dans un conteneur Emscripten (Docker requis).
# - Copie le JS et le WASM dans public/js/, et les données du ciel dans public/data/
#   (seul chemin lu par src/hooks/useStellariumEngine.ts).
# - Réapplique les noms français des constellations (scripts/stellarium/french-names.cjs).
#
# Options disponibles : aucune.
#
# Exemples d'utilisation (depuis la racine du dépôt) :
#   bash scripts/stellarium/build.sh

# Configuration
REPO_URL="https://github.com/Stellarium/stellarium-web-engine.git"
BUILD_DIR="temp/stellarium-web-engine"
OUTPUT_DIR="public/js"

if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH."
    exit 1
fi

if [ ! -d "$BUILD_DIR" ]; then
    echo "Cloning stellarium-web-engine..."
    git clone "$REPO_URL" "$BUILD_DIR" --recursive
else
    echo "Repo already exists over at $BUILD_DIR. Pulling latest..."
    cd "$BUILD_DIR" && git pull && git submodule update --init --recursive && cd -
fi

# Run build inside Emscripten container. 
# We install scons manually inside the container as the base emsdk image doesn't include it.
docker run --rm -v "$(pwd)/$BUILD_DIR":/src -w /src emscripten/emsdk:latest \
    /bin/bash -c "pip install scons && make"

if [ -f "$BUILD_DIR/build/stellarium-web-engine.js" ]; then
    echo "Build successful! Copying files..."
    mkdir -p "$OUTPUT_DIR"
    cp "$BUILD_DIR/build/stellarium-web-engine.js" "$OUTPUT_DIR/"
    cp "$BUILD_DIR/build/stellarium-web-engine.wasm" "$OUTPUT_DIR/"
    
    mkdir -p public/data

    cp -r "$BUILD_DIR/data/"* "public/data/"

    if [ -d "$BUILD_DIR/apps/test-skydata" ]; then
        cp -r "$BUILD_DIR/apps/test-skydata/"* "public/data/"
    fi

    # POURQUOI : le moteur demande skycultures/western/index.json (vérifié sur le réseau) ;
    # on ne renomme donc plus index.json, et on réapplique les noms français par-dessus.
    node scripts/stellarium/french-names.cjs

    echo "Files copied to $OUTPUT_DIR and public/data"
else
    echo "Error: Build failed. Output file not found."
    exit 1
fi
