import React, { JSX } from "react";
import { Button as HeadlessButton } from "@headlessui/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
    [
        "inline-flex items-center justify-center transition border cursor-pointer font-medium select-none focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "hover:bg-surface-muted/60",
        "disabled:border-surface-muted disabled:text-surface-muted disabled:cursor-not-allowed",
    ],
    {
        variants: {
            variant: {
                primary: "border-brand text-brand",
                secondary: "border-border text-foreground",
                danger: "border-danger text-danger focus-ring-danger",
            },
            size: {
                sm: "px-2.5 py-1 text-xs rounded-sm",
                md: "px-3.5 py-1.5 text-sm rounded-md",
                lg: "px-4.5 py-2 text-base rounded-lg",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "md",
        },
    }
);

export interface ButtonProps
    extends React.ComponentPropsWithoutRef<typeof HeadlessButton>,
        VariantProps<typeof buttonVariants> {}

export function Button({ variant, size, className, children, ...props }: ButtonProps): JSX.Element {
    return (
        <HeadlessButton
            className={cn(buttonVariants({ variant, size }), className)}
            {...props}
        >
            {children}
        </HeadlessButton>
    );
}