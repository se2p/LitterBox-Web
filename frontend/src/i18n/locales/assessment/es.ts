// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { AssessmentPack } from './en';

export const pack: Partial<AssessmentPack> = {
    eyebrow: 'Generador de cuestionarios',
    title: 'Crear un cuestionario con estas preguntas',
    lead: 'Selecciona preguntas generadas, adáptalas a tu clase o añade las tuyas. Los filtros solo cambian lo que ves; la selección se conserva hasta que la cambies.',
    defaultTitle: 'Cuestionario de {{project}}',
    draftSavedOnDevice:
        'El borrador del cuestionario se guarda automáticamente en este dispositivo.',
    draftSaveError:
        'Este dispositivo no puede guardar el borrador. Descarga el JSON editable antes de salir.',
    untitledProject: 'Proyecto',
    name: 'Título del cuestionario',
    instructions: 'Instrucciones para el alumnado',
    addQuestion: 'Añadir una pregunta propia',
    addToQuiz: 'Añadir al cuestionario',
    newQuestionText: 'Escribe aquí tu pregunta.',
    questionAdded: 'Pregunta {{number}} añadida. Se está editando a continuación.',
    quizCoverageSummary:
        '{{cells}} de 12 celdas del modelo cubiertas por las preguntas seleccionadas.',
    quizCoveredCells: 'Celdas cubiertas:',
    bankSelectionSummary: '{{selected}} de {{total}} seleccionadas.',
    selectShown: 'Seleccionar las preguntas visibles',
    deselectShown: 'Deseleccionar las preguntas visibles',
    exportLabel: 'Exportar cuestionario',
    exportStudent: 'Descargar cuestionario imprimible',
    exportTeacher: 'Descargar copia docente',
    exportJson: 'Descargar JSON editable',
    exportError: 'No se pudo preparar la descarga. Inténtalo de nuevo.',
    selectionRequired: 'Selecciona al menos una pregunta antes de poder exportar o publicar.',
    importLabel: 'Importar desde JSON',
    importSuccess_one:
        'Se cargó {{count}} pregunta en tu cuestionario. El banco de preguntas sigue disponible.',
    importSuccess_other:
        'Se cargaron {{count}} preguntas en tu cuestionario. El banco de preguntas sigue disponible.',
    importWrongProject:
        'Este cuestionario no corresponde al proyecto actual. Abre las preguntas de su proyecto de origen e impórtalo allí.',
    importError:
        'No se pudo leer este archivo como un cuestionario de LitterBox. Elige un archivo JSON exportado desde aquí.',
    importOverLimit:
        'Este cuestionario tiene más preguntas o respuestas, o más largas, de lo que permite este sitio. No se cargó nada.',
    tooManyQuestions_one:
        'Solo puedes publicar {{count}} pregunta. Desmarca las demás para continuar.',
    tooManyQuestions_other:
        'Puedes publicar hasta {{count}} preguntas. Desmarca algunas para continuar.',
    importTooLarge:
        'Este archivo es demasiado grande para un cuestionario de LitterBox. Elige un archivo JSON exportado desde aquí.',
    questionRequired: 'Cada pregunta seleccionada necesita texto antes de poder exportarse.',
    multipleChoiceStructureInvalid:
        'Las preguntas de opción múltiple necesitan al menos una opción única y no vacía y un número válido de respuestas.',
    tooManyEntries: 'Deja como máximo {{limit}} líneas y luego publica.',
    entryTooLong: 'Cada línea debe tener {{limit}} caracteres o menos, y luego publica.',
    textTooLong: 'Esto debe tener {{limit}} caracteres o menos, y luego publica.',
    limitsExceeded:
        'Una de tus preguntas supera un límite. Corrige las líneas marcadas arriba para publicar.',
    includeQuestion: 'Incluir la pregunta {{number}} en el cuestionario',
    addQuestionToQuiz: 'Añadir «{{summary}}» al cuestionario',
    questionDetailsToggleNumbered: 'Detalles de la pregunta {{number}}:',
    questionDetailsToggle: 'Detalles de la pregunta:',
    builderNavLabel: 'Secciones del generador de cuestionarios',
    quizSectionTitle: 'Tu cuestionario',
    quizSectionDescription: 'Las preguntas seleccionadas, en el orden en que las verá tu clase.',
    quizEmpty:
        'Tu cuestionario está vacío. Añade preguntas del banco de abajo, o escribe las tuyas.',
    moveQuestionEarlier: 'Mover la pregunta {{number}} antes',
    moveQuestionLater: 'Mover la pregunta {{number}} después',
    questionMovedEarlier: 'Pregunta movida antes. Ahora es la pregunta {{number}}.',
    questionMovedLater: 'Pregunta movida después. Ahora es la pregunta {{number}}.',
    bankSectionTitle: 'Banco de preguntas',
    bankSectionDescription:
        'Todas las preguntas generadas para este proyecto que aún no están en el cuestionario. Fíltralas por lo que evalúan, o añádelas directamente.',
    bankEmpty: 'Todas las preguntas generadas ya están en tu cuestionario.',
    publishSectionTitle: 'Nombrar y publicar',
    publishSectionDescription:
        'Dale un título e instrucciones al cuestionario y, después, expórtalo o publícalo para tu clase.',
    generatedQuestion: 'Generada a partir del proyecto',
    editedGeneratedQuestion: 'Editada — ya no se corrige automáticamente',
    teacherQuestion: 'Añadida por el docente',
    customQuestionFallback: 'Añadida por el profesorado — sin corrección automática',
    editQuestionNumbered: 'Editar la pregunta {{number}}',
    editQuestion: 'Editar esta pregunta',
    closeEditor: 'Cerrar editor',
    restoreQuestion: 'Restaurar pregunta generada',
    removeQuestion: 'Eliminar pregunta',
    questionText: 'Texto de la pregunta',
    questionType: 'Tipo de respuesta',
    options: 'Opciones de respuesta',
    optionsHint: 'Una opción por línea',
    markCorrectAnswers: 'Opciones correctas',
    correctAnswersHint:
        'Marca las opciones correctas y esta pregunta se corregirá automáticamente para la clase. Si dejas todas sin marcar, las respuestas se seguirán recogiendo, pero nunca se corregirán.',
    correctAnswerYesNo: 'Respuesta correcta',
    correctAnswerYesNoHint:
        'Elige la respuesta correcta y esta pregunta se corregirá automáticamente para la clase. Quien responda en otro idioma también se corrige bien.',
    correctAnswerUnmarked: 'No corregir esta pregunta',
    correctAnswerNumber: 'Número correcto',
    correctAnswerNumberHint:
        'El número que debe dar el alumnado. Si lo dejas vacío, las respuestas se seguirán recogiendo, pero nunca se corregirán.',
    correctAnswerFreeText: 'Respuestas aceptadas',
    correctAnswerFreeTextPlaceholder: 'Una respuesta aceptada por línea',
    correctAnswerFreeTextHint:
        'Quien acierte cualquiera de ellas responde bien. No se distinguen mayúsculas, y una respuesta corta cuenta siempre que aparezca como palabra completa en lo que ha escrito, así que una respuesta dentro de una frase también cuenta. Si lo dejas vacío, las respuestas se seguirán recogiendo, pero nunca se corregirán.',
    expectedAnswers: 'Número de opciones que debe seleccionar el alumnado',
    answerGuide: 'Solución o pauta de corrección',
    answerGuideHint:
        'Opcional. Las soluciones generadas no se muestran aquí; añade la pauta que quieras en la copia docente.',
    answerGuideMissing: 'No se añadió solución ni pauta de corrección.',
    correctAnswers: 'Respuesta correcta',
    answerKeyFetchError:
        'No se pudieron cargar las respuestas correctas para esta descarga. La copia docente se descargó igualmente, solo con tu propia pauta de corrección.',
    richHintPreviewHint:
        'El formato se escribe igual que en el resto del sitio: [b]negrita[/b], [i]cursiva[/i], [bc]código[/bc]. La vista previa de abajo es en lo que se convierte.',
    previewLabel: 'Vista previa',
    questionHint: 'Pista',
    codeContext: 'Contexto de código Scratchblocks',
    programDimension: 'Dimensión del programa',
    scopeOfFocus: 'Alcance',
    noClassification: 'Sin clasificar',
    studentName: 'Nombre',
    studentClass: 'Clase',
    exportQuestion: 'Pregunta',
    yes: 'Sí',
    no: 'No',
    generatedBy: 'Preparado con LitterBox',
    publishAction: 'Publicar para que el alumnado la abra',
    publishingUnavailable:
        'La publicación online está desactivada en este sitio. Puedes descargar un cuestionario para imprimir.',
    publishing: 'Publicando…',
    publishError: 'No se pudo publicar el cuestionario. Inténtalo de nuevo.',
    publishEditedConfirmTitle: 'Algunas preguntas no se corregirán automáticamente',
    publishEditedConfirmIntro_one:
        '{{count}} pregunta no puede corregirla este servicio. Se publica y se responde con normalidad, pero ninguna respuesta se juzga correcta o incorrecta:',
    publishEditedConfirmIntro_other:
        '{{count}} preguntas no puede corregirlas este servicio. Se publican y se responden con normalidad, pero ninguna respuesta se juzga correcta o incorrecta:',
    publishEditedConfirmConsequence:
        'Estas preguntas seguirán recogiendo las respuestas del alumnado, y seguirás viendo cuántas personas respondieron cada una; simplemente no se cuentan como correctas ni incorrectas. Añade una pauta de corrección o restaura la versión generada antes de publicar si no es lo que quieres.',
    publishEditedConfirmBack: 'Volver',
    publishedHeading: 'Cuestionario publicado',
    publishedLearnerLabel: 'Enlace para el alumnado',
    publishedLearnerHint:
        'Compártelo con tu clase. Quien tenga el enlace puede abrir el cuestionario y responderlo.',
    publishedResultsLabel: 'Enlace para ti — consérvalo',
    publishedResultsHint:
        'Este enlace solo se muestra esta vez. Abre los resultados; si lo pierdes, no hay forma de recuperarlo.',
    rememberedQuizzesHeading: 'Cuestionarios publicados desde este dispositivo',
    rememberedQuizLearnerLink: 'Enlace para el alumnado',
    rememberedQuizResultsLink: 'Enlace de resultados',
    rememberedQuizPublished: 'Publicado el {{date}}',
    resultsChoicesHeading: 'Qué eligió la clase',
    resultsChoicesHint:
        'Cuántas personas eligieron cada opción. En una pregunta que pide más de una opción se cuenta cada elección, así que la suma puede superar el número de personas que la respondieron.',
    resultsChoice: 'Opción',
    resultsChosenBy: 'Elegida por',
    resultsOtherAnswers: 'Respuestas que no nombran ninguna de estas',
    resultsScoresHeading: 'Cómo le fue a la clase',
    resultsScoresHint_one:
        'Sobre la {{formatted}} pregunta que este cuestionario puede corregir, contando solo los intentos que la respondieron.',
    resultsScoresHint_other:
        'Sobre las {{formatted}} preguntas que este cuestionario puede corregir, contando solo los intentos que respondieron todas — tres aciertos de tres no es el mismo resultado que tres de diez.',
    resultsScoresUnmarkable:
        'Este servicio no puede corregir ninguna pregunta de este cuestionario, así que no hay resultado que mostrar. Las respuestas se siguen recogiendo y contando arriba.',
    resultsScoresNoneComplete:
        'Todavía ningún intento ha respondido todas las preguntas corregibles.',
    resultsScore: 'Resultado',
    resultsScoreAttempts: 'Intentos',
    resultsScoreValue: '{{score}} de {{total}}',
    resultsPartialAttempts_one:
        '{{formatted}} intento respondió algunas de las preguntas corregibles, pero no todas, y no está en la tabla de arriba.',
    resultsPartialAttempts_other:
        '{{formatted}} intentos respondieron algunas de las preguntas corregibles, pero no todas, y no están en la tabla de arriba.',
    resultsDownloadCsv: 'Descargar los resultados en CSV',
    resultsDownloadError: 'No se pudo preparar la descarga. Inténtalo de nuevo.',
    resultsCsvChoice: 'Opción {{position}}',
    resultsCsvChosenBy: 'Elegida por {{position}}',
};
