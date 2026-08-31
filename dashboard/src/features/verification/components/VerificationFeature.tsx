import { auth, signIn } from "@/lib/auth";
import { getWelcomeConfig } from "@/features/welcome/queries";
import VerifyForm from "./VerifyForm";
import Emphasis from "@/components/layout/Emphasis";
import { Button } from "@/components/ui/inputs/Button";
import { JSX } from "react";

interface VerifyFeatureProps {
    searchParams: Record<string, string | string[] | undefined>;
}

export async function VerificationFeature({ searchParams }: VerifyFeatureProps): Promise<JSX.Element> {
    const session = await auth();

    const userId = (searchParams.user_id) ?? "";
    const guildId = (searchParams.guild_id) ?? "";
    const expires = (searchParams.expires) ?? "";
    const sig = (searchParams.sig) ?? "";

    if (typeof userId !== "string" || typeof guildId !== "string" || typeof expires !== "string" || typeof sig !== "string") {
        return <p>Invalid search params!</p>
    }

    const settings = await getWelcomeConfig(guildId);
    const currentUrl = `/verify?user_id=${userId}&guild_id=${guildId}&expires=${expires}&sig=${sig}`;

    if (settings.verification.useOauth && session?.accessToken === undefined) {
        return (
            <main className="flex min-h-dvh flex-col items-center justify-center p-4">
                <div className="border border-border bg-surface">
                    <Emphasis className="text-xl font-bold">Discord Login Required</Emphasis>
                    <p className="my-4 text-sm">
                        This server requires you to log in to prove this is your account.
                    </p>

                    <form
                        action={async () => {
                            "use server";
                            await signIn("discord", { redirectTo: currentUrl });
                        }}
                    >
                        <Button type="submit">Login with Discord</Button>
                    </form>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-dvh flex-col items-center justify-center p-4">
            <VerifyForm
                userId={userId}
                guildId={guildId}
                expires={expires}
                sig={sig}
                session={session}
                captchaType={settings.verification.captchaType}
                useOauth={settings.verification.useOauth}
            />
        </main>
    );
}