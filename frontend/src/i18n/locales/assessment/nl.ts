// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AssessmentPack } from './en';

export const pack: Partial<AssessmentPack> = {
    eyebrow: 'Quizgenerator',
    title: 'Maak van deze vragen een quiz',
    lead: 'Selecteer gegenereerde vragen, pas ze aan voor je klas of voeg eigen vragen toe. Filters veranderen alleen wat je ziet; de selectie blijft staan tot je die wijzigt.',
    defaultTitle: 'Quiz over {{project}}',
    untitledProject: 'Project',
    name: 'Titel van de quiz',
    instructions: 'Instructies voor leerlingen',
    addQuestion: 'Eigen vraag toevoegen',
    addToQuiz: 'Aan quiz toevoegen',
    newQuestionText: 'Schrijf hier je vraag.',
    questionAdded: 'Vraag {{number}} toegevoegd. Wordt hieronder bewerkt.',
    quizCoverageSummary: '{{cells}} van 12 blokmodelcellen gedekt door de geselecteerde vragen.',
    quizCoveredCells: 'Gedekte cellen:',
    bankSelectionSummary: '{{selected}} van {{total}} geselecteerd.',
    selectShown: 'Getoonde vragen selecteren',
    deselectShown: 'Getoonde vragen deselecteren',
    exportLabel: 'Quiz exporteren',
    exportStudent: 'Printbare quiz downloaden',
    exportTeacher: 'Docentenversie downloaden',
    exportJson: 'Bewerkbare JSON downloaden',
    exportError: 'De download kon niet worden voorbereid. Probeer het opnieuw.',
    selectionRequired: 'Selecteer minstens één vraag voordat je kunt exporteren of publiceren.',
    importLabel: 'Importeren vanuit JSON',
    importSuccess_one: '{{count}} vraag geladen uit het bestand. Dit verving het huidige concept.',
    importSuccess_other:
        '{{count}} vragen geladen uit het bestand. Dit verving het huidige concept.',
    importError:
        'Dit bestand kon niet als LitterBox-quiz worden gelezen. Kies een hier geëxporteerd JSON-bestand.',
    importOverLimit:
        'Deze quiz heeft meer of langere vragen of antwoorden dan deze site toestaat. Er is niets geladen.',
    tooManyQuestions_one:
        'Je kunt maar {{count}} vraag publiceren. Deselecteer de andere om door te gaan.',
    tooManyQuestions_other:
        'Je kunt maximaal {{count}} vragen publiceren. Deselecteer er een paar om door te gaan.',
    importTooLarge:
        'Dit bestand is te groot voor een LitterBox-quiz. Kies een hier geëxporteerd JSON-bestand.',
    questionRequired: 'Elke geselecteerde vraag heeft vraagtekst nodig voordat je kunt exporteren.',
    multipleChoiceStructureInvalid:
        'Meerkeuzevragen hebben minstens één unieke, niet-lege optie en een geldig aantal antwoorden nodig.',
    tooManyEntries: 'Houd het op maximaal {{limit}} regels en publiceer dan.',
    entryTooLong: 'Elke regel mag hoogstens {{limit}} tekens hebben; publiceer daarna.',
    textTooLong: 'Dit mag hoogstens {{limit}} tekens hebben; publiceer daarna.',
    limitsExceeded:
        'Een van je vragen gaat over een limiet heen. Herstel de gemarkeerde regels hierboven om te publiceren.',
    includeQuestion: 'Vraag {{number}} in de quiz opnemen',
    addQuestionToQuiz: '"{{summary}}" toevoegen aan de quiz',
    questionDetailsToggleNumbered: 'Details van vraag {{number}}:',
    questionDetailsToggle: 'Details van de vraag:',
    builderNavLabel: 'Onderdelen van de quizgenerator',
    quizSectionTitle: 'Jouw quiz',
    quizSectionDescription: 'De geselecteerde vragen, in de volgorde waarin je klas ze ziet.',
    quizEmpty:
        'Je quiz is nog leeg. Voeg vragen toe uit de pool hieronder, of schrijf eigen vragen.',
    moveQuestionEarlier: 'Vraag {{number}} naar voren verplaatsen',
    moveQuestionLater: 'Vraag {{number}} naar achteren verplaatsen',
    questionMovedEarlier: 'Vraag naar voren verplaatst. Nu vraag {{number}}.',
    questionMovedLater: 'Vraag naar achteren verplaatst. Nu vraag {{number}}.',
    bankSectionTitle: 'Vragenpool',
    bankSectionDescription:
        'Alle voor dit project gegenereerde vragen die nog niet in de quiz staan. Filter op wat ze toetsen, of voeg ze direct toe.',
    bankEmpty: 'Alle gegenereerde vragen staan al in je quiz.',
    publishSectionTitle: 'Benoemen en publiceren',
    publishSectionDescription:
        'Geef de quiz een titel en instructies, exporteer hem daarna of publiceer hem voor je klas.',
    generatedQuestion: 'Uit het project gegenereerd',
    editedGeneratedQuestion: 'Bewerkt — wordt niet meer automatisch nagekeken',
    teacherQuestion: 'Door de docent toegevoegd',
    customQuestionFallback: 'Door de docent toegevoegd — wordt niet automatisch nagekeken',
    editQuestionNumbered: 'Vraag {{number}} bewerken',
    editQuestion: 'Deze vraag bewerken',
    closeEditor: 'Bewerker sluiten',
    restoreQuestion: 'Gegenereerde vraag herstellen',
    removeQuestion: 'Vraag verwijderen',
    questionText: 'Vraagtekst',
    questionType: 'Antwoordtype',
    options: 'Antwoordkeuzes',
    optionsHint: 'Eén keuze per regel',
    markCorrectAnswers: 'Juiste keuzes',
    correctAnswersHint:
        'Vink de juiste keuzes aan en deze vraag wordt automatisch nagekeken voor de klas. Laat je alles onaangevinkt, dan worden de antwoorden nog steeds verzameld, maar nooit nagekeken.',
    correctAnswerYesNo: 'Juiste antwoord',
    correctAnswerYesNoHint:
        'Kies het juiste antwoord en deze vraag wordt automatisch nagekeken voor de klas. Leerlingen die in een andere taal antwoorden worden ook goed nagekeken.',
    correctAnswerUnmarked: 'Deze vraag niet nakijken',
    correctAnswerNumber: 'Juiste getal',
    correctAnswerNumberHint:
        'Het getal dat een leerling moet geven. Laat je het leeg, dan worden de antwoorden nog steeds verzameld, maar nooit nagekeken.',
    correctAnswerFreeText: 'Geaccepteerde antwoorden',
    correctAnswerFreeTextPlaceholder: 'Eén geaccepteerd antwoord per regel',
    correctAnswerFreeTextHint:
        'Wie er één van raakt, heeft het goed. Hoofdletters doen niet mee, en een kort antwoord telt zodra het als heel woord in de tekst staat, dus een antwoord midden in een zin telt ook. Laat je het leeg, dan worden de antwoorden nog steeds verzameld, maar nooit nagekeken.',
    expectedAnswers: 'Aantal te selecteren keuzes',
    answerGuide: 'Oplossing of nakijkhulp',
    answerGuideHint:
        'Optioneel. Gegenereerde oplossingen worden hier niet getoond; voeg de hulp voor de docentenversie toe.',
    answerGuideMissing: 'Geen oplossing of nakijkhulp toegevoegd.',
    correctAnswers: 'Juiste antwoord',
    answerKeyFetchError:
        'De juiste antwoorden konden niet worden geladen voor deze download. De docentenversie is toch gedownload, alleen met je eigen nakijkhulp.',
    richHintPreviewHint:
        'Opmaak schrijf je hier zoals overal op deze site: [b]vet[/b], [i]cursief[/i], [bc]code[/bc]. Het voorbeeld hieronder is wat het wordt.',
    previewLabel: 'Voorbeeld',
    questionHint: 'Hint',
    codeContext: 'Scratchblocks-codecontext',
    programDimension: 'Programmadimensie',
    scopeOfFocus: 'Focusbereik',
    noClassification: 'Niet ingedeeld',
    studentName: 'Naam',
    studentClass: 'Klas',
    exportQuestion: 'Vraag',
    yes: 'Ja',
    no: 'Nee',
    generatedBy: 'Voorbereid met LitterBox',
    publishAction: 'Publiceren zodat leerlingen hem kunnen openen',
    publishing: 'Bezig met publiceren…',
    publishError: 'De quiz kon niet worden gepubliceerd. Probeer het opnieuw.',
    publishEditedConfirmTitle: 'Sommige vragen worden niet automatisch nagekeken',
    publishEditedConfirmIntro_one:
        '{{count}} vraag kan deze dienst niet nakijken. Hij wordt gewoon gepubliceerd en beantwoord, maar geen antwoord erop wordt goed of fout gerekend:',
    publishEditedConfirmIntro_other:
        '{{count}} vragen kan deze dienst niet nakijken. Ze worden gewoon gepubliceerd en beantwoord, maar geen antwoord erop wordt goed of fout gerekend:',
    publishEditedConfirmConsequence:
        'Deze vragen verzamelen nog steeds de antwoorden van leerlingen, en je blijft zien hoeveel leerlingen elke vraag beantwoord hebben; ze worden alleen niet als goed of fout geteld. Voeg er nakijkhulp aan toe of herstel de gegenereerde versie voordat je publiceert als dat niet de bedoeling is.',
    publishEditedConfirmBack: 'Terug',
    publishedHeading: 'Quiz gepubliceerd',
    publishedLearnerLabel: 'Link voor leerlingen',
    publishedLearnerHint:
        'Deel deze met je klas. Iedereen met de link kan de quiz openen en beantwoorden.',
    publishedResultsLabel: 'Link voor jou — bewaar deze',
    publishedResultsHint:
        'Deze link wordt maar één keer getoond. Hij opent de resultaten; ben je hem kwijt, dan is er geen manier om hem terug te krijgen.',
    rememberedQuizzesHeading: 'Op dit apparaat gepubliceerde quizzen',
    rememberedQuizLearnerLink: 'Link voor leerlingen',
    rememberedQuizResultsLink: 'Resultatenlink',
    rememberedQuizPublished: 'Gepubliceerd op {{date}}',
    resultsChoicesHeading: 'Wat de klas koos',
    resultsChoicesHint:
        'Hoeveel leerlingen elke keuze aanklikten. Bij een vraag die om meer dan één keuze vraagt telt elke keuze mee, dus het totaal kan hoger uitkomen dan het aantal leerlingen dat de vraag beantwoordde.',
    resultsChoice: 'Keuze',
    resultsChosenBy: 'Gekozen door',
    resultsOtherAnswers: 'Antwoorden die geen van deze noemen',
    resultsScoresHeading: 'Hoe de klas het deed',
    resultsScoresHint_one:
        'Van de {{formatted}} vraag die deze quiz kan nakijken, en alleen voor de pogingen die hem beantwoordden.',
    resultsScoresHint_other:
        'Van de {{formatted}} vragen die deze quiz kan nakijken, en alleen voor de pogingen die ze allemaal beantwoordden — drie van de drie goed is niet hetzelfde resultaat als drie van de tien.',
    resultsScoresUnmarkable:
        'Deze dienst kan geen enkele vraag in deze quiz nakijken, dus er is geen resultaat te melden. De antwoorden worden nog steeds verzameld en hierboven geteld.',
    resultsScoresNoneComplete: 'Nog geen poging heeft alle na te kijken vragen beantwoord.',
    resultsScore: 'Resultaat',
    resultsScoreAttempts: 'Pogingen',
    resultsScoreValue: '{{score}} van {{total}}',
    resultsPartialAttempts_one:
        '{{formatted}} poging beantwoordde een deel van de na te kijken vragen maar niet alle, en staat niet in de tabel hierboven.',
    resultsPartialAttempts_other:
        '{{formatted}} pogingen beantwoordden een deel van de na te kijken vragen maar niet alle, en staan niet in de tabel hierboven.',
    resultsDownloadCsv: 'Resultaten downloaden als CSV',
    resultsDownloadError: 'De download kon niet worden voorbereid. Probeer het opnieuw.',
    resultsCsvChoice: 'Keuze {{position}}',
    resultsCsvChosenBy: 'Gekozen door {{position}}',
};
