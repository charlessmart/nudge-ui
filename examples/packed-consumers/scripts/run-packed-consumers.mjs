import { runPackedConsumerSuite } from "./packed-consumer-harness.mjs";

const selectedAdapters = process.argv.slice(2).filter((argument) => argument !== "--");

await runPackedConsumerSuite(selectedAdapters);
