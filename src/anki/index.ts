/**
 * The AnkiConnect adapter (M4) — the only module in the codebase that knows
 * AnkiConnect's wire format.
 *
 * Consumers depend on the `AnkiClient` port in `src/core/ports/types.ts` and
 * take this as an implementation of it; nothing above imports the protocol,
 * the transport, or the note shape directly.
 */
export type { AnkiClientConfig, AnkiDiagnostics } from "./client";
export { createAnkiClient, describeAnkiConnection } from "./client";
export { ANKI_CONNECT_API_VERSION } from "./protocol";
