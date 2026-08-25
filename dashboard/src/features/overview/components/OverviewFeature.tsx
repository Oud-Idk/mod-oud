import { auth, signIn } from "@/lib/auth";
import { getGuildLists } from "@/features/_shared/servers";
import { MutualServers } from "@/features/overview/components/MutualServers";
import { InviteableServers } from "@/features/overview/components/InviteableServers";
import { JSX } from "react";
import Logo from "@/components/ui/Logo";

export async function OverviewFeature(): Promise<JSX.Element> {
    const session = await auth();

    const { mutualGuilds, inviteableGuilds } = session?.accessToken !== undefined
        ? await getGuildLists(session.accessToken)
        : { mutualGuilds: [], inviteableGuilds: [] };

    return (
        <main
            className="flex-1 bg-surface text-foreground flex flex-col antialiased selection:bg-brand/20">
            {/* Main Content Area */}
            <div className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-4  flex flex-col">
                {session ? (
                    <div className="flex flex-col gap-4">
                        {/* Welcome / Header Title */}
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">
                                Select a Server
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Choose a server to configure or invite Mod Oud to start protecting.
                            </p>
                        </div>

                        {/* Servers Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                            {mutualGuilds.length > 0 && (
                                <div
                                    className="p-5 rounded-xl bg-surface-muted border border-border shadow-sm">
                                    <MutualServers mutualGuilds={mutualGuilds}/>
                                </div>
                            )}

                            {inviteableGuilds.length > 0 && (
                                <div
                                    className="p-5 rounded-xl bg-surface-muted border border-border shadow-sm">
                                    <InviteableServers inviteableGuilds={inviteableGuilds}/>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Centered Sign-In Hero Card */
                    <div className="flex-1 min-h-full flex justify-center items-center py-12">
                        <div
                            className="w-full max-w-md p-8 rounded-2xl bg-surface-muted border border-border shadow-dropdown text-center relative overflow-hidden">
                            <div className="flex items-center flex-col gap-2">
                                <Logo className="w-16 h-16"/>
                                <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">
                                    Welcome to Mod Oud
                                </h2>
                            </div>
                            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
                                Automate moderation, play music, have fun, and keep your Discord community safe quickly.
                            </p>

                            <form
                                action={async () => {
                                    "use server";
                                    await signIn("discord");
                                }}
                            >
                                <button
                                    type="submit"
                                    className="w-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover text-brand-foreground py-3 px-6 rounded-lg font-semibold transition-all duration-150 cursor-pointer shadow-sm focus-ring active:scale-[0.99]"
                                >
                                    <span>Sign in with Discord</span>
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}