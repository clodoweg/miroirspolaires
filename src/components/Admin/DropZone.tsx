import { useState, type ReactNode } from 'react';

interface Props {
    /** Called when files are dropped or chosen via the file input. */
    onFiles: (files: File[]) => void;
    /** "image/*" by default. */
    accept?: string;
    multiple?: boolean;
    /** Caption inside the drop area. */
    label?: string;
    /** Secondary line, e.g. the destination path. */
    hint?: ReactNode;
    /** Extra slot rendered below the chooser button. */
    extra?: ReactNode;
    disabled?: boolean;
    className?: string;
    /** Render compact (used when drop zone sits inline next to other content). */
    compact?: boolean;
}

/**
 * Generic drag-and-drop file zone. Mirrors the patterns used by WP and Cloudflare
 * Images: visible drop target with hover state, a fallback file picker button
 * and an optional hint for context (destination path, accepted formats).
 */
export default function DropZone({
    onFiles,
    accept = 'image/*',
    multiple = true,
    label = 'Glisse-dépose des fichiers ici',
    hint,
    extra,
    disabled,
    className = '',
    compact = false,
}: Props) {
    const [hover, setHover] = useState(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setHover(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(files);
    };

    return (
        <div
            onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setHover(true);
            }}
            onDragLeave={() => setHover(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors ${compact ? 'gap-2 p-4' : 'gap-3 p-8'} ${
                hover && !disabled
                    ? 'border-mp-accent bg-mp-accent/10 text-mp-accent'
                    : 'border-mp-glass-border text-mp-text-secondary'
            } ${disabled ? 'opacity-50' : ''} ${className}`}
        >
            <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border ${hover ? 'border-mp-accent bg-mp-accent/20 text-mp-accent' : 'border-mp-glass-border text-mp-text-muted'}`}
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
            </div>
            <p className="text-sm">{label}</p>
            <label className="cursor-pointer rounded-md border border-mp-glass-border bg-mp-bg-secondary/60 px-3 py-1.5 text-xs hover:border-mp-accent hover:text-mp-accent">
                Parcourir
                <input
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    className="hidden"
                    disabled={disabled}
                    onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0) onFiles(files);
                        e.target.value = '';
                    }}
                />
            </label>
            {hint && <div className="font-mono text-[10px] text-mp-text-muted">{hint}</div>}
            {extra}
        </div>
    );
}
