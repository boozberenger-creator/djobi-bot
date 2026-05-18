require('dotenv').config()
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js')
const { createClient } = require('@supabase/supabase-js')
const http = require('http')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

// ─── Helpers ────────────────────────────────────────────────
function prixFcfa(centimes) {
  return `${Math.round(centimes / 100).toLocaleString('fr-FR')} FCFA`
}

async function postClassementFinal(channel, tournoi) {
  const { data: top } = await supabase
    .from('tournament_registrations')
    .select('current_capital_usd, initial_capital_usd, profiles(username, display_name)')
    .eq('tournament_id', tournoi.id)
    .eq('is_disqualified', false)
    .order('current_capital_usd', { ascending: false })
    .limit(5)

  const embed = new EmbedBuilder()
    .setColor('#C9A84C')
    .setTitle(`🏁 Tournoi terminé — ${tournoi.name}`)
    .setDescription('Classement final — résultats officiels')
    .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
    .setTimestamp()

  if (top && top.length > 0) {
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
    const lines = top.map((r, i) => {
      const name = r.profiles?.display_name || r.profiles?.username || 'Joueur'
      const pnl = ((r.current_capital_usd - r.initial_capital_usd) / r.initial_capital_usd * 100).toFixed(2)
      const sign = pnl >= 0 ? '+' : ''
      return `${medals[i]} **${name}** — ${sign}${pnl}%`
    }).join('\n')
    embed.addFields(
      { name: 'Top 5', value: lines, inline: false },
      { name: '🔗 Classement complet', value: '[djobicandle.com](https://djobicandle.com)', inline: false }
    )
  }

  await channel.send({ embeds: [embed] })
}

// ─── Bot prêt ───────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`)
  client.user.setActivity('djobicandle.com | Trade. Gagne. Vis.', {
    type: ActivityType.Watching
  })

  const tournoisChannel = client.channels.cache.get(process.env.DISCORD_TOURNOIS_CHANNEL_ID)
  if (!tournoisChannel) {
    console.warn('⚠️ DISCORD_TOURNOIS_CHANNEL_ID introuvable')
    return
  }

  const classementChannel = client.channels.cache.get(process.env.DISCORD_CLASSEMENT_CHANNEL_ID) || tournoisChannel
  const hallFameChannel = client.channels.cache.get(process.env.DISCORD_HALLFAME_CHANNEL_ID) || tournoisChannel
  const annoncesChannel = client.channels.cache.get(process.env.DISCORD_ANNONCES_CHANNEL_ID) || tournoisChannel

  // ─── Realtime djobi_infos — communiqués admin ────────────
  supabase
    .channel('infos-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'djobi_infos' }, async (payload) => {
      const info = payload.new
      if (!info.is_published) return
      const embed = new EmbedBuilder()
        .setColor('#C9A84C')
        .setTitle(`📢 ${info.title}`)
        .setDescription(info.content?.replace(/<[^>]*>/g, '').slice(0, 4000) || '')
        .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
        .setTimestamp()
      if (info.image_url) embed.setImage(info.image_url)
      await annoncesChannel.send({ embeds: [embed] })
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'djobi_infos' }, async (payload) => {
      const { new: info, old: prev } = payload
      if (prev.is_published || !info.is_published) return
      const embed = new EmbedBuilder()
        .setColor('#C9A84C')
        .setTitle(`📢 ${info.title}`)
        .setDescription(info.content?.replace(/<[^>]*>/g, '').slice(0, 4000) || '')
        .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
        .setTimestamp()
      if (info.image_url) embed.setImage(info.image_url)
      await annoncesChannel.send({ embeds: [embed] })
    })
    .subscribe((status) => {
      console.log(`📡 Realtime djobi_infos : ${status}`)
    })

  // ─── Realtime profiles — ambassadeurs / badges ───────────
  supabase
    .channel('profiles-realtime')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, async (payload) => {
      const { new: p, old: prev } = payload
      const name = p.display_name || p.username || 'Un djobleur'

      if (!prev.is_ambassador && p.is_ambassador) {
        const embed = new EmbedBuilder()
          .setColor('#C9A84C')
          .setTitle('🌟 Nouvel Ambassadeur DJOBI !')
          .setDescription(`**${name}** rejoint l'élite des Ambassadeurs DJOBI !\n\nMerci pour ta confiance et ta loyauté. Bienvenue dans la famille.`)
          .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
          .setTimestamp()
        await hallFameChannel.send({ embeds: [embed] })
      }

      if (!prev.is_royal_ambassador && p.is_royal_ambassador) {
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('👑 Nouvel Ambassadeur Royal DJOBI !')
          .setDescription(`**${name}** accède au rang suprême — **Ambassadeur Royal** !\n\nLe sommet de l'excellence DJOBI.`)
          .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
          .setTimestamp()
        await hallFameChannel.send({ embeds: [embed] })
      }

      if (!prev.badge_diamond && p.badge_diamond) {
        const embed = new EmbedBuilder()
          .setColor('#B9F2FF')
          .setTitle('💎 Badge Diamond débloqué !')
          .setDescription(`**${name}** décroche le **Badge Diamond** DJOBI !\n\nPerformance exceptionnelle. La légende est en marche.`)
          .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
          .setTimestamp()
        await hallFameChannel.send({ embeds: [embed] })
      }

      if (!prev.badge_diamond_pro && p.badge_diamond_pro) {
        const embed = new EmbedBuilder()
          .setColor('#FF00FF')
          .setTitle('💎 Badge Diamond PRO débloqué !')
          .setDescription(`**${name}** atteint le niveau ultime — **Diamond PRO** !\n\nUn seul mot : respect.`)
          .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
          .setTimestamp()
        await hallFameChannel.send({ embeds: [embed] })
      }
    })
    .subscribe((status) => {
      console.log(`📡 Realtime profiles : ${status}`)
    })

  // leader connu par tournoi en mémoire
  const tournamentLeaders = new Map()

  supabase
    .channel('registrations-realtime')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_registrations' }, async (payload) => {
      const tournamentId = payload.new.tournament_id

      const { data: tournoi } = await supabase
        .from('tournaments')
        .select('id, name')
        .eq('id', tournamentId)
        .eq('status', 'active')
        .maybeSingle()

      if (!tournoi) return

      const { data: top } = await supabase
        .from('tournament_registrations')
        .select('user_id, current_capital_usd, initial_capital_usd, profiles(username, display_name)')
        .eq('tournament_id', tournamentId)
        .eq('is_disqualified', false)
        .order('current_capital_usd', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!top) return

      const prevLeader = tournamentLeaders.get(tournamentId)
      tournamentLeaders.set(tournamentId, top.user_id)

      // initialisation silencieuse — pas de post au 1er check
      if (!prevLeader || prevLeader === top.user_id) return

      const name = top.profiles?.display_name || top.profiles?.username || 'Joueur'
      const pnl = ((top.current_capital_usd - top.initial_capital_usd) / top.initial_capital_usd * 100).toFixed(2)

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('👑 Nouveau leader !')
        .setDescription(`**${name}** prend la tête de **${tournoi.name}** avec **+${pnl}%** de gain !\n\nSaura-t-il tenir jusqu\'à la fin ?`)
        .addFields({ name: '📊 Classement complet', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
        .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
        .setTimestamp()

      await classementChannel.send({ embeds: [embed] })
    })
    .subscribe((status) => {
      console.log(`📡 Realtime registrations : ${status}`)
    })

  supabase
    .channel('tournaments-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tournaments' }, async (payload) => {
      const t = payload.new
      if (t.status !== 'open') return
      const embed = new EmbedBuilder()
        .setColor('#C9A84C')
        .setTitle('🟢 Nouveau tournoi ouvert !')
        .setDescription(`**${t.name}** — Inscriptions ouvertes\n\nMise : ${prixFcfa(t.entry_price_fcfa)} | ${t.current_participants}/${t.max_participants} joueurs`)
        .addFields({ name: '👉 S\'inscrire', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
        .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
        .setTimestamp()
      await tournoisChannel.send({ embeds: [embed] })
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments' }, async (payload) => {
      const { new: t, old: prev } = payload
      if (t.status === prev.status) return

      if (t.status === 'open') {
        const embed = new EmbedBuilder()
          .setColor('#C9A84C')
          .setTitle('🟢 Tournoi ouvert aux inscriptions !')
          .setDescription(`**${t.name}**\n\nMise : ${prixFcfa(t.entry_price_fcfa)} | ${t.current_participants}/${t.max_participants} joueurs`)
          .addFields({ name: '👉 S\'inscrire', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
          .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
          .setTimestamp()
        await tournoisChannel.send({ embeds: [embed] })
      }

      if (t.status === 'active') {
        const embed = new EmbedBuilder()
          .setColor('#FF4444')
          .setTitle('🔴 Tournoi EN COURS — Le combat commence !')
          .setDescription(`**${t.name}** a démarré !\n\n${t.current_participants} djobleurs en lice. Que le meilleur gagne !`)
          .addFields({ name: '📊 Classement live', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
          .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
          .setTimestamp()
        await tournoisChannel.send({ embeds: [embed] })
      }

      if (t.status === 'closed') {
        await postClassementFinal(tournoisChannel, t)
        // annonce du gagnant dans Hall of Fame
        const { data: winner } = await supabase
          .from('tournament_registrations')
          .select('current_capital_usd, initial_capital_usd, profiles(username, display_name)')
          .eq('tournament_id', t.id)
          .eq('is_disqualified', false)
          .order('current_capital_usd', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (winner) {
          const wName = winner.profiles?.display_name || winner.profiles?.username || 'Joueur'
          const wPnl = ((winner.current_capital_usd - winner.initial_capital_usd) / winner.initial_capital_usd * 100).toFixed(2)
          const embed = new EmbedBuilder()
            .setColor('#C9A84C')
            .setTitle(`🏆 Vainqueur — ${t.name}`)
            .setDescription(`**${wName}** remporte le tournoi **${t.name}** avec **+${wPnl}%** de gain !\n\nFélicitations au champion 🎉`)
            .addFields({ name: '📊 Classement complet', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
            .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
            .setTimestamp()
          await hallFameChannel.send({ embeds: [embed] })
        }
      }
    })
    .subscribe((status) => {
      console.log(`📡 Realtime tournaments : ${status}`)
    })
})

// ─── Commandes ──────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return
  const content = message.content.toLowerCase().trim()

  // !tournoi
  if (content === '!tournoi') {
    const { data: tournois } = await supabase
      .from('tournaments')
      .select('name, type, status, entry_price_fcfa, guaranteed_pool_fcfa, current_participants, max_participants, starts_at, ends_at')
      .in('status', ['open', 'active'])
      .order('starts_at', { ascending: true })
      .limit(3)

    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle('🏆 Tournois DJOBI')
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
      .setTimestamp()

    if (!tournois || tournois.length === 0) {
      embed.setDescription('Aucun tournoi en cours. Reviens bientôt !\n\n[djobicandle.com](https://djobicandle.com)')
    } else {
      embed.setDescription('Rejoins l\'arène et prouve ta valeur !')
      for (const t of tournois) {
        const pool = t.guaranteed_pool_fcfa > 0
          ? `${Math.round(t.guaranteed_pool_fcfa / 100).toLocaleString('fr-FR')} FCFA garanti`
          : `Pool en cours`
        const prix = `${Math.round(t.entry_price_fcfa / 100).toLocaleString('fr-FR')} FCFA`
        const status = t.status === 'active' ? '🔴 EN COURS' : '🟢 OUVERT'
        const places = `${t.current_participants}/${t.max_participants} joueurs`
        embed.addFields({
          name: `${status} — ${t.name}`,
          value: `Mise : ${prix} | Pool : ${pool} | ${places}\n[S\'inscrire](https://djobicandle.com)`,
          inline: false
        })
      }
    }

    await message.reply({ embeds: [embed] })
    return
  }

  // !classement
  if (content === '!classement') {
    const { data: tournoi } = await supabase
      .from('tournaments')
      .select('id, name')
      .eq('status', 'active')
      .order('starts_at', { ascending: false })
      .limit(1)
      .single()

    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle('📊 Classement Live DJOBI')
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
      .setTimestamp()

    if (!tournoi) {
      embed.setDescription('Aucun tournoi actif en ce moment.\n\n[djobicandle.com](https://djobicandle.com)')
    } else {
      const { data: top } = await supabase
        .from('tournament_registrations')
        .select('current_capital_usd, initial_capital_usd, profiles(username, display_name)')
        .eq('tournament_id', tournoi.id)
        .eq('is_disqualified', false)
        .order('current_capital_usd', { ascending: false })
        .limit(10)

      embed.setDescription(`Tournoi : **${tournoi.name}**\nClassement par % de gain`)

      if (top && top.length > 0) {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
        const lines = top.map((r, i) => {
          const name = r.profiles?.display_name || r.profiles?.username || 'Joueur'
          const pnl = ((r.current_capital_usd - r.initial_capital_usd) / r.initial_capital_usd * 100).toFixed(2)
          const sign = pnl >= 0 ? '+' : ''
          return `${medals[i]} **${name}** — ${sign}${pnl}%`
        }).join('\n')
        embed.addFields({ name: 'Top 10', value: lines, inline: false })
        embed.addFields({ name: '🔗 Classement complet', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
      }
    }

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
