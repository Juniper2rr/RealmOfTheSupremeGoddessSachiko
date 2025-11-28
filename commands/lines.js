const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');
const { loadConfig } = require('./setup');

// Helper function: randomize letter casing
function randomCase(str) {
    return str.split('').map(c => Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()).join('');
}

// Helper function: create image of text
function createTextImage(text) {
    const fontSize = 48;
    const padding = 10;
    const lineHeight = fontSize * 1;
    
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

            // Create or fetch "lines" channel first
            let linesChannel = guild.channels.cache.find(ch => ch.name === '「✦lines✦」');
            if (!linesChannel) {
                console.log('Creating new lines channel...');
                
                // Find general chat to copy permissions from
                const generalChannel = guild.channels.cache.find(ch => 
                    ch.name === 'general' || ch.name === 'general-chat' || ch.type === 0
                );
                
                const permissionOverwrites = generalChannel 
                    ? Array.from(generalChannel.permissionOverwrites.cache.values())
                    : [];
                
                linesChannel = await guild.channels.create({
                    name: '「✦lines✦」',
                    type: 0,
                    parent: generalChannel?.parent, // Put it in the same category as general
                    permissionOverwrites: permissionOverwrites // Copy same permissions
                });
                console.log(`Lines channel created: ${linesChannel.id}`);
            } else {
                console.log(`Found existing lines channel: ${linesChannel.id}`);
            }

            // Hide all other channels from the user (except lines)
            // Only hide text and voice channels, NOT categories (type 4)
            const channels = guild.channels.cache.filter(ch => 
                ch.type === 0 || ch.type === 2 // Text (0) and Voice (2) only, no categories
            );
            
            console.log(`Total channels to check: ${channels.size}`);
            console.log(`Lines channel ID to preserve: ${linesChannel.id}`);
            
            const hiddenChannels = [];
            for (const [id, channel] of channels) {
                console.log(`Checking channel: ${channel.name} (${channel.id})`);
                console.log(`  Is it lines channel? ${channel.id === linesChannel.id}`);
                
                if (channel.id !== linesChannel.id) { // Don't hide the lines channel
                    try {
                        // Check if user can currently see this channel
                        const permissions = channel.permissionsFor(user);
                        console.log(`  User can view? ${permissions && permissions.has(PermissionFlagsBits.ViewChannel)}`);
                        
                        if (permissions && permissions.has(PermissionFlagsBits.ViewChannel)) {
                            await channel.permissionOverwrites.edit(user.id, { 
                                ViewChannel: false 
                            });
                            hiddenChannels.push(id);
                            console.log(`  ✅ Hidden channel: ${channel.name}`);
                        }
                    } catch (err) {
                        console.error(`  ❌ Could not hide channel ${channel.name}:`, err.message);
                    }
                } else {
                    console.log(`  ⏭️ Skipping lines channel (will stay visible)`);
                }
            }
            
            console.log(`Total channels hidden: ${hiddenChannels.length}`);
            console.log(`Lines channel should still be visible!`);

            const randomizedLine = randomCase(messageText);

            punishments.set(user.id, {
                linesLeft: amount,
                totalLines: amount,
                message: messageText,
                currentLine: randomizedLine,
                channelId: linesChannel.id,
                hiddenChannels: hiddenChannels // Store which channels were hidden
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
            await interaction.reply({ 
                content: 'An error occurred while setting up the punishment.', 
                ephemeral: true 
            });
        }
    },
};