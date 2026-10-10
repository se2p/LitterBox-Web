// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

export const assessmentKeys = {
    eyebrow: 'Quiz builder',
    title: 'Build a quiz from these questions',
    lead: 'Select generated questions, adapt them for your class, or add your own. Filters change only what you see; the selected set stays intact until you change it.',
    defaultTitle: '{{project}} quiz',
    draftSavedOnDevice: 'Your quiz draft is saved automatically on this device.',
    draftSaveError:
        'This device cannot save your draft. Download the editable JSON before leaving.',
    untitledProject: 'Project',
    name: 'Quiz title',
    instructions: 'Instructions for learners',
    addQuestion: 'Add your own question',
    addToQuiz: 'Add to quiz',
    newQuestionText: 'Write your question here.',
    questionAdded: 'Question {{number}} added. Editing it below.',
    quizCoverageSummary: '{{cells}} of 12 block-model cells covered by the selected questions.',
    quizCoveredCells: 'Covered cells:',
    bankSelectionSummary: '{{selected}} of {{total}} selected.',
    selectShown: 'Select shown questions',
    deselectShown: 'Deselect shown questions',
    exportLabel: 'Export quiz',
    exportStudent: 'Download printable quiz',
    exportTeacher: 'Download teacher copy',
    exportJson: 'Download editable JSON',
    exportError: 'The quiz download could not be prepared. Try again.',
    selectionRequired: 'Select at least one question before you can export or publish.',
    importLabel: 'Import from JSON',
    importSuccess_one:
        'Loaded {{count}} question into your quiz. The question bank is still available.',
    importSuccess_other:
        'Loaded {{count}} questions into your quiz. The question bank is still available.',
    importWrongProject:
        'This quiz is not for the current project. Open its source project’s question set and import it there.',
    importError:
        'This file could not be read as a LitterBox quiz. Choose a JSON file exported from here.',
    importOverLimit:
        'This quiz has more or longer questions or answers than this site allows, so nothing was loaded.',
    tooManyQuestions_one:
        'You can publish only {{count}} question. Deselect the others to continue.',
    tooManyQuestions_other: 'You can publish up to {{count}} questions. Deselect some to continue.',
    importTooLarge:
        'This file is too big to be a LitterBox quiz. Choose a JSON file exported from here.',
    questionRequired: 'Every selected question needs question text before it can be exported.',
    multipleChoiceStructureInvalid:
        'Multiple-choice questions need at least one unique, non-empty option and a valid answer count.',
    tooManyEntries: 'Keep this to {{limit}} lines or fewer, then publish.',
    entryTooLong: 'Each line has to be {{limit}} characters or fewer, then publish.',
    textTooLong: 'This has to be {{limit}} characters or fewer, then publish.',
    limitsExceeded: 'One of your questions is over a limit. Fix the lines marked above to publish.',
    includeQuestion: 'Include question {{number}} in quiz',
    addQuestionToQuiz: 'Add "{{summary}}" to the quiz',
    questionDetailsToggleNumbered: 'Question {{number}} details:',
    questionDetailsToggle: 'Question details:',
    builderNavLabel: 'Quiz builder sections',
    quizSectionTitle: 'Your quiz',
    quizSectionDescription: 'The selected questions, in the order your class will see them.',
    quizEmpty: 'Your quiz is empty. Add questions from the bank below, or write your own.',
    moveQuestionEarlier: 'Move question {{number}} earlier',
    moveQuestionLater: 'Move question {{number}} later',
    questionMovedEarlier: 'Question moved earlier. Now question {{number}}.',
    questionMovedLater: 'Question moved later. Now question {{number}}.',
    bankSectionTitle: 'Question bank',
    bankSectionDescription:
        'Every question generated for this project and not yet in your quiz. Filter by what it checks, or add it directly.',
    bankEmpty: 'Every generated question is already in your quiz.',
    publishSectionTitle: 'Name and publish',
    publishSectionDescription:
        'Give the quiz a title and instructions, then export it or publish it for your class.',
    generatedQuestion: 'Generated from the project',
    editedGeneratedQuestion: 'Edited — no longer marked automatically',
    teacherQuestion: 'Added by teacher',
    customQuestionFallback: 'Added by teacher — not marked automatically',
    editQuestionNumbered: 'Edit question {{number}}',
    editQuestion: 'Edit this question',
    closeEditor: 'Close editor',
    restoreQuestion: 'Restore generated question',
    removeQuestion: 'Remove question',
    questionText: 'Question text',
    questionType: 'Answer type',
    options: 'Answer choices',
    optionsHint: 'One choice per line',
    markCorrectAnswers: 'Correct choices',
    correctAnswersHint:
        'Tick the choices that are correct and this question is marked for the class automatically. Leave every choice unticked and answers are still collected, just never marked.',
    correctAnswerYesNo: 'Correct answer',
    correctAnswerYesNoHint:
        'Choose the right answer and this question is marked for the class automatically. Learners answering in another language are marked correctly too.',
    correctAnswerUnmarked: 'Do not mark this question',
    correctAnswerNumber: 'Correct number',
    correctAnswerNumberHint:
        'The number a learner has to give. Leave it empty and answers are still collected, just never marked.',
    correctAnswerFreeText: 'Accepted answers',
    correctAnswerFreeTextPlaceholder: 'One accepted answer per line',
    correctAnswerFreeTextHint:
        'A learner matching any one of these is right. Capitals are ignored, and a short answer counts as long as it appears as a whole word in what they wrote, so an answer given inside a sentence still counts. Leave it empty and answers are still collected, just never marked.',
    expectedAnswers: 'Number of choices learners should select',
    answerGuide: 'Answer or marking guidance',
    answerGuideHint:
        'Optional. Generated answers are not exposed here; add the guidance you want on the teacher copy.',
    answerGuideMissing: 'No answer or marking guidance was added.',
    correctAnswers: 'Correct answer',
    answerKeyFetchError:
        'The correct answers could not be loaded for this download. The teacher copy still downloaded, with your own guidance only.',
    richHintPreviewHint:
        'Formatting is written the way it is everywhere on this site: [b]bold[/b], [i]italic[/i], [bc]code[/bc]. The preview below is what this turns into.',
    previewLabel: 'Preview',
    questionHint: 'Hint',
    codeContext: 'Scratchblocks code context',
    programDimension: 'Program dimension',
    scopeOfFocus: 'Scope of focus',
    noClassification: 'Not classified',
    studentName: 'Name',
    studentClass: 'Class',
    exportQuestion: 'Question',
    yes: 'Yes',
    no: 'No',
    generatedBy: 'Prepared with LitterBox',
    publishAction: 'Publish for learners to open',
    publishingUnavailable:
        'Online publishing is disabled on this site. You can download a printable quiz instead.',
    publishing: 'Publishing…',
    publishError: 'The quiz could not be published. Try again.',
    publishEditedConfirmTitle: 'Some questions will not be marked automatically',
    publishEditedConfirmIntro_one:
        '{{count}} question cannot be marked by this service. It is published and answered as usual, but no answer to it is judged right or wrong:',
    publishEditedConfirmIntro_other:
        '{{count}} questions cannot be marked by this service. They are published and answered as usual, but no answer to them is judged right or wrong:',
    publishEditedConfirmConsequence:
        "These questions will still collect learners' answers, and you will still see how many answered each one; they are simply not counted as correct or incorrect. Add marking guidance for them, or restore the generated version, before you publish if that is not what you want.",
    publishEditedConfirmBack: 'Go back',
    publishedHeading: 'Quiz published',
    publishedLearnerLabel: 'Link for learners',
    publishedLearnerHint:
        'Share this with your class. Anyone with the link can open and answer the quiz.',
    publishedResultsLabel: 'Link for you — keep this one',
    publishedResultsHint:
        'This is the only time this link is shown. It opens the results; if you lose it, there is no way to get it back.',
    rememberedQuizzesHeading: 'Quizzes you have published on this device',
    rememberedQuizLearnerLink: 'Learner link',
    rememberedQuizResultsLink: 'Results link',
    rememberedQuizPublished: 'Published {{date}}',
    resultsChoicesHeading: 'What the class chose',
    resultsChoicesHint:
        'How many readers picked each choice. A question asking for more than one choice is counted once per pick, so these can add up to more than the number of people who answered it.',
    resultsChoice: 'Choice',
    resultsChosenBy: 'Chosen by',
    resultsOtherAnswers: 'Answers naming none of these',
    resultsScoresHeading: 'How the class scored',
    resultsScoresHint_one:
        'Out of the {{formatted}} question this quiz can mark, and counting only the attempts that answered it.',
    resultsScoresHint_other:
        'Out of the {{formatted}} questions this quiz can mark, and counting only the attempts that answered every one of them — three right out of three is not the same result as three right out of ten.',
    resultsScoresUnmarkable:
        'No question in this quiz is one this service can mark, so there is no score to report. The answers are still collected and counted above.',
    resultsScoresNoneComplete: 'No attempt has answered every markable question yet.',
    resultsScore: 'Score',
    resultsScoreAttempts: 'Attempts',
    resultsScoreValue: '{{score}} of {{total}}',
    resultsPartialAttempts_one:
        '{{formatted}} attempt answered some of the markable questions but not all of them, and is not in the table above.',
    resultsPartialAttempts_other:
        '{{formatted}} attempts answered some of the markable questions but not all of them, and are not in the table above.',
    resultsDownloadCsv: 'Download results as CSV',
    resultsDownloadError: 'The download could not be prepared. Try again.',
    resultsCsvChoice: 'Choice {{position}}',
    resultsCsvChosenBy: 'Chosen by {{position}}',
} as const;

export type AssessmentKey = keyof typeof assessmentKeys;
export type AssessmentPack = Record<AssessmentKey, string>;
