// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { BASE_URL } from '../lib/base-url';
import type { CapabilitiesDto } from './generated';

export const SUPPORTED_LOCALES = ['de', 'en', 'es', 'nl'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const CAPABILITIES_SCHEMA_VERSION = 1;

export const CAPABILITIES_URL = `${BASE_URL}api/v1/capabilities`;

export type Capabilities = Omit<CapabilitiesDto, 'supportedLocales'> & {
    supportedLocales: SupportedLocale[];
};
