/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import java.net.URI;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository;
import jakarta.annotation.PostConstruct;

/**
 * Ask AI settings, bound from {@code litterbox.ask-ai.*}.
 *
 * <p>
 * The provider is the one OpenAI-compatible gateway the rest of LitterBox-Web already speaks to: whatever of its base
 * URL, API key and model Ask AI is not given under {@code litterbox.ask-ai.provider.*} it takes from
 * {@code litterbox.llm.openai.*}, so that enabling the {@code llm} profile is all a deployment needs to do, and setting
 * only {@code litterbox.ask-ai.provider.model} is all it takes to give Ask AI a model of its own.
 */
@Component
@ConfigurationProperties(prefix = "litterbox.ask-ai")
public final class AskAiConfigurationProperties {

    private boolean enabled;
    private boolean killSwitch;

    private final Listing listing = new Listing();
    private final Provider provider = new Provider();
    private final Conversation conversation = new Conversation();
    private final Sweep sweep = new Sweep();
    private final Environment environment;

    public AskAiConfigurationProperties() {
        this(null);
    }

    @Autowired
    public AskAiConfigurationProperties(final Environment environment) {
        this.environment = environment;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(final boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isKillSwitch() {
        return killSwitch;
    }

    public void setKillSwitch(final boolean killSwitch) {
        this.killSwitch = killSwitch;
    }

    public boolean isReady() {
        return enabled && !killSwitch;
    }

    public void requireReady() {
        if (!isReady()) {
            throw AskAiProblemException.unavailable();
        }
    }

    public Listing getListing() {
        return listing;
    }

    public Provider getProvider() {
        return provider;
    }

    public Conversation getConversation() {
        return conversation;
    }

    public Sweep getSweep() {
        return sweep;
    }

    /** Response limits are validated by the browser client and must stay within its bounds. */
    private static final int MAX_LISTING_INQUIRIES = 500;
    private static final int MAX_LISTING_FINDINGS = 2000;
    private static final int MAX_REPLIES_PER_CONVERSATION = 1000;

    /** Rejects invalid deployment settings at startup. */
    @PostConstruct
    public void validate() {
        requireInRange(listing.getMaxInquiries(), 1, MAX_LISTING_INQUIRIES, "litterbox.ask-ai.listing.max-inquiries");
        requireInRange(listing.getMaxFindings(), 1, MAX_LISTING_FINDINGS, "litterbox.ask-ai.listing.max-findings");
        if (enabled && environment != null) {
            provider.inheritFrom(environment);
        }
        if (enabled && !provider.isComplete()) {
            throw new IllegalStateException(
                "litterbox.ask-ai.provider.base-url, litterbox.ask-ai.provider.api-key, and "
                    + "litterbox.ask-ai.provider.model are required when litterbox.ask-ai.enabled is true, "
                    + "unless litterbox.llm.openai.* names the gateway for them"
            );
        }
        conversation.validate();
        provider.validate();
        sweep.validate();
    }

    public static final class Listing {

        private int maxInquiries = 120;
        private int maxFindings = 24;

        public int getMaxInquiries() {
            return maxInquiries;
        }

        public void setMaxInquiries(final int maxInquiries) {
            this.maxInquiries = maxInquiries;
        }

        public int getMaxFindings() {
            return maxFindings;
        }

        public void setMaxFindings(final int maxFindings) {
            this.maxFindings = maxFindings;
        }
    }

    private static void requirePositive(final int value, final String property) {
        if (value < 1) {
            throw new IllegalStateException(property + " must be positive, was " + value);
        }
    }

    private static void requireInRange(final int value, final int min, final int max, final String property) {
        if (value < min || value > max) {
            throw new IllegalStateException(
                property + " must be between " + min + " and " + max + ", was " + value
            );
        }
    }

    private static void requirePositive(final Duration value, final String property) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalStateException(property + " must be positive");
        }
    }

    public enum ProviderApi {
        RESPONSES,
        CHAT_COMPLETIONS
    }

    public static final class Provider {

        private static final String LLM_API = "litterbox.llm.api";
        private static final String LLM_OPENAI = "litterbox.llm.openai.";

        /** Unset until validation: inherited settings speak the API the {@code llm} profile's client speaks. */
        private ProviderApi api;
        private URI baseUrl;
        private String apiKey = "";
        private String model;
        /**
         * Room for an answer given as steps: one short paragraph and one code block per step runs to some 650 tokens,
         * and a reply the cap cuts off is a reply nobody can read.
         */
        private int maxOutputTokens = 1500;
        private Duration timeout = Duration.ofSeconds(45);
        private int maxResponseBytes = 262_144;

        public ProviderApi getApi() {
            if (api == null) {
                return ProviderApi.RESPONSES;
            }
            return api;
        }

        public void setApi(final ProviderApi api) {
            this.api = api;
        }

        public URI getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(final URI baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(final String apiKey) {
            this.apiKey = apiKey;
        }

        public String getModel() {
            return model;
        }

        public void setModel(final String model) {
            this.model = model;
        }

        public int getMaxOutputTokens() {
            return maxOutputTokens;
        }

        public void setMaxOutputTokens(final int maxOutputTokens) {
            this.maxOutputTokens = maxOutputTokens;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(final Duration timeout) {
            this.timeout = timeout;
        }

        public int getMaxResponseBytes() {
            return maxResponseBytes;
        }

        public void setMaxResponseBytes(final int maxResponseBytes) {
            this.maxResponseBytes = maxResponseBytes;
        }

        public boolean isComplete() {
            if (baseUrl == null || apiKey == null || model == null) {
                return false;
            }
            return !apiKey.isBlank() && !model.isBlank();
        }

        /**
         * Fills in what was not set from the {@code llm} profile's OpenAI-compatible gateway, if that is what it is: a
         * Gemini gateway has no OpenAI endpoints to speak to. The API style follows the values — the client behind
         * {@code litterbox.llm.openai.*} speaks chat completions — unless set outright.
         */
        void inheritFrom(final Environment environment) {
            if (!"openai".equalsIgnoreCase(environment.getProperty(LLM_API, "openai").strip())) {
                return;
            }
            boolean inherited = false;
            if (baseUrl == null) {
                baseUrl = environment.getProperty(LLM_OPENAI + "base-url", URI.class);
                inherited |= baseUrl != null;
            }
            if (apiKey == null || apiKey.isBlank()) {
                apiKey = environment.getProperty(LLM_OPENAI + "api-key", "");
                inherited |= !apiKey.isBlank();
            }
            if (model == null || model.isBlank()) {
                model = environment.getProperty(LLM_OPENAI + "model");
                inherited |= model != null;
            }
            if (inherited && api == null) {
                api = ProviderApi.CHAT_COMPLETIONS;
            }
        }

        private void validate() {
            requirePositive(maxOutputTokens, "litterbox.ask-ai.provider.max-output-tokens");
            requirePositive(timeout, "litterbox.ask-ai.provider.timeout");
            requirePositive(maxResponseBytes, "litterbox.ask-ai.provider.max-response-bytes");
        }
    }

    public static final class Conversation {

        private int maxActivePerAnalysis = 3;
        private int maxRepliesPerConversation = 8;
        /**
         * How many turns a conversation may start beyond its replies. A failed attempt gives its reply back, so without
         * this a provider that keeps failing, or a client that keeps cancelling, could go on for ever.
         */
        private int maxFailedAttemptsPerConversation = 8;
        private int maxConcurrentGenerations = 4;
        private Duration userVisibleTtl = Duration.ofDays(7);
        private Duration analysisRetainTtl = Duration.ofDays(30);

        public int getMaxActivePerAnalysis() {
            return maxActivePerAnalysis;
        }

        public void setMaxActivePerAnalysis(final int maxActivePerAnalysis) {
            this.maxActivePerAnalysis = maxActivePerAnalysis;
        }

        public int getMaxRepliesPerConversation() {
            return maxRepliesPerConversation;
        }

        public void setMaxRepliesPerConversation(final int maxRepliesPerConversation) {
            this.maxRepliesPerConversation = maxRepliesPerConversation;
        }

        public int getMaxFailedAttemptsPerConversation() {
            return maxFailedAttemptsPerConversation;
        }

        public void setMaxFailedAttemptsPerConversation(final int maxFailedAttemptsPerConversation) {
            this.maxFailedAttemptsPerConversation = maxFailedAttemptsPerConversation;
        }

        /**
         * The budget one conversation is given: its replies, and its replies plus the failures it may survive.
         *
         * @return the reply and attempt budget for one conversation
         */
        public AskAiConversationRepository.TurnBudget turnBudget() {
            return new AskAiConversationRepository.TurnBudget(
                maxRepliesPerConversation, maxRepliesPerConversation + maxFailedAttemptsPerConversation
            );
        }

        public int getMaxConcurrentGenerations() {
            return maxConcurrentGenerations;
        }

        public void setMaxConcurrentGenerations(final int maxConcurrentGenerations) {
            this.maxConcurrentGenerations = maxConcurrentGenerations;
        }

        public Duration getUserVisibleTtl() {
            return userVisibleTtl;
        }

        public void setUserVisibleTtl(final Duration userVisibleTtl) {
            this.userVisibleTtl = userVisibleTtl;
        }

        public Duration getAnalysisRetainTtl() {
            return analysisRetainTtl;
        }

        public void setAnalysisRetainTtl(final Duration analysisRetainTtl) {
            this.analysisRetainTtl = analysisRetainTtl;
        }

        private void validate() {
            requirePositive(maxActivePerAnalysis, "litterbox.ask-ai.conversation.max-active-per-analysis");
            requireInRange(
                maxRepliesPerConversation, 1, MAX_REPLIES_PER_CONVERSATION,
                "litterbox.ask-ai.conversation.max-replies-per-conversation"
            );
            requireInRange(
                maxFailedAttemptsPerConversation, 1, MAX_REPLIES_PER_CONVERSATION,
                "litterbox.ask-ai.conversation.max-failed-attempts-per-conversation"
            );
            requirePositive(maxConcurrentGenerations, "litterbox.ask-ai.conversation.max-concurrent-generations");
            requirePositive(userVisibleTtl, "litterbox.ask-ai.conversation.user-visible-ttl");
            requirePositive(analysisRetainTtl, "litterbox.ask-ai.conversation.analysis-retain-ttl");
            if (analysisRetainTtl.compareTo(userVisibleTtl) < 0) {
                throw new IllegalStateException(
                    "litterbox.ask-ai.conversation.analysis-retain-ttl must be at least "
                        + "litterbox.ask-ai.conversation.user-visible-ttl"
                );
            }
        }
    }

    /** How much retention work one scheduled run may do; the schedule itself is read by {@code @Scheduled}. */
    public static final class Sweep {

        private int batch = 200;
        private int maxBatches = 50;
        private Duration maxRun = Duration.ofMinutes(5);
        private Duration pendingTurnTimeout = Duration.ofMinutes(15);

        public int getBatch() {
            return batch;
        }

        public void setBatch(final int batch) {
            this.batch = batch;
        }

        public int getMaxBatches() {
            return maxBatches;
        }

        public void setMaxBatches(final int maxBatches) {
            this.maxBatches = maxBatches;
        }

        public Duration getMaxRun() {
            return maxRun;
        }

        public void setMaxRun(final Duration maxRun) {
            this.maxRun = maxRun;
        }

        public Duration getPendingTurnTimeout() {
            return pendingTurnTimeout;
        }

        public void setPendingTurnTimeout(final Duration pendingTurnTimeout) {
            this.pendingTurnTimeout = pendingTurnTimeout;
        }

        private void validate() {
            requirePositive(batch, "litterbox.ask-ai.sweep.batch");
            requirePositive(maxBatches, "litterbox.ask-ai.sweep.max-batches");
            requirePositive(maxRun, "litterbox.ask-ai.sweep.max-run");
            requirePositive(pendingTurnTimeout, "litterbox.ask-ai.sweep.pending-turn-timeout");
        }
    }
}
