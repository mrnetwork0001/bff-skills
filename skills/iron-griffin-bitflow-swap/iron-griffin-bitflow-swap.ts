#!/usr/bin/env bun
/**
 * Iron Griffin Bitflow Swap — Autonomous STX↔sBTC swap skill
 * 
 * Uses Bitflow Finance SDK for quoting and transaction preparation.
 * Outputs mcp_command for the AIBTC MCP server to sign and broadcast.
 */

import { Command } from "commander";

// ─── Constants ────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const BITFLOW_API_HOST = "https://api.bitflowapis.finance";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillOutput {
  status: "success" | "error" | "blocked";
  action: string;
  data: Record<string, unknown>;
  error: { code: string; message: string; next: string } | null;
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function emit(result: SkillOutput): void {
  const json = JSON.stringify(result, (key, value) => 
    typeof value === "bigint" ? value.toString() : value, 
    2
  );
  console.log(json);
}

// ─── Balance Reads ──────────────────────────────────────────────────────────

async function getStxBalance(address: string): Promise<number> {
  const url = `${HIRO_API}/extended/v1/address/${address}/stx`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Hiro API ${resp.status}: ${resp.statusText}`);
  const data = await resp.json() as { balance: string };
  return parseInt(data.balance, 10);
}

// ─── Bitflow Logic ──────────────────────────────────────────────────────────

async function getBitflowSDK() {
  try {
    const { BitflowSDK } = await import("@bitflowlabs/core-sdk");
    return new BitflowSDK({
      BITFLOW_API_HOST: BITFLOW_API_HOST,
      BITFLOW_API_KEY: "",
      READONLY_CALL_API_HOST: HIRO_API,
    });
  } catch (e) {
    throw new Error(`Bitflow SDK not found or failed to load: ${e}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findToken(sdk: any, symbol: string) {
  const tokens = await sdk.getAvailableTokens();
  const sym = symbol.toLowerCase();
  const match = tokens.find((t: any) =>
    (t.symbol ?? "").toLowerCase() === sym ||
    (t.tokenId ?? "").toLowerCase() === sym ||
    (t["token-id"] ?? "").toLowerCase() === sym
  );
  return match || null;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function doctor(address: string): Promise<void> {
  const checks: Record<string, boolean> = {
    sdk_loaded: false,
    address_provided: !!address,
    network_up: false,
    gas_available: false,
  };

  try {
    const sdk = await getBitflowSDK();
    checks.sdk_loaded = true;
    
    // Check network
    const resp = await fetch(`${HIRO_API}/v2/info`);
    checks.network_up = resp.ok;

    if (address) {
      const balance = await getStxBalance(address);
      checks.gas_available = balance >= 500_000; // 0.5 STX
    }
  } catch (e) {
    // failure logged in checks
  }

  const allOk = Object.values(checks).every(Boolean);
  emit({
    status: allOk ? "success" : "error",
    action: allOk ? "System ready" : "Pre-flight checks failed",
    data: { checks, address },
    error: allOk ? null : { code: "DOCTOR_FAIL", message: "Environment not fully prepared", next: "Ensure address is set and SDK is installed" },
  });
}

async function status(symbolIn: string, symbolOut: string, amount: number): Promise<void> {
  try {
    const sdk = await getBitflowSDK();
    
    const tokenIn = await findToken(sdk, symbolIn);
    const tokenOut = await findToken(sdk, symbolOut);
    
    if (!tokenIn) throw new Error(`Token ${symbolIn} not found on Bitflow`);
    if (!tokenOut) throw new Error(`Token ${symbolOut} not found on Bitflow`);

    const result = await sdk.getQuoteForRoute(tokenIn.tokenId, tokenOut.tokenId, amount);
    
    if (!result?.bestRoute?.quote) {
      throw new Error(`No swap route found for ${tokenIn.symbol} -> ${tokenOut.symbol}`);
    }

    emit({
      status: "success",
      action: `Quote fetched for ${amount} ${tokenIn.symbol} -> ${tokenOut.symbol}`,
      data: {
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        amountIn: amount,
        expectedOut: result.bestRoute.quote,
        priceImpact: result.bestRoute.priceImpact,
        route: result.bestRoute.route,
      },
      error: null,
    });
  } catch (e: any) {
    emit({
      status: "error",
      action: "Failed to fetch quote",
      data: {},
      error: { code: "QUOTE_FAIL", message: e.message, next: "Check token symbols and liquidity" },
    });
  }
}

async function run(address: string, amount: number, symbolIn: string, symbolOut: string, slippage: number): Promise<void> {
  try {
    if (!address) throw new Error("Wallet address is required for 'run'");

    const sdk = await getBitflowSDK();
    
    const tokenIn = await findToken(sdk, symbolIn);
    const tokenOut = await findToken(sdk, symbolOut);
    
    if (!tokenIn) throw new Error(`Token ${symbolIn} not found on Bitflow`);
    if (!tokenOut) throw new Error(`Token ${symbolOut} not found on Bitflow`);

    // Get quote for preparation
    const quoteResult = await sdk.getQuoteForRoute(tokenIn.tokenId, tokenOut.tokenId, amount);
    if (!quoteResult?.bestRoute?.route) {
      throw new Error("No valid route found at execution time");
    }

    emit({
      status: "success",
      action: "Swap execution parameters generated",
      data: {
        quote: {
          in: amount,
          out: quoteResult.bestRoute.quote,
          impact: quoteResult.bestRoute.priceImpact,
        },
        mcp_command: {
          tool: "bitflow_swap",
          params: {
            tokenInId: tokenIn.tokenId,
            tokenOutId: tokenOut.tokenId,
            amount: String(amount),
            slippage: slippage,
            senderAddress: address
          }
        }
      },
      error: null,
    });
  } catch (e: any) {
    emit({
      status: "error",
      action: "Failed to prepare swap",
      data: {},
      error: { code: "RUN_FAIL", message: e.message, next: "Verify balance and slippage settings" },
    });
  }
}

// ─── CLI (Commander.js) ────────────────────────────────────────────────

const program = new Command();

program
  .name("iron-griffin-bitflow-swap")
  .description("Autonomous STX↔sBTC swap via Bitflow");

program
  .command("doctor")
  .option("--address <stx_address>", "Stacks address")
  .action(async (opts) => {
    await doctor(opts.address || "");
  });

program
  .command("status")
  .option("--token-in <symbol>", "Token to swap from", "STX")
  .option("--token-out <symbol>", "Token to swap to", "sBTC")
  .option("--amount <number>", "Amount to swap", "10")
  .action(async (opts) => {
    await status(opts.tokenIn, opts.tokenOut, parseFloat(opts.amount));
  });

program
  .command("run")
  .requiredOption("--address <stx_address>", "Stacks address")
  .option("--amount <number>", "Amount to swap", "1")
  .option("--token-in <symbol>", "Token to swap from", "STX")
  .option("--token-out <symbol>", "Token to swap to", "sBTC")
  .option("--slippage <pct>", "Max slippage percentage", "3")
  .action(async (opts) => {
    await run(
      opts.address,
      parseFloat(opts.amount),
      opts.tokenIn,
      opts.tokenOut,
      parseFloat(opts.slippage)
    );
  });

program.parseAsync().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});
