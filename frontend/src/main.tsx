// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { localeReady } from './i18n';
import './styles.css';

// Drawn once the reader's language is in hand. Only a reader who has chosen something other than English waits at
// all, and they wait for one file rather than reading a page that rewrites itself under them.
void localeReady.finally(() =>
    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <BrowserRouter basename="/litterbox">
                <App />
            </BrowserRouter>
        </StrictMode>,
    ),
);
