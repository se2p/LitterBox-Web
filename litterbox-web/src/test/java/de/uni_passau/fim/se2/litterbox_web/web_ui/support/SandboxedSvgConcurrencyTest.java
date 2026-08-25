/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.Test;

/**
 * Costumes are judged on whichever pool thread is carrying the archive they came out of, so several documents are in
 * the check at the same time. {@link javax.xml.stream.XMLInputFactory} does not promise to be thread-safe, and an
 * admission decision that quietly depended on a provider being safe anyway would be a decision resting on nothing.
 *
 * <p>
 * The mixture below is deliberate: a document that must be admitted, one that must be refused for its markup, one for
 * its reference, one that is not XML, one that carries a DTD, and one that is admitted although it is hostile. If
 * parser state leaked between threads, the cheapest way for it to show is a document being judged as its neighbour.
 */
class SandboxedSvgConcurrencyTest {

    /** Enough repetitions that reader creation and reading overlap many times over, and still under a second. */
    private static final int ROUNDS = 250;

    private static final int THREADS = Math.max(4, Runtime.getRuntime().availableProcessors());

    private static final long BUDGET_SECONDS = 60;

    private record Costume(String name, byte[] document, boolean previewable) {
    }

    /** Which threads actually did the judging, so a test that quietly stopped being concurrent cannot still pass. */
    private final Set<String> judges = ConcurrentHashMap.newKeySet();

    private static final List<Costume> COSTUMES = List.of(
        costume("plain costume", svg("<rect width=\"4\" height=\"4\" fill=\"#00a9c7\"/>"), true),
        costume("inline raster", svg("<image href=\"data:image/png;base64,iVBORw0KGgo=\"/>"), true),
        costume("same-document reference", svg("<defs><linearGradient id=\"g\"/></defs><rect href=\"#g\"/>"), true),
        costume(
            "css that is admitted on purpose",
            svg("<style>@import url(\"https://example.invalid/ping\");</style>"), true
        ),
        costume("plain script", svg("<script>alert(1)</script>"), false),
        costume(
            "namespace-aliased script",
            "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:s=\"http://www.w3.org/2000/svg\">"
                + "<s:script>alert(1)</s:script></svg>",
            false
        ),
        costume("external reference", svg("<image href=\"https://example.invalid/ping\"/>"), false),
        costume("nested vector data", svg("<image href=\"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=\"/>"), false),
        costume("malformed", "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect/>", false),
        costume(
            "doctype with an external entity",
            "<!DOCTYPE svg [<!ENTITY leak SYSTEM \"file:///etc/hostname\">]>"
                + "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>&leak;</text></svg>",
            false
        )
    );

    @Test
    void judgesEveryCostumeTheSameWayWhenManyAreJudgedAtOnce() throws InterruptedException {
        final ExecutorService workers = Executors.newFixedThreadPool(THREADS);
        // Held until every task is queued, so the first ones are still starting while the last are submitted. Waiting
        // on a latch is what makes the overlap happen rather than a sleep hoping for it.
        final CountDownLatch gate = new CountDownLatch(1);
        try {
            final List<Future<String>> verdicts = submitAll(workers, gate);
            gate.countDown();
            workers.shutdown();

            assertThat(workers.awaitTermination(BUDGET_SECONDS, TimeUnit.SECONDS))
                .as("the checks finished inside %ds rather than deadlocking", BUDGET_SECONDS)
                .isTrue();
            assertThat(disagreements(verdicts)).isEmpty();
            assertThat(judges).as("the checks ran on several threads at once").hasSizeGreaterThan(1);
        }
        finally {
            workers.shutdownNow();
        }
    }

    private List<Future<String>> submitAll(final ExecutorService workers, final CountDownLatch gate) {
        final List<Future<String>> verdicts = new ArrayList<>(ROUNDS * COSTUMES.size());
        for (int round = 0; round < ROUNDS; round++) {
            for (Costume costume : COSTUMES) {
                verdicts.add(workers.submit(judge(costume, gate)));
            }
        }
        return verdicts;
    }

    /** Answers {@code null} when the costume was judged as it always must be, and what went wrong otherwise. */
    private Callable<String> judge(final Costume costume, final CountDownLatch gate) {
        return () -> {
            gate.await();
            judges.add(Thread.currentThread().getName());
            final boolean previewable = SandboxedSvg.isPreviewable(costume.document());
            return previewable == costume.previewable()
                ? null
                : costume.name() + " was judged " + previewable + " rather than " + costume.previewable();
        };
    }

    /**
     * A worker that threw is a failure of its own and not a refusal: a parser that came apart under concurrency would
     * otherwise be indistinguishable from a costume being turned away, which is the confusion this test exists to
     * prevent.
     */
    private List<String> disagreements(final List<Future<String>> verdicts) {
        final List<String> failures = new ArrayList<>();
        for (Future<String> verdict : verdicts) {
            try {
                final String disagreement = verdict.get(BUDGET_SECONDS, TimeUnit.SECONDS);
                if (disagreement != null) {
                    failures.add(disagreement);
                }
            }
            catch (ExecutionException thrown) {
                failures.add("a check threw " + thrown.getCause());
            }
            catch (TimeoutException stuck) {
                failures.add("a check never answered");
            }
            catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                failures.add("waiting for the checks was interrupted");
            }
        }
        return failures.stream().distinct().toList();
    }

    private static Costume costume(final String name, final String document, final boolean previewable) {
        return new Costume(name, document.getBytes(StandardCharsets.UTF_8), previewable);
    }

    private static String svg(final String body) {
        return "<svg xmlns=\"http://www.w3.org/2000/svg\">" + body + "</svg>";
    }
}
