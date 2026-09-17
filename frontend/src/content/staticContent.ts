// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import type { TranslationKey } from '../i18n/locales';

export type StaticPageKind = 'about' | 'contact' | 'faq' | 'imprint' | 'privacy';

export interface StaticLink {
    href: string;
    label: TranslationKey;
}

export interface StaticSection {
    heading?: TranslationKey;
    /** Body paragraphs, in the order they should be read. */
    paragraphs?: TranslationKey[];
    /** A numbered walk-through, for the sections that describe a procedure rather than state a fact. */
    steps?: TranslationKey[];
    /** Postal and contact lines, which must keep their own line rather than being reflowed into prose. */
    lines?: TranslationKey[];
    /** Outbound links offered after the prose. */
    links?: StaticLink[];
}

/**
 * A grant acknowledgement. The funder, the sentence naming the project, and the reference number the funding body
 * requires to be quoted alongside it.
 */
export interface StaticFunding {
    funder: TranslationKey;
    body: TranslationKey;
    referenceLabel: TranslationKey;
    reference: string;
    href: string;
}

export interface StaticPageContent {
    title: TranslationKey;
    /** What this page in particular is for. Pages without one fall back to the generic site lead. */
    lead?: TranslationKey;
    sections: StaticSection[];
    funding?: StaticFunding[];
}

const LITTERBOX_SOURCE_URL = 'https://github.com/se2p/LitterBox';
const LITTERBOX_ISSUES_URL = 'https://github.com/se2p/LitterBox/issues';
const SOFTWARE_ENGINEERING_URL =
    'https://www.fim.uni-passau.de/lehrstuhl-fuer-software-engineering-ii';
const COMPUTING_EDUCATION_URL = 'https://www.ddi.fim.uni-passau.de';
const BMBF_URL = 'https://www.bmbf.de/';
const DFG_URL = 'https://www.dfg.de/';

/** Publisher and controller are the same institution, and both pages must print the address in full. */
const universityAddress: TranslationKey[] = [
    'addressUniversity',
    'addressStreet',
    'addressCity',
    'addressTelephone',
    'addressEmail',
];

export const staticPageContent: Record<StaticPageKind, StaticPageContent> = {
    about: {
        title: 'aboutTitle',
        lead: 'aboutLead',
        sections: [
            {
                paragraphs: ['aboutWhatBody', 'aboutHowBody', 'aboutWhoBody'],
            },
            {
                heading: 'aboutUsageHeading',
                steps: [
                    'aboutUsageStepOpen',
                    'aboutUsageStepChoose',
                    'aboutUsageStepSubmit',
                    'aboutUsageStepAnalyse',
                    'aboutUsageStepRead',
                ],
            },
            {
                heading: 'aboutSourceHeading',
                paragraphs: ['aboutSourceBody'],
                links: [{ href: LITTERBOX_SOURCE_URL, label: 'aboutSourceLink' }],
            },
        ],
        funding: [
            {
                funder: 'fundingBmbfName',
                body: 'fundingBmbfBody',
                referenceLabel: 'fundingGrantNumber',
                reference: '01JA2021',
                href: BMBF_URL,
            },
            {
                funder: 'fundingDfgName',
                body: 'fundingDfgBody',
                referenceLabel: 'fundingProjectReference',
                reference: 'FR 2955/3-1',
                href: DFG_URL,
            },
        ],
    },
    contact: {
        title: 'contactTitle',
        lead: 'contactLead',
        sections: [
            {
                // The two groups that build LitterBox, before the switchboard number: a reader who wants to know who
                // is behind the analysis is better served by their pages than by the university's postal address.
                heading: 'contactGroupsHeading',
                paragraphs: ['contactGroupsBody'],
                links: [
                    { href: SOFTWARE_ENGINEERING_URL, label: 'contactSoftwareEngineeringLink' },
                    { href: COMPUTING_EDUCATION_URL, label: 'contactComputingEducationLink' },
                ],
            },
            {
                heading: 'contactSourceHeading',
                paragraphs: ['contactSourceBody'],
                links: [
                    { href: LITTERBOX_ISSUES_URL, label: 'contactIssuesLink' },
                    { href: LITTERBOX_SOURCE_URL, label: 'aboutSourceLink' },
                ],
            },
            { heading: 'staticContactDetails', lines: universityAddress },
        ],
    },
    faq: {
        title: 'faqTitle',
        lead: 'faqLead',
        // Roughly in the order someone meets them: what to submit, what comes back, what it means, and only then the
        // questions about the service itself.
        sections: [
            { heading: 'faqQuestionSubmission', paragraphs: ['faqAnswerSubmission'] },
            { heading: 'faqQuestionResults', paragraphs: ['faqAnswerResults'] },
            { heading: 'faqQuestionFamilies', paragraphs: ['faqAnswerFamilies'] },
            { heading: 'faqQuestionGrading', paragraphs: ['faqAnswerGrading'] },
            { heading: 'faqQuestionNoFindings', paragraphs: ['faqAnswerNoFindings'] },
            { heading: 'faqQuestionMblock', paragraphs: ['faqAnswerMblock'] },
            { heading: 'faqQuestionClassroom', paragraphs: ['faqAnswerClassroom'] },
            { heading: 'faqQuestionUploads', paragraphs: ['faqAnswerUploads'] },
            {
                heading: 'faqQuestionLicence',
                paragraphs: ['faqAnswerLicence'],
                links: [{ href: LITTERBOX_SOURCE_URL, label: 'aboutSourceLink' }],
            },
        ],
    },
    imprint: {
        title: 'imprintTitle',
        lead: 'imprintLead',
        sections: [
            { heading: 'imprintPublisherHeading', lines: universityAddress },
            { heading: 'imprintLegalFormHeading', paragraphs: ['imprintLegalFormBody'] },
            { heading: 'imprintRepresentationHeading', paragraphs: ['imprintRepresentationBody'] },
        ],
    },
    privacy: {
        title: 'privacyTitle',
        lead: 'privacyLead',
        sections: [
            // What this service does with an uploaded project comes first: it is the only part specific to LitterBox,
            // and the only part a person about to upload something needs before they decide.
            { heading: 'privacyDataHeading', paragraphs: ['privacyDataBody'] },
            // Straight after it, because it is the same question — where does what I upload go — answered for the
            // one part of this service that sends it somewhere else again.
            {
                heading: 'privacyAskAiHeading',
                paragraphs: ['privacyAskAiBody', 'privacyAskAiStorageBody'],
            },
            { heading: 'privacyUploadHeading', paragraphs: ['privacyUploadBody'] },
            {
                heading: 'privacyControllerHeading',
                lines: universityAddress,
                paragraphs: ['privacyControllerBody'],
            },
            { heading: 'privacyGeneralHeading', paragraphs: ['privacyGeneralBody'] },
            { heading: 'privacyOfficerHeading', lines: ['privacyOfficerEmail'] },
            { heading: 'privacyPurposesHeading', paragraphs: ['privacyPurposesBody'] },
            { heading: 'privacyCategoriesHeading', paragraphs: ['privacyCategoriesBody'] },
            { heading: 'privacyRecipientsHeading', paragraphs: ['privacyRecipientsBody'] },
            { heading: 'privacyStorageHeading', paragraphs: ['privacyStorageBody'] },
            { heading: 'privacyRightsHeading', paragraphs: ['privacyRightsBody'] },
        ],
    },
};
