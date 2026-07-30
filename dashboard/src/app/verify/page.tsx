import { auth, signIn } from "@/auth";
import Emphasis from "@/components/Layout/Emphasis";
import VerifyForm from "@/components/VerifyFormClientOnly";
import { getWelcomeConfig } from "@/utils/db/config";

export default async function VerifyPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const session = await auth();

    const resolvedParams = await searchParams;
    const userId = resolvedParams.user_id as string;
    const guildId = resolvedParams.guild_id as string;
    const expires = resolvedParams.expires as string;
    const sig = resolvedParams.sig as string;

    const settings = await getWelcomeConfig(guildId);

    const currentUrl = `/verify?user_id=${userId}&guild_id=${guildId}&expires=${expires}&sig=${sig}`;
    console.log(settings.verification.captchaType);

    if (settings.verification.useOauth && !session?.accessToken) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center p-4 text-white">
                <div className="bg-neutral-300/10 p-8 rounded-lg text-center max-w-sm w-full shadow-lg border">
                    <Emphasis className="text-xl font-bold">Discord Login Required</Emphasis>
                    <p className="my-4">This server requires you to log in to prove this is your account.</p>

                    <form
                        action={async () => {
                            "use server";
                            await signIn("discord", { redirectTo: currentUrl });
                        }}
                    >
                        <button
                            type="submit"
                            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-md font-semibold transition"
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