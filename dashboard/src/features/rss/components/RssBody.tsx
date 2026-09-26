"use client";

import { JSX, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rss, Trash2 } from "lucide-react";
import { toast } from "sonner";

import Footer from "@/components/layout/Footer";
import { InputLabel } from "@/components/layout/InputLabel";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";
import { Button } from "@/components/ui/inputs/Button";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { TextInput } from "@/components/ui/inputs/TextInput";
import { getAvailableChannelOptions } from "@/features/_shared/dropdown";
import { DELIVERY } from "../delivery";
import { subscribeRssInputSchema, type RssFeedSubscription } from "../types";

interface RssBodyProps {
    subscriptions: RssFeedSubscription[];
    channelMap: Record<string, string>;
    onAdd: (input: unknown) => Promise<string>;
    onRemove: (feedId: string, channelId: string) => Promise<void>;
}

function hostnameOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

function channelLabel(channelMap: Record<string, string>, channelId: string): string {
    if (!Object.hasOwn(channelMap, channelId)) {
        return `#${channelId}`;
    }

    return `#${channelMap[channelId].replace("#", "")}`;
}

export function RssBody({
    subscriptions,
    channelMap,
    onAdd,
    onRemove,
}: RssBodyProps): JSX.Element {
    const router = useRouter();

    const [url, setUrl] = useState("");
    const [channelId, setChannelId] = useState<string | null>(null);
    const [isAdding, startAdd] = useTransition();
    const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
    const [isRemoving, startRemove] = useTransition();

    const channelOptions = getAvailableChannelOptions(channelMap);

    const handleAdd = (event: React.SubmitEvent): void => {
        event.preventDefault();

        const parsed = subscribeRssInputSchema.safeParse({
            url,
            channelId,
        });

        if (!parsed.success) {
            toast.error(parsed.error.issues[0].message);
            return;
        }

        startAdd(async () => {
            try {
                const message = await onAdd(parsed.data);
                toast.success(message);
                setUrl("");
                setChannelId(null);
                router.refresh();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not subscribe to that feed.");
            }
        });
    };

    const handleRemove = (subscription: RssFeedSubscription): void => {
        const key = `${subscription.feedId}:${subscription.channelId}`;
        setPendingRemoval(key);

        startRemove(async () => {
            try {
                await onRemove(subscription.feedId, subscription.channelId);
                toast.success(`Unsubscribed from ${hostnameOf(subscription.url)}`);
                router.refresh();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not remove that subscription.");
            } finally {
                setPendingRemoval(null);
            }
        });
    };

    return (
        <div className="space-y-6">
            <form onSubmit={handleAdd} className="border border-border-subtle rounded-lg bg-surface p-4 space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-foreground">Subscribe to a Feed</h3>
                    <Footer>
                        New RSS/Atom posts are posted to the selected channel — pushed via WebSub when the feed
                        supports it, otherwise polled by the bot.
                    </Footer>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(12rem,16rem)_auto] gap-3 items-end">
                    <div className="space-y-1.5">
                        <InputLabel>Feed URL</InputLabel>
                        <TextInput
                            value={url}
                            onChange={(e) => { setUrl(e.target.value); }}
                            placeholder="https://example.com/feed.xml"
                            disabled={isAdding}
                            aria-label="Feed URL"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <InputLabel>Channel</InputLabel>
                        <Dropdown
                            options={channelOptions}
                            value={channelId}
                            onChange={setChannelId}
                            placeholder="Select a channel..."
                            disabled={isAdding}
                        />
                    </div>

                    <Button type="submit" disabled={isAdding || channelOptions.length === 0}>
                        {isAdding ? "Subscribing..." : "Subscribe"}
                    </Button>
                </div>
            </form>

            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h3 className="text-lg font-bold text-foreground">Subscribed Feeds</h3>
                    <Footer>Every channel in this server that receives feed posts.</Footer>
                </div>
            </div>

            {subscriptions.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-lg bg-surface-muted/30">
                    <Rss className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                        No feeds subscribed yet — add your first one above.
                    </p>
                </div>
            ) : (
                <Table>
                    <TableHeader headers={["Feed", "Channel", "Delivery", "Status", ""]} />
                    <TableBody>
                        {subscriptions.map((subscription) => {
                            const rowKey = `${subscription.feedId}:${subscription.channelId}`;
                            const isRowPending = isRemoving && pendingRemoval === rowKey;

                            return (
                                <TableRow key={rowKey}>
                                    <TableCell>
                                        <a
                                            href={subscription.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block max-w-md"
                                        >
                                            <span className="block font-medium text-foreground truncate hover:text-brand transition-colors">
                                                {hostnameOf(subscription.url)}
                                            </span>
                                            <span className="block text-xs text-muted-foreground truncate">
                                                {subscription.url}
                                            </span>
                                        </a>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {channelLabel(channelMap, subscription.channelId)}
                                    </TableCell>
                                    <TableCell>
                                        <span className={DELIVERY[subscription.delivery].badgeClassName}>
                                            {DELIVERY[subscription.delivery].label}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {DELIVERY[subscription.delivery].detail(subscription)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            disabled={isRemoving}
                                            onClick={() => { handleRemove(subscription); }}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            {isRowPending ? "Removing..." : "Unsubscribe"}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
