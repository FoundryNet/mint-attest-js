/**
 * Minimal MINT Protocol client for JS/TS — register + attest over the MINT
 * server's HTTPS API. No wallet, no Solana dependency; the server settles
 * on-chain. Mirrors the Python `mint-attest` SDK.
 */
import { createHash } from "node:crypto";

const DEFAULT_ENDPOINT = "https://mint-mcp-production.up.railway.app";

/** Deterministic SHA-256 of any value (string as-is, else canonical JSON). */
export function hashData(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export interface MintReceipt {
  attestation_id?: string;
  mint_id?: string;
  work_type?: string;
  data_hash?: string;
  tx_signature?: string;
  verify_url?: string;
  trust_score?: unknown;
  settled?: boolean;
}

export interface MintClientOptions {
  /** fnet_ key. If omitted, the server autonomously provisions one on register. */
  apiKey?: string;
  /** Override the MINT server (default: the hosted one, or MINT_ENDPOINT). */
  endpoint?: string;
  /** Agent name used at registration (default: MINT_AGENT_NAME or "vercel-ai-agent"). */
  name?: string;
  /** Skip registration by supplying a known mint_id. */
  mintId?: string;
}

export class MintClient {
  apiKey?: string;
  endpoint: string;
  mintId?: string;
  private name: string;
  private registering?: Promise<void>;

  constructor(opts: MintClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.MINT_API_KEY;
    this.endpoint = (opts.endpoint ?? process.env.MINT_ENDPOINT ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
    this.name = opts.name ?? process.env.MINT_AGENT_NAME ?? "vercel-ai-agent";
    this.mintId = opts.mintId;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "mint-attest-js/0.1.0",
    };
    if (this.apiKey) h["authorization"] = `Bearer ${this.apiKey}`;
    return h;
  }

  /**
   * Ensure this client has a mint_id. With no apiKey, the server autonomously
   * provisions a fresh scoped fnet_ key and returns it — we capture it so later
   * attest() calls just work. Idempotent + single-flight.
   */
  async ensureRegistered(): Promise<void> {
    if (this.mintId) return;
    if (!this.registering) {
      this.registering = (async () => {
        const r = await fetch(`${this.endpoint}/v1/register`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ name: this.name, actor_type: "ai_agent" }),
        });
        const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (typeof d.mint_id === "string") this.mintId = d.mint_id;
        if (!this.apiKey && typeof d.api_key === "string") this.apiKey = d.api_key;
      })();
    }
    await this.registering;
  }

  /** Attest a completed unit of work; returns the receipt (with verify_url) or null. */
  async attest(args: {
    workType?: string;
    inputData?: unknown;
    outputData?: unknown;
    durationSeconds?: number;
    summary?: string;
  }): Promise<MintReceipt | null> {
    await this.ensureRegistered();
    if (!this.mintId) return null;
    const body: Record<string, unknown> = {
      mint_id: this.mintId,
      work_type: args.workType ?? "generation",
      duration_seconds: Math.max(1, Math.round(args.durationSeconds ?? 1)),
      summary: args.summary ?? "vercel ai sdk generation",
    };
    if (args.inputData != null) body.input_hash = hashData(args.inputData);
    if (args.outputData != null) body.output_hash = hashData(args.outputData);
    const r = await fetch(`${this.endpoint}/v1/attest`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json().catch(() => null)) as MintReceipt | null;
  }
}
