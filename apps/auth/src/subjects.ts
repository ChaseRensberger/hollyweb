import { createSubjects } from "@openauthjs/openauth/subject";
import { z } from "zod";

// This contract is safe to import in other servers. It imports no auth database or secrets.
export const subjects = createSubjects({
  user: z.object({ userID: z.string(), name: z.string(), email: z.string() }),
});
