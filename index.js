require('dotenv').config()
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js')
const { createClient } = require('@supabase/supabase-js')
const http = require('http')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── HTTP Server : keep-alive + webhooks Supabase ───────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    const secret = req.headers['x-webhook-secret']
    if (secret !== process.env.WEBHOOK_SECRET) {
      res.writeHead(401); res.end('Unauthorized'); return
    }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body)
        await handleWebhook(payload)
      } catch (e) { console.error('Webhook error:', e) }
      res.writeHead(200); res.end('ok')
    })
    return
  }
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

function stripHtml(html) {
  if (!html) return ''
  // extrait le body si document complet
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const src = bodyMatch ? bodyMatch[1] : html
  return src
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
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

// ─── Webhook handler ────────────────────────────────────────
const prevStates = new Map()

async function handleWebhook(payload) {
  const { type, table, record, old_record } = payload

  async function getChannel(envKey, fallbackKey) {
    try { return await client.channels.fetch(process.env[envKey] || process.env[fallbackKey]) } catch { return null }
  }

  // ── djobi_infos ──
  if (table === 'djobi_infos') {
    const ch = await getChannel('DISCORD_ANNONCES_CHANNEL_ID', 'DISCORD_TOURNOIS_CHANNEL_ID')
    if (!ch) return
    const isNew = type === 'INSERT' && record.is_published
    const justPublished = type === 'UPDATE' && record.is_published && !old_record?.is_published
    if (!isNew && !justPublished) return
    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle(`📢 ${record.title}`)
      .setDescription(stripHtml(record.content))
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })
      .setTimestamp()
    if (record.image_url) embed.setImage(record.image_url)
    await ch.send({ embeds: [embed] })
    return
  }

  // ── tournaments ──
  if (table === 'tournaments') {
    const ch = await getChannel('DISCORD_TOURNOIS_CHANNEL_ID', 'DISCORD_TOURNOIS_CHANNEL_ID')
    if (!ch) return
    if (type === 'INSERT' && record.status === 'open') {
      const embed = new EmbedBuilder().setColor('#C9A84C')
        .setTitle('🟢 Nouveau tournoi ouvert !')
        .setDescription(`**${record.name}** — Inscriptions ouvertes\n\nMise : ${prixFcfa(record.entry_price_fcfa)} | ${record.current_participants}/${record.max_participants} joueurs`)
        .addFields({ name: '👉 S\'inscrire', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
        .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' }).setTimestamp()
      await ch.send({ embeds: [embed] })
    }
    if (type === 'UPDATE' && record.status !== old_record?.status) {
      if (record.status === 'open') {
        const embed = new EmbedBuilder().setColor('#C9A84C')
          .setTitle('🟢 Tournoi ouvert aux inscriptions !')
          .setDescription(`**${record.name}**\n\nMise : ${prixFcfa(record.entry_price_fcfa)} | ${record.current_participants}/${record.max_participants} joueurs`)
          .addFields({ name: '👉 S\'inscrire', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
          .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' }).setTimestamp()
        await ch.send({ embeds: [embed] })
      }
      if (record.status === 'active') {
        const embed = new EmbedBuilder().setColor('#FF4444')
          .setTitle('🔴 Tournoi EN COURS — Le combat commence !')
          .setDescription(`**${record.name}** a démarré !\n\n${record.current_participants} djobleurs en lice. Que le meilleur gagne !`)
          .addFields({ name: '📊 Classement live', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
          .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' }).setTimestamp()
        await ch.send({ embeds: [embed] })
      }
      if (record.status === 'closed') {
        const hf = await getChannel('DISCORD_HALLFAME_CHANNEL_ID', 'DISCORD_TOURNOIS_CHANNEL_ID')
        await postClassementFinal(ch, record)
        if (hf) {
          const { data: winner } = await supabase
            .from('tournament_registrations')
            .select('current_capital_usd, initial_capital_usd, profiles(username, display_name)')
            .eq('tournament_id', record.id).eq('is_disqualified', false)
            .order('current_capital_usd', { ascending: false }).limit(1).maybeSingle()
          if (winner) {
            const wName = winner.profiles?.display_name || winner.profiles?.username || 'Joueur'
            const wPnl = ((winner.current_capital_usd - winner.initial_capital_usd) / winner.initial_capital_usd * 100).toFixed(2)
            const embed = new EmbedBuilder().setColor('#C9A84C')
              .setTitle(`🏆 Vainqueur — ${record.name}`)
              .setDescription(`**${wName}** remporte **${record.name}** avec **+${wPnl}%** !\n\nFélicitations au champion 🎉`)
              .addFields({ name: '📊 Classement complet', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
              .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' }).setTimestamp()
            await hf.send({ embeds: [embed] })
          }
        }
      }
    }
    return
  }

  // ── profiles ──
  if (table === 'profiles') {
    const hf = await getChannel('DISCORD_HALLFAME_CHANNEL_ID', 'DISCORD_TOURNOIS_CHANNEL_ID')
    if (!hf) return
    const name = record.display_name || record.username || 'Un djobleur'
    if (record.is_ambassador && !old_record?.is_ambassador) {
      const embed = new EmbedBuilder().setColor('#C9A84C').setTitle('🌟 Nouvel Ambassadeur DJOBI !')
        .setDescription(`**${name}** rejoint l'élite des Ambassadeurs DJOBI !`)
        .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' }).setTimestamp()
      await hf.send({ embeds: [embed] })
    }
    if (record.is_royal_ambassador && !old_record?.is_royal_ambassador) {
      const embed = new EmbedBuilder().setColor('#FFD700').setTitle('👑 Nouvel Ambassadeur Royal DJOBI !')
        .setDescription(`**${name}** accède au rang suprême — **Ambassadeur Royal** !`)
        .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' }).setTimestamp()
      await hf.send({ embeds: [embed] })
    }
    if (record.badge_diamond && !old_record?.badge_diamond) {
      const embed = new EmbedBuilder().setColor('#B9F2FF').setTitle('💎 Badge Diamond débloqué !')
        .setDescription(`**${name}** décroche le **Badge Diamond** DJOBI !`)
        .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' }).setTimestamp()
      await hf.send({ embeds: [embed] })
    }
    return
  }

  // ── tournament_registrations (leader change) ──
  if (table === 'tournament_registrations' && type === 'UPDATE') {
    const tournamentId = record.tournament_id
    const { data: tournoi } = await supabase.from('tournaments').select('id, name').eq('id', tournamentId).eq('status', 'active').maybeSingle()
    if (!tournoi) return
    const { data: top } = await supabase.from('tournament_registrations')
      .select('user_id, current_capital_usd, initial_capital_usd, profiles(username, display_name)')
      .eq('tournament_id', tournamentId).eq('is_disqualified', false)
      .order('current_capital_usd', { ascending: false }).limit(1).maybeSingle()
    if (!top) return
    const prevLeader = prevStates.get(tournamentId)
    prevStates.set(tournamentId, top.user_id)
    if (!prevLeader || prevLeader === top.user_id) return
    const ch = await getChannel('DISCORD_CLASSEMENT_CHANNEL_ID', 'DISCORD_TOURNOIS_CHANNEL_ID')
    if (!ch) return
    const name = top.profiles?.display_name || top.profiles?.username || 'Joueur'
    const pnl = ((top.current_capital_usd - top.initial_capital_usd) / top.initial_capital_usd * 100).toFixed(2)
    const embed = new EmbedBuilder().setColor('#FFD700').setTitle('👑 Nouveau leader !')
      .setDescription(`**${name}** prend la tête de **${tournoi.name}** avec **+${pnl}%** !`)
      .addFields({ name: '📊 Classement complet', value: '[djobicandle.com](https://djobicandle.com)', inline: false })
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' }).setTimestamp()
    await ch.send({ embeds: [embed] })
  }
}

// ─── Bot prêt ───────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`)
  console.log('📡 Notifs via Database Webhooks HTTP')
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

  // !verify — salon #vérification uniquement
  if (content.startsWith('!verify')) {
    const VERIFY_CHANNEL_ID = '1505834881127546960'
    if (message.channel.id !== VERIFY_CHANNEL_ID) {
      await message.reply(`Cette commande est réservée au salon <#${VERIFY_CHANNEL_ID}>`)
      return
    }
    const pseudo = message.content.trim().replace(/^!verify\s*/i, '').trim()
    if (!pseudo) {
      await message.reply('Usage : `!verify ton surnom` — entre ton surnom DJOBI (celui affiché sur le classement)')
      return
    }

    const ROLE_LEADER      = '1505825959687749673'
    const ROLE_AMBASSADEUR = '1505826830530383942'
    const ROLE_DIAMOND     = '1505826909467050075'

    // Cherche d'abord par username, ensuite par display_name
    let profile = null
    const { data: byUsername } = await supabase
      .from('profiles')
      .select('username, display_name, stars_count, is_ambassador, badge_diamond, is_royal_ambassador')
      .ilike('username', pseudo)
      .maybeSingle()
    if (byUsername) {
      profile = byUsername
    } else {
      const { data: byName } = await supabase
        .from('profiles')
        .select('username, display_name, stars_count, is_ambassador, badge_diamond, is_royal_ambassador')
        .ilike('display_name', pseudo)
        .maybeSingle()
      profile = byName
    }

    if (!profile) {
      await message.reply(`❌ Pseudo **${pseudo}** introuvable. Vérifie ton pseudo sur **djobicandle.com/profil**`)
      return
    }

    const member = message.member
    const name = profile.display_name || profile.username || 'Djobleur'

    const hasLeader      = profile.stars_count >= 1
    const hasAmbassadeur = profile.is_ambassador || profile.is_royal_ambassador
    const hasDiamond     = profile.badge_diamond

    const rolesAdded = []
    if (hasDiamond     && !member.roles.cache.has(ROLE_DIAMOND))     { await member.roles.add(ROLE_DIAMOND);     rolesAdded.push('💎 Diamond') }
    if (hasLeader      && !member.roles.cache.has(ROLE_LEADER))      { await member.roles.add(ROLE_LEADER);      rolesAdded.push('⭐ Leader') }
    if (hasAmbassadeur && !member.roles.cache.has(ROLE_AMBASSADEUR)) { await member.roles.add(ROLE_AMBASSADEUR); rolesAdded.push('🌟 Ambassadeur') }

    const lines = []
    lines.push(hasDiamond     ? (member.roles.cache.has(ROLE_DIAMOND)     && !rolesAdded.includes('💎 Diamond')     ? '💎 Diamond — **déjà actif**' : '💎 Diamond — ✅ activé')     : '💎 Diamond — 🔒 non atteint')
    lines.push(hasLeader      ? (member.roles.cache.has(ROLE_LEADER)      && !rolesAdded.includes('⭐ Leader')      ? '⭐ Leader — **déjà actif**' : '⭐ Leader — ✅ activé')      : '⭐ Leader — 🔒 non atteint (1 étoile requise)')
    lines.push(hasAmbassadeur ? (member.roles.cache.has(ROLE_AMBASSADEUR) && !rolesAdded.includes('🌟 Ambassadeur') ? '🌟 Ambassadeur — **déjà actif**' : '🌟 Ambassadeur — ✅ activé') : '🌟 Ambassadeur — 🔒 non atteint')

    const embed = new EmbedBuilder()
      .setColor('#C9A84C')
      .setTitle(`✅ ${name} — Vérification DJOBI`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'DJOBI • Trade. Gagne. Vis.' })

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
