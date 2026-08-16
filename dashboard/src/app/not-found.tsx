import { JSX } from "react";
import Emphasis from "@/components/layout/Emphasis";
import { BananaIcon } from "lucide-react";
import Footer from "@/components/layout/Footer";
import Link from "next/link";

export default function NotFound(): JSX.Element {
    return <div className="rounded-xl min-w-60 min-h-100 max-w-150 w-2/3 bg-surface absolute top-1/2 left-1/2 -translate-1/2 border border-border p-6 flex flex-col items-center justify-center gap-2 text-center">
        <Emphasis className="text-2xl sm:text-4xl font-bold">Mod Oud</Emphasis>
        <Emphasis className="text-lg sm:text-2xl">Oops! Hello there, lost traveler.</Emphasis>
        <p className="text-sm sm:text-base">Seems like you ended up in a page that doesn&apos;t exist! Here, have this banana</p>
        <div>
            <BananaIcon className="w-24 h-24 text-yellow-500"/>
            <Footer>Nom nom nom!</Footer>
        </div>
        <div className="flex flex-col gap-2 text-center">
            <Link href="/public" className="p-2 px-4 border border-brand rounded-xl text-brand">Go Back to Home Page</Link>
            <Link
                href="/very-secret-endpoint-do-not-index-also-timestamp-today-1786548272"
                className="p-2 px-4 border border-pink-500 rounded-xl text-pink-500">
                Or if you&apos;re lonely, Go Here!
            </Link>
        </div>
    </div>
}