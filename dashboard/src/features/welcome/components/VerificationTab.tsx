import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import Link from "next/link";
import Turnstile from "react-turnstile";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/TextInput";
import React, { ReactNode, useState } from "react";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import Emphasis from "@/components/layout/Emphasis";
import PrimaryButton from "@/components/ui/buttons/PrimaryButton";
import Footer from "@/components/layout/Footer";
import AlertButton from "@/components/ui/buttons/AlertButton";
import { DiscordRole } from "@/features/welcome/components/WelcomeBody";
import { Dropdown } from "@/components/ui/Dropdown";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { WelcomeConfig } from "@/features/welcome/types";
import { setupVerificationAction, teardownVerificationAction } from "@/features/welcome/actions";
import { WELCOME_CONFIG } from "@/features/welcome/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";

interface VerificationTabProps {
    config: WelcomeConfig;
    setConfig: React.Dispatch<React.SetStateAction<WelcomeConfig>>;
    isSystemConfigured: boolean;
    guildId: string;
    isDirty: boolean;
    roles: DiscordRole[];
    channelMap: Record<string, string>;
}

type TabValue = "GENERAL" | "SETUP";

const VERIFICATION_TABS: TabItem<TabValue>[] = [
    { value: "GENERAL", label: "General" },
    { value: "SETUP", label: "Setup" },
];

export function VerificationTab({
    config,
    setConfig,
    isSystemConfigured,
    guildId,
    isDirty,
    roles,
    channelMap,
}: VerificationTabProps): ReactNode {
    const [activeTab, setActiveTab] = useState<TabValue>("GENERAL");
    const [setupStatus, setSetupStatus] = useState<{ type: "SUCCESS" | "ERROR"; text: string } | null>(null);
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

    const handleRunSetup = async (): Promise<void> => {
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
                    type: "SUCCESS",
                    text: `Verification environment dispatched successfully.`,
                });
                setConfig(prev => ({
                    ...prev,
                    verification: {
                        ...prev.verification,
                        enabled: true,
                        verificationChannelId: res.verificationChannelId ?? "",
                        verificationRoleId: res.verificationRoleId ?? "",
                        verificationMessageId: res.verificationMessageId ?? "",
                    }
                }));
            } else {
                setSetupStatus({
                    type: "ERROR",
                    text: res.error || "Could not complete manual verification environment setup.",
                });
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unexpected error occurred during execution.";

            setSetupStatus({
                type: "ERROR",
                text: message,
            });
        } finally {
            setIsProcessingSetup(false);
        }
    };

    const handleRunTeardown = async (): Promise<void> => {
        if (!config.verification.verificationChannelId || !config.verification.verificationRoleId) {
            setSetupStatus({ type: "ERROR", text: "Missing active components to complete teardown execution." });
            return;
        }

        setIsProcessingSetup(true);
        setSetupStatus(null);
        try {
            const res = await teardownVerificationAction(guildId, {
                verification_channel_id: config.verification.verificationChannelId,
                verification_role_id: config.verification.verificationRoleId,
            });

            if (res.success) {
                setSetupStatus({
                    type: "SUCCESS",
                    text: "Verification channels and roles deleted successfully.",
                });
                setConfig(prev => ({
                    ...prev,
                    verification: {
                        ...prev.verification,
                        enabled: false,
                        verificationChannelId: "",
                        verificationRoleId: "",
                        verificationMessageId: "",
                    }
                }));
            } else {
                setSetupStatus({
                    type: "ERROR",
                    text: res.error || "The removal execution was rejected by the server.",
                });
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unexpected error occurred during execution.";

            setSetupStatus({
                type: "ERROR",
                text: message,
            });
        }finally {
            setIsProcessingSetup(false);
        }
    };

    const sendDisabled = isProcessingSetup || isDirty || empty;

    return <div>
        <Tabs tabs={VERIFICATION_TABS} activeTab={activeTab} onChange={setActiveTab}/>

        {activeTab === "GENERAL" && (
            <>
                <ToggleSwitch
                    checked={config.verification.enabled} onChange={b => setConfig({
                    ...config,
                    verification: { ...config.verification, enabled: b }
                })} text="Enable Verification for New Members"
                />

                {config.verification.enabled && (
                    <div className="space-y-4">
                        <ToggleSwitch
                            checked={config.verification.useOauth} onChange={b => setConfig({
                            ...config,
                            verification: { ...config.verification, useOauth: b }
                        })} text="Use OAuth to verify"
                        />

                        <div>
                            <p>
                                This system uses <Link
                                href="https://developers.cloudflare.com/turnstile/"
                                className="hover:underline text-blue-500"
                                target="_blank"
                            >Cloudflare Turnstile</Link> or <Link
                                href="https://www.hcaptcha.com/"
                                className="hover:underline text-blue-500"
                                target="_blank"
                            >hCaptcha</Link> to verify humans against bots.</p>
                            <Dropdown
                                value={config.verification.captchaType} onChange={t => setConfig(prev => ({
                                ...prev,
                                verification: {
                                    ...prev.verification,
                                    captchaType: t,
                                }
                            }))} options={[
                                {
                                    value: "TURNSTILE",
                                    label: "Turnstile",
                                },
                                {
                                    value: "HCAPTCHA",
                                    label: "hCaptcha",
                                }
                            ]} className="max-w-xs"
                            />
                            <Emphasis className="mt-2">Sample Widget Box</Emphasis>
                            {config.verification.captchaType == "TURNSTILE" ?
                                <Turnstile sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}/> :
                                <HCaptcha sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? ""}/>}
                        </div>

                        <div>
                            <Emphasis>Active Channel & Role Bindings</Emphasis>
                            <div className="space-y-2">
                                <div>
                                    <InputLabel>Verification Role</InputLabel>
                                    <Dropdown
                                        options={roleOptions}
                                        value={config.verification.verificationRoleId || ""}
                                        onChange={(val) => setConfig(prev => ({
                                            ...prev,
                                            verification: {
                                                ...prev.verification,
                                                verificationRoleId: val
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
                                        value={config.verification.verificationChannelId || ""}
                                        onChange={(val) => setConfig(prev => ({
                                            ...prev,
                                            verification: {
                                                ...prev.verification,
                                                verificationChannelId: val
                                            }
                                        }))}
                                        placeholder="Uncreated"
                                        className="max-w-xs"
                                    />
                                </div>

                                <div>
                                    <InputLabel>Interaction Message ID</InputLabel>
                                    <TextInput
                                        value={config.verification.verificationMessageId || ""}
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            verification: {
                                                ...prev.verification,
                                                verificationMessageId: e.target.value
                                            }
                                        }))}
                                        placeholder="Uncreated"
                                    />
                                </div>

                                <Footer>Navigate to &quot;Setup&quot; to set up these roles and channels.</Footer>
                            </div>
                        </div>
                    </div>
                )}
            </>
        )}

        {activeTab === "SETUP" && (
            <div className="space-y-4">
                <div className="max-w-5xl">
                    <Emphasis>Build Your Verification Panel Message </Emphasis>
                    {isSystemConfigured ? (
                        <p className="my-2">
                            The verification system is currently active. Dismantling the setup will delete the
                            designated verification text channel and role, and restore viewing access to the rest of the
                            server for the <code>@everyone</code> role.
                        </p>
                    ) : (
                        <p className="my-2">
                            The automatic setup script will construct a <code>#verify</code> text channel at the top of
                            your server list, restrict global viewing permissions for the <code>@everyone</code> role,
                            and establish structured view access for members who acquire the <code>verified</code> role.
                        </p>
                    )}

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
                            className={`text-xs mt-3 font-semibold ${setupStatus.type === "ERROR" ? "text-red-500" : "text-green-500"}`}
                        >
                            {setupStatus.text}
                        </div>
                    )}
                </div>

                <MessageConfigEditor
                    config={config.verification}
                    onChange={(changed) =>
                        setConfig((prev) => ({
                            ...prev,
                            verification: {
                                ...prev.verification,
                                enabled: changed.enabled ?? prev.verification.enabled,
                                content: changed.content ?? "",
                                embed: changed.embed ?? prev.verification.embed,
                                format: changed.format,
                            },
                        }))
                    }
                    embedTemplateConfig={WELCOME_CONFIG}
                    setIsEmpty={setEmpty}
                    enableToggle={false}
                />
            </div>
        )}
    </div>;
}