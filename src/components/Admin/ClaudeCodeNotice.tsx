/**
 * Rappel des textes à écrire dans Claude Code
 *
 * Responsabilité : indiquer dans l'admin que les descriptions SEO et les alts manquants ne sont pas générés
 * par les boutons, et donner la commande à lancer.
 */

import { Terminal } from 'lucide-react';

interface Props {
    /** Ce qui manque, ou ce que la page rappelle. */
    message: string;
    /** Commandes à lancer dans Claude Code. */
    commands: string[];
}

/**
 * Bandeau de rappel.
 *
 * @param props.message - Ce qui manque.
 * @param props.commands - Commandes à lancer.
 * @returns Le bandeau.
 */
export default function ClaudeCodeNotice({ message, commands }: Props) {
    return (
        <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-mp-accent/30 bg-mp-accent/5 p-4 text-sm text-mp-text-body"
        >
            <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-mp-accent" aria-hidden="true" />
            <div>
                <p className="font-semibold text-mp-text-heading">{message}</p>
                <p className="mt-1 text-xs text-mp-text-muted">
                    Les boutons ne génèrent pas ces textes : ils s’écrivent via Claude Code, avec{' '}
                    {commands.map((command, index) => (
                        <span key={command}>
                            {index > 0 && ' et '}
                            <code className="font-mono text-mp-accent">{command}</code>
                        </span>
                    ))}
                    .
                </p>
            </div>
        </div>
    );
}
