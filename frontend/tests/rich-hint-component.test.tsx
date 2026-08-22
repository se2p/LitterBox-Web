// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RichHint } from '../src/components/single-project/RichHint';

vi.mock('../src/components/single-project/ScratchblocksPreview', () => ({
    ScratchblocksPreview: ({ source, inline }: { source: string; inline?: boolean }) =>
        inline ? <span data-inline-source={source}>{source}</span> : <pre>{source}</pre>,
}));

const renderHint = (value: string, locale = 'en') =>
    render(
        <div>
            <RichHint
                value={value}
                locale={locale}
                scratchblocksLabel="Scratchblocks"
                textAlternativeLabel="Text alternative"
            />
        </div>,
    );

describe('RichHint', () => {
    it('renders semantic formatting and locale-aware inline blocks', () => {
        const { container } = renderHint(
            '[b]Problem[/b][newLine][sbi]move (10) steps[/sbi] [var]Punkte[/var] [IF] [TRUE] [FALSE] [sbVariables]',
            'de',
        );

        expect(container.querySelector('strong')).toHaveTextContent('Problem');
        expect(container.querySelector('br')).toBeInTheDocument();
        expect(
            container.querySelector('[data-inline-source="move (10) steps"]'),
        ).toBeInTheDocument();
        expect(container.querySelector('[data-inline-source="(Punkte)"]')).toBeInTheDocument();
        expect(
            container.querySelector('[data-inline-source="falls :: #ffab19"]'),
        ).toBeInTheDocument();
        expect(container).toHaveTextContent('WAHR');
        expect(container).toHaveTextContent('FALSCH');
        expect(container).toHaveTextContent('Variablen');
    });

    it('keeps injection payloads as text and rejects unsafe colours', () => {
        const { container } = renderHint(
            '<img src="/private" onerror="alert(1)"> [c=red]safe[/c] [c=javascript:alert(1)]unsafe[/c]',
        );

        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(container.textContent).toContain('<img src="/private" onerror="alert(1)">');
        expect(container.textContent).toContain('[c=javascript:alert(1)]unsafe[/c]');
        expect(container.querySelector('.rich-hint-color')).toHaveStyle('color: rgb(255, 0, 0)');
    });
});
