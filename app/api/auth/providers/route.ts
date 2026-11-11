import { appleClientId, googleClientId } from "@/lib/auth/social";
import { apiJson, withApi } from "../../_shared/http";

export const GET = withApi(async () => {
  const google = googleClientId();
  const apple = appleClientId();
  return apiJson({
    google: google
      ? { enabled: true, clientId: google }
      : { enabled: false },
    apple: apple
      ? { enabled: true, clientId: apple }
      : { enabled: false },
    localGarden: process.env.NODE_ENV !== "production",
  });
});
