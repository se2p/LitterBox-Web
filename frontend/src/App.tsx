// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { SUPPORTED_LOCALES, type SupportedLocale } from './api/capabilities';
import { Alert } from './components/Alert';
import { ApplicationShell } from './components/ApplicationShell';
import { PageMain } from './components/Page';
import { ErrorState, LoadingState } from './components/States';
import { InformationalPage } from './pages/InformationalPage';
import { SubmitPage } from './pages/SubmitPage';
import { SubmissionPage } from './pages/SubmissionPage';
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
const AskAiPage = lazy(() =>
    import('./pages/AskAiPage').then((module) => ({ default: module.AskAiPage })),
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
import { useAskAiEligibility } from './lib/ask-ai-eligibility';
import { useCapabilities, type CapabilityState } from './lib/capabilities';
import { capabilityEnabled, featureEnabled, teacherWorkflowEnabled } from './lib/features';

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
    const retainedAnalysisArrival = readRetainedAnalysis(location.state);
    const { state, retry } = useCapabilities();
    const [declaredNavigationPath, setDeclaredNavigationPath] = useState<string>();
    const applicationLocale = i18n.language;
    const teacherAdvertised =
        state.status === 'ready' && teacherWorkflowEnabled(state.value.enabledFeatures);
    const toolsAdvertised =
        state.status === 'ready' &&
        state.value.enabledFeatures.some((feature) =>
            (ADVANCED_CAPABILITIES as readonly string[]).includes(feature),
        );
    const questionsAdvertised =
        state.status === 'ready' && featureEnabled(state.value.enabledFeatures, 'qlc');
    // Eligibility is checked separately because deployment capability does not imply this network is allowed.
    const askAiAdvertised = capabilityEnabled(state, 'ask-ai');
    const { state: askAiEligibility, retry: retryAskAiEligibility } =
        useAskAiEligibility(askAiAdvertised);
    const askAiAvailable = askAiAdvertised && askAiEligibility === 'eligible';
    const navLinks = useMemo(() => {
        const links = [{ path: '/', label: t('navHome') }];
        if (questionsAdvertised) links.push({ path: '/questions', label: t('navQuestions') });
        if (askAiAvailable) links.push({ path: '/ask-ai', label: t('navAskAi') });
        if (teacherAdvertised) links.push({ path: '/teacher', label: t('navTeacher') });
        if (toolsAdvertised) links.push({ path: ADVANCED_ANALYSIS_PATH, label: t('navTools') });
        links.push(
            { path: '/catalogue', label: t('navCatalogue') },
            { path: '/about', label: t('navAbout') },
        );
        return links;
    }, [askAiAvailable, questionsAdvertised, t, teacherAdvertised, toolsAdvertised]);
    const serverLocales = state.status === 'ready' ? state.value.supportedLocales : undefined;
    const askAiElement = (() => {
        if (askAiAvailable) return <AskAiPage />;
        if (state.status === 'loading' || (askAiAdvertised && askAiEligibility === 'unknown'))
            return <LoadingState heading={t('appName')} message={t('pageLoading')} />;
        if (!askAiAdvertised) return <Navigate to="/" replace />;
        const denied = askAiEligibility === 'denied';
        return (
            <PageMain>
                <ErrorState
                    heading={t(denied ? 'askAiNetworkDeniedTitle' : 'askAiUnavailableTitle')}
                    message={t(denied ? 'askAiNetworkDeniedBody' : 'askAiUnavailableBody')}
                    retryLabel={t('retry')}
                    onRetry={retryAskAiEligibility}
                    level={1}
                />
            </PageMain>
        );
    })();
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
                state.status === 'ready'
                    ? t('footerVersion', { version: state.value.litterboxVersion })
                    : undefined
            }
            skipLinkLabel={t('skipToContent')}
        >
            <LocaleCompatibilityNotice state={state} applicationLocale={applicationLocale} />
            <Suspense fallback={<LoadingState heading={t('appName')} message={t('pageLoading')} />}>
                <DeclaredNavigationProvider value={setDeclaredNavigationPath}>
                    <Routes>
                        <Route
                            path="/"
                            element={
                                <SubmitPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                    page="home"
                                />
                            }
                        />
                        {/* Kept so links and bookmarks to the old submission page still resolve. */}
                        <Route path="/submit" element={<Navigate to="/" replace />} />
                        <Route
                            path="/teacher"
                            element={
                                <SubmitPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                    mode="teacher"
                                    page="teacher"
                                />
                            }
                        />
                        <Route
                            path="/teacher/questions"
                            element={
                                <QuestionsPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                    variant="teacher"
                                />
                            }
                        />
                        <Route
                            path="/teacher/questions/:token"
                            element={
                                <QuestionsPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                    variant="teacher"
                                />
                            }
                        />
                        <Route
                            path={MODIFICATION_PATH}
                            element={
                                <ModificationPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                />
                            }
                        />
                        <Route
                            path="/compare"
                            element={
                                <ComparisonPage capabilityState={state} onCapabilityRetry={retry} />
                            }
                        />
                        <Route
                            path={ADVANCED_ANALYSIS_PATH}
                            element={
                                <AdvancedAnalysisPage
                                    capabilityState={state}
                                    onCapabilityRetry={retry}
                                />
                            }
                        />
                        <Route
                            path={ADVANCED_ANALYSIS_COMPATIBILITY_PATH}
                            element={
                                <Navigate
                                    to={
                                        retainedAnalysisArrival
                                            ? retainedAnalysisDestination(
                                                  ADVANCED_ANALYSIS_PATH,
                                                  retainedAnalysisArrival,
                                              )
                                            : ADVANCED_ANALYSIS_PATH
                                    }
                                    replace
                                />
                            }
                        />
                        <Route
                            path="/questions"
                            element={
                                <QuestionsPage capabilityState={state} onCapabilityRetry={retry} />
                            }
                        />
                        <Route
                            path="/questions/:token"
                            element={
                                <QuestionsPage capabilityState={state} onCapabilityRetry={retry} />
                            }
                        />
                        <Route path="/ask-ai" element={askAiElement} />
                        <Route path="/ask-ai/submissions/:token" element={askAiElement} />
                        <Route
                            path="/submissions/:token"
                            element={
                                <SubmissionPage
                                    capabilityState={state}
                                    askAiAvailable={askAiAvailable}
                                />
                            }
                        />
                        <Route
                            path="/catalogue"
                            element={
                                <CataloguePage
                                    applicationLocale={applicationLocale}
                                    serverLocales={serverLocales}
                                    capabilitiesLoading={state.status === 'loading'}
                                    capabilityMismatch={state.status === 'incompatible'}
                                />
                            }
                        />
                        <Route
                            path="/statistics"
                            element={
                                <StatisticsPage
                                    applicationLocale={applicationLocale as SupportedLocale}
                                />
                            }
                        />
                        <Route path="/about" element={<InformationalPage kind="about" />} />
                        <Route path="/contact" element={<InformationalPage kind="contact" />} />
                        <Route path="/faq" element={<InformationalPage kind="faq" />} />
                        <Route path="/imprint" element={<InformationalPage kind="imprint" />} />
                        <Route path="/privacy" element={<InformationalPage kind="privacy" />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </DeclaredNavigationProvider>
            </Suspense>
        </ApplicationShell>
    );
}
