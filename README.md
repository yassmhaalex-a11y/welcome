const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', (member) => {
  // Create embed
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Welcome! 🎉')
    .setDescription(`Welcome to our server, ${member.user.username}!`)
    .setImage('YOUR_IMAGE_URL_HERE') // Add your welcome photo URL
    .setTimestamp();

  // Create buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Chat')
        .setStyle(ButtonStyle.Link)
        .setURL('YOUR_CHAT_LINK_HERE'), // Add your chat link
      new ButtonBuilder()
        .setLabel('YouTube')
        .setStyle(ButtonStyle.Link)
        .setURL('YOUR_YOUTUBE_LINK_HERE') // Add your YouTube link
    );

  // Send to welcome channel
  const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === 'welcome');
  if (welcomeChannel) {
    welcomeChannel.send({ embeds: [embed], components: [row] });
  }
});

client.login('YOUR_BOT_TOKEN');
