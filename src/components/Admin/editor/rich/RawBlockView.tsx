/**
 * Vue React des nœuds `rawHtml` et `rawMarkdown` : aperçu du bloc et édition de son source.
 *
 * POURQUOI : ces blocs (vidéo YouTube, mise en page HTML, Markdown non représentable) sont
 * conservés tels quels ; l'auteur les modifie en source, comme le bloc « HTML » de Gutenberg.
 */
import { useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Code, Trash2 } from 'lucide-react';
import { marked } from 'marked';

function youtubeId(html: string): string | null {
    return /youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/.exec(html)?.[1] ?? null;
}

export default function RawBlockView({ node, updateAttributes, deleteNode, selected, editor }: ReactNodeViewProps) {
    const isHtml = node.type.name === 'rawHtml';
    const attribute = isHtml ? 'html' : 'markdown';
    const source = String(node.attrs[attribute] ?? '');
    const [isEditing, setIsEditing] = useState(source.trim() === '');
    const videoId = isHtml ? youtubeId(source) : null;
    const label = videoId ? 'Vidéo YouTube' : isHtml ? 'Bloc HTML' : 'Bloc Markdown (non éditable visuellement)';

    // POURQUOI : contenu écrit par l'auteur dans ses propres articles, affiché uniquement dans l'admin de dev.
    const previewHtml = isHtml ? source : (marked.parse(source, { gfm: true, async: false }) as string);

    return (
        <NodeViewWrapper
            className={`my-6 rounded-lg border-2 p-2 ${selected ? 'border-mp-accent' : 'border-mp-glass-border/60'}`}
        >
            <div
                className="mb-2 flex cursor-grab items-center justify-between text-[11px] font-semibold tracking-wide text-mp-text-muted uppercase"
                data-drag-handle
                contentEditable={false}
            >
                <span>⠿ {label}</span>
                {editor.isEditable && (
                    <span className="flex gap-1">
                        <button
                            type="button"
                            onClick={() => setIsEditing(!isEditing)}
                            className={`rounded p-1 hover:bg-mp-accent/15 hover:text-mp-accent ${isEditing ? 'text-mp-accent' : ''}`}
                            title={isEditing ? "Voir l'aperçu" : 'Modifier le source'}
                            aria-label={isEditing ? "Voir l'aperçu" : 'Modifier le source'}
                        >
                            <Code size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => deleteNode()}
                            className="rounded p-1 hover:bg-mp-astro-red/15 hover:text-mp-astro-red"
                            title="Supprimer le bloc"
                            aria-label="Supprimer le bloc"
                        >
                            <Trash2 size={14} />
                        </button>
                    </span>
                )}
            </div>
            <div contentEditable={false}>
                {isEditing ? (
                    <textarea
                        className="admin-input min-h-32 font-mono text-xs"
                        value={source}
                        spellCheck={false}
                        onChange={(e) => updateAttributes({ [attribute]: e.target.value })}
                        placeholder={isHtml ? '<div>…</div>' : 'Markdown…'}
                    />
                ) : videoId ? (
                    // POURQUOI : pas de miniature distante (i.ytimg.com) pour ne dépendre ni du réseau ni de la CSP.
                    <div className="mx-auto flex aspect-video max-w-3xl flex-col items-center justify-center gap-2 rounded-md bg-mp-ui-black text-mp-text-muted">
                        <span className="text-4xl text-mp-accent">▶</span>
                        <span className="font-mono text-xs">youtube.com/embed/{videoId}</span>
                    </div>
                ) : (
                    <div className="pointer-events-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                )}
            </div>
        </NodeViewWrapper>
    );
}
