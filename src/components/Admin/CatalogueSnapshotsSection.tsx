/**
 * Section « Catalogues du ciel profond » de `/admin/donnees`.
 *
 * Responsabilité : montrer quels catalogues sont servis par un instantané versionné et lancer leur
 * génération. Contrairement aux autres pipelines de la page, ces données sont des fichiers du dépôt,
 * pas des tables Turso : elles n'atteignent la production qu'après un commit.
 */

import type { CatalogueSnapshotStatus } from '@/lib/admin/catalogue-snapshots';

interface Props {
    status: CatalogueSnapshotStatus;
    /** Vrai pendant qu'un script tourne sur la page. */
    isDisabled: boolean;
    /** Lance la génération avec ces arguments. */
    onGenerate: (args: string[]) => void;
    formatBytes: (bytes: number) => string;
    formatDate: (date: string) => string;
}

export default function CatalogueSnapshotsSection({ status, isDisabled, onGenerate, formatBytes, formatDate }: Props) {
    const hasMissingCatalogues = status.missing.length > 0;

    return (
        <section className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="font-serif text-lg font-light text-mp-text-primary">Catalogues du ciel profond</h2>
                    <p className="max-w-2xl text-xs leading-relaxed text-mp-text-secondary">
                        Fichiers du dépôt, pas des tables Turso. Après une génération, committez{' '}
                        <code className="font-mono text-mp-accent">src/data/catalogues/</code> : la production ne les
                        utilise qu'une fois déployés.
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={isDisabled || !hasMissingCatalogues}
                        onClick={() => onGenerate(['--missing'])}
                        className="rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:opacity-50"
                    >
                        ▶ Générer les manquants
                    </button>
                    <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => onGenerate([])}
                        className="rounded-md border border-mp-glass-border px-4 py-2 text-xs font-semibold text-mp-text-primary hover:bg-mp-ui-black/20 disabled:opacity-50"
                    >
                        Tout régénérer
                    </button>
                </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 border-t border-mp-glass-border/40 pt-4 md:grid-cols-4">
                <div>
                    <dt className="font-mono text-[10px] text-mp-text-muted uppercase">Générés</dt>
                    <dd className="mt-1 font-serif text-2xl font-light text-mp-accent">
                        {status.generatedCount} / {status.totalCount}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono text-[10px] text-mp-text-muted uppercase">Entrées</dt>
                    <dd className="mt-1 font-serif text-2xl font-light text-mp-text-primary">
                        {status.entryCount.toLocaleString('fr-FR')}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono text-[10px] text-mp-text-muted uppercase">Poids</dt>
                    <dd className="mt-1 font-serif text-2xl font-light text-mp-text-primary">
                        {formatBytes(status.sizeBytes)}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono text-[10px] text-mp-text-muted uppercase">Dernière génération</dt>
                    <dd className="mt-1 text-xs text-mp-text-primary">
                        {status.lastGeneratedAt ? formatDate(status.lastGeneratedAt) : 'Jamais'}
                    </dd>
                </div>
            </dl>

            {hasMissingCatalogues ? (
                <div className="flex flex-col gap-2 border-t border-mp-glass-border/40 pt-4">
                    <p className="text-xs text-mp-text-secondary">
                        Encore servis en direct par les routes amont (CDS ou miroirs) :
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                        {status.missing.map((catalogue) => (
                            <li
                                key={catalogue.slug}
                                className="rounded-md border border-mp-glass-border/60 px-2 py-0.5 font-mono text-[10px] text-mp-text-secondary"
                            >
                                {catalogue.shortName}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className="border-t border-mp-glass-border/40 pt-4 text-xs text-mp-text-secondary">
                    Tous les catalogues sont servis par leur instantané : le site ne dépend plus du CDS ni de ses
                    miroirs pour ces listes.
                </p>
            )}
        </section>
    );
}
