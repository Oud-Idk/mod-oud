import { auth, signIn } from "@/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InviteableServers } from "@/components/Dashboards/HomeDasboard/InviteableServers";
import { MutualServers } from "@/components/Dashboards/HomeDasboard/MutualServers";
import { getGuildLists } from "@/utils/servers";
import { ProfileDropdown } from "@/components/ProfileDropdown"; // Import the new component

export default async function Home() {
    const session = await auth();

    const { mutualGuilds, inviteableGuilds } = session?.accessToken
        ? await getGuildLists(session.accessToken)
        : { mutualGuilds: [], inviteableGuilds: [] };

    return (
        <main
            className="mx-auto p-2 md:p-4 font-sans min-h-screen flex flex-col"
        >
            <div className="flex justify-between items-center border-b pb-2">
                <h1 className="text-2xl font-extrabold tracking-tight">
                    Mod Oud Dashboard </h1>
                <div className="flex gap-4 items-center">
                    {session?.user && (
                        <ProfileDropdown session={session}/>
                    )}
                    <ThemeToggle/>
                </div>
            </div>

            {session ? (
                <div className={`${mutualGuilds.length === 0 ? 'block max-w-3/4 mx-auto' : 'grid grid-cols-2 gap-4'}`}>
                    {mutualGuilds.length > 0 && (<MutualServers mutualGuilds={mutualGuilds}/>)}
                    {inviteableGuilds.length > 0 && (<InviteableServers inviteableGuilds={inviteableGuilds}/>)}
                </div>
            ) : (
                <div className="flex justify-center items-center w-full h-full flex-1">
                    <div className="max-w-sm">
                        <p className="mb-6 leading-relaxed text-center">
                            Please sign in with Discord to view and configure your server settings. </p>
                        <form
                            action={async () => {
                                "use server";
                                await signIn("discord");
                            }}
                        >
                            <button
                                type="submit"
                                className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 px-6 rounded-lg font-bold transition-colors cursor-pointer shadow-sm text-center"
                            >
                                Sign in with Discord
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}