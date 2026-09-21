/**
 * Next.js instrumentation hook. The real startup logic lives in
 * src/instrumentation-node.ts and is only loaded in the Node.js runtime so
 * that the Edge bundle (built for proxy.ts) does not pull in pg, Skip, or
 * express.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { register: registerNode } = await import("./src/instrumentation-node");
    await registerNode();
  }
}
