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

        const squabbles = message.client.squabbles;
        const squabble = squabbles.get(message.author.id);
        
        if (!squabble) return;
        if (message.channel.id !== squabble.channelId) return;

        try {
            if (message.content === squabble.currentLine) {
                await message.react('✅');
                squabble.linesLeft--;

                const completedLines = squabble.totalLines - squabble.linesLeft;

                if (squabble.linesLeft <= 0) {
                    // This user is done, check if partner is also done
                    const partnerId = squabble.partnerId;
                    const partnerSquabble = squabbles.get(partnerId);

                    await message.channel.send(`${message.author} ✅ **You have finished your apologies!**`);

                    // Restore channels for this user
                    if (squabble.hiddenChannels && squabble.hiddenChannels.length > 0) {
                        for (const channelId of squabble.hiddenChannels) {
                            const channel = message.guild.channels.cache.get(channelId);
                            if (channel) {
                                try {
                                    await channel.permissionOverwrites.delete(message.author.id);
                                } catch (err) {
                                    console.error(`Could not restore channel:`, err.message);
                                }
                            }
                        }
                    }

                    squabbles.delete(message.author.id);

                    // Check if both are done
                    if (!partnerSquabble || partnerSquabble.linesLeft <= 0) {
                        await message.channel.send(`🤝 Both users have completed their apologies! You may both leave now.`);
                    } else {
                        const partner = await message.client.users.fetch(partnerId);
                        await message.channel.send(`${partner} still has ${partnerSquabble.linesLeft} apologies remaining!`);
                    }
                } else {
                    // Send next line
                    const nextLine = randomCase(squabble.apologyBase);
                    squabble.currentLine = nextLine;
                    
                    const imageBuffer = createTextImage(nextLine);
                    const attachment = new AttachmentBuilder(imageBuffer, { name: 'apology.png' });
                    
                    await message.channel.send({
                        content: `${message.author} **Line ${completedLines + 1}/${squabble.totalLines}:**`,
                        files: [attachment]
                    });
                }
            } else {
                await message.react('❌');
                const retryLine = randomCase(squabble.apologyBase);
                squabble.currentLine = retryLine;
                
                const imageBuffer = createTextImage(retryLine);
                const attachment = new AttachmentBuilder(imageBuffer, { name: 'apology.png' });
                
                await message.channel.send({
                    content: `${message.author} ❌ **Incorrect!** Try again:`,
                    files: [attachment]
                });
            }
        } catch (err) {
            console.error('Error processing squabble message:', err);
        }
    },
};