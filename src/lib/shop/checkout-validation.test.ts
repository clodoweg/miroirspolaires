import { describe, expect, it } from 'vitest';
import { validatePickupRequestInput } from './checkout-validation';

const VALID = { name: 'Camille', email: 'Camille@Example.org', place: 'Lyon', message: 'Merci !' };

describe('validatePickupRequestInput', () => {
    it('nettoie une demande valide et met l’e-mail en minuscules', () => {
        expect(validatePickupRequestInput({ ...VALID, name: '  Camille\n' })).toEqual({
            name: 'Camille',
            email: 'camille@example.org',
            place: 'Lyon',
            message: 'Merci !',
        });
    });

    it('accepte un message absent', () => {
        expect(validatePickupRequestInput({ ...VALID, message: undefined })?.message).toBe('');
    });

    it.each([
        ['corps absent', null],
        ['nom manquant', { ...VALID, name: '' }],
        ['e-mail invalide', { ...VALID, email: 'pas un mail' }],
        ['e-mail sans domaine', { ...VALID, email: 'a@b' }],
        ['lieu non textuel', { ...VALID, place: { evil: true } }],
        ['message trop long', { ...VALID, message: 'x'.repeat(1001) }],
        ['message non textuel', { ...VALID, message: 42 }],
    ])('refuse : %s', (_label, raw) => {
        expect(validatePickupRequestInput(raw)).toBeNull();
    });
});
