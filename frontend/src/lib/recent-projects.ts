// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useSyncExternalStore } from 'react';
import { forgetAssessmentDrafts } from '../components/questions/assessment-draft-store';
import { readRaw, readValidatedList, storage, storedTimestamp, writeList } from './device-store';

export type RecentAnalysisKind = 'issues' | 'questions' | 'batch';

export type ReusableKind = Exclude<RecentAnalysisKind, 'batch'>;
export type ReusableProject = RecentProject & { kind: ReusableKind };

export interface RecentProject {
    token: string;
    name: string;
    kind: RecentAnalysisKind;
    projects?: number;
    analysisId?: number;
    at?: number;
    origin?: { token: string; kind: ReusableKind };
}

const STORAGE_KEY = 'litterbox.recent-projects';
const MAX_REMEMBERED = 5;
const KINDS: readonly RecentAnalysisKind[] = ['issues', 'questions', 'batch'];

const isKind = (value: unknown): value is RecentAnalysisKind =>
    KINDS.includes(value as RecentAnalysisKind);
const MAX_NAME_LENGTH = 120;
const MAX_TOKEN_LENGTH = 128;

const validEntry = (value: unknown): RecentProject | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<RecentProject>;
    if (typeof candidate.token !== 'string' || typeof candidate.name !== 'string') return undefined;
    if (candidate.token.trim().length === 0 || candidate.token.length > MAX_TOKEN_LENGTH)
        return undefined;
    if (!isKind(candidate.kind)) return undefined;
    const projects =
        typeof candidate.projects === 'number' &&
        Number.isSafeInteger(candidate.projects) &&
        candidate.projects > 0
            ? candidate.projects
            : undefined;
    const analysisId =
        typeof candidate.analysisId === 'number' &&
        Number.isSafeInteger(candidate.analysisId) &&
        candidate.analysisId > 0
            ? candidate.analysisId
            : undefined;
    const at = storedTimestamp(candidate.at);
    return {
        token: candidate.token,
        name: candidate.name.slice(0, MAX_NAME_LENGTH),
        kind: candidate.kind,
        ...(projects === undefined ? {} : { projects }),
        ...(analysisId === undefined ? {} : { analysisId }),
        ...(at === undefined ? {} : { at }),
        ...(validOrigin(candidate.origin, candidate.token) ?? {}),
    };
};

const validOrigin = (
    value: unknown,
    token: string,
): { origin: NonNullable<RecentProject['origin']> } | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<NonNullable<RecentProject['origin']>>;
    if (typeof candidate.token !== 'string') return undefined;
    if (candidate.token.trim().length === 0 || candidate.token.length > MAX_TOKEN_LENGTH)
        return undefined;
    if (candidate.token === token) return undefined;
    if (candidate.kind !== 'issues' && candidate.kind !== 'questions') return undefined;
    return { origin: { token: candidate.token, kind: candidate.kind } };
};

const capPerKind = (entries: readonly RecentProject[]): RecentProject[] => {
    const seen = new Map<RecentAnalysisKind, number>();
    return entries.filter((entry) => {
        const taken = seen.get(entry.kind) ?? 0;
        if (taken >= MAX_REMEMBERED) return false;
        seen.set(entry.kind, taken + 1);
        return true;
    });
};

export const recentProjects = (): RecentProject[] =>
    capPerKind(readValidatedList(STORAGE_KEY, validEntry));

export const rememberProject = (entry: RecentProject): void => {
    const valid = validEntry(entry);
    if (!valid) return;
    const known = recentProjects();
    const previous = known.find((candidate) => candidate.token === valid.token);
    // validEntry omits absent optional fields, so the spread keeps what the previous entry knew.
    const merged: RecentProject = {
        ...previous,
        ...valid,
        at: valid.at ?? Date.now(),
        name: valid.name.trim() === '' && previous !== undefined ? previous.name : valid.name,
    };
    const kept = capPerKind([
        merged,
        ...known.filter((candidate) => candidate.token !== merged.token),
    ]);
    writeList(STORAGE_KEY, kept);
};

export const forgetProjects = (kinds?: readonly RecentAnalysisKind[]): void => {
    if (kinds === undefined || kinds.includes('questions')) forgetAssessmentDrafts();
    const store = storage();
    if (!store) return;
    try {
        if (kinds === undefined) {
            store.removeItem(STORAGE_KEY);
        } else {
            const kept = recentProjects().filter((project) => !kinds.includes(project.kind));
            if (kept.length === 0) store.removeItem(STORAGE_KEY);
            else writeList(STORAGE_KEY, kept);
        }
    } catch {
        return;
    }
    notifyRecentProjectsChanged();
};

const listeners = new Set<() => void>();

let cachedProjects: readonly RecentProject[] = [];
let cachedRaw: string | null | undefined;

const recentProjectsSnapshot = (): readonly RecentProject[] => {
    const raw = readRaw(STORAGE_KEY);
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedProjects = recentProjects();
    }
    return cachedProjects;
};

const notifyRecentProjectsChanged = (): void => {
    for (const listener of listeners) listener();
};

const subscribeToRecentProjects = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const useRecentProjects = (): readonly RecentProject[] =>
    useSyncExternalStore(subscribeToRecentProjects, recentProjectsSnapshot);

export const latestProject = (): ReusableProject | undefined =>
    recentProjects().find((project): project is ReusableProject => project.kind !== 'batch');

export const rememberedProject = (token: string): RecentProject | undefined =>
    recentProjects().find((project) => project.token === token);

export const analysedProjects = (
    projects: readonly RecentProject[] = recentProjects(),
): (ReusableProject & { analysisId: number })[] =>
    projects.filter(
        (project): project is ReusableProject & { analysisId: number } =>
            project.kind === 'issues' && project.analysisId !== undefined,
    );

export const checkedProjects = (
    projects: readonly RecentProject[] = recentProjects(),
): ReusableProject[] =>
    projects.filter((project): project is ReusableProject => project.kind === 'issues');
