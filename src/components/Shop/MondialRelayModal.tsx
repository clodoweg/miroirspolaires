/**
 * @file src/components/Shop/MondialRelayModal.tsx
 * @description Modale de sélection interactive d'un point relais Mondial Relay.
 * Intègre le widget officiel Mondial Relay avec un mode de secours manuel élégant
 * en cas de blocage réseau ou ad-blocker.
 *
 * POURQUOI :
 * Permet au client de choisir précisément son commerce partenaire sans quitter la boutique,
 * tout en garantissant un parcours fluide même si les scripts tiers sont ralentis.
 */

import React, { useEffect, useRef, useState } from 'react';
import { MapPin, X, AlertCircle } from 'lucide-react';

export interface RelayPoint {
    id: string;
    name: string;
    address: string;
    zipCode: string;
    city: string;
    country: string;
}

interface MondialRelayModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectRelay: (relay: RelayPoint) => void;
    currentRelay?: RelayPoint | null;
    brandId?: string;
}

export const MondialRelayModal: React.FC<MondialRelayModalProps> = ({
    isOpen,
    onClose,
    onSelectRelay,
    currentRelay,
    brandId = 'BDTEST13',
}) => {
    const [postalCode] = useState('');
    const [isWidgetLoaded, setIsWidgetLoaded] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [manualName, setManualName] = useState('');
    const [manualAddress, setManualAddress] = useState('');
    const [manualZip, setManualZip] = useState('');
    const [manualCity, setManualCity] = useState('');
    const widgetContainerRef = useRef<HTMLDivElement>(null);

    // Empêcher le défilement de l'arrière-plan lorsque la modale est ouverte
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Chargement asynchrone du widget officiel Mondial Relay
    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;

        const loadScripts = async () => {
            try {
                // Charger jQuery si absent
                if (!(window as any).jQuery) {
                    await new Promise<void>((resolve, reject) => {
                        const jq = document.createElement('script');
                        jq.src = 'https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js';
                        jq.async = true;
                        jq.onload = () => resolve();
                        jq.onerror = () => reject(new Error('Erreur de chargement jQuery'));
                        document.head.appendChild(jq);
                    });
                }

                // Charger le plugin Mondial Relay ParcelShop Picker
                if (!(window as any).$?.fn?.MR_ParcelShopPicker) {
                    await new Promise<void>((resolve, reject) => {
                        const mr = document.createElement('script');
                        mr.src =
                            'https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js';
                        mr.async = true;
                        mr.onload = () => resolve();
                        mr.onerror = () => reject(new Error('Erreur de chargement Mondial Relay Widget'));
                        document.head.appendChild(mr);
                    });
                }

                if (isMounted) {
                    setIsWidgetLoaded(true);
                }
            } catch (err) {
                if (isMounted) {
                    console.warn(
                        "Le widget officiel Mondial Relay n'a pas pu être chargé (bloqueur de pub ou réseau) :",
                        err,
                    );
                    setLoadError(true);
                }
            }
        };

        loadScripts();

        return () => {
            isMounted = false;
        };
    }, [isOpen]);

    // Initialisation du widget dans le conteneur DOM dès qu'il est prêt
    useEffect(() => {
        if (!isWidgetLoaded || !isOpen || !widgetContainerRef.current) return;

        const $ = (window as any).jQuery;
        if (!$ || !$.fn.MR_ParcelShopPicker) return;

        const container = $(widgetContainerRef.current);

        try {
            container.MR_ParcelShopPicker({
                Target: '#Zone_Widget',
                Brand: brandId,
                Country: 'FR',
                PostCode: postalCode || (currentRelay?.zipCode ?? '75001'),
                ColLivMod: '24R',
                NbResults: '7',
                ShowResultsOnMap: true,
                DisplayMapInfo: true,
                OnParcelShopSelected: (data: any) => {
                    const selected: RelayPoint = {
                        id: data.ID || data.Num,
                        name: data.Nom,
                        address: data.Adresse1 || data.Adresse,
                        zipCode: data.CP,
                        city: data.Ville,
                        country: data.Pays || 'FR',
                    };
                    onSelectRelay(selected);
                    onClose();
                },
            });
        } catch (e) {
            console.error('Erreur initialisation widget Mondial Relay :', e);
            setLoadError(true);
        }
    }, [isWidgetLoaded, isOpen, brandId]);

    if (!isOpen) return null;

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualName.trim() || !manualAddress.trim() || !manualZip.trim() || !manualCity.trim()) {
            return;
        }
        onSelectRelay({
            id: `MANUAL-${manualZip.trim()}`,
            name: manualName.trim(),
            address: manualAddress.trim(),
            zipCode: manualZip.trim(),
            city: manualCity.trim().toUpperCase(),
            country: 'FR',
        });
        onClose();
    };

    return (
        <div
            className="animate-fade-in fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-mr-title"
        >
            <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-mp-accent/30 bg-mp-bg shadow-2xl">
                {/* En-tête de la modale */}
                <div className="flex items-center justify-between border-b border-white/10 bg-mp-ui-black/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-mp-accent/30 bg-mp-accent/10 text-mp-accent">
                            <MapPin className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 id="modal-mr-title" className="font-serif text-lg text-mp-text-heading">
                                Choisir votre point relais Mondial Relay
                            </h2>
                            <p className="text-xs text-mp-text-muted">
                                Votre livre sera livré dans le commerce de votre choix
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-2 text-mp-text-muted transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Fermer la fenêtre"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Corps de la modale */}
                <div className="space-y-4 flex-1 overflow-y-auto p-6">
                    {/* Si le widget a rencontré une erreur ou est bloqué par un bloqueur de pub */}
                    {loadError ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                                <div>
                                    <p className="mb-1 font-semibold">Carte interactive indisponible</p>
                                    <p>
                                        Le service de carte Mondial Relay n'a pas pu être chargé (bloqueur de traceurs
                                        ou problème de connexion). Vous pouvez saisir directement l'adresse ou le nom de
                                        votre commerce / point relais habituel ci-dessous.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleManualSubmit} className="space-y-3 pt-2">
                                <div>
                                    <label
                                        htmlFor="mondial-relay-manual-name"
                                        className="mb-1 block text-xs tracking-wider text-mp-text-muted uppercase"
                                    >
                                        Nom du commerce ou point relais *
                                    </label>
                                    <input
                                        id="mondial-relay-manual-name"
                                        type="text"
                                        required
                                        placeholder="Ex: Tabac Presse des Étoiles"
                                        value={manualName}
                                        onChange={(e) => setManualName(e.target.value)}
                                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-mp-text-heading focus:border-mp-accent focus:outline-hidden"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor="mondial-relay-manual-address"
                                        className="mb-1 block text-xs tracking-wider text-mp-text-muted uppercase"
                                    >
                                        Adresse postale *
                                    </label>
                                    <input
                                        id="mondial-relay-manual-address"
                                        type="text"
                                        required
                                        placeholder="Ex: 14 rue de la République"
                                        value={manualAddress}
                                        onChange={(e) => setManualAddress(e.target.value)}
                                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-mp-text-heading focus:border-mp-accent focus:outline-hidden"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label
                                            htmlFor="mondial-relay-manual-zip"
                                            className="mb-1 block text-xs tracking-wider text-mp-text-muted uppercase"
                                        >
                                            Code postal *
                                        </label>
                                        <input
                                            id="mondial-relay-manual-zip"
                                            type="text"
                                            required
                                            placeholder="Ex: 75001"
                                            value={manualZip}
                                            onChange={(e) => setManualZip(e.target.value)}
                                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-mp-text-heading focus:border-mp-accent focus:outline-hidden"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="mondial-relay-manual-city"
                                            className="mb-1 block text-xs tracking-wider text-mp-text-muted uppercase"
                                        >
                                            Ville *
                                        </label>
                                        <input
                                            id="mondial-relay-manual-city"
                                            type="text"
                                            required
                                            placeholder="Ex: Paris"
                                            value={manualCity}
                                            onChange={(e) => setManualCity(e.target.value)}
                                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-mp-text-heading focus:border-mp-accent focus:outline-hidden"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="rounded-full border border-white/20 px-5 py-2.5 text-xs tracking-wider text-mp-text-muted uppercase hover:text-white"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        type="submit"
                                        className="rounded-full bg-mp-accent px-6 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-glow hover:bg-mp-accent/90"
                                    >
                                        Valider ce point relais
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div>
                            {/* Conteneur cible pour le widget officiel Mondial Relay */}
                            <div id="Zone_Widget" ref={widgetContainerRef} className="min-h-[400px] w-full text-black">
                                {!isWidgetLoaded && (
                                    <div className="space-y-3 flex flex-col items-center justify-center py-20 text-mp-text-muted">
                                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-mp-accent border-t-transparent" />
                                        <p className="text-xs">Chargement de la carte des points relais...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Pied de modale informatif */}
                <div className="flex items-center justify-between border-t border-white/10 bg-mp-ui-black/60 px-6 py-3 text-xs text-mp-text-muted">
                    <span>Réseau officiel Mondial Relay France</span>
                    <button
                        type="button"
                        onClick={() => setLoadError(!loadError)}
                        className="text-[11px] text-mp-accent hover:underline"
                    >
                        {loadError ? 'Réessayer la carte' : 'Saisir manuellement'}
                    </button>
                </div>
            </div>
        </div>
    );
};
