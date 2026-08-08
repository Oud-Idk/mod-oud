import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";

interface ZalgoTabProp {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function ZalgoTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: ZalgoTabProp) {
    const filterConfig = config.zalgo;

    const updateFilter = createFilterUpdater(config, handleChange, "zalgo");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Zalgo Filter"
        >
            <p>Zalgos like T̴̢̝͇̈́̐͒h̵̙̼͌͐͐e̵̢̪̦͛̓̚ q̸͇̺͔͋͛̕ǘ̸̫̘͌̔͜i̸͍͖̪̓͐c̴̝̺̼̒̈́͠k̴̫͕̦̐̈́̾
                b̴̡̦͙͆̐̐r̴̡͍̞̓́̓o̴̼̼͎͊̾w̵͖͇͇̿̓̚n̸̼̻̫͋̈́ f̴̻͓͇̾͑͝o̸̪̦̓̈́̕x̴̻̝͓̓̐͝ j̴̪͇̙̽̓̕u̴͚̝̟̒̓m̵̙͕͎͑̾p̸̪͎͔̈́̈́͠s̸̫͍͑͐͘&nbsp;will be filtered</p>
        </FilterLayoutWrapper>
    )
}