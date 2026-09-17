import { JSX } from "react";
import Logo from "@/components/ui/icons/Logo";
import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/inputs/Button";
import Image from "next/image";
import Emphasis from "@/components/layout/Emphasis";
import { Crab } from "@/features/overview/components/Crab";
import GplV3Logo from "@/components/ui/icons/GplV3Logo";
import Link from "next/link";
import GithubLogo from "@/components/ui/icons/GithubLogo";

function HeroBackground(): JSX.Element {
    return <>
        <div
            className="absolute inset-0 bg-size-[20px_20px] pointer-events-none -z-10 mask-[linear-gradient(to_bottom,#000_60%,transparent_100%)]"
            style={{
                backgroundImage: `
                    linear-gradient(to right, var(--border-subtle) 1px, transparent 1px),
                    linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px)
                `,
            }}
        />
        <div className="dark:block hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[47.5vh] h-[47.5vh] max-w-200 max-h-200 bg-brand/20 blur-[120px] rounded-full pointer-events-none -z-10" />
    </>;
}

function SignInWithDiscord(): JSX.Element {
    return <form
        action={async () => {
            "use server";
            await signIn("discord");
        }}
    >
        <Button
            type="submit"
            className="text-xl hover:bg-brand/10"
        >
            Sign in with Discord
        </Button>
    </form>;
}

function LoggedOutHero(): JSX.Element {
    return <div className="relative w-full flex flex-col items-center justify-center min-h-[75vh] py-16 px-4 text-center overflow-hidden">
        <HeroBackground />
        <div className="relative mb-3 flex items-center justify-center">
            <Logo className="w-20 h-20 relative" />
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
            Mod Oud
        </h1>

        <p className="mt-3 text-lg sm:text-xl max-w-lg leading-relaxed">
            Blazingly fast Discord moderation, questionable gambling choices, and zero headaches for your community.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <SignInWithDiscord />
        </div>
    </div>;
}

interface FeatureSpotlight {
    src: string;
    alt: string;
    width: number;
    height: number;
    title: string;
    description: string;
    imagePosition: "left" | "right";
    textAlign?: "left" | "right";
}

const FEATURE_SPOTLIGHTS: FeatureSpotlight[] = [
    {
        src: "/bad-word.png",
        alt: "Bad word feature showcase",
        width: 2000,
        height: 1000,
        title: "Powerful Moderation Features",
        description: "Sleep peacefully knowing Mod Oud is on watch. It auto-filters slurs with an Aho-Corasick automaton (yes, the string-matching algorithm, not the bug), nukes crypto wallet addresses before the shill army arrives, and zaps zalgo text back to the abyss where it came from. Sketchy links, server invites, excessive caps, emoji floods, and spoiler spam, all handled before your morning coffee gets cold.",
        imagePosition: "left",
    },
    {
        src: "/logging.png",
        alt: "Log feature showcase",
        width: 2000,
        height: 1000,
        title: "All Hail Observability",
        description: "Ever wished you had a time machine to see who banned your favorite member without digging through the audit logs? The logging forwards all relevant events to one place (including any slash commands), so you can trace every moderation events with ease.",
        imagePosition: "right",
        textAlign: "right",
    },
    {
        src: "/message-logging.png",
        alt: "Message logging feature showcase",
        width: 1500,
        height: 1500,
        title: "Easy Message Logging",
        description: "Someone ninja-edited their message from 'I am gay' to 'I am straight'. Or did they ninja-delete 'I am a furry'? Not on Mod Oud's watch. Every ghost-deleted message and suspicious edit is logged with crystal-clear audit trails, so nothing slips through before it disappears.",
        imagePosition: "left",
    },
    {
        src: "/economy.png",
        alt: "Economy feature showcase",
        width: 2000,
        height: 1000,
        title: "Economy & Entertainment",
        description: "Let your members work a 9-to-5 shift, rob their friends (and get fined when they fail), buy questionable items from the shop, and gamble their entire fake life savings on slots, roulette, coinflip, and blackjack. It's a full-blown virtual economy inspired by UnbelievaBoat, except it's free and you can actually read the source code when RNG feels personal. You can have my word on this one, and that it's cryptographically secure.",
        imagePosition: "right",
        textAlign: "right",
    },
    {
        src: "/verification.png",
        alt: "Verification feature showcase",
        width: 2000,
        height: 1000,
        title: "Easy CAPTCHA system",
        description: "Tired of sketchy bots sliding into your DMs to shill their totally-not-a-scam crypto? Set up your own velvet rope. Pick Cloudflare Turnstile for a silent, privacy-respecting gate, or hCaptcha if you want the classic 'click the crosswalk' experience. Toggle OAuth-only mode, decide your paranoia level, and let real humans in while bots get stuck in an infinite captcha loop.",
        imagePosition: "left",
    },
    {
        src: "/welcome.png",
        alt: "Welcome feature showcase",
        width: 2000,
        height: 1000,
        title: "Customizable Welcome & Goodbye Messages",
        description: "Greet newcomers with a beautifully rendered welcome card. An SVG template you can recolor to match your server's vibe, showing their avatar, username, and member count. Same energy for goodbye messages when someone decides to leave your server for that other one with the cooler emoji. Because first impressions matter, and last impressions are just awkward.",
        imagePosition: "right",
        textAlign: "right",
    },
    {
        src: "/music.png",
        alt: "Music feature showcase",
        width: 2000,
        height: 1000,
        title: "Intuitive Music",
        description: "Queue up YouTube tracks or Spotify jams and control playback from the dashboard via WebSocket. The music player runs on an actor model, because nothing says 'I've given up on writing a simple Discord bot' like implementing concurrency patterns from a 1973 paper. Pause, resume, skip, seek, and watch the now-playing card update in real time.",
        imagePosition: "left",
    },
    {
        src: "/giveaway.png",
        alt: "Giveaway feature showcase",
        width: 2000,
        height: 1000,
        title: "Fun Giveaways",
        description: "Host a giveaway, set a prize, pick the winner count, and let people smash that enter button with the enthusiasm of someone who definitely isn't alt-accounting. When the timer runs out, Mod Oud randomly picks winners and announces them so you don't have to deal with the 'why didn't I win' DMs.",
        imagePosition: "right",
        textAlign: "right",
    },
    {
        src: "/leveling.png",
        alt: "Leveling feature showcase",
        width: 2000,
        height: 1000,
        title: "Interactive Leveling",
        description: "Reward your most active members with XP, levels, and role rewards. Earn XP in text channels or just vibe in voice channels, because talking is overrated. Though you must actually not be deafened for it to work. Customize channel and role multipliers, set a level cap, generate rank cards on SVG, and watch your members compete for that #1 spot like their life depends on it.",
        imagePosition: "left",
    },
    {
        src: "/moderation-dm.png",
        alt: "Moderation DM feature showcase",
        width: 2000,
        height: 1000,
        title: "Customizable Messages",
        description: "Literally all moderation messages can be customized, like ban DMs, mute notifications, kick reasons, warning thresholds, softban announcements. Useful if your server is... furry-focused, bilingual, or just has a very specific vibe that 'You have been banned' doesn't capture. Because nothing says 'professionalism' like an uwu message before a 7-day timeout.",
        imagePosition: "right",
        textAlign: "right",
    },
];

function FeatureSpotlightRow({ src, alt, width, height, title, description, imagePosition, textAlign = "left" }: FeatureSpotlight): JSX.Element {
    const alignRight = textAlign === "right";

    return <div className={`w-full flex flex-col md:flex-row px-4 md:px-12 gap-6 items-center ${
        imagePosition === "right" ? "md:flex-row-reverse" : ""
    }`}>
        <Image src={src} alt={alt} width={width} height={height} className="w-full md:w-1/2 shrink-0 rounded-xl" />
        <div className="self-center shrink">
            <Emphasis className={`font-bold text-xl${alignRight ? " text-right" : ""}`}>{title}</Emphasis>
            <p className={alignRight ? "text-right" : undefined}>{description}</p>
        </div>
    </div>
}

export function LoggedOutOverview(): JSX.Element {
    return <div className="flex-1 min-h-full flex flex-col items-center gap-0 w-full">
        <LoggedOutHero />

        <div className="space-y-12 md:space-y-8 w-full my-8 py-8 max-w-450 px-6 md:px-32 border-b border-t border-border">

            <div className="w-full flex flex-col md:flex-row justify-center gap-6 md:gap-8 items-center text-center md:text-left">
                <Crab className="w-36 md:w-48 shrink-0" />
                <div>
                    <Emphasis className="font-bold text-3xl">Written in Rust</Emphasis>
                    <p className="mt-2 text-muted-foreground">
                        Mod Oud is built in Rust, the language that taught us the meaning of suffering, in a good way. Zero-cost abstractions, fearless concurrency, and a borrow checker that yells at you until your code is technically immortal. It&apos;s fast enough to handle your server&apos;s chaos and reliable enough to run for weeks without someone SSH-ing in to restart it.
                    </p>
                </div>
            </div>

            <div className="w-full flex flex-col md:flex-row justify-center gap-6 md:gap-8 items-center text-center md:text-left">
                <GplV3Logo className="w-36 md:w-48 h-auto shrink-0" />
                <div>
                    <Emphasis className="font-bold text-3xl">Open Source</Emphasis>
                    <p className="mt-2 text-muted-foreground">
                        Licensed GPL-3.0, because your moderation bot shouldn&apos;t be a black box. Fork it, audit it, self-host it, contribute that one feature you&apos;ve been complaining about on Discord for six months. The entire codebase is on GitHub, as in the frontend, backend, SQL migrations, and the Dockerfile. No &quot;enterprise edition,&quot; no paywalled features, just you and a <code>git clone</code>.
                    </p>
                </div>
            </div>

            <div className="w-full flex flex-col md:flex-row justify-center gap-4 md:gap-8 items-center text-center md:text-left">
                <Emphasis className="font-bold text-3xl shrink-0">
                    Free, Without Funds, Forever
                </Emphasis>
                <p className="text-muted-foreground">
                    I could start charging subscriptions (SaaS) like a certain Discord bot with a cyan circle for a mascot that I shall not name, but since I believe in free software, it will remain free. I&apos;m also aiming for close feature parity.
                </p>
            </div>
        </div>

        <div className="space-y-32 w-full mt-4 max-w-450">
            {FEATURE_SPOTLIGHTS.map((spotlight) => (
                <FeatureSpotlightRow key={spotlight.src} {...spotlight} />
            ))}
        </div>

        <div className="flex flex-col items-center mt-8 space-y-4 mx-8">
            <Emphasis>What are you waiting for? Go sign up now for a blazingly fast Discord bot!</Emphasis>
            <SignInWithDiscord/>
        </div>

        <div className="w-full py-10 mt-10 flex justify-center bg-surface px-12">
            <div className="flex max-w-7xl w-full justify-between flex-col sm:flex-row items-center">
                <div className="mb-16">
                    <Logo className="w-24 h-24 mb-6" />
                    <p>Blazingly fast Discord moderation</p>
                    <Link href="https://github.com/Oud-Idk/mod-oud"><GithubLogo className="mt-4"/></Link>
                </div>
                <div className="flex flex-col lg:flex-row gap-8">
                    <div>
                        <Emphasis>Mod Oud</Emphasis>
                        <ul>
                            <li><del>Premium</del> -&gt; No Premium, Ever</li>
                            <li><del>Bot Personalizer</del> -&gt; <code>git clone</code></li>
                            <li><del>Support Portal</del> -&gt; <Link href="https://github.com/Oud-Idk/mod-oud/issues" className="hover:underline text-brand font-medium">File a GitHub Issue</Link></li>
                            <li><del>Contact Us</del> -&gt; Don&apos;t</li>
                            <li><Link href="https://discord.solartuff.co.id/very-secret-endpoint-do-not-index-also-timestamp-today-1786548272" className="hover:underline text-brand font-medium">Love.md</Link></li>
                        </ul>
                    </div>
                    <div>
                        <Emphasis><del>Company</del> Personal</Emphasis>
                        <ul>
                            <li><del>Careers [HIRING]</del> -&gt; <Link href="https://github.com/Oud-Idk/mod-oud/pulls" className="hover:underline text-brand font-medium">File a GitHub PR</Link></li>
                            <li>Terms of Use (link later)</li>
                            <li>Privacy Policy (link later)</li>
                            <li><del>Bug Bounty Program</del> -&gt; <Link href="https://github.com/Oud-Idk/mod-oud/issues" className="hover:underline text-brand font-medium">File a GitHub Issue</Link></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>;
}