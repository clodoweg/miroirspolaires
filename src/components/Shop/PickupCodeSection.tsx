/**
 * @file src/components/Shop/PickupCodeSection.tsx
 * @description Bloc « Remise en main propre » de la carte de commande : saisie du code envoyé par l'auteur,
 * ou formulaire de demande (`POST /api/shop/pickup-request`) pour l'obtenir.
 *
 * POURQUOI : la remise en main propre est gratuite et suppose un rendez-vous ; l'auteur l'accepte au cas
 * par cas depuis `/admin/boutique`, puis l'acheteur reçoit un code que `create-checkout-session` vérifie.
 */

import React, { useState } from 'react';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';

interface PickupCodeSectionProps {
    code: string;
    onCodeChange: (code: string) => void;
}

const INPUT_CLASSES =
    'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-mp-text-heading placeholder:text-mp-text-muted focus:border-mp-accent focus:outline-none';

export const PickupCodeSection: React.FC<PickupCodeSectionProps> = ({ code, onCodeChange }) => {
    const [isRequestOpen, setIsRequestOpen] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', place: '', message: '', website: '' });
    const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<string | null>(null);

    const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((current) => ({ ...current, [field]: event.target.value }));

    const submitRequest = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setStatus('sending');
        try {
            const response = await fetch('/api/shop/pickup-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(data.error || 'La demande n’a pas pu être envoyée.');
            setStatus('sent');
        } catch (err) {
            setError((err as Error).message);
            setStatus('idle');
        }
    };

    return (
        <div className="space-y-3 rounded-xl border border-mp-accent/30 bg-mp-accent/5 p-4 text-xs leading-relaxed text-mp-text-body">
            <label className="space-y-1.5 block">
                <span className="font-medium text-mp-text-heading">Code de remise en main propre</span>
                <input
                    type="text"
                    value={code}
                    onChange={(event) => onCodeChange(event.target.value)}
                    placeholder="MP-XXXX-XXXX"
                    autoComplete="off"
                    spellCheck={false}
                    className={`${INPUT_CLASSES} font-mono tracking-wider uppercase`}
                />
            </label>

            {status === 'sent' ? (
                <p className="flex items-start gap-2 text-mp-text-body">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                        Demande envoyée. Si l’auteur l’accepte, vous recevrez votre code par e-mail à{' '}
                        <strong>{form.email}</strong>.
                    </span>
                </p>
            ) : !isRequestOpen ? (
                <button
                    type="button"
                    onClick={() => setIsRequestOpen(true)}
                    className="inline-flex min-h-touch items-center gap-2 text-mp-accent hover:underline"
                >
                    <Mail className="h-4 w-4" />
                    Pas encore de code ? Demander une remise en main propre
                </button>
            ) : (
                <form onSubmit={submitRequest} className="space-y-2.5 border-t border-white/10 pt-3">
                    <p className="text-mp-text-muted">
                        Indiquez où vous souhaitez récupérer le livre. Si c’est possible, vous recevrez un code par
                        e-mail.
                    </p>
                    <input
                        required
                        value={form.name}
                        onChange={update('name')}
                        placeholder="Votre nom"
                        aria-label="Votre nom"
                        autoComplete="name"
                        maxLength={100}
                        className={INPUT_CLASSES}
                    />
                    <input
                        required
                        type="email"
                        value={form.email}
                        onChange={update('email')}
                        placeholder="Votre e-mail"
                        aria-label="Votre e-mail"
                        autoComplete="email"
                        maxLength={254}
                        className={INPUT_CLASSES}
                    />
                    <input
                        required
                        value={form.place}
                        onChange={update('place')}
                        placeholder="Ville ou lieu souhaité"
                        aria-label="Ville ou lieu souhaité"
                        maxLength={150}
                        className={INPUT_CLASSES}
                    />
                    <textarea
                        value={form.message}
                        onChange={update('message')}
                        placeholder="Message (facultatif)"
                        aria-label="Message"
                        rows={3}
                        maxLength={1000}
                        className={INPUT_CLASSES}
                    />
                    {/* POURQUOI : champ piège, invisible et hors tabulation ; seul un robot le remplit. */}
                    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={update('website')} />
                    </div>
                    {error && <p className="text-rose-300">{error}</p>}
                    <button
                        type="submit"
                        disabled={status === 'sending'}
                        className="inline-flex min-h-touch items-center gap-2 rounded-lg border border-mp-accent/40 bg-mp-accent/20 px-4 font-semibold tracking-wider text-mp-accent uppercase hover:bg-mp-accent/30 disabled:opacity-50"
                    >
                        {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
                        Envoyer la demande
                    </button>
                </form>
            )}
        </div>
    );
};
