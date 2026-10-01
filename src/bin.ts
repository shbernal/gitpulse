#!/usr/bin/env node
import { main } from "./cli";

process.on("unhandledRejection", (reason) => {
  console.error(`gitpulse: ${reason instanceof Error ? reason.message : "Unknown error."}`);
  process.exitCode = 1;
});

await main();
