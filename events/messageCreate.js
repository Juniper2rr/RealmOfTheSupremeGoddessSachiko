const { AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');

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
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return;

        const punishments = message.client.punishments;
        const punishment = punishments.get(message.author.id);
        
        if (!punishment) return;
        if (message.channel.id !== punishment.channelId) return;

        try {
            if (message.content === punishment.currentLine) {
                await message.react('✅');
                punishment.linesLeft--;

                const completedLines = punishment.totalLines - punishment.linesLeft;

                if (punishment.linesLeft <= 0) {
                    await message.channel.send(`${message.author} ✅ **You have completed all your lines!**`);
                    
                    // Restore access to all hidden channels
                    if (punishment.hiddenChannels && punishment.hiddenChannels.length > 0) {
                        for (const channelId of punishment.hiddenChannels) {
                            const channel = message.guild.channels.cache.get(channelId);
                            if (channel) {
                                try {
                                    await channel.permissionOverwrites.delete(message.author.id);
                                } catch (err) {
                                    console.error(`Could not restore channel ${channel.name}:`, err.message);
                                }
                            }
                        }
                    }
                    
                    // Don't hide the lines channel - they can still see it
                    punishments.delete(message.author.id);
                } else {
                    const nextLine = randomCase(punishment.message);
                    punishment.currentLine = nextLine;
                    
                    // Create image
                    const imageBuffer = createTextImage(nextLine);
                    const attachment = new AttachmentBuilder(imageBuffer, { name: 'line.png' });
                    
                    await message.channel.send({
                        content: `${message.author} ✅ Correct! **Line ${completedLines + 1}/${punishment.totalLines}:**`,
                        files: [attachment]
                    });
                }
            } else {
                await message.react('❌');
                const retryLine = randomCase(punishment.message);
                punishment.currentLine = retryLine;
                
                // Create image
                const imageBuffer = createTextImage(retryLine);
                const attachment = new AttachmentBuilder(imageBuffer, { name: 'line.png' });
                
                await message.channel.send({
                    content: `${message.author} ❌ **Incorrect!** Try again:`,
                    files: [attachment]
                });
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    },
};