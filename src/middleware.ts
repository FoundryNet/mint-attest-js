/**
 * Vercel AI SDK middleware — attest every generation on MINT Protocol.
 *
 *   import { wrapLanguageModel } from "ai";
 *   import { openai } from "@ai-sdk/openai";
 *   import { mintAttest } from "mint-attest/vercel";
 *
 *   const model = wrapLanguageModel({
 *     model: openai("gpt-4o"),
 *     middleware: mintAttest(),
 *   });
 *
 * Attestation runs after the model returns and never blocks or breaks the call
 * (fail-open). Input/output are hashed locally (SHA-256); only the hash leaves.
 */
import type { LanguageModelV1Middleware } from "ai";
import { MintClient } from "./client.js";
import type { MintReceipt } from "./client.js";

export interface MintAttestOptions {
  /** fnet_ key (or set MINT_API_KEY). Omit to let the server autonomously provision one. */
  apiKey?: string;
  /** Override the MINT server. */
  endpoint?: string;
  /** Agent name used at registration. */
  name?: string;
  /** MINT work_type for these generations (default "generation"). */
  workType?: string;
  /** Reuse a known mint_id instead of registering. */
  mintId?: string;
  /** Called with each receipt. Default logs the Solscan verify URL. */
  onAttested?: (receipt: MintReceipt) => void;
  /** Provide a preconfigured client (advanced). */
  client?: MintClient;
}

export function mintAttest(options: MintAttestOptions = {}): LanguageModelV1Middleware {
  const client =
    options.client ??
    new MintClient({
      apiKey: options.apiKey,
      endpoint: options.endpoint,
      name: options.name,
      mintId: options.mintId,
    });
  const onAttested =
    options.onAttested ??
    ((r: MintReceipt) => {
      if (r.verify_url) console.log(`Work attested on MINT Protocol. Verify: ${r.verify_url}`);
    });

  return {
    wrapGenerate: async ({ doGenerate, params }) => {
      const start = Date.now();
      const result = await doGenerate();
      // Attest in the background — never block the response or break on failure.
      void (async () => {
        try {
          const receipt = await client.attest({
            workType: options.workType,
            inputData: params,
            outputData: result.text ?? "",
            durationSeconds: (Date.now() - start) / 1000,
          });
          if (receipt) onAttested(receipt);
        } catch {
          /* fail open */
        }
      })();
      return result;
    },
  };
}
