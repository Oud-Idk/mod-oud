import { VerificationFeature } from "@/features/verification";

export default async function VerifyPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    return <VerificationFeature searchParams={params} />;
}