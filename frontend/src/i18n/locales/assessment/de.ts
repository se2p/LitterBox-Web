// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AssessmentPack } from './en';

export const pack: Partial<AssessmentPack> = {
    eyebrow: 'Quizgenerator',
    title: 'Aus diesen Fragen ein Quiz erstellen',
    lead: 'Wähle erzeugte Fragen aus, passe sie für deine Klasse an oder ergänze eigene. Filter ändern nur die Ansicht; die Auswahl bleibt erhalten, bis du sie änderst.',
    defaultTitle: 'Quiz zu {{project}}',
    draftSavedOnDevice: 'Dein Quizentwurf wird automatisch auf diesem Gerät gespeichert.',
    draftSaveError:
        'Dieses Gerät kann deinen Entwurf nicht speichern. Lade vor dem Verlassen das bearbeitbare JSON herunter.',
    untitledProject: 'Projekt',
    name: 'Titel des Quiz',
    instructions: 'Anweisungen für Lernende',
    addQuestion: 'Eigene Frage hinzufügen',
    addToQuiz: 'Zum Quiz hinzufügen',
    newQuestionText: 'Schreibe hier deine Frage.',
    questionAdded: 'Frage {{number}} hinzugefügt. Wird unten bearbeitet.',
    quizCoverageSummary:
        '{{cells}} von 12 Blockmodell-Feldern durch die ausgewählten Fragen abgedeckt.',
    quizCoveredCells: 'Abgedeckte Felder:',
    bankSelectionSummary: '{{selected}} von {{total}} ausgewählt.',
    selectShown: 'Angezeigte Fragen auswählen',
    deselectShown: 'Angezeigte Fragen abwählen',
    exportLabel: 'Quiz exportieren',
    exportStudent: 'Quiz herunterladen',
    exportTeacher: 'Lehrkraftkopie herunterladen',
    exportJson: 'JSON herunterladen',
    exportError: 'Der Download konnte nicht vorbereitet werden. Versuche es erneut.',
    selectionRequired:
        'Wähle mindestens eine Frage aus, bevor du exportieren oder veröffentlichen kannst.',
    importLabel: 'Aus JSON importieren',
    importSuccess_one: '{{count}} Frage ins Quiz geladen. Die Fragenbank bleibt verfügbar.',
    importSuccess_other: '{{count}} Fragen ins Quiz geladen. Die Fragenbank bleibt verfügbar.',
    importWrongProject:
        'Dieses Quiz gehört nicht zum aktuellen Projekt. Öffne den Fragensatz des ursprünglichen Projekts und importiere es dort.',
    importError:
        'Diese Datei konnte nicht als LitterBox-Quiz gelesen werden. Wähle eine hier exportierte JSON-Datei.',
    importOverLimit:
        'Dieses Quiz hat mehr oder längere Fragen oder Antworten, als diese Seite erlaubt. Es wurde nichts geladen.',
    tooManyQuestions_one:
        'Du kannst nur {{count}} Frage veröffentlichen. Wähle die anderen ab, um fortzufahren.',
    tooManyQuestions_other:
        'Du kannst höchstens {{count}} Fragen veröffentlichen. Wähle einige ab, um fortzufahren.',
    importTooLarge:
        'Diese Datei ist zu groß für ein LitterBox-Quiz. Wähle eine hier exportierte JSON-Datei.',
    questionRequired: 'Jede ausgewählte Frage benötigt vor dem Export einen Fragetext.',
    multipleChoiceStructureInvalid:
        'Multiple-Choice-Fragen benötigen mindestens eine eindeutige, nicht leere Option und eine gültige Anzahl an Antworten.',
    tooManyEntries: 'Höchstens {{limit}} Zeilen, dann veröffentlichen.',
    entryTooLong: 'Jede Zeile darf höchstens {{limit}} Zeichen haben, dann veröffentlichen.',
    textTooLong: 'Das darf höchstens {{limit}} Zeichen haben, dann veröffentlichen.',
    limitsExceeded:
        'Eine deiner Fragen überschreitet ein Limit. Korrigiere die oben markierten Zeilen zum Veröffentlichen.',
    includeQuestion: 'Frage {{number}} in das Quiz aufnehmen',
    addQuestionToQuiz: '„{{summary}}“ zum Quiz hinzufügen',
    questionDetailsToggleNumbered: 'Frage {{number}} Details:',
    questionDetailsToggle: 'Frage Details:',
    builderNavLabel: 'Abschnitte des Quizgenerators',
    quizSectionTitle: 'Dein Quiz',
    quizSectionDescription:
        'Die ausgewählten Fragen, in der Reihenfolge, in der deine Klasse sie sieht.',
    quizEmpty:
        'Dein Quiz ist noch leer. Füge Fragen aus dem Fragenpool unten hinzu oder schreibe eigene.',
    moveQuestionEarlier: 'Frage {{number}} nach vorne verschieben',
    moveQuestionLater: 'Frage {{number}} nach hinten verschieben',
    questionMovedEarlier: 'Frage nach vorne verschoben. Jetzt Frage {{number}}.',
    questionMovedLater: 'Frage nach hinten verschoben. Jetzt Frage {{number}}.',
    bankSectionTitle: 'Fragenpool',
    bankSectionDescription:
        'Alle für dieses Projekt erzeugten Fragen, die noch nicht im Quiz sind. Nach Inhalt filtern oder direkt hinzufügen.',
    bankEmpty: 'Jede erzeugte Frage ist bereits in deinem Quiz.',
    publishSectionTitle: 'Benennen und veröffentlichen',
    publishSectionDescription:
        'Gib dem Quiz einen Titel und Anweisungen, dann exportiere es oder veröffentliche es für deine Klasse.',
    generatedQuestion: 'Aus dem Projekt erzeugt',
    editedGeneratedQuestion: 'Bearbeitet — wird nicht mehr automatisch bewertet',
    teacherQuestion: 'Von der Lehrkraft ergänzt',
    customQuestionFallback: 'Von der Lehrkraft hinzugefügt — wird nicht automatisch bewertet',
    editQuestionNumbered: 'Frage {{number}} bearbeiten',
    editQuestion: 'Diese Frage bearbeiten',
    closeEditor: 'Editor schließen',
    restoreQuestion: 'Erzeugte Frage wiederherstellen',
    removeQuestion: 'Frage entfernen',
    questionText: 'Fragetext',
    questionType: 'Antworttyp',
    options: 'Antwortmöglichkeiten',
    optionsHint: 'Eine Möglichkeit pro Zeile',
    markCorrectAnswers: 'Richtige Möglichkeiten',
    correctAnswersHint:
        'Markiere die richtigen Möglichkeiten, dann wird diese Frage automatisch für die Klasse bewertet. Lässt du alles unmarkiert, werden Antworten weiterhin gesammelt, aber nie bewertet.',
    correctAnswerYesNo: 'Richtige Antwort',
    correctAnswerYesNoHint:
        'Wähle die richtige Antwort, dann wird diese Frage automatisch für die Klasse bewertet. Lernende, die in einer anderen Sprache antworten, werden ebenfalls richtig bewertet.',
    correctAnswerUnmarked: 'Diese Frage nicht bewerten',
    correctAnswerNumber: 'Richtige Zahl',
    correctAnswerNumberHint:
        'Die Zahl, die eine Lernende oder ein Lernender nennen muss. Lässt du das Feld leer, werden Antworten weiterhin gesammelt, aber nie bewertet.',
    correctAnswerFreeText: 'Akzeptierte Antworten',
    correctAnswerFreeTextPlaceholder: 'Eine akzeptierte Antwort pro Zeile',
    correctAnswerFreeTextHint:
        'Wer eine davon trifft, hat richtig geantwortet. Groß- und Kleinschreibung spielt keine Rolle, und eine kurze Antwort zählt, sobald sie als eigenes Wort im Geschriebenen vorkommt — eine Antwort mitten in einem Satz zählt also auch. Lässt du das Feld leer, werden Antworten weiterhin gesammelt, aber nie bewertet.',
    expectedAnswers: 'So viele Möglichkeiten sollen ausgewählt werden',
    answerGuide: 'Lösung oder Bewertungshinweis',
    answerGuideHint:
        'Optional. Erzeugte Lösungen werden hier nicht offengelegt; ergänze den Hinweis für die Lehrkraftfassung.',
    answerGuideMissing: 'Keine Lösung oder Bewertungshilfe ergänzt.',
    correctAnswers: 'Richtige Antwort',
    answerKeyFetchError:
        'Die richtigen Antworten konnten für diesen Download nicht geladen werden. Die Lehrkraftfassung wurde trotzdem heruntergeladen, nur mit deinem eigenen Bewertungshinweis.',
    richHintPreviewHint:
        'Formatierungen werden so geschrieben wie überall auf dieser Seite: [b]fett[/b], [i]kursiv[/i], [bc]Code[/bc]. Die Vorschau darunter zeigt, was daraus wird.',
    previewLabel: 'Vorschau',
    questionHint: 'Hinweis',
    codeContext: 'Scratchblocks-Codebezug',
    programDimension: 'Programmdimension',
    scopeOfFocus: 'Betrachtungsumfang',
    noClassification: 'Nicht zugeordnet',
    studentName: 'Name',
    studentClass: 'Klasse',
    exportQuestion: 'Frage',
    yes: 'Ja',
    no: 'Nein',
    generatedBy: 'Mit LitterBox erstellt',
    publishAction: 'Quiz veröffentlichen',
    publishingUnavailable:
        'Online-Veröffentlichungen sind auf dieser Website deaktiviert. Du kannst stattdessen ein Quiz zum Ausdrucken herunterladen.',
    publishing: 'Wird veröffentlicht …',
    publishError: 'Das Quiz konnte nicht veröffentlicht werden. Versuche es erneut.',
    publishEditedConfirmTitle: 'Einige Fragen werden nicht automatisch bewertet',
    publishEditedConfirmIntro_one:
        '{{count}} Frage kann von diesem Dienst nicht bewertet werden. Sie wird wie gewohnt veröffentlicht und beantwortet, aber keine Antwort darauf wird als richtig oder falsch beurteilt:',
    publishEditedConfirmIntro_other:
        '{{count}} Fragen können von diesem Dienst nicht bewertet werden. Sie werden wie gewohnt veröffentlicht und beantwortet, aber keine Antwort darauf wird als richtig oder falsch beurteilt:',
    publishEditedConfirmConsequence:
        'Diese Fragen sammeln weiterhin die Antworten der Lernenden, und du siehst weiterhin, wie viele jede beantwortet haben; sie werden nur nicht als richtig oder falsch gezählt. Ergänze dafür eine Bewertungshilfe oder stelle die erzeugte Version wieder her, falls das nicht gewünscht ist.',
    publishEditedConfirmBack: 'Zurück',
    publishedHeading: 'Quiz veröffentlicht',
    publishedLearnerLabel: 'Link für Lernende',
    publishedLearnerHint:
        'Teile diesen Link mit deiner Klasse. Wer ihn hat, kann das Quiz öffnen und beantworten.',
    publishedResultsLabel: 'Link für dich – diesen aufbewahren',
    publishedResultsHint:
        'Dieser Link wird nur dieses eine Mal angezeigt. Er öffnet die Ergebnisse; geht er verloren, gibt es keine Möglichkeit, ihn wiederzubekommen.',
    rememberedQuizzesHeading: 'Auf diesem Gerät veröffentlichte Quiz',
    rememberedQuizLearnerLink: 'Link für Lernende',
    rememberedQuizResultsLink: 'Ergebnislink',
    rememberedQuizPublished: 'Veröffentlicht am {{date}}',
    resultsChoicesHeading: 'Was die Klasse gewählt hat',
    resultsChoicesHint:
        'Wie oft jede Möglichkeit gewählt wurde. Bei einer Frage mit mehreren Auswahlen zählt jede einzelne Auswahl mit, deshalb kann die Summe größer sein als die Zahl derer, die geantwortet haben.',
    resultsChoice: 'Möglichkeit',
    resultsChosenBy: 'Gewählt von',
    resultsOtherAnswers: 'Antworten, die keine davon nennen',
    resultsScoresHeading: 'Wie die Klasse abgeschnitten hat',
    resultsScoresHint_one:
        'Von der {{formatted}} Frage, die dieses Quiz bewerten kann, und nur für die Versuche, die sie beantwortet haben.',
    resultsScoresHint_other:
        'Von den {{formatted}} Fragen, die dieses Quiz bewerten kann, und nur für die Versuche, die jede einzelne davon beantwortet haben — drei von drei richtig ist nicht dasselbe Ergebnis wie drei von zehn.',
    resultsScoresUnmarkable:
        'Keine Frage in diesem Quiz kann dieser Dienst bewerten, deshalb gibt es kein Ergebnis zu berichten. Die Antworten werden weiterhin gesammelt und oben gezählt.',
    resultsScoresNoneComplete: 'Noch kein Versuch hat alle bewertbaren Fragen beantwortet.',
    resultsScore: 'Ergebnis',
    resultsScoreAttempts: 'Versuche',
    resultsScoreValue: '{{score}} von {{total}}',
    resultsPartialAttempts_one:
        '{{formatted}} Versuch hat einen Teil der bewertbaren Fragen beantwortet, aber nicht alle, und steht nicht in der Tabelle oben.',
    resultsPartialAttempts_other:
        '{{formatted}} Versuche haben einen Teil der bewertbaren Fragen beantwortet, aber nicht alle, und stehen nicht in der Tabelle oben.',
    resultsDownloadCsv: 'Ergebnisse als CSV herunterladen',
    resultsDownloadError: 'Der Download konnte nicht vorbereitet werden. Versuche es erneut.',
    resultsCsvChoice: 'Möglichkeit {{position}}',
    resultsCsvChosenBy: 'Gewählt von {{position}}',
};
