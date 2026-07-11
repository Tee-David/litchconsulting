import { auth } from "../src/lib/auth";

async function main() {
  try {
    const res = await auth.api.signUpEmail({
      body: {
        email: "testadmin@litchconsulting.com",
        password: "SuperSecretPassword123!",
        name: "Test Admin User",
        role: "admin",
      }
    });
    console.log("Signup success:", res);
  } catch (err) {
    console.error("Signup failed:", err instanceof Error ? err.message : err);
  }
}

main().catch(err => console.error(err));
