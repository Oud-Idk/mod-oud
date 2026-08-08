import React, { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import Turnstile from "react-turnstile";
import HCaptcha from "@hcaptcha/react-hcaptcha";

import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/TextInput";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import Emphasis from "@/components/layout/Emphasis";
import Footer from "@/components/layout/Footer";
import { Dropdown } from "@/components/ui/Dropdown";
import { DiscordRole } from "@/features/welcome/components/WelcomeBody";
import { WelcomeConfig, CaptchaType } from "@/features/welcome/types";
import { setupVerificationAction, teardownVerificationAction } from "@/features/welcome/actions";
import { WELCOME_CONFIG } from "@/features/welcome/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

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

const CAPTCHA_OPTIONS: { value: WelcomeConfig["verification"]["captchaType"]; label: string }[] = [
    { value: "TURNSTILE", label: "Turnstile" },
    { value: "HCAPTCHA", label: "hCaptcha" },
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
    const [isProcessingSetup, setIsProcessingSetup] = useState<boolean>(false);
    const [empty, setEmpty] = useState<boolean>(false);

    // Memoize derived options to prevent redundant mapping on every render
    const roleOptions = useMemo(
        () => roles.map((role) => ({ value: role.id, label: role.name })),
        [roles]
    );

    const channelOptions = useMemo(
        () => Object.entries(channelMap).map(([id, name]) => ({ value: id, label: name })),
        [channelMap]
    );

    const handleRunSetup = async (): Promise<void> => {
        setIsProcessingSetup(true);
        try {
            const res = await setupVerificationAction(guildId, {
                content: config.verification.message.content,
                embed: config.verification.message.embed,
                format: config.verification.message.format,
            });

            if (res.success) {
                toast.success("Verification environment dispatched successfully.");
                setConfig((prev) => ({
                    ...prev,
                    verification: {
                        ...prev.verification,
                        enabled: true,
                        verificationChannelId: res.verificationChannelId ?? null,
                        verificationRoleId: res.verificationRoleId ?? null,
                        verificationMessageId: res.verificationMessageId ?? null,
                    },
                }));
            } else {
                toast.error(res.error || "Could not complete manual verification environment setup.");
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "An unexpected error occurred during execution.");
        } finally {
            setIsProcessingSetup(false);
        }
    };

    const handleRunTeardown = async (): Promise<void> => {
        if (!config.verification.verificationChannelId || !config.verification.verificationRoleId) {
            toast.error("Missing active components to complete teardown execution.");
            return;
        }

        setIsProcessingSetup(true);
        try {
            const res = await teardownVerificationAction(guildId, {
                verification_channel_id: config.verification.verificationChannelId,
                verification_role_id: config.verification.verificationRoleId,
            });

            if (res.success) {
                toast.success("Verification channels and roles deleted successfully.");
                setConfig((prev) => ({
                    ...prev,
                    verification: {
                        ...prev.verification,
                        enabled: false,
                        verificationChannelId: null,
                        verificationRoleId: null,
                        verificationMessageId: null,
                    },
                }));
            } else {
                toast.error(res.error || "The removal execution was rejected by the server.");
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "An unexpected error occurred during execution.");
        } finally {
            setIsProcessingSetup(false);
        }
    };

    const sendDisabled = isProcessingSetup || isDirty || empty;

    return (
        <div className="space-y-6">
            <Tabs tabs={VERIFICATION_TABS} activeTab={activeTab} onChange={setActiveTab}/>

            {activeTab === "GENERAL" && (
                <div className="space-y-2">
                    <div className="space-y-1 flex flex-col">
                        <ToggleSwitch
                            checked={config.verification.enabled}
                            onChange={(enabled) =>
                                setConfig((prev) => ({
                                    ...prev,
                                    verification: { ...prev.verification, enabled },
                                }))
                            }
                            text="Enable Verification for New Members"
                        />

                        {config.verification.enabled && (
                            <ToggleSwitch
                                checked={config.verification.useOauth}
                                onChange={(useOauth) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        verification: { ...prev.verification, useOauth },
                                    }))
                                }
                                text="Use OAuth to verify"
                            />
                        )}
                    </div>

                    {config.verification.enabled && (
                        <>
                            {/* Captcha Section */}
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    This system uses{" "}
                                    <Link
                                        href="https://developers.cloudflare.com/turnstile/"
                                        className="hover:underline text-blue-500 font-medium"
                                        target="_blank"
                                    >
                                        Cloudflare Turnstile
                                    </Link>{" "}
                                    or{" "}
                                    <Link
                                        href="https://www.hcaptcha.com/"
                                        className="hover:underline text-blue-500 font-medium"
                                        target="_blank"
                                    >
                                        hCaptcha
                                    </Link>{" "}
                                    to verify humans against bots.
                                </p>

                                <Dropdown
                                    value={config.verification.captchaType}
                                    onChange={(captchaType) => {
                                        if (captchaType) {
                                            setConfig((prev) => ({
                                                ...prev,
                                                verification: { ...prev.verification, captchaType: captchaType as CaptchaType },
                                            }));
                                        }
                                    }}
                                    options={CAPTCHA_OPTIONS}
                                    className="max-w-sm"
                                />

                                <div>
                                    <Emphasis className="mb-1.5 block">Sample Widget Box</Emphasis>
                                    {config.verification.captchaType === "TURNSTILE" ? (
                                        <Turnstile sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}/>
                                    ) : (
                                        <HCaptcha sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? ""}/>
                                    )}
                                </div>
                            </div>

                            {/* Active Channel & Role Bindings Section */}
                            <div className="space-y-2 pt-1">
                                <Emphasis>Active Channel & Role Bindings</Emphasis>
                                <div className="space-y-2.5 max-w-sm">
                                    <div>
                                        <InputLabel>Verification Role</InputLabel>
                                        <Dropdown
                                            options={roleOptions}
                                            value={config.verification.verificationRoleId}
                                            onChange={(val) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    verification: { ...prev.verification, verificationRoleId: val },
                                                }))
                                            }
                                            placeholder="Uncreated"
                                        />
                                    </div>

                                    <div>
                                        <InputLabel>Landing Channel</InputLabel>
                                        <Dropdown
                                            options={channelOptions}
                                            value={config.verification.verificationChannelId}
                                            onChange={(val) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    verification: { ...prev.verification, verificationChannelId: val },
                                                }))
                                            }
                                            placeholder="Uncreated"
                                        />
                                    </div>

                                    <div>
                                        <InputLabel>Interaction Message ID</InputLabel>
                                        <TextInput
                                            value={config.verification.verificationMessageId ?? ""}
                                            onChange={(e) => {
                                                const val = e.target.value.trim();
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    verification: {
                                                        ...prev.verification,
                                                        verificationMessageId: val ? val : null
                                                    },
                                                }));
                                            }}
                                            placeholder="Uncreated"
                                            className="mt-1"
                                        />
                                    </div>

                                    <Footer>Navigate to &quot;Setup&quot; to set up these roles and channels.</Footer>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === "SETUP" && (
                <div>
                    <div className="max-w-5xl space-y-2">
                        <Emphasis className="mb-auto">Build Your Verification Panel Message</Emphasis>
                        <p className="text-sm text-muted-foreground">
                            {isSystemConfigured ? (
                                <>
                                    The verification system is currently active. Dismantling the setup will delete the
                                    designated verification text channel and role, and restore viewing access to the rest of the
                                    server for the <code className="bg-muted px-1 rounded">@everyone</code> role.
                                </>
                            ) : (
                                <>
                                    The automatic setup script will construct a <code className="bg-muted px-1 rounded">#verify</code> text channel at the top of
                                    your server list, restrict global viewing permissions for the <code className="bg-muted px-1 rounded">@everyone</code> role,
                                    and establish structured view access for members who acquire the <code className="bg-muted px-1 rounded">verified</code> role.
                                </>
                            )}
                        </p>

                        {config.verification.enabled ? (
                            <div>
                                {isSystemConfigured ? (
                                    <Button variant="danger" onClick={handleRunTeardown} disabled={isProcessingSetup}>
                                        {isProcessingSetup ? "Removing Verification System..." : "Teardown Verification System"}
                                    </Button>
                                ) : (
                                    <Button onClick={handleRunSetup} disabled={sendDisabled}>
                                        {isProcessingSetup ? "Deploying Verification System..." : "Set Up Verification System"}
                                    </Button>
                                )}

                                {/* UX Help hint for disabled button */}
                                {isDirty && !isSystemConfigured && (
                                    <p className="text-xs text-amber-500 mt-1">Save your changes first before running setup.</p>
                                )}
                            </div>
                        ) : (
                            <Footer>Please enable verification from the General tab first</Footer>
                        )}
                    </div>

                    <MessageConfigEditor
                        config={config.verification.message}
                        onChange={(changed) =>
                            setConfig((prev) => ({
                                ...prev,
                                verification: {
                                    ...prev.verification,
                                    enabled: changed.enabled ?? prev.verification.enabled,
                                    content: changed.content ?? "",
                                    embed: changed.embed ?? prev.verification.message.embed,
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
        </div>
    );
}