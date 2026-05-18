require('dotenv').config()
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js')
const http = require('http')

// Keep-alive : empêche Render Free de s'endormir
const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('DJOBI Bot en ligne')
})
server.listen(process.env.PORT || 3000)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ]
})

// ─── Bot prêt ───────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`)
  client.user.setActivity('djobicandle.com | Trade. Gagne. Vis.', {
    type: ActivityType.Watching
  })
})

// ─── Commandes ──────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return
  const content = message.content.toLowerCase().trim()

  // !tournoi
  if (content === '!tournoi') {
    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle('🏆 Tournois DJOBI')
      .setDescription('Rejoins l\'arène et prouve ta valeur !')
      .addFields(
        {
          name: '📅 Daily',
          value: '1 000 FCFA | 1 jour | Pool garanti 50 000 FCFA',
          inline: false
        },
        {
          name: '🗓️ Weekend',
          value: '5 000 FCFA | 2-3 jours | Pool garanti 150 000 FCFA',
          inline: false
        },
        {
          name: '🎯 Inscription',
          value: '[djobicandle.com](https://djobicandle.com)',
          inline: false
        }
      )
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
      .setTimestamp()
    await message.reply({ embeds: [embed] })
    return
  }

  // !classement
  if (content === '!classement') {
    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle('📊 Classement Live DJOBI')
      .setDescription('Consulte le classement en temps réel sur la plateforme.')
      .addFields(
        {
          name: '🔗 Voir le classement',
          value: '[djobicandle.com/classement](https://djobicandle.com)',
          inline: false
        },
        {
          name: 'ℹ️ Règle',
          value: 'Classement par % de gain — équitable pour tous les joueurs.',
          inline: false
        }
      )
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
      .setTimestamp()
    await message.reply({ embeds: [embed] })
    return
  }

  // !aide
  if (content === '!aide') {
    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle('❓ Commandes DJOBI Bot')
      .addFields(
        { name: '!tournoi', value: 'Voir les tournois disponibles', inline: true },
        { name: '!classement', value: 'Voir le classement live', inline: true },
        { name: '!regles', value: 'Règles du jeu DJOBI', inline: true },
        { name: '!support', value: 'Contacter le support', inline: true },
      )
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
    await message.reply({ embeds: [embed] })
    return
  }

  // !regles
  if (content === '!regles') {
    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle('📜 Règles DJOBI')
      .addFields(
        { name: '💰 Capital de départ', value: '100 USD fictifs', inline: true },
        { name: '🔄 Recav', value: '1 max par tournoi (+150 USD fictifs)', inline: true },
        { name: '📊 Classement', value: 'Par % de gain sur capital initial', inline: true },
        { name: '⏱️ Durées', value: '1min, 5min, 15min, 1h', inline: true },
        { name: '📈 Actifs', value: 'BTC, ETH, Or, EUR/USD, GBP/USD...', inline: true },
        { name: '🎯 Plafond', value: '15 000 USD fictifs (remboursement mise initiale)', inline: true },
      )
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
    await message.reply({ embeds: [embed] })
    return
  }

  // !support
  if (content === '!support') {
    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle('🆘 Support DJOBI')
      .addFields(
        { name: '📧 Email', value: 'support@djobicandle.com', inline: false },
        { name: '💳 Dépôts/Retraits', value: 'Voir #dépôts-retraits', inline: false },
        { name: '🐛 Bug', value: 'Voir #signalement-bug', inline: false },
      )
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
    await message.reply({ embeds: [embed] })
    return
  }
})

// ─── Démarrage ──────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN)
