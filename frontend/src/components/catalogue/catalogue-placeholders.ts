// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

/**
 * Catalogue prose is the same text a finding uses, and a finding fills these tokens with the reader's own names — the
 * variable that was not initialised, the message that was sent. A catalogue entry has no project behind it, so
 * printing the tokens raw would read as a broken template: "Die Figur %SPRITE besitzt keinerlei Skripte." A generic
 * stand-in is what the sentence needs to read as an explanation of the pattern instead.
 *
 * Several tokens sit inside `[sbi]…[/sbi]` and are rendered as blocks, so the stand-in has to be block source in the
 * same language as the surrounding text.
 */
const placeholders: Record<string, Record<string, string>> = {
    en: {
        '%MESSAGE': 'message1',
        '%BLOCKNAME': 'my block',
        '%METHOD': 'my block',
        '%VARIABLE': 'my variable',
        '%SPRITE': 'a sprite',
        '%SAYTHINK': 'say [Hello!]',
        '%EVENTHANDLER': 'when green flag clicked',
        '%THENELSE': 'if < > then',
        '%KEY': 'space',
        '%COORDINATE': 'the x position',
        '%XY': 'x',
    },
    de: {
        '%MESSAGE': 'Nachricht1',
        '%BLOCKNAME': 'mein Baustein',
        '%METHOD': 'mein Baustein',
        '%VARIABLE': 'meine Variable',
        '%SPRITE': 'eine Figur',
        '%SAYTHINK': 'sage [Hallo!]',
        '%EVENTHANDLER': 'Wenn die grüne Flagge angeklickt',
        '%THENELSE': 'falls < > , dann',
        '%KEY': 'Leertaste',
        '%COORDINATE': 'die x-Position',
        '%XY': 'x',
    },
    es: {
        '%MESSAGE': 'mensaje1',
        '%BLOCKNAME': 'mi bloque',
        '%METHOD': 'mi bloque',
        '%VARIABLE': 'mi variable',
        '%SPRITE': 'un objeto',
        '%SAYTHINK': 'decir [¡Hola!]',
        '%EVENTHANDLER': 'al hacer clic en la bandera verde',
        '%THENELSE': 'si < > entonces',
        '%KEY': 'espacio',
        '%COORDINATE': 'la posición x',
        '%XY': 'x',
    },
    nl: {
        '%MESSAGE': 'bericht1',
        '%BLOCKNAME': 'mijn blok',
        '%METHOD': 'mijn blok',
        '%VARIABLE': 'mijn variabele',
        '%SPRITE': 'een sprite',
        '%SAYTHINK': 'zeg [Hallo!]',
        '%EVENTHANDLER': 'wanneer op groene vlag wordt geklikt',
        '%THENELSE': 'als < > dan',
        '%KEY': 'spatie',
        '%COORDINATE': 'de x-positie',
        '%XY': 'x',
    },
};

const TOKEN = /%[A-Z_]+/g;

/** Fills the finding placeholders with generic examples so a catalogue entry reads as a sentence. */
export const withCataloguePlaceholders = (
    value: string | null | undefined,
    locale: string,
): string => {
    if (typeof value !== 'string' || !value.includes('%')) return value ?? '';
    const language = locale.toLowerCase().slice(0, 2);
    const substitutions = placeholders[language] ?? placeholders.en!;
    return value.replace(TOKEN, (token) => substitutions[token] ?? token);
};
