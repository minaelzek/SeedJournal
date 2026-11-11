import { devAuthAllowedForRequest } from "@/lib/auth/dev-auth";
import { appleClientId, googleClientId } from "@/lib/auth/social";
import { apiJson, withApi } from "../../_shared/http";

export const GET = withApi(async (request: Request) => {
  const google = googleClientId();
  const apple = appleClientId();
  return apiJson({
    google: google
      ? { enabled: true, clientId: google }
      : { enabled: false },
    apple: apple
      ? { enabled: true, clientId: apple }
      : { enabled: false },
    localGarden: devAuthAllowedForRequest(request),
  });
});
