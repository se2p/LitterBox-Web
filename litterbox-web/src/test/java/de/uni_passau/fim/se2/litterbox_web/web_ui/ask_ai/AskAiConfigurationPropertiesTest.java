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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import java.time.Duration;
import java.util.function.Consumer;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.autoconfigure.context.PropertyPlaceholderAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class AskAiConfigurationPropertiesTest {

    @Test
    void defaultsAreSafeAndValidate() {
        final AskAiConfigurationProperties properties = new AskAiConfigurationProperties();

        properties.validate();

        assertThat(properties.isReady()).isFalse();
        assertThat(properties.getProvider().isComplete()).isFalse();
    }

    @Test
    void failsStartupWhenEnabledWithoutACompleteProviderConfiguration() {
        final AskAiConfigurationProperties properties = new AskAiConfigurationProperties();
        properties.setEnabled(true);

        assertThatIllegalStateException().isThrownBy(properties::validate);

        properties.getProvider().setBaseUrl(java.net.URI.create("https://example.test"));
        assertThatIllegalStateException().isThrownBy(properties::validate);

        properties.getProvider().setModel("test-model");
        assertThatIllegalStateException().isThrownBy(properties::validate);

        properties.getProvider().setApiKey("test-key");
        properties.validate();
        assertThat(properties.getProvider().isComplete()).isTrue();
    }

    static Stream<Arguments> invalidSettings() {
        return Stream.of(
            Arguments.of("blank api key", ready(p -> p.getProvider().setApiKey("  "))),
            Arguments.of("zero inquiries", ready(p -> p.getListing().setMaxInquiries(0))),
            Arguments.of("inquiries above the client ceiling", ready(p -> p.getListing().setMaxInquiries(501))),
            Arguments.of("zero findings", ready(p -> p.getListing().setMaxFindings(0))),
            Arguments.of("findings above the client ceiling", ready(p -> p.getListing().setMaxFindings(2001))),
            Arguments.of("zero output tokens", ready(p -> p.getProvider().setMaxOutputTokens(0))),
            Arguments.of("zero timeout", ready(p -> p.getProvider().setTimeout(Duration.ZERO))),
            Arguments.of("zero response bytes", ready(p -> p.getProvider().setMaxResponseBytes(0))),
            Arguments.of("zero active", ready(p -> p.getConversation().setMaxActivePerAnalysis(0))),
            Arguments.of("zero replies", ready(p -> p.getConversation().setMaxRepliesPerConversation(0))),
            Arguments.of(
                "zero failed attempts", ready(p -> p.getConversation().setMaxFailedAttemptsPerConversation(0))
            ),
            Arguments.of(
                "replies above the client ceiling", ready(p -> p.getConversation().setMaxRepliesPerConversation(1001))
            ),
            Arguments.of("zero generations", ready(p -> p.getConversation().setMaxConcurrentGenerations(0))),
            Arguments.of("zero visible ttl", ready(p -> p.getConversation().setUserVisibleTtl(Duration.ZERO))),
            Arguments.of("zero retain ttl", ready(p -> p.getConversation().setAnalysisRetainTtl(Duration.ZERO))),
            Arguments.of("retain shorter than visible", ready(p -> {
                p.getConversation().setUserVisibleTtl(Duration.ofDays(10));
                p.getConversation().setAnalysisRetainTtl(Duration.ofDays(5));
            })),
            Arguments.of("zero sweep batch", ready(p -> p.getSweep().setBatch(0))),
            Arguments.of("zero sweep run time", ready(p -> p.getSweep().setMaxRun(Duration.ZERO)))
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidSettings")
    void failsStartupOn(final String setting, final AskAiConfigurationProperties properties) {
        assertThatIllegalStateException().isThrownBy(properties::validate);
    }

    /** The browser rejects responses above these ceilings, so the ceilings themselves must still validate. */
    @Test
    void acceptsTheClientsCeilings() {
        ready(p -> {
            p.getListing().setMaxInquiries(500);
            p.getListing().setMaxFindings(2000);
            p.getConversation().setMaxRepliesPerConversation(1000);
        }).validate();
    }

    @Test
    void readinessNeedsAnEnabledDeploymentAndIsOverriddenByTheKillSwitch() {
        final AskAiConfigurationProperties disabled = new AskAiConfigurationProperties();
        disabled.validate();
        assertThat(disabled.isReady()).isFalse();

        final AskAiConfigurationProperties enabled = new AskAiConfigurationProperties();
        enabled.setEnabled(true);
        assertThat(enabled.isReady()).isTrue();

        final AskAiConfigurationProperties killed = ready(p -> p.setKillSwitch(true));
        killed.validate();
        assertThat(killed.isReady()).isFalse();
    }

    @Test
    void bindsFromConfigurationProperties() {
        final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(
                AutoConfigurations.of(
                    ConfigurationPropertiesAutoConfiguration.class, PropertyPlaceholderAutoConfiguration.class
                )
            )
            .withBean(AskAiConfigurationProperties.class)
            .withPropertyValues(
                "litterbox.ask-ai.enabled=true",
                "litterbox.ask-ai.listing.max-inquiries=10",
                "litterbox.ask-ai.listing.max-findings=5",
                "litterbox.ask-ai.provider.base-url=https://example.test",
                "litterbox.ask-ai.provider.model=test-model",
                "litterbox.ask-ai.provider.api-key=test-key"
            );

        runner.run(
            context -> {
                assertThat(context).hasNotFailed();
                final AskAiConfigurationProperties properties = context.getBean(AskAiConfigurationProperties.class);
                assertThat(properties.isEnabled()).isTrue();
                assertThat(properties.getListing().getMaxInquiries()).isEqualTo(10);
                assertThat(properties.getListing().getMaxFindings()).isEqualTo(5);
            }
        );
    }

    @Test
    void takesTheGatewayFromTheLlmProfileWhereItIsGivenNoneOfItsOwn() {
        runner()
            .withPropertyValues(
                "litterbox.ask-ai.enabled=true",
                "litterbox.llm.api=openai",
                "litterbox.llm.openai.base-url=https://gateway.test",
                "litterbox.llm.openai.model=shared-model",
                "litterbox.llm.openai.api-key=shared-key"
            )
            .run(
                context -> {
                    assertThat(context).hasNotFailed();
                    final AskAiConfigurationProperties.Provider provider = context
                        .getBean(AskAiConfigurationProperties.class).getProvider();
                    assertThat(provider.getBaseUrl()).isEqualTo(java.net.URI.create("https://gateway.test"));
                    assertThat(provider.getModel()).isEqualTo("shared-model");
                    assertThat(provider.getApiKey()).isEqualTo("shared-key");
                    assertThat(provider.getApi()).as("the llm profile's client speaks chat completions")
                        .isEqualTo(AskAiConfigurationProperties.ProviderApi.CHAT_COMPLETIONS);
                }
            );
    }

    /**
     * Each runner names the gateway kind itself: the {@code llm} profile copies {@code litterbox.llm.*} into JVM system
     * properties, which outlive the test that set them, so a test that left it to the default would read whatever the
     * last such context wrote.
     */
    @Test
    void keepsWhatItIsGivenOfItsOwnAndInheritsTheRest() {
        runner()
            .withPropertyValues(
                "litterbox.ask-ai.enabled=true",
                "litterbox.llm.api=openai",
                "litterbox.ask-ai.provider.model=child-safe-model",
                "litterbox.ask-ai.provider.api=RESPONSES",
                "litterbox.llm.openai.base-url=https://gateway.test",
                "litterbox.llm.openai.model=shared-model",
                "litterbox.llm.openai.api-key=shared-key"
            )
            .run(
                context -> {
                    assertThat(context).hasNotFailed();
                    final AskAiConfigurationProperties.Provider provider = context
                        .getBean(AskAiConfigurationProperties.class).getProvider();
                    assertThat(provider.getModel()).isEqualTo("child-safe-model");
                    assertThat(provider.getBaseUrl()).isEqualTo(java.net.URI.create("https://gateway.test"));
                    assertThat(provider.getApiKey()).isEqualTo("shared-key");
                    assertThat(provider.getApi()).isEqualTo(AskAiConfigurationProperties.ProviderApi.RESPONSES);
                }
            );
    }

    @Test
    void doesNotInheritFromAGatewayItCannotSpeakTo() {
        runner()
            .withPropertyValues(
                "litterbox.ask-ai.enabled=true",
                "litterbox.llm.api=gemini",
                "litterbox.llm.openai.base-url=https://gateway.test",
                "litterbox.llm.openai.model=shared-model",
                "litterbox.llm.openai.api-key=shared-key"
            )
            .run(
                context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure()).rootCause()
                        .hasMessageContaining("litterbox.llm.openai.* names the gateway");
                }
            );
    }

    private static ApplicationContextRunner runner() {
        return new ApplicationContextRunner()
            .withConfiguration(
                AutoConfigurations.of(
                    ConfigurationPropertiesAutoConfiguration.class, PropertyPlaceholderAutoConfiguration.class
                )
            )
            .withBean(AskAiConfigurationProperties.class);
    }

    /** A ready deployment, before validation, with one setting changed. */
    private static AskAiConfigurationProperties ready(final Consumer<AskAiConfigurationProperties> mutation) {
        final AskAiConfigurationProperties properties = new AskAiConfigurationProperties();
        properties.setEnabled(true);
        properties.getProvider().setBaseUrl(java.net.URI.create("https://example.test"));
        properties.getProvider().setModel("test-model");
        properties.getProvider().setApiKey("test-key");
        mutation.accept(properties);
        return properties;
    }
}
