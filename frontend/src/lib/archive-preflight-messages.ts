// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { TranslationKey } from '../i18n/locales';
import type { ArchivePreflightReason } from './archive-preflight';

/** Several rejection reasons share one explanation, because the distinction only matters to the inspector. */
export const preflightMessageKey = (reason: ArchivePreflightReason): TranslationKey => {
    switch (reason) {
        case 'too-large':
            return 'preflighttoo_large';
        case 'unsupported-type':
            return 'preflightunsupported_type';
        case 'missing-project-json':
            return 'preflightmissing_project_json';
        case 'unsafe-entry':
        case 'duplicate-entry':
        case 'too-deep':
            return 'preflightunsafe_entry';
        case 'several-folders':
            return 'preflightseveral_folders';
        case 'too-many-entries':
            return 'preflighttoo_many_entries';
        case 'too-large-uncompressed':
        case 'too-large-manifest':
            return 'preflighttoo_large_uncompressed';
        case 'unsupported-batch-type':
            return 'preflightunsupported_batch_type';
        case 'url-list-too-large':
            return 'preflighturl_list_too_large';
        case 'invalid-url-list':
            return 'preflightinvalid_url_list';
        case 'empty-url-list':
            return 'preflightempty_url_list';
        case 'too-many-projects':
            return 'preflighttoo_many_projects';
        default:
            return 'preflightinvalid_archive';
    }
};
