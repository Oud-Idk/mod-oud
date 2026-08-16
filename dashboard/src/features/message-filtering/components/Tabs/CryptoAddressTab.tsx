import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";
import { JSX } from "react";

interface CryptoAddressTabProp {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function CryptoAddressTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: CryptoAddressTabProp): JSX.Element {
    const filterConfig = config.cryptoAddress;

    const updateFilter = createFilterUpdater(config, handleChange, "cryptoAddress");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Crypto Address Filter"
        >
            <p>Will filter EVM (EIP-55), Bitcoin (P2PKH, P2SH, Bech32, Bech32m), Solana (Base58), and Cosmos Hub
                (Bech32).</p>
        </FilterLayoutWrapper>
    )
}