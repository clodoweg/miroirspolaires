import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Search,
    Filter,
    Plus,
    Calendar,
    FileText,
    BookOpen,
    Image,
    Edit,
    AlertCircle,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
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
import RichMarkdownEditor, { type RichMarkdownEditorHandle } from './editor/rich/RichMarkdownEditor';
import type { UploadedImage } from './editor/rich/richEditorOptions';
import { useSidebarCollapsed } from './editor/useSidebarCollapsed';
import { withAdminProviders } from './editor/withAdminProviders';
import { uploadAdminImages } from './editor/uploadImages';
import SettingsDrawer from './editor/SettingsDrawer';
import { clearLocalDraft, readLocalDraft, useLocalDraftAutosave } from './editor/useLocalDraft';
import { useEditorShortcuts } from './editor/useEditorShortcuts';
import { openArticlePreview } from './editor/openArticlePreview';

interface PostListEntry {
    year: string;
    slug: string;
    title: string;
    date: string;
    description: string;
    image: string;
    categories?: string[];
    draft?: boolean;
}

interface PostFrontmatter {
    title: string;
    date: string;
    categories: string[];
    description: string;
    seoDescription?: string;
    image: string;
    showImage?: boolean;
    draft?: boolean;
    hideImageCaptions?: boolean;
}

interface ImageEntry {
    name: string;
    size: number;
    path: string;
    mtimeMs?: number;
    capturedAt?: string;
    dayKey?: string;
    timeStr?: string;
    is360?: boolean;
}

type Mode = { kind: 'idle' } | { kind: 'new' } | { kind: 'edit'; year: string; slug: string };

const CURRENT_YEAR = String(new Date().getFullYear());

function emptyFrontmatter(): PostFrontmatter {
    return {
        title: '',
        date: new Date().toISOString().slice(0, 10),
        categories: [],
        description: '',
        seoDescription: '',
        image: '',
        showImage: true,
        draft: false,
        hideImageCaptions: false,
    };
}

/** Clé du brouillon local d'un article pas encore enregistré. */
const NEW_POST_DRAFT_KEY = 'blog/new';

/** Contenu conservé dans le brouillon local (voir `useLocalDraft.ts`). */
interface PostDraft {
    fm: PostFrontmatter;
    body: string;
    year: string;
    slug: string;
}

/** Normalise le frontmatter renvoyé par l'API pour les champs de l'éditeur. */
function toEditorFrontmatter(data: PostFrontmatter): PostFrontmatter {
    return {
        title: data.title,
        date: data.date,
        categories: data.categories ?? [],
        description: data.description,
        seoDescription: data.seoDescription ?? '',
        image: data.image,
        showImage: data.showImage !== false,
        draft: data.draft ?? false,
        hideImageCaptions: data.hideImageCaptions === true,
    };
}

/** Rewrite /assets/blog/<year>/<slug>/<file> -> /api/admin/images/... so the dev preview can fetch from src/assets. */
const BLOG_PREVIEW_SRC = {
    assetPattern: /\/assets\/blog\/(\d{4})\/([a-z0-9-]+)\//g,
    apiBase: '/api/admin/images',
};

const BlogEditor = withAdminProviders(BlogEditorInner, 'BlogEditor');
export default BlogEditor;

interface EditorProps {
    /**
     * Admin distant (Preview de `dev`) : l'enregistrement committe sur la branche et les images sont
     * envoyées directement sur R2 (`uploadAdminImages`) ; la synchronisation disque → R2 est sautée.
     */
    remote?: boolean;
}

function BlogEditorInner({ remote = false }: EditorProps) {
    const toast = useToast();
    const confirm = useConfirm();

    const [posts, setPosts] = useState<PostListEntry[]>([]);
    const [mode, setMode] = useState<Mode>({ kind: 'idle' });
    const activeKey = mode.kind === 'edit' ? `${mode.year}/${mode.slug}` : null;
    const [year, setYear] = useState(CURRENT_YEAR);
    const [slug, setSlug] = useState('');
    const [slugTouched, setSlugTouched] = useState(false);
    const [fm, setFm] = useState<PostFrontmatter>(emptyFrontmatter());
    const [body, setBody] = useState('');
    const [images, setImages] = useState<ImageEntry[]>([]);
    // POURQUOI : comme dans Ghost, le texte est la vue principale ; les métadonnées vivent dans le
    // tiroir « Réglages » (SettingsDrawer), ouvert d'office pour un nouvel article.
    const [tab, setTab] = useState<'body' | 'images'>('body');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showImageSidebar, setShowImageSidebar] = useState(false);
    const [uploadYear, setUploadYear] = useState<string | null>(null);
    const [uploadSlug, setUploadSlug] = useState<string | null>(null);
    const [syncState, setSyncState] = useState<SyncState>({ kind: 'idle' });
    // POURQUOI : révision (empreinte Git) du fichier ouvert, renvoyée à chaque enregistrement pour que le
    // serveur refuse d'écraser une modification faite ailleurs (autre appareil, commit local).
    const revisionRef = useRef<string | null>(null);
    const richEditorRef = useRef<RichMarkdownEditorHandle>(null);

    /** Convertit un chemin `/assets/blog/…` en URL de la route admin qui lit `src/assets`. */
    const resolveImageSrc = useCallback(
        (src: string) => rewritePreviewSrc(src, BLOG_PREVIEW_SRC, { year: uploadYear, slug: uploadSlug }),
        [uploadYear, uploadSlug],
    );

    // POURQUOI : Permet de replier la sidebar pour maximiser l'espace de rédaction, ce qui est particulièrement utile en mode Markdown.
    // L'état est persistant via le stockage local (localStorage) sous la clé 'admin_sidebar_collapsed'.
    //
    // OPTIONS & EXEMPLES :
    // - Option A : Initialiser à false inconditionnellement (la sidebar est toujours visible au premier chargement).
    // - Option B (retenue) : Lire depuis localStorage au chargement initial pour conserver les préférences de l'utilisateur.
    //   Exemple: isSidebarCollapsed = true (si l'utilisateur a précédemment masqué la sidebar)
    const [isSidebarCollapsed, handleToggleSidebar] = useSidebarCollapsed();

    const allCategories = useMemo(() => {
        const set = new Set<string>();
        for (const post of posts) {
            if (Array.isArray(post.categories)) {
                for (const c of post.categories) {
                    if (c && c.trim()) set.add(c.trim());
                }
            }
        }
        return Array.from(set).sort();
    }, [posts]);

    const loadPosts = useCallback(async () => {
        const res = await fetch('/api/admin/posts');
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${res.statusText}. ${errText}`);
        }
        const data: PostListEntry[] = await res.json();
        setPosts(data);
    }, []);

    useEffect(() => {
        loadPosts().catch((e) =>
            toast.error(e instanceof Error ? e.message : String(e), { title: 'Chargement impossible' }),
        );
    }, [loadPosts, toast]);

    const loadImages = useCallback(
        async (y: string, s: string) => {
            if (!y || !s) {
                setImages([]);
                return;
            }
            const res = await fetch(`/api/admin/images/${y}/${s}`);
            if (!res.ok) {
                setImages([]);
                // POURQUOI : une galerie vide sans explication masquait une panne (R2 non configuré sur l'admin distant).
                const err = (await res.json().catch(() => ({}))) as { error?: string };
                toast.error(err.error ?? `HTTP ${res.status}`, { title: 'Images indisponibles' });
                return;
            }
            setImages(await res.json());
        },
        [toast],
    );

    /**
     * Propose de restaurer le brouillon local d'un article s'il diffère de la version chargée.
     *
     * @param key Clé du brouillon (`blog/<année>/<slug>` ou `blog/new`).
     * @param loaded Version qui vient d'être chargée (ou l'article vide).
     */
    const offerDraftRestore = useCallback(
        async (key: string, loaded: PostDraft) => {
            const draft = readLocalDraft<PostDraft>(key);
            if (!draft) return;
            if (JSON.stringify(draft.value) === JSON.stringify(loaded)) {
                clearLocalDraft(key);
                return;
            }
            const savedAt = new Date(draft.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
            const restore = await confirm({
                title: 'Brouillon non enregistré trouvé',
                message: `Des modifications de cet article n'ont pas été enregistrées (sauvegarde locale du ${savedAt}). Les restaurer ?`,
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
                message: 'Tu vas perdre tes changements en cours. Continuer ?',
                tone: 'danger',
                confirmLabel: 'Continuer sans sauvegarder',
            }))
        )
            return;
        setMode({ kind: 'new' });
        revisionRef.current = null;
        setYear(CURRENT_YEAR);
        setSlug('');
        setSlugTouched(false);
        setFm(emptyFrontmatter());
        setBody('');
        setImages([]);
        setTab('body');
        setSettingsOpen(true);
        setDirty(false);
        setUploadYear(null);
        setUploadSlug(null);
        setSyncState({ kind: 'idle' });
        window.history.replaceState(null, '', '?new=true');
        await offerDraftRestore(NEW_POST_DRAFT_KEY, { fm: emptyFrontmatter(), body: '', year: CURRENT_YEAR, slug: '' });
        // POURQUOI : Reset du défilement au sommet de la page pour aligner parfaitement la sidebar et le titre.
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [dirty, confirm, offerDraftRestore]);

    const openExisting = useCallback(
        async (y: string, s: string) => {
            if (
                dirty &&
                !(await confirm({
                    title: 'Modifications non sauvegardées',
                    message: 'Ouvrir un autre article fera perdre tes changements. Continuer ?',
                    tone: 'danger',
                    confirmLabel: 'Continuer sans sauvegarder',
                }))
            )
                return;
            const res = await fetch(`/api/admin/posts/${y}/${s}`);
            if (!res.ok) {
                toast.error('Article introuvable.');
                return;
            }
            const data = (await res.json()) as PostFrontmatter & { body?: string; revision?: string };
            revisionRef.current = data.revision ?? null;
            setMode({ kind: 'edit', year: y, slug: s });
            setYear(y);
            setSlug(s);
            setSlugTouched(true);
            setFm(toEditorFrontmatter(data));
            setBody(data.body ?? '');
            setTab('body');
            setSettingsOpen(false);
            setDirty(false);
            setUploadYear(null);
            setUploadSlug(null);
            setSyncState({ kind: 'idle' });
            window.history.replaceState(null, '', `?year=${y}&slug=${s}`);
            await loadImages(y, s);
            await offerDraftRestore(`blog/${y}/${s}`, {
                fm: toEditorFrontmatter(data),
                body: data.body ?? '',
                year: y,
                slug: s,
            });
            // POURQUOI : Force le retour en haut de la page lors du chargement de l'article pour réaligner parfaitement la sidebar et le PageHeader.
            window.scrollTo({ top: 0, behavior: 'instant' });
        },
        [dirty, confirm, toast, loadImages, offerDraftRestore],
    );

    // Restore editor state from the URL (HMR-resilient).
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

    // POURQUOI : Lors de la sélection d'un article, le panneau de droite grandit instantanément (chargement de la zone de texte de 60vh).
    // Cet effet asynchrone (macro-task setTimeout 0) garantit que la page est ramenée au sommet absolu (scroll 0)
    // APRES que React a fini de mettre à jour le DOM. Cela neutralise toute tentative du navigateur de restaurer le défilement
    // et aligne parfaitement la sidebar avec le PageHeader.
    useEffect(() => {
        if (activeKey) {
            const timer = setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'instant' });
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [activeKey]);

    useEffect(() => {
        if (mode.kind === 'new' && !slugTouched) {
            setSlug(slugify(fm.title));
        }
    }, [fm.title, mode.kind, slugTouched]);

    // Keep cover + body image paths consistent with the current year/slug.
    useEffect(() => {
        if (fm.image && year && slug) {
            const coverMatch = fm.image.match(/^\/assets\/blog\/(\d{4})\/([a-z0-9-]+)\/(.*)$/);
            if (coverMatch) {
                const [, imgYear, imgSlug, filename] = coverMatch;
                if (imgYear !== year || imgSlug !== slug) {
                    setFm((prev) => ({ ...prev, image: `/assets/blog/${year}/${slug}/${filename}` }));
                }
            }
        }
        if (body && year && slug) {
            const bodyRegex = /\/assets\/blog\/(\d{4})\/([a-z0-9-]+)\//g;
            let bodyChanged = false;
            const nextBody = body.replace(bodyRegex, (match, imgYear, imgSlug) => {
                if (imgYear !== year || imgSlug !== slug) {
                    bodyChanged = true;
                    return `/assets/blog/${year}/${slug}/`;
                }
                return match;
            });
            if (bodyChanged) {
                setBody(nextBody);
            }
        }
    }, [year, slug, body, fm.image]);

    const markDirty = () => setDirty(true);

    const draftKey =
        mode.kind === 'edit' ? `blog/${mode.year}/${mode.slug}` : mode.kind === 'new' ? NEW_POST_DRAFT_KEY : null;
    const draftValue = useMemo<PostDraft>(() => ({ fm, body, year, slug }), [fm, body, year, slug]);
    useLocalDraftAutosave(draftKey, draftValue, dirty);

    const missingFields = [
        !fm.title.trim() && 'titre',
        !slug && 'slug',
        !fm.date && 'date',
        !fm.description.trim() && 'description',
    ].filter(Boolean);
    const settingsWarning = missingFields.length > 0 ? `À compléter : ${missingFields.join(', ')}.` : null;

    const previewArticle = () => {
        openArticlePreview({ section: 'blog', year, slug, frontmatter: fm, body }).catch((e: unknown) =>
            toast.error(e instanceof Error ? e.message : String(e), { title: 'Aperçu impossible' }),
        );
    };

    const save = async () => {
        if (!fm.title.trim()) {
            toast.error('Le titre est requis.');
            setSettingsOpen(true);
            return;
        }
        if (!fm.date) {
            toast.error('La date est requise.');
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
            const payload = {
                frontmatter: {
                    ...fm,
                    seoDescription: fm.seoDescription?.trim() ? fm.seoDescription : undefined,
                    showImage: fm.showImage === false ? false : undefined,
                    hideImageCaptions: fm.hideImageCaptions === true ? true : undefined,
                } as PostFrontmatter,
                body,
            };
            let res: Response;
            if (mode.kind === 'edit') {
                res = await fetch(`/api/admin/posts/${mode.year}/${mode.slug}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, revision: revisionRef.current ?? undefined }),
                });
            } else {
                res = await fetch('/api/admin/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        year,
                        slug,
                        oldYear: uploadYear,
                        oldSlug: uploadSlug,
                        ...payload,
                    }),
                });
            }
            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
                throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as {
                ok: boolean;
                frontmatter?: PostFrontmatter;
                body?: string;
                revision?: string;
            };
            if (data.revision) revisionRef.current = data.revision;
            if (data.frontmatter) {
                setFm(toEditorFrontmatter(data.frontmatter));
            }
            if (typeof data.body === 'string') {
                setBody(data.body);
            }
            setDirty(false);
            if (draftKey) clearLocalDraft(draftKey);
            toast.success('Article sauvegardé.');
            setUploadYear(null);
            setUploadSlug(null);
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

    const removePost = async () => {
        if (mode.kind !== 'edit') return;
        const deleteAssets = await confirm({
            title: `Supprimer ${mode.year}/${mode.slug}.md ?`,
            message: (
                <span>
                    Cette action est définitive.
                    <br />
                    Veux-tu aussi supprimer le dossier d'images{' '}
                    <code>
                        src/assets/blog/{mode.year}/{mode.slug}/
                    </code>{' '}
                    ?
                </span>
            ),
            tone: 'danger',
            confirmLabel: 'Supprimer + images',
            cancelLabel: 'Annuler',
        });
        if (!deleteAssets) {
            const articleOnly = await confirm({
                title: `Supprimer uniquement le .md ?`,
                message: 'Les images resteront sur disque. Confirmer ?',
                tone: 'danger',
                confirmLabel: 'Supprimer le .md',
            });
            if (!articleOnly) return;
        }
        const url = `/api/admin/posts/${mode.year}/${mode.slug}${deleteAssets ? '?assets=1' : ''}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) {
            toast.error('Échec de la suppression.');
            return;
        }
        toast.success('Article supprimé.');
        setMode({ kind: 'idle' });
        window.history.replaceState(null, '', window.location.pathname);
        setDirty(false);
        await loadPosts();
    };

    /**
     * Synchronise les images locales avec Cloudflare R2 (upload des nouvelles,
     * suppression des absentes). Mise à jour de l'état `syncState` consommée
     * par la SaveBar pour afficher la progression.
     *
     * @param y Année de publication (ex: '2026').
     * @param s Slug de l'article (ex: 'mon-slug-article').
     */
    const syncR2 = async (y: string, s: string) => {
        if (remote) return;
        setSyncState({ kind: 'syncing' });
        try {
            const res = await fetch(`/api/admin/images/${y}/${s}/sync`, { method: 'POST' });
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

    const uploadFiles = async (files: File[]) => {
        const list = files.filter((f) => f.type.startsWith('image/'));
        if (list.length === 0) return;
        if (!year || !slug) {
            toast.error("Choisis d'abord année + slug pour pouvoir uploader.");
            return;
        }
        const targetYear = uploadYear || year;
        const targetSlug = uploadSlug || slug;
        const data = await uploadAdminImages<{ name: string; path: string }>({
            section: 'blog',
            year: targetYear,
            slug: targetSlug,
            files: list,
            remote,
        });
        if (!data.ok) {
            toast.error(`Upload : ${data.error}`);
            return;
        }
        if (mode.kind === 'new' && !uploadSlug) {
            setUploadYear(year);
            setUploadSlug(slug);
        }
        await loadImages(targetYear, targetSlug);
        toast.success(`${data.saved.length} image(s) uploadée(s).`);
        if (!fm.image && data.saved[0]) {
            setFm({ ...fm, image: data.saved[0].path });
            markDirty();
        }
    };

    /**
     * Téléverse des images dans le dossier de l'article et renvoie leurs chemins Markdown.
     *
     * @param files Fichiers choisis, déposés ou collés (les non-images sont ignorés).
     * @param is360 Photos 360° : conservées en pleine résolution, sans compression destructive.
     * @returns Les images enregistrées (vide en cas d'échec, déjà signalé par un toast).
     */
    const uploadToPostFolder = async (files: File[], is360: boolean): Promise<UploadedImage[]> => {
        const list = files.filter((f) => f.type.startsWith('image/'));
        if (list.length === 0) return [];
        if (!year || !slug) {
            toast.error("Choisis d'abord l'année et le slug pour pouvoir uploader.");
            return [];
        }
        const targetYear = uploadYear || year;
        const targetSlug = uploadSlug || slug;
        try {
            // POURQUOI : les photos 360° nécessitent une très haute définition (4K à 8K)
            // pour ne pas paraître pixellisées une fois projetées dans la sphère WebGL.
            const data = await uploadAdminImages<UploadedImage>({
                section: 'blog',
                year: targetYear,
                slug: targetSlug,
                files: list,
                is360,
                remote,
            });
            if (!data.ok) {
                toast.error(`Upload : ${data.error}`);
                return [];
            }
            if (mode.kind === 'new' && !uploadSlug) {
                setUploadYear(year);
                setUploadSlug(slug);
            }
            await loadImages(targetYear, targetSlug);
            toast.success(
                is360
                    ? `${data.saved.length} photo(s) 360° ajoutée(s) en pleine résolution.`
                    : `${data.saved.length} image(s) uploadée(s).`,
            );
            return data.saved;
        } catch (e) {
            toast.error(String((e as Error).message ?? e), { title: 'Échec upload' });
            return [];
        }
    };

    const upload360Files = async (files: FileList | File[]) => {
        const saved = await uploadToPostFolder(Array.from(files), true);
        for (const item of saved) {
            const caption = item.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            insertAtCursor(`![360:${caption}](${item.path})\n`);
        }
    };

    /** Insère un fragment Markdown au curseur de l'éditeur (ou en fin d'article s'il n'est pas affiché). */
    const insertAtCursor = (text: string) => {
        const richEditor = richEditorRef.current;
        if (richEditor) {
            richEditor.insertMarkdown(text);
        } else {
            setBody((b) => (b.trim() ? `${b.replace(/\s*$/, '')}\n\n${text}` : text));
            markDirty();
        }
        setTab('body');
    };

    const insertImageMarkdown = (img: ImageEntry, alt = '') => {
        insertAtCursor(`![${alt}](${img.path})\n`);
    };

    const insert360Markdown = (img: ImageEntry, alt = '') => {
        const caption = alt || img.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        insertAtCursor(`![360:${caption}](${img.path})\n`);
    };

    /**
     * Supprime toutes les occurrences d'une image dans le texte Markdown de l'article.
     *
     * POURQUOI : Permet à l'auteur de retirer en un clic une image insérée par erreur
     * ou présente en doublon dans le corps de l'article sans devoir chercher manuellement dans le texte.
     */
    const removeImageMarkdown = (img: ImageEntry) => {
        const escaped = img.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mdRegex = new RegExp(`!\\[[^\\]]*\\]\\([^)]*${escaped}[^)]*\\)\\n?`, 'g');
        const htmlRegex = new RegExp(`<img[^>]*${escaped}[^>]*>\\n?`, 'gi');
        const next = body
            .replace(mdRegex, '')
            .replace(htmlRegex, '')
            .replace(/\n{3,}/g, '\n\n');

        if (next === body) {
            toast.info(`Aucune occurrence de ${img.name} trouvée dans le texte.`);
            return;
        }

        setBody(next);
        markDirty();
        toast.success(`Image ${img.name} retirée de l'article.`);
    };

    /**
     * Fait défiler l'éditeur jusqu'à l'emplacement d'une image et la met en surbrillance.
     *
     * POURQUOI : Permet à l'auteur de retrouver instantanément dans un très long texte
     * le paragraphe exact où une photo est insérée simplement en cliquant dessus dans la galerie.
     */
    const scrollToImage = (img: ImageEntry) => {
        if (!body.includes(img.name) && !body.includes(img.path)) {
            toast.info(`L'image ${img.name} n'est pas encore insérée dans le texte.`);
            return;
        }
        setTab('body');
        // POURQUOI : l'éditeur peut être en cours de montage si l'onglet Texte vient d'être affiché.
        window.setTimeout(() => {
            const richEditor = richEditorRef.current;
            if (richEditor && !richEditor.scrollToImage(img.path)) richEditor.scrollToImage(img.name);
        }, 50);
    };

    const deleteImage = async (name: string) => {
        if (
            !(await confirm({
                title: `Supprimer ${name} ?`,
                message: 'Cette action est définitive.',
                tone: 'danger',
                confirmLabel: 'Supprimer',
            }))
        )
            return;
        const targetYear = uploadYear || year;
        const targetSlug = uploadSlug || slug;
        const res = await fetch(`/api/admin/images/${targetYear}/${targetSlug}/${encodeURIComponent(name)}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            toast.error('Échec suppression image.');
            return;
        }
        toast.success('Image supprimée.');
        await loadImages(targetYear, targetSlug);
    };

    /**
     * Définit l'image sélectionnée comme image de couverture du blog.
     * POURQUOI : Déclenche l'appel API PUT pour générer la miniature unique (-thumb.jpg)
     * et nettoyer les éventuelles anciennes miniatures du dossier.
     */
    const handleSetCover = async (img: { name: string; path: string }) => {
        const targetYear = uploadYear || year;
        const targetSlug = uploadSlug || slug;
        try {
            const res = await fetch(`/api/admin/images/${targetYear}/${targetSlug}/${encodeURIComponent(img.name)}`, {
                method: 'PUT',
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error ?? `HTTP ${res.status}`);
            }
            const data = await res.json();
            const newCoverPath = data.cover || img.path;
            const nextFm = { ...fm, image: newCoverPath };
            setFm(nextFm);
            markDirty();

            // POURQUOI : Sauvegarder immédiatement le frontmatter sur le disque
            // pour que la couverture soit active tout de suite sur le blog sans attendre un enregistrement manuel.
            if (mode.kind === 'edit' && targetYear && targetSlug) {
                const coverRes = await fetch(`/api/admin/posts/${targetYear}/${targetSlug}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        frontmatter: {
                            ...nextFm,
                            seoDescription: nextFm.seoDescription?.trim() ? nextFm.seoDescription : undefined,
                            showImage: nextFm.showImage === false ? false : undefined,
                            hideImageCaptions: nextFm.hideImageCaptions === true ? true : undefined,
                        },
                        body,
                        revision: revisionRef.current ?? undefined,
                    }),
                });
                const coverData = (await coverRes.json().catch(() => ({}))) as { revision?: string; message?: string };
                if (!coverRes.ok) throw new Error(coverData.message ?? `HTTP ${coverRes.status}`);
                if (coverData.revision) revisionRef.current = coverData.revision;
                setDirty(false);
            }

            toast.success('Image de couverture définie et enregistrée !');
            await loadImages(targetYear, targetSlug);
        } catch (e) {
            toast.error(String((e as Error).message ?? e), { title: 'Impossible de définir la couverture' });
        }
    };

    /**
     * Supprime les images du dossier non utilisées dans le markdown ni définies en couverture,
     * puis synchronise R2 pour appliquer la même purge côté distant.
     */
    const deleteUnusedImages = async () => {
        const unused = images.filter((img) => {
            const isAdded = body.includes(img.path) || body.includes(img.name) || fm.image === img.path;
            return !isAdded;
        });

        if (unused.length === 0) {
            toast.info('Toutes les images sont utilisées.');
            return;
        }

        const ok = await confirm({
            title: `Purger ${unused.length} image(s) inutilisée(s) ?`,
            message: (
                <div className="space-y-2">
                    <p>Suppression définitive en local + sur Cloudflare R2.</p>
                    <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5 font-mono text-[11px] text-mp-text-muted">
                        {unused.map((img) => (
                            <li key={img.name}>{img.name}</li>
                        ))}
                    </ul>
                </div>
            ),
            tone: 'danger',
            confirmLabel: 'Purger',
        });
        if (!ok) return;

        setSaving(true);
        try {
            const targetYear = uploadYear || year;
            const targetSlug = uploadSlug || slug;
            for (const img of unused) {
                const res = await fetch(
                    `/api/admin/images/${targetYear}/${targetSlug}/${encodeURIComponent(img.name)}`,
                    { method: 'DELETE' },
                );
                if (!res.ok) {
                    const err = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(`Erreur lors de la suppression de ${img.name} : ${err.error ?? res.status}`);
                }
            }
            await syncR2(targetYear, targetSlug);
            await loadImages(targetYear, targetSlug);
            toast.success(`${unused.length} image(s) supprimée(s).`);
        } catch (e) {
            toast.error((e as Error).message ?? String(e), { title: 'Échec purge' });
        } finally {
            setSaving(false);
        }
    };

    // POURQUOI : appelé après la déclaration de `syncR2`, que `save` utilise.
    useEditorShortcuts(() => void save(), { canSave: mode.kind !== 'idle' && !saving, dirty });

    const items: PostListItem[] = useMemo(
        () =>
            posts.map((p) => ({
                year: p.year,
                slug: p.slug,
                title: p.title || p.slug,
                subtitle: p.categories?.length ? p.categories.slice(0, 2).join(' · ') : undefined,
                thumb:
                    p.image && p.image.startsWith('/assets/blog/')
                        ? p.image.replace(/^\/assets\/blog\//, '/api/admin/images/')
                        : undefined,
            })),
        [posts],
    );

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
                        title="Articles"
                        emptyLabel="Aucun article."
                        onCollapse={() => handleToggleSidebar(true)}
                    />
                </EditorSidebar>
            )}

            <div className="flex w-full min-w-0 flex-1 flex-col gap-5 pb-24">
                {isIdle ? (
                    <BlogTableView posts={posts} onSelect={openExisting} onCreate={openNew} />
                ) : (
                    <>
                        <PageHeader
                            breadcrumb={[
                                { label: 'Admin', href: '/admin' },
                                { label: 'Blog', href: '/admin/blog' },
                                { label: mode.kind === 'edit' ? `${mode.year}/${mode.slug}` : 'Nouveau brouillon' },
                            ]}
                            title={fm.title || (mode.kind === 'new' ? 'Nouveau brouillon' : 'Sans titre')}
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
                                    ← Liste des articles
                                </button>
                            }
                            meta={
                                <>
                                    <button
                                        type="button"
                                        onClick={previewArticle}
                                        className="rounded-md border border-mp-accent/60 px-2.5 py-1 text-[11px] font-semibold text-mp-accent hover:bg-mp-accent/10"
                                        title="Rendu avec les plugins du site, sans enregistrer"
                                    >
                                        Aperçu réel ↗
                                    </button>
                                    {mode.kind === 'edit' && (
                                        <a
                                            href={`/blog/${mode.slug}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded-md border border-mp-glass-border px-2.5 py-1 text-[11px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent"
                                            title="Ouvrir l'article sur le site"
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
                                    { value: 'body', label: 'Texte' },
                                    { value: 'images', label: 'Galerie', count: images.length },
                                ]}
                            />
                            <button
                                type="button"
                                onClick={() => setSettingsOpen(true)}
                                className="relative rounded-md border border-mp-glass-border px-3 py-1.5 text-xs font-medium text-mp-text-secondary transition-all hover:border-mp-accent hover:text-mp-accent"
                                title={settingsWarning ?? 'Titre, slug, date, catégories, couverture, SEO'}
                            >
                                ⚙ Réglages
                                {settingsWarning && (
                                    <span
                                        className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-mp-accent"
                                        aria-label="Champs à compléter"
                                    />
                                )}
                            </button>
                            {tab === 'body' && (
                                <button
                                    type="button"
                                    onClick={() => setShowImageSidebar(!showImageSidebar)}
                                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                                        showImageSidebar
                                            ? 'border-mp-accent bg-mp-accent/15 text-mp-accent'
                                            : 'border-mp-glass-border text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent'
                                    }`}
                                >
                                    {showImageSidebar ? 'Masquer la galerie' : 'Afficher la galerie'}
                                </button>
                            )}
                        </div>

                        <SettingsDrawer
                            open={settingsOpen}
                            onClose={() => setSettingsOpen(false)}
                            warning={settingsWarning}
                        >
                            <FrontmatterPanel
                                fm={fm}
                                setFm={(next) => {
                                    setFm(next);
                                    markDirty();
                                }}
                                year={year}
                                setYear={(v) => {
                                    setYear(v);
                                    markDirty();
                                }}
                                slug={slug}
                                setSlug={(v, touched) => {
                                    setSlug(v);
                                    if (touched) setSlugTouched(true);
                                    markDirty();
                                }}
                                mode={mode}
                                allCategories={allCategories}
                            />
                        </SettingsDrawer>

                        {tab === 'body' && (
                            <div
                                className={`grid grid-cols-1 items-start gap-4 ${showImageSidebar ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}
                            >
                                <div className="flex min-w-0 flex-col gap-3">
                                    <input
                                        className="w-full border-0 bg-transparent px-1 font-serif text-h1-mobile text-mp-text-heading outline-hidden placeholder:text-mp-text-muted/50 md:text-h1-tablet lg:text-h1-desktop"
                                        value={fm.title}
                                        onChange={(e) => {
                                            setFm({ ...fm, title: e.target.value });
                                            markDirty();
                                        }}
                                        placeholder="Titre de l'article"
                                        aria-label="Titre de l'article"
                                    />
                                    <RichMarkdownEditor
                                        ref={richEditorRef}
                                        value={body}
                                        onChange={(next) => {
                                            setBody(next);
                                            markDirty();
                                        }}
                                        resolveImageSrc={resolveImageSrc}
                                        uploadImages={(files) => uploadToPostFolder(files, false)}
                                        uploadPhotoSpheres={(files) => uploadToPostFolder(files, true)}
                                        onSetCover={(src) => {
                                            const name = decodeURIComponent(src.split('/').pop() ?? '');
                                            const img = images.find((i) => i.path === src || i.name === name);
                                            if (img) void handleSetCover(img);
                                            else toast.error("Cette image n'est pas dans le dossier de l'article.");
                                        }}
                                    />
                                </div>

                                {showImageSidebar && (
                                    <ImageSidebar
                                        images={images}
                                        body={body}
                                        coverPath={fm.image}
                                        urlYear={uploadYear || year}
                                        urlSlug={uploadSlug || slug}
                                        onInsert={insertImageMarkdown}
                                        onInsert360={insert360Markdown}
                                        onRemoveFromMarkdown={removeImageMarkdown}
                                        onScrollToImage={scrollToImage}
                                        onUpload360={upload360Files}
                                        onSetCover={handleSetCover}
                                        onPurge={deleteUnusedImages}
                                        disabled={saving}
                                    />
                                )}
                            </div>
                        )}

                        {tab === 'images' && (
                            <div className="flex flex-col gap-4">
                                <DropZone
                                    onFiles={uploadFiles}
                                    label="Glisse-dépose des images ici"
                                    hint={
                                        <>
                                            Cible : src/assets/blog/{year || '<année>'}/{slug || '<slug>'}/
                                        </>
                                    }
                                />
                                {images.length > 0 && (
                                    <div className="rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-mp-glass-border pb-2">
                                            <h3 className="text-xs font-semibold text-mp-text-primary">
                                                Toutes les images ({images.length})
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <label className="cursor-pointer rounded-md border border-purple-500/50 bg-purple-600/20 px-3 py-1.5 text-[11px] font-semibold text-purple-300 transition-colors hover:bg-purple-600 hover:text-white">
                                                    <span>+ Ajouter photo 360° (pleine résolution)</span>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        multiple
                                                        className="hidden"
                                                        disabled={saving}
                                                        onChange={(e) => {
                                                            if (e.target.files && e.target.files.length > 0) {
                                                                upload360Files(e.target.files);
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                    />
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={deleteUnusedImages}
                                                    disabled={saving}
                                                    className="rounded-md border border-mp-astro-red/50 px-3 py-1.5 text-[11px] font-medium text-mp-astro-red hover:bg-mp-astro-red/10 disabled:opacity-50"
                                                >
                                                    Supprimer les inutilisées
                                                </button>
                                            </div>
                                        </div>
                                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                            {images.map((img) => {
                                                const isCover = Boolean(
                                                    fm.image &&
                                                    (fm.image === img.path ||
                                                        fm.image === img.name ||
                                                        fm.image.endsWith('/' + img.name)),
                                                );
                                                const isInBody = body.includes(img.path) || body.includes(img.name);
                                                const isUsed = isInBody || isCover;
                                                return (
                                                    <li
                                                        key={img.name}
                                                        className={`group relative overflow-hidden rounded-md border bg-mp-ui-black/30 transition-all ${
                                                            isCover
                                                                ? 'border-mp-accent/60 ring-2 ring-mp-accent/50'
                                                                : isUsed
                                                                  ? 'border-mp-glass-border'
                                                                  : 'border-mp-glass-border ring-1 ring-mp-astro-red/30'
                                                        }`}
                                                    >
                                                        {isCover && (
                                                            <span className="absolute top-1.5 left-1.5 z-10 rounded-sm bg-mp-accent/90 px-1.5 py-0.5 text-[9px] font-semibold text-mp-bg shadow-sm">
                                                                Couverture
                                                            </span>
                                                        )}
                                                        <div className="aspect-square w-full">
                                                            <img
                                                                src={`/api/admin/images/${uploadYear || year}/${uploadSlug || slug}/${encodeURIComponent(img.name)}`}
                                                                alt={img.name}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        </div>
                                                        <div className="space-y-1 p-2">
                                                            <div
                                                                className="truncate font-mono text-[10px] text-mp-text-secondary"
                                                                title={img.name}
                                                            >
                                                                {img.name}
                                                            </div>
                                                            <div className="flex flex-wrap gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => insertImageMarkdown(img)}
                                                                    className="flex-1 rounded-sm border border-mp-glass-border px-1.5 py-0.5 text-[10px] hover:border-mp-accent hover:text-mp-accent"
                                                                >
                                                                    Insérer
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeImageMarkdown(img)}
                                                                    disabled={!isInBody}
                                                                    className={`flex-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                                                                        isInBody
                                                                            ? 'border-mp-astro-red/40 bg-mp-astro-red/15 text-mp-astro-red hover:bg-mp-astro-red hover:text-white'
                                                                            : 'cursor-not-allowed border-mp-glass-border/30 text-mp-text-secondary/40'
                                                                    }`}
                                                                    title={
                                                                        isInBody
                                                                            ? 'Supprimer toutes les occurrences de cette image dans le texte'
                                                                            : "Cette image n'est pas présente dans le texte"
                                                                    }
                                                                >
                                                                    Supprimer
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSetCover(img)}
                                                                    className={`flex-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                                                                        isCover
                                                                            ? 'border-mp-accent bg-mp-accent/15 font-semibold text-mp-accent'
                                                                            : 'border-mp-glass-border hover:border-mp-accent hover:text-mp-accent'
                                                                    }`}
                                                                    title={
                                                                        isCover
                                                                            ? 'Image de couverture actuelle'
                                                                            : 'Définir comme image de couverture'
                                                                    }
                                                                >
                                                                    Couverture
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => deleteImage(img.name)}
                                                                    className="rounded-sm border border-mp-astro-red/40 px-1.5 py-0.5 text-[10px] text-mp-astro-red hover:bg-mp-astro-red/10"
                                                                    title="Supprimer définitivement le fichier"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                            {!isUsed && (
                                                                <div className="text-[10px] text-mp-astro-red/80">
                                                                    Non utilisée
                                                                </div>
                                                            )}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </div>
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
                                onClick={removePost}
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

function FrontmatterPanel({
    fm,
    setFm,
    year,
    setYear,
    slug,
    setSlug,
    mode,
    allCategories,
}: {
    fm: PostFrontmatter;
    setFm: (next: PostFrontmatter) => void;
    year: string;
    setYear: (v: string) => void;
    slug: string;
    setSlug: (v: string, touched: boolean) => void;
    mode: Mode;
    allCategories: string[];
}) {
    return (
        <section>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <Field className="sm:col-span-6" label="Titre">
                    <input
                        className="admin-input"
                        value={fm.title}
                        onChange={(e) => setFm({ ...fm, title: e.target.value })}
                    />
                </Field>
                <Field className="sm:col-span-2" label="Année">
                    <input
                        className="admin-input"
                        value={year}
                        disabled={mode.kind === 'edit'}
                        onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    />
                </Field>
                <Field className="sm:col-span-2" label="Slug">
                    <input
                        className="admin-input font-mono"
                        value={slug}
                        disabled={mode.kind === 'edit'}
                        onChange={(e) => setSlug(slugify(e.target.value), true)}
                    />
                </Field>
                <Field className="sm:col-span-2" label="Date">
                    <input
                        type="date"
                        className="admin-input"
                        value={fm.date}
                        onChange={(e) => setFm({ ...fm, date: e.target.value })}
                    />
                </Field>
                <Field className="sm:col-span-6" label="Description courte (= SEO)">
                    <textarea
                        rows={2}
                        className="admin-input"
                        value={fm.description}
                        onChange={(e) => {
                            const val = e.target.value;
                            setFm({ ...fm, description: val, seoDescription: val });
                        }}
                    />
                </Field>
                <Field className="sm:col-span-3" label="Image de couverture (chemin /assets/…)">
                    <input
                        className="admin-input font-mono"
                        value={fm.image}
                        onChange={(e) => setFm({ ...fm, image: e.target.value })}
                    />
                </Field>
                <Field className="sm:col-span-3" label="Affichage cover" hint="Inclure dans la page de l'article">
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-mp-glass-border bg-mp-ui-black/30 px-2.5 text-sm text-mp-text-primary transition-all select-none hover:border-mp-accent/50">
                        <input
                            type="checkbox"
                            checked={fm.showImage !== false}
                            onChange={(e) => setFm({ ...fm, showImage: e.target.checked })}
                        />
                        Afficher la cover
                    </label>
                </Field>
                <Field className="sm:col-span-3" label="Description photos" hint="Masquer les légendes sous les photos">
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-mp-glass-border bg-mp-ui-black/30 px-2.5 text-sm text-mp-text-primary transition-all select-none hover:border-mp-accent/50">
                        <input
                            type="checkbox"
                            checked={fm.hideImageCaptions === true}
                            onChange={(e) => setFm({ ...fm, hideImageCaptions: e.target.checked })}
                        />
                        Cacher descriptions
                    </label>
                </Field>
                <Field className="sm:col-span-3" label="État de publication" hint="Brouillon caché du site public">
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-mp-glass-border bg-mp-ui-black/30 px-2.5 text-sm text-mp-text-primary transition-all select-none hover:border-mp-accent/50">
                        <input
                            type="checkbox"
                            checked={fm.draft === true}
                            onChange={(e) => setFm({ ...fm, draft: e.target.checked })}
                        />
                        Brouillon
                    </label>
                </Field>
                <Field className="sm:col-span-6" label="Catégories">
                    <CategoriesEditor
                        value={fm.categories}
                        onChange={(cats) => setFm({ ...fm, categories: cats })}
                        suggestions={allCategories}
                    />
                </Field>
            </div>
        </section>
    );
}

function ImageSidebar({
    images,
    body,
    coverPath,
    urlYear,
    urlSlug,
    onInsert,
    onInsert360,
    onRemoveFromMarkdown,
    onScrollToImage,
    onUpload360,
    onSetCover,
    onPurge,
    disabled,
}: {
    images: ImageEntry[];
    body: string;
    coverPath: string;
    urlYear: string;
    urlSlug: string;
    onInsert: (img: ImageEntry) => void;
    onInsert360?: (img: ImageEntry) => void;
    onRemoveFromMarkdown?: (img: ImageEntry) => void;
    onScrollToImage?: (img: ImageEntry) => void;
    onUpload360?: (files: FileList | File[]) => void;
    onSetCover?: (img: ImageEntry) => void;
    onPurge: () => void;
    disabled: boolean;
}) {
    // Regroupement des images par jour
    const dayGroups = useMemo(() => {
        const map = new Map<string, ImageEntry[]>();
        for (const img of images) {
            const key = img.dayKey || 'sans-date';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(img);
        }
        return Array.from(map.entries()).map(([dayKey, dayImages]) => {
            let label = 'Sans date';
            if (dayKey !== 'sans-date' && /^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
                const [y, m, d] = dayKey.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d);
                const formatted = dateObj.toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                });
                label = formatted.charAt(0).toUpperCase() + formatted.slice(1);
            }
            return {
                dayKey,
                label,
                images: dayImages,
            };
        });
    }, [images]);

    // État d'ouverture/fermeture des accordéons de chaque jour (par défaut, tous repliés pour une vue synthétique)
    const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

    const toggleDay = (dayKey: string) => {
        setOpenDays((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }));
    };

    const expandAll = () => {
        const all: Record<string, boolean> = {};
        dayGroups.forEach((g) => {
            all[g.dayKey] = true;
        });
        setOpenDays(all);
    };
    const collapseAll = () => setOpenDays({});

    return (
        <aside className="sticky top-16 flex max-h-[calc(100vh-5rem)] flex-col gap-3 self-start rounded-lg border border-mp-glass-border bg-mp-glass-solid p-3 shadow-lg">
            <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-mp-glass-border pb-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-mp-text-primary">Galerie · {images.length}</span>
                    {onUpload360 && (
                        <label
                            className="cursor-pointer rounded-sm border border-purple-500/50 bg-purple-600/25 px-1.5 py-0.5 text-[10px] font-bold text-purple-300 shadow-xs transition-colors hover:bg-purple-600 hover:text-white"
                            title="Ajouter une photo 360° (conserve 100% de la résolution originale sans réduction)"
                        >
                            <span>+ 360°</span>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                disabled={disabled}
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        onUpload360(e.target.files);
                                        e.target.value = '';
                                    }
                                }}
                            />
                        </label>
                    )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                    {dayGroups.length > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={expandAll}
                                className="text-mp-accent hover:underline"
                                title="Tout déplier"
                            >
                                Déplier
                            </button>
                            <span className="text-mp-text-muted">·</span>
                            <button
                                type="button"
                                onClick={collapseAll}
                                className="text-mp-text-muted hover:text-mp-text-primary hover:underline"
                                title="Tout replier"
                            >
                                Replier
                            </button>
                        </>
                    )}
                    {images.length > 0 && (
                        <>
                            <span className="text-mp-text-muted">·</span>
                            <button
                                type="button"
                                onClick={onPurge}
                                disabled={disabled}
                                className="text-mp-astro-red hover:underline disabled:opacity-50"
                                title="Supprimer les images inutilisées"
                            >
                                Purger
                            </button>
                        </>
                    )}
                </div>
            </div>

            {images.length === 0 ? (
                <div className="py-6 text-center text-xs text-mp-text-muted">
                    Aucune image. Glisse ou colle directement dans l'éditeur pour l'ajouter.
                </div>
            ) : (
                <div className="flex scrollbar-thin min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
                    {dayGroups.map((group) => {
                        const isOpen = !!openDays[group.dayKey];
                        return (
                            <div
                                key={group.dayKey}
                                className="shrink-0 overflow-hidden rounded-md border border-mp-glass-border/70 bg-mp-bg/40"
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleDay(group.dayKey)}
                                    className="flex w-full items-center justify-between bg-mp-ui-black/80 px-3 py-2 text-left text-xs transition-colors hover:bg-mp-ui-black"
                                >
                                    <span className="flex items-center gap-2 truncate font-medium text-mp-text-primary">
                                        {isOpen ? (
                                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-mp-accent" />
                                        ) : (
                                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-mp-text-muted" />
                                        )}
                                        <span className="truncate">{group.label}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-mp-bg-secondary px-2 py-0.5 text-[10px] font-semibold text-mp-text-muted">
                                        {group.images.length}
                                    </span>
                                </button>

                                {isOpen && (
                                    <ul className="space-y-3 border-t border-mp-glass-border/40 bg-mp-ui-black/20 p-2.5">
                                        {group.images.map((img) => {
                                            const isCover = Boolean(
                                                coverPath &&
                                                (coverPath === img.path ||
                                                    coverPath === img.name ||
                                                    coverPath.endsWith('/' + img.name)),
                                            );
                                            const isInBody = body.includes(img.path) || body.includes(img.name);
                                            const isUsed = isInBody || isCover;
                                            return (
                                                <li
                                                    key={img.name}
                                                    className={`group flex flex-col rounded-lg border border-mp-glass-border bg-mp-ui-black/30 p-2 transition-all ${
                                                        isCover
                                                            ? 'ring-2 ring-mp-accent/60'
                                                            : isUsed
                                                              ? 'opacity-65 hover:opacity-100'
                                                              : ''
                                                    }`}
                                                >
                                                    {/* Image 2x plus haute, pleine largeur au-dessus du texte - Clicable pour faire défiler vers l'insertion */}
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => onScrollToImage?.(img)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                onScrollToImage?.(img);
                                                            }
                                                        }}
                                                        className={`relative h-32 w-full shrink-0 overflow-hidden rounded bg-mp-bg transition-all ${
                                                            isUsed
                                                                ? 'cursor-pointer hover:ring-2 hover:ring-mp-accent/70 hover:brightness-110'
                                                                : ''
                                                        }`}
                                                        title={
                                                            isUsed
                                                                ? "Cliquer pour faire défiler jusqu'à cette image dans le texte"
                                                                : img.name
                                                        }
                                                    >
                                                        <img
                                                            src={`/api/admin/images/${urlYear}/${urlSlug}/${encodeURIComponent(img.name)}`}
                                                            alt={img.name}
                                                            loading="lazy"
                                                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        />
                                                        <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1">
                                                            {img.is360 && (
                                                                <span className="flex items-center gap-0.5 rounded-sm bg-purple-600/95 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm backdrop-blur-xs">
                                                                    <span>🌐</span> 360°
                                                                </span>
                                                            )}
                                                            {isCover && (
                                                                <span className="rounded-sm bg-mp-accent px-1.5 py-0.5 text-[9px] font-bold text-mp-bg shadow-sm">
                                                                    ★ Couverture
                                                                </span>
                                                            )}
                                                        </div>
                                                        {img.timeStr && (
                                                            <span className="absolute top-1.5 right-1.5 rounded-sm bg-black/75 px-1.5 py-0.5 font-mono text-[9px] font-medium text-white shadow-sm backdrop-blur-xs">
                                                                {img.timeStr}
                                                            </span>
                                                        )}
                                                        {isUsed && !isCover && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onScrollToImage?.(img);
                                                                }}
                                                                className="absolute bottom-1.5 left-1.5 cursor-pointer rounded-sm bg-mp-bg-secondary/90 px-1.5 py-0.5 text-[9px] font-medium text-mp-text-secondary shadow-sm backdrop-blur-xs transition-colors hover:bg-mp-accent hover:text-mp-bg"
                                                                title="Cliquer pour faire défiler jusqu'à cette image dans le texte"
                                                            >
                                                                Insérée ↗
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Boutons d'action : Insérer / 360° / Supprimer du texte / Couverture */}
                                                    <div className="mt-2 flex w-full items-start justify-between gap-2">
                                                        <span
                                                            className="flex-1 font-mono text-[10px] leading-tight break-all text-mp-text-secondary"
                                                            title={img.name}
                                                        >
                                                            {img.name}
                                                        </span>
                                                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => onInsert(img)}
                                                                className="shrink-0 self-start rounded-sm bg-mp-accent/20 px-2 py-1 text-[10px] font-medium text-mp-accent transition-colors hover:bg-mp-accent hover:text-mp-bg"
                                                                title="Insérer comme image normale"
                                                            >
                                                                Insérer
                                                            </button>
                                                            {img.is360 && onInsert360 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onInsert360(img)}
                                                                    className="shrink-0 self-start rounded-sm border border-purple-500/50 bg-purple-600/30 px-2 py-1 text-[10px] font-bold text-purple-300 transition-colors hover:bg-purple-600 hover:text-white"
                                                                    title="Insérer comme lecteur interactif 360°"
                                                                >
                                                                    360°
                                                                </button>
                                                            )}
                                                            {onRemoveFromMarkdown && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onRemoveFromMarkdown(img)}
                                                                    disabled={!isInBody}
                                                                    className={`shrink-0 self-start rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                                                                        isInBody
                                                                            ? 'border-mp-astro-red/40 bg-mp-astro-red/15 text-mp-astro-red hover:bg-mp-astro-red hover:text-white'
                                                                            : 'cursor-not-allowed border-mp-glass-border/30 bg-mp-glass-solid/20 text-mp-text-secondary/40'
                                                                    }`}
                                                                    title={
                                                                        isInBody
                                                                            ? 'Supprimer toutes les occurrences de cette image dans le texte'
                                                                            : "Cette image n'est pas présente dans le texte"
                                                                    }
                                                                >
                                                                    Supprimer
                                                                </button>
                                                            )}
                                                            {onSetCover && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onSetCover(img)}
                                                                    className={`shrink-0 self-start rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                                                                        isCover
                                                                            ? 'bg-mp-accent font-bold text-mp-bg shadow-sm'
                                                                            : 'border border-mp-glass-border text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent'
                                                                    }`}
                                                                    title={
                                                                        isCover
                                                                            ? 'Image de couverture actuelle'
                                                                            : "Définir comme image de couverture de l'article"
                                                                    }
                                                                >
                                                                    {isCover ? '★ Couverture' : 'Couverture'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </aside>
    );
}

function CategoriesEditor({
    value,
    onChange,
    suggestions,
}: {
    value: string[];
    onChange: (next: string[]) => void;
    suggestions: string[];
}) {
    const [draft, setDraft] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isOpen, setIsOpen] = useState(false);

    const filtered = useMemo(() => {
        if (!draft.trim()) return [];
        const search = draft.toLowerCase();
        return suggestions.filter(
            (s) =>
                s.toLowerCase().includes(search) &&
                !value.some((existing) => existing.toLowerCase() === s.toLowerCase()),
        );
    }, [draft, suggestions, value]);

    useEffect(() => {
        setActiveIndex(-1);
        setIsOpen(draft.trim().length > 0);
    }, [draft]);

    const addCategory = (customValue?: string) => {
        const v = (customValue || draft).trim();
        if (!v || value.includes(v)) {
            setDraft('');
            return;
        }
        onChange([...value, v]);
        setDraft('');
    };

    const remove = (c: string) => onChange(value.filter((x) => x !== c));

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isOpen && activeIndex >= 0 && activeIndex < filtered.length) {
                addCategory(filtered[activeIndex]);
            } else {
                addCategory();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
            setActiveIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-mp-glass-border bg-mp-ui-black/40 p-2">
            {value.map((c) => (
                <button
                    key={c}
                    type="button"
                    onClick={() => remove(c)}
                    className="inline-flex items-center gap-1 rounded-full border border-mp-accent bg-mp-accent/15 px-2.5 py-0.5 text-xs text-mp-accent"
                    title="Cliquer pour retirer"
                >
                    {c} <span aria-hidden>×</span>
                </button>
            ))}
            <div className="relative min-w-[140px] flex-1">
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsOpen(draft.trim().length > 0)}
                    onBlur={() => setIsOpen(false)}
                    placeholder="Ajouter une catégorie…"
                    className="w-full rounded-md border border-transparent bg-transparent px-2.5 py-1 text-xs text-mp-text-primary placeholder:text-mp-text-muted focus:border-mp-accent/50 focus:outline-hidden"
                />
                {isOpen && filtered.length > 0 && (
                    <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-md border border-mp-glass-border bg-mp-bg-secondary/95 py-1 shadow-glow backdrop-blur-md">
                        {filtered.map((suggestion, index) => (
                            <button
                                key={suggestion}
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    addCategory(suggestion);
                                }}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={`w-full px-2.5 py-1 text-left text-xs transition-colors ${
                                    index === activeIndex
                                        ? 'bg-mp-accent/15 text-mp-accent'
                                        : 'text-mp-text-muted hover:bg-white/5 hover:text-mp-text-primary'
                                }`}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

interface BlogTableViewProps {
    posts: PostListEntry[];
    onSelect: (year: string, slug: string) => void;
    onCreate: () => void;
}

/**
 * Affiche la table de bord tabulaire complète pour gérer tous les articles de blog.
 *
 * POURQUOI : Remplace l'état d'attente (idle) par défaut par une interface riche, permettant
 * de rechercher, filtrer par catégorie et année, et de visualiser d'un coup d'œil l'état
 * de complétude de chaque article (images de couverture, dates de publication) en pleine largeur.
 *
 * OPTIONS & EXEMPLES :
 * - Option A : Laisser une simple liste de liens sans aucune recherche ni métadonnées. Très limité.
 * - Option B (retenue) : Rendu d'une table avec recherche plein texte, filtres par catégorie et année,
 *   et des indicateurs de complétude sous forme de badges or champagne.
 *   Exemple : Recherche 'Galaxie' filtrera instantanément les articles contenant ce mot dans le titre ou les catégories.
 *
 * @param props.posts - Liste des articles de blog chargés depuis l'API.
 * @param props.onSelect - Callback déclenché pour ouvrir un article existant en édition.
 * @param props.onCreate - Callback déclenché pour initialiser un nouveau brouillon d'article.
 * @returns Le composant React du tableau de bord d'administration du blog.
 */
function BlogTableView({ posts, onSelect, onCreate }: BlogTableViewProps) {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [yearFilter, setYearFilter] = useState('all');

    // POURQUOI : Extrait dynamiquement la liste triée de toutes les catégories existantes
    // pour alimenter le sélecteur de filtrage.
    const uniqueCategories = useMemo(() => {
        const set = new Set<string>();
        posts.forEach((p) => {
            if (Array.isArray(p.categories)) {
                p.categories.forEach((c) => {
                    if (c && c.trim()) set.add(c.trim());
                });
            }
        });
        return Array.from(set).sort();
    }, [posts]);

    // POURQUOI : Extrait dynamiquement la liste triée de toutes les années existantes.
    const uniqueYears = useMemo(() => {
        const set = new Set<string>();
        posts.forEach((p) => {
            if (p.year && /^\d{4}$/.test(p.year)) {
                set.add(p.year);
            }
        });
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [posts]);

    // Calculs de statistiques pour les cartes informatives
    const totalCount = posts.length;
    const yearsCount = uniqueYears.length;
    const categoriesCount = uniqueCategories.length;
    const postsWithCover = posts.filter((p) => p.image && p.image.trim().length > 0).length;

    // POURQUOI : Filtrage combiné en temps réel (recherche texte + année + catégorie)
    // pour offrir une réactivité parfaite (60 FPS) même avec des centaines d'entrées.
    const filteredPosts = posts.filter((p) => {
        const query = search.toLowerCase().trim();
        const matchesSearch =
            !query ||
            p.title.toLowerCase().includes(query) ||
            p.slug.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query) ||
            (p.categories && p.categories.some((c) => c.toLowerCase().includes(query)));

        if (!matchesSearch) return false;

        if (categoryFilter !== 'all' && (!p.categories || !p.categories.includes(categoryFilter))) {
            return false;
        }

        if (yearFilter !== 'all' && p.year !== yearFilter) {
            return false;
        }

        return true;
    });

    return (
        <div className="flex w-full flex-col gap-6 pb-12">
            {/* Titre et Action Primaire */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-mp-glass-border/40 pb-5">
                <div>
                    <h1 className="font-serif text-2xl font-bold text-mp-text-heading">Gestion des Articles de Blog</h1>
                    <p className="mt-1 text-xs text-mp-text-muted">
                        Pilotez vos publications, modifiez les articles de blog et suivez l'illustration et la
                        catégorisation du contenu.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onCreate}
                    className="flex items-center gap-1.5 rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black shadow-md shadow-mp-accent/10 hover:opacity-90"
                >
                    <Plus className="h-4 w-4 text-mp-ui-black" />
                    <span>Nouveau brouillon</span>
                </button>
            </div>

            {/* Cartes de Statistiques */}
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Total Articles" value={totalCount} icon={FileText} />
                <StatCard label="Années uniques" value={yearsCount} icon={Calendar} accentColor="emerald" />
                <StatCard label="Catégories distinctes" value={categoriesCount} icon={BookOpen} accentColor="emerald" />
                <StatCard
                    label="Articles illustrés"
                    value={postsWithCover}
                    total={totalCount}
                    icon={Image}
                    showProgress
                />
            </section>

            {/* Filtres & Recherche */}
            <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-mp-glass-border bg-mp-glass-solid/20 p-3.5 sm:flex-row sm:items-center">
                <div className="relative max-w-lg flex-1">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-mp-text-muted" />
                    <input
                        type="text"
                        placeholder="Rechercher par titre, description, catégorie, slug..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="admin-input w-full border-mp-glass-border bg-mp-ui-black/40 pl-9 text-xs focus:border-mp-accent"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 shrink-0 text-mp-text-muted" />
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="admin-input min-w-[150px] border-mp-glass-border bg-mp-ui-black/40 text-xs"
                        >
                            <option value="all">Toutes les catégories ({categoriesCount})</option>
                            {uniqueCategories.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={yearFilter}
                            onChange={(e) => setYearFilter(e.target.value)}
                            className="admin-input min-w-[120px] border-mp-glass-border bg-mp-ui-black/40 text-xs"
                        >
                            <option value="all">Toutes les années ({yearsCount})</option>
                            {uniqueYears.map((y) => (
                                <option key={y} value={y}>
                                    {y}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Tableau Principal */}
            <section className="overflow-hidden rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 shadow-lg">
                <header className="flex items-center justify-between border-b border-mp-glass-border bg-mp-glass-solid/60 px-4 py-3">
                    <h2 className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-mp-text-secondary uppercase">
                        <span>Catalogue d'Articles</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-mp-text-muted" />
                        <span className="text-mp-accent">
                            {filteredPosts.length} / {posts.length} articles
                        </span>
                    </h2>
                </header>
                <div className="scrollbar-thin overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead className="bg-mp-glass-solid/20 text-[10px] tracking-wider text-mp-text-muted uppercase">
                            <tr className="border-b border-mp-glass-border">
                                <th className="w-[64px] px-4 py-3 text-center">Aperçu</th>
                                <th className="px-4 py-3">Titre</th>
                                <th className="w-[100px] px-4 py-3">Date</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3">Catégories</th>
                                <th className="w-[64px] px-3 py-3 text-center">Cover</th>
                                <th className="w-[120px] px-4 py-3 pr-6 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-mp-glass-border/40">
                            {filteredPosts.map((p) => {
                                const thumbSrc =
                                    p.image && p.image.startsWith('/assets/blog/')
                                        ? p.image.replace(/^\/assets\/blog\//, '/api/admin/images/')
                                        : undefined;
                                const hasCover = p.image && p.image.trim().length > 0;

                                return (
                                    <tr key={`${p.year}/${p.slug}`} className="transition-colors hover:bg-mp-accent/5">
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
                                                onClick={() => onSelect(p.year, p.slug)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        onSelect(p.year, p.slug);
                                                    }
                                                }}
                                            >
                                                <span>{p.title}</span>
                                                {p.draft && (
                                                    <span className="inline-flex shrink-0 items-center rounded-full border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-medium text-yellow-500">
                                                        Brouillon
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 font-mono text-[10px] text-mp-text-muted">
                                                {p.year} / {p.slug}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono whitespace-nowrap text-mp-text-muted">
                                            {p.date}
                                        </td>
                                        <td
                                            className="max-w-sm truncate px-4 py-3 text-mp-text-secondary"
                                            title={p.description}
                                        >
                                            {p.description}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {p.categories && p.categories.length > 0 ? (
                                                    p.categories.map((c) => (
                                                        <span
                                                            key={c}
                                                            className="inline-flex items-center rounded-full border border-mp-accent/25 bg-mp-accent/10 px-2 py-0.5 text-[10px] font-medium text-mp-accent"
                                                        >
                                                            {c}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-[10px] text-mp-text-muted italic">
                                                        Aucune
                                                    </span>
                                                )}
                                            </div>
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
                                                    onClick={() => onSelect(p.year, p.slug)}
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
                            {filteredPosts.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-xs text-mp-text-muted">
                                        <AlertCircle className="mx-auto mb-2.5 h-8 w-8 text-mp-text-muted/60" />
                                        Aucun article ne correspond aux critères de recherche ou de filtrage.
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
