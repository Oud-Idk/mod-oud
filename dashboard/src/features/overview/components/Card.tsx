import { ReactNode } from "react";

type CardProps = {
    icon: ReactNode;
    title: string;
    main: string;
    footer?: string;
}

export function Card({ icon, title, main, footer }: CardProps) {
    return <div
        className="p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center gap-4"
    >
        <div
            className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-300"
        >
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</p>
            <h3 className="text-2xl font-bold">
                {main}
            </h3>
            {footer && (
                <p className="text-xs text-neutral-400 mt-0.5">
                    {footer}
                </p>
            )}
        </div>
    </div>
}