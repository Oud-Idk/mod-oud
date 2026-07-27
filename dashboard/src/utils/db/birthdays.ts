import { BirthdayConfig } from "@/types/db/birthday";
import { getGuildConfigField, saveGuildConfigField } from "@/utils/db/config";


export async function getBirthdayConfig(guildId: string): Promise<BirthdayConfig> {
    const default_config: BirthdayConfig = {
        enabled: false,
        channelId: "",
        announcementHour: 9,
        birthdayRoleId: "",
        requireYear: false,
        messageWithYear: {
            format: "TEXT",
            content: "Happy {user.ordinal_age} Birthday, {users}! 🎉",
            embed: {},
        },
        messageWithoutYear: {
            format: "TEXT",
            content: "Happy Birthday, {users}! 🎉",
            embed: {},
        },
    };

    const dbBirthday = await getGuildConfigField<any>(guildId, 'birthday');
    if (!dbBirthday) return default_config;

    return {
        ...default_config,
        ...dbBirthday,
    };
}

export async function saveBirthdayConfig(guildId: string, config: BirthdayConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'birthday', config);
}