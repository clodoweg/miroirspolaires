/**
 * Vue React du nœud `imageGroup` : figure (une image), galerie justifiée (plusieurs images)
 * ou photosphère (alt `360:`), avec édition en place de l'alt et de la légende,
 * réordonnancement, découpe du groupe et ajout d'images par glisser-déposer.
 */
import { useState, type DragEvent } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { ArrowLeft, ArrowRight, Scissors, Trash2 } from 'lucide-react';
import { marked } from 'marked';
import {
    PHOTO_SPHERE_ALT_PREFIX,
    getInlineCaption,
    isPhotoSphere,
    withInlineCaption,
    type ImageGroupItem,
} from './nodes';
import type { RichEditorImageOptions } from './richEditorOptions';

/** Hauteur cible d'une ligne de galerie dans l'éditeur, en pixels. */
const GALLERY_ROW_HEIGHT = 180;

function renderCaption(caption: string): string {
    return marked.parseInline(caption, { async: false });
}

function fileName(src: string): string {
    return decodeURIComponent(src.split('/').pop() ?? src);
}

export default function ImageGroupView({
    node,
    updateAttributes,
    deleteNode,
    editor,
    getPos,
    selected,
    extension,
}: ReactNodeViewProps) {
    const options = extension.options as RichEditorImageOptions;
    const items = (node.attrs.items as ImageGroupItem[]) ?? [];
    const [ratios, setRatios] = useState<Record<string, number>>({});
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [isDropTarget, setIsDropTarget] = useState(false);
    const editingItem = editingIndex !== null ? items[editingIndex] : undefined;
    const isGallery = items.length >= 2 && !items.some(isPhotoSphere);
    const isEditable = editor.isEditable;

    const setItems = (next: ImageGroupItem[]) => {
        if (next.length === 0) {
            deleteNode();
            return;
        }
        // POURQUOI : les sauts de ligne entre images sont rétablis par `serializeImageGroup()`.
        updateAttributes({ items: next });
    };

    const updateItem = (index: number, patch: Partial<ImageGroupItem>) => {
        setItems(items.map((it, i) => (i === index ? { ...it, ...patch, raw: '' } : it)));
    };

    const updateCaption = (index: number, caption: string) => {
        setItems(items.map((it, i) => (i === index ? withInlineCaption(it, caption, i === items.length - 1) : it)));
    };

    const move = (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= items.length) return;
        const next = [...items];
        [next[index], next[target]] = [next[target], next[index]];
        setItems(next);
    };

    const remove = (index: number) => setItems(items.filter((_, i) => i !== index));

    /** Coupe le groupe après l'image `index` : les images suivantes forment un nouveau bloc. */
    const splitAfter = (index: number) => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (typeof pos !== 'number') return;
        const head = items.slice(0, index + 1);
        const tail = items.slice(index + 1);
        updateAttributes({ items: head });
        editor
            .chain()
            .insertContentAt(pos + node.nodeSize, { type: 'imageGroup', attrs: { items: tail } })
            .run();
    };

    const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
        setIsDropTarget(false);
        const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
        if (files.length === 0 || !options.uploadImages) return;
        event.preventDefault();
        event.stopPropagation();
        const saved = await options.uploadImages(files);
        if (saved.length === 0) return;
        const added: ImageGroupItem[] = saved.map((s, i) => ({
            src: s.path,
            alt: '',
            title: null,
            raw: '',
            trailing: i === saved.length - 1 ? '' : '\n',
        }));
        setItems([...items, ...added]);
    };

    const label = items.some(isPhotoSphere) ? 'Photo 360°' : isGallery ? `Galerie · ${items.length} images` : 'Image';

    return (
        <NodeViewWrapper
            className={`rich-image-group my-6 rounded-lg border-2 p-2 transition-colors ${
                selected
                    ? 'border-mp-accent'
                    : isDropTarget
                      ? 'border-dashed border-mp-accent'
                      : 'border-transparent hover:border-mp-glass-border'
            }`}
            data-image-group-count={items.length}
            onDragOver={(e: DragEvent<HTMLDivElement>) => {
                if (e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    setIsDropTarget(true);
                }
            }}
            onDragLeave={() => setIsDropTarget(false)}
            onDrop={handleDrop}
        >
            <div
                className="mb-2 flex cursor-grab items-center justify-between text-[11px] font-semibold tracking-wide text-mp-text-muted uppercase"
                data-drag-handle
                contentEditable={false}
            >
                <span>⠿ {label}</span>
                {isEditable && (
                    <button
                        type="button"
                        onClick={() => deleteNode()}
                        className="rounded p-1 text-mp-text-muted hover:bg-mp-astro-red/15 hover:text-mp-astro-red"
                        title="Supprimer le bloc"
                        aria-label="Supprimer le bloc"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>

            <div
                className={`not-prose ${isGallery ? 'flex flex-wrap gap-1.5' : 'flex flex-col items-center gap-6'}`}
                contentEditable={false}
            >
                {items.map((item, index) => {
                    const sphere = isPhotoSphere(item);
                    const caption = getInlineCaption(item);
                    const ratio = ratios[item.src] ?? 1.5;
                    const src = options.resolveImageSrc ? options.resolveImageSrc(item.src) : item.src;
                    const isEditing = editingIndex === index;
                    return (
                        <figure
                            key={`${item.src}-${index}`}
                            className={`group relative m-0 ${isGallery ? '' : 'w-full max-w-3xl'}`}
                            style={
                                isGallery
                                    ? { flexGrow: ratio, flexBasis: `${ratio * GALLERY_ROW_HEIGHT}px` }
                                    : undefined
                            }
                            data-image-src={item.src}
                        >
                            <button
                                type="button"
                                className={`block w-full cursor-pointer rounded-md ${isEditing ? 'ring-2 ring-mp-accent ring-offset-2' : ''}`}
                                onClick={() => setEditingIndex(isEditing ? null : index)}
                                aria-label={`Modifier l'image ${fileName(item.src)}`}
                            >
                                <img
                                    src={src.split('#')[0]}
                                    alt={item.alt}
                                    draggable={false}
                                    onLoad={(e) => {
                                        const img = e.currentTarget;
                                        if (img.naturalHeight > 0) {
                                            const r = img.naturalWidth / img.naturalHeight;
                                            setRatios((prev) =>
                                                prev[item.src] === r ? prev : { ...prev, [item.src]: r },
                                            );
                                        }
                                    }}
                                    className={`block w-full cursor-pointer rounded-md object-cover ${
                                        isGallery
                                            ? 'h-full'
                                            : sphere
                                              ? 'max-h-64'
                                              : 'mx-auto max-h-[70vh] w-auto max-w-full'
                                    }`}
                                    style={isGallery ? { aspectRatio: String(ratio) } : undefined}
                                />
                            </button>
                            {sphere && (
                                <span className="absolute top-2 left-2 rounded-full bg-mp-ui-black/70 px-2 py-0.5 text-[11px] font-semibold text-mp-accent">
                                    🌐 360°
                                </span>
                            )}

                            {isEditable && (
                                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                    {items.length > 1 && index > 0 && (
                                        <IconAction label="Déplacer avant" onClick={() => move(index, -1)}>
                                            <ArrowLeft size={13} />
                                        </IconAction>
                                    )}
                                    {items.length > 1 && index < items.length - 1 && (
                                        <IconAction label="Déplacer après" onClick={() => move(index, 1)}>
                                            <ArrowRight size={13} />
                                        </IconAction>
                                    )}
                                    {items.length > 1 && index < items.length - 1 && (
                                        <IconAction
                                            label="Couper le groupe après cette image"
                                            onClick={() => splitAfter(index)}
                                        >
                                            <Scissors size={13} />
                                        </IconAction>
                                    )}
                                    <IconAction label="Retirer l'image" danger onClick={() => remove(index)}>
                                        <Trash2 size={13} />
                                    </IconAction>
                                </div>
                            )}

                            {caption && (
                                <figcaption
                                    className="mt-1.5 text-center text-sm text-mp-text-muted italic"
                                    // POURQUOI : légende issue du Markdown de l'auteur (liens), rendue comme sur le site public.
                                    dangerouslySetInnerHTML={{ __html: renderCaption(caption) }}
                                />
                            )}
                        </figure>
                    );
                })}
                {/* POURQUOI : empêche la dernière ligne d'une galerie de s'étirer sur toute la largeur. */}
                {isGallery && <span aria-hidden className="grow-[10]" />}
            </div>
            {editingItem && editingIndex !== null && isEditable && (
                <div
                    contentEditable={false}
                    className="space-y-2 mt-3 rounded-md border border-mp-glass-border bg-mp-bg-secondary/80 p-2 text-left"
                >
                    <p className="truncate font-mono text-[10px] text-mp-text-muted" title={editingItem.src}>
                        {fileName(editingItem.src)}
                    </p>
                    <label className="block text-[11px] text-mp-text-secondary">
                        {isPhotoSphere(editingItem) ? 'Titre du panorama' : 'Texte alternatif (alt)'}
                        <input
                            className="admin-input mt-1"
                            value={
                                isPhotoSphere(editingItem)
                                    ? editingItem.alt.slice(PHOTO_SPHERE_ALT_PREFIX.length)
                                    : editingItem.alt
                            }
                            onChange={(e) =>
                                updateItem(editingIndex, {
                                    alt: isPhotoSphere(editingItem)
                                        ? `${PHOTO_SPHERE_ALT_PREFIX}${e.target.value}`
                                        : e.target.value,
                                })
                            }
                            placeholder="Décris l'image"
                        />
                    </label>
                    {!isPhotoSphere(editingItem) && (
                        <label className="block text-[11px] text-mp-text-secondary">
                            Légende (Markdown en ligne, liens autorisés)
                            <input
                                className="admin-input mt-1"
                                value={getInlineCaption(editingItem)}
                                onChange={(e) => updateCaption(editingIndex, e.target.value)}
                                placeholder="Légende affichée sous l'image"
                            />
                        </label>
                    )}
                    <label className="flex items-center gap-2 text-[11px] text-mp-text-secondary">
                        <input
                            type="checkbox"
                            checked={isPhotoSphere(editingItem)}
                            onChange={(e) =>
                                updateItem(editingIndex, {
                                    alt: e.target.checked
                                        ? `${PHOTO_SPHERE_ALT_PREFIX}${editingItem.alt}`
                                        : editingItem.alt.replace(/^360:/, ''),
                                })
                            }
                        />
                        Photo 360° (lecteur panoramique)
                    </label>
                    <div className="flex justify-end gap-2">
                        {options.onSetCover && (
                            <button
                                type="button"
                                className="rounded border border-mp-glass-border px-2 py-1 text-[11px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent"
                                onClick={() => options.onSetCover?.(editingItem.src)}
                            >
                                Définir comme couverture
                            </button>
                        )}
                        <button
                            type="button"
                            className="rounded bg-mp-accent px-2 py-1 text-[11px] font-semibold text-mp-bg"
                            onClick={() => setEditingIndex(null)}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
            {isEditable && selected && editingIndex === null && (
                <p className="mt-1 text-center text-[10px] text-mp-text-muted" contentEditable={false}>
                    Clique sur une image pour modifier son alt et sa légende · dépose des fichiers ici pour les ajouter
                </p>
            )}
        </NodeViewWrapper>
    );
}

function IconAction({
    label,
    onClick,
    danger = false,
    children,
}: {
    label: string;
    onClick: () => void;
    danger?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className={`rounded bg-mp-ui-black/75 p-1.5 text-white backdrop-blur-sm ${
                danger ? 'hover:bg-mp-astro-red' : 'hover:bg-mp-accent hover:text-mp-bg'
            }`}
        >
            {children}
        </button>
    );
}
