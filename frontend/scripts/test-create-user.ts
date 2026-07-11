import { auth } from "../src/lib/auth";

async function main() {
  console.log("auth.api keys:", Object.keys(auth.api));
}

main().catch(err => console.error(err));
