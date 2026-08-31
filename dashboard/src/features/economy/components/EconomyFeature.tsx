import { JSX } from "react";
import { getEconomyConfig, getEconomyItems } from "@/features/economy/queries";
import {
    saveEconomyConfigAction,
    saveEconomyItemAction,
    deleteEconomyItemAction,
} from "@/features/economy/actions";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { EconomyBody } from "@/features/economy/components/EconomyBody";
import { getRoleMap } from "@/features/_shared/channels";

interface EconomyFeatureProps {
    guildId: string;
    searchParams?: Promise<{ id?: string; tab?: string }>;
}

export async function EconomyFeature({
    guildId,
    searchParams,
}: EconomyFeatureProps): Promise<JSX.Element> {
    const resolvedParams = searchParams ? await searchParams : {};
    const selectedItemId = resolvedParams.id;

    const [economyConfig, items, roleMap] = await Promise.all([
        getEconomyConfig(guildId),
        getEconomyItems(guildId),
        getRoleMap(guildId),
    ]);

    const activeItem = items.find((item) => item.id === selectedItemId) ?? null;

    const onSaveConfig = saveEconomyConfigAction.bind(null, guildId);
    const onSaveItem = saveEconomyItemAction.bind(null, guildId);
    const onDeleteItem = deleteEconomyItemAction.bind(null, guildId);

    return (
        <>
            <DashboardHeader>Economy</DashboardHeader>
            <EconomyBody
                economyConfig={economyConfig}
                items={items}
                activeItem={activeItem}
                roleMap={roleMap}
                onSaveConfig={onSaveConfig}
                onSaveItem={onSaveItem}
                onDeleteItem={onDeleteItem}
                guildId={guildId}
            />
        </>
    );
}