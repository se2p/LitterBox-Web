// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { createContext, useContext } from 'react';

export type ProjectSetFilterHandler = (
    key: string,
    ids: ReadonlySet<string>,
    label: string,
) => void;

export interface ProjectSetFilter {
    activeKey?: string;
    toggle: ProjectSetFilterHandler;
}

const ProjectSetFilterContext = createContext<ProjectSetFilter | undefined>(undefined);

export const ProjectSetFilterProvider = ProjectSetFilterContext.Provider;

export const useProjectSetFilter = (): ProjectSetFilter | undefined =>
    useContext(ProjectSetFilterContext);
