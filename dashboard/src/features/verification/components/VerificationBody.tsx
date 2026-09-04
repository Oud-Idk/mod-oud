"use client";

import React, { JSX, useMemo, useState } from "react";
import Link from "next/link";
import Turnstile from "react-turnstile";
import HCaptcha from "@hcaptcha/react-hcaptcha";

import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/inputs/TextInput";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import Emphasis from "@/components/layout/Emphasis";
import Footer from "@/components/layout/Footer";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { setupVerificationAction, teardownVerificationAction } from "../actions";
import { VERIFICATION_CONFIG } from "../builderConfigs";
import { saveVerificationConfigSchema, type VerificationConfig } from "../types";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { Button } from "@/components/ui/inputs/Button";
import { toast } from "sonner";

export interface DiscordRole {
    id: string;
    name: string;
    color: number;
    managed: boolean;
}

interface VerificationBodyProps {
    guildId: string;
    verificationConfig: VerificationConfig;
    roles: DiscordRole[];
    channelMap: Record<string, string>;
    onSave: (config: VerificationConfig) => Promise<void>;
}

type TabValue = "GENERAL" | "SETUP";

const VERIFICATION_TABS: TabItem<TabValue>[] = [
    { value: "GENERAL", label: "General" },
    { value: "SETUP", label: "Setup" },
];

const CAPTCHA_OPTIONS: { value: VerificationConfig["captchaType"]; label: string }[] = [
    { value: "TURNSTILE", label: "Turnstile" },
    { value: "HCAPTCHA", label: "hCaptcha" },
];

export function VerificationBody({
    verificationConfig,
    guildId,
    roles,
    channelMap,
    onSave,
}: VerificationBodyProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<TabValue>("GENERAL");
    const [isProcessingSetup, setIsProcessingSetup] = useState<boolean>(false);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: verificationConfig,
        onSave,
        schema: saveVerificationConfigSchema,
    });

    const isSystemConfigured =
        config.verificationChannelId !== null &&
        config.verificationChannelId !== "" &&
        config.verificationRoleId !== null &&
        config.verificationRoleId !== "";

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
                content: config.message.content,
                embed: config.message.embed,
                format: config.message.format,
            });

            // The action succeeded if no error was thrown
            toast.success("Verification environment dispatched successfully.");
            setConfig((prev) => ({
                ...prev,
                ...res,
                enabled: true,
            }));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not complete manual verification environment setup.");
        } finally {
            setIsProcessingSetup(false);
        }
    };

    const handleRunTeardown = async (): Promise<void> => {
        if (config.verificationChannelId === null || config.verificationRoleId === null) {
            toast.error("Missing active components to complete teardown execution.");
            return;
        }

        setIsProcessingSetup(true);
        try {
            await teardownVerificationAction(guildId, {
                verification_channel_id: config.verificationChannelId,
                verification_role_id: config.verificationRoleId,
            });

            // The action succeeded if no error was thrown
            toast.success("Verification channels and roles deleted successfully.");
            setConfig((prev) => ({
                ...prev,
                enabled: false,
                verificationChannelId: null,
                verificationRoleId: null,
                verificationMessageId: null,
            }));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "The removal execution was rejected by the server.");
        } finally {
            setIsProcessingSetup(false);
        }
    };

    const sendDisabled = isProcessingSetup || isDirty;

    return (
        <div className="space-y-6">
            <Tabs tabs={VERIFICATION_TABS} activeTab={activeTab} onChange={setActiveTab}/>

            {activeTab === "GENERAL" && (
                <div className="space-y-2">
                    <div className="space-y-1 flex flex-col">
                        <ToggleSwitch
                            checked={config.enabled}
                            onChange={(enabled) => {
                                setConfig((prev) => ({
                                    ...prev,
                                    enabled,
                                })); }
                            }
                            text="Enable Verification for New Members"
                        />

                        {config.enabled && (
                            <ToggleSwitch
                                checked={config.useOauth}
                                onChange={(useOauth) => {
                                    setConfig((prev) => ({
                                        ...prev,
                                        useOauth,
                                    })); }
                                }
                                text="Use OAuth to verify"
                            />
                        )}
                    </div>

                    {config.enabled && (
                        <>
                            {/* Captcha Section */}
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    This system uses{" "}
                                    <Link
                                        href="https://developers.cloudflare.com/turnstile/"
                                        className="hover:underline text-brand font-medium"
                                        target="_blank"
                                    >
                                        Cloudflare Turnstile
                                    </Link>{" "}
                                    or{" "}
                                    <Link
                                        href="https://www.hcaptcha.com/"
                                        className="hover:underline text-brand font-medium"
                                        target="_blank"
                                    >
                                        hCaptcha
                                    </Link>{" "}
                                    to verify humans against bots.
                                </p>

                                <Dropdown
                                    value={config.captchaType}
                                    onChange={(captchaType) => {
                                        if (captchaType !== null) {
                                            setConfig((prev) => ({
                                                ...prev,
                                                captchaType: captchaType,
                                            }));
                                        }
                                    }}
                                    options={CAPTCHA_OPTIONS}
                                    className="max-w-sm"
                                />

                                <div>
                                    <Emphasis className="mb-1.5 block">Sample Widget Box</Emphasis>
                                    {config.captchaType === "TURNSTILE" ? (
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
                                            value={config.verificationRoleId}
                                            onChange={(val) => {
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    verificationRoleId: val,
                                                })); }
                                            }
                                            placeholder="Uncreated"
                                        />
                                    </div>

                                    <div>
                                        <InputLabel>Landing Channel</InputLabel>
                                        <Dropdown
                                            options={channelOptions}
                                            value={config.verificationChannelId}
                                            onChange={(val) => {
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    verificationChannelId: val,
                                                })); }
                                            }
                                            placeholder="Uncreated"
                                        />
                                    </div>

                                    <div>
                                        <InputLabel>Interaction Message ID</InputLabel>
                                        <TextInput
                                            value={config.verificationMessageId ?? ""}
                                            onChange={(e) => {
                                                const val = e.target.value.trim();
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    verificationMessageId: val.trim() !== "" ? val : null
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

                        {config.enabled ? (
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
                                    <p className="text-xs text-warning mt-1">Save your changes first before running setup.</p>
                                )}
                            </div>
                        ) : (
                            <Footer>Please enable verification from the General tab first</Footer>
                        )}
                    </div>

                    <MessageConfigEditor
                        config={config.message}
                        onChange={(changed) => {
                            setConfig((prev) => ({
                                ...prev,
                                message: {
                                    format: changed.format,
                                    content: changed.content ?? "",
                                    embed: changed.embed ?? prev.message.embed,
                                },
                            })); }
                        }
                        embedTemplateConfig={VERIFICATION_CONFIG}
                    />
                </div>
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}
