import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { accountsConfigured } from "@/lib/auth-config";

export default accountsConfigured()
  ? clerkMiddleware()
  : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
