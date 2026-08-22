// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Redirect, Route, Switch, useLocation } from 'react-router-dom';
import { SUPPORTED_LOCALES, type SupportedLocale } from './api/capabilities';
import { Alert } from './components/Alert';
import { ApplicationShell } from './components/ApplicationShell';
import { LoadingState } from './components/States';
import { InformationalPage } from './pages/InformationalPage';
// The child's journey — the page they land on and the result they came back for — is loaded with the shell.
import { SubmitPage } from './pages/SubmitPage';
import { SubmissionPage } from './pages/SubmissionPage';
// Everything else is fetched when it is first asked for. Most visits are one child checking one project, and
// there is no reason for them to download the teacher's workflows, the researcher's workspace and the whole
// pattern catalogue before they can see the upload button.
const CataloguePage = lazy(() =>
    import('./pages/CataloguePage').then((module) => ({ default: module.CataloguePage })),
);
const StatisticsPage = lazy(() =>
    import('./pages/StatisticsPage').then((module) => ({ default: module.StatisticsPage })),
);
const ComparisonPage = lazy(() =>
    import('./pages/ComparisonPage').then((module) => ({ default: module.ComparisonPage })),
);
const AdvancedAnalysisPage = lazy(() =>
    import('./pages/AdvancedAnalysisPage').then((module) => ({
        default: module.AdvancedAnalysisPage,
    })),
);
const QuestionsPage = lazy(() =>
    import('./pages/QuestionsPage').then((module) => ({ default: module.QuestionsPage })),
);
const ModificationPage = lazy(() =>
    import('./pages/ModificationPage').then((module) => ({ default: module.ModificationPage })),
);
import {
    ADVANCED_ANALYSIS_COMPATIBILITY_PATH,
    ADVANCED_ANALYSIS_PATH,
    MODIFICATION_PATH,
    readRetainedAnalysis,
    retainedAnalysisDestination,
} from './lib/retained-analysis';
import { DeclaredNavigationProvider } from './lib/active-navigation';
import { useCapabilities, type CapabilityState } from './lib/capabilities';
import { featureEnabled, teacherWorkflowEnabled } from './lib/features';

// Fault injection is not among them: it makes a new project rather than reading the one in hand, which is a thing a
// teacher prepares a lesson with. It is advertised on the teacher's pages instead.
const ADVANCED_CAPABILITIES = ['metrics-graphs', 'semantic-diff', 'program-export'] as const;

function LocaleCompatibilityNotice({
    state,
    applicationLocale,
}: {
    state: CapabilityState;
    applicationLocale: string;
}) {
    const { t } = useTranslation();
    if (state.status === 'idle') return null;
    const unsupportedApplicationLocale = !SUPPORTED_LOCALES.includes(
        applicationLocale as SupportedLocale,
    );
    const unsupportedByServer =
        state.status === 'ready' &&
        !(state.value.supportedLocales as readonly string[]).includes(applicationLocale);
    if (!unsupportedApplicationLocale && !unsupportedByServer) return null;
    return (
        <Alert tone="error" className="locale-compatibility-alert">
            <strong>{t('localeUnsupported')}</strong>
            <p>{t('localeIncompatibilityBody')}</p>
        </Alert>
    );
}

export function App() {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const { state, retry } = useCapabilities();
    // Set by whichever page is on screen, and only by the ones whose address does not say which menu entry they
    // belong to. Held here because the menu is drawn above the page that claims it.
    const [declaredNavigationPath, setDeclaredNavigationPath] = useState<string>();
    const applicationLocale = i18n.language;
    // Named in the menu exactly when the page has something on it, by the predicate the page itself uses.
    const teacherAdvertised =
        state.status === 'ready' && teacherWorkflowEnabled(state.value.enabledFeatures);
    const toolsAdvertised =
        state.status === 'ready' &&
        state.value.enabledFeatures.some((feature) =>
            (ADVANCED_CAPABILITIES as readonly string[]).includes(feature),
        );
    const questionsAdvertised =
        state.status === 'ready' && featureEnabled(state.value.enabledFeatures, 'qlc');
    const navLinks = useMemo(() => {
        // The home page is the submission form; a second entry for the same page only made the menu longer.
        // The two things a child came here to do lead, and what a teacher came for follows them.
        const links = [{ path: '/', label: t('navHome') }];
        if (questionsAdvertised) links.push({ path: '/questions', label: t('navQuestions') });
        if (teacherAdvertised) links.push({ path: '/teacher', label: t('navTeacher') });
        if (toolsAdvertised) links.push({ path: ADVANCED_ANALYSIS_PATH, label: t('navTools') });
        links.push(
            { path: '/catalogue', label: t('navCatalogue') },
            { path: '/about', label: t('navAbout') },
        );
        return links;
    }, [questionsAdvertised, t, teacherAdvertised, toolsAdvertised]);
    const serverLocales = state.status === 'ready' ? state.value.supportedLocales : undefined;
    return (
        <ApplicationShell
            brandLabel={t('appName')}
            currentPath={location.pathname}
            declaredNavigationPath={declaredNavigationPath}
            footerNavigationLabel={t('footerNavigation')}
            navigationLabel={t('navigationLabel')}
            navigationItems={navLinks}
            navigationLoading={state.status === 'loading'}
            footerLinks={[
                { path: '/statistics', label: t('navStatistics') },
                { path: '/contact', label: t('navContact') },
                { path: '/faq', label: t('navFaq') },
                { path: '/imprint', label: t('navImprint') },
                { path: '/privacy', label: t('navPrivacy') },
            ]}
            versionLabel={
                // The one thing the readiness page carried that a reader could act on: which analysis produced
                // their findings. It belongs beside the site's own credits, not behind a link of its own.
                state.status === 'ready'
                    ? t('footerVersion', { version: state.value.litterboxVersion })
                    : undefined
            }
            skipLinkLabel={t('skipToContent')}
        >
            <LocaleCompatibilityNotice state={state} applicationLocale={applicationLocale} />
            {/* One boundary for the whole switch: a route that has not been fetched yet says the same thing
                every other slow moment on this site says, rather than blanking the page. */}
            <Suspense fallback={<LoadingState heading={t('appName')} message={t('pageLoading')} />}>
                <DeclaredNavigationProvider value={setDeclaredNavigationPath}>
                    <Switch>
                        <Route
                            exact
                            path="/"
                            render={() => (
                                <SubmitPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                    page="home"
                                />
                            )}
                        />
                        {/* Kept so links and bookmarks to the old submission page still resolve. */}
                        <Route exact path="/submit" render={() => <Redirect to="/" />} />
                        {/* The same page as the home one, in the mode that offers a whole class at once. It is
                            already loaded, so this asks the browser for nothing. */}
                        <Route
                            exact
                            path="/teacher"
                            render={() => (
                                <SubmitPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                    mode="teacher"
                                    page="teacher"
                                />
                            )}
                        />
                        {/* The teacher's own question view: everything the project yields, against the block model. */}
                        <Route
                            exact
                            path="/teacher/questions"
                            render={() => (
                                <QuestionsPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                    variant="teacher"
                                />
                            )}
                        />
                        <Route
                            exact
                            path="/teacher/questions/:token"
                            render={() => (
                                <QuestionsPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                    variant="teacher"
                                />
                            )}
                        />
                        {/* The teacher's modification tool: one project, and the faults that can be put into it. */}
                        <Route
                            exact
                            path={MODIFICATION_PATH}
                            render={() => (
                                <ModificationPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                />
                            )}
                        />
                        <Route
                            exact
                            path="/compare"
                            render={() => (
                                <ComparisonPage capabilityState={state} onCapabilityRetry={retry} />
                            )}
                        />
                        <Route
                            exact
                            path={ADVANCED_ANALYSIS_PATH}
                            render={() => (
                                <AdvancedAnalysisPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                />
                            )}
                        />
                        <Route
                            exact
                            path={ADVANCED_ANALYSIS_COMPATIBILITY_PATH}
                            render={() => {
                                const selection = readRetainedAnalysis(location.state);
                                return (
                                    <Redirect
                                        to={
                                            selection
                                                ? retainedAnalysisDestination(
                                                      ADVANCED_ANALYSIS_PATH,
                                                      selection,
                                                  )
                                                : ADVANCED_ANALYSIS_PATH
                                        }
                                    />
                                );
                            }}
                        />
                        <Route
                            exact
                            path="/questions"
                            render={() => (
                                <QuestionsPage capabilityState={state} onCapabilityRetry={retry} />
                            )}
                        />
                        <Route
                            exact
                            path="/questions/:token"
                            render={() => (
                                <QuestionsPage capabilityState={state} onCapabilityRetry={retry} />
                            )}
                        />
                        <Route
                            exact
                            path="/submissions/:token"
                            render={() => <SubmissionPage capabilityState={state} />}
                        />
                        <Route
                            exact
                            path="/catalogue"
                            render={() => (
                                <CataloguePage
                                    applicationLocale={applicationLocale}
                                    serverLocales={serverLocales}
                                    capabilitiesLoading={state.status === 'loading'}
                                    capabilityMismatch={state.status === 'incompatible'}
                                />
                            )}
                        />
                        <Route exact path="/statistics">
                            <StatisticsPage
                                applicationLocale={applicationLocale as SupportedLocale}
                            />
                        </Route>
                        <Route exact path="/about">
                            <InformationalPage kind="about" />
                        </Route>
                        <Route exact path="/contact">
                            <InformationalPage kind="contact" />
                        </Route>
                        <Route exact path="/faq">
                            <InformationalPage kind="faq" />
                        </Route>
                        <Route exact path="/imprint">
                            <InformationalPage kind="imprint" />
                        </Route>
                        <Route exact path="/privacy">
                            <InformationalPage kind="privacy" />
                        </Route>
                        <Route render={() => <Redirect to="/" />} />
                    </Switch>
                </DeclaredNavigationProvider>
            </Suspense>
        </ApplicationShell>
    );
}
