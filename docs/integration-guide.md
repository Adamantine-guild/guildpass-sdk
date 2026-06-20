# Integration Guide

How to use GuildPass SDK in different scenarios.

## 1. Token-Gated Website (Next.js)

In a Next.js application, you can check access on the server-side inside `getServerSideProps` or Middleware.

```typescript
// middleware.ts
import { GuildPassClient } from '@guildpass/sdk';

const client = new GuildPassClient({ apiUrl: process.env.GUILDPASS_API });

export async function middleware(req) {
  const wallet = req.cookies.get('wallet_address');

  const { hasAccess } = await client.access.checkAccess({
    walletAddress: wallet,
    guildId: 'premium-guild',
    resourceId: req.nextUrl.pathname,
  });

  if (!hasAccess) {
    return NextResponse.redirect('/join');
  }
}
```

## 2. Discord Bot Integration

Use the SDK inside your Discord bot command handlers to verify roles or membership before granting access to channels.

```typescript
// commands/verify.ts
import { GuildPassClient } from '@guildpass/sdk';

export async function execute(interaction) {
  const wallet = getWalletFromDb(interaction.user.id);

  const isMember = await client.membership.isMember({
    walletAddress: wallet,
    guildId: 'my-discord-guild',
  });

  if (isMember) {
    await interaction.member.roles.add(GUILD_ROLE_ID);
  }
}
```

## 3. Admin Tools

Fetch guild configurations to build custom management dashboards.

```typescript
const config = await client.guilds.getGuildConfig({ guildId: 'my-guild' });
// Use config.theme, config.socialLinks etc to render the UI
```

## 4. Batch Access Checking

If you need to verify access for multiple resources or multiple users at once, use the batch access helper to manage concurrency and gracefully handle partial failures.

```typescript
import { GuildPassClient } from '@guildpass/sdk';

const client = new GuildPassClient({ apiUrl: process.env.GUILDPASS_API });

const items = [
  { walletAddress: '0x123...', guildId: 'guild-a', resourceId: 'res-1' },
  { walletAddress: '0x456...', guildId: 'guild-a', resourceId: 'res-2' },
];

const results = await client.access.checkAccessBatch(items, { concurrency: 2 });

results.forEach((result) => {
  if (result.status === 'fulfilled') {
    console.log(`Access for ${result.input.walletAddress}: ${result.value.hasAccess}`);
  } else {
    console.error(`Failed to check access for ${result.input.walletAddress}`, result.error);
  }
});
```
