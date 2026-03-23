export const ACCESS_TOKEN_COOKIE = "talia.access_token";
export const REFRESH_TOKEN_COOKIE = "talia.refresh_token";
export const SESSION_REMEMBER_COOKIE = "talia.remember";

export const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
