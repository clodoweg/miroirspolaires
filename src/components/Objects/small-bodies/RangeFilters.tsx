/**
 * Filtres numériques « min - max » de la barre de filtres avancés des petits corps
 *
 * Responsabilité : décrire les plages filtrables (libellé, pas de saisie, puces actives)
 * et afficher la paire de champs correspondante. Les valeurs sont gardées en texte brut,
 * telles que saisies, et interprétées par `filterByRange`.
 */

import { NO_AUTOFILL_PROPS } from '@/utils/constants';
import { FILTER_LABEL_CLASS, FILTER_INPUT_CLASS } from '@/components/Filters/constants';
import type { ActiveFilterChip } from '@/components/Filters/ObjectFilterBar';

/** Champ de plage affiché dans la barre de filtres. */
export interface RangeFilterField<Key extends string> {
    label: string;
    minKey: Key;
    maxKey: Key;
    step?: string;
    min?: string;
    max?: string;
}

/** Puce de filtre actif associée à une borne. */
export interface RangeFilterChip<Key extends string> {
    key: Key;
    label: string;
    /** Suffixe accolé à la valeur saisie (ex. « ° », « UA » précédé d'une espace). */
    suffix: string;
}

/**
 * Puces des bornes renseignées, dans l'ordre des descripteurs.
 *
 * @param values - Valeurs saisies, par clé.
 * @param chips - Descripteurs des puces.
 * @returns Les puces à afficher.
 */
export function buildRangeChips<Key extends string>(
    values: Record<Key, string>,
    chips: readonly RangeFilterChip<Key>[],
): ActiveFilterChip[] {
    return chips
        .filter((chip) => values[chip.key])
        .map((chip) => ({ key: chip.key, label: chip.label, value: `${values[chip.key]}${chip.suffix}` }));
}

/**
 * Valeurs vides pour toutes les bornes.
 *
 * @param fields - Champs de plage.
 * @returns Un objet clé → chaîne vide.
 */
export function emptyRangeValues<Key extends string>(fields: readonly RangeFilterField<Key>[]): Record<Key, string> {
    const values = {} as Record<Key, string>;
    for (const field of fields) {
        values[field.minKey] = '';
        values[field.maxKey] = '';
    }
    return values;
}

interface RangeFilterInputProps {
    /** Identifiant du premier champ, relié au libellé. */
    id: string;
    label: string;
    minValue: string;
    maxValue: string;
    onMinChange: (value: string) => void;
    onMaxChange: (value: string) => void;
    step?: string;
    min?: string;
    max?: string;
}

/**
 * Paire de champs numériques « Min - Max » avec son libellé.
 *
 * @param props - Libellé, valeurs, callbacks et contraintes de saisie.
 * @returns Le bloc de filtre.
 */
export function RangeFilterInput({
    id,
    label,
    minValue,
    maxValue,
    onMinChange,
    onMaxChange,
    step,
    min,
    max,
}: RangeFilterInputProps) {
    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className={FILTER_LABEL_CLASS}>
                {label}
            </label>
            <div className="flex items-center gap-2">
                <input
                    id={id}
                    type="number"
                    {...NO_AUTOFILL_PROPS}
                    step={step}
                    min={min}
                    max={max}
                    placeholder="Min"
                    value={minValue}
                    onChange={(e) => onMinChange(e.target.value)}
                    className={FILTER_INPUT_CLASS}
                />
                <span className="text-mp-text-muted/30">-</span>
                <input
                    type="number"
                    {...NO_AUTOFILL_PROPS}
                    step={step}
                    min={min}
                    max={max}
                    placeholder="Max"
                    value={maxValue}
                    onChange={(e) => onMaxChange(e.target.value)}
                    className={FILTER_INPUT_CLASS}
                />
            </div>
        </div>
    );
}

interface RangeFilterListProps<Key extends string> {
    /** Préfixe des identifiants (`useId`) ; les champs sont numérotés à partir de 1. */
    idPrefix: string;
    fields: readonly RangeFilterField<Key>[];
    values: Record<Key, string>;
    onChange: (key: Key, value: string) => void;
}

/**
 * Liste des filtres de plage, dans l'ordre des descripteurs.
 *
 * @param props - Préfixe d'identifiant, champs, valeurs et callback de modification.
 * @returns Les blocs de filtre.
 */
export function RangeFilterList<Key extends string>({ idPrefix, fields, values, onChange }: RangeFilterListProps<Key>) {
    return (
        <>
            {fields.map((field, index) => (
                <RangeFilterInput
                    key={field.minKey}
                    id={`${idPrefix}-${index + 1}`}
                    label={field.label}
                    minValue={values[field.minKey]}
                    maxValue={values[field.maxKey]}
                    onMinChange={(value) => onChange(field.minKey, value)}
                    onMaxChange={(value) => onChange(field.maxKey, value)}
                    step={field.step}
                    min={field.min}
                    max={field.max}
                />
            ))}
        </>
    );
}
