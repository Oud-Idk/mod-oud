import { VerificationFeature } from "@/features/verification";
import { JSX } from "react";

export default async function VerifyPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
    const params = await searchParams;
    return <VerificationFeature searchParams={params} />;
}