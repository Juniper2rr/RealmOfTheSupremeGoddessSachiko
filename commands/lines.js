const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');
const { loadConfig } = require('./setup');

// Helper function: randomize letter casing
function randomCase(str) {
    return str.split('').map(c => Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()).join('');
}

// Helper function: create image of text
function createTextImage(text) {
    const fontSize = 32;
    const padding = 40;
    const lineHeight = fontSize * 1.5;
    
    const maxWidth = 800;
    const canvas = createCanvas(maxWidth, 200);
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px monospace`;
    
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];
    
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth - padding * 2) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    
    const canvasHeight = (lines.length * lineHeight) + (padding * 2);
    const finalCanvas = createCanvas(maxWidth, canvasHeight);
    const finalCtx = finalCanvas.getContext('2d');
    
    finalCtx.fillStyle = '#2b2d31';
    finalCtx.fillRect(0, 0, maxWidth, canvasHeight);
    
    finalCtx.font = `${fontSize}px monospace`;
    finalCtx.fillStyle = '#ffffff';
    finalCtx.textBaseline = 'top';
    
    lines.forEach((line, i) => {
        finalCtx.fillText(line, padding, padding + (i * lineHeight));
    });
    
    return finalCanvas.toBuffer();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lines')
        .setDescription('Give a user lines to write as punishment')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to punish')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message the user must write')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of lines')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),
    
    async execute(interaction) {
        try {
            const punisher = interaction.member;
            const user = interaction.options.getUser('user');
            const targetMember = await interaction.guild.members.fetch(user.id);
            const messageText = interaction.options.getString('message');
            const amount = interaction.options.getInteger('amount');

            // Load config to get punisher role
            const config = loadConfig();
            const guildConfig = config[interaction.guild.id];

            if (!guildConfig || !guildConfig.punisherRoleId) {
                return await interaction.reply({ 
                    content: 'This server has not been set up yet! Ask the server owner to run `/setup` first.', 
                    ephemeral: true 
                });
            }

            const punisherRoleId = guildConfig.punisherRoleId;

            // Check if punisher has the required role
            if (!punisher.roles.cache.has(punisherRoleId)) {
                return await interaction.reply({ 
                    content: `You need the <@&${punisherRoleId}> role to use this command!`, 
                    ephemeral: true 
                });
            }

            // Check if target has the punisher role (can't punish other punishers)
            if (targetMember.roles.cache.has(punisherRoleId)) {
                return await interaction.reply({ 
                    content: `You cannot punish ${user} because they have the punisher role!`, 
                    ephemeral: true 
                });
            }

            // Can't punish yourself
            if (punisher.id === user.id) {
                return await interaction.reply({ 
                    content: 'You cannot punish yourself!', 
                    ephemeral: true 
                });
            }

            // Check if user has safeword active
            const safewords = interaction.client.safewords;
            if (safewords.has(user.id)) {
                return await interaction.reply({ 
                    content: `${user} has their safeword active and cannot be punished right now.`, 
                    ephemeral: true 
                });
            }

            const punishments = interaction.client.punishments;

            if (punishments.has(user.id)) {
                return await interaction.reply({ 
                    content: `${user} already has an active punishment!`, 
                    ephemeral: true 
                });
            }

            const guild = interaction.guild;

            // Load config to get the lines channel
            if (!guildConfig.linesChannelId) {
                return await interaction.reply({ 
                    content: 'Lines channel has not been configured! Ask the server owner to run `/setup` and specify a lines channel.', 
                    ephemeral: true 
                });
            }

            // Get the configured lines channel
            const linesChannel = guild.channels.cache.get(guildConfig.linesChannelId);
            if (!linesChannel) {
                return await interaction.reply({ 
                    content: 'The configured lines channel no longer exists! Ask the server owner to run `/setup` again.', 
                    ephemeral: true 
                });
            }

            console.log(`Using configured lines channel: ${linesChannel.id}`);

            const randomizedLine = randomCase(messageText);

            punishments.set(user.id, {
                linesLeft: amount,
                totalLines: amount,
                message: messageText,
                currentLine: randomizedLine,
                channelId: linesChannel.id,
                hiddenChannels: [], // No channels hidden in lite version
                lineStartTime: Date.now()
            });

            // Create image of the line
            const imageBuffer = createTextImage(randomizedLine);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'line.png' });

            await interaction.reply({ 
                content: `${user}, you have been given ${amount} lines to write. Check <#${linesChannel.id}>.`, 
                ephemeral: true 
            });
            
            // Post image in lines channel
            await linesChannel.send({
                content: `${user}, you must write **${amount} lines**.\n\n**Line 1/${amount}:** Type the line shown below exactly as it appears:`,
                files: [attachment]
            });
            
        } catch (err) {
            console.error('Error in lines command:', err);
            
            const errorResponse = { 
                content: `An error occurred: ${err.message}. Please check if I have "View Channel" and "Send Messages" permissions in the lines channel.`, 
                ephemeral: true 
            };

            // If we already replied to the user (at Line 176), we must use followUp
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorResponse).catch(console.error);
            } else {
                await interaction.reply(errorResponse).catch(console.error);
            }
        }
        
    },
};
