import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Authenticated visitors get the server list, which needs the session and
// per-request Discord data. Everyone else gets the static landing page.
//
// The dashboard is matched here too so that an unauthenticated request never reaches a page
// that reads guild configuration. Whether the caller may manage that guild is decided in the
// dashboard layout, which holds the session needed to ask.
export default auth((req) => {
    const { pathname } = req.nextUrl;

    if (pathname.startsWith("/dashboard")) {
        if (req.auth === null) {
            return NextResponse.redirect(new URL("/", req.nextUrl));
        }
        const response = NextResponse.next();
        // Never let a shared cache answer one guild's page to another account.
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    }

    if (req.auth !== null) {
        return NextResponse.redirect(new URL("/servers", req.nextUrl));
    }
    return NextResponse.next();
});

export const config = {
    matcher: ["/", "/dashboard/:path*"],
};
