import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Search,
    Filter,
    Plus,
    Calendar,
    Globe,
    Compass,
    Image,
    Edit,
    AlertCircle,
    LayoutGrid,
    List,
} from 'lucide-react';
import { getLocalImageDimensions } from '@/utils/imageService';
import PageHeader from './PageHeader';
import PostList, { type PostListItem } from './PostList';
import SegmentedTabs from './SegmentedTabs';
import SaveBar, { type SyncState } from './SaveBar';
import DropZone from './DropZone';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import EditorSidebar from './editor/EditorSidebar';
import Field from './editor/Field';
import StatCard from './editor/StatCard';
import { rewritePreviewSrc, slugifyTitle as slugify } from './editor/preview';
import RichMarkdownEditor from './editor/rich/RichMarkdownEditor';
import type { UploadedImage } from './editor/rich/richEditorOptions';
import { useSidebarCollapsed } from './editor/useSidebarCollapsed';
import { withAdminProviders } from './editor/withAdminProviders';
import { uploadAdminImages } from './editor/uploadImages';
import SettingsDrawer from './editor/SettingsDrawer';
import { clearLocalDraft, readLocalDraft, useLocalDraftAutosave } from './editor/useLocalDraft';
import { useEditorShortcuts } from './editor/useEditorShortcuts';
import { openArticlePreview } from './editor/openArticlePreview';

type Season = 'Hiver' | 'Printemps' | 'Été' | 'Automne';

interface VoyageListEntry {
    year: string;
    slug: string;
    title: string;
    description: string;
    image: string;
    country?: string | string[];
    season?: Season;
    draft?: boolean;
}

interface VoyageFrontmatter {
    title: string;
    date?: string;
    description?: string;
    image: string;
    gallery: string[];
    country?: string | string[];
    season?: Season;
    year?: number;
    draft?: boolean;
}

interface ImageEntry {
    name: string;
    size: number;
    rel: string;
}

type Mode = { kind: 'idle' } | { kind: 'new' } | { kind: 'edit'; year: string; slug: string };

const CURRENT_YEAR = String(new Date().getFullYear());
const SEASONS: Season[] = ['Hiver', 'Printemps', 'Été', 'Automne'];

/**
 * Mélange une copie du tableau (Fisher-Yates).
 * POURQUOI : hors du composant, pour que le compilateur React ne voie pas Math.random comme un appel impur au rendu.
 *
 * @param items Tableau source (non modifié).
 * @returns Nouveau tableau mélangé.
 */
function shuffleArray<T>(items: readonly T[]): T[] {
    const next = [...items];
    for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
}

/** Les chemins relatifs du frontmatter (`../../../assets/voyages/…`) sont servis par la route admin des voyages. */
/** Clé du brouillon local d'un voyage pas encore enregistré. */
const NEW_VOYAGE_DRAFT_KEY = 'voyages/new';

/** Contenu conservé dans le brouillon local (voir `useLocalDraft.ts`). */
interface VoyageDraft {
    fm: VoyageFrontmatter;
    body: string;
    year: string;
    slug: string;
}

const VOYAGES_PREVIEW_SRC = {
    assetPattern: /\.\.\/\.\.\/\.\.\/assets\/voyages\/(\d{4})\/([a-z0-9-]+)\//g,
    apiBase: '/api/admin/voyages-images',
};

function emptyFm(year: number): VoyageFrontmatter {
    return { title: '', description: '', image: '', gallery: [], country: '', season: undefined, year, draft: false };
}

/**
 * Composant principal de l'éditeur de voyages pour l'interface d'administration.
 * Fournit les fournisseurs de contexte d'administration (providers) et englobe le sous-composant d'édition.
 *
 * POURQUOI : Centralise l'administration des voyages (métadonnées, galerie d'images avec drag & drop, récit markdown)
 * sous un même panneau d'édition.
 *
 * @returns {React.ReactElement} Le composant de l'éditeur de voyages.
 */
const VoyagesEditor = withAdminProviders(VoyagesEditorInner, 'VoyagesEditor');
export default VoyagesEditor;

interface EditorProps {
    /**
     * Admin distant (Preview de `dev`) : l'enregistrement committe sur la branche et les images sont
     * envoyées directement sur R2 (`uploadAdminImages`) ; la synchronisation disque → R2 est sautée.
     */
    remote?: boolean;
}

function VoyagesEditorInner({ remote = false }: EditorProps) {
    const toast = useToast();
    const confirm = useConfirm();

    const [posts, setPosts] = useState<VoyageListEntry[]>([]);
    const [mode, setMode] = useState<Mode>({ kind: 'idle' });
    const [year, setYear] = useState(CURRENT_YEAR);
    const [slug, setSlug] = useState('');
    const [slugTouched, setSlugTouched] = useState(false);
    const [fm, setFm] = useState<VoyageFrontmatter>(emptyFm(Number(CURRENT_YEAR)));
    const [body, setBody] = useState('');
    const [images, setImages] = useState<ImageEntry[]>([]);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    // POURQUOI : Trie les images pour que celles incluses dans la galerie apparaissent en premier
    // dans l'ordre défini par le frontmatter, suivies des images restantes.
    const sortedImagesForDisplay = useMemo(() => {
        const inGalleryImages = images.filter((img) => fm.gallery.includes(img.rel));
        const outGalleryImages = images.filter((img) => !fm.gallery.includes(img.rel));
        inGalleryImages.sort((a, b) => fm.gallery.indexOf(a.rel) - fm.gallery.indexOf(b.rel));
        return [...inGalleryImages, ...outGalleryImages];
    }, [images, fm.gallery]);

    // POURQUOI : Gère le début du déplacement (drag) d'une image pour la réorganiser.
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    // POURQUOI : Permet la dépose (drop) sur l'élément survolé.
    const handleDragOver = (e: React.DragEvent, _index: number) => {
        e.preventDefault();
    };

    // POURQUOI : Exécute le déplacement physique de l'image glissée et réordonne ou insère
    // l'image dans le tableau frontmatter gallery en désactivant la synchronisation automatique.
    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === targetIndex) return;

        const sourceImg = sortedImagesForDisplay[draggedIndex];
        const targetImg = sortedImagesForDisplay[targetIndex];
        if (!sourceImg || !targetImg) return;

        const sourceInGallery = fm.gallery.includes(sourceImg.rel);
        const targetInGallery = fm.gallery.includes(targetImg.rel);

        if (sourceInGallery && targetInGallery) {
            setAutoGallery(false);
            const next = [...fm.gallery];
            const sourceGalleryIdx = next.indexOf(sourceImg.rel);
            const targetGalleryIdx = next.indexOf(targetImg.rel);
            next.splice(sourceGalleryIdx, 1);
            next.splice(targetGalleryIdx, 0, sourceImg.rel);
            setFm((prev) => ({ ...prev, gallery: next }));
            markDirty();
        } else if (!sourceInGallery && targetInGallery) {
            setAutoGallery(false);
            const next = [...fm.gallery];
            const targetGalleryIdx = next.indexOf(targetImg.rel);
            next.splice(targetGalleryIdx, 0, sourceImg.rel);
            setFm((prev) => ({ ...prev, gallery: next }));
            markDirty();
        }
        setDraggedIndex(null);
    };

    // POURQUOI : Réinitialise l'index de déplacement à la fin du drag.
    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    // POURQUOI : Mélange aléatoirement l'ordre de la galerie d'images et désactive
    // la synchronisation automatique pour figer l'état.
    const shuffleGallery = () => {
        setAutoGallery(false);
        const next = shuffleArray(fm.gallery);
        setFm((prev) => ({ ...prev, gallery: next }));
        markDirty();
        toast.success('Ordre de la galerie mélangé aléatoirement (synchronisation auto désactivée).');
    };

    const [autoGallery, setAutoGallery] = useState(true);
    // POURQUOI : la galerie est le cœur d'un voyage ; les métadonnées vivent dans le tiroir « Réglages ».
    const [tab, setTab] = useState<'gallery' | 'body'>('gallery');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncState, setSyncState] = useState<SyncState>({ kind: 'idle' });
    // POURQUOI : révision (empreinte Git) du fichier ouvert, renvoyée à chaque enregistrement pour que le
    // serveur refuse d'écraser une modification faite ailleurs (autre appareil, commit local).
    const revisionRef = useRef<string | null>(null);
    /** Convertit un chemin `../../../assets/voyages/…` en URL de la route admin qui lit `src/assets`. */
    const resolveImageSrc = useCallback((src: string) => rewritePreviewSrc(src, VOYAGES_PREVIEW_SRC), []);

    // POURQUOI : Permet de replier la sidebar pour maximiser l'espace d'édition, ce qui est particulièrement utile en mode Markdown.
    // L'état est persistant via le stockage local (localStorage) sous la clé 'admin_sidebar_collapsed'.
    //
    // OPTIONS & EXEMPLES :
    // - Option A : Initialiser à false inconditionnellement (la sidebar est toujours visible au premier chargement).
    // - Option B (retenue) : Lire depuis localStorage au chargement initial pour conserver les préférences de l'utilisateur.
    //   Exemple: isSidebarCollapsed = true (si l'utilisateur a précédemment masqué la sidebar)
    const [isSidebarCollapsed, handleToggleSidebar] = useSidebarCollapsed();

    // POURQUOI: Permet d'alterner entre l'affichage en liste et en grille des galeries photos,
    // et de persister le choix de l'utilisateur dans localStorage.
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('admin_voyages_gallery_view');
            return saved === 'list' || saved === 'grid' ? saved : 'grid';
        }
        return 'grid';
    });

    const handleSetViewMode = useCallback((mode: 'grid' | 'list') => {
        setViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('admin_voyages_gallery_view', mode);
        }
    }, []);

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const loadPosts = useCallback(async () => {
        const res = await fetch('/api/admin/voyages');
        if (!res.ok) throw new Error('Failed to list voyages');
        setPosts((await res.json()) as VoyageListEntry[]);
    }, []);

    useEffect(() => {
        loadPosts().catch((e) => toast.error(String(e), { title: 'Chargement impossible' }));
    }, [loadPosts, toast]);

    const loadImages = useCallback(
        async (y: string, s: string) => {
            if (!y || !s) {
                setImages([]);
                return;
            }
            const res = await fetch(`/api/admin/voyages-images/${y}/${s}`);
            if (!res.ok) {
                setImages([]);
                // POURQUOI : une galerie vide sans explication masquait une panne (R2 non configuré sur l'admin distant).
                const err = (await res.json().catch(() => ({}))) as { error?: string };
                toast.error(err.error ?? `HTTP ${res.status}`, { title: 'Images indisponibles' });
                return;
            }
            setImages((await res.json()) as ImageEntry[]);
        },
        [toast],
    );

    // Auto-sync gallery from uploaded images when autoGallery is on.
    // POURQUOI : cover.jpg doit s'afficher dans la galerie comme n'importe quelle autre image.
    useEffect(() => {
        if (!autoGallery) return;
        const list = images.map((i) => i.rel);
        if (list.length !== fm.gallery.length || list.some((p, i) => p !== fm.gallery[i])) {
            setFm((prev) => ({ ...prev, gallery: list }));
        }
    }, [images, autoGallery, fm.gallery]);

    /**
     * Propose de restaurer le brouillon local d'un voyage s'il diffère de la version chargée.
     *
     * @param key Clé du brouillon (`voyages/<année>/<slug>` ou `voyages/new`).
     * @param loaded Version qui vient d'être chargée (ou le voyage vide).
     */
    const offerDraftRestore = useCallback(
        async (key: string, loaded: VoyageDraft) => {
            const draft = readLocalDraft<VoyageDraft>(key);
            if (!draft) return;
            if (JSON.stringify(draft.value) === JSON.stringify(loaded)) {
                clearLocalDraft(key);
                return;
            }
            const savedAt = new Date(draft.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
            const restore = await confirm({
                title: 'Brouillon non enregistré trouvé',
                message: `Des modifications de ce voyage n'ont pas été enregistrées (sauvegarde locale du ${savedAt}). Les restaurer ?`,
                confirmLabel: 'Restaurer',
                cancelLabel: 'Ignorer et supprimer',
            });
            if (!restore) {
                clearLocalDraft(key);
                return;
            }
            setFm(draft.value.fm);
            setBody(draft.value.body);
            setYear(draft.value.year);
            setSlug(draft.value.slug);
            setAutoGallery(false);
            setDirty(true);
            toast.success('Brouillon restauré. Pense à sauvegarder.');
        },
        [confirm, toast],
    );

    const openNew = useCallback(async () => {
        if (
            dirty &&
            !(await confirm({
                title: 'Modifications non sauvegardées',
                message: 'Tu vas perdre tes changements. Continuer ?',
                tone: 'danger',
                confirmLabel: 'Continuer',
            }))
        )
            return;
        setMode({ kind: 'new' });
        revisionRef.current = null;
        setYear(CURRENT_YEAR);
        setSlug('');
        setSlugTouched(false);
        setFm(emptyFm(Number(CURRENT_YEAR)));
        setBody('');
        setImages([]);
        setAutoGallery(true);
        setTab('gallery');
        setSettingsOpen(true);
        setDirty(false);
        setSyncState({ kind: 'idle' });
        window.history.replaceState(null, '', '?new=true');
        await offerDraftRestore(NEW_VOYAGE_DRAFT_KEY, {
            fm: emptyFm(Number(CURRENT_YEAR)),
            body: '',
            year: CURRENT_YEAR,
            slug: '',
        });
        // POURQUOI : Reset du défilement au sommet de la page pour aligner parfaitement la sidebar et le titre.
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [dirty, confirm, offerDraftRestore]);

    const openExisting = useCallback(
        async (y: string, s: string) => {
            if (
                dirty &&
                !(await confirm({
                    title: 'Modifications non sauvegardées',
                    message: 'Ouvrir un autre album fera perdre tes changements. Continuer ?',
                    tone: 'danger',
                    confirmLabel: 'Continuer',
                }))
            )
                return;
            const res = await fetch(`/api/admin/voyages/${y}/${s}`);
            if (!res.ok) {
                toast.error('Voyage introuvable.');
                return;
            }
            const data = (await res.json()) as VoyageFrontmatter & { body?: string; revision?: string };
            revisionRef.current = data.revision ?? null;
            setMode({ kind: 'edit', year: y, slug: s });
            setYear(y);
            setSlug(s);
            setSlugTouched(true);
            const cleanGallery = (data.gallery ?? []).filter((g) => !g.toLowerCase().includes('-thumb'));
            const loadedFm: VoyageFrontmatter = {
                title: data.title,
                date: data.date,
                description: data.description ?? '',
                image: data.image,
                gallery: cleanGallery,
                country: data.country ?? '',
                season: data.season,
                year: data.year ?? Number(y),
                draft: data.draft ?? false,
            };
            setFm(loadedFm);
            setBody(data.body ?? '');
            setAutoGallery(cleanGallery.length === 0);
            setTab('gallery');
            setSettingsOpen(false);
            setDirty(false);
            setImages([]);
            setSyncState({ kind: 'idle' });
            window.history.replaceState(null, '', `?year=${y}&slug=${s}`);
            await loadImages(y, s);
            await offerDraftRestore(`voyages/${y}/${s}`, { fm: loadedFm, body: data.body ?? '', year: y, slug: s });
            // POURQUOI : Force le retour en haut de la page lors du chargement de l'album pour réaligner parfaitement la sidebar et le PageHeader.
            window.scrollTo({ top: 0, behavior: 'instant' });
        },
        [dirty, confirm, toast, loadImages, offerDraftRestore],
    );

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const y = params.get('year');
        const s = params.get('slug');
        const isNew = params.get('new');
        if (y && s) {
            void openExisting(y, s);
        } else if (isNew === 'true') {
            void openNew();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (mode.kind === 'new' && !slugTouched) setSlug(slugify(fm.title));
    }, [fm.title, mode.kind, slugTouched]);

    useEffect(() => {
        if (mode.kind === 'new' && /^\d{4}$/.test(year)) {
            setFm((prev) => ({ ...prev, year: Number(year) }));
        }
    }, [year, mode.kind]);

    const markDirty = () => setDirty(true);

    const save = async () => {
        if (!fm.title.trim()) {
            toast.error('Le titre est requis.');
            setSettingsOpen(true);
            return;
        }
        if (!slug) {
            toast.error('Le slug est requis.');
            setSettingsOpen(true);
            return;
        }
        if (!/^\d{4}$/.test(year)) {
            toast.error('Année invalide.');
            return;
        }
        setSaving(true);
        try {
            const cleaned: VoyageFrontmatter = {
                ...fm,
                // POURQUOI : On garantit qu'aucune miniature ne se retrouve stockée
                // dans le tableau gallery du fichier markdown.
                gallery: fm.gallery.filter((g) => !g.toLowerCase().includes('-thumb')),
                country:
                    typeof fm.country === 'string'
                        ? fm.country.trim()
                            ? fm.country.trim()
                            : undefined
                        : Array.isArray(fm.country) && fm.country.length > 0
                          ? fm.country
                          : undefined,
            };
            const payload = { frontmatter: cleaned, body };
            let res: Response;
            if (mode.kind === 'edit') {
                res = await fetch(`/api/admin/voyages/${mode.year}/${mode.slug}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, revision: revisionRef.current ?? undefined }),
                });
            } else {
                res = await fetch('/api/admin/voyages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ year, slug, ...payload }),
                });
            }
            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
                throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
            }
            const saved = (await res.json().catch(() => ({}))) as { revision?: string };
            if (saved.revision) revisionRef.current = saved.revision;
            setDirty(false);
            if (draftKey) clearLocalDraft(draftKey);
            toast.success('Voyage sauvegardé.');
            await loadPosts();
            if (mode.kind === 'new') {
                setMode({ kind: 'edit', year, slug });
                window.history.replaceState(null, '', `?year=${year}&slug=${slug}`);
                await loadImages(year, slug);
            }
            await syncR2(year, slug);
        } catch (e) {
            toast.error(String((e as Error).message ?? e), { title: 'Échec de la sauvegarde' });
        } finally {
            setSaving(false);
        }
    };

    const syncR2 = async (y: string, s: string) => {
        if (remote) return;
        setSyncState({ kind: 'syncing' });
        try {
            const res = await fetch(`/api/admin/voyages-images/${y}/${s}/sync`, { method: 'POST' });
            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(err.error ?? `HTTP ${res.status}`);
            }
            const r = (await res.json()) as {
                uploaded: string[];
                deleted: string[];
                skipped: string[];
                skippedReason?: string;
            };
            if (r.skippedReason === 'no-credentials') {
                setSyncState({ kind: 'done', summary: 'R2 non configuré · sync sauté.' });
            } else {
                setSyncState({
                    kind: 'done',
                    summary: `R2 · ${r.uploaded.length} upload · ${r.deleted.length} suppr · ${r.skipped.length} déjà sync`,
                });
            }
        } catch (e) {
            setSyncState({ kind: 'error', summary: `Erreur sync R2 : ${(e as Error).message ?? e}` });
        }
    };

    const remove = async () => {
        if (mode.kind !== 'edit') return;
        const deleteAssets = await confirm({
            title: `Supprimer ${mode.year}/${mode.slug}.md ?`,
            message: (
                <span>
                    Cette action est définitive.
                    <br />
                    Veux-tu aussi supprimer le dossier d'images{' '}
                    <code>
                        src/assets/voyages/{mode.year}/{mode.slug}/
                    </code>{' '}
                    ?
                </span>
            ),
            tone: 'danger',
            confirmLabel: 'Supprimer + images',
        });
        if (!deleteAssets) {
            const articleOnly = await confirm({
                title: 'Supprimer uniquement le .md ?',
                message: 'Les images resteront sur disque.',
                tone: 'danger',
                confirmLabel: 'Supprimer le .md',
            });
            if (!articleOnly) return;
        }
        const url = `/api/admin/voyages/${mode.year}/${mode.slug}${deleteAssets ? '?assets=1' : ''}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) {
            toast.error('Échec de la suppression.');
            return;
        }
        toast.success('Voyage supprimé.');
        setMode({ kind: 'idle' });
        window.history.replaceState(null, '', window.location.pathname);
        setDirty(false);
        await loadPosts();
    };

    /**
     * Téléverse des images dans le dossier du voyage et les ajoute à la galerie du frontmatter.
     *
     * @param files Fichiers choisis ou déposés (les non-images sont ignorés).
     * @returns Les images enregistrées, avec leur chemin Markdown relatif (vide en cas d'échec).
     */
    const uploadFiles = async (files: File[]): Promise<UploadedImage[]> => {
        const list = files.filter((f) => f.type.startsWith('image/'));
        if (list.length === 0) return [];
        if (!year || !slug) {
            toast.error("Choisis d'abord année + slug.");
            return [];
        }
        const data = await uploadAdminImages<{ name: string; rel: string }>({
            section: 'voyages',
            year,
            slug,
            files: list,
            remote,
        });
        if (!data.ok) {
            toast.error(`Upload : ${data.error}`);
            return [];
        }
        await loadImages(year, slug);
        toast.success(`${data.saved.length} image(s) uploadée(s). Sauvegarde pour persister la galerie.`);
        const hadCover = !!fm.image;
        setFm((prev) => {
            const next = { ...prev };
            const toAdd = data.saved
                .filter((s) => s.name !== 'cover.jpg')
                .map((s) => s.rel)
                .filter((r) => !next.gallery.includes(r));
            if (toAdd.length > 0) next.gallery = [...next.gallery, ...toAdd];
            return next;
        });
        markDirty();
        // POURQUOI : `setCover` attend un nom de fichier (route PUT /voyages-images/<année>/<slug>/<nom>), pas le chemin relatif.
        if (!hadCover && data.saved[0]) void setCover(data.saved[0].name);
        return data.saved.map((saved) => ({ name: saved.name, path: saved.rel }));
    };

    const removeFromGallery = (rel: string) => {
        setFm((prev) => ({ ...prev, gallery: prev.gallery.filter((g) => g !== rel) }));
        markDirty();
    };
    const addToGallery = (rel: string) => {
        if (fm.gallery.includes(rel)) return;
        setFm((prev) => ({ ...prev, gallery: [...prev.gallery, rel] }));
        markDirty();
    };
    const moveGallery = (rel: string, delta: -1 | 1) => {
        setFm((prev) => {
            const idx = prev.gallery.indexOf(rel);
            if (idx < 0) return prev;
            const next = [...prev.gallery];
            const tgt = idx + delta;
            if (tgt < 0 || tgt >= next.length) return prev;
            [next[idx], next[tgt]] = [next[tgt], next[idx]];
            return { ...prev, gallery: next };
        });
        markDirty();
    };

    const deleteImageFile = async (name: string) => {
        if (
            !(await confirm({
                title: `Supprimer ${name} ?`,
                tone: 'danger',
                confirmLabel: 'Supprimer',
            }))
        )
            return;
        const res = await fetch(`/api/admin/voyages-images/${year}/${slug}/${encodeURIComponent(name)}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            toast.error('Échec suppression.');
            return;
        }
        const deletedRel = images.find((i) => i.name === name)?.rel;
        if (deletedRel) {
            setFm((prev) => ({
                ...prev,
                gallery: prev.gallery.filter((g) => g !== deletedRel),
                image: prev.image === deletedRel ? '' : prev.image,
            }));
        }
        toast.success('Image supprimée.');
        await loadImages(year, slug);
    };

    const setCover = async (imgName: string) => {
        if (!year || !slug) {
            toast.error("Choisis d'abord l'année et le slug du voyage.");
            return;
        }
        try {
            const res = await fetch(`/api/admin/voyages-images/${year}/${slug}/${encodeURIComponent(imgName)}`, {
                method: 'PUT',
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error ?? `HTTP ${res.status}`);
            }
            const coverRel = `../../../assets/voyages/${year}/${slug}/cover.jpg`;
            // POURQUOI : Définit cover.jpg comme image principale du voyage dans le frontmatter
            // et s'assure que seules les miniatures (-thumb) n'apparaissent pas dans le tableau gallery.
            setFm((prev) => ({
                ...prev,
                image: coverRel,
                gallery: prev.gallery.filter((g) => !g.toLowerCase().includes('-thumb')),
            }));
            markDirty();
            toast.success('Image de couverture définie.');
            await loadImages(year, slug);
        } catch (e) {
            toast.error(String((e as Error).message ?? e), { title: 'Impossible de définir la couverture' });
        }
    };

    const draftKey =
        mode.kind === 'edit' ? `voyages/${mode.year}/${mode.slug}` : mode.kind === 'new' ? NEW_VOYAGE_DRAFT_KEY : null;
    const draftValue = useMemo<VoyageDraft>(() => ({ fm, body, year, slug }), [fm, body, year, slug]);
    useLocalDraftAutosave(draftKey, draftValue, dirty);
    useEditorShortcuts(() => void save(), { canSave: mode.kind !== 'idle' && !saving, dirty });

    const missingFields = [!fm.title.trim() && 'titre', !slug && 'slug'].filter(Boolean);
    const settingsWarning = missingFields.length > 0 ? `À compléter : ${missingFields.join(', ')}.` : null;

    const previewArticle = () => {
        openArticlePreview({ section: 'voyages', year, slug, frontmatter: fm, body }).catch((e: unknown) =>
            toast.error(e instanceof Error ? e.message : String(e), { title: 'Aperçu impossible' }),
        );
    };

    const items: PostListItem[] = useMemo(
        () =>
            posts.map((p) => ({
                year: p.year,
                slug: p.slug,
                title: p.title || p.slug,
                subtitle: Array.isArray(p.country) ? p.country.join(', ') : (p.country ?? p.season ?? p.slug),
                thumb:
                    p.image && p.image.startsWith('../../../assets/voyages/')
                        ? p.image.replace('../../../assets/voyages/', '/api/admin/voyages-images/')
                        : undefined,
            })),
        [posts],
    );

    const activeKey = mode.kind === 'edit' ? `${mode.year}/${mode.slug}` : null;
    const showSaveBar = mode.kind !== 'idle';

    // POURQUOI : Nous remplaçons le layout CSS Grid rigide par un conteneur flexbox fluide.
    // Cela permet à la sidebar de se replier/déplier avec une transition CSS fluide (transition-all duration-300).
    // Lorsque la sidebar est masquée, elle applique des classes 'w-0 opacity-0 pointer-events-none' et un décalage de marge négatif
    // (lg:-mr-6) pour annuler le gap et permettre au panneau d'édition de s'étendre majestueusement sur toute la largeur de l'écran.
    //
    // OPTIONS & EXEMPLES :
    // - Option A : Cacher brusquement la sidebar (pas d'animation).
    // - Option B (retenue) : Transition progressive de la largeur (width), opacité (opacity) et marge (margin-right) pour une UX premium.
    //   Exemple: isSidebarCollapsed === true => 'lg:w-0 lg:-mr-6 opacity-0'
    const isIdle = mode.kind === 'idle';

    return (
        <div className="flex w-full flex-col items-start gap-6 lg:flex-row">
            {!isIdle && (
                <EditorSidebar collapsed={isSidebarCollapsed}>
                    <PostList
                        items={items}
                        activeKey={activeKey}
                        onSelect={(it) => openExisting(it.year, it.slug)}
                        onCreate={openNew}
                        createLabel="Nouveau"
                        title="Voyages"
                        emptyLabel="Aucun voyage."
                        onCollapse={() => handleToggleSidebar(true)}
                    />
                </EditorSidebar>
            )}

            <div className="flex w-full min-w-0 flex-1 flex-col gap-5 pb-24">
                {isIdle ? (
                    <VoyagesTableView voyages={posts} onSelect={openExisting} onCreate={openNew} />
                ) : (
                    <>
                        <PageHeader
                            breadcrumb={[
                                { label: 'Admin', href: '/admin' },
                                { label: 'Voyages', href: '/admin/voyages' },
                                { label: mode.kind === 'edit' ? `${mode.year}/${mode.slug}` : 'Nouvel album' },
                            ]}
                            title={fm.title || (mode.kind === 'new' ? 'Nouvel album' : 'Sans titre')}
                            description={fm.description}
                            actions={
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (
                                            dirty &&
                                            !(await confirm({
                                                title: 'Modifications non sauvegardées',
                                                message: 'Tu vas perdre tes changements en cours. Continuer ?',
                                                tone: 'danger',
                                                confirmLabel: 'Quitter sans sauvegarder',
                                            }))
                                        )
                                            return;
                                        setMode({ kind: 'idle' });
                                        window.history.replaceState(null, '', window.location.pathname);
                                    }}
                                    className="rounded-md border border-mp-glass-border bg-mp-glass-solid px-3.5 py-2 text-xs font-semibold text-mp-text-secondary shadow-xs transition-all hover:border-mp-accent hover:bg-mp-accent/5 hover:text-mp-accent"
                                >
                                    ← Liste des voyages
                                </button>
                            }
                            meta={
                                <>
                                    <button
                                        type="button"
                                        onClick={previewArticle}
                                        className="rounded-md border border-mp-accent/60 px-2.5 py-1 text-[11px] font-semibold text-mp-accent hover:bg-mp-accent/10"
                                        title="Rendu du récit avec les plugins du site, sans enregistrer"
                                    >
                                        Aperçu réel ↗
                                    </button>
                                    {mode.kind === 'edit' && (
                                        <a
                                            href={`/voyages/${mode.year}/${mode.slug}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded-md border border-mp-glass-border px-2.5 py-1 text-[11px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent"
                                        >
                                            Voir sur le site ↗
                                        </a>
                                    )}
                                </>
                            }
                        />

                        <div className="flex flex-wrap items-center gap-3">
                            <SegmentedTabs
                                value={tab}
                                onChange={setTab}
                                options={[
                                    { value: 'gallery', label: 'Galerie', count: images.length },
                                    { value: 'body', label: 'Texte' },
                                ]}
                            />
                            <button
                                type="button"
                                onClick={() => setSettingsOpen(true)}
                                className="relative rounded-md border border-mp-glass-border px-3 py-1.5 text-xs font-medium text-mp-text-secondary transition-all hover:border-mp-accent hover:text-mp-accent"
                                title={settingsWarning ?? 'Titre, slug, pays, saison, couverture, description'}
                            >
                                ⚙ Réglages
                                {settingsWarning && (
                                    <span
                                        className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-mp-accent"
                                        aria-label="Champs à compléter"
                                    />
                                )}
                            </button>
                        </div>

                        <SettingsDrawer
                            open={settingsOpen}
                            onClose={() => setSettingsOpen(false)}
                            title="Réglages du voyage"
                            warning={settingsWarning}
                        >
                            <section>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                                    <Field className="sm:col-span-6" label="Titre">
                                        <input
                                            className="admin-input"
                                            value={fm.title}
                                            onChange={(e) => {
                                                setFm({ ...fm, title: e.target.value });
                                                markDirty();
                                            }}
                                        />
                                    </Field>
                                    <Field className="sm:col-span-2" label="Année (dossier)">
                                        <input
                                            className="admin-input"
                                            value={year}
                                            disabled={mode.kind === 'edit'}
                                            onChange={(e) => {
                                                setYear(e.target.value.replace(/\D/g, '').slice(0, 4));
                                                markDirty();
                                            }}
                                        />
                                    </Field>
                                    <Field className="sm:col-span-2" label="Slug">
                                        <input
                                            className="admin-input font-mono"
                                            value={slug}
                                            disabled={mode.kind === 'edit'}
                                            onChange={(e) => {
                                                setSlug(slugify(e.target.value));
                                                setSlugTouched(true);
                                                markDirty();
                                            }}
                                        />
                                    </Field>
                                    <Field className="sm:col-span-2" label="Année (méta)">
                                        <input
                                            type="number"
                                            className="admin-input"
                                            value={fm.year ?? ''}
                                            onChange={(e) => {
                                                setFm({
                                                    ...fm,
                                                    year: e.target.value ? Number(e.target.value) : undefined,
                                                });
                                                markDirty();
                                            }}
                                        />
                                    </Field>
                                    <Field className="sm:col-span-6" label="Description">
                                        <textarea
                                            rows={2}
                                            className="admin-input"
                                            value={fm.description ?? ''}
                                            onChange={(e) => {
                                                setFm({ ...fm, description: e.target.value });
                                                markDirty();
                                            }}
                                        />
                                    </Field>
                                    <Field className="sm:col-span-4" label="Pays" hint="Séparés par virgule">
                                        <input
                                            className="admin-input"
                                            value={
                                                Array.isArray(fm.country) ? fm.country.join(', ') : (fm.country ?? '')
                                            }
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                const next = v.includes(',')
                                                    ? v
                                                          .split(',')
                                                          .map((s) => s.trim())
                                                          .filter(Boolean)
                                                    : v;
                                                setFm({ ...fm, country: next as string | string[] });
                                                markDirty();
                                            }}
                                        />
                                    </Field>
                                    <Field className="sm:col-span-2" label="Saison">
                                        <select
                                            className="admin-input"
                                            value={fm.season ?? ''}
                                            onChange={(e) => {
                                                setFm({
                                                    ...fm,
                                                    season: (e.target.value || undefined) as Season | undefined,
                                                });
                                                markDirty();
                                            }}
                                        >
                                            <option value="">—</option>
                                            {SEASONS.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field className="sm:col-span-4" label="Image de couverture">
                                        <input
                                            className="admin-input font-mono"
                                            value={fm.image}
                                            onChange={(e) => {
                                                setFm({ ...fm, image: e.target.value });
                                                markDirty();
                                            }}
                                        />
                                    </Field>
                                    <Field
                                        className="sm:col-span-2"
                                        label="État de publication"
                                        hint="Brouillon caché du site public"
                                    >
                                        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-mp-glass-border bg-mp-ui-black/30 px-2.5 text-sm text-mp-text-primary transition-all select-none hover:border-mp-accent/50">
                                            <input
                                                type="checkbox"
                                                checked={fm.draft === true}
                                                onChange={(e) => {
                                                    setFm({ ...fm, draft: e.target.checked });
                                                    markDirty();
                                                }}
                                            />
                                            Brouillon
                                        </label>
                                    </Field>
                                </div>
                            </section>
                        </SettingsDrawer>

                        {tab === 'gallery' && (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between rounded-lg border border-mp-glass-border bg-mp-glass-solid px-4 py-2.5 text-xs text-mp-text-secondary">
                                    <label className="flex cursor-pointer items-center gap-2 select-none">
                                        <input
                                            type="checkbox"
                                            checked={autoGallery}
                                            onChange={(e) => {
                                                setAutoGallery(e.target.checked);
                                                markDirty();
                                            }}
                                            className="h-4 w-4 rounded-sm border-mp-glass-border bg-mp-ui-black/60 text-mp-accent focus:ring-0"
                                        />
                                        <span>Synchroniser auto la galerie avec les fichiers présents</span>
                                    </label>
                                    <div className="flex items-center gap-4">
                                        {fm.gallery.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={shuffleGallery}
                                                className="rounded-sm border border-mp-glass-border bg-mp-ui-black/30 px-2.5 py-1 text-[10px] font-semibold text-mp-text-secondary shadow-xs transition-colors hover:border-mp-accent hover:bg-mp-accent/5 hover:text-mp-accent"
                                                title="Mélanger aléatoirement l'ordre des images de la galerie"
                                            >
                                                Mélanger 🎲
                                            </button>
                                        )}
                                        <span className="font-mono text-[11px] text-mp-text-muted">
                                            Galerie : {fm.gallery.length} / {images.length} images
                                        </span>
                                        <div className="flex items-center rounded-sm border border-mp-glass-border bg-mp-ui-black/30 p-0.5">
                                            <button
                                                type="button"
                                                onClick={() => handleSetViewMode('grid')}
                                                className={`rounded-sm p-1 transition-colors ${viewMode === 'grid' ? 'bg-mp-accent font-semibold text-mp-ui-black' : 'text-mp-text-muted hover:text-mp-text-primary'}`}
                                                title="Vue en grille"
                                            >
                                                <LayoutGrid className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSetViewMode('list')}
                                                className={`rounded-sm p-1 transition-colors ${viewMode === 'list' ? 'bg-mp-accent font-semibold text-mp-ui-black' : 'text-mp-text-muted hover:text-mp-text-primary'}`}
                                                title="Vue en liste"
                                            >
                                                <List className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <DropZone
                                    onFiles={uploadFiles}
                                    label="Glisse-dépose des images ici"
                                    hint={
                                        <>
                                            src/assets/voyages/{year}/{slug}/
                                        </>
                                    }
                                />

                                {images.length > 0 && viewMode === 'grid' && (
                                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                        {sortedImagesForDisplay.map((img, index) => {
                                            const inGallery = fm.gallery.includes(img.rel);
                                            const idx = fm.gallery.indexOf(img.rel);
                                            const isCover = fm.image === img.rel;
                                            return (
                                                <li
                                                    key={img.name}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, index)}
                                                    onDragOver={(e) => handleDragOver(e, index)}
                                                    onDrop={(e) => handleDrop(e, index)}
                                                    onDragEnd={handleDragEnd}
                                                    className={`cursor-grab overflow-hidden rounded-md border bg-mp-glass-solid transition-all select-none active:cursor-grabbing ${inGallery ? 'border-mp-accent/40 shadow-md' : 'border-mp-glass-border'} ${draggedIndex === index ? 'scale-95 opacity-40' : 'hover:scale-[1.02] hover:border-mp-accent/60'}`}
                                                >
                                                    <div className="pointer-events-none relative aspect-square w-full bg-mp-ui-black/30">
                                                        <img
                                                            src={`/api/admin/voyages-images/${year}/${slug}/${encodeURIComponent(img.name)}`}
                                                            alt={img.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                        {inGallery && (
                                                            <span className="absolute top-1 left-1 rounded-sm bg-mp-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold text-mp-ui-black">
                                                                #{idx + 1}
                                                            </span>
                                                        )}
                                                        {isCover && (
                                                            <span className="absolute top-1 right-1 rounded-sm bg-mp-text-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-mp-ui-black">
                                                                cover
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="space-y-1 p-2">
                                                        <div
                                                            className="truncate font-mono text-[10px] text-mp-text-secondary"
                                                            title={img.name}
                                                        >
                                                            {img.name}
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {inGallery ? (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        disabled={autoGallery}
                                                                        onClick={() => moveGallery(img.rel, -1)}
                                                                        className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] hover:border-mp-accent disabled:opacity-40"
                                                                    >
                                                                        ↑
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={autoGallery}
                                                                        onClick={() => moveGallery(img.rel, 1)}
                                                                        className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] hover:border-mp-accent disabled:opacity-40"
                                                                    >
                                                                        ↓
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={autoGallery}
                                                                        onClick={() => removeFromGallery(img.rel)}
                                                                        className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] hover:border-mp-accent disabled:opacity-40"
                                                                    >
                                                                        retirer
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    disabled={autoGallery}
                                                                    onClick={() => addToGallery(img.rel)}
                                                                    className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] hover:border-mp-accent disabled:opacity-40"
                                                                >
                                                                    + galerie
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => setCover(img.name)}
                                                                className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] hover:border-mp-accent"
                                                            >
                                                                cover
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => deleteImageFile(img.name)}
                                                                className="rounded-sm border border-mp-astro-red/40 px-1.5 py-0.5 text-[10px] text-mp-astro-red hover:bg-mp-astro-red/10"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}

                                {images.length > 0 && viewMode === 'list' && (
                                    <div className="overflow-hidden rounded-lg border border-mp-glass-border bg-mp-glass-solid/20 font-sans">
                                        <div className="scrollbar-thin overflow-x-auto">
                                            <table className="w-full border-collapse text-left text-xs">
                                                <thead className="bg-mp-glass-solid/20 text-[10px] tracking-wider text-mp-text-muted uppercase">
                                                    <tr className="border-b border-mp-glass-border">
                                                        <th className="w-[64px] px-4 py-2.5 text-center">Aperçu</th>
                                                        <th className="px-4 py-2.5">Nom du fichier</th>
                                                        <th className="w-[100px] px-4 py-2.5">Poids</th>
                                                        <th className="w-[120px] px-4 py-2.5">Dimensions</th>
                                                        <th className="w-[140px] px-4 py-2.5">Statut</th>
                                                        <th className="w-[240px] px-4 py-2.5 pr-6 text-right">
                                                            Actions
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-mp-glass-border/40 font-mono">
                                                    {sortedImagesForDisplay.map((img, index) => {
                                                        const inGallery = fm.gallery.includes(img.rel);
                                                        const idx = fm.gallery.indexOf(img.rel);
                                                        const isCover = fm.image === img.rel;
                                                        const dims = getLocalImageDimensions(img.rel);
                                                        const sizeStr = formatSize(img.size);

                                                        return (
                                                            <tr
                                                                key={img.name}
                                                                draggable
                                                                onDragStart={(e) => handleDragStart(e, index)}
                                                                onDragOver={(e) => handleDragOver(e, index)}
                                                                onDrop={(e) => handleDrop(e, index)}
                                                                onDragEnd={handleDragEnd}
                                                                className={`cursor-grab transition-colors select-none hover:bg-mp-accent/5 active:cursor-grabbing ${draggedIndex === index ? 'bg-mp-ui-black/30 opacity-40' : ''}`}
                                                            >
                                                                <td className="px-4 py-2 text-center">
                                                                    <div className="mx-auto h-8 w-8 overflow-hidden rounded-sm border border-mp-glass-border bg-mp-ui-black/60">
                                                                        <img
                                                                            src={`/api/admin/voyages-images/${year}/${slug}/${encodeURIComponent(img.name)}`}
                                                                            alt=""
                                                                            className="h-full w-full object-cover"
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td
                                                                    className="max-w-xs truncate px-4 py-2 font-semibold text-mp-text-primary select-all"
                                                                    title={img.name}
                                                                >
                                                                    {img.name}
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-mp-text-secondary">
                                                                    {sizeStr}
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-mp-text-muted">
                                                                    {dims ? `${dims.width} × ${dims.height}` : 'N/A'}
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap">
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {inGallery && (
                                                                            <span className="rounded-sm border border-mp-accent/30 bg-mp-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-mp-accent">
                                                                                Galerie #{idx + 1}
                                                                            </span>
                                                                        )}
                                                                        {isCover && (
                                                                            <span className="rounded-sm border border-mp-text-primary/30 bg-mp-text-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-mp-text-primary">
                                                                                Couverture
                                                                            </span>
                                                                        )}
                                                                        {!inGallery && !isCover && (
                                                                            <span className="text-[10px] text-mp-text-muted italic">
                                                                                —
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 pr-6 text-right">
                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                        {inGallery ? (
                                                                            <>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={autoGallery}
                                                                                    onClick={() =>
                                                                                        moveGallery(img.rel, -1)
                                                                                    }
                                                                                    className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent disabled:opacity-40"
                                                                                    title="Monter dans la galerie"
                                                                                >
                                                                                    ↑
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={autoGallery}
                                                                                    onClick={() =>
                                                                                        moveGallery(img.rel, 1)
                                                                                    }
                                                                                    className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent disabled:opacity-40"
                                                                                    title="Descendre dans la galerie"
                                                                                >
                                                                                    ↓
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={autoGallery}
                                                                                    onClick={() =>
                                                                                        removeFromGallery(img.rel)
                                                                                    }
                                                                                    className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent disabled:opacity-40"
                                                                                >
                                                                                    Retirer
                                                                                </button>
                                                                            </>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                disabled={autoGallery}
                                                                                onClick={() => addToGallery(img.rel)}
                                                                                className="rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent disabled:opacity-40"
                                                                            >
                                                                                + Galerie
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setCover(img.name)}
                                                                            className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${isCover ? 'border-mp-accent bg-mp-accent/10 text-mp-accent' : 'border-mp-glass-border text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent'}`}
                                                                        >
                                                                            Cover
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => deleteImageFile(img.name)}
                                                                            className="rounded-sm border border-mp-astro-red/40 px-1.5 py-0.5 text-[10px] text-mp-astro-red hover:bg-mp-astro-red/10"
                                                                            title="Supprimer définitivement du disque"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === 'body' && (
                            <RichMarkdownEditor
                                value={body}
                                onChange={(next) => {
                                    setBody(next);
                                    markDirty();
                                }}
                                resolveImageSrc={resolveImageSrc}
                                uploadImages={uploadFiles}
                                onSetCover={(src) => void setCover(decodeURIComponent(src.split('/').pop() ?? src))}
                                placeholder="(Optionnel) Récit du voyage… Tape « / » pour insérer une image, un titre, une vidéo…"
                            />
                        )}
                    </>
                )}
            </div>

            <SaveBar
                visible={showSaveBar}
                dirty={dirty}
                saving={saving}
                onSave={save}
                sync={syncState}
                extras={
                    mode.kind === 'edit' && (
                        <>
                            <button
                                type="button"
                                onClick={() => syncR2(mode.year, mode.slug)}
                                disabled={saving || syncState.kind === 'syncing'}
                                className="rounded-md border border-mp-glass-border px-3 py-1.5 text-xs text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent disabled:opacity-50"
                            >
                                Sync R2
                            </button>
                            <button
                                type="button"
                                onClick={remove}
                                className="rounded-md border border-mp-astro-red/50 px-3 py-1.5 text-xs font-medium text-mp-astro-red hover:bg-mp-astro-red/10"
                            >
                                Supprimer
                            </button>
                        </>
                    )
                }
            />
        </div>
    );
}

interface VoyagesTableViewProps {
    voyages: VoyageListEntry[];
    onSelect: (year: string, slug: string) => void;
    onCreate: () => void;
}

/**
 * Affiche la table de bord tabulaire complète pour gérer tous les récits de voyage / albums photos.
 *
 * POURQUOI : Remplace la vue inactive (idle) par défaut par une interface en pleine largeur,
 * permettant de rechercher, filtrer par saison et par pays, et de suivre d'un coup d'œil l'état
 * de chaque album (illustrations, pays associés, etc.).
 *
 * OPTIONS & EXEMPLES :
 * - Option A : Conserver une simple liste verticale. Peu adaptée à un grand nombre de pays/saisons.
 * - Option B (retenue) : Une table responsive complète avec statistiques de couverture de voyage,
 *   recherche instantanée et filtrage multicritères.
 *   Exemple : Sélectionner 'Hiver' dans les saisons pour lister tous les voyages polaires.
 *
 * @param props.voyages - Liste des récits de voyage chargés depuis l'API.
 * @param props.onSelect - Callback déclenché pour ouvrir un voyage existant en édition.
 * @param props.onCreate - Callback déclenché pour initialiser un nouvel album de voyage.
 * @returns Le composant React du tableau de bord d'administration des voyages.
 */
function VoyagesTableView({ voyages, onSelect, onCreate }: VoyagesTableViewProps) {
    const [search, setSearch] = useState('');
    const [seasonFilter, setSeasonFilter] = useState('all');
    const [countryFilter, setCountryFilter] = useState('all');

    // POURQUOI : Extrait de manière dynamique la liste triée de tous les pays visités.
    // Gère à la fois le format string simple et le format array de pays.
    const uniqueCountries = useMemo(() => {
        const set = new Set<string>();
        voyages.forEach((v) => {
            if (typeof v.country === 'string') {
                const c = v.country.trim();
                if (c) set.add(c);
            } else if (Array.isArray(v.country)) {
                v.country.forEach((c) => {
                    const ct = c.trim();
                    if (ct) set.add(ct);
                });
            }
        });
        return Array.from(set).sort();
    }, [voyages]);

    // Calculs de statistiques pour les cartes informatives
    const totalCount = voyages.length;
    const countriesCount = uniqueCountries.length;
    const seasonsCount = new Set(voyages.map((v) => v.season).filter(Boolean)).size;
    const voyagesWithCover = voyages.filter((v) => v.image && v.image.trim().length > 0).length;

    // POURQUOI : Filtrage combiné en temps réel (recherche texte + pays + saison).
    const filteredVoyages = voyages.filter((v) => {
        const query = search.toLowerCase().trim();

        // Match country details as string or array
        const countriesList =
            typeof v.country === 'string'
                ? [v.country.toLowerCase()]
                : Array.isArray(v.country)
                  ? v.country.map((c) => c.toLowerCase())
                  : [];

        const matchesSearch =
            !query ||
            v.title.toLowerCase().includes(query) ||
            v.slug.toLowerCase().includes(query) ||
            v.description.toLowerCase().includes(query) ||
            countriesList.some((c) => c.includes(query)) ||
            (v.season && v.season.toLowerCase().includes(query));

        if (!matchesSearch) return false;

        // Season filter
        if (seasonFilter !== 'all' && v.season !== seasonFilter) {
            return false;
        }

        // Country filter
        if (countryFilter !== 'all') {
            const hasCountry =
                typeof v.country === 'string'
                    ? v.country === countryFilter
                    : Array.isArray(v.country) && v.country.includes(countryFilter);
            if (!hasCountry) return false;
        }

        return true;
    });

    return (
        <div className="flex w-full flex-col gap-6 pb-12">
            {/* En-tête du Tableau de Bord */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-mp-glass-border/40 pb-5">
                <div>
                    <h1 className="font-serif text-2xl font-bold text-mp-text-heading">Gestion des Albums Voyages</h1>
                    <p className="mt-1 text-xs text-mp-text-muted">
                        Gérez vos récits de voyages, organisez les galeries photos et suivez les saisons et les pays
                        visités.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onCreate}
                    className="flex items-center gap-1.5 rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black shadow-md shadow-mp-accent/10 hover:opacity-90"
                >
                    <Plus className="h-4 w-4 text-mp-ui-black" />
                    <span>Nouveau voyage</span>
                </button>
            </div>

            {/* Grille de Statistiques */}
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Total Voyages" value={totalCount} icon={Compass} />
                <StatCard label="Pays visités" value={countriesCount} icon={Globe} accentColor="emerald" />
                <StatCard label="Saisons représentées" value={seasonsCount} icon={Calendar} accentColor="emerald" />
                <StatCard
                    label="Albums illustrés"
                    value={voyagesWithCover}
                    total={totalCount}
                    icon={Image}
                    showProgress
                />
            </section>

            {/* Barre de Filtres */}
            <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-mp-glass-border bg-mp-glass-solid/20 p-3.5 sm:flex-row sm:items-center">
                <div className="relative max-w-lg flex-1">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-mp-text-muted" />
                    <input
                        type="text"
                        placeholder="Rechercher par titre, description, pays, saison..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="admin-input w-full border-mp-glass-border bg-mp-ui-black/40 pl-9 text-xs focus:border-mp-accent"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 shrink-0 text-mp-text-muted" />
                        <select
                            value={countryFilter}
                            onChange={(e) => setCountryFilter(e.target.value)}
                            className="admin-input min-w-[150px] border-mp-glass-border bg-mp-ui-black/40 text-xs"
                        >
                            <option value="all">Tous les pays ({countriesCount})</option>
                            {uniqueCountries.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={seasonFilter}
                            onChange={(e) => setSeasonFilter(e.target.value)}
                            className="admin-input min-w-[120px] border-mp-glass-border bg-mp-ui-black/40 text-xs"
                        >
                            <option value="all">Toutes les saisons</option>
                            <option value="Hiver">❄️ Hiver</option>
                            <option value="Printemps">🌸 Printemps</option>
                            <option value="Été">☀️ Été</option>
                            <option value="Automne">🍂 Automne</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Tableau principal */}
            <section className="overflow-hidden rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 shadow-lg">
                <header className="flex items-center justify-between border-b border-mp-glass-border bg-mp-glass-solid/60 px-4 py-3">
                    <h2 className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-mp-text-secondary uppercase">
                        <span>Catalogue Voyages</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-mp-text-muted" />
                        <span className="text-mp-accent">
                            {filteredVoyages.length} / {voyages.length} voyages
                        </span>
                    </h2>
                </header>
                <div className="scrollbar-thin overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead className="bg-mp-glass-solid/20 text-[10px] tracking-wider text-mp-text-muted uppercase">
                            <tr className="border-b border-mp-glass-border">
                                <th className="w-[64px] px-4 py-3 text-center">Aperçu</th>
                                <th className="px-4 py-3">Titre</th>
                                <th className="w-[80px] px-4 py-3">Année</th>
                                <th className="px-4 py-3">Pays</th>
                                <th className="px-4 py-3">Saison</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="w-[64px] px-3 py-3 text-center">Cover</th>
                                <th className="w-[120px] px-4 py-3 pr-6 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-mp-glass-border/40">
                            {filteredVoyages.map((v) => {
                                const thumbSrc =
                                    v.image && v.image.startsWith('../../../assets/voyages/')
                                        ? v.image.replace('../../../assets/voyages/', '/api/admin/voyages-images/')
                                        : undefined;
                                const hasCover = v.image && v.image.trim().length > 0;

                                return (
                                    <tr key={`${v.year}/${v.slug}`} className="transition-colors hover:bg-mp-accent/5">
                                        <td className="px-4 py-3 text-center">
                                            {thumbSrc ? (
                                                <div className="mx-auto h-10 w-10 overflow-hidden rounded-sm border border-mp-glass-border bg-mp-ui-black/60">
                                                    <img src={thumbSrc} alt="" className="h-full w-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-sm border border-mp-glass-border/40 bg-mp-ui-black/20 font-mono text-[10px] text-mp-text-muted">
                                                    N/A
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-mp-text-primary transition-colors hover:text-mp-accent"
                                                onClick={() => onSelect(v.year, v.slug)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        onSelect(v.year, v.slug);
                                                    }
                                                }}
                                            >
                                                <span>{v.title}</span>
                                                {v.draft && (
                                                    <span className="inline-flex shrink-0 items-center rounded-full border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-medium text-yellow-500">
                                                        Brouillon
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 font-mono text-[10px] text-mp-text-muted">
                                                {v.slug}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono whitespace-nowrap text-mp-text-muted">
                                            {v.year}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-mp-text-secondary">
                                            {Array.isArray(v.country)
                                                ? v.country.join(', ')
                                                : v.country || (
                                                      <span className="text-mp-text-muted italic">Non défini</span>
                                                  )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {v.season ? (
                                                <span className="inline-flex items-center rounded-full border border-mp-accent/25 bg-mp-accent/10 px-2 py-0.5 text-[10px] font-medium text-mp-accent">
                                                    {v.season === 'Hiver' && '❄️ '}
                                                    {v.season === 'Printemps' && '🌸 '}
                                                    {v.season === 'Été' && '☀️ '}
                                                    {v.season === 'Automne' && '🍂 '}
                                                    {v.season}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-mp-text-muted italic">
                                                    Non définie
                                                </span>
                                            )}
                                        </td>
                                        <td
                                            className="max-w-xs truncate px-4 py-3 text-mp-text-secondary"
                                            title={v.description}
                                        >
                                            {v.description}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span
                                                title={
                                                    hasCover
                                                        ? `Image de couverture définie`
                                                        : `Pas d'image de couverture`
                                                }
                                                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                                                    hasCover
                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                                        : 'border-red-500/20 bg-red-500/10 text-red-400'
                                                }`}
                                            >
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full ${hasCover ? 'bg-emerald-400' : 'bg-red-400'}`}
                                                />
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 pr-6 text-right">
                                            <div className="flex items-center justify-end gap-3 font-semibold">
                                                <button
                                                    type="button"
                                                    onClick={() => onSelect(v.year, v.slug)}
                                                    className="inline-flex items-center gap-1 text-xs text-mp-accent transition-colors hover:text-mp-accent-hover"
                                                >
                                                    <Edit className="h-3.5 w-3.5" />
                                                    <span>Éditer</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredVoyages.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-xs text-mp-text-muted">
                                        <AlertCircle className="mx-auto mb-2.5 h-8 w-8 text-mp-text-muted/60" />
                                        Aucun voyage ne correspond aux critères de recherche ou de filtrage.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
