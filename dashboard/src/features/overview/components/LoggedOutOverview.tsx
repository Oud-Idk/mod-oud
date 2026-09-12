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
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "left",
    },
    {
        src: "/logging.png",
        alt: "Log feature showcase",
        width: 2000,
        height: 1000,
        title: "All Hail Observability",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "right",
        textAlign: "right",
    },
    {
        src: "/message-logging.png",
        alt: "Message logging feature showcase",
        width: 1500,
        height: 1500,
        title: "Easy Message Logging",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "left",
    },
    {
        src: "/economy.png",
        alt: "Economy feature showcase",
        width: 2000,
        height: 1000,
        title: "Economy & Entertainment",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "right",
        textAlign: "right",
    },
    {
        src: "/verification.png",
        alt: "Verification feature showcase",
        width: 2000,
        height: 1000,
        title: "Easy CAPTCHA system",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "left",
    },
    {
        src: "/welcome.png",
        alt: "Welcome feature showcase",
        width: 2000,
        height: 1000,
        title: "Customizable Welcome & Goodbye Messages",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "right",
        textAlign: "right",
    },
    {
        src: "/music.png",
        alt: "Music feature showcase",
        width: 2000,
        height: 1000,
        title: "Intuitive Music",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "left",

    },
    {
        src: "/giveaway.png",
        alt: "Giveaway feature showcase",
        width: 2000,
        height: 1000,
        title: "Fun Giveaways",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "right",
        textAlign: "right",
    },
    {
        src: "/leveling.png",
        alt: "Leveling feature showcase",
        width: 2000,
        height: 1000,
        title: "Interactive Leveling",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "left",
    },
    {
        src: "/moderation-dm.png",
        alt: "Moderation DM feature showcase",
        width: 2000,
        height: 1000,
        title: "Customizable Messages (due for renaming)",
        description: "Literally all moderation messages can be customized. Useful if your server is furry-focused. Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus ad aliquam aliquid blanditiis consequatur corporis dignissimos doloribus, eveniet expedita itaque molestiae natus odio, quam quas sequi tempora tempore totam voluptates.",
        imagePosition: "right",
        textAlign: "right",
    },
];

function FeatureSpotlightRow({ src, alt, width, height, title, description, imagePosition, textAlign = "left" }: FeatureSpotlight): JSX.Element {
    const alignRight = textAlign === "right";
    const image = <Image src={src} alt={alt} width={width} height={height} className="w-1/2 shrink-0 rounded-xl" />;
    const copy = <div className="self-center shrink">
        <Emphasis className={`font-bold text-xl${alignRight ? " text-right" : ""}`}>{title}</Emphasis>
        <p className={alignRight ? "text-right" : undefined}>{description}</p>
    </div>;

    return <div className="w-full flex px-12 gap-6">
        {imagePosition === "left" ? <>{image}{copy}</> : <>{copy}{image}</>}
    </div>;
}

export function LoggedOutOverview(): JSX.Element {
    return <div className="flex-1 min-h-full flex flex-col items-center gap-0 w-full">
        <LoggedOutHero />

        <div className="space-y-8 w-full my-8 py-8 max-w-450 px-32 border-b border-t border-border">
            <div className="w-full flex flex-row justify-center gap-8 items-center">
                <Crab className="w-48 shrink-0"/>
                <div>
                    <Emphasis className={`font-bold text-3xl`}>Written in Rust</Emphasis>
                    <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Aut rerum totam voluptatibus! A, animi dolores, enim eos esse laborum magni maiores minima quaerat quasi quidem ratione sequi ullam unde voluptatem.</p>
                </div>
            </div>
            <div className="w-full flex flex-row justify-center gap-8 items-center">
                <GplV3Logo className="w-48 h-auto shrink-0" />
                <div>
                    <Emphasis className={`font-bold text-3xl`}>Open Source</Emphasis>
                    <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusamus accusantium aspernatur, eos et exercitationem inventore minus molestias nobis nostrum odio officiis placeat qui, quibusdam quidem quisquam reprehenderit sed ullam unde.</p>
                </div>
            </div>
            <div>
                <div className="w-full flex flex-row justify-center gap-8 items-center">
                    <Emphasis className={`font-bold text-3xl shrink-0`}>Free, Without Funds, Forever</Emphasis>
                    <p>I could start charging subscriptions (SaaS) like a certain Discord bot with a cyan circle for a mascot that I shall not name, but since I believe in free software, it will remain free. I&apos;m also aiming for close feature parity.</p>
                </div>
            </div>
        </div>

        <div className="space-y-32 w-full mt-4 max-w-450">
            {FEATURE_SPOTLIGHTS.map((spotlight) => (
                <FeatureSpotlightRow key={spotlight.src} {...spotlight} />
            ))}
        </div>
        <div className="w-full py-10 mt-10 flex justify-center bg-surface">
            <div className="flex max-w-7xl w-full justify-between">
                <div>
                    <Logo className="w-24 h-24 mb-6" />
                    <p>Blazingly fast Discord moderation</p>
                    <Link href="https://github.com/Oud-Idk/mod-oud"><GithubLogo className="mt-4"/></Link>
                </div>
                <div className="flex flex-row gap-8">
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