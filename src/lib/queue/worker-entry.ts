import "dotenv/config";
import { createPaperWorker } from "./worker";

console.log("Starting paper processing worker...");
const worker = createPaperWorker();

process.on("SIGTERM", async () => {
  console.log("Shutting down worker...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down worker...");
  await worker.close();
  process.exit(0);
});
