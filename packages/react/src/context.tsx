import React, { createContext, useContext } from 'react'
import type { GuildPassClient } from '@guildpass/sdk'

interface GuildPassContextValue {
  client: GuildPassClient
}

const GuildPassContext = createContext<GuildPassContextValue | undefined>(undefined)

export const GuildPassProvider: React.FC<{
  client: GuildPassClient
  children: React.ReactNode
}> = ({ client, children }) => {
  return (
    <GuildPassContext.Provider value={{ client }}>
      {children}
    </GuildPassContext.Provider>
  )
}

export const useGuildPassClient = (): GuildPassClient => {
  const context = useContext(GuildPassContext)
  if (!context) {
    throw new Error('useGuildPassClient must be used within a GuildPassProvider')
  }
  return context.client
}
