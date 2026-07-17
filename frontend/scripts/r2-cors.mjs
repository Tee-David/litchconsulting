/**
 * Apply + verify CORS on the Litch R2 buckets so browser presigned PUT/GET work.
 * Run: node --env-file=.env.local scripts/r2-cors.mjs
 *
 * Litch scope ONLY — touches R2_BUCKET_NAME (public) and R2_PRIVATE_BUCKET
 * (private) and no other bucket on the account.
 */
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;
const publicBucket = process.env.R2_BUCKET_NAME;
const privateBucket = process.env.R2_PRIVATE_BUCKET;

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error("Missing R2 credentials");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const AllowedOrigins = [
  "https://www.litchconsulting.com",
  "https://litchconsulting.com",
  "http://localhost:3000",
];

const CORSRules = [
  {
    AllowedOrigins,
    AllowedMethods: ["GET", "PUT", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  },
];

async function apply(bucket, label) {
  if (!bucket) {
    console.log(`  – skip ${label} (bucket env unset)`);
    return;
  }
  await s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules } }));
  const got = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
  const rule = got.CORSRules?.[0];
  console.log(`  ✓ ${label} (${bucket}) — origins: ${rule?.AllowedOrigins?.join(", ")} | methods: ${rule?.AllowedMethods?.join(", ")}`);
}

await apply(publicBucket, "public");
await apply(privateBucket, "private");
console.log("Done.");
