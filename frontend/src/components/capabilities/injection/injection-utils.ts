// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { SupportedLocale } from '../../../api/capabilities';
import type {
    InjectionPreviewDto,
    InjectionResultViewDto,
    InjectorViewDto,
} from '../../../api/generated';
import { isInjectionSourceFormat, type InjectionErrorCategory } from '../../../api/injections';
import type { TranslationKey } from '../../../i18n/locales';
import {
    richHintTerms,
    scratchblocksSourceForInline,
    parseRichHint,
    type RichHintNode,
} from '../../single-project/rich-hint';

export const errorKeys: Record<InjectionErrorCategory, TranslationKey> = {
    capability_disabled: 'injectionErrorDisabled',
    authorization_required: 'injectionErrorAuthorization',
    analysis_not_found: 'injectionErrorNotFound',
    analysis_not_ready: 'injectionErrorNotReady',
    capability_limit_exceeded: 'injectionErrorLimit',
    unsupported_source_format: 'injectionErrorUnsupported',
    no_applicable_mutation: 'injectionErrorNoApplicable',
    capability_unavailable: 'injectionErrorUnavailable',
    capability_timeout: 'injectionErrorTimeout',
    analysis_capacity_exhausted: 'injectionErrorCapacity',
    invalid_request: 'injectionErrorRequest',
    malformed_response: 'injectionErrorResponse',
    response_too_large: 'injectionErrorTooLarge',
    network_failure: 'injectionErrorNetwork',
    cancellation: 'injectionErrorCanceled',
};

// The service can report a mutation failure code this frontend does not know about yet, so lookup is partial and
// InjectionPreview falls back to a generic label rather than trusting an arbitrary server string as a key.
export const failureKeys: Partial<Record<string, TranslationKey>> = {
    no_applicable_mutation: 'injectionFailureNoApplicable',
    injector_unavailable: 'injectionFailureUnavailable',
    injector_failed: 'injectionFailureFailed',
};

const isPositiveSafeInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const injectionEligible = (
    enabled: boolean,
    analysisId: unknown,
    analysisStatus: string | null | undefined,
    inputFormat: string | null | undefined,
): boolean =>
    enabled &&
    isPositiveSafeInteger(analysisId) &&
    String(analysisStatus ?? '').toLowerCase() === 'completed' &&
    isInjectionSourceFormat(inputFormat);

export const resultKey = (injectorId: string, resultIndex: number): string =>
    JSON.stringify([injectorId, resultIndex]);

export const resultForKey = (preview: InjectionPreviewDto | undefined, key: string | undefined) =>
    preview?.results.find((result) => resultKey(result.injectorId, result.resultIndex) === key);

/**
 * Where a result sits among the others the same injector produced for the same sprite, and how many there are in
 * total. Two mutations of different scripts on one sprite could be told apart by the script IDs the service
 * returns for each, but those name nothing a Scratch user has ever seen, so this is what tells such results apart
 * instead, without ever showing a reader one.
 */
export const resultOrdinals = (
    results: readonly InjectionResultViewDto[],
): Map<string, { position: number; count: number }> => {
    const groups = new Map<string, InjectionResultViewDto[]>();
    for (const result of results) {
        const groupKey = JSON.stringify([result.injectorId, result.spriteName]);
        const group = groups.get(groupKey);
        if (group) group.push(result);
        else groups.set(groupKey, [result]);
    }
    const ordinals = new Map<string, { position: number; count: number }>();
    for (const group of groups.values())
        group.forEach((result, index) =>
            ordinals.set(resultKey(result.injectorId, result.resultIndex), {
                position: index + 1,
                count: group.length,
            }),
        );
    return ordinals;
};

const normalizeSearchText = (value: string, locale: SupportedLocale): string =>
    value.normalize('NFKC').toLocaleLowerCase(locale).replace(/\s+/gu, ' ').trim();

export { normalizeSearchText };

const plainTextForRichHint = (nodes: RichHintNode[], locale: SupportedLocale): string => {
    const terms = richHintTerms(locale);
    return nodes
        .map((node) => {
            switch (node.kind) {
                case 'text':
                    return node.value;
                case 'lineBreak':
                    return ' ';
                case 'format':
                    return plainTextForRichHint(node.children, locale);
                case 'variablesBadge':
                    return terms.variables;
                case 'term':
                    return node.term === 'true' ? terms.trueValue : terms.falseValue;
                case 'inline':
                    return scratchblocksSourceForInline(node, locale);
                case 'script':
                    return node.source;
            }
        })
        .join(' ');
};

/**
 * The catalogue arrives in the order of the injectors' English identifiers, which is no order at all once their names
 * are read in another language: a German reader met "Uneindeutige Namen" before "Blockierendes Wenn-Sonst" and had no
 * way to tell why. Sorted by the name on screen, the list can be scanned.
 */
export const sortInjectorsByName = (
    injectors: InjectorViewDto[],
    locale: SupportedLocale,
): InjectorViewDto[] => {
    const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
    return [...injectors].sort(
        (left, right) =>
            collator.compare(left.name, right.name) ||
            collator.compare(left.injectorId, right.injectorId),
    );
};

export const searchableInjectorText = (
    injector: InjectorViewDto,
    locale: SupportedLocale,
): string =>
    normalizeSearchText(
        `${injector.name} ${plainTextForRichHint(parseRichHint(injector.description), locale)}`,
        locale,
    );
