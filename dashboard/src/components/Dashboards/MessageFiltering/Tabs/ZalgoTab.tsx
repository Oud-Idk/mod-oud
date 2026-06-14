import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";

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
                b̴̡̦͙͆̐̐r̴̡͍̞̓́̓o̴̼̼͎͊̾w̵͖͇͇̿̓̚n̸̼̻̫͋̈́ f̴̻͓͇̾͑͝o̸̪̦̓̈́̕x̴̻̝͓̓̐͝ j̴̪͇̙̽̓̕u̴͚̝̟̒̓m̵̙͕͎͑̾p̸̪͎͔̈́̈́͠s̸̫͍͑͐͘
                o̸͇͕̠͑̽̕v̴͉̼͎͆͊e̴̢̻͉̔̓r̵̡̼̼̽̽̈́ t̴̡̢̪̾̈́͊h̸͖͍͎̓͊̕e̸̡͕͔̐̚ l̸͇̟̪͋͐͐a̵̘̠͓͛̈́z̴̡̦̿͊͜͝y̸̪̝͚͒͊͝
                d̸͙͙̠́̈́͠o̴̟̦͆͑͜g̴̡̺̞͑̕͠ &nbsp;will be filtered</p>
        </FilterLayoutWrapper>
    )
}