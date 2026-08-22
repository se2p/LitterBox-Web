// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface DialogProps {
    open: boolean;
    title: ReactNode;
    closeLabel: string;
    onClose: () => void;
    children: ReactNode;
}

export function Dialog({ open, title, closeLabel, onClose, children }: DialogProps) {
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;

        const previouslyFocused = document.activeElement;
        const dialog = dialogRef.current;
        const focusableSelector =
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusableElements = () =>
            Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);

        (focusableElements()[0] ?? dialog)?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;

            const elements = focusableElements();
            if (elements.length === 0) {
                event.preventDefault();
                dialog?.focus();
                return;
            }

            const first = elements[0];
            const last = elements[elements.length - 1];
            if (!dialog?.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };
    }, [open]);

    if (!open) return null;
    return (
        <div className="dialog-backdrop">
            <div
                ref={dialogRef}
                className="dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <div className="dialog-header">
                    <h2 id={titleId}>{title}</h2>
                    <button type="button" className="icon-button" onClick={onClose}>
                        <span aria-hidden="true">×</span>
                        <span className="visually-hidden">{closeLabel}</span>
                    </button>
                </div>
                <div className="dialog-body">{children}</div>
            </div>
        </div>
    );
}
