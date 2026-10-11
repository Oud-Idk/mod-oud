import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Authenticated visitors get the server list, which needs the session and
// per-request Discord data. Everyone else gets the static landing page.
export default auth((req) => {
    if (req.auth !== null) {
        return NextResponse.redirect(new URL("/servers", req.nextUrl));
    }
    return NextResponse.next();
});

export const config = {
    matcher: ["/"],
};
