import { NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getCurrentUserId } from "@/lib/server-user";
import { r2Configured, publicUrl, r2Config } from "@/lib/r2";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB ceiling for direct uploads
const IMAGE = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const OFFICE = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "application/zip",
];
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/csv": "csv", "application/zip": "zip",
};
// Litch upload kinds: client financial documents, blog covers, downloadable
// templates, and profile/brand images.
const RULES: Record<string, string[]> = {
  avatar: IMAGE,
  logo: IMAGE,
  cover: IMAGE,
  template: OFFICE,
  doc: [...IMAGE, ...OFFICE],
};
const slug = () => Math.random().toString(36).slice(2, 10);

export async function POST(req: Request) {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured) return NextResponse.json({ error: "Uploads are not configured yet." }, { status: 503 });

  const { kind = "doc", contentType = "", size = 0 } = await req.json().catch(() => ({}));
  const allowed = RULES[kind] ?? RULES.doc;
  if (!allowed.includes(contentType)) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  if (typeof size === "number" && size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 400 });

  const key = `${kind}/${uid}/${Date.now()}-${slug()}.${EXT[contentType] ?? "bin"}`;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2Config.accessKeyId!, secretAccessKey: r2Config.secretAccessKey! },
  });
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: r2Config.bucket!, Key: key, ContentType: contentType }),
    { expiresIn: 60 },
  );
  return NextResponse.json({ uploadUrl, publicUrl: publicUrl(key), key });
}
