// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../api/capabilities';
import type { InjectorViewDto } from '../../../api/generated';
import { formatNumber } from '../../../i18n';
import { Alert } from '../../Alert';
import { InjectionPreview } from './InjectionPreview';
import { InjectorItem } from './InjectorItem';
import { errorKeys, injectionEligible } from './injection-utils';
import { useInjectionRequests } from './use-injection-requests';
import { useInjectorSelection } from './use-injector-selection';

interface InjectionControlsProps {
    enabled: boolean;
    token: string;
    analysisId: number;
    analysisStatus: string | null | undefined;
    inputFormat: string | null | undefined;
    locale: SupportedLocale;
    /** Set where the surrounding page already names this section, so the name is not printed twice. */
    headingHidden?: boolean;
}

export function InjectionControls(props: InjectionControlsProps) {
    if (
        !injectionEligible(props.enabled, props.analysisId, props.analysisStatus, props.inputFormat)
    )
        return null;
    return <EligibleInjectionControls {...props} />;
}

function EligibleInjectionControls({
    token,
    analysisId,
    inputFormat,
    locale,
    headingHidden = false,
}: InjectionControlsProps) {
    const { t } = useTranslation();
    const searchId = useId();

    // The requests know nothing of the chooser; the chooser watches them and empties itself for a new catalogue.
    // Taken apart here rather than kept whole: the hook hands back two refs alongside ordinary values, and reading
    // any property of that object during render reads it through something that has to be treated as a ref.
    const {
        catalogue,
        injectors,
        state,
        preview,
        lastDownload,
        busy,
        statusHeading,
        previewHeading,
        beginSelectionChange,
        requestPreview,
        downloadResult,
        downloadAll,
        cancel,
        retry,
    } = useInjectionRequests({ token, analysisId, inputFormat, locale });
    const selection = useInjectorSelection({
        catalogue,
        injectors,
        locale,
        busy,
        loading: state.status === 'loadingInjectors',
        onSelectionChange: beginSelectionChange,
    });
    const injectorPositions = useMemo(
        () => new Map(injectors.map((injector, index) => [injector.injectorId, index])),
        [injectors],
    );
    // The preview answers in injector IDs, which name nothing a teacher reading the result would recognise; the
    // catalogue this same request already loaded is where the human name for each one lives.
    const injectorNames = useMemo(
        () => new Map(injectors.map((injector) => [injector.injectorId, injector.name])),
        [injectors],
    );
    const { selectedInjectorIds, selectionMode, selectedCount, explicitLimit } = selection;

    const renderInjector = (injector: InjectorViewDto) => {
        const index = injectorPositions.get(injector.injectorId) ?? -1;
        const checked =
            selectionMode === 'all' || selectedInjectorIds.includes(injector.injectorId);
        return (
            <InjectorItem
                key={injector.injectorId}
                injector={injector}
                index={index}
                checked={checked}
                expanded={selection.expandedInjectorIds.has(injector.injectorId)}
                busy={busy}
                bulkMode={selectionMode === 'all'}
                hasFinderContext={(selection.duplicateNames.get(injector.name) ?? 0) > 1}
                searchId={searchId}
                locale={locale}
                onToggleDescription={selection.toggleDescription}
                onChangeSelection={selection.changeInjectorSelection}
            />
        );
    };

    return (
        <section className="card injection-card" aria-labelledby="injection-heading" lang={locale}>
            <h2
                id="injection-heading"
                className={headingHidden ? 'visually-hidden' : undefined}
                tabIndex={-1}
            >
                {t('injectionTitle')}
            </h2>
            <p className="injection-lead">{t('injectionLead')}</p>
            <p className="hint">{t('injectionOriginalNotice')}</p>

            {state.status === 'loadingInjectors' && (
                <div className="injection-status" role="status" aria-live="polite" aria-busy="true">
                    <h3 ref={statusHeading} tabIndex={-1}>
                        {t('injectionLoading')}
                    </h3>
                    <p>{t('injectionLoadingBody')}</p>
                </div>
            )}

            {state.status === 'error' && state.operation === 'injectors' && (
                <div className="injection-status injection-status-error" role="alert">
                    <h3 ref={statusHeading} tabIndex={-1}>
                        {t('injectionRequestFailed')}
                    </h3>
                    <Alert tone="error">
                        <p>{t(errorKeys[state.category])}</p>
                    </Alert>
                    <button type="button" onClick={() => retry(selectedInjectorIds, selectionMode)}>
                        {t('injectionRetryInjectors')}
                    </button>
                </div>
            )}

            {state.status !== 'loadingInjectors' &&
                !(state.status === 'error' && state.operation === 'injectors') && (
                    <div className="injection-selector">
                        <fieldset>
                            <legend>{t('injectionSelectInjectors')}</legend>
                            {injectors.length > 0 && (
                                <div className="injection-catalogue-controls">
                                    <div className="injection-search-field">
                                        <label htmlFor={searchId}>
                                            {t('injectionSearchLabel')}
                                        </label>
                                        <input
                                            id={searchId}
                                            type="search"
                                            value={selection.searchTerm}
                                            onChange={(event) =>
                                                selection.setSearchTerm(event.target.value)
                                            }
                                        />
                                    </div>
                                    <p
                                        id={`${searchId}-bulk-hint`}
                                        className="injection-catalogue-status"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        {selection.catalogueStatus}
                                        {selection.filteredSelectedInjectors.length > 0 && (
                                            <>
                                                {' '}
                                                {t('injectionSelectedFiltered', {
                                                    count: selection.filteredSelectedInjectors
                                                        .length,
                                                })}
                                            </>
                                        )}
                                    </p>
                                    <div
                                        className="injection-bulk-actions"
                                        aria-label={t('injectionBulkActions')}
                                    >
                                        {selectionMode === 'all' ? (
                                            /* Clearing the selection and choosing a subset both left the reader
                                               in the same place with nothing ticked. Only the one that says what
                                               they get out of it is worth a button. */
                                            <button
                                                type="button"
                                                onClick={selection.chooseCustomSubset}
                                                disabled={busy}
                                            >
                                                {t('injectionLeaveBulkMode')}
                                            </button>
                                        ) : (
                                            <>
                                                {catalogue?.allSelectionSupported && (
                                                    <button
                                                        type="button"
                                                        onClick={selection.selectAll}
                                                        disabled={busy}
                                                    >
                                                        {/* The jump from a hand-picked eight to the whole
                                                            catalogue is worth saying out loud on the button. */}
                                                        {t('injectionSelectAll', {
                                                            count: injectors.length,
                                                        })}
                                                    </button>
                                                )}
                                                {selection.selectAllVisibleIsDistinct && (
                                                    <button
                                                        type="button"
                                                        onClick={selection.selectAllVisible}
                                                        disabled={
                                                            busy ||
                                                            selection.selectAllVisibleTooLarge
                                                        }
                                                        aria-describedby={
                                                            selection.selectAllVisibleTooLarge
                                                                ? `${searchId}-visible-selection-hint`
                                                                : undefined
                                                        }
                                                    >
                                                        {t('injectionSelectAllVisible')}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={selection.clearSelection}
                                                    disabled={selectedCount === 0 || busy}
                                                >
                                                    {t('injectionClearSelection')}
                                                </button>
                                                {/* Only said when it is the reason a button cannot be pressed. */}
                                                {selection.selectAllVisibleIsDistinct &&
                                                    selection.selectAllVisibleTooLarge && (
                                                        <span
                                                            id={`${searchId}-visible-selection-hint`}
                                                            className="hint"
                                                        >
                                                            {t(
                                                                'injectionVisibleSelectionRejected',
                                                                {
                                                                    count: selection.visibleSelectionCount,
                                                                    limit: explicitLimit,
                                                                },
                                                            )}
                                                        </span>
                                                    )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {injectors.length === 0 ? (
                                <p className="empty-state">{t('injectionEmpty')}</p>
                            ) : (
                                <>
                                    {selection.visibleInjectors.length > 0 ? (
                                        <ul className="injection-injector-list">
                                            {selection.visibleInjectors.map(renderInjector)}
                                        </ul>
                                    ) : (
                                        <p className="empty-state">
                                            {t('injectionNoSearchResults')}
                                        </p>
                                    )}
                                    {selection.filteredSelectedInjectors.length > 0 && (
                                        <section
                                            className="injection-filtered-selection"
                                            aria-labelledby={`${searchId}-filtered-heading`}
                                        >
                                            <h4 id={`${searchId}-filtered-heading`}>
                                                {t('injectionSelectedFilteredHeading')}
                                            </h4>
                                            <ul className="injection-injector-list">
                                                {selection.filteredSelectedInjectors.map(
                                                    renderInjector,
                                                )}
                                            </ul>
                                        </section>
                                    )}
                                </>
                            )}
                        </fieldset>
                        <div className="injection-actions">
                            <button
                                type="button"
                                className="primary-action"
                                onClick={() => requestPreview(selectedInjectorIds, selectionMode)}
                                disabled={
                                    (selectionMode === 'explicit' &&
                                        (selectedCount < 1 || selectedCount > explicitLimit)) ||
                                    (selectionMode === 'all' && injectors.length < 1) ||
                                    state.status === 'previewing' ||
                                    state.status === 'downloading'
                                }
                            >
                                {state.status === 'previewing'
                                    ? t('injectionPreviewingButton')
                                    : t('injectionRequestPreview')}
                            </button>
                            {state.status === 'previewing' && (
                                <button type="button" onClick={cancel}>
                                    {t('injectionCancel')}
                                </button>
                            )}
                        </div>
                        <p className="visually-hidden" role="status" aria-live="polite">
                            {selection.selectionAnnouncement}
                        </p>
                        {state.status === 'previewing' && !preview && (
                            <div className="injection-status" role="status" aria-live="polite">
                                <h3 ref={statusHeading} tabIndex={-1}>
                                    {t('injectionPreviewing')}
                                </h3>
                                <p>{t('injectionPreviewingBody')}</p>
                            </div>
                        )}
                        {state.status === 'error' && state.operation === 'preview' && (
                            <div className="injection-status injection-status-error" role="alert">
                                <h3 ref={statusHeading} tabIndex={-1}>
                                    {t('injectionRequestFailed')}
                                </h3>
                                <Alert tone="error">
                                    <p>{t(errorKeys[state.category])}</p>
                                </Alert>
                                <button
                                    type="button"
                                    onClick={() => retry(selectedInjectorIds, selectionMode)}
                                >
                                    {t('injectionRetryPreview')}
                                </button>
                            </div>
                        )}
                        {preview && (
                            <InjectionPreview
                                preview={preview}
                                injectorNames={injectorNames}
                                locale={locale}
                                downloading={
                                    state.status === 'downloading' ? state.target : undefined
                                }
                                onDownloadResult={downloadResult}
                                onDownloadAll={() =>
                                    downloadAll(selectedInjectorIds, selectionMode)
                                }
                                headingRef={previewHeading}
                            />
                        )}
                    </div>
                )}

            {state.status === 'downloading' && (
                <div className="injection-status" role="status" aria-live="polite" aria-busy="true">
                    <h3 ref={statusHeading} tabIndex={-1}>
                        {t('injectionPreparing')}
                    </h3>
                    <p>{t('injectionPreparingBody')}</p>
                    <div className="injection-actions">
                        <button type="button" onClick={cancel}>
                            {t('injectionCancel')}
                        </button>
                    </div>
                </div>
            )}

            {/* The file has already gone to the browser by the time this appears; it says what left and how big it
                was, so the reader can find it, and asks nothing further of them. */}
            {state.status === 'downloaded' && (
                <div
                    className="injection-status injection-status-prepared"
                    role="status"
                    aria-live="polite"
                >
                    <h3 ref={statusHeading} tabIndex={-1}>
                        {t('injectionDownloaded')}
                    </h3>
                    <dl className="injection-metadata">
                        <div>
                            <dt>{t('injectionFilename')}</dt>
                            <dd>{state.result.filename}</dd>
                        </div>
                        <div>
                            <dt>{t('injectionByteLength')}</dt>
                            <dd>
                                {t('injectionByteLengthValue', {
                                    formatted: formatNumber(state.result.byteLength, locale),
                                })}
                            </dd>
                        </div>
                    </dl>
                </div>
            )}

            {state.status === 'error' && state.operation === 'download' && (
                <div className="injection-status injection-status-error" role="alert">
                    <h3 ref={statusHeading} tabIndex={-1}>
                        {t('injectionRequestFailed')}
                    </h3>
                    <Alert tone="error">
                        <p>{t(errorKeys[state.category])}</p>
                    </Alert>
                    <button type="button" onClick={() => retry(selectedInjectorIds, selectionMode)}>
                        {lastDownload === 'all'
                            ? t('injectionDownloadAll', { count: preview?.results.length ?? 0 })
                            : t('injectionDownloadOne')}
                    </button>
                </div>
            )}
        </section>
    );
}
