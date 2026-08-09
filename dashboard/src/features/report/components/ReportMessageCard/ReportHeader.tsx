"use client";

import { JSX } from "react";

interface ReportHeaderProps {
    id: number;
    status?: string;
    userWarned?: boolean;
    userTimedOut?: boolean;
    userBanned?: boolean;
}

export function ReportHeader({
    id,
    status = "UNDER_REVIEW",
    userWarned,
    userTimedOut,
    userBanned,
}: ReportHeaderProps): JSX.Element {
    const isActioned = status === "ACTIONED";

    return (
        <div>
            <div className="flex justify-between items-start m-0">
                <div className="flex flex-col gap-1">
                    <span className="font-semibold text-lg leading-tight">Report ID: #{id}</span>
                </div>

                <span
                    className={`px-2 py-0.5 rounded text-sm uppercase ${
                        status === "UNDER_REVIEW"
                            ? ""
                            : isActioned
                                ? "text-emerald-500"
                                : "text-neutral-500"
                    }`}
                >
                    {status.replace("_", " ")}
                </span>
            </div>

            {(userWarned || userTimedOut || userBanned) && (
                <div className="flex flex-wrap space-x-2 my-1">
                    {userBanned && (
                        <span className="py-0.5 px-1.5 text-sm border rounded border-red-500 text-red-500">
                            Banned
                        </span>
                    )}
                    {userTimedOut && (
                        <span className="py-0.5 px-1.5 text-sm border rounded border-orange-500 text-orange-500">
                            Timed Out
                        </span>
                    )}
                    {userWarned && (
                        <span className="py-0.5 px-1.5 text-sm border rounded border-yellow-500 text-yellow-500">
                            Warned
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}