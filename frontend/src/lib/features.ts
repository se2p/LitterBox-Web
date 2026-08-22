// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { CapabilityState } from './capabilities';

/**
 * Whether the service offers any of these, by the names it reports them under.
 *
 * Matched exactly. The names are a contract, not free text, and a service that answers with something merely
 * similar has not said yes: guessing that it meant this feature would turn a typo in a deployment's configuration
 * into a workflow offered to a class, whose requests the service would then refuse.
 */
export const featureEnabled = (
    features: readonly string[],
    ...names: readonly string[]
): boolean => {
    const enabled = new Set(features);
    return names.some((name) => enabled.has(name));
};

/** The same question asked of a capability lookup that may not have answered yet. */
export const capabilityEnabled = (state: CapabilityState, ...names: readonly string[]): boolean =>
    state.status === 'ready' && featureEnabled(state.value.enabledFeatures, ...names);

/**
 * What the teacher page is for. It is not only the class set: a set of questions to ask about one project,
 * and a copy of a project with a bug put into it for a class to find, are lesson preparation and are asked for
 * there too. Any one of the four is reason enough to name the page in the menu and to draw the page itself.
 *
 * Kept in one place because the menu and the page have to agree.
 */
export const TEACHER_FEATURES = ['teacher-archive', 'studio', 'qlc', 'fault-injection'] as const;

export const teacherWorkflowEnabled = (features: readonly string[]): boolean =>
    featureEnabled(features, ...TEACHER_FEATURES);
