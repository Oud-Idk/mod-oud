import { feedDeliverySchema, type FeedDelivery, type RssFeedSubscription } from "./types";

/**
 * The one place that knows how a delivery mechanism is presented.
 *
 * Keyed by `feedDeliverySchema`'s own union, so adding a variant breaks the
 * build here — at the single spot that has to learn about it — instead of
 * silently falling through an `if (delivery === ...)` in some component.
 */

/// The `FEED_TYPE` values, derived from the schema so no call site re-spells them.
export const FEED_DELIVERY = feedDeliverySchema.enum;

/// Seconds between polls when a feed reports no explicit cadence.
const DEFAULT_POLL_INTERVAL_SECS = 600;

/// Poll cadence in whole minutes, never rounded down to a nonsensical "0 min".
export function pollIntervalMinutes(intervalSecs?: number | null): number {
    return Math.max(1, Math.round((intervalSecs ?? DEFAULT_POLL_INTERVAL_SECS) / 60));
}

/// Renders a timestamp for the table, treating absent and unparseable alike.
export function formatTimestamp(iso?: string | null): string {
    if (iso === null || iso === undefined) return "never";

    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "never" : date.toLocaleString();
}

const BADGE_BASE = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold";

interface DeliveryPresentation {
    /// Badge text for this mechanism.
    label: string;
    /// Full badge styling, colors included.
    badgeClassName: string;
    /// The line shown in the table's Status column.
    detail: (subscription: RssFeedSubscription) => string;
}

export const DELIVERY: Record<FeedDelivery, DeliveryPresentation> = {
    PUBSUBHUBBUB: {
        label: "WebSub",
        badgeClassName: `${BADGE_BASE} border-brand/40 text-brand`,
        detail: (subscription) => `Lease expires ${formatTimestamp(subscription.leaseExpiresAt)}`,
    },
    POLLING: {
        label: "Polling",
        badgeClassName: `${BADGE_BASE} border-border text-muted-foreground`,
        detail: (subscription) =>
            `Every ${String(pollIntervalMinutes(subscription.intervalSecs))} min · last polled ${formatTimestamp(subscription.lastPolledAt)}`,
    },
};
