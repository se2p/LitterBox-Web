-- SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
-- SPDX-License-Identifier: CC0-1.0

INSERT INTO programme
    (id, token, gender, scratchUsername, file, url, description, institution, litterbox, ip, time)
VALUES
    (101, 'synthetic-shared', 'synthetic-unspecified', 'synthetic-author-alpha',
        'repeated-synthetic.sb3', NULL, 'Synthetic description ä', 'synthetic-primary',
        'synthetic-101.json', '192.0.2.10', '2026-01-02 03:04:05'),
    (102, 'synthetic-shared', NULL, 'synthetic-author-beta',
        'repeated-synthetic.sb3', NULL, NULL, 'synthetic-unmapped-category',
        NULL, '192.0.2.11', '2026-01-03 03:04:05'),
    (103, 'Synthetic-Shared', 'synthetic-unspecified', NULL,
        'unique-synthetic.mblock', NULL, 'Unicode Ω fixture', NULL,
        'synthetic-103.json', '192.0.2.12', '2026-01-04 03:04:05');

INSERT INTO feedback (id, program, pattern, reaction, time) VALUES
    (301, 101, 'SyntheticFinderAlpha', 1, '2026-02-01 00:00:01'),
    (302, 102, 'SyntheticFinderUnicodeΩ', 0, '2026-02-01 00:00:02'),
    (303, 103, 'SyntheticFinderBeta', -1, '2026-02-01 00:00:03');

INSERT INTO fragen (id, programName, question, answer, correct, time) VALUES
    (201, 'repeated-synthetic.sb3', 'Synthetic question α', 'Synthetic answer α', 'true',
        '2026-03-01 00:00:01'),
    (202, 'unique-synthetic.mblock', 'Synthetic bounded question', REPEAT('q', 500), NULL,
        '2026-03-01 00:00:02'),
    (203, 'unmatched-synthetic.sb3', 'Synthetic resolved question', 'Synthetic answer Ω', '0',
        '2026-03-01 00:00:03');

INSERT INTO `extId` (id, extId, timestamp) VALUES
    (401, 'SYN0001', '2026-04-01 00:00:01'),
    (402, 'SYN0002', '2026-04-01 00:00:02');

INSERT INTO nachrichten (id, age, mail, gender, subject, message, ip) VALUES
    (501, 'synthetic-age-band', 'synthetic-one@example.invalid', 'synthetic-unspecified',
        'Synthetic subject α', 'Synthetic message α', '192.0.2.20'),
    (502, NULL, NULL, NULL, 'Synthetic bounded subject', REPEAT('m', 2000), NULL);
