import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

// POURQUOI : ce fichier change selon l'ordre choisi dans `/admin/donnees/routes-cds` (préréglage de panne, par exemple).
// Les tests partent toujours de l'ordre par défaut du registre ; ceux qui testent un autre ordre le passent explicitement.
vi.mock('@/data/upstream-priority.json', () => ({ default: { updatedAt: null, services: {} } }));

// Mock Lucide icons globally
vi.mock('lucide-react', () => ({
    Search: () => <div data-testid="search-icon" />,
    Zap: () => <div data-testid="zap-icon" />,
    RotateCw: () => <div data-testid="rotate-cw-icon" />,
    Cpu: () => <div data-testid="cpu-icon" />,
    Server: () => <div data-testid="server-icon" />,
    Wifi: () => <div data-testid="wifi-icon" />,
    ShieldCheck: () => <div data-testid="shield-check-icon" />,
    Activity: () => <div data-testid="activity-icon" />,
    X: () => <div data-testid="x-icon" />,
    ChevronDown: () => <div data-testid="chevron-down-icon" />,
    Filter: () => <div data-testid="filter-icon" />,
    Calendar: () => <div data-testid="calendar-icon" />,
    Tag: () => <div data-testid="tag-icon" />,
    Clock: () => <div data-testid="clock-icon" />,
    Compass: () => <div data-testid="compass-icon" />,
    Star: () => <div data-testid="star-icon" />,
    Telescope: () => <div data-testid="telescope-icon" />,
    Camera: () => <div data-testid="camera-icon" />,
    Hourglass: () => <div data-testid="hourglass-icon" />,
    Globe: () => <div data-testid="globe-icon" />,
    Settings: () => <div data-testid="settings-icon" />,
    Film: () => <div data-testid="film-icon" />,
    MapPin: () => <div data-testid="map-pin-icon" />,
    Check: () => <div data-testid="check-icon" />,
    LayoutGrid: () => <div data-testid="layout-grid-icon" />,
    LayoutList: () => <div data-testid="layout-list-icon" />,
    ArrowUpDown: () => <div data-testid="arrow-up-down-icon" />,
    ArrowUp: () => <div data-testid="arrow-up-icon" />,
    ArrowDown: () => <div data-testid="arrow-down-icon" />,
    CheckCircle2: () => <div data-testid="check-circle2-icon" />,
    Loader2: () => <div data-testid="loader2-icon" />,
    Sparkles: () => <div data-testid="sparkles-icon" />,
    Plus: () => <div data-testid="plus-icon" />,
    FileText: () => <div data-testid="file-text-icon" />,
    BookOpen: () => <div data-testid="book-open-icon" />,
    Image: () => <div data-testid="image-icon" />,
    Edit: () => <div data-testid="edit-icon" />,
    AlertCircle: () => <div data-testid="alert-circle-icon" />,
    Cloud: () => <div data-testid="cloud-icon" />,
    HardDrive: () => <div data-testid="hard-drive-icon" />,
    RefreshCw: () => <div data-testid="refresh-cw-icon" />,
    Terminal: () => <div data-testid="terminal-icon" />,
    CheckCircle: () => <div data-testid="check-circle-icon" />,
    AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
    Info: () => <div data-testid="info-icon" />,
    XCircle: () => <div data-testid="x-circle-icon" />,
    ExternalLink: () => <div data-testid="external-link-icon" />,
    SlidersHorizontal: () => <div data-testid="sliders-horizontal-icon" />,
    ChevronUp: () => <div data-testid="chevron-up-icon" />,
    // Éditeur WYSIWYG (src/components/Admin/editor/rich/)
    ArrowLeft: () => <div data-testid="arrow-left-icon" />,
    ArrowRight: () => <div data-testid="arrow-right-icon" />,
    Bold: () => <div data-testid="bold-icon" />,
    Code: () => <div data-testid="code-icon" />,
    Heading2: () => <div data-testid="heading-2-icon" />,
    Heading3: () => <div data-testid="heading-3-icon" />,
    Italic: () => <div data-testid="italic-icon" />,
    Link: () => <div data-testid="link-icon" />,
    List: () => <div data-testid="list-icon" />,
    ListOrdered: () => <div data-testid="list-ordered-icon" />,
    Minus: () => <div data-testid="minus-icon" />,
    Quote: () => <div data-testid="quote-icon" />,
    Redo2: () => <div data-testid="redo-2-icon" />,
    Scissors: () => <div data-testid="scissors-icon" />,
    Strikethrough: () => <div data-testid="strikethrough-icon" />,
    Trash2: () => <div data-testid="trash-2-icon" />,
    Undo2: () => <div data-testid="undo-2-icon" />,
}));

// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
    cleanup();
});
