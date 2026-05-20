/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.llm;

/**
 * Selects the request format used for hint generation via {@code /llm/raw}.
 *
 * <ul>
 * <li>{@link #RESPONSES} – OpenAI Responses API ({@code /responses}); default.</li>
 * <li>{@link #CHAT_COMPLETIONS} – OpenAI-compatible Chat Completions API ({@code /chat/completions}); required for
 * Qwen3 models where {@code chat_template_kwargs.enable_thinking} must be set to disable chain-of-thought.</li>
 * </ul>
 */
public enum LlmApiStyle {
    RESPONSES,
    CHAT_COMPLETIONS
}
