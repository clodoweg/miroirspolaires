/**
 * Tests des outils communs des éditeurs : tiroir de réglages, brouillon local, raccourcis,
 * ouverture de l'aperçu réel et fenêtre d'insertion YouTube.
 */
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsDrawer from './SettingsDrawer';
import { clearLocalDraft, readLocalDraft, useLocalDraftAutosave, writeLocalDraft } from './useLocalDraft';
import { useEditorShortcuts } from './useEditorShortcuts';
import { openArticlePreview } from './openArticlePreview';
import YoutubeDialog from './rich/YoutubeDialog';

describe('SettingsDrawer', () => {
    it('affiche le contenu, l’avertissement et se ferme avec Échap ou le bouton', () => {
        const onClose = vi.fn();
        render(
            <SettingsDrawer open onClose={onClose} warning="À compléter : slug.">
                <p>Champs</p>
            </SettingsDrawer>,
        );
        expect(screen.getByRole('dialog', { name: "Réglages de l'article" })).toBeInTheDocument();
        expect(screen.getByText('À compléter : slug.')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        fireEvent.click(screen.getByRole('button', { name: 'Fermer les réglages' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('n’écoute pas Échap quand il est fermé', () => {
        const onClose = vi.fn();
        render(
            <SettingsDrawer open={false} onClose={onClose}>
                <p>Champs</p>
            </SettingsDrawer>,
        );
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('brouillon local', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.useRealTimers());

    it('écrit, relit et supprime un brouillon', () => {
        writeLocalDraft('blog/2026/x', { body: 'A' });
        expect(readLocalDraft<{ body: string }>('blog/2026/x')?.value).toEqual({ body: 'A' });
        clearLocalDraft('blog/2026/x');
        expect(readLocalDraft('blog/2026/x')).toBeNull();
    });

    it('ignore un brouillon illisible', () => {
        localStorage.setItem('mp-admin-draft:blog/2026/x', '{oops');
        expect(readLocalDraft('blog/2026/x')).toBeNull();
    });

    it('sauvegarde automatiquement après un délai, seulement si l’article est modifié', () => {
        vi.useFakeTimers();
        const { rerender } = renderHook(({ value, dirty }) => useLocalDraftAutosave('blog/new', value, dirty), {
            initialProps: { value: { body: 'A' }, dirty: false },
        });
        vi.advanceTimersByTime(2000);
        expect(readLocalDraft('blog/new')).toBeNull();
        rerender({ value: { body: 'B' }, dirty: true });
        vi.advanceTimersByTime(2000);
        expect(readLocalDraft<{ body: string }>('blog/new')?.value.body).toBe('B');
    });
});

describe('useEditorShortcuts', () => {
    it('enregistre avec Ctrl+S ou Cmd+S quand c’est possible', () => {
        const onSave = vi.fn();
        const { rerender } = renderHook(({ canSave }) => useEditorShortcuts(onSave, { canSave, dirty: false }), {
            initialProps: { canSave: true },
        });
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        fireEvent.keyDown(window, { key: 'S', metaKey: true });
        expect(onSave).toHaveBeenCalledTimes(2);
        rerender({ canSave: false });
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        expect(onSave).toHaveBeenCalledTimes(2);
    });

    it('avertit avant de quitter avec des modifications non enregistrées', () => {
        renderHook(() => useEditorShortcuts(vi.fn(), { canSave: true, dirty: true }));
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });
});

describe('openArticlePreview', () => {
    const draft = { section: 'blog' as const, year: '2026', slug: 'x', frontmatter: {}, body: 'A' };

    it('ouvre l’onglet puis le dirige vers l’aperçu', async () => {
        const previewWindow = { location: { href: '' }, close: vi.fn() };
        vi.spyOn(window, 'open').mockReturnValue(previewWindow as unknown as Window);
        global.fetch = vi
            .fn()
            .mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: '/admin/apercu?id=1' }) });
        await openArticlePreview(draft);
        expect(window.open).toHaveBeenCalledWith('', 'mp-apercu');
        expect(previewWindow.location.href).toBe('/admin/apercu?id=1');
    });

    it('ferme l’onglet et remonte l’erreur de l’API', async () => {
        const previewWindow = { location: { href: '' }, close: vi.fn() };
        vi.spyOn(window, 'open').mockReturnValue(previewWindow as unknown as Window);
        global.fetch = vi
            .fn()
            .mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ error: 'Slug invalide.' }) });
        await expect(openArticlePreview(draft)).rejects.toThrow('Slug invalide.');
        expect(previewWindow.close).toHaveBeenCalled();
    });
});

describe('YoutubeDialog', () => {
    it('valide l’adresse et insère la vidéo avec son titre', () => {
        const onInsert = vi.fn();
        render(<YoutubeDialog onInsert={onInsert} onCancel={vi.fn()} />);
        const insert = screen.getByRole('button', { name: 'Insérer' });
        fireEvent.change(screen.getByLabelText('Adresse de la vidéo'), { target: { value: 'pas une url' } });
        expect(screen.getByText(/Adresse non reconnue/)).toBeInTheDocument();
        expect(insert).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Adresse de la vidéo'), {
            target: { value: 'https://youtu.be/6sbrnOWqQSI' },
        });
        fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Sermilik' } });
        fireEvent.click(insert);
        expect(onInsert).toHaveBeenCalledWith('6sbrnOWqQSI', 'Sermilik');
    });

    it('se ferme avec Échap', () => {
        const onCancel = vi.fn();
        render(<YoutubeDialog onInsert={vi.fn()} onCancel={onCancel} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalled();
    });
});
