// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import type { BatchAnalysis } from '../src/api/submissions';
import { batchCsv, findingProfileCsv, type CsvLabels } from '../src/components/batch/batch-csv';
import { batchRows, summarizeBatch } from '../src/components/batch/batch-summary';
import { csvBlob } from '../src/lib/csv';
import { issue as finding } from './helpers';

const issue = (finderId: string, type: string) =>
    finding({
        id: 1,
        finderId,
        finderName: `Finder ${finderId}`,
        type,
        currentCostume: -1,
    });

const analyses = [
    {
        id: 1,
        name: 'cat.sb3',
        status: 'completed',
        issues: [
            issue('missing-init', 'bug'),
            issue('missing-init', 'bug'),
            issue('tidy', 'smell'),
        ],
        metrics: { sprite_count: 3, block_count: 40 },
    },
    // A name a spreadsheet would try to evaluate, and one holding the delimiter and a quotation mark.
    { id: 2, name: '=cmd|calc, "the sequel".sb3', status: 'completed', issues: [], metrics: {} },
    { id: 3, name: 'still-going.sb3', status: 'running', issues: [] },
] as unknown as BatchAnalysis[];

const labels: CsvLabels = {
    project: 'Project',
    status: 'Analysis status',
    total: 'Total findings',
    family: (family) => family,
    measurement: (metric) => metric,
    statusOf: (status) => status,
    unnamedProject: (position) => `Project ${position}`,
};

const csv = (sections: { families: boolean; measurements: boolean; finders: boolean }): string => {
    const summary = summarizeBatch(analyses);
    return batchCsv({
        rows: batchRows(analyses),
        families: sections.families ? summary.families : [],
        measurements: sections.measurements ? summary.measurements : [],
        finders: sections.finders ? summary.finders : [],
        labels,
    });
};

describe('the class set as a file', () => {
    it('marks CSV downloads as UTF-8', () => {
        expect(csvBlob('Project\r\n').type).toBe('text/csv;charset=utf-8');
    });

    it('writes one row per analysis with the counts the table shows', () => {
        const lines = csv({ families: true, measurements: true, finders: false }).split('\r\n');

        expect(lines[0]).toBe(
            'Project,Analysis status,bug,smell,perfume,Total findings,metricSprites,metricBlocks',
        );
        expect(lines[1]).toBe('cat.sb3,completed,2,1,0,3,3,40');
        expect(lines[3]).toBe('still-going.sb3,running,,,,,,');
        expect(lines).toHaveLength(5);
        expect(lines[4]).toBe('');
    });

    it('keeps a project name out of the spreadsheet formula parser', () => {
        const lines = csv({ families: false, measurements: false, finders: false }).split('\r\n');

        // Quoted for the comma and the quotation mark, and prefixed so the leading = is read as text.
        expect(lines[2]).toBe('"\'=cmd|calc, ""the sequel"".sb3",completed');
    });

    it('adds a column per finder only when asked, counting occurrences', () => {
        const withoutFinders = csv({ families: false, measurements: false, finders: false });
        expect(withoutFinders).not.toContain('Finder missing-init');

        const lines = csv({ families: false, measurements: false, finders: true }).split('\r\n');
        expect(lines[0]).toBe('Project,Analysis status,Finder missing-init,Finder tidy');
        expect(lines[1]).toBe('cat.sb3,completed,2,1');
        expect(lines[2]).toMatch(/,0,0$/);
        expect(lines[3]).toBe('still-going.sb3,running,,');
    });

    it('uses every reported finder when a findings download has no explicit finder selection', () => {
        const lines = findingProfileCsv(batchRows(analyses), []).split('\r\n');

        expect(lines).toContain('cat.sb3,completed,missing-init,Finder missing-init,bug,2');
        expect(lines).toContain('cat.sb3,completed,tidy,Finder tidy,smell,1');
        expect(lines).toHaveLength(4);
    });
});
