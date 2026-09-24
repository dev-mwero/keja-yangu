const DEV_FALLBACK_SECRET = "dev-secret";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is not set");
  }
  return DEV_FALLBACK_SECRET;
}
