const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load from environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// Validate required variables
if (!TOKEN || !CLIENT_ID) {
    console.error('❌ Missing required environment variables in .env file!');
    console.error('Required: DISCORD_TOKEN, CLIENT_ID');
    process.exit(1);
}

const commands = [];

// Define which commands to load (only lines-related commands)
const allowedCommands = ['setup.js', 'lines.js', 'linesforgive.js', 'safeword.js'];
console.log('✅ Configured to load lines commands + safeword');

// Load all command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    if (!allowedCommands.includes(file)) {
        console.log(`⏭️  Skipping command: ${file}`);
        continue;
    }

    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`📝 Prepared command: ${command.data.name}`);
    }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

// Deploy GLOBAL commands
(async () => {
    try {
        console.log(`🔄 Deploying ${commands.length} global application (/) commands...`);

        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ Successfully deployed ${data.length} global commands.`);
        
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
