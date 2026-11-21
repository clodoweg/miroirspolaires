/**
 * Panneau latéral « Réglages de l'article » (métadonnées), ouvert depuis l'éditeur, à la manière de Ghost.
 *
 * POURQUOI : le texte reste au centre de l'écran ; titre, slug, catégories, couverture et SEO
 * s'éditent dans un tiroir à droite au lieu d'un onglet qui masque l'article.
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface SettingsDrawerProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    /** Message affiché en tête quand des champs obligatoires manquent. */
    warning?: string | null;
    children: ReactNode;
}

export default function SettingsDrawer({
    open,
    onClose,
    title = "Réglages de l'article",
    warning,
    children,
}: SettingsDrawerProps) {
    // POURQUOI : le tiroir démarre sous la barre de navigation du site (z-navbar = 9999), qui le recouvrirait.
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        panelRef.current?.focus();
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    return (
        <>
            <div
                aria-hidden
                onClick={onClose}
                className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity duration-base ${
                    open ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                aria-hidden={!open}
                inert={!open}
                tabIndex={-1}
                className={`fixed top-navbar right-0 bottom-0 z-50 flex w-full max-w-xl flex-col border-l border-mp-glass-border bg-mp-bg shadow-2xl outline-hidden transition-transform duration-base ${
                    open ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <div className="flex items-center justify-between border-b border-mp-glass-border px-5 py-4">
                    <h2 className="m-0 text-lg">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-touch-icon w-touch-icon items-center justify-center rounded-md text-xl text-mp-text-muted hover:bg-mp-glass-hover hover:text-mp-text-primary"
                        aria-label="Fermer les réglages"
                    >
                        ×
                    </button>
                </div>
                {warning && (
                    <p className="m-0 border-b border-mp-glass-border bg-mp-accent/10 px-5 py-2 text-xs text-mp-accent">
                        {warning}
                    </p>
                )}
                <div className="flex-1 overflow-y-auto p-5">{children}</div>
            </div>
        </>
    );
}
