import { JSX} from "react";
import Footer from "@/components/layout/Footer";

interface CardProps {
    icon: JSX.Element;
    title: string;
    main: string;
    footer?: string;
}

export function Card({ icon, title, main, footer }: CardProps): JSX.Element {
    return <div
        className="p-4 py-3 rounded-lg border border-border bg-surface flex items-center gap-4"
    >
        <div
            className="p-1"
        >
            {icon}
        </div>
        <div>
            <p className="text-sm">{title}</p>
            <h3 className="text-2xl font-bold">
                {main}
            </h3>
            {footer !== undefined && (
                <Footer>{footer}</Footer>
            )}
        </div>
    </div>
}