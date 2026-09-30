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

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public final class AssessmentController {

    private final AssessmentService service;

    public AssessmentController(final AssessmentService service) {
        this.service = service;
    }

    /**
     * Publishes a quiz for an analysis owned by the caller's submission.
     *
     * @param authorization the {@code Authorization} header carrying the submission's share token as a bearer token
     * @param request       the quiz title, instructions, locale and questions
     * @return {@code 201} with the learner-facing and teacher tokens of the new quiz
     */
    @PostMapping(
        value = "/assessments",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AssessmentDtos.CreatedAssessment>> create(
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final AssessmentDtos.CreateAssessmentRequest request
    ) {
        final String bearer = bearerToken(authorization);
        return service.create(bearer, request).map(
            created -> ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(created)
        );
    }

    /**
     * Shows an open quiz to learners, without its answers.
     *
     * @param publicToken the quiz's learner-facing token
     * @return the quiz's title, instructions and questions; fails if the quiz is unknown or closed
     */
    @GetMapping(
        value = "/assessments/{publicToken}",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AssessmentDtos.LearnerView>> learnerView(@PathVariable final String publicToken) {
        return service.learnerView(publicToken).map(
            view -> ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(view)
        );
    }

    /**
     * Lists the program exports learners of an open quiz may download.
     *
     * @param publicToken the quiz's learner-facing token
     * @return the export targets of the analysed program; fails if program export is unavailable or the quiz is unknown
     *         or closed
     */
    @GetMapping(
        value = "/assessments/{publicToken}/code",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AdvancedCapabilityDtos.ExportTargetsView>> code(
        @PathVariable final String publicToken
    ) {
        return service.code(publicToken).map(
            targets -> ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(targets)
        );
    }

    /**
     * Opens a new learner attempt on an open quiz.
     *
     * @param publicToken the quiz's learner-facing token
     * @return {@code 201} with the token identifying the new attempt; fails if the quiz is unknown, closed or has used
     *         up its attempt allowance
     */
    @PostMapping(
        value = "/assessments/{publicToken}/attempts",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AssessmentDtos.AttemptStarted>> startAttempt(
        @PathVariable final String publicToken
    ) {
        return service.startAttempt(publicToken).map(
            attempt -> ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(attempt)
        );
    }

    @PostMapping(
        value = "/assessments/{publicToken}/attempts/{attemptToken}/answers",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AssessmentDtos.AnswerResult>> answer(
        @PathVariable final String publicToken,
        @PathVariable final String attemptToken,
        @RequestBody final AssessmentDtos.AnswerRequest request
    ) {
        return service.answer(publicToken, attemptToken, request).map(
            result -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result)
        );
    }

    @PatchMapping(
        value = "/assessments/{publicToken}",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AssessmentDtos.AssessmentState>> update(
        @PathVariable final String publicToken,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final AssessmentDtos.UpdateAssessmentRequest request
    ) {
        return service.update(publicToken, bearerToken(authorization), request).map(
            state -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(state)
        );
    }

    @DeleteMapping(value = "/assessments/{publicToken}")
    public Mono<ResponseEntity<Void>> delete(
        @PathVariable final String publicToken,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization
    ) {
        return service.delete(publicToken, bearerToken(authorization)).thenReturn(
            ResponseEntity.noContent().cacheControl(CacheControl.noStore()).<Void>build()
        );
    }

    /**
     * Returns the aggregated answers of a quiz to the teacher who published it.
     *
     * @param publicToken   the quiz's learner-facing token
     * @param authorization the {@code Authorization} header carrying the quiz's teacher token as a bearer token
     * @return the quiz's attempts, marks and answer counts per question; fails if the teacher token does not match
     */
    @GetMapping(
        value = "/assessments/{publicToken}/results",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AssessmentDtos.ResultsView>> results(
        @PathVariable final String publicToken,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization
    ) {
        final String bearer = bearerToken(authorization);
        return service.results(publicToken, bearer).map(
            view -> ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(view)
        );
    }

    private String bearerToken(final String authorization) {
        return SubmissionBearer.parse(authorization);
    }
}
