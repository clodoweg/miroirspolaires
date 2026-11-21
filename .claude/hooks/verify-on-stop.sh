#!/bin/bash
#
# Hook Stop de Claude Code : vérification automatique avant de rendre la main
#
# Responsabilité :
# - Ne fait rien si l'arbre git est propre, ou si seuls des fichiers non-code ont changé
#   (Markdown, JSON de données, images).
# - Ne refait rien si l'état de l'arbre est identique à celui de la dernière vérification
#   réussie (empreinte de `git status` + `git diff`).
# - Sinon lance `astro check` puis `vitest run`. En cas d'échec, écrit les erreurs sur stderr
#   et sort en code 2 : Claude Code bloque l'arrêt et renvoie ces erreurs à Claude.
# - Ne bloque jamais plus de MAX_CONSECUTIVE_BLOCKS fois de suite, pour éviter une boucle
#   si une erreur ne peut pas être corrigée dans la session.
#
# Options disponibles : aucune (lit sur stdin le JSON de l'évènement Stop, non utilisé).
#
# Exemples d'utilisation :
#   Déclaré dans .claude/settings.json (hooks.Stop). Test manuel depuis la racine :
#   echo '{}' | bash .claude/hooks/verify-on-stop.sh; echo "code $?"

set -u

MAX_CONSECUTIVE_BLOCKS=2
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/hooks/.state"
BLOCK_COUNT_FILE="$STATE_DIR/verify-block-count"
LAST_OK_FILE="$STATE_DIR/verify-last-ok"

cd "$PROJECT_DIR" || exit 0
cat > /dev/null

changed_files=$(git status --porcelain --untracked-files=all | awk '{print $NF}')
if [ -z "$changed_files" ]; then
    exit 0
fi

# POURQUOI : vérifier types et tests n'a de sens que si du code a changé.
if ! echo "$changed_files" | grep -vE '^src/data/|^data/' | grep -qE '\.(ts|tsx|astro|mjs|js|cjs)$|package(-lock)?\.json$'; then
    exit 0
fi

mkdir -p "$STATE_DIR"
fingerprint=$( (git status --porcelain --untracked-files=all; git diff) | shasum | cut -d' ' -f1)
if [ -f "$LAST_OK_FILE" ] && [ "$(cat "$LAST_OK_FILE")" = "$fingerprint" ]; then
    exit 0
fi

block_count=$(cat "$BLOCK_COUNT_FILE" 2>/dev/null || echo 0)
if [ "$block_count" -ge "$MAX_CONSECUTIVE_BLOCKS" ]; then
    echo 0 > "$BLOCK_COUNT_FILE"
    echo "verify-on-stop : $MAX_CONSECUTIVE_BLOCKS blocages consécutifs, vérification ignorée cette fois." >&2
    exit 0
fi

failures=""
check_output=$(npx astro check 2>&1)
if [ $? -ne 0 ]; then
    failures+=$'astro check a échoué :\n'"$(echo "$check_output" | grep -E 'error|Error' | head -30)"$'\n\n'
fi

test_output=$(npx vitest run 2>&1)
if [ $? -ne 0 ]; then
    failures+=$'vitest run a échoué :\n'"$(echo "$test_output" | grep -E 'FAIL|✗|×|AssertionError|Error:' | head -30)"$'\n'
fi

if [ -n "$failures" ]; then
    echo $((block_count + 1)) > "$BLOCK_COUNT_FILE"
    echo "$failures" >&2
    exit 2
fi

echo 0 > "$BLOCK_COUNT_FILE"
echo "$fingerprint" > "$LAST_OK_FILE"
exit 0
