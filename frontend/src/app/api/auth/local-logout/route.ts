import { NextResponse } from "next/server";

import { authCookieNames } from "@/lib/auth/auth-routes";

export async function POST() {
  const response = NextResponse.json({
    message: "Session locale supprimee.",
  });

  authCookieNames.forEach((name) => {
    response.cookies.set(name, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  });

  return response;
}
