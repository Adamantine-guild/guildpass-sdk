# React Wallet Gate Example

A minimal React + Vite app demonstrating the most common GuildPass SDK
usage pattern: connect a browser wallet, then gate a piece of UI behind
`client.access.checkAccess()`.

This uses only the SDK's existing exports — `hasInjectedWallet()` and
`connectWallet()` from `@guildpass/sdk/wallet/helpers`, and `GuildPassClient`
from `@guildpass/sdk`. There is no `@guildpass/react` package yet; this
example shows how to wire the current SDK into a React component by hand.

## Prerequisites

- Node.js 18+
- A browser wallet extension (e.g. MetaMask) installed, for the "Connect
  Wallet" flow to have something to connect to
- A GuildPass API URL, guild ID, and resource ID to test against

## Setup

1. Copy this directory out of the SDK repo (or run it in place):

```bash
   cd examples/react-wallet-gate
```

2. Install dependencies:

```bash
   npm install
```

3. Copy the env template and fill in your own values:

```bash
   cp .env.example .env
```

Edit `.env`:

```bash
   VITE_API_URL=https://api.guildpass.xyz
   VITE_GUILD_ID=your-guild-id
   VITE_RESOURCE_ID=your-resource-id
```

`.env` is git-ignored — never commit real values. `.env.example` is the
only file checked into the repo, and it contains no secrets.

4. Run the dev server:

```bash
   npm run dev
```

Open the printed local URL (typically `http://localhost:5173`).

## What you should see

1. **No wallet installed** — clicking "Connect Wallet" (if it doesn't
   immediately show an error) will report no injected wallet was found.
2. **Wallet installed, not yet connected** — a "Connect Wallet" button.
   Clicking it triggers your wallet extension's connection prompt.
3. **Connected, checking access** — a brief "Checking access for
   0x1234…abcd…" state while `client.access.checkAccess()` resolves.
4. **Access granted** — a green panel showing the gated content.
5. **Access denied** — a red panel showing the denial and, if the API
   provided one, a reason.
6. **Error** — network failures, a rejected wallet connection, or a
   misconfigured `.env` all surface as a dismissable error panel with a
   "Try again" button.

## Type-checking

This example has its own minimal `tsconfig.json`, independent of the SDK's
root config, so it can be typechecked standalone:

```bash
npm run typecheck
```

## Notes

- `connectWallet()` takes an `EIP1193Provider` explicitly — it does not
  read `window.ethereum` internally. This example reads
  `(window as any).ethereum` itself before calling it, which is the
  pattern any consumer integrating the SDK into their own UI will need to
  follow.
- `hasInjectedWallet()` only checks for wallet _presence_, not connection
  state. Actually connecting still requires calling `connectWallet()` and
  handling the user's response (approval or rejection) in the wallet
  extension's popup.
