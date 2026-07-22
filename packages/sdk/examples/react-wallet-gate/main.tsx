import React from 'react';
import ReactDOM from 'react-dom/client';
import { GuildPassClient } from '@guildpass/sdk';
import { GuildPassProvider } from '@guildpass/react';
import App from './App';

const client = new GuildPassClient({
  apiUrl: import.meta.env.VITE_API_URL,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GuildPassProvider client={client}>
      <App />
    </GuildPassProvider>
  </React.StrictMode>,
);
