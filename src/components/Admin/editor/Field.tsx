/**
 * Champ de formulaire des éditeurs de contenu (blog, voyages) : libellé en petites capitales,
 * indice optionnel aligné à droite et contrôle passé en enfant.
 */
import type { ReactNode } from 'react';

interface FieldProps {
    label: string;
    hint?: string;
    children: ReactNode;
    className?: string;
}

/**
 * Enveloppe un contrôle de formulaire dans un `<label>` stylé.
 *
 * @param props.label - Libellé affiché au-dessus du contrôle.
 * @param props.hint - Indication secondaire affichée à droite du libellé.
 * @param props.children - Contrôle (input, select, textarea…).
 * @param props.className - Classes ajoutées au `<label>` (ex. `md:col-span-6`).
 * @returns Le champ rendu.
 */
export default function Field({ label, hint, children, className = '' }: FieldProps) {
    return (
        <label
            className={`flex flex-col gap-1 text-[11px] font-medium tracking-wider text-mp-text-muted uppercase ${className}`}
        >
            <span className="flex items-center justify-between">
                <span>{label}</span>
                {hint && <span className="font-mono tracking-normal text-mp-text-muted/70 normal-case">{hint}</span>}
            </span>
            {children}
        </label>
    );
}
