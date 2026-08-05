import { auth, signIn } from "@/lib/auth";
import { getWelcomeConfig } from "@/features/welcome/queries";
import VerifyForm from "./VerifyForm";
import Emphasis from "@/components/layout/Emphasis";

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
            <main className="flex min-h-screen flex-col items-center justify-center p-4 text-white">
                <div className="bg-neutral-300/10 p-8 rounded-lg text-center max-w-sm w-full shadow-lg border border-neutral-800">
                    <Emphasis className="text-xl font-bold">Discord Login Required</Emphasis>
                    <p className="my-4 text-sm text-neutral-300">
                        This server requires you to log in to prove this is your account.
                    </p>

                    <form
                        action={async () => {
                            "use server";
                            await signIn("discord", { redirectTo: currentUrl });
                        }}
                    >
                        <button
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-md font-semibold transition cursor-pointer"
                        >
                            Login with Discord
                        </button>
                    </form>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 text-white">
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