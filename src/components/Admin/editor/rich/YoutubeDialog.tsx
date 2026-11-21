/**
 * Fenêtre d'insertion d'une vidéo YouTube : URL (ou identifiant), titre accessible, aperçu de validation.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { parseYoutubeId } from './insertCommands';

interface YoutubeDialogProps {
    onInsert: (videoId: string, title: string) => void;
    onCancel: () => void;
}

export default function YoutubeDialog({ onInsert, onCancel }: YoutubeDialogProps) {
    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const urlRef = useRef<HTMLInputElement>(null);
    const titleId = useId();
    const videoId = parseYoutubeId(url);
    const showError = url.trim() !== '' && !videoId;

    useEffect(() => {
        urlRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="space-y-4 w-full max-w-md rounded-lg border border-mp-glass-border bg-mp-bg p-5 shadow-2xl"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (videoId) onInsert(videoId, title.trim() || 'Vidéo');
                }}
            >
                <h2 id={titleId} className="m-0 text-lg">
                    Insérer une vidéo YouTube
                </h2>
                <label className="block text-xs text-mp-text-secondary">
                    Adresse de la vidéo
                    <input
                        ref={urlRef}
                        className="admin-input mt-1"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://www.youtube.com/watch?v=…"
                        aria-invalid={showError}
                    />
                </label>
                {showError && (
                    <p className="m-0 text-xs text-mp-astro-red">
                        Adresse non reconnue (formats acceptés : watch, youtu.be, embed, shorts).
                    </p>
                )}
                <label className="block text-xs text-mp-text-secondary">
                    Titre (lu par les lecteurs d'écran)
                    <input
                        className="admin-input mt-1"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Ex. Vol au-dessus du Sermilik"
                    />
                </label>
                {videoId && <p className="m-0 font-mono text-xs text-mp-text-muted">youtube.com/embed/{videoId}</p>}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-mp-glass-border px-3 py-2 text-xs text-mp-text-secondary hover:text-mp-text-primary"
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        disabled={!videoId}
                        className="rounded-md bg-mp-accent px-3 py-2 text-xs font-semibold text-mp-bg disabled:opacity-40"
                    >
                        Insérer
                    </button>
                </div>
            </form>
        </div>
    );
}
