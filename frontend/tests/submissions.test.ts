// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
    QUESTION_SUBMISSIONS_URL,
    SUBMISSIONS_URL,
    fetchCatalogue,
    fetchSubmission,
    sendFeedback,
    sendQuizAnswer,
    submitStudio,
    submitProjectUrl,
    submitQuestionFile,
    submitQuestionProjectUrl,
    submitFile,
    type QuizAnswerPayload,
} from '../src/api/submissions';
import {
    isNumericScratchProjectUrl,
    MAX_ARCHIVE_BYTES,
    MAX_MANIFEST_BYTES,
    MAX_ARCHIVE_ENTRIES,
    preflightArchive,
    preflightTeacherArchive,
    parseScratchStudioId,
    type ArchivePreflightReason,
} from '../src/lib/archive-preflight';
import { preflightMessageKey } from '../src/lib/archive-preflight-messages';
import { translationKeys } from '../src/i18n/locales/en';

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const asBlobPart = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe('single-project submission helpers', () => {
    it('accepts numeric project URLs and rejects non-project URLs', () => {
        expect(isNumericScratchProjectUrl('https://scratch.mit.edu/projects/12345/')).toBe(true);
        expect(isNumericScratchProjectUrl('https://scratch.mit.edu/projects/abc/')).toBe(false);
        expect(isNumericScratchProjectUrl('https://example.com/projects/12345/')).toBe(false);
        expect(isNumericScratchProjectUrl('https://scratch.mit.edu/users/12345/')).toBe(false);
        expect(isNumericScratchProjectUrl('javascript:alert(1)')).toBe(false);
    });

    it('refuses a catalogue that is not a list, and holds a bad entry to the shape', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        // The page reads the whole answer with .filter, and each entry's locale with .toLowerCase.
        fetchMock.mockResolvedValueOnce(jsonResponse({ entries: [] }));
        await expect(fetchCatalogue('en')).rejects.toThrow('Response was not a catalogue');

        fetchMock.mockResolvedValueOnce(
            jsonResponse([
                { id: 1, title: 2, locale: 3, description: 4, examples: 'not a list' },
                'not an entry',
            ]),
        );
        // The entry that is merely wrong survives as something that can be drawn; the one that is not an
        // entry at all does not become one.
        await expect(fetchCatalogue('en')).resolves.toEqual([
            expect.objectContaining({ id: '', title: '', locale: '', examples: [] }),
        ]);
        fetchMock.mockRestore();
    });

    it('refuses a submission answer that carries no usable token', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        for (const body of [{ submissionId: 1 }, { token: 7 }, { token: '   ' }]) {
            fetchMock.mockResolvedValueOnce(jsonResponse(body, 202));
            await expect(
                submitProjectUrl('https://scratch.mit.edu/projects/12345/'),
            ).rejects.toThrow('Response carried no submission token');
        }
        fetchMock.mockRestore();
    });

    it('refuses a status response that is not this service answering', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        // A captive portal, a proxy error page, or anything else that answers 200 in something other than JSON.
        fetchMock.mockResolvedValueOnce(
            new Response('<html>Sign in to the network</html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            }),
        );
        await expect(fetchSubmission('t-1')).rejects.toThrow('Response was not JSON');

        fetchMock.mockResolvedValueOnce(
            new Response('{ not json', {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(fetchSubmission('t-1')).rejects.toThrow('Response was not valid JSON');

        // Every page reads the state off the status without checking for it first, because a result that cannot
        // say where it has got to is not a result. Caught here rather than as a crash halfway down a render.
        fetchMock.mockResolvedValueOnce(jsonResponse({ token: 't-1', analyses: [] }));
        await expect(fetchSubmission('t-1')).rejects.toThrow('Response was not a submission');

        fetchMock.mockRestore();
    });

    it('accepts numeric studio IDs and canonical studio URLs', () => {
        expect(parseScratchStudioId('12345')).toBe('12345');
        expect(parseScratchStudioId('https://scratch.mit.edu/studios/12345/')).toBe('12345');
        expect(parseScratchStudioId('https://scratch.mit.edu/projects/12345/')).toBeUndefined();
        expect(parseScratchStudioId('https://example.com/studios/12345/')).toBeUndefined();
    });

    it('performs deployment-relative submission and status requests', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(
                jsonResponse({ submissionId: 's-1', token: 't-1', status: 'queued' }, 202),
            );
        await expect(
            submitProjectUrl('https://scratch.mit.edu/projects/12345/'),
        ).resolves.toMatchObject({ token: 't-1' });
        expect(fetchMock).toHaveBeenCalledWith(
            `${SUBMISSIONS_URL}`,
            expect.objectContaining({ method: 'POST' }),
        );
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'completed', issues: [] }));
        await expect(fetchSubmission('t-1')).resolves.toMatchObject({ status: 'completed' });
        expect(fetchMock).toHaveBeenLastCalledWith(`${SUBMISSIONS_URL}/t-1`, expect.anything());
        fetchMock.mockRestore();
    });

    it('keeps an idempotency key across retries and strips untrusted quiz fields', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                jsonResponse({ submissionId: 9, token: 'retry-token', status: 'queued' }, 202),
            )
            .mockResolvedValue(new Response(null, { status: 204 }));
        const archive = new File(['synthetic archive'], 'project.sb3');
        await submitFile(archive, { idempotencyKey: 'stable-synthetic-key', locale: 'en' });
        await sendQuizAnswer('retry-token', 'a-1', {
            questionId: 'q-1',
            answer: 'A',
            ...({ correct: true } as Record<string, boolean>),
        } as QuizAnswerPayload & { correct: boolean });
        expect(fetchMock.mock.calls[0]?.[1]).toEqual(
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Idempotency-Key': 'stable-synthetic-key',
                    'Accept-Language': 'en',
                }),
            }),
        );
        expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
            JSON.stringify({ questionId: 'q-1', answer: 'A' }),
        );
        fetchMock.mockRestore();
    });

    it('uses the dedicated Questions endpoint for files and URLs', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() =>
                Promise.resolve(
                    jsonResponse(
                        { submissionId: 12, token: 'questions-token', status: 'queued' },
                        202,
                    ),
                ),
            );
        const options = { idempotencyKey: 'stable-questions-key', locale: 'de' };
        await submitQuestionFile(new File(['synthetic archive'], 'project.sb3'), options);
        await submitQuestionProjectUrl('https://scratch.mit.edu/projects/12345/', options);

        expect(fetchMock.mock.calls[0]?.[0]).toBe(QUESTION_SUBMISSIONS_URL);
        expect(fetchMock.mock.calls[1]?.[0]).toBe(QUESTION_SUBMISSIONS_URL);
        expect(fetchMock.mock.calls[0]?.[1]).toEqual(
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Accept-Language': 'de',
                    'Idempotency-Key': 'stable-questions-key',
                }),
                body: expect.any(FormData),
            }),
        );
        expect((fetchMock.mock.calls[0]?.[1]?.body as FormData).get('file')).toBeInstanceOf(File);
        expect(fetchMock.mock.calls[1]?.[1]).toEqual(
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Accept-Language': 'de',
                    'Idempotency-Key': 'stable-questions-key',
                }),
                body: JSON.stringify({ projectUrl: 'https://scratch.mit.edu/projects/12345/' }),
            }),
        );
        fetchMock.mockRestore();
    });

    it('uses the compatible batch and studio submission payloads', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() =>
                Promise.resolve(
                    jsonResponse({ submissionId: 's-2', token: 't-2', status: 'queued' }, 202),
                ),
            );
        const archive = new File(['synthetic archive'], 'teacher-projects.zip');
        await submitFile(archive);
        await submitStudio('12345');
        expect(fetchMock.mock.calls[0]?.[1]).toEqual(
            expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
        );
        expect(fetchMock.mock.calls[1]?.[1]).toEqual(
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ studioId: '12345' }),
            }),
        );
        fetchMock.mockRestore();
    });

    it('sends feedback and quiz answers with the frozen payloads', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response(null, { status: 204 }));
        await sendFeedback('submission-token', 'a-1', {
            finderId: 'long-script',
            reaction: 'helpful',
        });
        await sendQuizAnswer('submission-token', 'a-1', {
            questionId: 'q-1',
            answer: 'yes',
        });
        expect(fetchMock.mock.calls[0]?.[1]).toEqual(
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer submission-token' }),
            }),
        );
        expect(fetchMock.mock.calls[1]?.[1]).toEqual(
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ questionId: 'q-1', answer: 'yes' }),
                headers: expect.objectContaining({ Authorization: 'Bearer submission-token' }),
            }),
        );
        fetchMock.mockRestore();
    });

    it('performs bounded archive preflight without reading beyond the file', async () => {
        const zip = new JSZip();
        zip.file('project.json', '{}');
        zip.file('sprites/sprite.json', '{}');
        const valid = new File(
            [asBlobPart(await zip.generateAsync({ type: 'uint8array' }))],
            'project.sb3',
        );
        await expect(preflightArchive(valid)).resolves.toMatchObject({ valid: true, entries: 3 });
        const missingProject = new JSZip();
        missingProject.file('sprites/sprite.json', '{}');
        const missing = new File(
            [asBlobPart(await missingProject.generateAsync({ type: 'uint8array' }))],
            'project.sb3',
        );
        await expect(preflightArchive(missing)).resolves.toMatchObject({
            valid: false,
            reason: 'missing-project-json',
        });
        const traversal = new JSZip();
        traversal.file('project.json', '{}');
        traversal.file('nested.zip', 'nope');
        const unsafe = new File(
            [asBlobPart(await traversal.generateAsync({ type: 'uint8array' }))],
            'project.sb3',
        );
        await expect(preflightArchive(unsafe)).resolves.toMatchObject({
            valid: false,
            reason: 'unsafe-entry',
        });
        const excessive = new JSZip();
        excessive.file('project.json', '{}');
        for (let index = 0; index < MAX_ARCHIVE_ENTRIES; index += 1) {
            excessive.file(`asset-${index}.txt`, 'x');
        }
        const tooMany = new File(
            [asBlobPart(await excessive.generateAsync({ type: 'uint8array' }))],
            'project.sb3',
        );
        await expect(preflightArchive(tooMany)).resolves.toMatchObject({
            valid: false,
            reason: 'too-many-entries',
        });
        const invalid = new File(['plain text'], 'project.txt');
        await expect(preflightArchive(invalid)).resolves.toMatchObject({
            valid: false,
            reason: 'unsupported-type',
        });
    });

    it('preflights teacher ZIP children and reports each invalid child', async () => {
        const validProject = new JSZip();
        validProject.file('project.json', '{}');
        const missingProject = new JSZip();
        missingProject.file('asset.txt', 'synthetic');
        const teacherArchive = new JSZip();
        teacherArchive.file(
            'valid.sb3',
            asBlobPart(await validProject.generateAsync({ type: 'uint8array' })),
        );
        teacherArchive.file(
            'missing.mblock',
            asBlobPart(await missingProject.generateAsync({ type: 'uint8array' })),
        );
        const file = new File(
            [asBlobPart(await teacherArchive.generateAsync({ type: 'uint8array' }))],
            'teacher.zip',
        );
        await expect(preflightTeacherArchive(file)).resolves.toMatchObject({
            valid: false,
            projects: 2,
            childErrors: [{ name: 'missing.mblock', reason: 'missing-project-json' }],
        });
    });

    /*
     * Zipping the folder the projects are already in is how an archive gets made, on every desktop there is, and
     * the wrapper says nothing about the projects. What the desktop added along the way is not a project either.
     */
    it('unwraps a class set that was zipped as one folder', async () => {
        const project = new JSZip();
        project.file('project.json', '{}');
        const bytes = asBlobPart(await project.generateAsync({ type: 'uint8array' }));
        const teacherArchive = new JSZip();
        teacherArchive.file('class 7b/first.sb3', bytes);
        teacherArchive.file('class 7b/second.mblock', bytes);
        teacherArchive.file('class 7b/.DS_Store', 'synthetic');
        teacherArchive.file('__MACOSX/class 7b/._first.sb3', 'synthetic');
        const file = new File(
            [asBlobPart(await teacherArchive.generateAsync({ type: 'uint8array' }))],
            'teacher.zip',
        );

        await expect(preflightTeacherArchive(file)).resolves.toMatchObject({
            valid: true,
            projects: 2,
        });
    });

    /* A folder each is a grouping the teacher made, and flattening it would merge groups they kept apart. */
    it('refuses a class set spread over more than one folder', async () => {
        const project = new JSZip();
        project.file('project.json', '{}');
        const bytes = asBlobPart(await project.generateAsync({ type: 'uint8array' }));
        const teacherArchive = new JSZip();
        teacherArchive.file('monday/first.sb3', bytes);
        teacherArchive.file('tuesday/second.sb3', bytes);
        const file = new File(
            [asBlobPart(await teacherArchive.generateAsync({ type: 'uint8array' }))],
            'teacher.zip',
        );

        await expect(preflightTeacherArchive(file)).resolves.toMatchObject({
            valid: false,
            reason: 'several-folders',
        });
    });

    it('gives every rejection reason a message of its own, including a class set in several folders', () => {
        // The reason a whole class set is refused must not read as "this is not a Scratch archive": the archive is
        // fine, its shape is not.
        expect(preflightMessageKey('several-folders')).toBe('preflightseveral_folders');
        const reasons: readonly ArchivePreflightReason[] = [
            'too-large',
            'unsupported-type',
            'invalid-archive',
            'missing-project-json',
            'unsafe-entry',
            'duplicate-entry',
            'too-many-entries',
            'too-large-uncompressed',
            'too-large-manifest',
            'too-deep',
            'several-folders',
        ];
        for (const reason of reasons) {
            const key = preflightMessageKey(reason);
            expect(translationKeys).toHaveProperty(key);
        }
    });

    it('rejects compressed-size and manifest-size violations before submission', async () => {
        const oversizedFile = new File([new Uint8Array(MAX_ARCHIVE_BYTES + 1)], 'project.sb3');
        await expect(preflightArchive(oversizedFile)).resolves.toMatchObject({
            valid: false,
            reason: 'too-large',
        });

        const oversizedManifest = new JSZip();
        oversizedManifest.file(
            'project.json',
            JSON.stringify({ padding: 'x'.repeat(MAX_MANIFEST_BYTES) }),
        );
        const bytes = await oversizedManifest.generateAsync({ type: 'uint8array' });
        const manifestFile = new File([asBlobPart(bytes)], 'project.mblock');
        await expect(preflightArchive(manifestFile)).resolves.toMatchObject({
            valid: false,
            reason: 'too-large-manifest',
        });
    });
});
