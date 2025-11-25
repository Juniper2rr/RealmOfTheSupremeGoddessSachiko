require('dotenv').config();

console.log('All environment variables:');
console.log(process.env);

console.log('\n--- Checking our variables ---');
console.log('DISCORD_TOKEN:', process.env.DISCORD_TOKEN);
console.log('CLIENT_ID:', process.env.CLIENT_ID);
console.log('GUILD_ID:', process.env.GUILD_ID);