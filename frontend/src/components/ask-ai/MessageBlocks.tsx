// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useTranslation } from 'react-i18next';
import type { AskAiBlock, AskAiBlockRole } from '../../api/ask-ai';
import type { TranslationKey } from '../../i18n/locales';
import { ScratchblocksPreview } from '../single-project/ScratchblocksPreview';

const BLOCK_ROLE_LABEL_KEYS: Record<AskAiBlockRole, TranslationKey> = {
    existing: 'askAiBlockRoleExisting',
    suggested: 'askAiBlockRoleSuggested',
    example: 'askAiBlockRoleExample',
};

export function MessageBlocks({ blocks, locale }: { blocks: AskAiBlock[]; locale: string }) {
    const { t } = useTranslation();
    const textAlternativeLabel = t('textAlternative');
    return (
        <div className="ask-ai-message-blocks">
            {blocks.map((block, index) => {
                if (block.kind === 'text') return <p key={index}>{block.text}</p>;
                const roleLabel = t(BLOCK_ROLE_LABEL_KEYS[block.role]);
                return (
                    <div
                        key={index}
                        className={`ask-ai-scratchblocks-block ask-ai-scratchblocks-block-${block.role}`}
                    >
                        <p className="ask-ai-block-role">{roleLabel}</p>
                        <ScratchblocksPreview
                            source={block.code}
                            locale={locale}
                            label={roleLabel}
                            textAlternativeLabel={textAlternativeLabel}
                            showLabel={false}
                        />
                    </div>
                );
            })}
        </div>
    );
}
