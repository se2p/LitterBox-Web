// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * The last few projects this browser sent for analysis, kept on the device so a reader can go back to a result, or
 * put the same project through a different analysis, without keeping a token anywhere themselves. Nothing here is
 * sent to the service: the token is what the result link already contains.
 */
export type RecentAnalysisKind = 'issues' | 'questions' | 'batch';

/**
 * The kinds a project can be taken from and put through another analysis. A class set is not one of them: a reuse
 * carries one project, and a set is many.
 */
export type ReusableKind = Exclude<RecentAnalysisKind, 'batch'>;
export type ReusableProject = RecentProject & { kind: ReusableKind };

export interface RecentProject {
    token: string;
    /**
     * The project's own name, as the analysis reported it; what a reader recognises it by. Empty for a class set
     * opened from a shared link, which arrives with nothing on it a teacher would recognise.
     */
    name: string;
    kind: RecentAnalysisKind;
    /** How many projects a class set holds. Two sets from one class look alike until you count them. */
    projects?: number;
    /** Present for a completed single-project analysis, which is what the advanced workspace opens. */
    analysisId?: number;
    /**
     * When this result was last put in front of the reader, in epoch milliseconds. Two results of the same project
     * carry the same name, so without this there is nothing on the page that tells them apart.
     */
    at?: number;
    /**
     * The result this one was made from, when the same project was put through a second analysis. The two results
     * have different links, so without this the way back to the first one is only in the reader's history.
     */
    origin?: { token: string; kind: ReusableKind };
}

const STORAGE_KEY = 'litterbox.recent-projects';
/** Per kind, not overall: five class sets in a row must not push a teacher's own project analyses out of reach. */
const MAX_REMEMBERED = 5;
const KINDS: readonly RecentAnalysisKind[] = ['issues', 'questions', 'batch'];

const isKind = (value: unknown): value is RecentAnalysisKind =>
    KINDS.includes(value as RecentAnalysisKind);
const MAX_NAME_LENGTH = 120;
const MAX_TOKEN_LENGTH = 128;

const storage = (): Storage | undefined => {
    if (typeof window === 'undefined') return undefined;
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
};

// Anything may be sitting under this key — an older shape, another tool's data, or nonsense. Only entries that are
// exactly what this module writes are handed back.
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
    const at =
        typeof candidate.at === 'number' && Number.isFinite(candidate.at) && candidate.at > 0
            ? candidate.at
            : undefined;
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

// An origin is held to the same standard as an entry, and a result may not claim to have come from itself.
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

/**
 * The newest few of each kind, in the order they were already in. A teacher who sent one class set and then checked
 * five of the projects out of it would otherwise have lost the class set, which is the one link they cannot rebuild.
 */
const capPerKind = (entries: readonly RecentProject[]): RecentProject[] => {
    const seen = new Map<RecentAnalysisKind, number>();
    return entries.filter((entry) => {
        const taken = seen.get(entry.kind) ?? 0;
        if (taken >= MAX_REMEMBERED) return false;
        seen.set(entry.kind, taken + 1);
        return true;
    });
};

export const recentProjects = (): RecentProject[] => {
    const store = storage();
    if (!store) return [];
    try {
        const raw = store.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return capPerKind(
            parsed.map(validEntry).filter((entry): entry is RecentProject => entry !== undefined),
        );
    } catch {
        return [];
    }
};

/** Newest first, one entry per result; remembering the same result again refreshes what is known about it. */
export const rememberProject = (entry: RecentProject): void => {
    const store = storage();
    const valid = validEntry(entry);
    if (!store || !valid) return;
    const known = recentProjects();
    const previous = known.find((candidate) => candidate.token === valid.token);
    // A result page remembers itself as soon as it loads, knowing its name but not that it was made from another
    // result. Refreshing an entry adds to what is known about it rather than replacing it.
    const merged: RecentProject = {
        ...valid,
        // Every visit to a result refreshes this, so it says when the device last had the result in front of it,
        // which is what "recent" means here and what tells two results of one project apart.
        at: valid.at ?? Date.now(),
        // A class set is named by the page that sent it, from the archive it was made of, and the result page it
        // lands on has no such name to offer. Forgetting it on the second visit is not "adding to what is known".
        ...(valid.name.trim() === '' && previous !== undefined ? { name: previous.name } : {}),
        ...(valid.projects === undefined && previous?.projects !== undefined
            ? { projects: previous.projects }
            : {}),
        ...(valid.analysisId === undefined && previous?.analysisId !== undefined
            ? { analysisId: previous.analysisId }
            : {}),
        ...(valid.origin === undefined && previous?.origin !== undefined
            ? { origin: previous.origin }
            : {}),
    };
    const kept = capPerKind([
        merged,
        ...known.filter((candidate) => candidate.token !== merged.token),
    ]);
    try {
        store.setItem(STORAGE_KEY, JSON.stringify(kept));
    } catch {
        // Remembering is a convenience, and a full or blocked store must not break the page.
    }
};

export const forgetProjects = (): void => {
    const store = storage();
    if (!store) return;
    try {
        store.removeItem(STORAGE_KEY);
    } catch {
        // As above: nothing on the page depends on this succeeding.
    }
};

/**
 * The one a reader means when they say "the project I just did", or nothing if this device remembers none. Never a
 * class set: a set is not a project, and nothing that offers to put "it" through another analysis can take one.
 */
export const latestProject = (): ReusableProject | undefined =>
    recentProjects().find((project): project is ReusableProject => project.kind !== 'batch');

/** What this device knows about one result, which is nothing at all when it was opened from a shared link. */
export const rememberedProject = (token: string): RecentProject | undefined =>
    recentProjects().find((project) => project.token === token);

/**
 * Every remembered result the advanced tools can work from, newest first. A question set is a result too, but it
 * holds no findings and no analysis the comparison could name, so it is not one of these.
 */
export const analysedProjects = (): (ReusableProject & { analysisId: number })[] =>
    recentProjects().filter(
        (project): project is ReusableProject & { analysisId: number } =>
            project.kind === 'issues' && project.analysisId !== undefined,
    );
