// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { BatchAnalysis } from '../../api/submissions';

/**
 * Which analysis produced this result: the version that ran, the detectors it ran, the configuration it ran under,
 * and the digest of what it read.
 *
 * Every one of these fields arrives with every analysis and none of them was displayed anywhere. For anyone
 * reproducing a result — a researcher citing it, a teacher asking why two runs of one project differ — that is the
 * difference between a screenshot and a citation.
 *
 * Only what the analysis itself carries. Not the submission token, which is the authorization to read it, and not
 * anything about how or where it is stored.
 */
export function AnalysisContext({ analysis }: { analysis: BatchAnalysis }) {
    const { t } = useTranslation();

    const detectors = [...(analysis.detectors ?? [])].filter((name) => name?.trim()).sort();
    const configuration = Object.entries(analysis.configuration ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
    );
    const rows: Array<{ label: string; value: string }> = (
        [
            { label: t('analysisContextName'), value: analysis.name },
            { label: t('analysisContextStatus'), value: analysis.status },
            { label: t('analysisContextVersion'), value: analysis.litterboxVersion },
            { label: t('analysisContextSchema'), value: analysis.reportSchemaVersion },
            { label: t('analysisContextLocale'), value: analysis.locale },
            { label: t('analysisContextProvenance'), value: analysis.provenance },
            { label: t('analysisContextInputFormat'), value: analysis.inputFormat },
            { label: t('analysisContextSource'), value: analysis.sourceSha256 },
        ] as const
    ).flatMap(({ label, value }) =>
        // A row reading "unknown" is a row that says nothing. Absent metadata is simply absent.
        value?.trim() ? [{ label, value: value.trim() }] : [],
    );

    if (rows.length === 0 && detectors.length === 0 && configuration.length === 0) return null;

    return (
        <details className="result-card card analysis-context">
            <summary>
                <h2>{t('analysisContextTitle')}</h2>
            </summary>
            <p className="hint">{t('analysisContextLead')}</p>
            <dl className="data-list analysis-context-list">
                {rows.map((row) => (
                    <div key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                    </div>
                ))}
                {detectors.length > 0 && (
                    <div>
                        <dt>{t('analysisContextDetectors')}</dt>
                        <dd>{detectors.join(', ')}</dd>
                    </div>
                )}
                {configuration.map(([key, value]) => (
                    <div key={`configuration-${key}`}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
        </details>
    );
}
