import { Plus } from "lucide-react";
import { JSX } from "react";

interface BotNotSetupProps {
    permissions: string;
    guild_id: string;
}

export function BotNotSetup({ permissions, guild_id }: BotNotSetupProps): JSX.Element {
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.AUTH_DISCORD_ID}&permissions=${permissions}&integration_type=0&scope=bot+applications.commands&guild_id=${guild_id}&disable_guild_select=true`

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
            <h1 className="text-2xl font-bold mb-2">Bot Not Setup</h1>
            <p className="text-neutral-500 dark:text-neutral-400 max-w-sm mb-6 text-sm">
                Mod Oud is not yet in this server. Invite the bot to configure your moderation modules.
            </p>
            <a
                href={inviteUrl}
                className="inline-flex items-center gap-2 px-6 py-3 bg-surface border border-border font-medium rounded-lg shadow transition-colors"
            >
                <Plus className="w-5 h-5"/> Setup Mod Oud
            </a>
        </div>
    );
}