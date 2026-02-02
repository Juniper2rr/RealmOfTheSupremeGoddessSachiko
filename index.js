const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load from environment variables
const TOKEN = process.env.DISCORD_TOKEN;

// Validate token exists
if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in .env file!');
    process.exit(1);
}

// Initialize client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Create a collection to store commands
client.commands = new Collection();

// Create a map to store punishments (shared across files)
client.punishments = new Map();

// Create a map to store safeword protections
client.safewords = new Map();

// Load command files
const commandsPath = path.join(__dirname, 'commands');

// Check if commands folder exists
if (!fs.existsSync(commandsPath)) {
    console.error('❌ Commands folder not found! Creating it now...');
    fs.mkdirSync(commandsPath);
    console.log('✅ Created commands folder. Please add command files and restart.');
} else {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    if (commandFiles.length === 0) {
        console.log('⚠️  No command files found in commands folder.');
    }

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
        }
    }
}

// Load event files (only the ones we want)
const eventsPath = path.join(__dirname, 'events');
const allowedEvents = ['ready.js', 'interactionCreate.js', 'messageCreate.js'];

// Check if events folder exists
if (!fs.existsSync(eventsPath)) {
    console.error('❌ Events folder not found! Creating it now...');
    fs.mkdirSync(eventsPath);
    console.log('✅ Created events folder. Please add event files and restart.');
} else {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    
    if (eventFiles.length === 0) {
        console.log('⚠️  No event files found in events folder.');
    }

    for (const file of eventFiles) {
        // Skip files not in the allowed list
        if (!allowedEvents.includes(file)) {
            console.log(`⏭️  Skipping event: ${file}`);
            continue;
        }

        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`✅ Loaded event: ${event.name}`);
    }
}

// Login
client.login(TOKEN);