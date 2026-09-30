// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { AskAiFindingFamily } from '../../api/ask-ai';
import { FamilyIcon } from '../single-project/FamilyIcon';
import { ScratchblocksPreview } from '../single-project/ScratchblocksPreview';
import { Thumbnail } from '../single-project/Thumbnail';
import {
    placeTrigger,
    placesFor,
    questionsFor,
    type AskAiGoal,
    type Catalogue,
    type CataloguePlace,
} from './goal-catalogue';
import { placeInWords } from './trail';

function PlaceBadges({ families, count }: { families: AskAiFindingFamily[]; count: number }) {
    const { t } = useTranslation();
    return (
        <span className="ask-ai-target-badges">
            {families.map((family) => (
                <span key={family} className={`ask-ai-target-badge ask-ai-target-badge-${family}`}>
                    <FamilyIcon family={family} />
                </span>
            ))}
            <span className="ask-ai-target-count">{t('askAiTargetQuestionCount', { count })}</span>
        </span>
    );
}

interface PlaceCardProps {
    place: CataloguePlace;
    families: AskAiFindingFamily[];
    count: number;
    locale: string;
    onOpen: () => void;
}

function WholeProjectCard({ families, count, onOpen }: Omit<PlaceCardProps, 'place' | 'locale'>) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            className="ask-ai-target-button ask-ai-whole-project-button"
            data-target-key="project"
            onClick={onOpen}
        >
            <span className="ask-ai-whole-project-thumbnail" aria-hidden="true">
                <svg
                    className="ask-ai-project-icon"
                    viewBox="0 0 48 48"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <rect
                        x="5"
                        y="7"
                        width="38"
                        height="26"
                        rx="4"
                        fill="var(--color-surface)"
                        stroke="currentColor"
                    />
                    <path d="M18 39h12M24 33v6" />
                    <path
                        d="M11 12v11M11 12h8l-1.8 2.5 1.8 2.5H11z"
                        fill="var(--color-success)"
                        stroke="var(--color-success)"
                        strokeWidth="1.6"
                    />
                    <path d="M13 28l6-6 5 5 5-5 6 6" strokeWidth="1.6" opacity="0.6" />
                    <circle
                        cx="33"
                        cy="15"
                        r="2.5"
                        fill="currentColor"
                        stroke="none"
                        opacity="0.6"
                    />
                </svg>
            </span>
            <span className="ask-ai-target-name">{t('askAiPartWholeProject')}</span>
            <PlaceBadges families={families} count={count} />
        </button>
    );
}

function SpriteCard({ place, families, count, onOpen }: Omit<PlaceCardProps, 'locale'>) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            className="ask-ai-target-button ask-ai-sprite-button"
            data-target-key={place.key ?? 'project'}
            onClick={onOpen}
        >
            <span aria-hidden="true">
                <Thumbnail
                    sprite={place.node?.target.label ?? place.sprite}
                    thumbnailRef={place.node?.target.thumbnail ?? null}
                    label={place.sprite}
                    fallbackLabel={t('fallbackPreview')}
                />
            </span>
            <span className="ask-ai-target-name">
                {t('askAiPartWholeSprite', { sprite: place.sprite })}
            </span>
            <PlaceBadges families={families} count={count} />
        </button>
    );
}

function ScriptCard({ place, families, count, locale, onOpen }: PlaceCardProps) {
    const { t } = useTranslation();
    const trigger = placeTrigger(place, locale);
    const source = place.node?.target.scratchblocks ?? '';
    // Include the visible question count in the accessible name.
    const spoken = `${placeInWords(place, t, locale)}. ${t('askAiTargetQuestionCount', { count })}`;
    return (
        <button
            type="button"
            className="ask-ai-target-button ask-ai-script-button"
            data-target-key={place.key ?? 'project'}
            onClick={onOpen}
            aria-label={spoken}
        >
            {source.trim() ? (
                <span className="ask-ai-script-preview" aria-hidden="true">
                    <ScratchblocksPreview
                        source={source}
                        locale={locale}
                        label={trigger || t('askAiScriptWithoutTrigger')}
                        textAlternativeLabel={t('textAlternative')}
                        showLabel={false}
                        showTextAlternative={false}
                    />
                </span>
            ) : (
                // A script listed without its code is named in words instead, so the card is never blank.
                <span className="ask-ai-target-name" aria-hidden="true">
                    {placeInWords(place, t, locale)}
                </span>
            )}
            <PlaceBadges families={families} count={count} />
        </button>
    );
}

interface PlaceGroup {
    key: string;
    sprite: string;
    actor?: CataloguePlace;
    scripts: CataloguePlace[];
}

const groupPlaces = (places: CataloguePlace[]): PlaceGroup[] => {
    const groups: PlaceGroup[] = [];
    const byKey = new Map<string, PlaceGroup>();
    const groupFor = (key: string, sprite: string): PlaceGroup => {
        const existing = byKey.get(key);
        if (existing) return existing;
        const group: PlaceGroup = { key, sprite, scripts: [] };
        byKey.set(key, group);
        groups.push(group);
        return group;
    };
    for (const place of places) {
        if (place.key === null) continue;
        if (place.kind === 'sprite') groupFor(place.key, place.sprite).actor = place;
        else groupFor(place.node?.target.parent ?? place.sprite, place.sprite).scripts.push(place);
    }
    return groups;
};

export function PartChooser({
    catalogue,
    goal,
    project,
    locale,
    onOpen,
}: {
    catalogue: Catalogue;
    goal: AskAiGoal;
    project: string;
    locale: string;
    onOpen: (place: CataloguePlace) => void;
}) {
    const { t } = useTranslation();
    const places = placesFor(catalogue, goal);
    const whole = places.find((place) => place.key === null);
    const groups = groupPlaces(places);
    const offer = (place: CataloguePlace) => {
        const asked = questionsFor(catalogue, goal, place.key);
        return {
            count: asked.length,
            families: [
                ...new Set(asked.flatMap((question) => (question.family ? [question.family] : []))),
            ],
        };
    };

    return (
        <>
            {catalogue.previewsTruncated && (
                <p className="hint ask-ai-previews-truncated">{t('askAiPreviewsTruncated')}</p>
            )}
            {whole && (
                <section className="ask-ai-part-group">
                    <h3 id="ask-ai-part-group-project" className="ask-ai-part-group-heading">
                        {project}
                    </h3>
                    <div
                        className="ask-ai-target-grid ask-ai-part-grid"
                        aria-labelledby="ask-ai-part-group-project"
                    >
                        <WholeProjectCard {...offer(whole)} onOpen={() => onOpen(whole)} />
                    </div>
                </section>
            )}
            {groups.map((group) => {
                const headingId = `ask-ai-part-group-${group.key}`;
                return (
                    <section key={group.key} className="ask-ai-part-group">
                        <h3 id={headingId} className="ask-ai-part-group-heading">
                            {group.sprite}
                        </h3>
                        <div
                            className="ask-ai-target-grid ask-ai-part-grid"
                            aria-labelledby={headingId}
                        >
                            {group.actor && (
                                <SpriteCard
                                    place={group.actor}
                                    {...offer(group.actor)}
                                    onOpen={() => onOpen(group.actor as CataloguePlace)}
                                />
                            )}
                            {group.scripts.map((script) => (
                                <ScriptCard
                                    key={script.key}
                                    place={script}
                                    {...offer(script)}
                                    locale={locale}
                                    onOpen={() => onOpen(script)}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
        </>
    );
}
