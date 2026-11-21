/**
 * Éditeur WYSIWYG des articles (blog et voyages), bâti sur Tiptap, dont la valeur reste du Markdown.
 *
 * - Zone d'écriture mise en forme comme la page publique (`prose`), titres et listes en place.
 * - Barre d'outils fixe, bulle de mise en forme sur la sélection, menu « / » et bouton « + ».
 * - Blocs d'images (figure, galerie, 360°) et blocs HTML éditables en place (voir les NodeViews).
 * - Glisser-déposer et coller de fichiers : téléversement puis insertion à l'endroit visé.
 * - Bascule vers le Markdown source, pour les cas que l'éditeur visuel ne couvre pas.
 *
 * La conversion passe par `markdown-bridge.ts`, qui réécrit à l'identique les blocs non modifiés.
 */
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import { Placeholder } from '@tiptap/extensions';
import type { JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import {
    Bold,
    Code,
    Film,
    Heading2,
    Heading3,
    Image as ImageIcon,
    Italic,
    Link as LinkIcon,
    List,
    ListOrdered,
    Minus,
    Plus,
    Quote,
    Redo2,
    Strikethrough,
    Undo2,
} from 'lucide-react';
import { getContentExtensions } from './extensions';
import ImageGroupView from './ImageGroupView';
import RawBlockView from './RawBlockView';
import YoutubeDialog from './YoutubeDialog';
import {
    buildYoutubeEmbed,
    filterInsertCommands,
    runBlockCommand,
    type InsertCommand,
    type InsertCommandId,
} from './insertCommands';
import {
    createMarkdownBridge,
    parseMarkdownBody,
    parseMarkdownFragment,
    serializeMarkdownBody,
    type BlockSources,
} from './markdown-bridge';
import { ImageGroupNode, PHOTO_SPHERE_ALT_PREFIX, RawHtmlNode, RawMarkdownNode, type ImageGroupItem } from './nodes';
import type { RichEditorImageOptions, UploadedImage } from './richEditorOptions';

export interface RichMarkdownEditorHandle {
    /** Insère un fragment Markdown au curseur (ou l'ajoute à la galerie sélectionnée). */
    insertMarkdown: (markdown: string) => void;
    /** Fait défiler jusqu'à la première occurrence d'une image ; `false` si elle est absente. */
    scrollToImage: (pathOrName: string) => boolean;
}

export interface RichMarkdownEditorProps extends RichEditorImageOptions {
    /** Corps Markdown de l'article (sans frontmatter). */
    value: string;
    /** Appelé avec le nouveau Markdown à chaque modification. */
    onChange: (markdown: string) => void;
    /** Téléverse des photos 360° en pleine résolution (sinon `uploadImages` est utilisé). */
    uploadPhotoSpheres?: (files: File[]) => Promise<UploadedImage[]>;
    placeholder?: string;
    /** Contenu affiché à droite de la barre d'outils (ex. bouton de galerie). */
    toolbarExtra?: ReactNode;
}

type EditorMode = 'visual' | 'markdown';

interface SlashState {
    query: string;
    /** Commande surlignée dans le menu. */
    index: number;
    from: number;
    to: number;
    left: number;
    top: number;
}

function imageGroupFromUploads(saved: UploadedImage[], isSphere: boolean): JSONContent {
    const items: ImageGroupItem[] = saved.map((image, index) => ({
        src: image.path,
        alt: isSphere ? `${PHOTO_SPHERE_ALT_PREFIX}${image.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')}` : '',
        title: null,
        raw: '',
        trailing: index === saved.length - 1 ? '' : '\n',
    }));
    return { type: 'imageGroup', attrs: { items } };
}

/**
 * Laisse aux champs et boutons des blocs (légende, alt, source HTML) leurs propres événements.
 *
 * POURQUOI : sinon ProseMirror traite le clic comme une sélection du bloc ; si la saisie modifie
 * le document entre `mousedown` et `mouseup`, il lève « Selection passed to setSelection must
 * point at the current document ».
 */
function isEventFromControl({ event }: { event: Event }): boolean {
    const target = event.target as HTMLElement | null;
    return !!target?.closest?.('input, textarea, select, button, label');
}

/** Compare deux corps Markdown sans tenir compte des sauts de ligne de début et des blancs de fin. */
function isSameBody(a: string, b: string | null): boolean {
    if (b === null) return false;
    const normalize = (text: string) => text.replace(/^\n+/, '').replace(/\s+$/, '');
    return normalize(a) === normalize(b);
}

function findSlashState(editor: Editor): Omit<SlashState, 'index'> | null {
    const { selection } = editor.state;
    const { $from, empty } = selection;
    if (!empty || $from.parent.type.name !== 'paragraph') return null;
    const text = $from.parent.textContent;
    if ($from.parentOffset !== text.length) return null;
    const match = /^\/([\p{L}\d ]{0,24})$/u.exec(text);
    if (!match) return null;
    const coords = editor.view.coordsAtPos($from.pos);
    return { query: match[1], from: $from.start(), to: $from.end(), left: coords.left, top: coords.bottom };
}

const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
    function RichMarkdownEditor(props, ref) {
        const { value, onChange, placeholder, toolbarExtra } = props;
        const bridge = useMemo(() => createMarkdownBridge(), []);
        const [mode, setMode] = useState<EditorMode>('visual');
        const [slash, setSlash] = useState<SlashState | null>(null);
        const [isUploading, setIsUploading] = useState(false);
        const [linkDraft, setLinkDraft] = useState<string | null>(null);
        const [isYoutubeDialogOpen, setIsYoutubeDialogOpen] = useState(false);

        // POURQUOI : Tiptap fige ses extensions à la création ; les callbacks du parent changent
        // (année/slug, état), on les lit donc via une référence toujours à jour.
        const propsRef = useRef(props);
        useLayoutEffect(() => {
            propsRef.current = props;
        });
        // POURQUOI : `useEditor` relit ses options à chaque rendu ; le document initial n'est calculé qu'une fois.
        const [initialParse] = useState(() => parseMarkdownBody(bridge, value));
        const sourcesRef = useRef<BlockSources>(initialParse.sources);
        const lastEmittedRef = useRef<string | null>(value);
        const slashRef = useRef<{ state: SlashState | null; items: InsertCommand[] }>({ state: null, items: [] });
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);
        const sphereInputRef = useRef<HTMLInputElement>(null);
        const runCommandRef = useRef<(id: InsertCommandId) => void>(() => {});

        const imageOptions = useMemo<RichEditorImageOptions>(
            () => ({
                resolveImageSrc: (src) => propsRef.current.resolveImageSrc?.(src) ?? src,
                uploadImages: async (files) => (await uploadWith(propsRef.current.uploadImages, files)) ?? [],
                onSetCover: (src) => propsRef.current.onSetCover?.(src),
            }),
            [],
        );

        async function uploadWith(
            uploader: ((files: File[]) => Promise<UploadedImage[]>) | undefined,
            files: File[],
        ): Promise<UploadedImage[] | null> {
            const images = files.filter((f) => f.type.startsWith('image/'));
            if (!uploader || images.length === 0) return null;
            setIsUploading(true);
            try {
                return await uploader(images);
            } finally {
                setIsUploading(false);
            }
        }

        const extensions = useMemo(
            () => [
                ...getContentExtensions().map((extension) => {
                    if (extension.name === ImageGroupNode.name) {
                        return ImageGroupNode.extend({
                            addOptions: () => imageOptions,
                            addNodeView: () => ReactNodeViewRenderer(ImageGroupView, { stopEvent: isEventFromControl }),
                        });
                    }
                    if (extension.name === RawHtmlNode.name) {
                        return RawHtmlNode.extend({
                            addNodeView: () => ReactNodeViewRenderer(RawBlockView, { stopEvent: isEventFromControl }),
                        });
                    }
                    if (extension.name === RawMarkdownNode.name) {
                        return RawMarkdownNode.extend({
                            addNodeView: () => ReactNodeViewRenderer(RawBlockView, { stopEvent: isEventFromControl }),
                        });
                    }
                    return extension;
                }),
                Placeholder.configure({
                    placeholder: ({ editor: ed, node }) =>
                        node.type.name === 'paragraph'
                            ? ed.isEmpty
                                ? (placeholder ??
                                  'Écris ton récit… Tape « / » pour insérer une image, un titre, une vidéo…')
                                : 'Tape « / » pour insérer un bloc'
                            : 'Titre',
                }),
            ],
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [imageOptions],
        );

        const insertUploads = useCallback((editor: Editor, saved: UploadedImage[], isSphere: boolean, at?: number) => {
            if (saved.length === 0) return;
            const node = imageGroupFromUploads(saved, isSphere);
            const chain = editor.chain().focus();
            if (typeof at === 'number') chain.insertContentAt(at, node).run();
            else chain.insertContent(node).run();
        }, []);

        /** Met à jour le menu « / » en gardant la commande surlignée tant que la saisie ne change pas. */
        function updateSlash(next: Omit<SlashState, 'index'> | null) {
            setSlash((prev) => {
                if (!next) return null;
                const index = prev && prev.query === next.query ? prev.index : 0;
                if (
                    prev &&
                    prev.index === index &&
                    prev.query === next.query &&
                    prev.from === next.from &&
                    prev.left === next.left &&
                    prev.top === next.top
                ) {
                    return prev;
                }
                return { ...next, index };
            });
        }

        const editor = useEditor({
            extensions,
            immediatelyRender: false,
            content: initialParse.doc,
            editorProps: {
                attributes: {
                    class: 'rich-editor prose prose-lg prose-slate mx-auto max-w-3xl min-h-[60vh] px-6 py-8 outline-hidden focus-visible:ring-0 prose-headings:text-mp-text-heading prose-p:text-mp-text-body prose-strong:text-mp-text-heading',
                    spellcheck: 'true',
                    lang: 'fr',
                },
                handleKeyDown: (_view, event) => {
                    const current = slashRef.current;
                    if (!current.state || current.items.length === 0) return false;
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        const delta = event.key === 'ArrowDown' ? 1 : -1;
                        const count = current.items.length;
                        setSlash((prev) => (prev ? { ...prev, index: (prev.index + delta + count) % count } : prev));
                        return true;
                    }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                        runCommandRef.current(
                            current.items[Math.min(current.state.index, current.items.length - 1)].id,
                        );
                        return true;
                    }
                    if (event.key === 'Escape') {
                        setSlash(null);
                        return true;
                    }
                    return false;
                },
                handleDrop: (view, event, _slice, moved) => {
                    const files = Array.from(event.dataTransfer?.files ?? []);
                    if (moved || files.length === 0) return false;
                    event.preventDefault();
                    const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
                    void uploadWith(propsRef.current.uploadImages, files).then((saved) => {
                        if (saved && editorRef.current) insertUploads(editorRef.current, saved, false, at);
                    });
                    return true;
                },
                handlePaste: (_view, event) => {
                    const files = Array.from(event.clipboardData?.files ?? []);
                    if (files.length > 0) {
                        event.preventDefault();
                        void uploadWith(propsRef.current.uploadImages, files).then((saved) => {
                            if (saved && editorRef.current) insertUploads(editorRef.current, saved, false);
                        });
                        return true;
                    }
                    const text = event.clipboardData?.getData('text/plain') ?? '';
                    const html = event.clipboardData?.getData('text/html') ?? '';
                    // POURQUOI : du Markdown collé (depuis un fichier .md ou le mode source) doit garder sa structure.
                    if (!html && /(^|\n)(#{1,4} |!\[|[-*] |> |\d+\. )/.test(text) && editorRef.current) {
                        editorRef.current.chain().focus().insertContent(parseMarkdownFragment(bridge, text)).run();
                        return true;
                    }
                    return false;
                },
            },
            onUpdate: ({ editor: ed }) => {
                const markdown = serializeMarkdownBody(bridge, ed.getJSON(), sourcesRef.current);
                // POURQUOI : certaines transactions (normalisation du schéma, nœud final ajouté par Tiptap)
                // ne changent pas le Markdown ; elles ne doivent pas marquer l'article comme modifié.
                if (isSameBody(markdown, lastEmittedRef.current)) return;
                lastEmittedRef.current = markdown;
                propsRef.current.onChange(markdown);
            },
            onSelectionUpdate: ({ editor: ed }) => updateSlash(findSlashState(ed)),
            onTransaction: ({ editor: ed }) => updateSlash(findSlashState(ed)),
        });

        const editorRef = useRef<Editor | null>(null);
        useLayoutEffect(() => {
            editorRef.current = editor;
        }, [editor]);

        // Synchronise l'éditeur quand la valeur change de l'extérieur (ouverture d'un autre article, mode source…).
        useEffect(() => {
            if (!editor || value === lastEmittedRef.current) return;
            const parsed = parseMarkdownBody(bridge, value);
            sourcesRef.current = parsed.sources;
            lastEmittedRef.current = value;
            editor.commands.setContent(parsed.doc, { emitUpdate: false });
        }, [editor, value, bridge]);

        const slashQuery = slash?.query ?? null;
        const slashItems = useMemo(() => (slashQuery === null ? [] : filterInsertCommands(slashQuery)), [slashQuery]);
        const activeSlashIndex = slash ? Math.min(slash.index, Math.max(slashItems.length - 1, 0)) : 0;
        useLayoutEffect(() => {
            slashRef.current = { state: slash, items: slashItems };
        }, [slash, slashItems]);

        const runCommand = useCallback(
            (id: InsertCommandId) => {
                if (!editor) return;
                const current = slashRef.current.state;
                if (current) {
                    editor.chain().focus().deleteRange({ from: current.from, to: current.to }).run();
                    setSlash(null);
                }
                if (runBlockCommand(editor, id)) return;
                if (id === 'images') fileInputRef.current?.click();
                if (id === 'photoSphere') sphereInputRef.current?.click();
                if (id === 'youtube') setIsYoutubeDialogOpen(true);
            },
            [editor],
        );
        useLayoutEffect(() => {
            runCommandRef.current = runCommand;
        }, [runCommand]);

        useImperativeHandle(
            ref,
            () => ({
                insertMarkdown: (markdown: string) => {
                    if (mode === 'markdown') {
                        const ta = textareaRef.current;
                        const start = ta?.selectionStart ?? value.length;
                        const end = ta?.selectionEnd ?? value.length;
                        onChange(value.slice(0, start) + markdown + value.slice(end));
                        return;
                    }
                    if (!editor) return;
                    const nodes = parseMarkdownFragment(bridge, markdown);
                    const { selection } = editor.state;
                    // POURQUOI : avec une galerie sélectionnée, « Insérer » ajoute l'image à cette galerie.
                    if (
                        selection instanceof NodeSelection &&
                        selection.node.type.name === 'imageGroup' &&
                        nodes.length === 1 &&
                        nodes[0].type === 'imageGroup'
                    ) {
                        const current = selection.node.attrs.items as ImageGroupItem[];
                        const added = nodes[0].attrs?.items as ImageGroupItem[];
                        editor
                            .chain()
                            .focus()
                            .command(({ tr }) => {
                                tr.setNodeMarkup(selection.from, undefined, { items: [...current, ...added] });
                                return true;
                            })
                            .run();
                        return;
                    }
                    editor.chain().focus().insertContent(nodes).run();
                },
                scrollToImage: (pathOrName: string) => {
                    if (mode === 'markdown') {
                        const ta = textareaRef.current;
                        const index = value.indexOf(pathOrName);
                        if (!ta || index === -1) return false;
                        const lineStart = value.lastIndexOf('\n', index) + 1;
                        const lineEnd = value.indexOf('\n', index);
                        ta.focus();
                        ta.setSelectionRange(lineStart, lineEnd === -1 ? value.length : lineEnd);
                        return true;
                    }
                    const root = editor?.view.dom;
                    if (!root) return false;
                    const target = Array.from(root.querySelectorAll<HTMLElement>('[data-image-src]')).find((el) => {
                        const src = el.dataset.imageSrc ?? '';
                        return (
                            src === pathOrName ||
                            src.endsWith(`/${pathOrName}`) ||
                            decodeURIComponent(src).endsWith(`/${pathOrName}`)
                        );
                    });
                    if (!target) return false;
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('ring-4', 'ring-mp-accent');
                    window.setTimeout(() => target.classList.remove('ring-4', 'ring-mp-accent'), 2200);
                    return true;
                },
            }),
            [editor, mode, value, onChange, bridge],
        );

        const handleFiles = async (files: FileList | null, isSphere: boolean) => {
            if (!files || !editor) return;
            const uploader = isSphere
                ? (propsRef.current.uploadPhotoSpheres ?? propsRef.current.uploadImages)
                : propsRef.current.uploadImages;
            const saved = await uploadWith(uploader, Array.from(files));
            if (saved) insertUploads(editor, saved, isSphere);
        };

        return (
            <div className="relative rounded-lg border border-mp-glass-border bg-mp-glass-solid">
                <EditorToolbar
                    editor={editor}
                    mode={mode}
                    onModeChange={setMode}
                    onCommand={runCommand}
                    onLink={() => setLinkDraft(editor?.getAttributes('link').href ?? '')}
                    extra={toolbarExtra}
                />

                {mode === 'markdown' ? (
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        spellCheck={false}
                        aria-label="Markdown source de l'article"
                        className="min-h-[70vh] w-full resize-y border-0 bg-transparent p-5 font-mono text-sm leading-relaxed text-mp-text-primary outline-hidden"
                    />
                ) : (
                    <>
                        <EditorContent editor={editor} />
                        {editor && (
                            <BubbleMenu
                                editor={editor}
                                shouldShow={({ editor: ed, state }) =>
                                    !state.selection.empty &&
                                    !(state.selection instanceof NodeSelection) &&
                                    ed.isEditable
                                }
                                className="flex items-center gap-0.5 rounded-lg border border-mp-glass-border bg-mp-bg-secondary p-1 shadow-lg"
                            >
                                {linkDraft === null ? (
                                    <InlineFormatButtons
                                        editor={editor}
                                        onLink={() => setLinkDraft(editor.getAttributes('link').href ?? '')}
                                    />
                                ) : (
                                    <LinkEditor
                                        initial={linkDraft}
                                        onCancel={() => setLinkDraft(null)}
                                        onApply={(href) => {
                                            const chain = editor.chain().focus().extendMarkRange('link');
                                            if (href) chain.setLink({ href }).run();
                                            else chain.unsetLink().run();
                                            setLinkDraft(null);
                                        }}
                                    />
                                )}
                            </BubbleMenu>
                        )}
                        {editor && (
                            <FloatingMenu
                                editor={editor}
                                shouldShow={({ state }) => {
                                    const { $from, empty } = state.selection;
                                    return (
                                        empty &&
                                        $from.parent.type.name === 'paragraph' &&
                                        $from.parent.content.size === 0
                                    );
                                }}
                                options={{ placement: 'left' }}
                            >
                                <button
                                    type="button"
                                    onClick={() => editor.chain().focus().insertContent('/').run()}
                                    className="mr-2 flex h-7 w-7 items-center justify-center rounded-full border border-mp-glass-border bg-mp-bg-secondary text-mp-text-muted hover:border-mp-accent hover:text-mp-accent"
                                    title="Insérer un bloc"
                                    aria-label="Insérer un bloc"
                                >
                                    <Plus size={15} />
                                </button>
                            </FloatingMenu>
                        )}
                        {slash && slashItems.length > 0 && (
                            <SlashMenu
                                state={slash}
                                items={slashItems}
                                activeIndex={activeSlashIndex}
                                onHover={(index) => setSlash((prev) => (prev ? { ...prev, index } : prev))}
                                onSelect={runCommand}
                            />
                        )}
                    </>
                )}

                {isUploading && (
                    <div className="sticky bottom-0 flex items-center gap-2 border-t border-mp-glass-border bg-mp-bg-secondary/90 px-4 py-2 text-xs text-mp-accent">
                        <span className="inline-block h-2 w-2 animate-ping rounded-full bg-mp-accent" />
                        Téléversement en cours…
                    </div>
                )}

                {isYoutubeDialogOpen && (
                    <YoutubeDialog
                        onCancel={() => {
                            setIsYoutubeDialogOpen(false);
                            editor?.commands.focus();
                        }}
                        onInsert={(videoId, title) => {
                            setIsYoutubeDialogOpen(false);
                            editor
                                ?.chain()
                                .focus()
                                .insertContent({ type: 'rawHtml', attrs: { html: buildYoutubeEmbed(videoId, title) } })
                                .run();
                        }}
                    />
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                        void handleFiles(e.target.files, false);
                        e.target.value = '';
                    }}
                />
                <input
                    ref={sphereInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                        void handleFiles(e.target.files, true);
                        e.target.value = '';
                    }}
                />
            </div>
        );
    },
);

export default RichMarkdownEditor;

function ToolbarButton({
    label,
    onClick,
    isActive = false,
    disabled = false,
    children,
}: {
    label: string;
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className={`flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-mp-text-secondary transition-colors disabled:opacity-30 ${
                isActive ? 'bg-mp-accent/20 text-mp-accent' : 'hover:bg-mp-glass-hover hover:text-mp-text-primary'
            }`}
        >
            {children}
        </button>
    );
}

function Separator() {
    return <span className="mx-1 h-5 w-px bg-mp-glass-border" aria-hidden />;
}

function useActiveMarks(editor: Editor | null) {
    return useEditorState({
        editor,
        selector: ({ editor: ed }) =>
            ed
                ? {
                      bold: ed.isActive('bold'),
                      italic: ed.isActive('italic'),
                      strike: ed.isActive('strike'),
                      link: ed.isActive('link'),
                      h2: ed.isActive('heading', { level: 2 }),
                      h3: ed.isActive('heading', { level: 3 }),
                      bulletList: ed.isActive('bulletList'),
                      orderedList: ed.isActive('orderedList'),
                      blockquote: ed.isActive('blockquote'),
                      canUndo: ed.can().undo(),
                      canRedo: ed.can().redo(),
                  }
                : null,
    });
}

function InlineFormatButtons({ editor, onLink }: { editor: Editor; onLink: () => void }) {
    const active = useActiveMarks(editor);
    return (
        <>
            <ToolbarButton
                label="Gras (Ctrl+B)"
                isActive={active?.bold}
                onClick={() => editor.chain().focus().toggleBold().run()}
            >
                <Bold size={15} />
            </ToolbarButton>
            <ToolbarButton
                label="Italique (Ctrl+I)"
                isActive={active?.italic}
                onClick={() => editor.chain().focus().toggleItalic().run()}
            >
                <Italic size={15} />
            </ToolbarButton>
            <ToolbarButton
                label="Barré"
                isActive={active?.strike}
                onClick={() => editor.chain().focus().toggleStrike().run()}
            >
                <Strikethrough size={15} />
            </ToolbarButton>
            <ToolbarButton label="Lien (Ctrl+K)" isActive={active?.link} onClick={onLink}>
                <LinkIcon size={15} />
            </ToolbarButton>
            <Separator />
            <ToolbarButton
                label="Titre de section"
                isActive={active?.h2}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
                <Heading2 size={15} />
            </ToolbarButton>
            <ToolbarButton
                label="Sous-titre"
                isActive={active?.h3}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
                <Heading3 size={15} />
            </ToolbarButton>
            <ToolbarButton
                label="Citation"
                isActive={active?.blockquote}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
                <Quote size={15} />
            </ToolbarButton>
        </>
    );
}

function EditorToolbar({
    editor,
    mode,
    onModeChange,
    onCommand,
    onLink,
    extra,
}: {
    editor: Editor | null;
    mode: EditorMode;
    onModeChange: (mode: EditorMode) => void;
    onCommand: (id: InsertCommandId) => void;
    onLink: () => void;
    extra?: ReactNode;
}) {
    const active = useActiveMarks(editor);
    const isVisual = mode === 'visual' && !!editor;
    return (
        <div
            className="sticky top-header-offset z-20 flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-mp-glass-border bg-mp-bg-secondary/95 px-2 py-1.5 backdrop-blur-sm"
            role="toolbar"
            aria-label="Mise en forme"
        >
            {isVisual && editor && (
                <>
                    <ToolbarButton
                        label="Annuler (Ctrl+Z)"
                        disabled={!active?.canUndo}
                        onClick={() => editor.chain().focus().undo().run()}
                    >
                        <Undo2 size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Rétablir (Ctrl+Maj+Z)"
                        disabled={!active?.canRedo}
                        onClick={() => editor.chain().focus().redo().run()}
                    >
                        <Redo2 size={15} />
                    </ToolbarButton>
                    <Separator />
                    <InlineFormatButtons editor={editor} onLink={onLink} />
                    <ToolbarButton
                        label="Liste à puces"
                        isActive={active?.bulletList}
                        onClick={() => onCommand('bulletList')}
                    >
                        <List size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Liste numérotée"
                        isActive={active?.orderedList}
                        onClick={() => onCommand('orderedList')}
                    >
                        <ListOrdered size={15} />
                    </ToolbarButton>
                    <ToolbarButton label="Séparateur" onClick={() => onCommand('horizontalRule')}>
                        <Minus size={15} />
                    </ToolbarButton>
                    <Separator />
                    <ToolbarButton label="Image ou galerie" onClick={() => onCommand('images')}>
                        <ImageIcon size={15} />
                    </ToolbarButton>
                    <ToolbarButton label="Photo 360°" onClick={() => onCommand('photoSphere')}>
                        <span className="text-[11px] font-bold">360°</span>
                    </ToolbarButton>
                    <ToolbarButton label="Vidéo YouTube" onClick={() => onCommand('youtube')}>
                        <Film size={15} />
                    </ToolbarButton>
                    <ToolbarButton label="Bloc HTML" onClick={() => onCommand('html')}>
                        <Code size={15} />
                    </ToolbarButton>
                </>
            )}
            <div className="ml-auto flex items-center gap-2">
                {extra}
                <div
                    className="flex rounded-md border border-mp-glass-border p-0.5 text-[11px] font-semibold"
                    role="group"
                    aria-label="Mode d'édition"
                >
                    {(['visual', 'markdown'] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            aria-pressed={mode === m}
                            onClick={() => onModeChange(m)}
                            className={`rounded px-2.5 py-1 transition-colors ${
                                mode === m
                                    ? 'bg-mp-accent text-mp-bg'
                                    : 'text-mp-text-secondary hover:text-mp-text-primary'
                            }`}
                        >
                            {m === 'visual' ? 'Visuel' : 'Markdown'}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function LinkEditor({
    initial,
    onApply,
    onCancel,
}: {
    initial: string;
    onApply: (href: string) => void;
    onCancel: () => void;
}) {
    const [href, setHref] = useState(initial);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => inputRef.current?.focus(), []);
    return (
        <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
                e.preventDefault();
                onApply(href.trim());
            }}
        >
            <input
                ref={inputRef}
                className="admin-input w-64 py-1 text-xs"
                value={href}
                onChange={(e) => setHref(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') onCancel();
                }}
                placeholder="https://… ou /blog/…"
                aria-label="Adresse du lien"
            />
            <button type="submit" className="rounded bg-mp-accent px-2 py-1 text-[11px] font-semibold text-mp-bg">
                OK
            </button>
            {initial && (
                <button
                    type="button"
                    onClick={() => onApply('')}
                    className="rounded px-2 py-1 text-[11px] text-mp-text-secondary hover:text-mp-astro-red"
                >
                    Retirer
                </button>
            )}
        </form>
    );
}

function SlashMenu({
    state,
    items,
    activeIndex,
    onHover,
    onSelect,
}: {
    state: SlashState;
    items: InsertCommand[];
    activeIndex: number;
    onHover: (index: number) => void;
    onSelect: (id: InsertCommandId) => void;
}) {
    return (
        <div
            role="listbox"
            aria-label="Insérer un bloc"
            className="fixed z-50 max-h-80 w-72 overflow-y-auto rounded-lg border border-mp-glass-border bg-mp-bg-secondary p-1 shadow-xl"
            style={{ left: state.left, top: state.top + 6 }}
        >
            {items.map((item, index) => (
                <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => onHover(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelect(item.id)}
                    className={`flex w-full flex-col rounded-md px-3 py-1.5 text-left ${
                        index === activeIndex ? 'bg-mp-accent/15' : ''
                    }`}
                >
                    <span className="text-sm text-mp-text-primary">{item.label}</span>
                    <span className="text-[11px] text-mp-text-muted">{item.hint}</span>
                </button>
            ))}
        </div>
    );
}
