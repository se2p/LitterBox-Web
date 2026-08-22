// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../api/capabilities';
import type { InjectionPreviewDto } from '../../../api/generated';
import { Alert } from '../../Alert';
import { ScriptDiffPanels } from '../../single-project/ScriptDiffPanels';
import { failureKeys, resultKey } from './injection-utils';

export function InjectionPreview({
    preview,
    locale,
    downloading,
    onDownloadResult,
    onDownloadAll,
    headingRef,
}: {
    preview: InjectionPreviewDto;
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
                                <strong>{failure.injectorId}</strong> · {failure.finderId}:{' '}
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
                        const originalLabel = `${t('injectionOriginalScript')}: ${result.originalScriptId}`;
                        const mutatedLabel = `${t('injectionMutatedScript')}: ${result.mutatedScriptId}`;
                        return (
                            <article className="injection-result" key={key}>
                                <div className="injection-result-heading">
                                    <h4>
                                        {result.injectorId} · {t('injectionSpriteName')}:{' '}
                                        {result.spriteName}
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
                                    <div>
                                        <dt>{t('injectionOriginalScript')}</dt>
                                        <dd>
                                            {result.originalScriptId || t('injectionScriptUnnamed')}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>{t('injectionMutatedScript')}</dt>
                                        {/* Several injectors rewrite the script where it stands and give the
                                            result no new name of its own. */}
                                        <dd>
                                            {result.mutatedScriptId || t('injectionScriptUnnamed')}
                                        </dd>
                                    </div>
                                </dl>
                                {/* Two drawings of a script that differ in one block are all but identical to look
                                    at, and the reader was left to find the difference themselves. */}
                                <ScriptDiffPanels
                                    before={result.originalScratchblocks}
                                    after={result.mutatedScratchblocks}
                                    locale={locale}
                                    beforeLabel={originalLabel}
                                    afterLabel={mutatedLabel}
                                />
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
