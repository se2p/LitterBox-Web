// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob } from '../../lib/download-blob';
import type { OverviewMetric } from '../../lib/overview-metrics';
import { FAMILY_LABEL_KEYS, issueFamily, type IssueFamily } from '../single-project/issue-family';
import { batchCsv, csvBundleBlob, featureMatrixCsv, findingProfileCsv } from './batch-csv';
import { csvBlob } from '../../lib/csv';
import { featureColumnLabels, overviewMetricColumn, type FeatureMatrix } from './batch-analytics';
import {
    STATUS_LABEL_KEYS,
    unnamedProjectLabel,
    type BatchRow,
    type FinderFrequency,
} from './batch-summary';

const fileStem = (token: string): string =>
    token.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'class-set';

export function BatchCsvExport({
    token,
    rows,
    families,
    measurements,
    finders,
    selectedColumns,
    matrix,
}: {
    token: string;
    rows: readonly BatchRow[];
    families: readonly IssueFamily[];
    measurements: readonly OverviewMetric[];
    finders: readonly FinderFrequency[];
    selectedColumns: readonly string[];
    matrix: FeatureMatrix;
}) {
    const { t } = useTranslation();
    const [dataset, setDataset] = useState<'matrix' | 'wide' | 'issues' | 'all'>('matrix');
    const [downloadState, setDownloadState] = useState<'idle' | 'working' | 'error'>('idle');

    const labels = useMemo(() => featureColumnLabels(matrix, t, finders), [matrix, t, finders]);

    if (rows.length === 0) return null;

    const selected = new Set(selectedColumns);
    const statusOf = (status: string) => {
        const key = STATUS_LABEL_KEYS[status];
        return key ? t(key) : status;
    };
    const unnamedProject = unnamedProjectLabel(t);
    const wideContent = () =>
        batchCsv({
            rows,
            families: families.filter((family) => selected.has(`family:${family}`)),
            measurements: measurements.filter(
                (metric) => overviewMetricColumn(selectedColumns, metric) !== undefined,
            ),
            finders: finders.filter((finder) => selected.has(`finder:${finder.finderId}`)),
            labels: {
                project: t('batchProject'),
                status: t('batchAnalysisStatus'),
                total: t('batchTotalFindings'),
                family: (family) => t(FAMILY_LABEL_KEYS[family]),
                measurement: (metric) => t(metric),
                statusOf,
                unnamedProject,
            },
        });

    const matrixContent = () =>
        featureMatrixCsv(matrix, selectedColumns, {
            project: t('batchProject'),
            column: (column) => labels.get(column) ?? column,
        });

    const findingContent = () =>
        findingProfileCsv(
            rows,
            selectedColumns
                .filter((column) => column.startsWith('finder:'))
                .map((column) => column.slice('finder:'.length)),
            {
                project: t('batchProject'),
                status: t('batchAnalysisStatus'),
                finderId: t('batchFinderId'),
                finder: t('batchFinder'),
                family: t('batchFindingFamily'),
                occurrences: t('batchOccurrences'),
                statusOf,
                familyOf: (family) => t(FAMILY_LABEL_KEYS[issueFamily(family)]),
                unnamedProject,
            },
        );

    const save = async (
        selectedDatasets: Array<{ name: string; content: string }>,
        downloadName: string,
    ) => {
        if (selectedDatasets.length === 0) return;
        setDownloadState('working');
        try {
            const bundle = selectedDatasets.length > 1;
            const only = selectedDatasets[0];
            const saved = downloadBlob(
                bundle ? await csvBundleBlob(selectedDatasets) : csvBlob(only.content),
                downloadName,
            );
            setDownloadState(saved ? 'idle' : 'error');
        } catch {
            setDownloadState('error');
        }
    };

    const download = () => {
        const stem = fileStem(token);
        if (dataset === 'matrix') {
            void save(
                [{ name: 'feature-matrix.csv', content: matrixContent() }],
                `${stem}-feature-matrix.csv`,
            );
            return;
        }
        if (dataset === 'wide') {
            void save([{ name: 'projects.csv', content: wideContent() }], `${stem}-projects.csv`);
            return;
        }
        if (dataset === 'issues') {
            void save(
                [{ name: 'findings.csv', content: findingContent() }],
                `${stem}-findings.csv`,
            );
            return;
        }
        void save(
            [
                { name: 'projects.csv', content: wideContent() },
                { name: 'feature-matrix.csv', content: matrixContent() },
                { name: 'findings.csv', content: findingContent() },
            ],
            `${stem}.zip`,
        );
    };

    const description = {
        matrix: 'batchCsvMatrixHint',
        wide: 'batchCsvWideHint',
        issues: 'batchCsvFindingHint',
        all: 'batchCsvAllHint',
    } as const;

    return (
        <div className="batch-matrix-export">
            <div className="batch-export-controls">
                <label>
                    <span>{t('batchCsvDatasets')}</span>
                    <select
                        value={dataset}
                        onChange={(event) =>
                            setDataset(event.target.value as 'matrix' | 'wide' | 'issues' | 'all')
                        }
                    >
                        <option value="matrix">{t('batchCsvMatrixDataset')}</option>
                        <option value="wide">{t('batchCsvWideDataset')}</option>
                        <option value="issues">{t('batchCsvFindingDataset')}</option>
                        <option value="all">{t('batchCsvAllDatasets')}</option>
                    </select>
                </label>
                <button
                    type="button"
                    className="primary-action"
                    onClick={download}
                    disabled={
                        downloadState === 'working' ||
                        (dataset === 'matrix' && selectedColumns.length === 0)
                    }
                >
                    {t(dataset === 'all' ? 'batchCsvDownloadZip' : 'batchCsvDownload')}
                </button>
            </div>
            <p className="hint">{t(description[dataset])}</p>
            {downloadState === 'working' && <span role="status">{t('batchCsvPreparing')}</span>}
            {downloadState === 'error' && <span role="alert">{t('batchCsvError')}</span>}
        </div>
    );
}
