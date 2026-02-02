const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'config.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Load config
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading config:', err);
    }
    return {};
}

// Save config
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        console.log('✅ Config saved');
    } catch (err) {
        console.error('❌ Error saving config:', err);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure bot settings (Server Owner only)')
        .addRoleOption(option =>
            option.setName('punisher_role')
                .setDescription('Role that can punish others')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('lines_channel')
                .setDescription('Channel where lines punishments will be posted')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        try {
            // Check if command is used in a guild using guildId
            if (!interaction.guildId) {
                return await interaction.reply({ 
                    content: '❌ This command can only be used in a server!', 
                    ephemeral: true 
                });
            }

            // Fetch the guild manually if it's not cached
            let guild = interaction.guild;
            if (!guild) {
                guild = await interaction.client.guilds.fetch(interaction.guildId);
            }

            // Ensure guild has ownerId
            if (!guild.ownerId) {
                await guild.fetch();
            }

            // Check if user is server owner
            if (interaction.user.id !== guild.ownerId) {
                return await interaction.reply({ 
                    content: '❌ Only the server owner can use this command!', 
                    ephemeral: true 
                });
            }

            const role = interaction.options.getRole('punisher_role');
            const channel = interaction.options.getChannel('lines_channel');
            const guildId = guild.id;

            // Validate channel is a text channel
            if (channel.type !== 0) {
                return await interaction.reply({
                    content: '❌ Please select a text channel for lines punishments.',
                    ephemeral: true
                });
            }

            // Load existing config
            const config = loadConfig();
            
            // Update config for this guild
            if (!config[guildId]) {
                config[guildId] = {};
            }
            config[guildId].punisherRoleId = role.id;
            config[guildId].linesChannelId = channel.id;

            // Save config
            saveConfig(config);

            await interaction.reply({
                content: `✅ Setup complete!\n• Punisher Role: ${role}\n• Lines Channel: ${channel}\n\nUsers with the punisher role can now punish anyone, including each other.`,
                ephemeral: false
            });

        } catch (err) {
            console.error('Error in setup command:', err);
            
            // Handle case where interaction hasn't been replied to yet
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ An error occurred during setup. Please try again.', 
                    ephemeral: true 
                }).catch(console.error);
            }
        }
    },
};

// Export helper functions for other commands to use
module.exports.loadConfig = loadConfig;
module.exports.saveConfig = saveConfig;