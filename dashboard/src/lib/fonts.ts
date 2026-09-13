import { Inter, JetBrains_Mono, Noto_Color_Emoji } from "next/font/google";

export const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});
export const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});
export const notoEmoji = Noto_Color_Emoji({
    weight: '400',
    subsets: ['emoji'],
    variable: '--font-noto-emoji',
});