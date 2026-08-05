'use client';

import dynamic from 'next/dynamic';

const VerifyForm = dynamic(() => import('@/features/verification/components/VerifyForm'), {
    ssr: false,
    loading: () => (
        <div className="bg-neutral-300/10 p-8 rounded-lg text-center max-w-sm w-full shadow-lg border">
            <p>Loading verification…</p>
        </div>
    ),
});

export default VerifyForm;