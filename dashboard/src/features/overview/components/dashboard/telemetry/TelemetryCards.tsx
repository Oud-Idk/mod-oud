import { JSX } from "react";
import { Database, HardDrive, Cpu, Radio } from "lucide-react";
import { Card } from "./Card";
import { TelemetryReport } from "@/features/overview/types";
import Emphasis from "@/components/layout/Emphasis";

interface TelemetryCardsProps {
    telemetry: TelemetryReport | null;
}

export function TelemetryCards({ telemetry }: TelemetryCardsProps): JSX.Element | null {
    if (telemetry === null) {
        return null;
    }

    const dbLatency = telemetry.database.latency_ms !== null && telemetry.database.latency_ms !== undefined
        ? `${telemetry.database.latency_ms.toFixed(2)}ms`
        : "Failed";

    const redisLatency = telemetry.redis.latency_ms !== null && telemetry.redis.latency_ms !== undefined
        ? `${telemetry.redis.latency_ms.toFixed(2)}ms`
        : "Failed";

    const shardMem = telemetry.memory.bot_mb !== null && telemetry.memory.bot_mb !== undefined
        ? `${telemetry.memory.bot_mb.toFixed(2)} MB`
        : "Unknown";

    const mlMem = telemetry.memory.ml_mb !== null && telemetry.memory.ml_mb !== undefined
        ? `${telemetry.memory.ml_mb.toFixed(2)} MB`
        : "Offline";

    return (
        <div className="space-y-2">
            <Emphasis>System Telemetry</Emphasis>
            <div className="grid gap-4 md:grid-cols-4">
                <Card
                    icon={<Database className={telemetry.database.healthy ? "text-success" : "text-danger"} />}
                    title="PostgreSQL"
                    main={telemetry.database.healthy ? "Healthy" : "Unhealthy"}
                    footer={`Query Latency: ${dbLatency}`}
                />
                <Card
                    icon={<HardDrive className={telemetry.redis.healthy ? "text-success" : "text-danger"} />}
                    title="Redis Cache"
                    main={telemetry.redis.healthy ? "Healthy" : "Unhealthy"}
                    footer={`Ping Latency: ${redisLatency}`}
                />
                <Card
                    icon={<Cpu />}
                    title="Process Memory"
                    main={shardMem}
                    footer={`ML Model: ${mlMem}`}
                />
                {telemetry.shard !== null && telemetry.shard !== undefined && (
                    <Card
                        icon={<Radio />}
                        title={`Shard #${(telemetry.shard.shard_id + 1).toString()}/${telemetry.shard.total_shards.toString()}`}
                        main={telemetry.shard.gateway_latency_ms !== null && telemetry.shard.gateway_latency_ms !== undefined ? `${telemetry.shard.gateway_latency_ms.toString()}ms` : "Connecting"}
                        footer="Gateway Heartbeat"
                    />
                )}
            </div>
        </div>
    );
}
