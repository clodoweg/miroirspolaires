/**
 * Formulaire des options d'un script : case à cocher, liste de valeurs ou nombre, chacune avec son explication.
 *
 * Responsabilité : afficher les `options` déclarées dans `SCRIPTS` (`src/lib/admin/scripts.ts`) et la commande
 * qui en résulte. Composant contrôlé : les valeurs vivent chez l'appelant, qui les envoie au lancement ; le
 * serveur les revalide (`buildScriptArgs`). Une option destructive cochée est signalée en rouge.
 */
import { useId } from 'react';
import type { ScriptOption, ScriptOptionValues } from '@/lib/admin/scripts';

interface Props {
    options: ScriptOption[];
    values: ScriptOptionValues;
    onChange: (values: ScriptOptionValues) => void;
    disabled?: boolean;
}

/**
 * Arguments affichés pour les valeurs choisies (aperçu seulement ; le serveur reconstruit les siens).
 *
 * @param options - Options déclarées.
 * @param values - Valeurs choisies.
 * @returns Les arguments, dans l'ordre déclaré.
 */
export function previewScriptArgs(options: ScriptOption[], values: ScriptOptionValues): string[] {
    const args: string[] = [];
    for (const option of options) {
        const value = values[option.id];
        if (option.kind === 'flag' && value === true) args.push(option.flag);
        if (option.kind === 'list' && Array.isArray(value) && value.length > 0)
            args.push(`${option.flag}${value.join(',')}`);
        if (option.kind === 'number' && typeof value === 'number') args.push(option.flag, String(value));
    }
    return args;
}

function OptionField({
    option,
    value,
    onChange,
    disabled,
}: {
    option: ScriptOption;
    value: ScriptOptionValues[string] | undefined;
    onChange: (value: ScriptOptionValues[string] | undefined) => void;
    disabled?: boolean;
}) {
    const id = useId();
    const isDestructiveChecked = option.kind === 'flag' && option.destructive === true && value === true;
    return (
        <div
            className={`flex flex-col gap-2 rounded-xl border p-3 ${
                isDestructiveChecked ? 'border-mp-astro-red/50' : 'border-mp-glass-border'
            }`}
        >
            {option.kind === 'flag' ? (
                <label htmlFor={id} className="flex min-h-touch cursor-pointer items-center gap-3">
                    <input
                        id={id}
                        type="checkbox"
                        checked={value === true}
                        disabled={disabled}
                        onChange={(event) => onChange(event.target.checked || undefined)}
                        className="h-4 w-4 accent-mp-accent"
                    />
                    <code className="font-mono text-sm text-mp-accent">{option.flag}</code>
                    <span className="text-sm text-mp-text-primary">{option.label}</span>
                </label>
            ) : (
                <label htmlFor={id} className="flex flex-wrap items-center gap-3">
                    <code className="font-mono text-sm text-mp-accent">{option.flag.replace(/=$/, '')}</code>
                    <span className="text-sm text-mp-text-primary">{option.label}</span>
                    {option.kind === 'list' ? (
                        <input
                            id={id}
                            type="text"
                            value={Array.isArray(value) ? value.join(', ') : ''}
                            disabled={disabled}
                            placeholder="vide : tous"
                            onChange={(event) => {
                                const items = event.target.value
                                    .split(/[\s,]+/)
                                    .map((item) => item.trim())
                                    .filter(Boolean);
                                onChange(items.length > 0 ? items : undefined);
                            }}
                            className="admin-input max-w-xs font-mono"
                        />
                    ) : (
                        <input
                            id={id}
                            type="number"
                            min={option.min}
                            max={option.max}
                            step={option.integer ? 1 : 'any'}
                            value={typeof value === 'number' ? value : ''}
                            placeholder={String(option.defaultValue)}
                            disabled={disabled}
                            onChange={(event) =>
                                onChange(event.target.value === '' ? undefined : Number(event.target.value))
                            }
                            className="admin-input w-32 font-mono"
                        />
                    )}
                </label>
            )}
            <p className="text-sm text-mp-text-secondary">
                {option.help}
                {option.kind === 'number' && ` Défaut : ${option.defaultValue}.`}
            </p>
            {isDestructiveChecked && (
                <p className="text-sm text-mp-astro-red">Option destructive : une confirmation sera demandée.</p>
            )}
        </div>
    );
}

/**
 * Formulaire des options.
 *
 * @param props - Options déclarées, valeurs, rappel de modification.
 * @returns Le formulaire, ou rien si le script n'a pas d'option.
 */
export default function ScriptOptionsForm({ options, values, onChange, disabled }: Props) {
    if (options.length === 0) return null;
    return (
        <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-mono text-xs tracking-wider text-mp-text-muted uppercase">Options</legend>
            {options.map((option) => (
                <OptionField
                    key={option.id}
                    option={option}
                    value={values[option.id]}
                    disabled={disabled}
                    onChange={(value) => {
                        const next = { ...values };
                        if (value === undefined) delete next[option.id];
                        else next[option.id] = value;
                        onChange(next);
                    }}
                />
            ))}
        </fieldset>
    );
}
