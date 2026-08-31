'use client';

import React, { JSX, useRef, useState } from 'react';
import Turnstile from "react-turnstile";
import Emphasis from "@/components/layout/Emphasis";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { Session } from "next-auth";
import Image from "next/image";
import { CaptchaType } from "@/features/welcome/types";
import { Button } from "@/components/ui/inputs/Button";

interface VerifyFormProps {
    userId: string;
    guildId: string;
    expires: string;
    sig: string;
    session: Session | null;
    captchaType: CaptchaType;
    useOauth?: boolean;
}

export default function VerifyForm({ userId, guildId, expires, sig, session, captchaType, useOauth }: VerifyFormProps): JSX.Element {
    const [status, setStatus] = useState<'IDLE' | 'VERIFYING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [message, setMessage] = useState('');
    const [token, setToken] = useState<string | null>(null);
    const captchaRef = useRef<HCaptcha>(null);

    const handleSubmit = async (e: React.SyntheticEvent): Promise<void> => {
        e.preventDefault();

        if (
            token === null ||
            token === '' ||
            userId === '' ||
            guildId === '' ||
            expires === '' ||
            sig === ''
        ) {
            setStatus('ERROR');
            setMessage('Missing verification parameters. Did you come from Discord?');
            return;
        }

        setStatus('VERIFYING');

        try {
            const res = await fetch('http://localhost:8080/api/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id_str: userId,
                    guild_id_str: guildId,
                    expires: parseInt(expires, 10),
                    sig,
                    captcha_token: token,
                    captcha_type: captchaType,
                    access_token: session?.accessToken ?? null,
                }),
            });

            if (res.ok) {
                setStatus('SUCCESS');
                setMessage("Success! You've been verified. You can head back to Discord now.");
            } else {
                const errText = await res.text();
                setStatus('ERROR');
                setMessage(`Verification failed: ${errText}`);
            }
        } catch {
            setStatus('ERROR');
            setMessage('Could not connect to the verification server.');
        }
    };

    const user = session?.user;
    const userName = user?.name ?? null;
    const userImage = user?.image ?? null;
    const shouldShowUser =
        useOauth === true &&
        userName !== null &&
        userName !== "" &&
        userImage !== null &&
        userImage !== "";

    return (
        <div className="bg-surface p-8 rounded-lg text-center max-w-sm w-full shadow-lg border border-border">
            <Emphasis className="text-xl font-bold">Prove You&apos;re Human</Emphasis>
            <p className="my-2">A quick check to prove that you&apos;re a human and not a clanker.</p>
            {shouldShowUser && (
                <div className="flex flex-row items-center justify-center mb-4 gap-2 rounded-full">
                    <Image src={userImage} alt="Profile Picture" width={32} height={32}/>
                    <p>Logged in as {userName}</p>
                </div>
            )}

            <div className="flex justify-center mb-4 min-h-20">
                {captchaType === 'HCAPTCHA' ? (
                    <HCaptcha
                        ref={captchaRef}
                        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? ""}
                        onVerify={(t) => {
                            setToken(t);
                        }}
                        onExpire={() => {
                            setToken(null);
                        }}
                        onError={(err) => {
                            console.error("hCaptcha error:", err);
                            setToken(null);
                        }}
                    />
                ) : (
                    <Turnstile
                        sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
                        onSuccess={(t) => { setToken(t); }}
                        onExpire={() => { setToken(null); }}
                    />
                )}
            </div>

            <Button
                onClick={handleSubmit}
                disabled={token === null || token === '' || status === 'VERIFYING' || status === 'SUCCESS'}
                className="w-full"
            >
                {status === 'VERIFYING' ? 'Verifying...' : 'Verify Me'}
            </Button>

            {message !== '' && (
                <p className={`mt-4 text-sm font-semibold ${status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'}`}>
                    {message}
                </p>
            )}
        </div>
    );
}