const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load from environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Validate required variables
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error('❌ Missing required environment variables in .env file!');
    console.error('Required: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
    process.exit(1);
}

const commands = [];

// Load all command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`📝 Prepared command: ${command.data.name}`);
    }
}

// Create REST instance
const rest = new REST({ version: '10' }).setToken(TOKEN);

// Deploy commands
(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

        // Register commands to specific guild (instant)
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        
        // Optional: Register globally (takes up to 1 hour)
        // await rest.put(
        //     Routes.applicationCommands(CLIENT_ID),
        //     { body: commands },
        // );
        
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();