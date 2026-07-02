import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/server-user";
import { uploadObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB (stays under serverless body limit)

const IMAGE = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IMAGE_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const OFFICE = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];
const OFFICE_EXT = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
};
const RULES: Record<string, { mimes: string[]; ext: Record<string, string> }> = {
  avatar: { mimes: IMAGE, ext: IMAGE_EXT },
  logo: { mimes: IMAGE, ext: IMAGE_EXT },
  cover: { mimes: IMAGE, ext: IMAGE_EXT },
  template: { mimes: OFFICE, ext: OFFICE_EXT },
  doc: { mimes: [...IMAGE, ...OFFICE], ext: { ...IMAGE_EXT, ...OFFICE_EXT } },
};

const slug = () => Math.random().toString(36).slice(2, 10);

export async function POST(req: Request) {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured) return NextResponse.json({ error: "Uploads are not configured yet." }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid upload" }, { status: 400 }); }

  const file = form.get("file");
  const kind = String(form.get("kind") || "doc");
  const rule = RULES[kind] ?? RULES.doc;

  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!rule.mimes.includes(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 4MB)" }, { status: 400 });

  const ext = rule.ext[file.type] ?? "bin";
  const key = `${kind}/${uid}/${Date.now()}-${slug()}.${ext}`;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const url = await uploadObject(key, buf, file.type);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
