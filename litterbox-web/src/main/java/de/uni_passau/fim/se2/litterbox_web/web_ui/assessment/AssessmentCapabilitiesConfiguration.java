/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.assessment;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

@Component
@ConfigurationProperties(prefix = "litterbox.capabilities.assessments")
public final class AssessmentCapabilitiesConfiguration {

    public static final String ASSESSMENTS = "assessments";

    private static final int TITLE_COLUMN_WIDTH = 255;

    private static final int INSTRUCTIONS_COLUMN_WIDTH = 2000;

    private static final int ANSWER_COLUMN_WIDTH = 500;

    private boolean enabled;

    private int maxQuestions = 100;

    private int maxTitleLength = 200;

    private int maxInstructionsLength = 2000;

    private int maxQuestionTextLength = 1000;

    private int maxAnswerGuideLength = 1000;

    private int maxAnswerLength = 500;

    private int maxOptions = 12;

    private int maxOptionLength = 500;

    private int retentionDays = 180;

    private int maxRetentionDays = 365;

    private int maxAttempts = 2000;

    private int maxAssessmentsPerAnalysis = 20;

    private int cleanupBatchSize = 50;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(final boolean enabled) {
        this.enabled = enabled;
    }

    public int getMaxQuestions() {
        return maxQuestions;
    }

    public void setMaxQuestions(final int maxQuestions) {
        this.maxQuestions = maxQuestions;
    }

    public int getMaxTitleLength() {
        return maxTitleLength;
    }

    public void setMaxTitleLength(final int maxTitleLength) {
        this.maxTitleLength = maxTitleLength;
    }

    public int getMaxInstructionsLength() {
        return maxInstructionsLength;
    }

    public void setMaxInstructionsLength(final int maxInstructionsLength) {
        this.maxInstructionsLength = maxInstructionsLength;
    }

    public int getMaxQuestionTextLength() {
        return maxQuestionTextLength;
    }

    public void setMaxQuestionTextLength(final int maxQuestionTextLength) {
        this.maxQuestionTextLength = maxQuestionTextLength;
    }

    public int getMaxAnswerGuideLength() {
        return maxAnswerGuideLength;
    }

    public void setMaxAnswerGuideLength(final int maxAnswerGuideLength) {
        this.maxAnswerGuideLength = maxAnswerGuideLength;
    }

    public int getMaxAnswerLength() {
        return maxAnswerLength;
    }

    public void setMaxAnswerLength(final int maxAnswerLength) {
        this.maxAnswerLength = maxAnswerLength;
    }

    public int getMaxOptions() {
        return maxOptions;
    }

    public void setMaxOptions(final int maxOptions) {
        this.maxOptions = maxOptions;
    }

    public int getMaxOptionLength() {
        return maxOptionLength;
    }

    public void setMaxOptionLength(final int maxOptionLength) {
        this.maxOptionLength = maxOptionLength;
    }

    public int getRetentionDays() {
        return retentionDays;
    }

    public void setRetentionDays(final int retentionDays) {
        this.retentionDays = retentionDays;
    }

    public int getMaxRetentionDays() {
        return maxRetentionDays;
    }

    public void setMaxRetentionDays(final int maxRetentionDays) {
        this.maxRetentionDays = maxRetentionDays;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(final int maxAttempts) {
        this.maxAttempts = maxAttempts;
    }

    public int getMaxAssessmentsPerAnalysis() {
        return maxAssessmentsPerAnalysis;
    }

    public void setMaxAssessmentsPerAnalysis(final int maxAssessmentsPerAnalysis) {
        this.maxAssessmentsPerAnalysis = maxAssessmentsPerAnalysis;
    }

    public int getCleanupBatchSize() {
        return cleanupBatchSize;
    }

    public void setCleanupBatchSize(final int cleanupBatchSize) {
        this.cleanupBatchSize = cleanupBatchSize;
    }

    @PostConstruct
    void validate() {
        requirePositive(maxQuestions, "assessment question count");
        requirePositive(maxTitleLength, "assessment title length");
        requirePositive(maxInstructionsLength, "assessment instructions length");
        requirePositive(maxQuestionTextLength, "assessment question text length");
        requirePositive(maxAnswerGuideLength, "assessment answer guide length");
        requirePositive(maxAnswerLength, "assessment answer length");
        requirePositive(maxOptions, "assessment answer option count");
        requirePositive(maxOptionLength, "assessment answer option length");
        requirePositive(retentionDays, "assessment retention days");
        requirePositive(maxRetentionDays, "assessment maximum retention days");
        requirePositive(maxAttempts, "assessment attempt count");
        requirePositive(maxAssessmentsPerAnalysis, "assessment count per analysis");
        requirePositive(cleanupBatchSize, "assessment cleanup batch size");
        if (retentionDays > maxRetentionDays) {
            throw new IllegalStateException(
                "Retention may not exceed the maximum a teacher can set: assessment retention days"
            );
        }
        if (maxOptionLength > maxAnswerLength) {
            throw new IllegalStateException(
                "An answer option may not be longer than an answer: assessment answer option length"
            );
        }
        requireFitsColumn(maxTitleLength, TITLE_COLUMN_WIDTH, "assessment title length");
        requireFitsColumn(maxInstructionsLength, INSTRUCTIONS_COLUMN_WIDTH, "assessment instructions length");
        requireFitsColumn(maxAnswerLength, ANSWER_COLUMN_WIDTH, "assessment answer length");
    }

    private void requirePositive(final int value, final String name) {
        if (value < 1) {
            throw new IllegalStateException("Capability limit must be positive: " + name);
        }
    }

    private void requireFitsColumn(final int value, final int columnWidth, final String name) {
        if (value > columnWidth) {
            throw new IllegalStateException("Capability limit exceeds the column it is stored in: " + name);
        }
    }
}
