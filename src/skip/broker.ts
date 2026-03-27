import { SkipServiceBroker } from "@skipruntime/helpers";

let broker: SkipServiceBroker | null = null;

export function getSkipBroker(): SkipServiceBroker {
  if (!broker) {
    const streamingPort = parseInt(
      process.env.SKIP_STREAMING_PORT || "8079",
      10,
    );
    const controlPort = parseInt(
      process.env.SKIP_CONTROL_PORT || "8078",
      10,
    );
    broker = new SkipServiceBroker(
      {
        host: "localhost",
        streaming_port: streamingPort,
        control_port: controlPort,
      },
      30000,
    );
  }
  return broker;
}
