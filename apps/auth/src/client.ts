import type { createClient } from "@openauthjs/openauth/client";
import { subjects } from "./subjects";

export async function verifyUser(
  client: ReturnType<typeof createClient>,
  access: string,
  audience: string,
  refresh?: string,
) {
  const result = await client.verify(subjects, access, { refresh });
  if (result.err) return result;
  // OpenAuth 0.4.3 returns the verified aud claim but ignores VerifyOptions.audience.
  if (result.aud !== audience)
    return { err: new Error("This token was issued for a different app.") };
  return result;
}
