// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AskAiQuestions } from '../../api/ask-ai';
import type { ConversationScope } from '../../pages/ask-ai-machine';
import { FamilyIcon } from '../single-project/FamilyIcon';
import { RichHint } from '../single-project/RichHint';
import { ScratchblocksPreview } from '../single-project/ScratchblocksPreview';
import { Thumbnail } from '../single-project/Thumbnail';
import { richHintPlainText } from '../single-project/rich-hint';
import { Breadcrumb, type Crumb } from './Breadcrumb';
import { PlaceChip } from './PlaceChip';
import {
    goalWorthOffering,
    placeOf,
    placesFor,
    questionsFor,
    useCatalogue,
    ASK_AI_GOAL_CARDS,
    GOAL_ICONS,
    GOAL_LABEL_KEYS,
    GOAL_LEAD_KEYS,
    INTENT_ICONS,
    type AskAiGoal,
    type Catalogue,
    type CatalogueQuestion,
    type CataloguePlace,
    type QuestionGoal,
} from './goal-catalogue';
import { PartChooser } from './PartChooser';
import { QuestionIcon } from './QuestionIcon';
import { chooserLabels, chooserSteps, stepDecoration, type ChooserPosition } from './trail';

const QUESTIONS_AT_ONCE = 5;

function QuestionButton({
    question,
    number,
    count,
    place,
    locale,
    onSelect,
}: {
    question: CatalogueQuestion;
    /** Distinguishes identical questions in the accessible name. */
    number: number;
    count: number;
    /** Include the place in the accessible name when needed. */
    place?: CataloguePlace;
    locale: string;
    onSelect: () => void;
}) {
    const { t } = useTranslation();
    const labelId = useId();
    const placeId = useId();
    const numberId = useId();
    const icon = question.intent ? INTENT_ICONS[question.intent] : question.theme;
    const code = question.code?.trim() ? question.code : undefined;
    const labelledBy = [labelId, place && placeId, count > 1 && numberId].filter(Boolean).join(' ');
    return (
        <button
            type="button"
            aria-labelledby={labelledBy}
            className={
                question.family
                    ? `ask-ai-question-button ask-ai-question-family-${question.family}`
                    : 'ask-ai-question-button'
            }
            data-question-selector={question.scope.selector}
            onClick={onSelect}
        >
            {question.family ? (
                <FamilyIcon family={question.family} />
            ) : (
                icon && <QuestionIcon name={icon} />
            )}
            <span
                id={labelId}
                className="ask-ai-question-label"
                aria-label={question.rich ? richHintPlainText(question.text, locale) : undefined}
            >
                {question.rich ? (
                    <RichHint
                        value={question.text}
                        locale={locale}
                        scratchblocksLabel={t('scratchblocks')}
                        textAlternativeLabel={t('textAlternative')}
                    />
                ) : (
                    question.text
                )}
                {place && (
                    <span id={placeId}>
                        <PlaceChip place={place} locale={locale} />
                    </span>
                )}
                {/* Distinguish identical question buttons visually and accessibly. */}
                {count > 1 && (
                    <span id={numberId} className="ask-ai-question-number">
                        {t('askAiQuestionNumber', { number, count })}
                    </span>
                )}
            </span>
            {/* The label, place, and number name the button; the code preview is supplementary. */}
            {code && (
                <span className="ask-ai-question-code" aria-hidden="true">
                    <ScratchblocksPreview
                        source={code}
                        locale={locale}
                        label={t('scratchblocks')}
                        textAlternativeLabel={t('textAlternative')}
                        showLabel={false}
                        showTextAlternative={false}
                    />
                </span>
            )}
        </button>
    );
}

const numbered = (
    list: CatalogueQuestion[],
): { question: CatalogueQuestion; number: number; count: number }[] => {
    const totals = new Map<string, number>();
    for (const question of list) totals.set(question.text, (totals.get(question.text) ?? 0) + 1);
    const seen = new Map<string, number>();
    return list.map((question) => {
        const number = (seen.get(question.text) ?? 0) + 1;
        seen.set(question.text, number);
        return { question, number, count: totals.get(question.text) ?? 1 };
    });
};

const splitQuestions = (questions: CatalogueQuestion[]) => ({
    asked: questions.filter((question) => !question.family),
    found: questions.filter((question) => question.family),
});

/** Preserve the expanded list when restoring focus to a question hidden behind “Show more”. */
const wasBeyondTheFirstFew = (
    catalogue: Catalogue,
    openAt: ChooserPosition | undefined,
    restoreFocusTo: string | undefined,
): boolean => {
    if (restoreFocusTo === undefined || openAt?.goal === undefined) return false;
    const places = placesFor(catalogue, openAt.goal);
    const place =
        openAt.place !== undefined ? openAt.place : places.length === 1 ? places[0].key : undefined;
    if (place === undefined) return false;
    const { asked, found } = splitQuestions(questionsFor(catalogue, openAt.goal, place));
    return [asked, found].some(
        (list) =>
            list.findIndex((question) => question.scope.selector === restoreFocusTo) >=
            QUESTIONS_AT_ONCE,
    );
};

const onlyPlaceFor = (catalogue: Catalogue, goal: AskAiGoal): CataloguePlace | undefined => {
    const places = placesFor(catalogue, goal);
    return places.length === 1 ? places[0] : undefined;
};

const soleQuestionFor = (
    catalogue: Catalogue,
    goal: AskAiGoal,
    place: string | null,
): CatalogueQuestion | undefined => {
    const asked = questionsFor(catalogue, goal, place);
    return asked.length === 1 ? asked[0] : undefined;
};

const normalisePosition = (catalogue: Catalogue, position: ChooserPosition): ChooserPosition => {
    const goal = position.goal;
    if (goal === undefined) return position;
    const onlyPlace = onlyPlaceFor(catalogue, goal);
    const place = position.place !== undefined ? position.place : onlyPlace?.key;
    if (place === undefined || !soleQuestionFor(catalogue, goal, place)) return position;
    return onlyPlace ? {} : { goal };
};

export function QuestionsChooser({
    questions,
    project,
    locale,
    onSelect,
    onMove,
    restoreFocusTo,
    openAt,
}: {
    questions: AskAiQuestions;
    project: string;
    locale: string;
    onSelect: (
        scope: ConversationScope,
        from: ChooserPosition,
        about: CataloguePlace | undefined,
    ) => void;
    onMove?: (to: ChooserPosition) => void;
    restoreFocusTo?: string;
    openAt?: ChooserPosition;
}) {
    const { t } = useTranslation();
    const catalogue = useCatalogue(questions);
    const [position, setPosition] = useState<ChooserPosition>(() =>
        normalisePosition(catalogue, openAt ?? {}),
    );
    const [showAll, setShowAll] = useState(() =>
        wasBeyondTheFirstFew(catalogue, openAt, restoreFocusTo),
    );

    const chooserRef = useRef<HTMLDivElement>(null);
    const restoredFocus = useRef(false);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const cameOutOf = useRef<string | undefined>(undefined);

    const goal = position.goal;
    const places = goal === undefined ? [] : placesFor(catalogue, goal);
    const onlyPlace = places.length === 1 ? places[0] : undefined;
    const chosen =
        goal === undefined
            ? undefined
            : (onlyPlace ??
              (position.place === undefined ? undefined : placeOf(catalogue, position.place)));
    const here: ChooserPosition = { goal, place: chosen?.key };
    const nothingToAsk = goal !== undefined && questionsFor(catalogue, goal).length === 0;
    const screen: 'goal' | 'part' | 'question' | 'nothing' =
        goal === undefined
            ? 'goal'
            : nothingToAsk
              ? 'nothing'
              : chosen === undefined
                ? 'part'
                : 'question';

    // Move focus only when the chooser screen changes.
    const at = `${goal ?? ''}/${chosen?.key ?? ''}`;
    const lastAt = useRef(at);
    useEffect(() => {
        if (lastAt.current === at) return;
        lastAt.current = at;
        const leftKey = cameOutOf.current;
        cameOutOf.current = undefined;
        // Avoid interpolating untrusted service text into a selector.
        const cards = chooserRef.current?.querySelectorAll<HTMLElement>('[data-target-key]') ?? [];
        const card = leftKey
            ? [...cards].find((button) => button.dataset.targetKey === leftKey)
            : undefined;
        (card ?? headingRef.current)?.focus();
    }, [at]);

    useEffect(() => {
        if (restoreFocusTo === undefined || restoredFocus.current) return;
        restoredFocus.current = true;
        const buttons =
            chooserRef.current?.querySelectorAll<HTMLElement>('[data-question-selector]') ?? [];
        const asked = [...buttons].find(
            (button) => button.dataset.questionSelector === restoreFocusTo,
        );
        (asked ?? headingRef.current)?.focus();
    }, [restoreFocusTo]);

    const stepTo = (to: ChooserPosition, landOn: string | undefined) => {
        const landing = normalisePosition(catalogue, to);
        cameOutOf.current = landOn;
        setShowAll(false);
        setPosition(landing);
        onMove?.(landing);
    };

    const openSoleQuestion = (goal: AskAiGoal, place: CataloguePlace, sole: CatalogueQuestion) =>
        onSelect(sole.scope, { goal, place: place.key }, placeOf(catalogue, sole.place));

    const steps = chooserSteps(catalogue, here, chooserLabels(t, locale));

    const cardOfStep = (index: number): string | undefined => {
        const next = steps[index + 1];
        if (!next) return undefined;
        return next.place ? (next.place.key ?? 'project') : next.to.goal;
    };

    const currentContent = (): ReactNode => {
        const place = steps[steps.length - 1]?.place;
        if (!place || place.kind !== 'sprite') return undefined;
        return (
            <span className="ask-ai-open-target">
                <span aria-hidden="true">
                    <Thumbnail
                        sprite={place.node?.target.label ?? place.sprite}
                        thumbnailRef={place.node?.target.thumbnail ?? null}
                        label={place.sprite}
                        fallbackLabel={t('fallbackPreview')}
                    />
                </span>
                {place.sprite}
            </span>
        );
    };

    const crumbs: Crumb[] = steps.map((step, index) => {
        const last = index === steps.length - 1;
        return {
            key: step.key,
            label: step.label,
            ...stepDecoration(step),
            content: last ? currentContent() : undefined,
            onNavigate: last ? undefined : () => stepTo(step.to, cardOfStep(index)),
        };
    });

    const asking = goal === undefined ? [] : questionsFor(catalogue, goal, chosen?.key ?? null);
    const { asked, found } = splitQuestions(asking);
    const shownCount = showAll
        ? asking.length
        : Math.min(asked.length, QUESTIONS_AT_ONCE) + Math.min(found.length, QUESTIONS_AT_ONCE);
    const announced =
        screen === 'part'
            ? t('askAiPartsAvailable', { count: places.length })
            : screen !== 'question'
              ? ''
              : shownCount < asking.length
                ? t('askAiQuestionsShownOf', { shown: shownCount, total: asking.length })
                : t('askAiQuestionsAvailable', { count: asking.length });

    const offered = ASK_AI_GOAL_CARDS.filter((candidate) =>
        goalWorthOffering(catalogue, candidate),
    );

    return (
        <div className="ask-ai-chooser" ref={chooserRef}>
            {steps.length > 1 ? (
                <Breadcrumb crumbs={crumbs} headingLevel={2} headingRef={headingRef} />
            ) : (
                <h2 className="ask-ai-step-heading" ref={headingRef} tabIndex={-1}>
                    {t('askAiHelpWithTitle')}
                </h2>
            )}
            {/* Announce screen changes without repeating the empty-state message. */}
            {screen !== 'nothing' && (
                <p className="visually-hidden" role="status">
                    {announced}
                </p>
            )}

            {screen === 'goal' && (
                <div className="ask-ai-step">
                    <p className="hint">{t('askAiChooserLead', { project })}</p>
                    {questionsFor(catalogue, 'unsure').length > 0 && (
                        <button
                            type="button"
                            className="ask-ai-goal-unsure"
                            data-target-key="unsure"
                            onClick={() => stepTo({ goal: 'unsure' }, undefined)}
                        >
                            {t('askAiGoalUnsure')}
                        </button>
                    )}
                    <div className="ask-ai-goal-grid">
                        {offered.map((candidate) => {
                            const onlyCandidatePlace = onlyPlaceFor(catalogue, candidate);
                            const sole =
                                onlyCandidatePlace &&
                                soleQuestionFor(catalogue, candidate, onlyCandidatePlace.key);
                            return (
                                <GoalCard
                                    key={candidate}
                                    goal={candidate}
                                    onOpen={() =>
                                        onlyCandidatePlace && sole
                                            ? openSoleQuestion(candidate, onlyCandidatePlace, sole)
                                            : stepTo({ goal: candidate }, undefined)
                                    }
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {screen === 'nothing' && (
                <div className="ask-ai-step">
                    <p className="ask-ai-nothing-found" role="status">
                        {t('askAiNoProblemsFound')}
                    </p>
                    <p className="ask-ai-nothing-found-lead">{t('askAiNoProblemsFoundLead')}</p>
                </div>
            )}

            {screen === 'part' && goal !== undefined && (
                <div className="ask-ai-step">
                    <p className="hint">{t('askAiWhichPartLead')}</p>
                    <PartChooser
                        catalogue={catalogue}
                        goal={goal}
                        project={project}
                        locale={locale}
                        onOpen={(place) => {
                            const sole = soleQuestionFor(catalogue, goal, place.key);
                            if (sole) {
                                openSoleQuestion(goal, place, sole);
                            } else {
                                stepTo({ goal, place: place.key }, undefined);
                            }
                        }}
                    />
                </div>
            )}

            {screen === 'question' && chosen !== undefined && goal !== undefined && (
                <div className="ask-ai-step">
                    <QuestionScreen
                        catalogue={catalogue}
                        place={chosen}
                        asked={asked}
                        found={found}
                        namePlaces={goal === 'unsure'}
                        locale={locale}
                        showAll={showAll}
                        onShowAll={setShowAll}
                        onSelect={(question) =>
                            onSelect(question.scope, here, placeOf(catalogue, question.place))
                        }
                    />
                </div>
            )}
        </div>
    );
}

function GoalCard({ goal, onOpen }: { goal: QuestionGoal; onOpen: () => void }) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            className={`ask-ai-goal-button ask-ai-goal-${goal}`}
            data-target-key={goal}
            onClick={onOpen}
        >
            <span className="ask-ai-goal-medallion" aria-hidden="true">
                <QuestionIcon name={GOAL_ICONS[goal]} />
            </span>
            <span className="ask-ai-goal-label">{t(GOAL_LABEL_KEYS[goal])}</span>
            <span className="ask-ai-goal-lead">{t(GOAL_LEAD_KEYS[goal])}</span>
        </button>
    );
}

function QuestionScreen({
    catalogue,
    place,
    asked,
    found,
    namePlaces,
    locale,
    showAll,
    onShowAll,
    onSelect,
}: {
    catalogue: Catalogue;
    place: CataloguePlace;
    asked: CatalogueQuestion[];
    found: CatalogueQuestion[];
    namePlaces: boolean;
    locale: string;
    showAll: boolean;
    onShowAll: (value: boolean) => void;
    onSelect: (question: CatalogueQuestion) => void;
}) {
    const { t } = useTranslation();
    const code = place.kind === 'script' ? place.node : place.code;
    const shown = <T,>(list: T[]) => (showAll ? list : list.slice(0, QUESTIONS_AT_ONCE));
    const hasMore = asked.length > QUESTIONS_AT_ONCE || found.length > QUESTIONS_AT_ONCE;
    const button = (entry: ReturnType<typeof numbered>[number]) => (
        <QuestionButton
            key={entry.question.scope.selector}
            {...entry}
            place={namePlaces ? placeOf(catalogue, entry.question.place) : undefined}
            locale={locale}
            onSelect={() => onSelect(entry.question)}
        />
    );

    return (
        <>
            <p className="hint">{t('askAiPickQuestionLead')}</p>
            <div className="ask-ai-question-screen">
                {code && code.target.scratchblocks.trim() && (
                    <div className="ask-ai-open-script">
                        <ScratchblocksPreview
                            source={code.target.scratchblocks}
                            locale={locale}
                            label={code.target.label.trim() || t('askAiScriptWithoutTrigger')}
                            textAlternativeLabel={t('textAlternative')}
                            showLabel={false}
                        />
                    </div>
                )}
                <div className="ask-ai-question-lists">
                    {asked.length > 0 && (
                        <div className="ask-ai-question-grid">
                            {shown(numbered(asked)).map(button)}
                        </div>
                    )}
                    {found.length > 0 && (
                        <div className="ask-ai-findings-here">
                            <h3>{t('askAiFindingsHereTitle')}</h3>
                            <p className="hint">{t('askAiFindingsHereLead')}</p>
                            <div className="ask-ai-question-grid">
                                {shown(numbered(found)).map(button)}
                            </div>
                        </div>
                    )}
                    {hasMore && (
                        <button
                            type="button"
                            className="ask-ai-show-more"
                            aria-expanded={showAll}
                            onClick={() => onShowAll(!showAll)}
                        >
                            {showAll ? t('askAiShowFewerQuestions') : t('askAiShowMoreQuestions')}
                        </button>
                    )}
                    {/* Show truncation after the visible list is exhausted. */}
                    {catalogue.truncated && (showAll || !hasMore) && (
                        <p className="hint ask-ai-questions-truncated">
                            {t('askAiQuestionsTruncated')}
                        </p>
                    )}
                </div>
            </div>
        </>
    );
}
