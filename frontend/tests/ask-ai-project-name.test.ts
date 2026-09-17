// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import { askAiProjectName } from '../src/components/ask-ai/project-name';

describe('what the Ask AI screens call a project', () => {
    it('drops the file ending an upload arrived under', () => {
        expect(askAiProjectName('cat-chase.sb3', 'your project')).toBe('cat chase');
        expect(askAiProjectName('Robot.MBLOCK', 'your project')).toBe('Robot');
    });

    it('speaks the separators a filename uses where a name would have spaces', () => {
        expect(askAiProjectName('litterbox-derived', 'your project')).toBe('litterbox derived');
        expect(askAiProjectName('tic_tac_toe.sb3', 'your project')).toBe('tic tac toe');
        expect(askAiProjectName('-_-', 'your project')).toBe('your project');
    });

    it('keeps a name that is not a filename exactly as it is', () => {
        expect(askAiProjectName('Mein Spiel 2', 'your project')).toBe('Mein Spiel 2');
        expect(askAiProjectName('v1.2 chase', 'your project')).toBe('v1.2 chase');
        expect(askAiProjectName('Tom - der Roboter', 'your project')).toBe('Tom - der Roboter');
    });

    it('says words rather than a share token when there is no name to show', () => {
        expect(askAiProjectName(undefined, 'your project')).toBe('your project');
        expect(askAiProjectName(null, 'your project')).toBe('your project');
        expect(askAiProjectName('   ', 'your project')).toBe('your project');
        expect(askAiProjectName('.sb3', 'your project')).toBe('your project');
    });
});
