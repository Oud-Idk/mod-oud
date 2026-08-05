import { ReactNode } from "react";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface EmbedSectionProps {
    title: string;
    defaultOpen?: boolean;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function Section({
    title,
    defaultOpen = false,
    action,
    children,
    className,
}: EmbedSectionProps) {
    return (
        <Disclosure
            as="div"
            defaultOpen={defaultOpen}
            className={cn("border border-border rounded-lg bg-surface transition-colors", className)}
        >
            {({ open }) => (
                <>
                    <div className={`flex items-center justify-between bg-surface-muted ${open ? 'rounded-t-lg' : 'rounded-lg'}`}>
                        <DisclosureButton className={`w-full flex items-center justify-between p-3 text-foreground text-sm font-semibold text-left hover:bg-surface-active transition-colors focus-ring ring-inset group cursor-pointer ${open ? 'rounded-t-lg' : 'rounded-lg'}`}>
                            <span>{title}</span>
                            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-open:rotate-180" />
                        </DisclosureButton>

                        {/* Separate action button outside DisclosureButton to prevent accidental toggles */}
                        {action && <div className="pr-3 shrink-0">{action}</div>}
                    </div>

                    {/* static keeps it mounted so we can drive the animation ourselves */}
                    <DisclosurePanel
                        static
                        aria-hidden={!open}
                        inert={!open ? true : undefined}
                        className={cn(
                            "grid transition-[grid-template-rows] duration-200 ease-out",
                            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        )}
                    >
                        <div className="overflow-hidden">
                            <div className="p-4 pt-0 space-y-4 border-t border-border">
                                {children}
                            </div>
                        </div>
                    </DisclosurePanel>
                </>
            )}
        </Disclosure>
    );
}