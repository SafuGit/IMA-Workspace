import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { DbCredentials } from "./types";

export interface SessionData {
  db?: DbCredentials;
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD || "fylint_agency_super_secret_session_key_min_32_chars_long_12345",
  cookieName: "fylint_db_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
