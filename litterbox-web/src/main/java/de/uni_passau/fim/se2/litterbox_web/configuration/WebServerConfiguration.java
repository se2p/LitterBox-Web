/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.configuration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.task.SimpleAsyncTaskExecutor;
import org.springframework.http.codec.ServerCodecConfigurer;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.reactive.config.BlockingExecutionConfigurer;
import org.springframework.web.reactive.config.WebFluxConfigurer;
import org.springframework.web.reactive.function.client.WebClient;

import jakarta.annotation.PreDestroy;

@Component
public class WebServerConfiguration implements WebFluxConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebServerConfiguration.class);

    private final DataSize maxPostSize;
    private final SimpleAsyncTaskExecutor blockingExecutor = blockingExecutor();

    public WebServerConfiguration(
        final @Value("${spring.codec.max-in-memory-size:2MB}") String maxPostSize
    ) {
        DataSize size;
        try {
            size = DataSize.parse(maxPostSize);
        }
        catch (Exception e) {
            log.error("Could not parse web server max request size: {}.", maxPostSize);
            size = DataSize.ofMegabytes(2);
        }

        this.maxPostSize = size;
        log.debug("Web server max request size: {}", size);
    }

    /**
     * A thread of its own for every handler call that is allowed to block, and no ceiling on how many.
     *
     * <p>
     * Built here rather than taken from the context, so that what these handlers run on is this file's to state and not
     * a deployment's to discover. Spring Boot's application executor would have served, but only where
     * {@code spring.threads.virtual.enabled} is set: without it that executor is eight platform threads in front of an
     * unbounded queue, and eight programs being analysed would leave every other blocking handler — none of which
     * analyses anything — queued behind them. Not registered as a bean either: a second {@code Executor} in the context
     * is enough for Boot to withdraw its own.
     *
     * <p>
     * Deliberately unbounded. A caller here is waiting on an analysis and would rather wait a little longer than be
     * turned away, and what limits the work is the carrier threads the virtual ones run on.
     */
    private static SimpleAsyncTaskExecutor blockingExecutor() {
        final SimpleAsyncTaskExecutor executor = new SimpleAsyncTaskExecutor("blocking-handler-");
        executor.setVirtualThreads(true);
        return executor;
    }

    @PreDestroy
    public void shutdown() {
        blockingExecutor.close();
    }

    @Override
    public void configureHttpMessageCodecs(final ServerCodecConfigurer configurer) {
        configurer.defaultCodecs().maxInMemorySize((int) maxPostSize.toBytes());
    }

    /**
     * Runs handler methods that return a plain value somewhere other than the threads the server answers on.
     *
     * <p>
     * A method whose return type Reactor has no adapter for has already done its work by the time it returns, and
     * WebFlux would otherwise do that work on the thread the request arrived on — where a Scratch program being parsed
     * and analysed holds up every other request that thread is carrying.
     *
     * <p>
     * Spring Boot wires this itself, but only for an application that lets it configure WebFlux; this one declares
     * {@code @EnableWebFlux}, which backs that auto-configuration off in full. Declared here rather than by dropping
     * the annotation because that would hand several other defaults back to Boot at the same time.
     */
    @Override
    public void configureBlockingExecution(final BlockingExecutionConfigurer configurer) {
        configurer.setExecutor(blockingExecutor);
    }

    @Bean
    @ConditionalOnMissingBean
    WebClient.Builder webClientBuilder() {
        return WebClient.builder();
    }
}
