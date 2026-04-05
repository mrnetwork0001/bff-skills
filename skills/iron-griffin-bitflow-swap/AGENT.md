---
name: iron-griffin-bitflow-swap-agent
skill: iron-griffin-bitflow-swap
description: "Rules for autonomous STX/sBTC swapping via Bitflow."
---

# Agent Behavior — Iron Griffin Bitflow Swap

## Decision order
1. **Analyze Market**: Run `status` to get the current swap rate and liquidity depth.
2. **Evaluate Opportunity**: Compare the Bitflow rate against benchmarks or previous signals.
3. **Pre-flight Check**: Run `doctor` to ensure the wallet has gas and API is healthy.
4. **Execution**: Run `run` with the desired amount.
5. **Delegation**: If a valid `mcp_command` is returned, request authorization to execute the transaction via the AIBTC MCP server.

## Guardrails
- **Max Swap Amount**: Never swap more than 50% of the total STX balance in a single transaction unless explicitly overridden.
- **Slippage Limit**: Default to a maximum of 3% slippage. Refuse to generate swap parameters if the Bitflow API indicates higher impact.
- **Gas Reserve**: Ensure at least 0.5 STX remains in the wallet after any transaction for future gas fees.
- **Confirmation**: Always surface the `mcp_command` to the operator for final confirmation before execution.

## On error
- If `doctor` fails, do not proceed with `run`.
- If the swap fails to broadcast, log the error and wait at least 5 minutes before retrying.
- Report all failures to the mobile dashboard via the news-log.

## On success
- Log the Transaction ID (TXID).
- Update the `news-log.md` with a "DEFI EXECUTION" entry.
- Monitor the transaction status until confirmed.
