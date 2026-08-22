// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

const ELEMENTS = new Set([
    'svg',
    'g',
    'defs',
    'title',
    'desc',
    'path',
    'polygon',
    'polyline',
    'ellipse',
    'circle',
    'rect',
    'line',
    'text',
    'tspan',
]);

const ROOT_ATTRIBUTES = new Set([
    'id',
    'class',
    'width',
    'height',
    'viewBox',
    'version',
    'preserveAspectRatio',
]);

const GROUP_ATTRIBUTES = new Set(['id', 'class', 'transform']);
const SHAPE_ATTRIBUTES = new Set([
    'id',
    'class',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'points',
    'd',
    'cx',
    'cy',
    'rx',
    'ry',
    'x',
    'y',
    'x1',
    'x2',
    'y1',
    'y2',
    'transform',
]);
const TEXT_ATTRIBUTES = new Set([
    ...SHAPE_ATTRIBUTES,
    'dx',
    'dy',
    'font-family',
    'font-size',
    'font-weight',
    'text-anchor',
    'dominant-baseline',
]);

const MAX_ELEMENTS = 100_000;

const attributeNamesFor = (element: string): Set<string> => {
    if (element === 'svg') return ROOT_ATTRIBUTES;
    if (element === 'g' || element === 'defs') return GROUP_ATTRIBUTES;
    if (element === 'text' || element === 'tspan') return TEXT_ATTRIBUTES;
    if (element === 'title' || element === 'desc') return new Set();
    return SHAPE_ATTRIBUTES;
};

const unsafeValue = (value: string): boolean =>
    /url\s*\(|(?:^|\s)(?:javascript|data|https?):|\/\//i.test(value);

const assertAttribute = (element: Element, attribute: Attr): void => {
    const name = attribute.name;
    const namespace = attribute.namespaceURI;
    if (namespace === XMLNS_NAMESPACE) {
        const validDeclaration =
            element.localName === 'svg' &&
            ((name === 'xmlns' && attribute.value === SVG_NAMESPACE) ||
                (name === 'xmlns:xlink' && attribute.value === 'http://www.w3.org/1999/xlink'));
        if (!validDeclaration) throw new Error('SVG contains an unexpected namespace declaration');
        return;
    }
    if (unsafeValue(attribute.value)) throw new Error('SVG attribute contains an active reference');
    if (
        namespace === XML_NAMESPACE &&
        name === 'xml:space' &&
        (element.localName === 'text' || element.localName === 'tspan')
    )
        return;
    if (namespace !== null) throw new Error('SVG contains an unexpected attribute namespace');
    if (!attributeNamesFor(element.localName).has(name)) {
        throw new Error('SVG contains an unexpected attribute');
    }
};

const copyElement = (source: Element, depth: number, count: { value: number }): Element => {
    if (depth > 100) throw new Error('SVG is too deeply nested');
    if (source.namespaceURI !== SVG_NAMESPACE || !ELEMENTS.has(source.localName)) {
        throw new Error('SVG contains an unexpected element');
    }
    count.value += 1;
    if (count.value > MAX_ELEMENTS) throw new Error('SVG contains too many elements');
    Array.from(source.attributes).forEach((attribute) => assertAttribute(source, attribute));
    const copy = document.createElementNS(SVG_NAMESPACE, source.localName);
    Array.from(source.attributes).forEach((attribute) => {
        if (attribute.namespaceURI === XMLNS_NAMESPACE) return;
        if (attribute.namespaceURI === XML_NAMESPACE) {
            copy.setAttributeNS(XML_NAMESPACE, attribute.name, attribute.value);
        } else {
            copy.setAttribute(attribute.name, attribute.value);
        }
    });
    Array.from(source.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
            copy.appendChild(document.createTextNode(child.nodeValue ?? ''));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            copy.appendChild(copyElement(child as Element, depth + 1, count));
        }
    });
    return copy;
};

export function sanitizeGraphvizSvg(svgText: string): SVGSVGElement {
    if (!svgText.trim()) throw new Error('SVG output is empty');
    const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) throw new Error('SVG output could not be parsed');
    const root = parsed.documentElement;
    if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NAMESPACE) {
        throw new Error('SVG root is not an SVG element');
    }
    const copy = copyElement(root, 0, { value: 0 });
    if (copy.localName !== 'svg') throw new Error('SVG root was not preserved');
    return copy as SVGSVGElement;
}
