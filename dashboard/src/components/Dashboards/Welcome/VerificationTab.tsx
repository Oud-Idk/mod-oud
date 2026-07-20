import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import Link from "next/link";
import Turnstile from "react-turnstile";
import { InputLabel } from "@/components/Layout/InputLabel";
import { TextInput } from "@/components/Inputs/TextInput";
import React, { useState } from "react";
import { WelcomeConfig } from "@/types/config/welcome";
import { TabItem, Tabs } from "@/components/Layout/Tabs";
import Emphasis from "@/components/Layout/Emphasis";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { setupVerificationAction, teardownVerificationAction } from "@/actions/verification";
import { DEFAULT_CONFIG } from "@/utils/embedTemplates";
import Footer from "@/components/Layout/Footer";
import AlertButton from "@/components/Inputs/Buttons/AlertButton";
import { DiscordRole } from "@/components/Dashboards/Welcome/WelcomeBody";
import { Dropdown } from "@/components/Inputs/Dropdown";

interface VerificationTabProps {
    config: WelcomeConfig;
    setConfig: React.Dispatch<React.SetStateAction<WelcomeConfig>>;
    isSystemConfigured: boolean;
    guildId: string;
    isDirty: boolean;
    roles: DiscordRole[];
    channelMap: Record<string, string>;
}

type TabValue = "general" | "setup";

const VERIFICATION_TABS: TabItem<TabValue>[] = [
    { value: "general", label: "General" },
    { value: "setup", label: "Setup" },
];

export function VerificationTab({
    config,
    setConfig,
    isSystemConfigured,
    guildId,
    isDirty,
    roles,
    channelMap,
}: VerificationTabProps) {
    const [activeTab, setActiveTab] = useState<TabValue>("general");
    const [setupStatus, setSetupStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [isProcessingSetup, setIsProcessingSetup] = useState<boolean>(false);
    const [empty, setEmpty] = useState<boolean>(false);

    const roleOptions = roles.map((role) => ({
        value: role.id,
        label: role.name,
    }));

    const channelOptions = Object.entries(channelMap).map(([id, name]) => ({
        value: id,
        label: name,
    }))

    const handleRunSetup = async () => {
        setIsProcessingSetup(true);
        setSetupStatus(null);
        try {
            const res = await setupVerificationAction(guildId, {
                content: config.verification.content,
                embed: config.verification.embed,
                format: config.verification.format || "embed"
            });

            if (res.success) {
                setSetupStatus({
                    type: "success",
                    text: `Verification environment dispatched successfully.`,
                });
                setConfig(prev => ({
                    ...prev,
                    verification: {
                        ...prev.verification,
                        enabled: true,
                        verification_channel_id: res.verificationChannelId,
                        verification_role_id: res.verificationRoleId,
                        verification_message_id: res.verificationMessageId,
                    }
                }));
            } else {
                setSetupStatus({
                    type: "error",
                    text: res.error || "Could not complete manual verification environment setup.",
                });
            }
        } catch (err: any) {
            setSetupStatus({
                type: "error",
                text: err.message || "An unexpected error occurred during execution.",
            });
        } finally {
            setIsProcessingSetup(false);
        }
    };

    const handleRunTeardown = async () => {
        if (!config.verification.verification_channel_id || !config.verification.verification_role_id) {
            setSetupStatus({ type: "error", text: "Missing active components to complete teardown execution." });
            return;
        }

        setIsProcessingSetup(true);
        setSetupStatus(null);
        try {
            const res = await teardownVerificationAction(guildId, {
                verification_channel_id: config.verification.verification_channel_id,
                verification_role_id: config.verification.verification_role_id,
            });

            if (res.success) {
                setSetupStatus({
                    type: "success",
                    text: "Verification channels and roles deleted successfully.",
                });
                setConfig(prev => ({
                    ...prev,
                    verification: {
                        ...prev.verification,
                        enabled: false,
                        verification_channel_id: "",
                        verification_role_id: "",
                        verification_message_id: "",
                    }
                }));
            } else {
                setSetupStatus({
                    type: "error",
                    text: res.error || "The removal execution was rejected by the server.",
                });
            }
        } catch (err: any) {
            setSetupStatus({
                type: "error",
                text: err.message || "An unexpected error occurred during database cleanup.",
            });
        } finally {
            setIsProcessingSetup(false);
        }
    };

    let sendDisabled = isProcessingSetup || isDirty || empty;

    return <div>
        <Tabs tabs={VERIFICATION_TABS} activeTab={activeTab} onChange={setActiveTab}/>

        {activeTab === "general" && (
            <>
                <ToggleSwitch
                    checked={config.verification.enabled} onChange={b => setConfig({
                    ...config,
                    verification: { ...config.verification, enabled: b }
                })} text="Enable Verification for New Members"
                />

                {config.verification.enabled && (
                    <div className="space-y-4">
                        <div>
                            <p>
                                This system uses <Link
                                href="https://developers.cloudflare.com/turnstile/"
                                className="hover:underline text-blue-500"
                                target="_blank"
                            >Cloudflare Turnstile</Link> to verify humans against bots.</p>
                            <Emphasis className="mt-2">Sample Widget Box</Emphasis>
                            <Turnstile sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}/>
                        </div>

                        <div>
                            <Emphasis>Active Channel & Role Bindings</Emphasis>
                            <div className="space-y-2">
                                <div>
                                    <InputLabel>Verification Role</InputLabel>
                                    <Dropdown
                                        options={roleOptions}
                                        value={config.verification.verification_role_id || ""}
                                        onChange={(val) => setConfig(prev => ({
                                            ...prev,
                                            verification: {
                                                ...prev.verification,
                                                verification_role_id: val
                                            }
                                        }))}
                                        placeholder="Uncreated"
                                        className="max-w-xs"
                                    />
                                </div>

                                <div>
                                    <InputLabel>Landing Channel</InputLabel>

                                    <Dropdown
                                        options={channelOptions}
                                        value={config.verification.verification_channel_id || ""}
                                        onChange={(val) => setConfig(prev => ({
                                            ...prev,
                                            verification: {
                                                ...prev.verification,
                                                verification_channel_id: val
                                            }
                                        }))}
                                        placeholder="Uncreated"
                                        className="max-w-xs"
                                    />
                                </div>

                                <div>
                                    <InputLabel>Interaction Message ID</InputLabel>
                                    <TextInput
                                        value={config.verification.verification_message_id || ""}
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            verification: {
                                                ...prev.verification,
                                                verification_message_id: e.target.value
                                            }
                                        }))}
                                        placeholder="Uncreated"
                                        disableSubmitButton
                                    />
                                </div>

                                <Footer>Navigate to "Setup" to set up these roles and channels.</Footer>
                            </div>
                        </div>
                    </div>
                )}
            </>
        )}

        {activeTab === "setup" && (
            <div className="space-y-4">
                <div className="max-w-5xl">
                    <Emphasis>Build Your Verification Panel Message </Emphasis>
                    <p className="mb-4">
                        The automatic setup script will construct
                        a <code>#verify</code> text channel at the top of your
                        server list. It restricts viewing permissions
                        for <code className="text-neutral-300">@everyone</code> and establishes structured view
                        access for members who acquire
                        the <code className="text-neutral-300">verified</code> role. </p>

                    {config.verification.enabled ? (
                        <>
                            {isSystemConfigured ? <AlertButton
                                onClick={handleRunTeardown} disabled={isProcessingSetup}
                            >
                                {isProcessingSetup ? "Removing Verification System..." : "Teardown Verification System"}
                            </AlertButton> : <PrimaryButton onClick={handleRunSetup} disabled={sendDisabled}>
                                {isProcessingSetup ? "Deploying Verification System..." : "Set Up Verification System"}
                            </PrimaryButton>}
                        </>
                    ) : <Footer>Please enable verification from the General tab first</Footer>}

                    {setupStatus && (
                        <div
                            className={`text-xs mt-3 font-semibold ${setupStatus.type === "error" ? "text-red-500" : "text-green-500"}`}
                        >
                            {setupStatus.text}
                        </div>
                    )}
                </div>

                <MessageConfigEditor
                    config={config.verification}
                    onChange={changed => setConfig({ ...config, verification: { ...config.verification, ...changed } })}
                    embedTemplateConfig={DEFAULT_CONFIG}
                    setIsEmpty={setEmpty}
                    enableToggle={false}
                />
            </div>
        )}
    </div>;
}