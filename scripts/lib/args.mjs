/**
 * Lecture des arguments de ligne de commande des scripts
 *
 * Responsabilité : séparer options et arguments positionnels de `process.argv.slice(2)` en
 * refusant toute option inconnue. Un `--dry-run` mal orthographié ou non pris en charge ne doit
 * jamais être ignoré en silence, surtout par un script destructif.
 *
 * Ce module n'est pas une CLI : il est importé par les scripts de `scripts/`.
 */

/**
 * @typedef {Object} ParsedArgs
 * @property {Record<string, boolean>} flags - Chaque option déclarée, à `true` si elle est présente.
 * @property {Record<string, string>} values - Options `--nom=valeur` déclarées dans `valueOptions`.
 * @property {string[]} positionals - Arguments qui ne commencent pas par `-`.
 */

/**
 * Analyse les arguments d'un script.
 *
 * @param {string[]} argv - Arguments bruts (`process.argv.slice(2)`).
 * @param {Object} spec - Options acceptées.
 * @param {Record<string, string[]>} [spec.flags] - Nom logique → orthographes acceptées (`['--force', '-f']`).
 * @param {string[]} [spec.valueOptions] - Options de la forme `--nom=valeur` (sans le `=`).
 * @returns {ParsedArgs} Les options et arguments positionnels.
 * @throws {Error} Si une option n'est pas déclarée.
 */
export function parseCliArgs(argv, { flags = {}, valueOptions = [] } = {}) {
    const result = { flags: {}, values: {}, positionals: [] };
    const aliasToName = new Map();
    for (const [name, aliases] of Object.entries(flags)) {
        result.flags[name] = false;
        for (const alias of aliases) aliasToName.set(alias, name);
    }

    for (const arg of argv) {
        if (!arg.startsWith('-')) {
            result.positionals.push(arg);
            continue;
        }
        if (aliasToName.has(arg)) {
            result.flags[aliasToName.get(arg)] = true;
            continue;
        }
        const valueOption = valueOptions.find((option) => arg.startsWith(`${option}=`));
        if (valueOption) {
            result.values[valueOption] = arg.slice(valueOption.length + 1);
            continue;
        }
        throw new Error(`Option inconnue : ${arg}`);
    }
    return result;
}
