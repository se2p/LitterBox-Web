/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.ReportDownload;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectApplicationService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectSupport;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SubmissionAnalysisAuthorizer;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public class SingleProjectController {

    private static final List<String> PROJECT_SUFFIXES = List.of(".sb3", ".mblock");
    private static final List<String> UPLOAD_SUFFIXES = List.of(".sb3", ".mblock", ".zip", ".txt");

    private final SingleProjectApplicationService service;
    private final SubmissionAnalysisAuthorizer analysisAuthorizer;

    public SingleProjectController(
        final SingleProjectApplicationService service,
        final SubmissionAnalysisAuthorizer analysisAuthorizer
    ) {
        this.service = service;
        this.analysisAuthorizer = analysisAuthorizer;
    }

    @PostMapping(
        value = "/submissions",
        consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public Mono<ResponseEntity<SingleProjectDtos.CreatedSubmission>> submitFile(
        @RequestPart("file") final FilePart file,
        final Locale locale,
        @RequestHeader(
            name = "Idempotency-Key",
            required = false
        ) final String idempotencyKey
    ) {
        validateFilename(file.filename(), UPLOAD_SUFFIXES);
        return DataBufferUtils.join(file.content(), SingleProjectSupport.MAX_PROJECT_BYTES).flatMap(
            buffer -> submitBuffer(
                buffer, file, locale, idempotencyKey, false
            )
        ).map(this::accepted);
    }

    private Mono<SingleProjectDtos.CreatedSubmission> submitBuffer(
        final org.springframework.core.io.buffer.DataBuffer buffer,
        final FilePart file,
        final Locale locale,
        final String idempotencyKey,
        final boolean questions
    ) {
        final int size = buffer.readableByteCount();
        if (size == 0 || size > SingleProjectSupport.MAX_PROJECT_BYTES) {
            DataBufferUtils.release(buffer);
            return Mono.error(new IllegalArgumentException("Project archive size is outside the allowed range"));
        }
        final byte[] bytes = new byte[size];
        buffer.read(bytes);
        DataBufferUtils.release(buffer);
        if (questions) {
            return service.submitQuestionUpload(bytes, file.filename(), ApiV1.publicLocale(locale), idempotencyKey);
        }
        final String filename = file.filename().toLowerCase(Locale.ROOT);
        if (filename.endsWith(".zip")) {
            return service.submitTeacherZip(bytes, file.filename(), ApiV1.publicLocale(locale), idempotencyKey);
        }
        if (filename.endsWith(".txt")) {
            return service.submitProjectList(bytes, file.filename(), ApiV1.publicLocale(locale), idempotencyKey);
        }
        return service.submitUpload(bytes, file.filename(), ApiV1.publicLocale(locale), idempotencyKey);
    }

    @PostMapping(
        value = "/question-submissions",
        consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public Mono<ResponseEntity<SingleProjectDtos.CreatedSubmission>> submitQuestionFile(
        @RequestPart("file") final FilePart file,
        final Locale locale,
        @RequestHeader(
            name = "Idempotency-Key",
            required = false
        ) final String idempotencyKey
    ) {
        validateFilename(file.filename(), PROJECT_SUFFIXES);
        return DataBufferUtils.join(file.content(), SingleProjectSupport.MAX_PROJECT_BYTES)
            .flatMap(buffer -> submitBuffer(buffer, file, locale, idempotencyKey, true))
            .map(this::accepted);
    }

    @PostMapping(
        value = "/submissions",
        consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<SingleProjectDtos.CreatedSubmission>> submitUrl(
        @RequestBody final ProjectUrlRequest request,
        final Locale locale,
        @RequestHeader(
            name = "Idempotency-Key",
            required = false
        ) final String idempotencyKey
    ) {
        if ((request.projectUrl() == null) == (request.studioId() == null)) {
            return Mono.error(new IllegalArgumentException("Provide exactly one of projectUrl or studioId"));
        }
        final String language = ApiV1.publicLocale(locale);
        return request.projectUrl() != null
            ? service.submitScratchUrl(request.projectUrl(), language, idempotencyKey).map(this::accepted)
            : service.submitStudio(request.studioId(), language, idempotencyKey).map(this::accepted);
    }

    @PostMapping(
        value = "/question-submissions",
        consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<SingleProjectDtos.CreatedSubmission>> submitQuestionUrl(
        @RequestBody final SingleProjectDtos.QuestionProjectUrlRequest request,
        final Locale locale,
        @RequestHeader(
            name = "Idempotency-Key",
            required = false
        ) final String idempotencyKey
    ) {
        if (request == null || request.projectUrl() == null) {
            return Mono.error(new IllegalArgumentException("Project URL is required"));
        }
        return service.submitQuestionScratchUrl(
            request.projectUrl(), ApiV1.publicLocale(locale), idempotencyKey
        ).map(this::accepted);
    }

    /**
     * Answers what a studio holds without submitting it. Sending a studio starts a run that cannot be taken back one
     * project at a time, so its size is worth naming while the form is still on the screen.
     */
    @GetMapping("/studios/{studioId}")
    public Mono<SingleProjectDtos.StudioSummaryView> studio(@PathVariable final String studioId) {
        return service.studioSummary(studioId).onErrorMap(
            error -> error instanceof WebClientResponseException.NotFound,
            error -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such Scratch studio", error)
        );
    }

    @GetMapping("/submissions/{token}")
    public Mono<SingleProjectDtos.SubmissionView> submission(@PathVariable final String token) {
        return service.find(token);
    }

    @PostMapping(
        value = "/submissions/{token}/reuse",
        consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<SingleProjectDtos.CreatedSubmission>> reuse(
        @PathVariable final String token,
        @RequestBody final SingleProjectDtos.ReuseRequest request,
        final Locale locale,
        @RequestHeader(
            name = "Idempotency-Key",
            required = false
        ) final String idempotencyKey
    ) {
        return service.reuse(token, request.analysis(), ApiV1.publicLocale(locale), idempotencyKey).map(this::accepted);
    }

    @PostMapping("/submissions/{token}/cancel")
    public Mono<ResponseEntity<Void>> cancel(@PathVariable final String token) {
        return service.cancel(token).thenReturn(ResponseEntity.noContent().build());
    }

    @GetMapping(
        value = "/submissions/{token}/events",
        produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public Flux<ServerSentEvent<String>> events(
        @PathVariable final String token,
        @RequestHeader(
            name = "Last-Event-ID",
            defaultValue = "0"
        ) final long lastEventId
    ) {
        return service.events(token, lastEventId);
    }

    @GetMapping("/submissions/{token}/assets/{sha256}")
    public Mono<ResponseEntity<byte[]>> asset(
        @PathVariable final String token,
        @PathVariable final String sha256
    ) {
        return service.asset(token, sha256).map(
            asset -> ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(asset.mediaType()))
                .contentLength(asset.byteSize())
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(365)).cachePublic().immutable())
                .eTag('"' + sha256.toLowerCase(Locale.ROOT) + '"')
                .header("X-Content-Type-Options", "nosniff")
                .body(asset.content())
        );
    }

    @GetMapping(
        value = "/submissions/{token}/report.html",
        produces = MediaType.TEXT_HTML_VALUE
    )
    public Mono<ResponseEntity<byte[]>> report(@PathVariable final String token) {
        return service.report(token).map(SingleProjectController::reportResponse);
    }

    /**
     * The report for one analysis of a submission. A class set holds many, and the plain report above hands back the
     * submission's last one, which is not the project the reader had open.
     */
    @GetMapping(
        value = "/submissions/{token}/analyses/{analysisId}/report.html",
        produces = MediaType.TEXT_HTML_VALUE
    )
    public Mono<ResponseEntity<byte[]>> analysisReport(
        @PathVariable final String token,
        @PathVariable final long analysisId
    ) {
        return service.report(token, analysisId).map(SingleProjectController::reportResponse);
    }

    private static ResponseEntity<byte[]> reportResponse(final ReportDownload report) {
        return ResponseEntity.ok()
            .header(
                HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment()
                    .filename(report.filename(), StandardCharsets.UTF_8)
                    .build().toString()
            )
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.TEXT_HTML)
            .body(report.content());
    }

    @PostMapping("/analyses/{analysisId}/feedback")
    public Mono<ResponseEntity<Void>> feedback(
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final SingleProjectDtos.FeedbackRequest request
    ) {
        return analysisAuthorizer.authorize(bearerToken(authorization), analysisId)
            .then(service.feedback(analysisId, request))
            .thenReturn(ResponseEntity.noContent().build());
    }

    @PostMapping("/analyses/{analysisId}/quiz-answers")
    public Mono<ResponseEntity<SingleProjectDtos.QuizAnswerResult>> quizAnswer(
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final SingleProjectDtos.QuizAnswerRequest request
    ) {
        return analysisAuthorizer.authorize(bearerToken(authorization), analysisId)
            .then(service.quizAnswer(analysisId, request))
            .map(ResponseEntity::ok);
    }

    /**
     * Returns generated questions and their answers for the owning teacher.
     *
     * @param analysisId    the analysis whose quiz answer key is requested
     * @param authorization the {@code Authorization} header carrying the submission's share token as a bearer token
     * @return the answer key, marked as not to be cached; fails with {@code 401} without a token and {@code 404} when
     *         the analysis is missing or not owned by the token
     */
    @GetMapping("/analyses/{analysisId}/quiz-answer-key")
    public Mono<ResponseEntity<SingleProjectDtos.QuizAnswerKeyView>> quizAnswerKey(
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization
    ) {
        return service.quizAnswerKey(analysisId, bearerToken(authorization)).map(
            view -> ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(view)
        );
    }

    private ResponseEntity<SingleProjectDtos.CreatedSubmission> accepted(
        final SingleProjectDtos.CreatedSubmission created
    ) {
        return ResponseEntity.accepted()
            .header(HttpHeaders.LOCATION, created.location().toASCIIString())
            .body(created);
    }

    /**
     * What a filename has to end in to be accepted here. The two upload endpoints differ only in whether a teacher
     * archive is one of them: questions are generated from a single project, never from a class set.
     */
    private void validateFilename(final String filename, final List<String> allowedSuffixes) {
        final String normalized = Objects.requireNonNull(filename, "filename").toLowerCase(Locale.ROOT);
        if (allowedSuffixes.stream().noneMatch(normalized::endsWith)) {
            throw new IllegalArgumentException("Only " + String.join(", ", allowedSuffixes) + " archives are accepted");
        }
    }

    private String bearerToken(final String authorization) {
        try {
            return SubmissionBearer.parse(authorization);
        }
        catch (CapabilityException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Submission token required");
        }
    }

    public record ProjectUrlRequest(String projectUrl, String studioId) {
    }
}
