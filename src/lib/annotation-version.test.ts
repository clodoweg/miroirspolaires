import { describe, expect, it } from 'vitest';
import { getAnnotationVersion } from './annotation-version';

describe('getAnnotationVersion', () => {
    const runs = {
        '1': [
            { at: '2026-11-28T09:00:00Z', status: 'failed' as const, reason: 'HTTP Error 429' },
            { at: '2026-11-26T16:07:40Z', status: 'ok' as const, objects: 9 },
        ],
        '2': [{ at: '2026-11-26T16:07:40Z', status: 'skipped' as const }],
    };

    it('suit le dernier dessin réussi, même après un échec', () => {
        expect(getAnnotationVersion('1', runs)).toBe('20261126160740');
        expect(getAnnotationVersion(1, runs)).toBe('20261126160740');
    });

    it('ne donne pas de version sans dessin réussi', () => {
        expect(getAnnotationVersion('2', runs)).toBeUndefined();
        expect(getAnnotationVersion('3', runs)).toBeUndefined();
    });

    it('lit l’historique du dépôt par défaut', () => {
        expect(getAnnotationVersion('1279982')).toMatch(/^\d{14}$/);
    });
});
