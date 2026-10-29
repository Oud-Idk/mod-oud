import { JSX } from "react";
import Link from "next/link";
import { FeatureMatrixCategory } from "../../types";
import { CheckCircle2, CircleDashed, ChevronRight } from "lucide-react";
import Emphasis from "@/components/layout/Emphasis";
import Footer from "@/components/layout/Footer";

interface FeatureStatusMatrixProps {
    categories: FeatureMatrixCategory[];
}

export function FeatureStatusMatrix({ categories }: FeatureStatusMatrixProps): JSX.Element | null {
    if (categories.length === 0) {
        return null;
    }

    const totalFeatures = categories.reduce((acc, cat) => acc + cat.features.length, 0);
    const activeFeatures = categories.reduce(
        (acc, cat) => acc + cat.features.filter((f) => f.enabled).length,
        0
    );

    return (
        <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                    <Emphasis>Active Features & Modules</Emphasis>
                    <Footer>
                        Live status of bot automation, protections, and engagement systems for this server.
                    </Footer>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-link border border-link/20">
                        {activeFeatures.toString()} / {totalFeatures.toString()} Active
                    </span>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {categories.map((category) => (
                    <div
                        key={category.title}
                        className="rounded-xl border border-border bg-surface/50 p-4 space-y-3"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">
                                {category.title}
                            </h3>
                            <span className="text-xs text-muted-foreground font-mono">
                                {category.features.filter((f) => f.enabled).length.toString()}/{category.features.length.toString()}
                            </span>
                        </div>

                        <div className="grid gap-2">
                            {category.features.map((feature) => (
                                <Link
                                    key={feature.id}
                                    href={feature.href}
                                    className="group flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-background/50 hover:bg-surface hover:border-border transition-colors duration-150"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {feature.enabled ? (
                                            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                                        ) : (
                                            <CircleDashed className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-foreground group-hover:text-brand transition-colors truncate">
                                                    {feature.name}
                                                </span>
                                            </div>
                                            <Footer>
                                                {feature.description}
                                            </Footer>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        <span
                                            className={`text-sm px-2 py-0.5 rounded-full tracking-wider ${
                                                feature.enabled
                                                    ? "text-success"
                                                    : "text-muted-foreground"
                                            }`}
                                        >
                                            {feature.enabled ? "Active" : "Off"}
                                        </span>
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
