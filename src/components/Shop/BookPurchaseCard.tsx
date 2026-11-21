/**
 * @file src/components/Shop/BookPurchaseCard.tsx
 * @description Carte interactive de commande du livre d'art.
 * Gère le choix du mode de livraison (Mondial Relay / remise en main propre), la quantité,
 * la sélection du point relais, et la redirection vers Stripe Checkout.
 *
 * POURQUOI :
 * Offre un tunnel d'achat instantané et sans rechargement de page, avec vérification
 * immédiate que le point relais est bien renseigné avant de rediriger vers Stripe.
 */

import React, { useState } from 'react';
import {
    ShoppingBag,
    MapPin,
    CheckCircle2,
    AlertCircle,
    ShieldCheck,
    ChevronRight,
    Loader2,
    Package,
} from 'lucide-react';
import { SHOP_CONFIG, type ShippingCarrier } from '../../config/shop';
import { MondialRelayModal, type RelayPoint } from './MondialRelayModal';

interface BookPurchaseCardProps {
    brandId?: string;
}

export const BookPurchaseCard: React.FC<BookPurchaseCardProps> = ({ brandId = 'BDTEST13' }) => {
    const activeCarriers = SHOP_CONFIG.shippingCarriers.filter((c) => c.enabled);
    const [selectedCarrierId, setSelectedCarrierId] = useState<string>(activeCarriers[0]?.id ?? 'mondial_relay');
    const [quantity, setQuantity] = useState<number>(1);
    const [selectedRelay, setSelectedRelay] = useState<RelayPoint | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [hasPriorAgreement, setHasPriorAgreement] = useState<boolean>(false);

    const selectedCarrier = activeCarriers.find((c) => c.id === selectedCarrierId);
    const unitPrice = SHOP_CONFIG.book.price;
    const shippingPrice = selectedCarrier?.price ?? 0;
    const subtotal = unitPrice * quantity;
    const grandTotal = (subtotal + shippingPrice).toFixed(2);

    const handleCheckout = async () => {
        setErrorMessage(null);

        // Validation préalable du point relais
        if (selectedCarrier?.type === 'relay' && !selectedRelay) {
            setErrorMessage('Veuillez sélectionner un point relais Mondial Relay avant de poursuivre.');
            setIsModalOpen(true);
            return;
        }

        if (selectedCarrier?.requiresPriorAgreement && !hasPriorAgreement) {
            setErrorMessage("Veuillez confirmer avoir obtenu l'accord de l'auteur pour une remise en main propre.");
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/shop/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    carrierId: selectedCarrierId,
                    quantity,
                    relayPoint: selectedCarrier?.type === 'relay' ? selectedRelay : null,
                    priorAgreementConfirmed: hasPriorAgreement,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.url) {
                throw new Error(data.error || "Impossible d'initialiser la commande.");
            }

            // Redirection sécurisée vers Stripe Checkout
            window.location.href = data.url;
        } catch (err: any) {
            console.error('Erreur lors du checkout :', err);
            setErrorMessage(err.message || 'Une erreur est survenue lors de la redirection vers le paiement.');
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 rounded-2xl border border-mp-accent/30 bg-mp-bg/95 p-6 shadow-2xl backdrop-blur-md md:p-8">
            {/* Titre et Prix unitaire */}
            <div className="flex items-start justify-between border-b border-white/10 pb-5">
                <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-mp-accent/30 bg-mp-accent/15 px-3 py-1 text-[11px] font-semibold tracking-wider text-mp-accent uppercase">
                        <Package className="h-3.5 w-3.5" /> Tirage d'Art Limité
                    </span>
                    <h2 className="mt-2 font-serif text-2xl text-mp-text-heading">Commander votre exemplaire</h2>
                    <p className="mt-0.5 text-xs text-mp-text-muted">Expédié sous 48h dans son étui renforcé</p>
                </div>
                <div className="text-right">
                    <div className="font-serif text-3xl font-light text-mp-accent">{unitPrice.toFixed(2)} €</div>
                    <span className="text-[11px] tracking-wider text-mp-text-muted uppercase">TTC / exemplaire</span>
                </div>
            </div>

            {/* Sélecteur de Quantité */}
            <div className="flex items-center justify-between py-1 text-sm">
                <span className="font-medium text-mp-text-body">Nombre d'exemplaires</span>
                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 p-1">
                    <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        aria-label="Diminuer la quantité"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-mp-text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        -
                    </button>
                    <span className="w-6 text-center font-mono text-base font-semibold text-mp-text-heading">
                        {quantity}
                    </span>
                    <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                        disabled={quantity >= 10}
                        aria-label="Augmenter la quantité"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-mp-text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        +
                    </button>
                </div>
            </div>

            {/* Choix du mode de livraison */}
            <div className="space-y-3 pt-2">
                <span
                    id="book-shipping-mode-label"
                    className="block text-xs font-medium tracking-wider text-mp-text-muted uppercase"
                >
                    Mode de livraison
                </span>
                <div className="space-y-2.5" role="radiogroup" aria-labelledby="book-shipping-mode-label">
                    {activeCarriers.map((carrier: ShippingCarrier) => {
                        const isSelected = selectedCarrierId === carrier.id;
                        return (
                            <label
                                key={carrier.id}
                                className={`relative flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all duration-200 ${
                                    isSelected
                                        ? 'border-mp-accent bg-mp-accent/10 shadow-glow'
                                        : 'border-white/10 bg-white/5 hover:border-white/20'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="carrier"
                                    value={carrier.id}
                                    checked={isSelected}
                                    onChange={() => setSelectedCarrierId(carrier.id)}
                                    className="mt-1 accent-[#D4B483]"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-mp-text-heading">
                                            {carrier.name}
                                            {carrier.estimatedDays && (
                                                <span className="rounded-sm bg-white/10 px-2 py-0.5 text-[10px] font-normal text-mp-text-muted">
                                                    {carrier.estimatedDays}
                                                </span>
                                            )}
                                        </span>
                                        <span className="font-mono text-sm font-medium text-mp-accent">
                                            {carrier.price === 0 ? 'Gratuit' : `+${carrier.price.toFixed(2)} €`}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs leading-relaxed text-mp-text-muted">
                                        {carrier.description}
                                    </p>

                                    {/* Section spécifique Mondial Relay avec sélection du point */}
                                    {carrier.type === 'relay' && isSelected && (
                                        <div className="mt-3 border-t border-white/10 pt-3">
                                            {selectedRelay ? (
                                                <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/30 bg-black/40 p-3">
                                                    <div className="flex items-start gap-2.5">
                                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                                                        <div className="text-xs">
                                                            <p className="font-semibold text-mp-text-heading">
                                                                {selectedRelay.name}
                                                            </p>
                                                            <p className="text-mp-text-muted">
                                                                {selectedRelay.address}, {selectedRelay.zipCode}{' '}
                                                                {selectedRelay.city}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsModalOpen(true)}
                                                        className="shrink-0 text-[11px] text-mp-accent hover:underline"
                                                    >
                                                        Modifier
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsModalOpen(true)}
                                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-mp-accent/40 bg-mp-accent/20 px-4 py-2.5 text-xs font-semibold tracking-wider text-mp-accent uppercase shadow-xs transition-all hover:bg-mp-accent/30"
                                                >
                                                    <MapPin className="h-4 w-4" />
                                                    Choisir mon point relais
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </label>
                        );
                    })}
                </div>

                {/* POURQUOI hors du label du transporteur : deux labels imbriqués sont invalides en HTML. */}
                {selectedCarrier?.requiresPriorAgreement && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-mp-accent/30 bg-mp-accent/5 p-4 text-xs leading-relaxed text-mp-text-body">
                        <input
                            type="checkbox"
                            checked={hasPriorAgreement}
                            onChange={(event) => {
                                setHasPriorAgreement(event.target.checked);
                                setErrorMessage(null);
                            }}
                            className="mt-0.5 accent-[#D4B483]"
                        />
                        <span>J'ai obtenu l'accord de l'auteur pour une remise en main propre.</span>
                    </label>
                )}
            </div>

            {/* Message d'erreur éventuel */}
            {errorMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Récapitulatif Total & Bouton de Paiement */}
            <div className="space-y-4 border-t border-white/10 pt-3">
                <div className="space-y-1.5 text-xs text-mp-text-muted">
                    <div className="flex justify-between">
                        <span>
                            Sous-total ({quantity} {quantity > 1 ? 'livres' : 'livre'})
                        </span>
                        <span className="font-mono text-mp-text-body">{subtotal.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Frais d'expédition ({selectedCarrier?.name})</span>
                        <span className="font-mono text-mp-text-body">{shippingPrice.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between border-t border-white/5 pt-2 font-serif text-base text-mp-text-heading">
                        <span>Total TTC</span>
                        <span className="font-mono text-xl font-light text-mp-accent">{grandTotal} €</span>
                    </div>
                </div>

                {/* Bouton de validation vers Stripe */}
                <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={isLoading}
                    className="hover:shadow-glowStrong relative flex w-full items-center justify-center gap-3 rounded-full bg-mp-accent px-8 py-4 text-xs font-medium tracking-uppercase text-white uppercase shadow-glow transition-all hover:bg-mp-accent/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Redirection vers le paiement sécurisé...</span>
                        </>
                    ) : (
                        <>
                            <ShoppingBag className="h-4 w-4" />
                            <span>Commander · {grandTotal} €</span>
                            <ChevronRight className="h-4 w-4 opacity-75" />
                        </>
                    )}
                </button>

                {/* Rassurance & Moyens de paiement */}
                <div className="flex flex-col items-center justify-center gap-2 pt-1 text-[11px] text-mp-text-muted">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-mp-accent" />
                        <span>Paiement 100% sécurisé via Stripe</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-white/50">
                        <span>CB</span>
                        <span>•</span>
                        <span>Visa</span>
                        <span>•</span>
                        <span>Mastercard</span>
                        <span>•</span>
                        <span>Apple Pay</span>
                        <span>•</span>
                        <span>Google Pay</span>
                        <span>•</span>
                        <span>PayPal</span>
                    </div>
                </div>
            </div>

            {/* Modale de sélection Mondial Relay */}
            <MondialRelayModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSelectRelay={(relay) => {
                    setSelectedRelay(relay);
                    setErrorMessage(null);
                }}
                currentRelay={selectedRelay}
                brandId={brandId}
            />
        </div>
    );
};
