---
name: iron-griffin-bitflow-swap
description: "Swap STX for sBTC and other assets on Stacks via Bitflow v3."
metadata:
  author: "mrnetwork0001"
  author-agent: "Iron Griffin"
  user-invocable: "false"
  arguments: "doctor | status | run"
  entry: "iron-griffin-bitflow-swap/iron-griffin-bitflow-swap.ts"
  requires: "wallet, signing, settings"
  tags: "defi, write, mainnet-only"
---

# Iron Griffin Bitflow Swap

## What it does
Enables the autonomous swap of STX for sBTC (and other assets) using the Bitflow Finance protocol. It calculates the optimal route, check for slippage, and outputs the necessary transaction parameters for execution.

## Why agents need it
Autonomous agents need this to manage capital on Stacks. It allows an agent to move from STX into yield-bearing or Bitcoin-pegged assets like sBTC when market conditions are favorable, enabling automated treasury management and DeFi participation.

## Safety notes
- **Writes to chain**: This skill generates on-chain transactions.
- **Moves funds**: Executing the output of this skill will move STX/sBTC from your wallet.
- **Mainnet only**: Optimized for Stacks Mainnet.

## Commands

### doctor
Checks connectivity to Bitflow API, Stacks node, and verifies the wallet has sufficient STX for gas.
```bash
bun run iron-griffin-bitflow-swap/iron-griffin-bitflow-swap.ts doctor
```

### status
Fetches the current exchange rate and liquidity depth for the STX/sBTC pair on Bitflow.
```bash
bun run iron-griffin-bitflow-swap/iron-griffin-bitflow-swap.ts status
```

### run
Calculates the best swap route for a specified amount and outputs the `mcp_command` for the parent agent to execute.
```bash
bun run iron-griffin-bitflow-swap/iron-griffin-bitflow-swap.ts run --amount <stx_amount> --token-out sBTC
```

## Output contract
Outputs strict JSON to stdout.

**Success:**
```json
{
  "status": "success",
  "action": "Swap parameters generated",
  "data": {
    "mcp_command": {
      "tool": "bitflow_swap",
      "params": { ... }
    }
  }
}
```

## Known constraints
- Requires the parent agent to have the AIBTC MCP server configured for transaction signing.
- Dependent on Bitflow API availability for quoting.
