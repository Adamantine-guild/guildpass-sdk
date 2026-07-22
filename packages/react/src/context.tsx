import { createContext, useContext, ReactNode } from 'react';
import { GuildPassClient } from '@guildpass/sdk';

interface GuildPassContextValue {
  client: GuildPassClient;
}

const GuildPassContext = createContext<GuildPassContextValue | null>(null);

interface GuildPassProviderProps {
  client: GuildPassClient;
  children: ReactNode;
}

export function GuildPassProvider({ client, children }: GuildPassProviderProps) {
  return (
    <GuildPassContext.Provider value={{ client }}>
      {children}
    </GuildPassContext.Provider>
  );
}

export function useGuildPassClient(): GuildPassClient {
  const context = useContext(GuildPassContext);
  if (!context) {
    throw new Error('useGuildPassClient must be used within a GuildPassProvider');
  }
  return context.client;
}
