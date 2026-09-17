// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

const PROJECT_FILE_ENDINGS = ['.sb3', '.sb2', '.sb', '.mblock', '.zip'];

export function askAiProjectName(name: string | null | undefined, fallback: string): string {
    const trimmed = name?.trim() ?? '';
    if (trimmed.length === 0) return fallback;
    const ending = PROJECT_FILE_ENDINGS.find((suffix) => trimmed.toLowerCase().endsWith(suffix));
    const withoutEnding = ending ? trimmed.slice(0, -ending.length).trim() : trimmed;
    const spoken = /\s/.test(withoutEnding)
        ? withoutEnding
        : withoutEnding.replace(/[-_]+/g, ' ').trim();
    return spoken.length > 0 ? spoken : fallback;
}
