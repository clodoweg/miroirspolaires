import { useEffect, useRef, useState } from 'react';
import {
    Calendar,
    Camera,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Crosshair,
    Loader2,
    MapPin,
    RotateCcw,
    Search,
    Settings,
    X,
} from 'lucide-react';
import type { ObsLocation } from '@/lib/objects/observation';
import { NO_AUTOFILL_PROPS } from '@/utils/constants';
import { arcsecPerPixel, effectiveFocalLengthMm, fovDegFor, type CameraSettings } from '@/lib/settings/userSettings';
import {
    findAccessory,
    findCamera,
    findTelescope,
    searchAccessories,
    searchCameras,
    searchTelescopes,
    type AccessoryModel,
    type CameraModel,
    type TelescopeModel,
} from '@/lib/equipment/catalog';
import EquipmentSearch from './EquipmentSearch';
import PillChip from '@/components/UI/PillChip';
import IconButton from '@/components/UI/IconButton';
import { formatDateLong, formatDateShort } from '@/lib/format';

type Tab = 'location' | 'camera' | 'date';

interface Props {
    location: ObsLocation;
    camera: CameraSettings;
    isLocationCustom: boolean;
    isCameraCustom: boolean;
    onLocationChange: (loc: ObsLocation) => void;
    onCameraChange: (partial: Partial<CameraSettings>) => void;
    onResetLocation: () => void;
    onResetCamera: () => void;
    date: Date;
    onDateChange: (d: Date) => void;
}

interface GeocodeHit {
    lat: number;
    lon: number;
    displayName: string;
}

function toInputDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
    const next = new Date(d);
    next.setDate(next.getDate() + n);
    return next;
}

function addMonths(d: Date, n: number): Date {
    const next = new Date(d);
    next.setMonth(next.getMonth() + n);
    return next;
}

export interface UserSettingsModalProps extends Props {
    isOpen: boolean;
    onClose: () => void;
}

export function UserSettingsModal({
    isOpen,
    onClose,
    location,
    camera,
    isLocationCustom,
    isCameraCustom,
    onLocationChange,
    onCameraChange,
    onResetLocation,
    onResetCamera,
    date,
    onDateChange,
}: UserSettingsModalProps) {
    const [tab, setTab] = useState<Tab>('location');

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
                className="animate-in zoom-in-95 space-y-5 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-mp-glass-border bg-mp-ui-black p-6 text-sm shadow-2xl duration-200"
                role="dialog"
                aria-modal="true"
            >
                {/* En-tête */}
                <div className="flex items-center justify-between border-b border-mp-glass-border pb-3">
                    <div className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-mp-accent" />
                        <h2 className="text-base font-semibold text-mp-text-heading">Paramètres d'observation</h2>
                        {(isLocationCustom || isCameraCustom) && (
                            <span className="rounded-full bg-mp-accent/20 px-2 py-0.5 text-xs font-medium text-mp-accent">
                                Personnalisés
                            </span>
                        )}
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

                {/* Navigation par Onglets */}
                <div className="flex gap-2 text-xs">
                    <PillChip active={tab === 'location'} onClick={() => setTab('location')}>
                        <MapPin className="h-3.5 w-3.5" /> Lieu
                        <span className="hidden sm:inline"> ({location.name})</span>
                    </PillChip>
                    <PillChip active={tab === 'camera'} onClick={() => setTab('camera')}>
                        <Camera className="h-3.5 w-3.5" /> Matériel
                        <span className="hidden sm:inline"> ({effectiveFocalLengthMm(camera).toFixed(0)} mm)</span>
                    </PillChip>
                    <PillChip active={tab === 'date'} onClick={() => setTab('date')}>
                        <Calendar className="h-3.5 w-3.5" /> Date
                        <span className="hidden sm:inline"> ({formatDateShort(date)})</span>
                    </PillChip>
                </div>

                {/* Contenu de l'onglet (Hauteur minimale fixe basée sur le menu Matériel) */}
                <div className="space-y-4 min-h-[420px] flex-1 overflow-y-auto pr-1">
                    {tab === 'location' && (
                        <LocationPanel
                            location={location}
                            isCustom={isLocationCustom}
                            onChange={onLocationChange}
                            onReset={onResetLocation}
                        />
                    )}

                    {tab === 'camera' && (
                        <CameraPanel
                            camera={camera}
                            isCustom={isCameraCustom}
                            onChange={onCameraChange}
                            onReset={onResetCamera}
                        />
                    )}

                    {tab === 'date' && <DatePanel date={date} onChange={onDateChange} />}
                </div>

                {/* Pied de modale */}
                <div className="flex items-center justify-between border-t border-mp-glass-border pt-3">
                    <p className="text-xs text-mp-text-muted">Stocké localement dans le navigateur. Pas de cookies.</p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="cursor-pointer rounded-lg bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black transition-colors hover:bg-mp-accent/90"
                    >
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function UserSettingsBar(props: Props) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-mp-glass-border bg-mp-glass-solid px-3 py-2 text-xs font-medium text-mp-text-body transition-all hover:border-mp-accent hover:text-mp-accent"
                title="Paramètres d'observation (Lieu, Matériel, Date)"
            >
                <Settings className="h-4 w-4 text-mp-accent" />
                <span>Paramètres</span>
                {(props.isLocationCustom || props.isCameraCustom) && (
                    <span className="h-2 w-2 rounded-full bg-mp-accent" />
                )}
            </button>
            <UserSettingsModal isOpen={open} onClose={() => setOpen(false)} {...props} />
        </>
    );
}

function LocationPanel({
    location,
    isCustom,
    onChange,
    onReset,
}: {
    location: ObsLocation;
    isCustom: boolean;
    onChange: (loc: ObsLocation) => void;
    onReset: () => void;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<GeocodeHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [geoLoading, setGeoLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const submitSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = query.trim();
        if (!q) return;
        setLoading(true);
        setError(null);
        setResults([]);
        try {
            const res = await fetch(`/api/object/geocode?q=${encodeURIComponent(q)}`);
            const payload: { results?: GeocodeHit[]; error?: string } = await res.json();
            if (!res.ok) {
                setError(payload.error ?? `Erreur ${res.status}`);
                return;
            }
            const hits = payload.results ?? [];
            if (!hits.length) setError('Aucun résultat. Affine la recherche.');
            else setResults(hits);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const useGeolocation = () => {
        if (!('geolocation' in navigator)) {
            setError('Géolocalisation indisponible dans ce navigateur.');
            return;
        }
        setGeoLoading(true);
        setError(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                onChange({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    name: 'Ma position',
                });
                setGeoLoading(false);
            },
            (err) => {
                setError(`Géolocalisation refusée : ${err.message}`);
                setGeoLoading(false);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
        );
    };

    const pick = (h: GeocodeHit) => {
        onChange({
            lat: h.lat,
            lon: h.lon,
            name: h.displayName.split(',').slice(0, 2).join(',').trim() || h.displayName,
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-mp-text-muted">
                <span>
                    Lieu actuel : <span className="text-mp-text-primary">{location.name}</span>{' '}
                    <span className="font-mono">
                        ({location.lat.toFixed(4)}°, {location.lon.toFixed(4)}°)
                    </span>
                </span>
                {isCustom && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex items-center gap-1 rounded-full border border-mp-glass-border px-2 py-1 text-mp-text-secondary transition-colors hover:border-mp-accent hover:text-mp-accent"
                        title="Restaurer Deep Sky Chile"
                    >
                        <RotateCcw className="h-3 w-3" /> Défaut
                    </button>
                )}
            </div>
            <form onSubmit={submitSearch} className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-mp-text-muted" />
                    <input
                        ref={inputRef}
                        type="text"
                        {...NO_AUTOFILL_PROPS}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Adresse, ville, observatoire…"
                        className="w-full rounded-md border border-mp-glass-border bg-mp-bg-secondary py-2 pr-3 pl-9 text-sm text-mp-text-primary placeholder:text-mp-text-muted focus:border-mp-accent focus:outline-hidden"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="flex items-center gap-1 rounded-md bg-mp-accent px-4 py-2 text-xs tracking-uppercase text-mp-ui-black uppercase transition-colors hover:bg-mp-accent/90 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Chercher'}
                </button>
                <button
                    type="button"
                    onClick={useGeolocation}
                    disabled={geoLoading}
                    title="Utiliser la position du navigateur"
                    className="flex items-center rounded-md border border-mp-glass-border px-3 py-2 text-mp-text-secondary transition-colors hover:border-mp-accent hover:text-mp-accent"
                >
                    {geoLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Crosshair className="h-3.5 w-3.5" />
                    )}
                </button>
            </form>

            {error && (
                <p className="flex items-center gap-1 text-xs text-mp-astro-red">
                    <X className="h-3 w-3" /> {error}
                </p>
            )}

            {results.length > 0 && (
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {results.map((r, i) => (
                        <li key={`${r.lat}-${r.lon}-${i}`}>
                            <button
                                type="button"
                                onClick={() => pick(r)}
                                className="w-full rounded-md px-3 py-2 text-left text-sm text-mp-text-body transition-colors hover:bg-mp-accent-light hover:text-mp-text-primary"
                            >
                                <span className="block truncate">{r.displayName}</span>
                                <span className="block font-mono text-xs text-mp-text-muted">
                                    {r.lat.toFixed(4)}°, {r.lon.toFixed(4)}°
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

const SENSOR_PRESETS: { label: string; w: number; h: number; px: number }[] = [
    { label: 'Plein format (36×24, 5.94 µm)', w: 36, h: 24, px: 5.94 },
    { label: 'APS-C (23.5×15.6, 3.76 µm)', w: 23.5, h: 15.6, px: 3.76 },
    { label: 'Micro 4/3 (17.3×13, 3.76 µm)', w: 17.3, h: 13, px: 3.76 },
    { label: 'ASI2600 (23.5×15.7, 3.76 µm)', w: 23.5, h: 15.7, px: 3.76 },
    { label: 'ASI533 (11.3×11.3, 3.76 µm)', w: 11.3, h: 11.3, px: 3.76 },
    { label: 'ASI071 (23.6×15.6, 4.78 µm)', w: 23.6, h: 15.6, px: 4.78 },
    { label: 'ASI294 (19.1×13, 4.63 µm)', w: 19.1, h: 13, px: 4.63 },
    { label: 'ASI6200 (36×24, 3.76 µm)', w: 36, h: 24, px: 3.76 },
];

function CameraPanel({
    camera,
    isCustom,
    onChange,
    onReset,
}: {
    camera: CameraSettings;
    isCustom: boolean;
    onChange: (partial: Partial<CameraSettings>) => void;
    onReset: () => void;
}) {
    /** Forward a partial update, but drop the linked equipment id whenever a
     *  manual edit makes the numbers diverge from the picked model. */
    const updateNumbers = (partial: Partial<CameraSettings>) => {
        const next: Partial<CameraSettings> = { ...partial };
        const merged = { ...camera, ...partial };

        const cam = findCamera(camera.cameraId);
        const cameraTouched =
            partial.sensorWidthMm !== undefined ||
            partial.sensorHeightMm !== undefined ||
            partial.pixelSizeUm !== undefined;
        if (
            cam &&
            cameraTouched &&
            (cam.sensorWidthMm !== merged.sensorWidthMm ||
                cam.sensorHeightMm !== merged.sensorHeightMm ||
                cam.pixelSizeUm !== merged.pixelSizeUm)
        ) {
            next.cameraId = undefined;
        }

        const tel = findTelescope(camera.telescopeId);
        if (tel && partial.focalLengthMm !== undefined && tel.focalLengthMm !== merged.focalLengthMm) {
            next.telescopeId = undefined;
        }

        const acc = findAccessory(camera.accessoryId);
        if (acc && partial.focalMultiplier !== undefined && acc.focalMultiplier !== merged.focalMultiplier) {
            next.accessoryId = undefined;
        }

        onChange(next);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-mp-text-muted">
                <span>Cadrage de la caméra</span>
                {isCustom && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex items-center gap-1 rounded-full border border-mp-glass-border px-2 py-1 text-mp-text-secondary transition-colors hover:border-mp-accent hover:text-mp-accent"
                        title="Restaurer APS-C"
                    >
                        <RotateCcw className="h-3 w-3" /> Défaut
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <EquipmentSearch<TelescopeModel>
                    label="Rechercher un télescope"
                    placeholder="Esprit 100ED, RedCat 71, EdgeHD 8…"
                    selected={findTelescope(camera.telescopeId) ?? null}
                    onSearch={(q) => searchTelescopes(q, 12)}
                    renderMeta={(t) => `${t.focalLengthMm} mm · f/${t.focalRatio.toFixed(1)}`}
                    getDisplayName={(t) => `${t.brand} ${t.name}`}
                    onPick={(t) => onChange({ focalLengthMm: t.focalLengthMm, telescopeId: t.id })}
                />
                <EquipmentSearch<CameraModel>
                    label="Rechercher une caméra"
                    placeholder="ASI2600, QHY268, Z6, EOS R…"
                    selected={findCamera(camera.cameraId) ?? null}
                    onSearch={(q) => searchCameras(q, 12)}
                    renderMeta={(c) => `${c.sensorWidthMm}×${c.sensorHeightMm} mm · ${c.pixelSizeUm} µm`}
                    getDisplayName={(c) => `${c.brand} ${c.name}`}
                    onPick={(c) =>
                        onChange({
                            sensorWidthMm: c.sensorWidthMm,
                            sensorHeightMm: c.sensorHeightMm,
                            pixelSizeUm: c.pixelSizeUm,
                            cameraId: c.id,
                        })
                    }
                />
                <EquipmentSearch<AccessoryModel>
                    label="Réducteur / Barlow"
                    placeholder="Réducteur 0.7x, Powermate 2x…"
                    selected={findAccessory(camera.accessoryId) ?? null}
                    onSearch={(q) => searchAccessories(q, 12)}
                    renderMeta={(a) => `${a.focalMultiplier}×`}
                    getDisplayName={(a) => `${a.brand} ${a.name}`}
                    onPick={(a) => onChange({ accessoryId: a.id, focalMultiplier: a.focalMultiplier })}
                />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <NumberField
                    label="Largeur (mm)"
                    hint={`≈ ${fovDegFor(camera.sensorWidthMm, effectiveFocalLengthMm(camera)).toFixed(2)}°`}
                    value={camera.sensorWidthMm}
                    min={1}
                    max={100}
                    step={0.1}
                    onChange={(v) => updateNumbers({ sensorWidthMm: v })}
                />
                <NumberField
                    label="Hauteur (mm)"
                    hint={`≈ ${fovDegFor(camera.sensorHeightMm, effectiveFocalLengthMm(camera)).toFixed(2)}°`}
                    value={camera.sensorHeightMm}
                    min={1}
                    max={100}
                    step={0.1}
                    onChange={(v) => updateNumbers({ sensorHeightMm: v })}
                />
                <NumberField
                    label="Pixel (µm)"
                    value={camera.pixelSizeUm}
                    min={0.5}
                    max={30}
                    step={0.01}
                    onChange={(v) => updateNumbers({ pixelSizeUm: v })}
                />
                <NumberField
                    label="Focale (mm)"
                    value={camera.focalLengthMm}
                    min={10}
                    max={10000}
                    step={1}
                    onChange={(v) => updateNumbers({ focalLengthMm: v })}
                />
                <NumberField
                    label="Multiplicateur"
                    hint={
                        camera.focalMultiplier !== 1 ? `→ ${effectiveFocalLengthMm(camera).toFixed(0)} mm` : undefined
                    }
                    value={camera.focalMultiplier}
                    min={0.1}
                    max={10}
                    step={0.01}
                    onChange={(v) => updateNumbers({ focalMultiplier: v })}
                />
                <NumberField
                    label="Rotation (°)"
                    value={camera.rotationDeg}
                    min={-180}
                    max={360}
                    step={1}
                    onChange={(v) => updateNumbers({ rotationDeg: v })}
                />
            </div>

            <p className="text-xs text-mp-text-muted">
                Focale effective :{' '}
                <span className="font-mono text-mp-text-body">{effectiveFocalLengthMm(camera).toFixed(0)} mm</span>
                {camera.focalMultiplier !== 1 && (
                    <>
                        {' '}
                        ({camera.focalLengthMm} mm × {camera.focalMultiplier}×)
                    </>
                )}{' '}
                — champ{' '}
                <span className="font-mono text-mp-text-body">
                    {fovDegFor(camera.sensorWidthMm, effectiveFocalLengthMm(camera)).toFixed(2)}° ×{' '}
                    {fovDegFor(camera.sensorHeightMm, effectiveFocalLengthMm(camera)).toFixed(2)}°
                </span>{' '}
                — échantillonnage{' '}
                <span className="font-mono text-mp-text-body">
                    {arcsecPerPixel(camera.pixelSizeUm, effectiveFocalLengthMm(camera)).toFixed(2)}″/px
                </span>
            </p>

            <div className="hidden flex-wrap gap-2 sm:flex">
                <span className="mr-1 self-center text-xs text-mp-text-muted">Préréglages :</span>
                {SENSOR_PRESETS.map((p) => {
                    const active =
                        p.w === camera.sensorWidthMm && p.h === camera.sensorHeightMm && p.px === camera.pixelSizeUm;
                    return (
                        <button
                            key={p.label}
                            type="button"
                            onClick={() =>
                                updateNumbers({
                                    sensorWidthMm: p.w,
                                    sensorHeightMm: p.h,
                                    pixelSizeUm: p.px,
                                })
                            }
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                active
                                    ? 'border-mp-accent bg-mp-accent/10 text-mp-accent'
                                    : 'border-mp-glass-border text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent'
                            }`}
                        >
                            {p.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function NumberField({
    label,
    hint,
    value,
    min,
    max,
    step,
    onChange,
}: {
    label: string;
    hint?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}) {
    return (
        <label className="space-y-1 block">
            <span className="flex items-baseline justify-between gap-2 text-xs tracking-wide text-mp-text-muted uppercase">
                <span>{label}</span>
                {hint && <span className="font-mono tracking-normal text-mp-accent normal-case">{hint}</span>}
            </span>
            <input
                type="number"
                {...NO_AUTOFILL_PROPS}
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChange(v);
                }}
                className="w-full rounded-md border border-mp-glass-border bg-mp-bg-secondary px-3 py-2 font-mono text-sm text-mp-text-primary focus:border-mp-accent focus:outline-hidden"
            />
        </label>
    );
}

function DatePanel({ date, onChange }: { date: Date; onChange: (d: Date) => void }) {
    const isToday = (() => {
        const now = new Date();
        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate()
        );
    })();
    return (
        <div className="space-y-3">
            <p className="text-xs text-mp-text-muted">Date d'observation</p>
            <div className="flex flex-wrap items-center gap-2">
                <IconButton onClick={() => onChange(addMonths(date, -1))} title="Mois précédent">
                    <ChevronsLeft className="h-4 w-4" />
                </IconButton>
                <IconButton onClick={() => onChange(addDays(date, -1))} title="Jour précédent">
                    <ChevronLeft className="h-4 w-4" />
                </IconButton>
                <input
                    type="date"
                    name="observation-date"
                    aria-label="Date d'observation"
                    {...NO_AUTOFILL_PROPS}
                    value={toInputDate(date)}
                    onChange={(e) => {
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        if (!y || !m || !d) return;
                        const next = new Date(date);
                        next.setFullYear(y, m - 1, d);
                        onChange(next);
                    }}
                    className="rounded-md border border-mp-glass-border bg-mp-bg-secondary px-3 py-2 font-mono text-sm text-mp-text-primary focus:border-mp-accent focus:outline-hidden"
                />
                <IconButton onClick={() => onChange(addDays(date, 1))} title="Jour suivant">
                    <ChevronRight className="h-4 w-4" />
                </IconButton>
                <IconButton onClick={() => onChange(addMonths(date, 1))} title="Mois suivant">
                    <ChevronsRight className="h-4 w-4" />
                </IconButton>
                <IconButton variant="text" onClick={() => onChange(new Date())} disabled={isToday} title="Aujourd'hui">
                    <span className="text-xs">Aujourd'hui</span>
                </IconButton>
            </div>
            <p className="text-sm text-mp-text-primary">{formatDateLong(date)}</p>
        </div>
    );
}
