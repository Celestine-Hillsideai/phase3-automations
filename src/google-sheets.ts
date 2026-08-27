import { google } from "googleapis";
import { env } from "./env";

export function getSheetsClient() {
  const auth = new google.auth.OAuth2(
    env.googleSheetsClientId,
    env.googleSheetsClientSecret
  );
  auth.setCredentials({ refresh_token: env.googleSheetsRefreshToken });

  return google.sheets({ version: "v4", auth });
}
