'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import Turnstile from "react-turnstile";
import Emphasis from "@/components/Layout/Emphasis";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";

function VerifyForm() {
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [token, setToken] = useState<string | null>(null);

    // Grab the signature parameters from the URL
    const userId = searchParams.get('user_id');
    const guildId = searchParams.get('guild_id');
    const expires = searchParams.get('expires');
    const sig = searchParams.get('sig');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!token || !userId || !guildId || !expires || !sig) {
            setStatus('error');
            setMessage('Missing verification parameters. Did you come from Discord?');
            return;
        }

        setStatus('verifying');

        try {
            // Adjust the URL to wherever your Rust server is listening!
            const res = await fetch('http://localhost:8080/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id_str: userId,
                    guild_id_str: guildId,
                    expires: parseInt(expires),
                    sig,
                    turnstile_token: token,
                }),
            });

            if (res.ok) {
                setStatus('success');
                setMessage("Success! You've been verified. You can head back to Discord now.");
            } else {
                const errText = await res.text();
                setStatus('error');
                setMessage(`Verification failed: ${errText}`);
            }
        } catch (err) {
            setStatus('error');
            setMessage('Could not connect to the verification server.');
        }
    };

    return (
        <div
            className="bg-neutral-300/10 p-8 rounded-lg text-center max-w-sm w-full shadow-lg border">
            <Emphasis className="text-xl font-bold">Prove You're Human</Emphasis>
            <p className="my-2 mb-4">A quick check to prove that you're a human and not a clanker.</p>

            <Turnstile
                sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
                onSuccess={(token) => setToken(token)}
                onExpire={() => setToken(null)}
                onError={() => setToken(null)}
            />

            <PrimaryButton
                onClick={handleSubmit}
                disabled={!token || status === 'verifying' || status === 'success'}
                className="w-full"
            >
                {status === 'verifying' ? 'Verifying...' : 'Verify Me'}
            </PrimaryButton>

            {message && (
                <p className={`mt-4 text-sm font-semibold ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {message}
                </p>
            )}
        </div>
    );
}

// Next.js App Router requires useSearchParams to be inside a Suspense boundary
export default function VerifyPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center  p-4 text-white">
            <Suspense fallback={<div className="text-gray-400">Loading parameters...</div>}>
                <VerifyForm/>
            </Suspense>
        </main>
    );
}