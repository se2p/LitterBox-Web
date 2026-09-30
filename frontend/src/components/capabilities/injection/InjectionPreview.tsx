// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useMemo, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../api/capabilities';
import type { InjectionPreviewDto } from '../../../api/generated';
import { Alert } from '../../Alert';
import { spriteDisplayName } from '../../single-project/sprite-name';
import { ScriptDiffPanels } from '../../single-project/ScriptDiffPanels';
import { failureKeys, resultKey, resultOrdinals } from './injection-utils';

export function InjectionPreview({
    preview,
    injectorNames,
    locale,
    downloading,
    onDownloadResult,
    onDownloadAll,
    headingRef,
}: {
    preview: InjectionPreviewDto;
    /** The human name the catalogue gives each injector, keyed by the ID the preview itself answers in. */
    injectorNames: ReadonlyMap<string, string>;
    locale: SupportedLocale;
    /** The one download in flight, if any: the key of a single mutation, or every mutation at once. */
    downloading: string | 'all' | undefined;
    onDownloadResult: (injectorId: string, resultIndex: number) => void;
    onDownloadAll: () => void;
    headingRef: RefObject<HTMLHeadingElement | null>;
}) {
    const { t } = useTranslation();
    const noResults = preview.results.length === 0;
    const busy = downloading !== undefined;
    // Only meaningful once there is more than one: a sprite the injector changed just once needs nothing beyond
    // its own heading to be told apart from the rest of the list.
    const ordinals = useMemo(() => resultOrdinals(preview.results), [preview.results]);
    const injectorName = (injectorId: string) => injectorNames.get(injectorId) ?? injectorId;
    return (
        <section className="injection-preview" aria-labelledby="injection-preview-heading">
            <h3 id="injection-preview-heading" ref={headingRef} tabIndex={-1}>
                {t('injectionPreviewReady')}
            </h3>
            <p>
                {t('injectionPreviewSource')}: <strong>{preview.source.name}</strong>
            </p>
            {preview.failures.length > 0 && (
                <Alert tone={noResults ? 'info' : 'warning'}>
                    <p>{t(noResults ? 'injectionNoApplicable' : 'injectionPartialFailure')}</p>
                    <ul className="injection-failure-list">
                        {preview.failures.map((failure, index) => (
                            <li key={`${failure.injectorId}-${index}`}>
                                <strong>{injectorName(failure.injectorId)}</strong> ·{' '}
                                {failure.finderId}:{' '}
                                {/* The service can report a mutation failure code this frontend does not
                                    recognise, so an unmapped code falls back to the generic failure label
                                    rather than being trusted as a key. */}
                                {t(failureKeys[failure.code] ?? 'injectionFailureFailed')}
                            </li>
                        ))}
                    </ul>
                </Alert>
            )}
            {noResults ? (
                <p className="empty-state">{t('injectionNoApplicableBody')}</p>
            ) : (
                <div className="injection-result-list">
                    {/* Wanting all of them is the ordinary case for a teacher building a set of faulty projects,
                        not choosing, confirming and saving each one in turn. */}
                    <div className="injection-bulk-download">
                        <button
                            type="button"
                            className="primary-action"
                            onClick={onDownloadAll}
                            disabled={busy}
                        >
                            {downloading === 'all'
                                ? t('injectionDownloadingAll')
                                : t('injectionDownloadAll', { count: preview.results.length })}
                        </button>
                        <p className="hint">{t('injectionDownloadAllHint')}</p>
                    </div>
                    {preview.results.map((result) => {
                        const key = resultKey(result.injectorId, result.resultIndex);
                        const ordinal = ordinals.get(key);
                        const spriteLabel = spriteDisplayName(result.spriteName, t('stageName'));
                        return (
                            <article className="injection-result" key={key}>
                                <div className="injection-result-heading">
                                    <h4>
                                        {injectorName(result.injectorId)} ·{' '}
                                        {t('injectionSpriteName')}: {spriteLabel}
                                        {/* Distinct scripts on one sprite that the same injector changed could be
                                            told apart by their script IDs, but those name nothing a Scratch user
                                            has seen, so this stands in for them instead. */}
                                        {ordinal && ordinal.count > 1 && (
                                            <>
                                                {' · '}
                                                {t('injectionResultOrdinal', {
                                                    position: ordinal.position,
                                                    count: ordinal.count,
                                                })}
                                            </>
                                        )}
                                    </h4>
                                    {/* The mutation is the thing; saving it is one press on the mutation
                                        itself, not a selection made somewhere else and confirmed. */}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onDownloadResult(result.injectorId, result.resultIndex)
                                        }
                                        disabled={busy}
                                    >
                                        {downloading === key
                                            ? t('injectionDownloadingOne')
                                            : t('injectionDownloadOne')}
                                    </button>
                                </div>
                                <dl className="injection-result-metadata">
                                    <div>
                                        <dt>{t('injectionFinderId')}</dt>
                                        <dd>{result.finderId}</dd>
                                    </div>
                                </dl>
                                {/* Two drawings of a script that differ in one block are all but identical to look
                                    at, and the reader was left to find the difference themselves. */}
                                <ScriptDiffPanels
                                    before={result.originalScratchblocks}
                                    after={result.mutatedScratchblocks}
                                    locale={locale}
                                    beforeLabel={t('injectionOriginalScript')}
                                    afterLabel={t('injectionMutatedScript')}
                                />
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
