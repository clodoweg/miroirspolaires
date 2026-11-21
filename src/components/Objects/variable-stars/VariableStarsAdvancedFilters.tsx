/**
 * @file VariableStarsAdvancedFilters.tsx
 * @description Contrôles du panneau de filtres avancés des étoiles variables.
 *
 * Responsabilité : rendre les listes (type, visibilité, faisabilité, constellation) et les
 * paires min-max (magnitude, amplitude, période, score) insérées dans `ObjectFilterBar`.
 * L'état reste dans `VariableStarsViewer` : ce composant ne fait que l'afficher et le modifier.
 */

import { useId, type InputHTMLAttributes } from 'react';
import CustomSelect from '@/components/UI/CustomSelect';
import { NO_AUTOFILL_PROPS } from '@/utils/constants';
import { FILTER_LABEL_CLASS, FILTER_INPUT_CLASS } from '@/components/Filters/constants';
import type { CompatibilityFilter, VariableStarType, VisibilityFilter } from '@/lib/objects/variable-stars';

interface RangeFieldProps {
    id: string;
    label: string;
    minValue: string;
    maxValue: string;
    onMinChange: (value: string) => void;
    onMaxChange: (value: string) => void;
    /** Attributs numériques communs aux deux champs (`step`, ou `min`/`max`). */
    inputProps: Pick<InputHTMLAttributes<HTMLInputElement>, 'step' | 'min' | 'max'>;
}

/** Paire de champs numériques « Min - Max » sous un libellé. */
function RangeField({ id, label, minValue, maxValue, onMinChange, onMaxChange, inputProps }: RangeFieldProps) {
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
                    {...inputProps}
                    placeholder="Min"
                    value={minValue}
                    onChange={(e) => onMinChange(e.target.value)}
                    className={FILTER_INPUT_CLASS}
                />
                <span className="text-mp-text-muted/30">-</span>
                <input
                    type="number"
                    {...NO_AUTOFILL_PROPS}
                    {...inputProps}
                    placeholder="Max"
                    value={maxValue}
                    onChange={(e) => onMaxChange(e.target.value)}
                    className={FILTER_INPUT_CLASS}
                />
            </div>
        </div>
    );
}

export interface VariableStarsAdvancedFiltersProps {
    filterType: 'all' | VariableStarType;
    onFilterTypeChange: (value: 'all' | VariableStarType) => void;
    visibilityFilter: VisibilityFilter;
    onVisibilityFilterChange: (value: VisibilityFilter) => void;
    compatibilityFilter: CompatibilityFilter;
    onCompatibilityFilterChange: (value: CompatibilityFilter) => void;
    constellationFilter: string;
    onConstellationFilterChange: (value: string) => void;
    constellationOptions: { value: string; label: string }[];
    minMag: string;
    maxMag: string;
    onMinMagChange: (value: string) => void;
    onMaxMagChange: (value: string) => void;
    minAmplitude: string;
    maxAmplitude: string;
    onMinAmplitudeChange: (value: string) => void;
    onMaxAmplitudeChange: (value: string) => void;
    minPeriod: string;
    maxPeriod: string;
    onMinPeriodChange: (value: string) => void;
    onMaxPeriodChange: (value: string) => void;
    minScore: string;
    maxScore: string;
    onMinScoreChange: (value: string) => void;
    onMaxScoreChange: (value: string) => void;
}

/**
 * Filtres avancés des étoiles variables (rendus en fragment, enfants directs de la grille de la barre).
 *
 * @param props - Valeurs courantes et setters de chaque filtre.
 * @returns Les contrôles de filtre.
 */
export default function VariableStarsAdvancedFilters(props: VariableStarsAdvancedFiltersProps) {
    // POURQUOI : identifiant stable pour associer chaque label de filtre à son premier champ (a11y).
    const filterId = useId();

    return (
        <>
            {/* 1. Type */}
            <CustomSelect
                label="Type"
                value={props.filterType}
                onChange={(val) => props.onFilterTypeChange(val as 'all' | VariableStarType)}
                options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'eclipsing', label: 'Éclipses' },
                    { value: 'cepheid', label: 'Céphéides' },
                    { value: 'mira', label: 'Mira' },
                    { value: 'cataclysmique', label: 'Cataclysmiques' },
                    { value: 'semiregular', label: 'Semi-régulières' },
                ]}
            />

            {/* 2. Visibilité */}
            <CustomSelect
                label="Visibilité"
                value={props.visibilityFilter}
                onChange={(val) => props.onVisibilityFilterChange(val as VisibilityFilter)}
                options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'parfaite', label: 'Parfaite (>60°)' },
                    { value: 'observable', label: 'Observable (>30°)' },
                    { value: 'basse', label: 'Très basse (<30°)' },
                    { value: 'invisible', label: 'Invisible' },
                ]}
            />

            {/* 3. Faisabilité */}
            <CustomSelect
                label="Faisabilité"
                value={props.compatibilityFilter}
                onChange={(val) => props.onCompatibilityFilterChange(val as CompatibilityFilter)}
                options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'gerable', label: 'Gérable' },
                    { value: 'delicat', label: 'Délicat' },
                    { value: 'inobservable', label: 'Inobservable' },
                    { value: 'hors_portee', label: 'Setup insuffisant' },
                ]}
            />

            {/* 4. Constellation */}
            <CustomSelect
                label="Constellation"
                value={props.constellationFilter}
                onChange={(val) => props.onConstellationFilterChange(val)}
                options={props.constellationOptions}
            />

            <RangeField
                id={`${filterId}-1`}
                label="Magnitude Étoile (V min-max)"
                minValue={props.minMag}
                maxValue={props.maxMag}
                onMinChange={props.onMinMagChange}
                onMaxChange={props.onMaxMagChange}
                inputProps={{ step: '0.5' }}
            />

            <RangeField
                id={`${filterId}-2`}
                label="Amplitude (mag min-max)"
                minValue={props.minAmplitude}
                maxValue={props.maxAmplitude}
                onMinChange={props.onMinAmplitudeChange}
                onMaxChange={props.onMaxAmplitudeChange}
                inputProps={{ step: '0.1' }}
            />

            <RangeField
                id={`${filterId}-3`}
                label="Période (jours min-max)"
                minValue={props.minPeriod}
                maxValue={props.maxPeriod}
                onMinChange={props.onMinPeriodChange}
                onMaxChange={props.onMaxPeriodChange}
                inputProps={{ step: '0.1' }}
            />

            <RangeField
                id={`${filterId}-4`}
                label="Score (0-100 min-max)"
                minValue={props.minScore}
                maxValue={props.maxScore}
                onMinChange={props.onMinScoreChange}
                onMaxChange={props.onMaxScoreChange}
                inputProps={{ min: '0', max: '100' }}
            />
        </>
    );
}
