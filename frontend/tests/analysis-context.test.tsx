// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BatchAnalysis } from '../src/api/submissions';
import { AnalysisContext } from '../src/components/single-project/AnalysisContext';
import i18n from '../src/i18n';

const analysis = (overrides: Partial<BatchAnalysis> = {}): BatchAnalysis =>
    ({
        id: 7,
        status: 'completed',
        name: 'synthetic.sb3',
        failureType: null,
        failureMessage: null,
        reportSchemaVersion: '2',
        litterboxVersion: 'synthetic-1.2.3',
        locale: 'en',
        provenance: 'upload',
        detectors: ['zeta', 'alpha', '  '],
        configuration: { maxQuestions: '300', locale: 'en' },
        sourceSha256: 'a'.repeat(64),
        inputFormat: 'sb3',
        metrics: {},
        issues: [],
        relationships: [],
        catalogue: [],
        quiz: [],
        assetRefs: [],
        ...overrides,
    }) as BatchAnalysis;

describe('analysis context', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('records what produced the result, from the analysis itself', () => {
        render(<AnalysisContext analysis={analysis()} />);

        expect(screen.getByText('synthetic-1.2.3')).toBeInTheDocument();
        expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
        expect(screen.getByText('upload')).toBeInTheDocument();
        // Sorted for a stable reading, and the blank one is not a detector.
        expect(screen.getByText('alpha, zeta')).toBeInTheDocument();
        // Configuration keys in order, as the analysis recorded them.
        const keys = Array.from(document.querySelectorAll('.analysis-context-list dt')).map(
            (term) => term.textContent,
        );
        expect(keys.indexOf('locale')).toBeLessThan(keys.indexOf('maxQuestions'));
    });

    it('leaves out what the analysis did not record', () => {
        render(
            <AnalysisContext
                analysis={analysis({
                    litterboxVersion: null,
                    provenance: '   ',
                    sourceSha256: null,
                    detectors: [],
                    configuration: {},
                })}
            />,
        );

        // No row reading "unknown": absent metadata is simply absent.
        expect(screen.queryByText('LitterBox version')).not.toBeInTheDocument();
        expect(screen.queryByText('Provenance')).not.toBeInTheDocument();
        expect(screen.queryByText('Detectors')).not.toBeInTheDocument();
        expect(screen.getByText('Project')).toBeInTheDocument();
    });

    it('renders nothing at all when the analysis recorded none of it', () => {
        const { container } = render(
            <AnalysisContext
                analysis={analysis({
                    name: null,
                    status: '',
                    reportSchemaVersion: null,
                    litterboxVersion: null,
                    locale: null,
                    provenance: null,
                    inputFormat: null,
                    sourceSha256: null,
                    detectors: [],
                    configuration: {},
                })}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });
});
