// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * The name the analyser gives the stage actor. It is the same in every locale, because it is the identifier the project
 * file itself uses, not a word chosen for a reader.
 */
export const STAGE_ACTOR_NAME = 'Stage';

/**
 * A sprite name as the reader should meet it. Everything a child named themselves is shown untouched; only the stage
 * carries an English identifier they never chose, so that one is replaced by the word their Scratch editor uses.
 *
 * <p>A sprite a child deliberately called "Stage" would be renamed here too. Scratch keeps that name for the stage
 * itself, so it is not a name a project can hand us — and the cost if it ever did is one mislabelled filter button.
 */
export const spriteDisplayName = (name: string | null | undefined, stageLabel: string): string => {
    const trimmed = name?.trim() ?? '';
    return trimmed === STAGE_ACTOR_NAME ? stageLabel : trimmed;
};
