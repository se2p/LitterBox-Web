// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupportedLocale } from '../src/api/capabilities';
import type { TranslationPack } from '../src/i18n/locales';
import { allLocalePacks, SUPPORTED_LOCALES } from './helpers';

/**
 * LitterBox reports patterns it found in a program. It does not know what the child was trying to build, whether the
 * project works, or whether the child has learnt anything — so neither does this frontend.
 *
 * That is easy to agree with and easy to lose: the copy that had to be removed to add this test ("Something here does
 * not work the way you meant it to", "Well done — these are things you got right") was written in good faith by
 * someone trying to be kind to a ten-year-old. A one-off rewrite would have been undone by the next kind sentence.
 * These patterns are the claims themselves, in the four languages the site speaks, so the next one fails here first.
 */
const claimsAboutTheLearner: ReadonlyArray<{ pattern: RegExp; claim: string }> = [
    // What the child intended. LitterBox compares a program against patterns, never against an intention.
    { pattern: /\byou meant\b/i, claim: 'knows what the learner intended' },
    { pattern: /\bwhat you wanted\b/i, claim: 'knows what the learner intended' },
    { pattern: /\bdu wolltest\b/i, claim: 'knows what the learner intended' },
    { pattern: /\bque quer[ií]as\b/i, claim: 'knows what the learner intended' },
    { pattern: /\bjij bedoelde\b/i, claim: 'knows what the learner intended' },

    // Whether the project is right. A finding is a pattern that matched, not a verdict on the program.
    { pattern: /\byou got right\b/i, claim: 'says the project is correct' },
    { pattern: /\bwell done\b/i, claim: 'praises the learner' },
    { pattern: /\b(great|good) job\b/i, claim: 'praises the learner' },
    { pattern: /\bgut gemacht\b/i, claim: 'praises the learner' },
    { pattern: /\bbien hecho\b/i, claim: 'praises the learner' },
    { pattern: /\bgoed gedaan\b/i, claim: 'praises the learner' },

    // Instructions the tool never issued. A sort order is not a plan of work.
    { pattern: /\byour mission\b/i, claim: 'assigns work LitterBox did not assign' },
    { pattern: /\bdeine mission\b/i, claim: 'assigns work LitterBox did not assign' },
    { pattern: /\btu misi[oó]n\b/i, claim: 'assigns work LitterBox did not assign' },
    { pattern: /\bje missie\b/i, claim: 'assigns work LitterBox did not assign' },
    { pattern: /\bnext step\b/i, claim: 'assigns work LitterBox did not assign' },
    { pattern: /\bn[aä]chster schritt\b/i, claim: 'assigns work LitterBox did not assign' },
    { pattern: /\bsiguiente paso\b/i, claim: 'assigns work LitterBox did not assign' },
    { pattern: /\bvolgende stap\b/i, claim: 'assigns work LitterBox did not assign' },

    // Attainment. Nothing the service returns measures a learner.
    { pattern: /\bmastery\b/i, claim: 'reports attainment' },
    { pattern: /\byour grade\b/i, claim: 'reports attainment' },
    { pattern: /\blearning objective/i, claim: 'reports attainment' },
    { pattern: /\blernziel/i, claim: 'reports attainment' },
    { pattern: /\bobjetivo de aprendizaje/i, claim: 'reports attainment' },
    { pattern: /\bleerdoel/i, claim: 'reports attainment' },
];

/**
 * Keys that name a claim in order to deny it. The FAQ answer exists precisely to say that an empty result does not
 * mean the project does what the child wanted — refusing it here would delete the one place the site is explicit
 * about what LitterBox cannot tell you.
 */
const deniesTheClaim: ReadonlySet<string> = new Set(['faqAnswerNoFindings']);

describe('user-facing copy', () => {
    let localePacks: Record<SupportedLocale, TranslationPack>;

    beforeAll(async () => {
        localePacks = await allLocalePacks();
    });

    it.each(SUPPORTED_LOCALES)('claims nothing about the learner in %s', (locale) => {
        const pack = localePacks[locale];
        const offences = Object.entries(pack)
            .filter(([key]) => !deniesTheClaim.has(key))
            .flatMap(([key, value]) =>
                claimsAboutTheLearner
                    .filter(({ pattern }) => pattern.test(value))
                    .map(({ claim }) => `${key} ${claim}: "${value}"`),
            );

        expect(offences).toEqual([]);
    });

    it('describes what a finding family is rather than what the learner did', () => {
        Object.values(localePacks).forEach((pack) => {
            // Every explainer attributes its description to LitterBox, so the sentence is about the tool's
            // vocabulary and not about this child's project.
            expect(pack.issueFamilyBugsExplainer).toMatch(/LitterBox/);
            expect(pack.issueFamilySmellsExplainer).toMatch(/LitterBox/);
            expect(pack.issueFamilyPerfumesExplainer).toMatch(/LitterBox/);
            expect(pack.issueFamilyOtherExplainer).toMatch(/LitterBox/);
        });
    });

    it('places a measurement in the distribution without judging it', () => {
        // A tercile boundary supports a statement about quantity and nothing else. "Higher than most" is such a
        // statement; "about usual" and "ganz normal" are verdicts on a project the boundary knows nothing about,
        // because they say what a project ought to be rather than where this one falls.
        const judgement =
            /\b(normal|usual|typical|gewöhnlich|gewoon|typisch|good|bad|gut|schlecht|bueno|malo|goed|slecht)\b/i;
        // The other way to get this wrong is to be accurate in a language the reader does not speak. "Upper third"
        // is what a statistician calls it, and a ten-year-old looking at their own project cannot act on it.
        const tercileJargon = /\b(tercile|thirds?|drittel|tercio|derde)\b/i;
        Object.values(localePacks).forEach((pack) => {
            expect(pack.metricBandLowerThird).not.toMatch(judgement);
            expect(pack.metricBandMiddleThird).not.toMatch(judgement);
            expect(pack.metricBandUpperThird).not.toMatch(judgement);
            expect(pack.metricBandLowerThird).not.toMatch(tercileJargon);
            expect(pack.metricBandMiddleThird).not.toMatch(tercileJargon);
            expect(pack.metricBandUpperThird).not.toMatch(tercileJargon);
        });
    });

    it('reports an absence of findings as an absence of findings', () => {
        // Not "your project is fine", which is a different and unsupported statement.
        Object.values(localePacks).forEach((pack) => {
            expect(pack.noIssues).not.toMatch(/\b(perfect|fine|clean|sauber|perfecto|prima)\b/i);
        });
    });
});
