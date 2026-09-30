// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { DEFAULT_ASSESSMENT_LIMITS, type AssessmentLimits } from '../api/capabilities';
import type { CapabilityState } from './capabilities';

export const featureEnabled = (
    features: readonly string[],
    ...names: readonly string[]
): boolean => {
    const enabled = new Set(features);
    return names.some((name) => enabled.has(name));
};

export const capabilityEnabled = (state: CapabilityState, ...names: readonly string[]): boolean =>
    state.status === 'ready' && featureEnabled(state.value.enabledFeatures, ...names);

export const TEACHER_FEATURES = ['teacher-archive', 'studio', 'qlc'] as const;

export const teacherWorkflowEnabled = (features: readonly string[]): boolean =>
    featureEnabled(features, ...TEACHER_FEATURES);

export const assessmentLimits = (state: CapabilityState): AssessmentLimits =>
    (state.status === 'ready' ? state.value.assessmentLimits : undefined) ??
    DEFAULT_ASSESSMENT_LIMITS;
