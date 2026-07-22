import { useState } from 'react';
import { connectWallet, EIP1193Provider, hasInjectedWallet } from '@guildpass/sdk';
import { useAccessCheck } from '@guildpass/react';

type GateState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; address: string };

export default function App() {
  const [state, setState] = useState<GateState>({ status: 'disconnected' });

  const guildId = import.meta.env.VITE_GUILD_ID;
  const resourceId = import.meta.env.VITE_RESOURCE_ID;

  const accessParams = state.status === 'connected' ? {
    guildId,
    resourceId,
    walletAddress: state.address
  } : null;

  const { data: accessResult, error: accessError, isLoading: isChecking } = useAccessCheck(accessParams);

  async function handleConnect() {
    if (!hasInjectedWallet()) {
      alert('No injected wallet found. Install MetaMask or a similar EIP-1193 wallet.');
      return;
    }

    setState({ status: 'connecting' });

    try {
      const provider = (window as any).ethereum as EIP1193Provider;
      const accounts = await connectWallet(provider);

      if (accounts.length === 0) {
        alert('Wallet connected but returned no accounts.');
        setState({ status: 'disconnected' });
        return;
      }

      const address = accounts[0];
      setState({ status: 'connected', address });
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Something went wrong connecting or checking access.',
      );
      setState({ status: 'disconnected' });
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

      {state.status === 'connected' && (
        <>
          {isChecking && <p>Checking access for {shorten(state.address)}…</p>}

          {accessError && (
            <div style={{ border: '1px solid #c62828', padding: '1rem', borderRadius: 8 }}>
              <p>⚠️ Error checking access: {accessError instanceof Error ? accessError.message : 'Unknown error'}</p>
            </div>
          )}

          {accessResult?.hasAccess && (
            <div style={{ border: '1px solid #2e7d32', padding: '1rem', borderRadius: 8 }}>
              <p>✅ Access granted to {shorten(state.address)}.</p>
              <p>
                This is the gated content — only visible when `checkAccess` returns `hasAccess: true`.
              </p>
            </div>
          )}

          {accessResult && !accessResult.hasAccess && (
            <div style={{ border: '1px solid #c62828', padding: '1rem', borderRadius: 8 }}>
              <p>🚫 Access denied for {shorten(state.address)}.</p>
              {accessResult.reason && <p>Reason: {accessResult.reason}</p>}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
