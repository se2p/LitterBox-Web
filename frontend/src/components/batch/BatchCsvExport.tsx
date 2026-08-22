// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OverviewMetric } from '../../lib/overview-metrics';
import { FAMILY_LABEL_KEYS, type IssueFamily } from '../single-project/issue-family';
import { batchCsv, csvBlob, type CsvSections } from './batch-csv';
import { STATUS_LABEL_KEYS, type BatchRow, type FinderFrequency } from './batch-summary';

/** The safe part of a token, so two class sets do not land in a downloads folder under one name. */
const fileStem = (token: string): string =>
    token.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'class-set';

/**
 * The class set as a file. A table on a screen answers the question a teacher had while looking at it; a file
 * answers the ones they have afterwards, in whatever they already keep their marks in.
 *
 * What goes in is a choice, because the finder columns are one per finder and a class that shared eight problems
 * makes a wide sheet nobody asked for.
 */
export function BatchCsvExport({
    token,
    rows,
    families,
    measurements,
    finders,
}: {
    token: string;
    rows: readonly BatchRow[];
    families: readonly IssueFamily[];
    measurements: readonly OverviewMetric[];
    finders: readonly FinderFrequency[];
}) {
    const { t } = useTranslation();
    const groupId = useId();
    const [sections, setSections] = useState<CsvSections>({
        families: true,
        measurements: true,
        // Off to begin with: one column per finder is the widest thing here and the least often wanted.
        finders: false,
    });

    if (rows.length === 0) return null;

    const download = () => {
        const content = batchCsv({
            rows,
            families,
            measurements,
            finders,
            sections,
            labels: {
                project: t('batchProject'),
                status: t('batchAnalysisStatus'),
                total: t('batchTotalFindings'),
                family: (family) => t(FAMILY_LABEL_KEYS[family]),
                measurement: (metric) => t(metric),
                statusOf: (status) => {
                    const key = STATUS_LABEL_KEYS[status];
                    return key ? t(key) : status;
                },
                unnamedProject: (position) => `${t('batchProject')} ${position}`,
            },
        });
        // Nothing leaves the browser: the table is already here, and building the file anywhere else would send a
        // class's project names to a service that has no reason to see them again.
        if (typeof URL.createObjectURL !== 'function') return;
        const url = URL.createObjectURL(csvBlob(content));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileStem(token)}.csv`;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const toggle = (section: keyof CsvSections) => (checked: boolean) =>
        setSections((current) => ({ ...current, [section]: checked }));

    return (
        <details className="batch-csv-export">
            <summary>{t('batchCsvTitle')}</summary>
            <p className="hint">{t('batchCsvLead')}</p>
            <fieldset className="batch-csv-sections" aria-describedby={`${groupId}-hint`}>
                <legend>{t('batchCsvInclude')}</legend>
                <label>
                    <input
                        type="checkbox"
                        checked={sections.families}
                        onChange={(event) => toggle('families')(event.target.checked)}
                    />
                    <span>{t('batchCsvFamilies')}</span>
                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={sections.measurements}
                        onChange={(event) => toggle('measurements')(event.target.checked)}
                    />
                    <span>{t('batchCsvMeasurements')}</span>
                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={sections.finders}
                        onChange={(event) => toggle('finders')(event.target.checked)}
                        disabled={finders.length === 0}
                    />
                    <span>{t('batchCsvFinders')}</span>
                </label>
            </fieldset>
            <p id={`${groupId}-hint`} className="hint">
                {t('batchCsvRowsHint')}
            </p>
            <button type="button" className="primary-action" onClick={download}>
                {t('batchCsvDownload')}
            </button>
        </details>
    );
}
