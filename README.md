# mint-attest (JS/TS)

**Work attestation for the Vercel AI SDK.** Attest every generation on MINT
Protocol — a tamper-evident, on-chain (Solana) record of the work your agent
did. No wallet, no blockchain code — just middleware.

```bash
npm install mint-attest
export MINT_API_KEY=fnet_…        # free key at foundrynet.io (optional — see below)
```

## Usage

```ts
import { wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { mintAttest } from "mint-attest/vercel";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: mintAttest({ workType: "code_review" }),
});

const { text } = await generateText({
  model,
  prompt: "Review this code for security issues",
});
// → the generation is attested on MINT; the Solscan verify URL is logged
```

Attestation runs **after** the model returns and never blocks or breaks the
call (fail-open). Inputs and outputs are hashed locally (SHA-256) — only the
hash leaves your process.

## Autonomous (no key)

Omit `MINT_API_KEY` and the MINT server **autonomously provisions** a fresh key
scoped to this agent on first use — no signup, no human:

```ts
const model = wrapLanguageModel({ model: openai("gpt-4o"), middleware: mintAttest() });
```

## Options

```ts
mintAttest({
  apiKey,        // fnet_ key (or MINT_API_KEY env; omit to auto-provision)
  workType,      // MINT work_type, default "generation"
  name,          // agent name used at registration
  mintId,        // reuse a known identity instead of registering
  onAttested,    // (receipt) => void — default logs the verify URL
});
```

## Direct client

```ts
import { MintClient } from "mint-attest";

const mint = new MintClient();                 // autonomous if no key
await mint.attest({ workType: "research", summary: "…", durationSeconds: 12 });
```

## Pricing

Register: free. Verify: free. Attest: $0.02 (free up to the daily cap on
auto-provisioned keys, then pay via x402 or a metered key).

## Links

- Explorer: https://mint.foundrynet.io
- Python SDK: https://pypi.org/project/mint-attest
- Protocol: https://foundrynet.io

MIT licensed.
