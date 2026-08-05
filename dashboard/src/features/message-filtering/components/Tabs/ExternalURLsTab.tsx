import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Radio, RadioGroup } from "@headlessui/react";
import { MultiSelectViewer } from "@/components/ui/MultiSelectViewer";
import { TextInput } from "@/components/ui/TextInput";
import React, { useState } from "react";
import { isFQDN } from "validator";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayoutWrapper";
import { MessageFilteringConfig } from "@/features/message-filtering/types";
import { createFilterUpdater } from "@/features/message-filtering";

interface ExternalURLsTabProps {
    config: MessageFilteringConfig;
    handleChange: (data: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function ExternalURLsTab({
    config,
    handleChange,
    channelMap,
    roleMap,
}: ExternalURLsTabProps) {
    const [inputUrl, setInputUrl] = useState<string>("");
    const filterConfig = config.externalLinks;

    const updateFilter = createFilterUpdater(config, handleChange, "externalLinks");

    const handleRemoveAllowedDomain = (d: string) => {
        const current = filterConfig.allowedDomains || [];
        updateFilter({ ...filterConfig, allowedDomains: current.filter((item) => item !== d) });
    };

    const handleRemoveBlockedDomain = (d: string) => {
        const current = filterConfig.blockedDomains || [];
        updateFilter({ ...filterConfig, blockedDomains: current.filter((item) => item !== d) });
    };

    const validateUrl = (url: string) => {
        const trimmed = url.trim();
        if (!trimmed) return;

        if (!isFQDN(trimmed, {
            require_tld: true,
        })) {
            alert("Please enter a valid domain.");
            return;
        }
        return trimmed;
    }

    const handleAddAllowUrl = () => {
        const url = validateUrl(inputUrl);
        if (!url) return;
        const current = filterConfig.allowedDomains || [];
        if (!current.includes(url)) {
            updateFilter({ ...filterConfig, allowedDomains: [...current, url] });
        }
        setInputUrl("");
    };

    const handleAddBlockedUrl = () => {
        const url = validateUrl(inputUrl);
        if (!url) return;
        const current = filterConfig.blockedDomains || [];
        if (!current.includes(url)) {
            updateFilter({ ...filterConfig, blockedDomains: [...current, url] });
        }
        setInputUrl("");
    };

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            channelMap={channelMap}
            roleMap={roleMap}
            toggleText="Enable External URLs Filter"
        >
            <div className="space-y-4">
                <div className="space-y-4">
                    <ToggleSwitch
                        checked={filterConfig.blockOnlyMalicious}
                        onChange={() => updateFilter({ blockOnlyMalicious: !filterConfig.blockOnlyMalicious })}
                        disabled={false}
                        text="Block only Malicious URLs (Google Safe Browsing)"
                        className="text-sm"
                    />

                    {!filterConfig.blockOnlyMalicious && (
                        <div className="space-y-4">
                            <RadioGroup
                                value={filterConfig.mode}
                                onChange={(v) => updateFilter({ mode: v })}
                                className="flex gap-4"
                            >
                                <Radio
                                    value="ALLOWLIST"
                                    className={({ checked }) => `ring-offset-1 rounded-md p-2 cursor-pointer flex items-center gap-2 text-sm ${checked ? "bg-neutral-300/10" : ""}`}
                                >
                                    {({ checked }) => (
                                        <>
                                            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-neutral-500 ${checked ? "bg-primary-600" : "bg-transparent"}`}>
                                                {checked ? <span
                                                    className="w-2 h-2 rounded-full bg-white" aria-hidden
                                                /> : null}
                                            </span>
                                            <span>Allowlist</span>
                                        </>
                                    )}
                                </Radio>

                                <Radio
                                    value="ScopeMode"
                                    className={({ checked }) => `ring-offset-1 rounded-md p-2 cursor-pointer flex items-center gap-2 text-sm ${checked ? "bg-neutral-300/10" : ""}`}
                                >
                                    {({ checked }) => (
                                        <>
                                            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-neutral-500 ${checked ? "bg-primary-600" : "bg-transparent"}`}>
                                                {checked ? <span
                                                    className="w-2 h-2 rounded-full bg-white" aria-hidden
                                                /> : null}
                                            </span>
                                            <span>Denylist</span>
                                        </>
                                    )}
                                </Radio>
                            </RadioGroup>
                            {filterConfig.mode === "ALLOWLIST" && (
                                <div>
                                    <p>Please type your domain to allow (e.g. google.com)</p>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium mt-2 mb-0">Allowed domains</label>
                                        <MultiSelectViewer
                                            selectedList={filterConfig.allowedDomains || []}
                                            onDelete={(d) => handleRemoveAllowedDomain(d)}
                                            placeholder="No domains allowed"
                                        />
                                        <TextInput
                                            onSubmit={handleAddAllowUrl}
                                            value={inputUrl}
                                            onChange={(e) => setInputUrl(e.target.value)}
                                            placeholder="Enter domain"
                                        />
                                    </div>
                                </div>
                            )}
                            {filterConfig.mode === "DENYLIST" && (
                                <div>
                                    <p>Please type your domain to block (e.g. 888casino.com)</p>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium mt-2 mb-0">Blocked domains</label>
                                        <MultiSelectViewer
                                            selectedList={filterConfig.blockedDomains || []}
                                            onDelete={(d) => handleRemoveBlockedDomain(d)}
                                            placeholder="No domains blocked"
                                        />
                                        <TextInput
                                            onSubmit={handleAddBlockedUrl}
                                            value={inputUrl}
                                            onChange={(e) => setInputUrl(e.target.value)}
                                            placeholder="Enter domain"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </FilterLayoutWrapper>
    );
}