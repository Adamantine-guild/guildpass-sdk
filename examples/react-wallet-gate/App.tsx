import { useMemo, useState } from 'react';
import { connectWallet, EIP1193Provider, GuildPassClient, hasInjectedWallet } from '../../src';

type GateState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'checking'; address: string }
  | { status: 'granted'; address: string }
  | { status: 'denied'; address: string; reason: string | null }
  | { status: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<GateState>({ status: 'disconnected' });

  const client = useMemo(
    () =>
      new GuildPassClient({
        apiUrl: import.meta.env.VITE_API_URL,
      }),
    [],
  );

  const guildId = import.meta.env.VITE_GUILD_ID;
  const resourceId = import.meta.env.VITE_RESOURCE_ID;

  async function handleConnect() {
    if (!hasInjectedWallet()) {
      setState({
        status: 'error',
        message: 'No injected wallet found. Install MetaMask or a similar EIP-1193 wallet.',
      });
      return;
    }

    setState({ status: 'connecting' });

    try {
      const provider = (window as any).ethereum as EIP1193Provider;
      const accounts = await connectWallet(provider);

      if (accounts.length === 0) {
        setState({ status: 'error', message: 'Wallet connected but returned no accounts.' });
        return;
      }

      const address = accounts[0];
      setState({ status: 'checking', address });

      const result = await client.access.checkAccess({
        walletAddress: address,
        guildId,
        resourceId,
      });

      setState(
        result.hasAccess
          ? { status: 'granted', address }
          : { status: 'denied', address, reason: result.reason ?? null },
      );
    } catch (err) {
      setState({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Something went wrong connecting or checking access.',
      });
    }
  }

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 480,
        margin: '4rem auto',
        padding: '0 1rem',
      }}
    >
      <h1>GuildPass — Wallet-Gated Content</h1>

      {state.status === 'disconnected' && <button onClick={handleConnect}>Connect Wallet</button>}

      {state.status === 'connecting' && <p>Connecting wallet…</p>}

      {state.status === 'checking' && <p>Checking access for {shorten(state.address)}…</p>}

      {state.status === 'granted' && (
        <div style={{ border: '1px solid #2e7d32', padding: '1rem', borderRadius: 8 }}>
          <p>✅ Access granted to {shorten(state.address)}.</p>
          <p>
            This is the gated content — only visible when `checkAccess` returns `hasAccess: true`.
          </p>
        </div>
      )}

      {state.status === 'denied' && (
        <div style={{ border: '1px solid #c62828', padding: '1rem', borderRadius: 8 }}>
          <p>🚫 Access denied for {shorten(state.address)}.</p>
          {state.reason && <p>Reason: {state.reason}</p>}
        </div>
      )}

      {state.status === 'error' && (
        <div style={{ border: '1px solid #c62828', padding: '1rem', borderRadius: 8 }}>
          <p>⚠️ {state.message}</p>
          <button onClick={() => setState({ status: 'disconnected' })}>Try again</button>
        </div>
      )}
    </main>
  );
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
