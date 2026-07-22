import { GuildPassClient } from '../src';

async function main() {
  const client = new GuildPassClient({
    apiUrl: 'https://api.guildpass.xyz',
  });

  const walletAddress = '0x1234567890123456789012345678901234567890';
  const guildId = 'guild_abc';
  const resourceId = 'premium-content-1';

  console.log(`Checking access for ${walletAddress}...`);

  try {
    const result = await client.access.checkAccess({
      walletAddress,
      guildId,
      resourceId,
    });

    if (result.hasAccess) {
      console.log('✅ Access Granted!');
      console.log('Matched Roles:', result.matchedRoles);
    } else {
      console.log('❌ Access Denied');
      console.log('Reason:', result.reason);
      console.log('Required Roles:', result.requiredRoles);
    }
  } catch (error) {
    console.error('Failed to check access:', error);
  }
}

main();
