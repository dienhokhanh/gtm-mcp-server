import { runInteractiveAuth } from "./auth.js";

runInteractiveAuth().catch((err) => {
  console.error("Sign-in failed:", err.message ?? err);
  process.exit(1);
});
