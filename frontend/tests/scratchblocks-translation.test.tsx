// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScratchblocksPreview } from '../src/components/single-project/ScratchblocksPreview';

const drawn = async (locale: string): Promise<string> => {
    const { container } = render(
        <ScratchblocksPreview
            source={'when green flag clicked\nmove (10) steps'}
            locale={locale}
            label="Scratchblocks"
            textAlternativeLabel="Text alternative"
        />,
    );
    const host = () => container.querySelector('.scratchblocks-rendered');
    await waitFor(() => expect(host()).toHaveAttribute('data-render-state', 'ready'));
    return host()?.querySelector('svg')?.textContent ?? '';
};

describe('Scratchblocks drawn by the bundled renderer', () => {
    it('are drawn in German on a German page though they are written in English', async () => {
        const german = await drawn('de');

        expect(german).toContain('angeklickt');
        expect(german).toContain('Schritt');
        expect(german).not.toContain('steps');
    });

    it('are drawn as written on an English page', async () => {
        expect(await drawn('en')).toContain('steps');
    });
});
