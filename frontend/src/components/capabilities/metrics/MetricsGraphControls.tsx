// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../api/capabilities';
import {
    fetchGraph,
    GRAPH_TYPES,
    GraphApiError,
    type GraphResult,
    type GraphType,
} from '../../../api/graphs';
import { isAbortError } from '../../../lib/abort-error';
import { loadGraphviz } from '../../../lib/dynamic-libraries';
import { formatNumber } from '../../../i18n';
import type { TranslationKey } from '../../../i18n/locales';
import { Alert } from '../../Alert';
import { renderGraphNodeBlocks } from './graph-scratchblocks';
import { sanitizeGraphvizSvg } from './safe-svg';
import { useGraphView } from './use-graph-view';

type GraphState =
    | { status: 'idle' }
    | { status: 'loading'; graphType: GraphType }
    | { status: 'success'; result: GraphResult; svg: SVGSVGElement }
    | { status: 'empty'; result: GraphResult }
    | { status: 'error'; category: GraphApiError['category']; result?: GraphResult }
    | { status: 'render-error'; result: GraphResult };

const graphLabels: Record<GraphType, { label: TranslationKey; description: TranslationKey }> = {
    ast: { label: 'graphAstLabel', description: 'graphAstDescription' },
    cfg: { label: 'graphCfgLabel', description: 'graphCfgDescription' },
    cdg: { label: 'graphCdgLabel', description: 'graphCdgDescription' },
    ddg: { label: 'graphDdgLabel', description: 'graphDdgDescription' },
    dt: { label: 'graphDtLabel', description: 'graphDtDescription' },
    pdt: { label: 'graphPdtLabel', description: 'graphPdtDescription' },
    tdg: { label: 'graphTdgLabel', description: 'graphTdgDescription' },
    pdg: { label: 'graphPdgLabel', description: 'graphPdgDescription' },
};

const errorKeys: Record<GraphApiError['category'], TranslationKey> = {
    disabled: 'metricsGraphErrorDisabled',
    unavailable: 'metricsGraphErrorUnavailable',
    authorization: 'metricsGraphErrorAuthorization',
    'not-ready': 'metricsGraphErrorNotReady',
    unsupported: 'metricsGraphErrorUnsupported',
    limit: 'metricsGraphErrorLimit',
    timeout: 'metricsGraphErrorTimeout',
    empty: 'metricsGraphErrorEmpty',
    server: 'metricsGraphErrorServer',
};

function DotAlternative({ result }: { result: GraphResult }) {
    const { t } = useTranslation();
    return (
        <details className="metrics-graph-dot">
            <summary>{t('metricsGraphDotAlternative')}</summary>
            <pre>{result.dot}</pre>
        </details>
    );
}

export function MetricsGraphControls({
    enabled,
    token,
    analysisId,
    locale,
    headingHidden = false,
}: {
    enabled: boolean;
    token: string;
    analysisId: number;
    locale: SupportedLocale;
    /** Set where the surrounding page already names this section, so the name is not printed twice. */
    headingHidden?: boolean;
}) {
    const { t } = useTranslation();
    const [selectedType, setSelectedType] = useState<GraphType>('ast');
    const [state, setState] = useState<GraphState>({ status: 'idle' });
    const requestController = useRef<AbortController | undefined>(undefined);
    const requestSequence = useRef(0);
    const statusRef = useRef<HTMLParagraphElement>(null);
    const resultHeadingRef = useRef<HTMLHeadingElement>(null);
    const graphViewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const viewport = graphViewportRef.current;
        return () => {
            requestController.current?.abort();
            requestController.current = undefined;
            if (viewport) {
                while (viewport.firstChild) viewport.removeChild(viewport.firstChild);
            }
        };
    }, []);

    useEffect(() => {
        if (state.status === 'idle' || state.status === 'loading') return;
        // When the graph arrives, the graph is the news; the reader is put at its heading rather than at the
        // status sentence, which stays for a screen reader to announce but is not shown on the page.
        if (state.status === 'success') resultHeadingRef.current?.focus();
        else statusRef.current?.focus();
    }, [state]);

    if (!enabled) return null;

    const requestGraph = async () => {
        requestController.current?.abort();
        const controller = new AbortController();
        requestController.current = controller;
        const sequence = ++requestSequence.current;
        setState({ status: 'loading', graphType: selectedType });
        let fetchedResult: GraphResult | undefined;
        try {
            const result = await fetchGraph(token, analysisId, selectedType, controller.signal);
            fetchedResult = result;
            if (controller.signal.aborted || sequence !== requestSequence.current) return;
            if (result.nodeCount === 0 && result.edgeCount === 0) {
                setState({ status: 'empty', result });
                return;
            }
            const graphviz = await loadGraphviz();
            if (controller.signal.aborted || sequence !== requestSequence.current) return;
            const viz = await graphviz.instance();
            if (controller.signal.aborted || sequence !== requestSequence.current) return;
            const svgText = viz.renderString(result.dot, { engine: 'dot', format: 'svg' });
            const svg = sanitizeGraphvizSvg(svgText);
            // A graph of block labels is only readable to a learner once the labels are blocks. Failing to draw them
            // is not worth losing the graph over, so the plain Graphviz labels stay if the renderer gives up.
            await renderGraphNodeBlocks(svg, locale).catch(() => 0);
            if (controller.signal.aborted || sequence !== requestSequence.current) return;
            setState({ status: 'success', result, svg });
        } catch (error) {
            if (
                isAbortError(error) ||
                controller.signal.aborted ||
                sequence !== requestSequence.current
            )
                return;
            if (error instanceof GraphApiError) {
                setState({ status: 'error', category: error.category });
            } else {
                setState({
                    status: 'render-error',
                    result: fetchedResult ?? {
                        graphType: selectedType,
                        dot: '',
                        nodeCount: 0,
                        edgeCount: 0,
                    },
                });
            }
        }
    };

    const changeType = (value: string) => {
        if (!GRAPH_TYPES.includes(value as GraphType)) return;
        requestController.current?.abort();
        requestSequence.current += 1;
        setSelectedType(value as GraphType);
        setState({ status: 'idle' });
    };
    const currentResult =
        state.status === 'success' || state.status === 'empty' || state.status === 'render-error'
            ? state.result
            : undefined;
    const selectedLabel = t(graphLabels[selectedType].label);
    const statusMessage =
        state.status === 'loading'
            ? t('metricsGraphLoading', { graph: selectedLabel })
            : state.status === 'success'
              ? t('metricsGraphRendered', { graph: selectedLabel })
              : state.status === 'empty'
                ? t('metricsGraphEmpty', { graph: selectedLabel })
                : state.status === 'render-error'
                  ? t('metricsGraphErrorRendering')
                  : state.status === 'error'
                    ? t(errorKeys[state.category])
                    : '';

    return (
        <section
            className="result-card card metrics-graph-card"
            aria-labelledby="metrics-graphs-heading"
        >
            <h2
                id="metrics-graphs-heading"
                className={headingHidden ? 'visually-hidden' : undefined}
                tabIndex={-1}
            >
                {t('metricsGraphsTitle')}
            </h2>
            <p className="hint">{t('metricsGraphsLead')}</p>
            <fieldset className="metrics-graph-controls">
                <legend>{t('metricsGraphChoose')}</legend>
                <label htmlFor="metrics-graph-type">{t('metricsGraphType')}</label>
                <select
                    id="metrics-graph-type"
                    value={selectedType}
                    onChange={(event) => changeType(event.target.value)}
                    disabled={state.status === 'loading'}
                >
                    {GRAPH_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {t(graphLabels[type].label)} — {t(graphLabels[type].description)}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    className="primary-action"
                    onClick={() => void requestGraph()}
                    disabled={state.status === 'loading'}
                >
                    {state.status === 'error' || state.status === 'render-error'
                        ? t('metricsGraphRetry')
                        : state.status === 'loading'
                          ? t('metricsGraphLoadingButton')
                          : t('metricsGraphRequest')}
                </button>
            </fieldset>
            {state.status !== 'idle' && (
                <p
                    ref={statusRef}
                    /* Telling a reader who can see the drawing that the drawing is ready says nothing the drawing
                       does not; a reader who cannot see it still needs to be told, so the sentence is kept and
                       only its display is dropped. */
                    className={
                        state.status === 'success' ? 'visually-hidden' : 'metrics-graph-status'
                    }
                    role={
                        state.status === 'error' || state.status === 'render-error'
                            ? 'alert'
                            : 'status'
                    }
                    tabIndex={-1}
                    aria-live="polite"
                >
                    {statusMessage}
                </p>
            )}
            {state.status === 'error' && (
                <Alert tone="error">
                    <p>{t(errorKeys[state.category])}</p>
                </Alert>
            )}
            {state.status === 'render-error' && (
                <Alert tone="error">
                    <p>{t('metricsGraphErrorRendering')}</p>
                </Alert>
            )}
            {currentResult && (
                <section
                    className="metrics-graph-result"
                    aria-labelledby="metrics-graph-result-heading"
                >
                    <h3 id="metrics-graph-result-heading" ref={resultHeadingRef} tabIndex={-1}>
                        {t('metricsGraphResult', {
                            graph: t(graphLabels[currentResult.graphType].label),
                        })}
                    </h3>
                    <p className="metrics-graph-counts">
                        {t('metricsGraphCounts', {
                            nodes: formatNumber(currentResult.nodeCount, locale),
                            edges: formatNumber(currentResult.edgeCount, locale),
                        })}
                    </p>
                    {state.status === 'success' && (
                        <GraphViewport
                            svg={state.svg}
                            mountRef={graphViewportRef}
                            label={t('metricsGraphAccessibleName', {
                                graph: t(graphLabels[currentResult.graphType].label),
                                nodes: formatNumber(currentResult.nodeCount, locale),
                                edges: formatNumber(currentResult.edgeCount, locale),
                            })}
                        />
                    )}
                    {state.status === 'empty' && (
                        <p className="metric-empty">{t('metricsGraphEmptyBody')}</p>
                    )}
                    <DotAlternative result={currentResult} />
                </section>
            )}
        </section>
    );
}

function GraphSvgMount({
    svg,
    viewportRef,
}: {
    svg: SVGSVGElement;
    viewportRef: RefObject<HTMLDivElement | null>;
}) {
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        while (viewport.firstChild) viewport.removeChild(viewport.firstChild);
        viewport.appendChild(svg);
        return () => {
            if (svg.parentNode === viewport) viewport.removeChild(svg);
        };
    }, [svg, viewportRef]);
    return null;
}

/**
 * The window a graph is read through. Block labels make a graph far wider than the column it is shown in, so it is
 * fitted on arrival and the reader moves it about rather than scrolling the page past it.
 */
function GraphViewport({
    svg,
    mountRef,
    label,
}: {
    svg: SVGSVGElement;
    mountRef: RefObject<HTMLDivElement | null>;
    label: string;
}) {
    const { t } = useTranslation();
    // Destructured rather than kept whole: the hook hands back refs alongside ordinary values, and reading any
    // property of that object during render reads it through something the linter must treat as a ref.
    const {
        canvasRef,
        surfaceRef,
        transform,
        zoomPercent,
        grabbing,
        zoomIn,
        zoomOut,
        fit,
        actualSize,
        onPointerDown,
        onKeyDown,
    } = useGraphView(svg);
    const [expanded, setExpanded] = useState(false);
    const expandRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    // The same elements, given the viewport to themselves. Nothing is unmounted and nothing is fetched again, so
    // the graph a reader had panned and zoomed to is the graph that fills the screen.
    const wasExpanded = useRef(false);
    useEffect(() => {
        if (!expanded) {
            // Restored here rather than in a cleanup: while expanded the button that opened this is not rendered,
            // so the node to return focus to only exists on the render that closes it.
            if (wasExpanded.current) expandRef.current?.focus();
            wasExpanded.current = false;
            return;
        }
        wasExpanded.current = true;
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setExpanded(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [expanded]);

    return (
        <div
            className={`metrics-graph-view${expanded ? ' metrics-graph-view-expanded' : ''}`}
            {...(expanded
                ? { role: 'dialog', 'aria-modal': true, 'aria-label': t('metricsGraphExpanded') }
                : {})}
        >
            <div
                className="metrics-graph-controls-bar"
                role="group"
                aria-label={t('metricsGraphViewControls')}
            >
                <button type="button" onClick={zoomOut} aria-label={t('metricsGraphZoomOut')}>
                    <span aria-hidden="true">−</span>
                </button>
                {/* Not announced on every wheel notch: the reader asked to move, not to be told they moved. */}
                <span className="metrics-graph-zoom-level" aria-live="off">
                    {t('metricsGraphZoomLevel', { percent: zoomPercent })}
                </span>
                <button type="button" onClick={zoomIn} aria-label={t('metricsGraphZoomIn')}>
                    <span aria-hidden="true">+</span>
                </button>
                <button type="button" onClick={fit}>
                    {t('metricsGraphFit')}
                </button>
                <button type="button" onClick={actualSize}>
                    {t('metricsGraphActualSize')}
                </button>
                {expanded ? (
                    <button
                        ref={closeRef}
                        type="button"
                        className="primary-action"
                        onClick={() => setExpanded(false)}
                    >
                        {t('metricsGraphCollapse')}
                    </button>
                ) : (
                    <button ref={expandRef} type="button" onClick={() => setExpanded(true)}>
                        {t('metricsGraphExpand')}
                    </button>
                )}
            </div>
            <div
                ref={canvasRef}
                className={`metrics-graph-canvas${grabbing ? ' metrics-graph-canvas-grabbing' : ''}`}
                tabIndex={0}
                role="group"
                aria-label={t('metricsGraphCanvas')}
                aria-describedby="metrics-graph-canvas-hint"
                onPointerDown={onPointerDown}
                onKeyDown={onKeyDown}
            >
                <div
                    ref={surfaceRef}
                    className="metrics-graph-surface"
                    style={{
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    }}
                >
                    <div
                        ref={mountRef}
                        className="metrics-graph-viewport"
                        role="img"
                        aria-label={label}
                    >
                        <GraphSvgMount svg={svg} viewportRef={mountRef} />
                    </div>
                </div>
            </div>
            <p id="metrics-graph-canvas-hint" className="hint">
                {t('metricsGraphPanHint')}
            </p>
        </div>
    );
}
