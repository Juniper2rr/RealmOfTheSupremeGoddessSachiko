const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sw')
        .setDescription('Use your safeword to stop all punishments')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Start or end safeword protection')
                .setRequired(true)
                .addChoices(
                    { name: 'Start', value: 'start' },
                    { name: 'End', value: 'end' }
                )),
    
    async execute(interaction) {
        try {
            const user = interaction.user;
            const action = interaction.options.getString('action');
            const safewords = interaction.client.safewords;

            if (action === 'start') {
                // Check if already using safeword
                if (safewords.has(user.id)) {
                    return await interaction.reply({ 
                        content: '🛑 You are already protected by safeword.', 
                        ephemeral: true 
                    });
                }

                // End all active punishments for this user
                const punishments = interaction.client.punishments;

                let releasedFrom = [];

                // Check lines punishment
                if (punishments.has(user.id)) {
                    const punishment = punishments.get(user.id);
                    
                    punishments.delete(user.id);
                    releasedFrom.push('lines');
                }

                // Activate safeword protection
                safewords.set(user.id, {
                    startedAt: Date.now(),
                    guildId: interaction.guild.id
                });

                let message = `🛑 **SAFEWORD ACTIVATED**\n\n${user}, you are now protected. All active punishments have been ended and you cannot be punished until you use \`/sw action:End\`.`;
                
                if (releasedFrom.length > 0) {
                    message += `\n\n✅ Released from: ${releasedFrom.join(', ')}`;
                }

                await interaction.reply({ 
                    content: message, 
                    ephemeral: false 
                });

            } else if (action === 'end') {
                // Check if using safeword
                if (!safewords.has(user.id)) {
                    return await interaction.reply({ 
                        content: 'You are not currently using safeword protection.', 
                        ephemeral: true 
                    });
                }

                const safewordData = safewords.get(user.id);
                const duration = Date.now() - safewordData.startedAt;
                const durationMinutes = Math.floor(duration / 60000);

                safewords.delete(user.id);

                await interaction.reply({ 
                    content: `✅ ${user}, your safeword protection has ended. You were protected for ${durationMinutes} minute(s). You can now be punished again.`, 
                    ephemeral: false 
                });
            }

        } catch (err) {
            console.error('Error in safeword command:', err);
            await interaction.reply({ 
                content: 'An error occurred while processing safeword.', 
                ephemeral: true 
            });
        }
    },
};