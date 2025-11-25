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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        try {
            // Check if user is server owner
            if (interaction.user.id !== interaction.guild.ownerId) {
                return await interaction.reply({ 
                    content: 'Only the server owner can use this command!', 
                    ephemeral: true 
                });
            }

            const role = interaction.options.getRole('punisher_role');
            const guildId = interaction.guild.id;

            // Load existing config
            const config = loadConfig();
            
            // Update config for this guild
            if (!config[guildId]) {
                config[guildId] = {};
            }
            config[guildId].punisherRoleId = role.id;

            // Save config
            saveConfig(config);

            await interaction.reply({
                content: `✅ Setup complete! Users with the ${role} role can now punish users without that role.`,
                ephemeral: false
            });

        } catch (err) {
            console.error('Error in setup command:', err);
            await interaction.reply({ 
                content: 'An error occurred during setup.', 
                ephemeral: true 
            });
        }
    },
};

// Export helper functions for other commands to use
module.exports.loadConfig = loadConfig;
module.exports.saveConfig = saveConfig;