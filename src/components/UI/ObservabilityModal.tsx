import React, { useEffect, type ReactNode } from 'react';
import { Sparkles, X } from 'lucide-react';

interface ObservabilityModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
}

export function ObservabilityModal({
    isOpen,
    onClose,
    title = "Synthèse d'observabilité",
    children,
}: ObservabilityModalProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs duration-200"
            role="presentation"
            // POURQUOI : seul un clic sur le fond (hors de la fenêtre) ferme la modale ; Échap est géré par l'écouteur clavier ci-dessus.
            // Les clics dans la fenêtre ne doivent pas remonter aux parents (lignes cliquables), comme avant.
            onClick={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="animate-in zoom-in-95 space-y-5 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-mp-glass-border bg-mp-ui-black p-6 text-sm shadow-2xl duration-200"
                role="dialog"
                aria-modal="true"
            >
                {/* En-tête */}
                <div className="flex items-center justify-between border-b border-mp-glass-border pb-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-mp-accent" />
                        <h2 className="text-base font-semibold text-mp-text-heading">{title}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="cursor-pointer rounded-lg p-1.5 text-mp-text-muted transition-colors hover:bg-white/10 hover:text-mp-text-primary"
                        title="Fermer (Échap)"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Contenu de la modale */}
                <div className="space-y-4 text-mp-text-body">{children}</div>
            </div>
        </div>
    );
}
