
module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`✅ Logged in as ${client.user.tag}`);
        console.log(`📊 Loaded ${client.commands.size} commands`);
        console.log('🤖 Bot is ready!');
    },
};