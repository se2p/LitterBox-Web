// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BASE_URL } from '../lib/base-url';
import { LanguagePicker, SiteNavigation, type NavigationItem } from './Navigation';

export interface FooterLink {
    path: string;
    label: string;
}

interface ApplicationShellProps {
    brandLabel: string;
    currentPath: string;
    declaredNavigationPath?: string | undefined;
    footerNavigationLabel: string;
    navigationLabel: string;
    navigationItems: NavigationItem[];
    navigationLoading?: boolean;
    footerLinks: FooterLink[];
    versionLabel?: string | undefined;
    skipLinkLabel: string;
    children: ReactNode;
}

interface LocalImageSlotProps {
    src: string;
    alt: string;
    fallback: ReactNode;
    className: string;
}

const brandAsset = (fileName: string): string => `${BASE_URL}brand/${fileName}`;

function LocalImageSlot({ src, alt, fallback, className }: LocalImageSlotProps) {
    const [imageAvailable, setImageAvailable] = useState(true);
    return (
        <span
            className={`image-slot ${className} ${imageAvailable ? '' : 'image-slot-fallback'}`.trim()}
        >
            {imageAvailable && <img src={src} alt={alt} onError={() => setImageAvailable(false)} />}
            {!imageAvailable && <span className="image-slot-text">{fallback}</span>}
        </span>
    );
}

export function ApplicationShell({
    brandLabel,
    currentPath,
    declaredNavigationPath,
    footerNavigationLabel,
    navigationLabel,
    navigationItems,
    navigationLoading = false,
    footerLinks,
    versionLabel,
    skipLinkLabel,
    children,
}: ApplicationShellProps) {
    return (
        <div className="app-shell motion-safe">
            <a className="skip-link" href="#main-content">
                {skipLinkLabel}
            </a>
            <header className="site-header">
                <div className="site-banner" aria-hidden="true">
                    <LocalImageSlot
                        className="site-banner-slot"
                        src={brandAsset('banner.jpg')}
                        alt=""
                        fallback={brandLabel}
                    />
                </div>
                <div className="site-header-bar">
                    <SiteNavigation
                        items={navigationItems}
                        currentPath={currentPath}
                        declaredPath={declaredNavigationPath}
                        label={navigationLabel}
                        loading={navigationLoading}
                    />
                    <LanguagePicker />
                </div>
            </header>
            <div className="main-region">{children}</div>
            <footer className="site-footer">
                <div className="site-footer-inner">
                    {/* The banner already names the site; the footer only credits the university. */}
                    <LocalImageSlot
                        className="footer-university-slot brand-image-slot"
                        src={brandAsset('uniPassauLogoSmall.png')}
                        alt="University of Passau"
                        fallback="University of Passau"
                    />
                    <div className="site-footer-meta">
                        <nav aria-label={footerNavigationLabel}>
                            <ul className="footer-links">
                                {footerLinks.map(({ path, label }) => (
                                    <li key={path}>
                                        <Link to={path}>{label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                        {/* Small print, not a link: it answers "which version told me that" and nothing else. */}
                        {versionLabel && <p className="footer-version">{versionLabel}</p>}
                    </div>
                </div>
            </footer>
        </div>
    );
}
