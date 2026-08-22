// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Panning and zooming for a rendered program graph, the way the LitterBox HTML report offers it: the graph is fitted
 * into a window of its own, and the reader moves around it instead of the page moving around the graph.
 *
 * <p>Node labels are whole Scratch blocks, so a graph is several times wider than the column it sits in and no amount
 * of scaling makes all of it legible at once. Written here rather than taken from a library because it is a transform
 * and four buttons, and the project carries no pan-and-zoom dependency.
 */

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
/** A graph small enough to fit is enlarged, but only so far: past this it is all whitespace and giant blocks. */
const MAX_FIT_SCALE = 1.2;
const KEYBOARD_PAN_STEP = 48;
const BUTTON_ZOOM_STEP = 1.25;

export interface GraphViewTransform {
    scale: number;
    x: number;
    y: number;
}

const IDENTITY: GraphViewTransform = { scale: 1, x: 0, y: 0 };

const clampScale = (value: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

export interface GraphView {
    /** The window the graph is seen through. Drag, wheel and key events are bound to it. */
    canvasRef: React.RefObject<HTMLDivElement | null>;
    /** The moving layer. The graph is mounted inside it. */
    surfaceRef: React.RefObject<HTMLDivElement | null>;
    transform: GraphViewTransform;
    /** 100 at actual size, rounded, for a reader who wants to know where they are. */
    zoomPercent: number;
    grabbing: boolean;
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    actualSize: () => void;
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * @param svg the mounted graph, or undefined while there is none. A new graph is fitted and centred.
 */
export function useGraphView(svg: SVGSVGElement | undefined): GraphView {
    const canvasRef = useRef<HTMLDivElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<GraphViewTransform>(IDENTITY);
    const [grabbing, setGrabbing] = useState(false);

    /** Sizes are read from layout, which a CSS transform does not affect, so they are the graph's own dimensions. */
    const measure = useCallback(() => {
        const canvas = canvasRef.current;
        const surface = surfaceRef.current;
        if (!canvas || !surface) return undefined;
        const graphWidth = surface.offsetWidth;
        const graphHeight = surface.offsetHeight;
        const canvasWidth = canvas.clientWidth;
        const canvasHeight = canvas.clientHeight;
        if (graphWidth <= 0 || graphHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0)
            return undefined;
        return { graphWidth, graphHeight, canvasWidth, canvasHeight };
    }, []);

    const centred = useCallback(
        (scale: number): GraphViewTransform => {
            const sizes = measure();
            if (!sizes) return { scale, x: 0, y: 0 };
            return {
                scale,
                x: (sizes.canvasWidth - sizes.graphWidth * scale) / 2,
                y: (sizes.canvasHeight - sizes.graphHeight * scale) / 2,
            };
        },
        [measure],
    );

    const fit = useCallback(() => {
        const sizes = measure();
        if (!sizes) {
            setTransform(IDENTITY);
            return;
        }
        const scale = clampScale(
            Math.min(
                MAX_FIT_SCALE,
                sizes.canvasWidth / sizes.graphWidth,
                sizes.canvasHeight / sizes.graphHeight,
            ),
        );
        setTransform(centred(scale));
    }, [centred, measure]);

    const actualSize = useCallback(() => setTransform(centred(1)), [centred]);

    // A graph the reader has not seen before starts fitted, the way the report presents it. The first fit waits for
    // the graph to have a size: it is mounted into the surface by an effect of its own, and the fold it sits in has no
    // layout at all until it is open.
    const fittedFor = useRef<SVGSVGElement | undefined>(undefined);
    useEffect(() => {
        if (!svg) {
            fittedFor.current = undefined;
            setTransform(IDENTITY);
            return;
        }
        const surface = surfaceRef.current;
        if (!surface) return;
        const fitOnce = () => {
            if (fittedFor.current === svg || !measure()) return;
            fittedFor.current = svg;
            fit();
        };
        fitOnce();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(fitOnce);
        observer.observe(surface);
        return () => observer.disconnect();
    }, [fit, measure, svg]);

    const zoomAround = useCallback((factor: number, originX?: number, originY?: number) => {
        setTransform((current) => {
            const scale = clampScale(current.scale * factor);
            if (scale === current.scale) return current;
            const canvas = canvasRef.current;
            const pointX = originX ?? (canvas ? canvas.clientWidth / 2 : 0);
            const pointY = originY ?? (canvas ? canvas.clientHeight / 2 : 0);
            const ratio = scale / current.scale;
            return {
                scale,
                x: pointX - (pointX - current.x) * ratio,
                y: pointY - (pointY - current.y) * ratio,
            };
        });
    }, []);

    const zoomIn = useCallback(() => zoomAround(BUTTON_ZOOM_STEP), [zoomAround]);
    const zoomOut = useCallback(() => zoomAround(1 / BUTTON_ZOOM_STEP), [zoomAround]);

    // Bound by hand because React listens for wheel events passively, and a zoom that also scrolls the page is worse
    // than no zoom at all.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (event: WheelEvent) => {
            if (event.deltaY === 0) return;
            event.preventDefault();
            const bounds = canvas.getBoundingClientRect();
            zoomAround(
                Math.exp(-event.deltaY * 0.002),
                event.clientX - bounds.left,
                event.clientY - bounds.top,
            );
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, [zoomAround]);

    const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        // Only a plain primary drag pans; anything else belongs to the browser.
        if (event.button !== 0) return;
        const canvas = event.currentTarget;
        canvas.setPointerCapture?.(event.pointerId);
        setGrabbing(true);
        let lastX = event.clientX;
        let lastY = event.clientY;

        const onMove = (move: PointerEvent) => {
            if (move.pointerId !== event.pointerId) return;
            const deltaX = move.clientX - lastX;
            const deltaY = move.clientY - lastY;
            lastX = move.clientX;
            lastY = move.clientY;
            setTransform((current) => ({
                scale: current.scale,
                x: current.x + deltaX,
                y: current.y + deltaY,
            }));
        };
        const stop = (end: PointerEvent) => {
            if (end.pointerId !== event.pointerId) return;
            setGrabbing(false);
            canvas.releasePointerCapture?.(event.pointerId);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', stop);
            canvas.removeEventListener('pointercancel', stop);
        };
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
    }, []);

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const pan = (x: number, y: number) => {
                event.preventDefault();
                setTransform((current) => ({
                    scale: current.scale,
                    x: current.x + x,
                    y: current.y + y,
                }));
            };
            switch (event.key) {
                case 'ArrowLeft':
                    return pan(KEYBOARD_PAN_STEP, 0);
                case 'ArrowRight':
                    return pan(-KEYBOARD_PAN_STEP, 0);
                case 'ArrowUp':
                    return pan(0, KEYBOARD_PAN_STEP);
                case 'ArrowDown':
                    return pan(0, -KEYBOARD_PAN_STEP);
                case '+':
                case '=':
                    event.preventDefault();
                    return zoomIn();
                case '-':
                    event.preventDefault();
                    return zoomOut();
                case '0':
                    event.preventDefault();
                    return fit();
                default:
                    return undefined;
            }
        },
        [fit, zoomIn, zoomOut],
    );

    return {
        canvasRef,
        surfaceRef,
        transform,
        zoomPercent: Math.round(transform.scale * 100),
        grabbing,
        zoomIn,
        zoomOut,
        fit,
        actualSize,
        onPointerDown,
        onKeyDown,
    };
}
