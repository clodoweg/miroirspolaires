/**
 * Champs de filtres avancés du planificateur de transits d'exoplanètes
 *
 * Responsabilité : rendre les listes (type, visibilité, faisabilité, constellation) et les bornes
 * numériques (magnitude, profondeur, score) placées dans `ObjectFilterBar`. L'état vit dans
 * `ExoplanetViewer` ; ce composant ne fait que le lire et le modifier champ par champ.
 */

import { useId } from 'react';
import { NO_AUTOFILL_PROPS } from '@/utils/constants';
import { FILTER_LABEL_CLASS, FILTER_INPUT_CLASS } from '@/components/Filters/constants';
import CustomSelect from '@/components/UI/CustomSelect';
import type {
    ExoplanetCategory,
    ExoplanetFilterCriteria,
    FeasibilityFilter,
    TransitFilter,
} from '@/lib/objects/exoplanets';

type RangeKey = 'minMag' | 'maxMag' | 'minDepth' | 'maxDepth' | 'minScore' | 'maxScore';

interface ExoplanetFilterFieldsProps {
    filters: ExoplanetFilterCriteria;
    onChange: <Key extends keyof ExoplanetFilterCriteria>(key: Key, value: ExoplanetFilterCriteria[Key]) => void;
    constellationOptions: { value: string; label: string }[];
}

interface RangeFieldProps {
    inputId: string;
    label: string;
    minKey: RangeKey;
    maxKey: RangeKey;
    /** Attributs numériques communs aux deux champs (`step`, ou `min`/`max`). */
    numberProps: { step?: string; min?: string; max?: string };
    filters: ExoplanetFilterCriteria;
    onChange: ExoplanetFilterFieldsProps['onChange'];
}

/**
 * Paire de champs numériques min–max sous un libellé.
 *
 * @param props - Identifiant du premier champ, libellé, clés de filtre et attributs numériques.
 * @returns Le bloc libellé + deux champs.
 */
function RangeField({ inputId, label, minKey, maxKey, numberProps, filters, onChange }: RangeFieldProps) {
    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className={FILTER_LABEL_CLASS}>
                {label}
            </label>
            <div className="flex items-center gap-2">
                <input
                    id={inputId}
                    type="number"
                    {...NO_AUTOFILL_PROPS}
                    {...numberProps}
                    placeholder="Min"
                    value={filters[minKey]}
                    onChange={(e) => onChange(minKey, e.target.value)}
                    className={FILTER_INPUT_CLASS}
                />
                <span className="text-mp-text-muted/30">-</span>
                <input
                    type="number"
                    {...NO_AUTOFILL_PROPS}
                    {...numberProps}
                    placeholder="Max"
                    value={filters[maxKey]}
                    onChange={(e) => onChange(maxKey, e.target.value)}
                    className={FILTER_INPUT_CLASS}
                />
            </div>
        </div>
    );
}

/**
 * Champs de filtres avancés des exoplanètes.
 *
 * @param props - Filtres courants, setter par champ et options de constellation.
 * @returns Les champs, à placer comme enfants d'`ObjectFilterBar`.
 */
export default function ExoplanetFilterFields({ filters, onChange, constellationOptions }: ExoplanetFilterFieldsProps) {
    // POURQUOI : identifiant stable pour associer chaque label de filtre à son premier champ (a11y).
    const filterId = useId();

    return (
        <>
            {/* 1. Type */}
            <CustomSelect
                label="Type"
                value={filters.exoplanetCategory}
                onChange={(val) => onChange('exoplanetCategory', val as ExoplanetCategory)}
                options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'confirmed', label: 'Confirmées' },
                    { value: 'candidates', label: 'Candidates TESS' },
                ]}
            />

            {/* 2. Visibilité */}
            <CustomSelect
                label="Visibilité"
                value={filters.transitFilter}
                onChange={(val) => onChange('transitFilter', val as TransitFilter)}
                options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'oui', label: 'Oui (optimal)' },
                    { value: 'partiel', label: 'Partiel' },
                    { value: 'horizon', label: 'Horizon (bas)' },
                    { value: 'jour', label: 'Jour / Crépuscule' },
                ]}
            />

            {/* 3. Faisabilité */}
            <CustomSelect
                label="Faisabilité"
                value={filters.difficultyFilter}
                onChange={(val) => onChange('difficultyFilter', val as FeasibilityFilter)}
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
                value={filters.constellationFilter}
                onChange={(val) => onChange('constellationFilter', val)}
                options={constellationOptions}
            />

            <RangeField
                inputId={`${filterId}-1`}
                label="Magnitude Étoile (V min-max)"
                minKey="minMag"
                maxKey="maxMag"
                numberProps={{ step: '0.5' }}
                filters={filters}
                onChange={onChange}
            />

            <RangeField
                inputId={`${filterId}-2`}
                label="Profondeur (% min-max)"
                minKey="minDepth"
                maxKey="maxDepth"
                numberProps={{ step: '0.1' }}
                filters={filters}
                onChange={onChange}
            />

            <RangeField
                inputId={`${filterId}-3`}
                label="Score (0-100 min-max)"
                minKey="minScore"
                maxKey="maxScore"
                numberProps={{ min: '0', max: '100' }}
                filters={filters}
                onChange={onChange}
            />
        </>
    );
}
