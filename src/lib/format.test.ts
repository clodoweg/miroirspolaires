/**
 * @file src/lib/format.test.ts
 * @description Suite de tests unitaires pour le moteur de formatage céleste et calendaire.
 * Responsabilité : Assurer que les coordonnées d'Ascension Droite, de Déclinaison et
 * les dates locales en français sont formatées avec une précision absolue.
 */

import { describe, it, expect } from 'vitest';
import {
    formatRa,
    formatRaLong,
    formatDec,
    formatDecLong,
    formatMonthYear,
    formatDateLong,
    formatDateShort,
} from './format';

describe('Moteur de Formatage Céleste et Calendaire', () => {
    describe('Ascension Droite (RA) - Conversion & wrapping', () => {
        /**
         * @test Valide le formatage compact "00h00m" de l'Ascension Droite.
         */
        it('formatRa - convertit correctement les degrés en heures compactes', () => {
            expect(formatRa(0)).toBe('00h00m');
            expect(formatRa(15)).toBe('01h00m'); // 15° = 1h
            expect(formatRa(83.822)).toBe('05h35m'); // Orion
            expect(formatRa(360)).toBe('00h00m'); // Wrapping modulo 360
            expect(formatRa(375)).toBe('01h00m'); // Wrapping positif
            expect(formatRa(-15)).toBe('23h00m'); // Wrapping négatif
        });

        /**
         * @test Valide le formatage long "00h 00m 00.0s" de l'Ascension Droite.
         */
        it('formatRaLong - convertit avec une précision de secondes décimales', () => {
            expect(formatRaLong(0)).toBe('00h 00m 0.0s');
            expect(formatRaLong(15)).toBe('01h 00m 0.0s');
            expect(formatRaLong(83.822)).toBe('05h 35m 17.3s');
            expect(formatRaLong(-15)).toBe('23h 00m 0.0s');
        });
    });

    describe('Déclinaison (DEC) - Signes et Précision angulaire', () => {
        /**
         * @test Valide la déclinaison compacte en vérifiant que le signe moins
         * d'astronomie officiel '−' (U+2212) est bien retourné à la place du tiret '-'.
         */
        it('formatDec - convertit correctement les degrés et gère le signe moins officiel', () => {
            expect(formatDec(0)).toBe('+00°00′');
            expect(formatDec(41.269)).toBe('+41°16′');
            expect(formatDec(-5.391)).toBe('−05°23′'); // Signe moins astronomique
        });

        /**
         * @test Valide le formatage long "±00° 00′ 00.0″" de la Déclinaison.
         */
        it("formatDecLong - convertit avec une précision de secondes d'arc décimales", () => {
            expect(formatDecLong(0)).toBe('+00° 00′ 0.0″');
            expect(formatDecLong(41.269)).toBe('+41° 16′ 8.4″');
            expect(formatDecLong(-5.391)).toBe('−05° 23′ 27.6″');
        });
    });

    describe('Formatage Calendaire Français (Date)', () => {
        const testDate = new Date('2026-05-26T14:00:00.000Z');

        /**
         * @test Valide le formatage mois/année en français (ex: "mai 2026").
         */
        it('formatMonthYear - formate la date en mois complet et année', () => {
            const formatted = formatMonthYear(testDate);
            // Nettoyage des espaces insécables potentiels renvoyés par l'Intl Node
            expect(formatted.replace(/\u00a0/g, ' ')).toBe('mai 2026');
        });

        /**
         * @test Valide la structure longue "mardi 26 mai 2026" en français.
         */
        it('formatDateLong - formate la date avec jour de la semaine rédigé', () => {
            const formatted = formatDateLong(testDate);
            expect(formatted.replace(/\u00a0/g, ' ')).toBe('mardi 26 mai 2026');
        });

        /**
         * @test Valide la structure courte "26 mai 2026" en français.
         */
        it('formatDateShort - formate la date de manière condensée', () => {
            const formatted = formatDateShort(testDate);
            expect(formatted.replace(/\u00a0/g, ' ')).toBe('26 mai 2026');
        });
    });
});
