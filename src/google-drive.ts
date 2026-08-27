import { Readable } from "node:stream";
import { auth, drive } from "@googleapis/drive";
import { env } from "./env";

export function getDriveClient() {
  const oauth2Client = new auth.OAuth2(
    env.googleSheetsClientId,
    env.googleSheetsClientSecret
  );
  oauth2Client.setCredentials({ refresh_token: env.googleSheetsRefreshToken });

  return drive({ version: "v3", auth: oauth2Client });
}

export async function uploadDocxToDrive(
  buffer: Buffer,
  fileName: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = getDriveClient();

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [env.googleDriveFolderId],
    },
    media: {
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });

  if (!res.data.id || !res.data.webViewLink) {
    throw new Error("Drive upload succeeded but response is missing id/webViewLink");
  }

  return { id: res.data.id, webViewLink: res.data.webViewLink };
}
