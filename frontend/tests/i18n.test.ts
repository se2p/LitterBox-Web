// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd } from 'node:process';
import i18n, { formatDateTime, formatNumber, setLocale } from '../src/i18n';
import type { SupportedLocale } from '../src/api/capabilities';
import { translationKeys, type TranslationKey, type TranslationPack } from '../src/i18n/locales';
import { allLocalePacks } from './helpers';

describe('locale packs', () => {
    let localePacks: Record<SupportedLocale, TranslationPack>;

    beforeAll(async () => {
        localePacks = await allLocalePacks();
    });

    it('contains every typed key in de, en, es and nl', () => {
        const keys = Object.keys(translationKeys).sort();
        for (const [locale, pack] of Object.entries(localePacks)) {
            expect(Object.keys(pack).sort(), locale).toEqual(keys);
            expect(
                Object.values(pack).every((value) => value.length > 0),
                locale,
            ).toBe(true);
        }
    });

    it.each([
        ['en', 'project is', 'projects are'],
        ['de', 'Projekt kann', 'Projekte können'],
        ['es', 'proyecto está', 'proyectos están'],
        ['nl', 'project kan', 'projecten kunnen'],
    ])('picks the singular and plural of a project count in %s', async (locale, one, many) => {
        await setLocale(locale as 'en');
        expect(i18n.t('teacherPreflightReady', { count: 1 })).toContain(one);
        expect(i18n.t('teacherPreflightReady', { count: 0 })).toContain(many);
        expect(i18n.t('teacherPreflightReady', { count: 7 })).toContain(many);
        await setLocale('en');
    });

    it('keeps the localised number when a counted string is also formatted', async () => {
        await setLocale('de');
        expect(i18n.t('batchFindings', { count: 1, formatted: '1' })).toBe('1 Befund gemeldet.');
        expect(i18n.t('batchFindings', { count: 1200, formatted: '1.200' })).toBe(
            '1.200 Befunde gemeldet.',
        );
        await setLocale('en');
    });

    it.each([
        'teacherPreflightReady',
        'batchFindings',
        'metricsInvalid',
        'metricComparisonBasis',
        'teacherQuestionsCount',
        'catalogueResultsCount',
        'injectionSelectAll',
        'injectionSelectedFiltered',
        'injectionDownloadAll',
    ])('carries both plural forms of %s in every locale', (key) => {
        for (const [locale, pack] of Object.entries(localePacks)) {
            expect(Object.keys(pack), `${locale} ${key}`).toEqual(
                expect.arrayContaining([`${key}_one`, `${key}_other`]),
            );
        }
    });

    it('lets no translated pack invent a key English does not have', async () => {
        const canonical = new Set(Object.keys(translationKeys));
        const packs = {
            de: (await import('../src/i18n/locales/de')).pack,
            es: (await import('../src/i18n/locales/es')).pack,
            nl: (await import('../src/i18n/locales/nl')).pack,
        };
        for (const [locale, pack] of Object.entries(packs)) {
            const invented = Object.keys(pack).filter((key) => !canonical.has(key));
            expect(invented, locale).toEqual([]);
            expect(
                Object.entries(pack).filter(([, value]) => (value ?? '').length === 0),
                locale,
            ).toEqual([]);
        }
    });

    it('keeps batch-workspace translations tied to a source use', () => {
        const sourceRoot = resolve(cwd(), 'src');
        const source: string[] = [];
        const visit = (directory: string) => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                const path = join(directory, entry.name);
                if (entry.isDirectory()) {
                    if (path !== join(sourceRoot, 'i18n', 'locales')) visit(path);
                } else if (/\.tsx?$/.test(entry.name)) source.push(readFileSync(path, 'utf8'));
            }
        };
        visit(sourceRoot);
        const used = new Set(
            [...source.join('\n').matchAll(/['"](batch[A-Za-z0-9_]+)['"]/g)].map(
                (match) => match[1],
            ),
        );
        const unused = Object.keys(translationKeys)
            .filter((key) => key.startsWith('batch'))
            .filter((key) => !used.has(key.replace(/_(one|other)$/, '')) && !used.has(key));

        expect(unused).toEqual([]);
    });

    it('falls back to English for an unavailable translation', async () => {
        i18n.addResource('en', 'translation', 'fallbackProbe', 'English fallback');
        await i18n.changeLanguage('nl');
        expect(i18n.t('fallbackProbe' as TranslationKey)).toBe('English fallback');
        await i18n.changeLanguage('en');
    });

    it('persists supported locale changes and formats numbers and dates by locale', async () => {
        window.localStorage.clear();
        await setLocale('de');
        expect(window.localStorage.getItem('litterbox.locale')).toBe('de');
        expect(formatNumber(1234567, 'de')).toBe('1.234.567');
        expect(formatDateTime('not-a-date', 'de')).toBe('—');
        expect(formatDateTime('2025-01-02T12:00:00Z', 'de')).toContain('02.01.2025');
        await setLocale('en');
    });
});
