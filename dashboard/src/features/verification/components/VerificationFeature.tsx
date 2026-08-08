import { auth, signIn } from "@/lib/auth";
import { getWelcomeConfig } from "@/features/welcome/queries";
import VerifyForm from "./VerifyForm";
import Emphasis from "@/components/layout/Emphasis";
import { Button } from "@/components/ui/Button";

interface VerifyFeatureProps {
    searchParams: { [key: string]: string | string[] | undefined };
}

export async function VerificationFeature({ searchParams }: VerifyFeatureProps) {
    const session = await auth();

    const userId = (searchParams.user_id as string) || "";
    const guildId = (searchParams.guild_id as string) || "";
    const expires = (searchParams.expires as string) || "";
    const sig = (searchParams.sig as string) || "";

    const settings = await getWelcomeConfig(guildId);
    const currentUrl = `/verify?user_id=${userId}&guild_id=${guildId}&expires=${expires}&sig=${sig}`;

    if (settings.verification.useOauth && !session?.accessToken) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center p-4">
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
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
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