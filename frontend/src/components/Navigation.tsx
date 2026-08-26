// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { SUPPORTED_LOCALES } from '../api/capabilities';
import { localeLabels, setLocale, type Locale } from '../i18n';

export interface NavigationItem {
    path: string;
    label: string;
}

interface SiteNavigationProps {
    items: NavigationItem[];
    currentPath: string;
    /** The entry the page on screen claims, when the address alone does not say which one it belongs to. */
    declaredPath?: string | undefined;
    label: string;
    loading?: boolean;
}

export function SiteNavigation({
    items,
    currentPath,
    declaredPath,
    label,
    loading = false,
}: SiteNavigationProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [shownPath, setShownPath] = useState(currentPath);
    const listId = useId();

    // Moving to another page closes the menu. Adjusted while the new address is being rendered rather than afterwards,
    // so the menu is never painted open over the page it no longer belongs to.
    if (shownPath !== currentPath) {
        setShownPath(currentPath);
        setOpen(false);
    }

    return (
        <nav className="site-nav" aria-label={label} aria-busy={loading || undefined}>
            <button
                type="button"
                className="nav-toggle"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen((value) => !value)}
            >
                <span aria-hidden="true" className="nav-toggle-icon" />
                {t('navMenuToggle')}
            </button>
            <ul id={listId} className={`nav-list ${open ? 'nav-list-open' : ''}`.trim()}>
                {items.map(({ path, label: itemLabel }) => {
                    // A page that claims an entry settles it on its own; the address is only consulted when none
                    // has been claimed, and a result reached from the class set is no longer marked as the form
                    // a child fills in.
                    const isCurrent =
                        declaredPath === undefined
                            ? currentPath === path ||
                              (path === '/' && currentPath.startsWith('/submissions/')) ||
                              (path === '/questions' && currentPath.startsWith('/questions/'))
                            : declaredPath === path;
                    return (
                        <li key={path}>
                            <Link
                                className={isCurrent ? 'active' : ''}
                                to={path}
                                aria-current={isCurrent ? 'page' : undefined}
                            >
                                {itemLabel}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

export function LanguagePicker() {
    const { t, i18n } = useTranslation();
    const currentLocale = (i18n.language in localeLabels ? i18n.language : 'en') as Locale;

    useEffect(() => {
        document.documentElement.lang = currentLocale;
    }, [currentLocale]);

    return (
        <div className="language-picker">
            <label htmlFor="language-select">{t('language')}</label>
            <select
                id="language-select"
                value={currentLocale}
                onChange={(event) => void setLocale(event.target.value as Locale)}
            >
                {SUPPORTED_LOCALES.map((locale) => (
                    // The option is written in the language it offers, so it is also tagged as being in it.
                    <option key={locale} value={locale} lang={locale}>
                        {localeLabels[locale]}
                    </option>
                ))}
            </select>
        </div>
    );
}
