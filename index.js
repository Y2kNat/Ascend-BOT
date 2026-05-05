require('dotenv').config();
const {
  Client, GatewayIntentBits, ActivityType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder,
  REST, Routes, PermissionFlagsBits, ModalBuilder,
  TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ChannelType, Colors
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ============================================
// CONSTANTES DO .ENV
// ============================================
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const LINK_CHANNEL_ID = process.env.LINK_CHANNEL;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL;

// Carregar tiers dinamicamente (suporta quantos quiser no .env)
const TIERS_CONFIG = {};
let tierCount = 1;
while (process.env[`TIER_${tierCount}`]) {
  TIERS_CONFIG[tierCount] = {
    roleId: process.env[`TIER_${tierCount}`],
    sessionsNeeded: parseInt(process.env[`TIER_${tierCount}_SESSION`]) || 0
  };
  tierCount++;
}
const MAX_TIERS = tierCount - 1;

// ============================================
// CORES E EMOJIS DOS TIERS
// ============================================
const TIER_COLORS = {
  1: '#808080', // Cinza
  2: '#00FF00', // Verde
  3: '#0099FF', // Azul
  4: '#9932CC', // Roxo
  5: '#FFD700'  // Dourado
};

const TIER_EMOJIS = {
  1: '🥉',
  2: '🥈',
  3: '🥇',
  4: '💎',
  5: '👑'
};

const TIER_NAMES = {
  1: 'Iniciante',
  2: 'Aprendiz',
  3: 'Intermediário',
  4: 'Avançado',
  5: 'Mestre'
};

const PROMOTION_MESSAGES = {
  2: '🌟 Você está evoluindo! Continue participando das sessões para desbloquear mais benefícios.',
  3: '🔥 Cada vez mais forte! Mais responsabilidades e vantagens te aguardam no servidor.',
  4: '💎 Quase no topo! Você já é uma referência no servidor. Continue assim!',
  5: '👑 Você atingiu o ápice! O servidor te respeita como um verdadeiro líder.'
};

const PROMOTION_TITLES = {
  2: '🌟 EVOLUÇÃO ALCANÇADA!',
  3: '🔥 PODER AUMENTADO!',
  4: '💎 LENDA EM ASCENSÃO!',
  5: '👑 MESTRE SUPREMO!'
};

// ============================================
// UTILITÁRIOS DE ARQUIVO
// ============================================
function readJSON(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.trim()) {
        return JSON.parse(content);
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao ler ${filePath}:`, error.message);
  }
  return typeof fallback === 'function' ? fallback() : fallback;
}

function writeJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`❌ Erro ao escrever ${filePath}:`, error.message);
    return false;
  }
}

function safeDelete(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // Silencioso
  }
}

// ============================================
// SISTEMA DE LOG
// ============================================
class Logger {
  static log(level, message, data = null) {
    const timestamp = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const emojis = {
      info: '📘',
      warn: '⚠️',
      error: '❌',
      success: '✅',
      debug: '🔍',
      session: '🔗',
      promote: '🎉',
      backup: '💾'
    };

    const emoji = emojis[level] || '📝';
    console.log(`${emoji} [${timestamp}] ${message}`);
    
    if (data) {
      console.log('   └─', JSON.stringify(data, null, 2));
    }
  }

  static info(message, data) { this.log('info', message, data); }
  static warn(message, data) { this.log('warn', message, data); }
  static error(message, data) { this.log('error', message, data); }
  static success(message, data) { this.log('success', message, data); }
  static debug(message, data) { this.log('debug', message, data); }
  static session(message, data) { this.log('session', message, data); }
  static promote(message, data) { this.log('promote', message, data); }
  static backup(message, data) { this.log('backup', message, data); }
}

// ============================================
// DATABASE SIMPLIFICADA
// Apenas 2 arquivos por servidor: config.json e users.json
// ============================================
class GuildDB {
  constructor(guildId) {
    this.guildId = guildId;
    this.base = path.join(__dirname, 'data', 'guilds', guildId);
    
    if (!fs.existsSync(this.base)) {
      fs.mkdirSync(this.base, { recursive: true });
      Logger.info(`📁 Pasta criada para o servidor ${guildId}`);
    }

    this.configPath = path.join(this.base, 'config.json');
    this.usersPath = path.join(this.base, 'users.json');
    this.sessionsPath = path.join(this.base, 'sessions.json');
    this.joinsPath = path.join(this.base, 'joins.json');

    this.initializeFiles();
  }

  initializeFiles() {
    // Config.json
    if (!fs.existsSync(this.configPath)) {
      const defaultConfig = {
        guildId: this.guildId,
        guildName: 'Servidor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '9.0',
        link: {
          url: '',
          name: 'Servidor RP',
          description: 'Bem-vindo(a) à sessão! Siga as regras e divirta-se com responsabilidade.',
          configuredAt: null,
          configuredBy: null
        },
        tiers: {},
        settings: {
          allowExtraDays: false,
          extraDates: [],
          maxDailyRequests: 1,
          cooldownMinutes: 5,
          autoBackupHours: 6,
          sessionOpen: null,
          sessionCancelled: false,
          sessionTime: null,
          enableCountdown: true,
          showMemberCount: true,
          notifications: {
            promotion: true,
            sessionStart: true,
            sessionEnd: true
          }
        }
      };

      // Preencher tiers com dados do .env
      for (let i = 1; i <= MAX_TIERS; i++) {
        defaultConfig.tiers[`TIER_${i}`] = {
          roleId: TIERS_CONFIG[i]?.roleId || '',
          sessionsNeeded: TIERS_CONFIG[i]?.sessionsNeeded || 0,
          name: TIER_NAMES[i] || `Tier ${i}`,
          emoji: TIER_EMOJIS[i] || '⭐',
          color: TIER_COLORS[i] || '#808080'
        };
      }

      writeJSON(this.configPath, defaultConfig);
      Logger.success(`✅ config.json criado para o servidor ${this.guildId}`);
    }

    // Users.json
    if (!fs.existsSync(this.usersPath)) {
      writeJSON(this.usersPath, {
        _metadata: {
          createdAt: new Date().toISOString(),
          totalUsers: 0,
          lastSync: null
        }
      });
    }

    // Sessions.json
    if (!fs.existsSync(this.sessionsPath)) {
      writeJSON(this.sessionsPath, {
        _metadata: {
          createdAt: new Date().toISOString(),
          totalSessions: 0,
          lastSession: null
        }
      });
    }

    // Joins.json
    if (!fs.existsSync(this.joinsPath)) {
      writeJSON(this.joinsPath, {
        _metadata: {
          createdAt: new Date().toISOString(),
          totalJoins: 0,
          lastJoin: null
        }
      });
    }
  }

  // Getters e Setters
  get config() { return readJSON(this.configPath); }
  setConfig(data) {
    data.updatedAt = new Date().toISOString();
    writeJSON(this.configPath, data);
  }

  get users() {
    const data = readJSON(this.usersPath);
    // Remove metadados internos
    const { _metadata, ...users } = data;
    return users;
  }

  setUsers(data) {
    const metadata = readJSON(this.usersPath)._metadata || {};
    metadata.totalUsers = Object.keys(data).length;
    metadata.lastSync = new Date().toISOString();
    writeJSON(this.usersPath, { _metadata: metadata, ...data });
  }

  get sessions() {
    const data = readJSON(this.sessionsPath);
    const { _metadata, ...sessions } = data;
    return sessions;
  }

  setSessions(data) {
    const metadata = readJSON(this.sessionsPath)._metadata || {};
    const values = Object.values(data).filter(v => typeof v === 'number');
    metadata.totalSessions = values.reduce((a, b) => a + b, 0);
    metadata.lastSession = new Date().toISOString();
    writeJSON(this.sessionsPath, { _metadata: metadata, ...data });
  }

  get joins() {
    const data = readJSON(this.joinsPath);
    const { _metadata, ...joins } = data;
    return Object.values(joins).flat();
  }

  addJoin(userId, username, tier) {
    const data = readJSON(this.joinsPath);
    const metadata = data._metadata || {};
    
    if (!data[userId]) data[userId] = [];
    
    const joinRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      username,
      tier,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    
    data[userId].push(joinRecord);
    metadata.totalJoins = (metadata.totalJoins || 0) + 1;
    metadata.lastJoin = new Date().toISOString();
    
    writeJSON(this.joinsPath, { _metadata: metadata, ...data });
    return joinRecord;
  }

  getUserJoins(userId) {
    const data = readJSON(this.joinsPath);
    return data[userId] || [];
  }

  // Métodos de usuário
  getUser(userId) {
    const users = this.users;
    return users[userId] || null;
  }

  setUser(userId, data) {
    const users = this.users;
    const existing = users[userId] || {};
    
    users[userId] = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString()
    };

    // Se é novo usuário, adicionar data de criação
    if (!existing.createdAt) {
      users[userId].createdAt = new Date().toISOString();
    }

    this.setUsers(users);
  }

  getUserTier(userId) {
    const user = this.getUser(userId);
    return user?.tier || 0;
  }

  getSessions(userId) {
    const sessions = this.sessions;
    return sessions[userId] || 0;
  }

  addSession(userId) {
    const sessions = this.sessions;
    sessions[userId] = (sessions[userId] || 0) + 1;
    this.setSessions(sessions);
    return sessions[userId];
  }

  canRequestToday(userId) {
    const today = new Date().toISOString().split('T')[0];
    const user = this.getUser(userId);
    const config = this.config;
    const maxRequests = config.settings?.maxDailyRequests || 1;
    const todayRequests = user?.dailyRequests?.[today] || 0;
    
    return todayRequests < maxRequests;
  }

  addTodayRequest(userId) {
    const user = this.getUser(userId) || {};
    const today = new Date().toISOString().split('T')[0];
    
    if (!user.dailyRequests) user.dailyRequests = {};
    user.dailyRequests[today] = (user.dailyRequests[today] || 0) + 1;
    user.lastRequest = Date.now();
    user.totalRequests = (user.totalRequests || 0) + 1;
    
    this.setUser(userId, user);
  }

  isOnCooldown(userId) {
    const user = this.getUser(userId);
    if (!user?.lastRequest) return false;
    
    const config = this.config;
    const cooldownMs = (config.settings?.cooldownMinutes || 5) * 60000;
    const elapsed = Date.now() - user.lastRequest;
    
    return elapsed < cooldownMs;
  }

  getCooldownRemaining(userId) {
    const user = this.getUser(userId);
    if (!user?.lastRequest) return 0;
    
    const config = this.config;
    const cooldownMs = (config.settings?.cooldownMinutes || 5) * 60000;
    const elapsed = Date.now() - user.lastRequest;
    
    return Math.max(0, cooldownMs - elapsed);
  }

  getRemainingRequests(userId) {
    const today = new Date().toISOString().split('T')[0];
    const user = this.getUser(userId);
    const config = this.config;
    const maxRequests = config.settings?.maxDailyRequests || 1;
    const todayRequests = user?.dailyRequests?.[today] || 0;
    
    return Math.max(0, maxRequests - todayRequests);
  }

  // Ranking
  getRanking() {
    const users = this.users;
    const ranking = Object.entries(users)
      .map(([id, data]) => ({
        userId: id,
        username: data.username || 'Desconhecido',
        tier: data.tier || 0,
        sessions: this.getSessions(id),
        totalRequests: data.totalRequests || 0,
        joinedAt: data.createdAt
      }))
      .filter(u => u.tier > 0)
      .sort((a, b) => {
        // Ordenar por tier (maior primeiro), depois por sessões
        if (b.tier !== a.tier) return b.tier - a.tier;
        return b.sessions - a.sessions;
      });

    return ranking;
  }

  getUserRank(userId) {
    const ranking = this.getRanking();
    const index = ranking.findIndex(u => u.userId === userId);
    return index >= 0 ? index + 1 : 0;
  }

  getTotalUsers() {
    const users = this.users;
    return Object.keys(users).length;
  }

  getActiveUsers() {
    const users = this.users;
    return Object.values(users).filter(u => u.tier > 0).length;
  }

  // Sincronização
  async syncAll(guild) {
    try {
      const members = await guild.members.fetch();
      const config = this.config;
      const users = this.users;

      let syncedCount = 0;

      for (const [, member] of members) {
        if (member.user.bot) continue;

        // Detectar tier pelo cargo do Discord
        let detectedTier = 0;
        for (let i = MAX_TIERS; i >= 1; i--) {
          const roleId = config.tiers[`TIER_${i}`]?.roleId;
          if (roleId && member.roles.cache.has(roleId)) {
            detectedTier = i;
            break;
          }
        }

        const userData = users[member.id] || {};

        // Preparar dados atualizados
        const updatedData = {
          username: member.user.username,
          displayName: member.displayName || member.user.username,
          discriminator: member.user.discriminator || '0',
          avatar: member.user.displayAvatarURL({ dynamic: true }),
          tier: detectedTier,
          joinedDiscord: member.user.createdAt?.toISOString(),
          joinedServer: member.joinedAt?.toISOString()
        };

        // Se tem tier mas não tem sessões, inicializa com o mínimo
        if (detectedTier > 0 && this.getSessions(member.id) === 0) {
          const minSessions = TIERS_CONFIG[detectedTier]?.sessionsNeeded || 0;
          if (minSessions > 0) {
            const sessions = this.sessions;
            sessions[member.id] = minSessions;
            this.setSessions(sessions);
          }
        }

        // Manter dados existentes que não devem ser sobrescritos
        if (userData.dailyRequests) updatedData.dailyRequests = userData.dailyRequests;
        if (userData.totalRequests) updatedData.totalRequests = userData.totalRequests;
        if (userData.lastRequest) updatedData.lastRequest = userData.lastRequest;

        this.setUser(member.id, updatedData);
        syncedCount++;
      }

      Logger.success(`👥 ${syncedCount} membros sincronizados no servidor ${guild.name}`);
      return syncedCount;
    } catch (error) {
      Logger.error(`❌ Erro ao sincronizar membros: ${error.message}`);
      return 0;
    }
  }
}

// Cache de GuildDB
const guildDBCache = new Map();

function getDB(guildId) {
  if (!guildDBCache.has(guildId)) {
    guildDBCache.set(guildId, new GuildDB(guildId));
  }
  return guildDBCache.get(guildId);
}

function clearDBCache(guildId) {
  guildDBCache.delete(guildId);
}

// ============================================
// SISTEMA DE BACKUP
// ============================================
async function createBackup(guildId) {
  try {
    const db = getDB(guildId);
    const backupBase = path.join(__dirname, 'data', 'guilds', guildId, 'backups');
    
    if (!fs.existsSync(backupBase)) {
      fs.mkdirSync(backupBase, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(backupBase, `backup_${timestamp}`);
    fs.mkdirSync(backupDir, { recursive: true });

    // Copiar arquivos importantes
    const filesToBackup = [
      { source: db.configPath, dest: 'config.json' },
      { source: db.usersPath, dest: 'users.json' },
      { source: db.sessionsPath, dest: 'sessions.json' },
      { source: db.joinsPath, dest: 'joins.json' }
    ];

    let backedUpCount = 0;
    for (const { source, dest } of filesToBackup) {
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(backupDir, dest));
        backedUpCount++;
      }
    }

    // Manter apenas os últimos 10 backups
    const allBackups = fs.readdirSync(backupBase)
      .filter(f => f.startsWith('backup_'))
      .sort()
      .reverse();

    const backupsToDelete = allBackups.slice(10);
    for (const oldBackup of backupsToDelete) {
      const oldPath = path.join(backupBase, oldBackup);
      if (fs.existsSync(oldPath)) {
        fs.rmSync(oldPath, { recursive: true, force: true });
      }
    }

    Logger.backup(`💾 Backup criado: ${backupDir} (${backedUpCount} arquivos)`);
    return backupDir;
  } catch (error) {
    Logger.error(`❌ Erro ao criar backup: ${error.message}`);
    return null;
  }
}

// ============================================
// VALIDAÇÕES E UTILITÁRIOS DE TEMPO
// ============================================
class Validators {
  static isOwner(userId) {
    return userId === OWNER_ID;
  }

  static isSaturday() {
    return new Date().getDay() === 6;
  }

  static getToday() {
    return new Date().toISOString().split('T')[0];
  }

  static getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  static getNextSaturday() {
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntilSaturday = (6 - currentDay + 7) % 7;
    
    if (daysUntilSaturday === 0) {
      return 'Hoje!';
    }
    
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + daysUntilSaturday);
    
    return nextSaturday.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  static daysUntilNextSession() {
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntil = (6 - currentDay + 7) % 7;
    return daysUntil === 0 ? 0 : daysUntil;
  }

  static isValidDate(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
    
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) return false;
    
    // Verificar se a data é válida (não 31 de fevereiro, etc)
    const [year, month, day] = dateString.split('-').map(Number);
    return date.getFullYear() === year &&
           date.getMonth() + 1 === month &&
           date.getDate() === day;
  }

  static isValidTime(timeString) {
    if (!timeString) return true;
    if (!/^\d{2}:\d{2}$/.test(timeString)) return false;
    
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  /**
   * Verifica se a sessão está liberada AGORA
   */
  static isAllowedDay(guildId) {
    const db = getDB(guildId);
    const cfg = db.config;
    const today = this.getToday();
    const currentTime = this.getCurrentTime();

    // Se foi cancelado manualmente
    if (cfg.settings?.sessionCancelled) {
      // Resetar cancelamento se mudou o dia
      const cancelDate = cfg.updatedAt 
        ? new Date(cfg.updatedAt).toISOString().split('T')[0] 
        : null;
      
      if (cancelDate !== today) {
        cfg.settings.sessionCancelled = false;
        cfg.settings.sessionOpen = null;
        db.setConfig(cfg);
        // Continuar verificando...
      } else {
        return false;
      }
    }

    // Se foi aberto manualmente, permite sempre
    if (cfg.settings?.sessionOpen === true) {
      return true;
    }

    // Verificar dia da semana e datas extras
    const isSaturday = this.isSaturday();
    const isExtraDay = cfg.settings?.extraDates?.includes(today);
    
    if (!isSaturday && !isExtraDay) {
      return false;
    }

    // Se não tem horário configurado, liberado o dia todo
    const sessionTime = cfg.settings?.sessionTime;
    if (!sessionTime) {
      return true;
    }

    // Verificar horário
    return currentTime >= sessionTime;
  }

  /**
   * Retorna timestamp Unix para countdown ou null
   */
  static getCountdownTimestamp(guildId) {
    const db = getDB(guildId);
    const cfg = db.config;
    const now = new Date();
    const today = this.getToday();

    // Não mostrar countdown se cancelado ou aberto manualmente
    if (cfg.settings?.sessionCancelled) return null;
    if (cfg.settings?.sessionOpen === true) return null;

    const isSaturday = this.isSaturday();
    const isExtraDay = cfg.settings?.extraDates?.includes(today);
    
    if (!isSaturday && !isExtraDay) return null;

    const sessionTime = cfg.settings?.sessionTime;
    if (!sessionTime) return null; // Sem horário = já liberado

    const currentTime = this.getCurrentTime();
    if (currentTime >= sessionTime) return null; // Já passou

    // Criar timestamp para hoje no horário configurado
    const [hours, minutes] = sessionTime.split(':').map(Number);
    const sessionDate = new Date();
    sessionDate.setHours(hours, minutes, 0, 0);

    if (sessionDate > now) {
      return Math.floor(sessionDate.getTime() / 1000);
    }

    return null;
  }

  /**
   * Verifica se a sessão de hoje já foi finalizada
   */
  static isSessionFinished(guildId) {
    const db = getDB(guildId);
    const cfg = db.config;
    const today = this.getToday();

    // Não mostrar como finalizada se cancelada ou aberta manualmente
    if (cfg.settings?.sessionCancelled) return false;
    if (cfg.settings?.sessionOpen === true) return false;

    const isSaturday = this.isSaturday();
    const isExtraDay = cfg.settings?.extraDates?.includes(today);
    
    if (!isSaturday && !isExtraDay) return false;

    // Se não tem horário, finaliza às 23:59
    const sessionTime = cfg.settings?.sessionTime;
    if (!sessionTime) {
      const now = new Date();
      return now.getHours() >= 23 && now.getMinutes() >= 59;
    }

    // Se tem horário e já passou
    const currentTime = this.getCurrentTime();
    if (currentTime >= sessionTime) {
      // Verificar se a sessão foi usada (alguém pegou link)
      const db = getDB(guildId);
      const joins = db.joins;
      const todayJoins = joins.filter(j => j.date === today);
      
      // Se ninguém pegou link, ainda não foi "finalizada"
      // Só mostra como finalizada se passou do horário E alguém usou
      // OU se já é o dia seguinte (meia-noite)
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        return true; // Meia-noite
      }
      
      return currentTime >= sessionTime;
    }

    return false;
  }

  static cleanExpiredDates(guildId) {
    const db = getDB(guildId);
    const cfg = db.config;
    
    if (!cfg.settings?.extraDates?.length) return false;

    const today = this.getToday();
    const beforeCount = cfg.settings.extraDates.length;
    
    cfg.settings.extraDates = cfg.settings.extraDates.filter(date => date >= today);
    
    const afterCount = cfg.settings.extraDates.length;
    const removed = beforeCount - afterCount;

    if (removed > 0) {
      if (afterCount === 0) {
        cfg.settings.allowExtraDays = false;
      }
      db.setConfig(cfg);
      Logger.info(`🗑️ ${removed} datas expiradas removidas`);
      return true;
    }

    return false;
  }
}

// ============================================
// TIER MANAGER
// ============================================
class TierManager {
  static getUserTier(guildId, userId) {
    return getDB(guildId).getUserTier(userId);
  }

  static getTierInfo(guildId, level) {
    const db = getDB(guildId);
    const config = db.config;
    return config.tiers[`TIER_${level}`] || null;
  }

  static getProgress(guildId, userId) {
    const db = getDB(guildId);
    const currentTier = db.getUserTier(userId);
    const sessionsDone = db.getSessions(userId);
    const config = db.config;

    // Sem tier
    if (currentTier === 0) {
      return {
        noTier: true,
        sessionsDone,
        message: 'Você ainda não possui um tier. Continue participando das sessões para evoluir!'
      };
    }

    const currentTierData = config.tiers[`TIER_${currentTier}`];
    const nextTierData = config.tiers[`TIER_${currentTier + 1}`];

    // Tier máximo
    if (!nextTierData) {
      return {
        maxTier: true,
        currentTier,
        sessionsDone,
        tierData: currentTierData,
        message: '🌟 Parabéns! Você atingiu o tier máximo do servidor!'
      };
    }

    // Em progresso
    const sessionsNeeded = nextTierData.sessionsNeeded || 0;
    const progress = sessionsNeeded > 0 
      ? Math.min(100, (sessionsDone / sessionsNeeded) * 100) 
      : 100;

    const remaining = Math.max(0, sessionsNeeded - sessionsDone);

    return {
      maxTier: false,
      currentTier,
      nextTierLevel: currentTier + 1,
      sessionsDone,
      sessionsNeeded,
      progress,
      remaining,
      tierData: currentTierData,
      nextTierData,
      message: remaining > 0 
        ? `Faltam **${remaining} sessão(ões)** para o próximo tier!` 
        : '🎉 Você já pode ser promovido!'
    };
  }

  static async promote(member) {
    const guildId = member.guild.id;
    const userId = member.id;
    const db = getDB(guildId);
    
    const currentTier = db.getUserTier(userId);
    if (currentTier === 0 || currentTier >= MAX_TIERS) {
      return null;
    }

    const config = db.config;
    const nextTier = config.tiers[`TIER_${currentTier + 1}`];
    if (!nextTier) return null;

    const sessions = db.getSessions(userId);
    const sessionsNeeded = nextTier.sessionsNeeded || 0;

    if (sessionsNeeded > 0 && sessions >= sessionsNeeded) {
      try {
        // Remove cargo atual
        const currentTierConfig = config.tiers[`TIER_${currentTier}`];
        if (currentTierConfig?.roleId) {
          await member.roles.remove(currentTierConfig.roleId).catch(err => {
            Logger.warn(`Erro ao remover cargo Tier ${currentTier}: ${err.message}`);
          });
          Logger.promote(`📤 Cargo Tier ${currentTier} removido de ${member.user.tag}`);
        }

        // Adiciona novo cargo
        if (nextTier.roleId) {
          await member.roles.add(nextTier.roleId).catch(err => {
            Logger.warn(`Erro ao adicionar cargo Tier ${currentTier + 1}: ${err.message}`);
          });
          Logger.promote(`📥 Cargo Tier ${currentTier + 1} adicionado a ${member.user.tag}`);
        }

        // Atualiza banco de dados
        db.setUser(userId, { 
          tier: currentTier + 1, 
          username: member.user.username,
          lastPromotion: new Date().toISOString()
        });

        return {
          promoted: true,
          from: currentTier,
          to: currentTier + 1,
          sessions: sessions,
          tierData: nextTier
        };
      } catch (error) {
        Logger.error(`❌ Erro na promoção de ${member.user.tag}: ${error.message}`);
      }
    }

    return null;
  }

  static getTierColor(level) {
    const colorMap = {
      1: Colors.Grey,
      2: Colors.Green,
      3: Colors.Blue,
      4: Colors.Purple,
      5: Colors.Gold
    };
    return colorMap[level] || Colors.Grey;
  }

  static getTierEmoji(level) {
    return TIER_EMOJIS[level] || '⭐';
  }

  static getTierName(level) {
    return TIER_NAMES[level] || `Tier ${level}`;
  }
}

console.log('✅ [1/4] Database, Validators e TierManager carregados com sucesso!');
// ============================================
// ASCEND SYSTEM v9.0 - PARTE 2/4
// Sistema de Embeds Premium e Modais
// ============================================

// ============================================
// SISTEMA DE EMBEDS PREMIUM
// ============================================
class Embeds {
  /**
   * Painel de Link - Embed principal do canal de links
   * Design premium com informações completas
   */
  static linkPanel(guildId) {
    const db = getDB(guildId);
    const cfg = db.config;
    const today = Validators.getToday();
    const isSaturday = Validators.isSaturday();
    const isExtraDay = cfg.settings?.extraDates?.includes(today);
    const isCancelled = cfg.settings?.sessionCancelled;
    const isManualOpen = cfg.settings?.sessionOpen === true;
    const isAllowed = Validators.isAllowedDay(guildId);
    const daysUntil = Validators.daysUntilNextSession();
    const countdownTimestamp = Validators.getCountdownTimestamp(guildId);
    const sessionTime = cfg.settings?.sessionTime;
    const currentTime = Validators.getCurrentTime();
    const isFinished = Validators.isSessionFinished(guildId);
    const memberCount = db.getTotalUsers();
    const activeUsers = db.getActiveUsers();

    // Variáveis do status
    let statusText = '';
    let statusEmoji = '';
    let statusColor = Colors.Red;
    let descriptionExtra = '';
    let thumbnailUrl = null;

    // Lógica de status
    if (isAllowed) {
      // ✅ SESSÃO LIBERADA
      statusColor = Colors.Green;
      statusEmoji = '✅';
      
      if (isManualOpen) {
        statusText = 'SESSÃO ABERTA PELA STAFF';
        descriptionExtra = '🔓 A staff liberou a sessão manualmente.';
      } else if (isSaturday && isExtraDay) {
        statusText = 'SÁBADO + DIA EXTRA';
        descriptionExtra = '🎉 Hoje é sábado E dia extra! Sessão duplamente especial!';
      } else if (isSaturday) {
        statusText = 'SÁBADO - SESSÃO OFICIAL';
        descriptionExtra = '📅 Sessão automática de sábado.';
      } else if (isExtraDay) {
        statusText = 'DIA EXTRA - SESSÃO ESPECIAL';
        descriptionExtra = '🎊 Sessão extra liberada pela staff!';
      }
      
      if (sessionTime && !isManualOpen) {
        statusText += ` (desde ${sessionTime})`;
      }
      
      descriptionExtra += '\n\n**Clique no botão abaixo para receber o link de acesso!** 🔗';
      thumbnailUrl = 'https://message.style/cdn/images/c7edfe1a8b576f3d38ee597dd42df0f441efd192f599f6f09cbd0b9033abf726.png '; // Ícone verde
      
    } else if (countdownTimestamp) {
      // ⏰ AGUARDANDO HORÁRIO
      statusColor = Colors.Orange;
      statusEmoji = '⏰';
      statusText = 'AGUARDANDO HORÁRIO DA SESSÃO';
      
      const timeUntil = countdownTimestamp - Math.floor(Date.now() / 1000);
      const hours = Math.floor(timeUntil / 3600);
      const minutes = Math.floor((timeUntil % 3600) / 60);
      
      descriptionExtra = [
        `### ⏰ A sessão começará em breve!`,
        ``,
        `**Tempo restante:** <t:${countdownTimestamp}:R>`,
        `**Horário previsto:** <t:${countdownTimestamp}:t>`,
        ``,
        hours > 0 
          ? `⏳ Aproximadamente **${hours}h ${minutes}min** para o início.` 
          : `⏳ Aproximadamente **${minutes} minutos** para o início.`,
        ``,
        `💡 *O botão de link aparecerá automaticamente no horário marcado.*`
      ].join('\n');
      
      thumbnailUrl = 'https://message.style/cdn/images/c7edfe1a8b576f3d38ee597dd42df0f441efd192f599f6f09cbd0b9033abf726.png '; // Ícone laranja
      
    } else if (isCancelled) {
      // 🚫 SESSÃO CANCELADA
      statusEmoji = '🚫';
      statusText = 'SESSÃO CANCELADA';
      descriptionExtra = [
        `### 🚫 Sessão Cancelada`,
        ``,
        `A sessão programada para hoje foi cancelada pela staff do servidor.`,
        ``,
        `📅 **Próximo sábado:** ${Validators.getNextSaturday()}`,
        ``,
        `💡 *Fique atento ao canal para novas informações.*`
      ].join('\n');
      
      thumbnailUrl = 'https://message.style/cdn/images/c7edfe1a8b576f3d38ee597dd42df0f441efd192f599f6f09cbd0b9033abf726.png '; // Ícone vermelho
      
    } else if (isFinished) {
      // 🏁 SESSÃO FINALIZADA
      statusColor = Colors.Grey;
      statusEmoji = '🏁';
      statusText = 'SESSÃO FINALIZADA';
      
      descriptionExtra = [
        `### 🏁 Sessão Encerrada`,
        ``,
        sessionTime 
          ? `A sessão de hoje foi encerrada às **${sessionTime}**.` 
          : `A sessão de hoje já foi encerrada.`,
        ``,
        `Agradecemos a participação de todos!`,
        ``,
        `📅 **Próximo sábado:** ${Validators.getNextSaturday()}`,
        `⏰ Faltam **${daysUntil} dia(s)** para a próxima sessão.`,
        ``,
        `💡 *Continue participando para evoluir seu tier!*`
      ].join('\n');
      
      thumbnailUrl = 'https://message.style/cdn/images/c7edfe1a8b576f3d38ee597dd42df0f441efd192f599f6f09cbd0b9033abf726.png '; // Ícone cinza
      
    } else {
      // ❌ SESSÃO FECHADA
      statusEmoji = '❌';
      statusText = 'SESSÃO FECHADA';
      
      descriptionExtra = [
        `### ❌ Sessão Indisponível`,
        ``,
        `Não há sessão programada para hoje.`,
        ``,
        `📅 **Próximo sábado:** ${Validators.getNextSaturday()}`,
        `⏰ Faltam **${daysUntil} dia(s)** para a próxima sessão.`,
        ``,
        `💡 *As sessões ocorrem aos sábados e em dias extras liberados pela staff.*`
      ].join('\n');
      
      thumbnailUrl = 'https://message.style/cdn/images/c7edfe1a8b576f3d38ee597dd42df0f441efd192f599f6f09cbd0b9033abf726.png '; // Ícone vermelho
    }

    // Construir embed
    const embed = new EmbedBuilder()
      .setColor(statusColor)
      .setTitle('🔗 SISTEMA DE SESSÃO')
      .setDescription([
        `### 📅 ${new Date().toLocaleDateString('pt-BR', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long',
          year: 'numeric'
        })}`,
        '',
        `## ${statusEmoji} ${statusText}`,
        '',
        descriptionExtra
      ].join('\n'));

    // Informações do servidor
    const infoFields = [
      `🏠 **Servidor:** ${cfg.link.name || 'Não configurado'}`,
      `👥 **Membros totais:** ${memberCount}`,
      `🌟 **Membros ativos:** ${activeUsers}`,
      `📊 **Limite diário:** ${cfg.settings?.maxDailyRequests || 1} solicitação(ões) por pessoa`,
      `⏰ **Cooldown:** ${cfg.settings?.cooldownMinutes || 5} minutos entre solicitações`,
      sessionTime ? `🕐 **Horário da sessão:** ${sessionTime}` : '🕐 **Horário:** Dia todo',
      `🕐 **Hora atual:** ${currentTime}`
    ];

    if (isExtraDay && !isSaturday) {
      infoFields.push('📅 **Hoje é um dia extra especial!**');
    }
    
    if (isSaturday) {
      infoFields.push('📅 **Hoje é sábado - dia oficial de sessão!**');
    }

    embed.addFields({
      name: '📊 INFORMAÇÕES DO SERVIDOR',
      value: infoFields.join('\n'),
      inline: false
    });

    // Dias extras agendados
    if (cfg.settings?.extraDates?.length > 0) {
      const formattedDates = cfg.settings.extraDates.map(date => {
        const dateObj = new Date(date + 'T00:00:00');
        const formatted = dateObj.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        });
        const isToday = date === today;
        return `${isToday ? '🟢' : '📌'} ${formatted}${isToday ? ' **(HOJE)**' : ''}`;
      }).join('\n');

      embed.addFields({
        name: '📅 DIAS EXTRAS AGENDADOS',
        value: formattedDates,
        inline: false
      });
    }

    // Tiers disponíveis
    const tiersInfo = Object.entries(cfg.tiers).map(([key, value]) => {
      const level = parseInt(key.split('_')[1]);
      const emoji = TierManager.getTierEmoji(level);
      const name = value.name || TierManager.getTierName(level);
      const sessions = value.sessionsNeeded;
      return `${emoji} **${name}**: ${sessions} sessões necessárias`;
    }).join('\n');

    embed.addFields({
      name: '🏆 TIERS DISPONÍVEIS',
      value: tiersInfo,
      inline: false
    });

    // Thumbnail
    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    // Footer com informações úteis
    embed.setFooter({
      text: `Ascend System v9.0 • /acess para controlar • Atualizado em ${currentTime}`,
      iconURL: 'https://message.style/cdn/images/c7edfe1a8b576f3d38ee597dd42df0f441efd192f599f6f09cbd0b9033abf726.png '
    });

    embed.setTimestamp();

    return embed;
  }

  /**
   * Mensagem de Boas-vindas - Enviada ao usuário que solicita link
   * Design premium com cores do tier do usuário
   */
  static welcomeMessage(guildId, user, tier) {
    const db = getDB(guildId);
    const link = db.config.link;
    const color = TierManager.getTierColor(tier);
    const emoji = TierManager.getTierEmoji(tier);
    const tierName = TierManager.getTierName(tier);
    const sessions = db.getSessions(user.id);
    const remainingRequests = db.getRemainingRequests(user.id);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} BEM-VINDO(A) À SESSÃO!`)
      .setDescription([
        `### Olá, **${user.username}**!`,
        '',
        `Seja muito bem-vindo(a) à sessão de hoje!`,
        '',
        `🏆 **Seu Tier:** ${tierName} (Tier ${tier})`,
        `📝 **Sessões totais:** ${sessions}`,
        '',
        link.description || 'Siga as regras e divirta-se com responsabilidade!'
      ].join('\n'))
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields([
        {
          name: '🔗 LINK DE ACESSO',
          value: link.url 
            ? `**[Clique aqui para entrar no servidor](${link.url})**` 
            : '⚠️ Link não configurado. Contate um administrador.',
          inline: false
        },
        {
          name: '⚠️ REGRAS IMPORTANTES',
          value: [
            '• Respeite todos os membros',
            '• Siga as orientações da equipe',
            '• Mantenha o roleplay',
            '• Divirta-se com responsabilidade',
            '• Reporte problemas aos administradores'
          ].join('\n'),
          inline: false
        },
        {
          name: '📊 SUAS INFORMAÇÕES',
          value: [
            `• Solicitações restantes hoje: **${remainingRequests}**`,
            `• Próximo tier: **${tier < MAX_TIERS ? TierManager.getTierName(tier + 1) : 'Máximo'}**`
          ].join('\n'),
          inline: false
        }
      ])
      .setFooter({
        text: `${link.name || 'Servidor'} • Sessão válida apenas hoje • Tier ${tier}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTimestamp();

    return embed;
  }

  /**
   * Comando /mytier - Perfil completo e premium do usuário
   */
  static myTier(guildId, user) {
    const db = getDB(guildId);
    const tier = db.getUserTier(user.id);
    const sessions = db.getSessions(user.id);
    const rank = db.getUserRank(user.id);
    const totalUsers = db.getTotalUsers();
    const activeUsers = db.getActiveUsers();
    const progress = TierManager.getProgress(guildId, user.id);
    const userData = db.getUser(user.id);
    const nextSaturday = Validators.getNextSaturday();
    const color = TierManager.getTierColor(tier);
    const emoji = TierManager.getTierEmoji(tier);
    const tierName = TierManager.getTierName(tier);
    const remainingRequests = db.getRemainingRequests(user.id);
    const cooldownRemaining = db.isOnCooldown(user.id) ? db.getCooldownRemaining(user.id) : 0;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} PERFIL DE ${user.username.toUpperCase()}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }));

    if (tier === 0) {
      embed.setDescription([
        '### ⚠️ Nenhum Tier Encontrado',
        '',
        'Você ainda não possui um tier atribuído.',
        'Continue participando das sessões para evoluir!',
        '',
        `📅 **Próxima sessão:** ${nextSaturday}`
      ].join('\n'));
    } else {
      embed.setDescription([
        `### 🏆 ${tierName} (Tier ${tier})`,
        '',
        progress.message
      ].join('\n'));
    }

    // Estatísticas principais
    const statsFields = [
      `📝 **Sessões totais:** ${sessions}`,
      `🏅 **Ranking:** ${rank > 0 ? `${rank}º de ${activeUsers} membros` : 'Não rankeado'}`,
      `📅 **Próxima sessão:** ${nextSaturday}`,
      tier > 0 ? `🎭 **Cargo:** <@&${db.config.tiers[`TIER_${tier}`]?.roleId || 'N/A'}>` : null,
      `📊 **Solicitações restantes hoje:** ${remainingRequests}`
    ].filter(Boolean).join('\n');

    embed.addFields({
      name: '📊 ESTATÍSTICAS',
      value: statsFields,
      inline: false
    });

    // Cooldown
    if (cooldownRemaining > 0) {
      const minutes = Math.ceil(cooldownRemaining / 60000);
      embed.addFields({
        name: '⏳ COOLDOWN ATIVO',
        value: `Aguarde **${minutes} minuto(s)** para solicitar o link novamente.`,
        inline: false
      });
    }

    // Barra de progresso
    if (!progress.maxTier && !progress.noTier && progress.sessionsNeeded > 0) {
      const barLength = 20;
      const filled = Math.floor((progress.progress / 100) * barLength);
      const empty = barLength - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      const nextTierEmoji = TierManager.getTierEmoji(progress.nextTierLevel);
      const nextTierName = TierManager.getTierName(progress.nextTierLevel);

      embed.addFields({
        name: `📈 PRÓXIMO TIER: ${nextTierEmoji} ${nextTierName} (Tier ${progress.nextTierLevel})`,
        value: [
          `\`${bar}\``,
          `**${progress.progress.toFixed(1)}%** concluído`,
          `📊 **${progress.sessionsDone}/${progress.sessionsNeeded}** sessões`,
          `📅 Faltam **${progress.remaining}** sessão(ões)`,
          '',
          progress.remaining <= 3 
            ? '🔥 **Você está muito próximo! Continue assim!**' 
            : '💪 Continue participando para evoluir!'
        ].join('\n'),
        inline: false
      });
    } else if (progress.maxTier) {
      embed.addFields({
        name: '👑 TIER MÁXIMO ALCANÇADO',
        value: [
          '🎉 Parabéns! Você atingiu o tier máximo do servidor!',
          '',
          '🌟 Você é uma referência para a comunidade.',
          '💎 Continue participando e ajudando outros membros.'
        ].join('\n'),
        inline: false
      });
    }

    // Histórico de sessões
    const userJoins = db.getUserJoins(user.id);
    if (userJoins.length > 0) {
      const recentJoins = userJoins.slice(-5).reverse();
      const joinHistory = recentJoins.map(j => 
        `• 📅 ${j.date} às ${j.time} - Tier ${j.tier} ${TierManager.getTierEmoji(j.tier)}`
      ).join('\n');

      embed.addFields({
        name: '📋 ÚLTIMAS 5 SESSÕES',
        value: joinHistory || 'Nenhuma sessão registrada',
        inline: false
      });
    }

    // Informações adicionais
    if (userData) {
      const memberSince = userData.createdAt 
        ? new Date(userData.createdAt).toLocaleDateString('pt-BR') 
        : 'Desconhecido';
      
      embed.addFields({
        name: 'ℹ️ INFORMAÇÕES ADICIONAIS',
        value: [
          `📅 Membro desde: **${memberSince}**`,
          `🔢 Total de solicitações: **${userData.totalRequests || 0}**`,
          userData.lastPromotion 
            ? `🎉 Última promoção: **${new Date(userData.lastPromotion).toLocaleDateString('pt-BR')}**` 
            : null
        ].filter(Boolean).join('\n'),
        inline: false
      });
    }

    embed.setFooter({
      text: 'Ascend System v9.0 • /mytier para ver seu progresso',
      iconURL: user.displayAvatarURL({ dynamic: true })
    });
    embed.setTimestamp();

    return embed;
  }

  /**
   * Mensagem de Promoção - Comemoração premium
   */
  static promotion(user, from, to, sessions) {
    const color = TierManager.getTierColor(to);
    const emoji = TierManager.getTierEmoji(to);
    const title = PROMOTION_TITLES[to] || '🎉 PROMOÇÃO!';
    const message = PROMOTION_MESSAGES[to] || 'Parabéns pela evolução!';
    const fromName = TierManager.getTierName(from);
    const toName = TierManager.getTierName(to);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} ${title}`)
      .setDescription([
        `## 🎊 ${user.username} foi promovido(a)!`,
        '',
        `> ${message}`,
        '',
        `**${fromName}** → **${toName}**`
      ].join('\n'))
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields([
        {
          name: '📊 DETALHES DA PROMOÇÃO',
          value: [
            `🏆 **Tier anterior:** ${fromName} (Tier ${from})`,
            `🌟 **Novo tier:** ${toName} (Tier ${to})`,
            `📝 **Sessões acumuladas:** ${sessions}`,
            `📅 **Data:** ${new Date().toLocaleDateString('pt-BR', { 
              weekday: 'long', 
              day: 'numeric', 
              month: 'long',
              year: 'numeric'
            })}`
          ].join('\n'),
          inline: false
        },
        {
          name: '🎁 BENEFÍCIOS DESBLOQUEADOS',
          value: [
            '• Acesso a conteúdos exclusivos do novo tier',
            '• Maior reconhecimento na comunidade',
            '• Novas oportunidades de participação'
          ].join('\n'),
          inline: false
        }
      ])
      .setFooter({
        text: 'Ascend System v9.0 • Continue evoluindo!',
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTimestamp();

    return embed;
  }

  /**
   * Log de inicialização do bot
   */
  static onlineLog(guild, memberCount, config) {
    const sessionTime = config.settings?.sessionTime;
    const isSaturday = Validators.isSaturday();
    const today = Validators.getToday();
    const isExtraDay = config.settings?.extraDates?.includes(today);

    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('🤖 ASCEND SYSTEM ONLINE')
      .setDescription([
        `Sistema iniciado com sucesso no servidor **${guild.name}**`,
        '',
        `✅ Todos os módulos carregados`,
        `✅ Database sincronizada`,
        `✅ Painel de link atualizado`
      ].join('\n'))
      .addFields([
        {
          name: '📊 INFORMAÇÕES DO SERVIDOR',
          value: [
            `👥 **Membros totais:** ${memberCount}`,
            `👑 **Proprietário:** <@${guild.ownerId}>`,
            `📅 **Data:** ${new Date().toLocaleDateString('pt-BR', { 
              weekday: 'long', 
              day: 'numeric', 
              month: 'long' 
            })}`,
            `⏰ **Sábado:** ${isSaturday ? '✅ Sim' : '❌ Não'}`,
            `📅 **Dia extra:** ${isExtraDay ? '✅ Sim' : '❌ Não'}`,
            `🔓 **Sessão manual:** ${config.settings?.sessionOpen === true ? '✅ Aberta' : config.settings?.sessionCancelled ? '🚫 Cancelada' : '❌ Fechada'}`,
            sessionTime ? `🕐 **Horário configurado:** ${sessionTime}` : '🕐 **Horário:** Dia todo'
          ].join('\n'),
          inline: false
        },
        {
          name: '🏆 TIERS CONFIGURADOS',
          value: Object.entries(config.tiers).map(([key, value]) => {
            const level = parseInt(key.split('_')[1]);
            const emoji = TierManager.getTierEmoji(level);
            const name = value.name || TierManager.getTierName(level);
            return `${emoji} **${name}**: ${value.roleId ? `<@&${value.roleId}>` : '❌ Não configurado'} | ${value.sessionsNeeded} sessões`;
          }).join('\n'),
          inline: false
        },
        {
          name: '⚙️ CONFIGURAÇÕES',
          value: [
            `📊 Limite diário: **${config.settings?.maxDailyRequests || 1}**`,
            `⏰ Cooldown: **${config.settings?.cooldownMinutes || 5} min**`,
            `💾 Backup: **a cada ${config.settings?.autoBackupHours || 6}h**`,
            `🔗 Link: **${config.link.url ? 'Configurado' : '❌ Não configurado'}**`
          ].join('\n'),
          inline: false
        }
      ])
      .setFooter({ text: 'Ascend System v9.0 • Inicialização concluída' })
      .setTimestamp();
  }

  /**
   * Log de acesso (dia extra adicionado/removido)
   */
  static accessLog(admin, action, date, time = null) {
    const isAdded = action === 'added';
    
    return new EmbedBuilder()
      .setColor(isAdded ? Colors.Green : Colors.Red)
      .setTitle(isAdded ? '✅ DIA EXTRA ADICIONADO' : '❌ DIA EXTRA REMOVIDO')
      .setDescription(isAdded 
        ? `Um novo dia extra foi liberado para sessões.` 
        : `Um dia extra foi removido das liberações.`)
      .addFields([
        {
          name: '👤 ADMINISTRADOR',
          value: `${admin.tag} (${admin.id})`,
          inline: true
        },
        {
          name: '📅 DATA',
          value: new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          }),
          inline: true
        },
        time ? {
          name: '🕐 HORÁRIO',
          value: time,
          inline: true
        } : null
      ].filter(Boolean))
      .setFooter({ text: `Ação realizada em ${new Date().toLocaleString('pt-BR')}` })
      .setTimestamp();
  }

  /**
   * Log de mudança de cargo manual
   */
  static roleChangeLog(member, oldTier, newTier) {
    const color = TierManager.getTierColor(newTier);
    
    return new EmbedBuilder()
      .setColor(color)
      .setTitle('🔄 CARGO ALTERADO MANUALMENTE')
      .setDescription(`Os cargos de ${member.user.tag} foram modificados.`)
      .addFields([
        {
          name: '👤 USUÁRIO',
          value: `${member.user.tag} (${member.id})`,
          inline: true
        },
        {
          name: '📊 TIER DETECTADO',
          value: `${TierManager.getTierEmoji(newTier)} ${TierManager.getTierName(newTier)} (Tier ${newTier})`,
          inline: true
        }
      ])
      .setFooter({ text: 'Sincronizado automaticamente pelo Ascend' })
      .setTimestamp();
  }

  /**
   * Log de erro
   */
  static errorLog(error, context = '') {
    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('❌ ERRO NO SISTEMA')
      .setDescription('Ocorreu um erro durante a execução.')
      .addFields([
        {
          name: '📋 CONTEXTO',
          value: context || 'Não especificado',
          inline: false
        },
        {
          name: '💬 MENSAGEM',
          value: `\`\`\`${error.message?.substring(0, 1000) || 'Erro desconhecido'}\`\`\``,
          inline: false
        },
        {
          name: '⏰ HORÁRIO',
          value: new Date().toLocaleString('pt-BR'),
          inline: true
        }
      ])
      .setFooter({ text: 'Reporte este erro ao desenvolvedor' })
      .setTimestamp();
  }

  /**
   * Painel de Configuração (/config)
   */
  static configPanel(guildId) {
    const db = getDB(guildId);
    const cfg = db.config;
    const sessionTime = cfg.settings?.sessionTime;
    const activeUsers = db.getActiveUsers();
    const totalUsers = db.getTotalUsers();

    return new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle('⚙️ PAINEL DE CONFIGURAÇÃO')
      .setDescription([
        'Bem-vindo ao painel de controle do Ascend System.',
        'Use os botões e menus abaixo para configurar o sistema.',
        '',
        `📊 **Status:** ${cfg.settings?.sessionCancelled ? '🚫 Cancelada' : cfg.settings?.sessionOpen === true ? '✅ Aberta manualmente' : '🔄 Automática'}`
      ].join('\n'))
      .addFields([
        {
          name: '🏆 TIERS CONFIGURADOS',
          value: Object.entries(cfg.tiers).map(([key, value]) => {
            const level = parseInt(key.split('_')[1]);
            const emoji = TierManager.getTierEmoji(level);
            const name = value.name || TierManager.getTierName(level);
            return `${emoji} **${name}**: ${value.roleId ? `<@&${value.roleId}>` : '❌'} | ${value.sessionsNeeded} sessões`;
          }).join('\n'),
          inline: false
        },
        {
          name: '🔗 LINK DO SERVIDOR',
          value: cfg.link.url 
            ? `✅ **Configurado**\n📝 Nome: ${cfg.link.name}\n🔗 URL: ${cfg.link.url}` 
            : '❌ **Não configurado**\nUse o botão "Link" para configurar.',
          inline: false
        },
        {
          name: '📅 DIAS EXTRAS AGENDADOS',
          value: cfg.settings?.extraDates?.length 
            ? cfg.settings.extraDates.map(d => {
                const date = new Date(d + 'T00:00:00');
                return `• ${date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
              }).join('\n')
            : 'Nenhum dia extra configurado',
          inline: false
        },
        {
          name: '⚙️ CONFIGURAÇÕES GERAIS',
          value: [
            `• **Limite diário:** ${cfg.settings?.maxDailyRequests || 1} solicitação(ões) por usuário`,
            `• **Cooldown:** ${cfg.settings?.cooldownMinutes || 5} minutos`,
            `• **Horário:** ${sessionTime || 'Dia todo (sem horário definido)'}`,
            `• **Backup automático:** a cada ${cfg.settings?.autoBackupHours || 6} horas`,
            `• **Contagem regressiva:** ${cfg.settings?.enableCountdown !== false ? '✅ Ativada' : '❌ Desativada'}`,
            `• **Notificações:** ${cfg.settings?.notifications?.promotion !== false ? '✅' : '❌'} Promoção | ${cfg.settings?.notifications?.sessionStart !== false ? '✅' : '❌'} Início | ${cfg.settings?.notifications?.sessionEnd !== false ? '✅' : '❌'} Fim`
          ].join('\n'),
          inline: false
        },
        {
          name: '📊 ESTATÍSTICAS',
          value: [
            `• **Total de usuários:** ${totalUsers}`,
            `• **Usuários ativos:** ${activeUsers}`,
            `• **Tiers configurados:** ${Object.keys(cfg.tiers).length}`,
            `• **Dias extras:** ${cfg.settings?.extraDates?.length || 0}`
          ].join('\n'),
          inline: false
        }
      ])
      .setFooter({ text: 'Apenas o proprietário do bot pode modificar' })
      .setTimestamp();
  }
}

// ============================================
// SISTEMA DE MODAIS
// ============================================
class Modals {
  /**
   * Modal de confirmação para solicitar link
   */
  static linkRequest() {
    return new ModalBuilder()
      .setCustomId('link_modal')
      .setTitle('🔗 SOLICITAR LINK DE ACESSO')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('confirm')
            .setLabel('Digite "CONFIRMAR" para receber o link')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('CONFIRMAR')
            .setRequired(true)
            .setMinLength(9)
            .setMaxLength(9)
        )
      );
  }

  /**
   * Modal de edição de tier
   */
  static configTier(guildId, tierName) {
    const config = getDB(guildId).config;
    const tierData = config.tiers[tierName];
    const level = parseInt(tierName.split('_')[1]);
    const tierEmoji = TierManager.getTierEmoji(level);

    return new ModalBuilder()
      .setCustomId(`tier_${tierName}`)
      .setTitle(`${tierEmoji} EDITAR ${tierName.replace('_', ' ')}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('role_id')
            .setLabel('ID do Cargo no Discord')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('123456789012345678')
            .setValue(tierData?.roleId || '')
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('sessions')
            .setLabel('Sessões necessárias para o próximo tier')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('5')
            .setValue(String(tierData?.sessionsNeeded || 0))
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('tier_name')
            .setLabel('Nome do Tier (opcional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Intermediário')
            .setValue(tierData?.name || '')
            .setRequired(false)
        )
      );
  }

  /**
   * Modal de configuração do link
   */
  static configLink(guildId) {
    const link = getDB(guildId).config.link;

    return new ModalBuilder()
      .setCustomId('link_config')
      .setTitle('🔗 CONFIGURAR LINK DO SERVIDOR')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('url')
            .setLabel('URL do Servidor (link de convite)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://discord.gg/seu-servidor')
            .setValue(link.url || '')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Nome do Servidor')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Servidor RP dos Amigos')
            .setValue(link.name || '')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('desc')
            .setLabel('Mensagem de Boas-vindas')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Bem-vindo ao servidor! Siga as regras e divirta-se.')
            .setValue(link.description || '')
            .setRequired(false)
            .setMaxLength(500)
        )
      );
  }

  /**
   * Modal de configurações gerais
   */
  static configGeral(guildId) {
    const settings = getDB(guildId).config.settings;

    return new ModalBuilder()
      .setCustomId('config_geral')
      .setTitle('⚙️ CONFIGURAÇÕES GERAIS')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('max_daily')
            .setLabel('Máximo de solicitações por dia')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1')
            .setValue(String(settings?.maxDailyRequests || 1))
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('cooldown')
            .setLabel('Cooldown entre solicitações (minutos)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('5')
            .setValue(String(settings?.cooldownMinutes || 5))
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('session_time')
            .setLabel('Horário da sessão (HH:MM ou deixe vazio)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('14:00')
            .setValue(settings?.sessionTime || '')
            .setRequired(false)
            .setMinLength(0)
            .setMaxLength(5)
        )
      );
  }

  /**
   * Modal de dia extra
   */
  static accessDay() {
    return new ModalBuilder()
      .setCustomId('access_day')
      .setTitle('📅 ADICIONAR DIA EXTRA')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('date')
            .setLabel('Data no formato YYYY-MM-DD')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('2024-12-25')
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(10)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('time')
            .setLabel('Horário (HH:MM ou deixe vazio para dia todo)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('20:00')
            .setRequired(false)
            .setMinLength(0)
            .setMaxLength(5)
        )
      );
  }
}

console.log('✅ [2/4] Sistema de Embeds Premium e Modais carregados com sucesso!');
// ============================================
// ASCEND SYSTEM v9.0 - PARTE 3/4
// Slash Commands, Client, Prefix Handler, UpdateLinkPanel
// ============================================

// ============================================
// DEFINIÇÃO DOS SLASH COMMANDS
// ============================================
const slashCommands = [
  new SlashCommandBuilder()
    .setName('mytier')
    .setDescription('🏆 Visualizar seu perfil completo, progresso e ranking no servidor')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('config')
    .setDescription('⚙️ Abrir o painel de configurações do sistema (Apenas Proprietário)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('acess')
    .setDescription('🔓 Controlar a sessão manualmente, agendar data extra ou definir horário')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('data')
        .setDescription('Data no formato YYYY-MM-DD para agendar um dia extra (opcional)')
        .setRequired(false)
        .setMinLength(10)
        .setMaxLength(10))
    .addStringOption(option =>
      option.setName('hora')
        .setDescription('Horário no formato HH:MM para definir o horário da sessão (opcional)')
        .setRequired(false)
        .setMinLength(5)
        .setMaxLength(5))
];

// ============================================
// CLIENTE DO DISCORD
// ============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    // Suporte a mensagens parciais
  ],
  allowedMentions: {
    parse: ['roles', 'users'],
    repliedUser: true
  }
});

// Coleção de comandos slash
client.commands = new (require('discord.js').Collection)();
slashCommands.forEach(cmd => {
  client.commands.set(cmd.name, cmd);
});

// ============================================
// FUNÇÃO DE ATUALIZAÇÃO DO PAINEL DE LINK
// ============================================
async function updateLinkPanel(guildId) {
  try {
    // Verificar se o canal existe
    const channel = client.channels.cache.get(LINK_CHANNEL_ID);
    if (!channel) {
      Logger.warn(`⚠️ Canal de link (${LINK_CHANNEL_ID}) não encontrado no cache`);
      return;
    }

    // Verificar se é um canal de texto
    if (channel.type !== ChannelType.GuildText) {
      Logger.warn(`⚠️ Canal de link (${LINK_CHANNEL_ID}) não é um canal de texto`);
      return;
    }

    // Verificar permissões do bot no canal
    const permissions = channel.permissionsFor(client.user);
    if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
      Logger.warn(`⚠️ Sem permissões no canal de link (${LINK_CHANNEL_ID})`);
      return;
    }

    // Buscar mensagens recentes do bot no canal
    let messages;
    try {
      messages = await channel.messages.fetch({ limit: 10 });
    } catch (error) {
      Logger.warn(`⚠️ Erro ao buscar mensagens no canal de link: ${error.message}`);
      return;
    }

    // Encontrar mensagem do painel (tem componentes/botões)
    const panelMessage = messages.find(msg =>
      msg.author.id === client.user.id &&
      msg.components.length > 0
    ) || messages.find(msg => msg.author.id === client.user.id);

    // Gerar embed atualizado
    const embed = Embeds.linkPanel(guildId);
    const isAllowed = Validators.isAllowedDay(guildId);

    // Só mostrar o botão se a sessão estiver liberada
    const components = isAllowed ? [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('request_link')
          .setLabel('🔗 Solicitar Link de Acesso')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔗')
      )
    ] : [];

    // Atualizar ou criar mensagem
    if (panelMessage) {
      try {
        await panelMessage.edit({
          embeds: [embed],
          components: components
        });
        Logger.debug('🔄 Painel de link atualizado com sucesso (edit)');
      } catch (editError) {
        // Se não conseguir editar (mensagem muito antiga, etc), cria nova
        Logger.warn(`⚠️ Não foi possível editar painel: ${editError.message}. Criando novo...`);
        
        try {
          await channel.send({
            embeds: [embed],
            components: components
          });
          Logger.info('📝 Novo painel de link criado');
        } catch (sendError) {
          Logger.error(`❌ Erro ao criar novo painel: ${sendError.message}`);
        }
      }
    } else {
      try {
        await channel.send({
          embeds: [embed],
          components: components
        });
        Logger.info('📝 Painel de link criado com sucesso');
      } catch (sendError) {
        Logger.error(`❌ Erro ao enviar painel: ${sendError.message}`);
      }
    }
  } catch (error) {
    Logger.error(`❌ Erro crítico ao atualizar painel de link: ${error.message}`);
  }
}

// ============================================
// HANDLER DE PREFIX COMMANDS ($)
// ============================================
async function handlePrefixCommand(message) {
  // Ignorar mensagens de bots e mensagens que não são de servidor
  if (message.author.bot || !message.guild) return;
  
  // Verificar se começa com o prefixo $
  if (!message.content.startsWith('$')) return;

  // Extrair comando e argumentos
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const guildId = message.guild.id;

  try {
    switch (command) {
      // ============================================
      // $ping - Verificar latência do bot
      // ============================================
      case 'ping': {
        const startTime = Date.now();
        const reply = await message.reply('🏓 Calculando latência...');
        const endTime = Date.now();
        
        const pingEmbed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle('🏓 PONG!')
          .setDescription('Latência do bot e da API do Discord')
          .addFields([
            {
              name: '🤖 Latência do Bot',
              value: `\`${endTime - startTime}ms\``,
              inline: true
            },
            {
              name: '🌐 Latência da API',
              value: `\`${client.ws.ping}ms\``,
              inline: true
            },
            {
              name: '📊 Status',
              value: client.ws.ping < 100 ? '✅ Ótima' : client.ws.ping < 200 ? '⚠️ Boa' : '❌ Ruim',
              inline: true
            }
          ])
          .setFooter({ text: 'Ascend System v9.0' })
          .setTimestamp();
        
        await reply.edit({ content: null, embeds: [pingEmbed] });
        break;
      }

      // ============================================
      // $tier - Ver tier de um usuário
      // ============================================
      case 'tier': {
        const targetUser = message.mentions.users.first() || message.author;
        const tierEmbed = Embeds.myTier(guildId, targetUser);
        await message.reply({ embeds: [tierEmbed] });
        break;
      }

      // ============================================
      // $sessoes - Ver quantidade de sessões
      // ============================================
      case 'sessoes': {
        const targetId = message.mentions.users.first()?.id || message.author.id;
        const targetUsername = message.mentions.users.first()?.username || message.author.username;
        const db = getDB(guildId);
        
        const sessions = db.getSessions(targetId);
        const tier = db.getUserTier(targetId);
        const tierEmoji = TierManager.getTierEmoji(tier);
        const tierName = TierManager.getTierName(tier);
        const rank = db.getUserRank(targetId);
        const totalActive = db.getActiveUsers();
        
        const sessionsEmbed = new EmbedBuilder()
          .setColor(TierManager.getTierColor(tier))
          .setTitle('📊 INFORMAÇÕES DE SESSÃO')
          .setDescription(`Dados de **${targetUsername}**`)
          .addFields([
            {
              name: '📝 Sessões',
              value: `**${sessions}** sessão(ões) acumuladas`,
              inline: true
            },
            {
              name: '🏆 Tier',
              value: `${tierEmoji} **${tierName}** (Tier ${tier})`,
              inline: true
            },
            {
              name: '🏅 Ranking',
              value: rank > 0 ? `**${rank}º** de ${totalActive}` : 'Não rankeado',
              inline: true
            },
            {
              name: '📅 Próxima Sessão',
              value: Validators.getNextSaturday(),
              inline: false
            }
          ])
          .setFooter({ text: 'Use /mytier para mais detalhes' })
          .setTimestamp();
        
        await message.reply({ embeds: [sessionsEmbed] });
        break;
      }

      // ============================================
      // $ranking - Top 10 usuários
      // ============================================
      case 'ranking':
      case 'top': {
        const db = getDB(guildId);
        const ranking = db.getRanking();
        
        if (ranking.length === 0) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle('📊 RANKING VAZIO')
                .setDescription('Nenhum membro possui tier ainda.\nParticipe das sessões para aparecer aqui!')
            ]
          });
        }

        const top10 = ranking.slice(0, 10);
        
        const rankingText = top10.map((user, index) => {
          const position = index + 1;
          const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}º`;
          const tierEmoji = TierManager.getTierEmoji(user.tier);
          const tierName = TierManager.getTierName(user.tier);
          
          return [
            `${medal} **${user.username}**`,
            `└ ${tierEmoji} ${tierName} • ${user.sessions} sessões`
          ].join('\n');
        }).join('\n\n');

        // Destacar top 3
        const top3Text = top10.slice(0, 3).map((user, index) => {
          const medal = ['🥇', '🥈', '🥉'][index];
          return `${medal} **${user.username}** - Tier ${user.tier}`;
        }).join('\n');

        const rankingEmbed = new EmbedBuilder()
          .setColor(Colors.Gold)
          .setTitle('🏆 RANKING DE TIERS - TOP 10')
          .setDescription([
            `### 🏅 PÓDIO`,
            top3Text,
            '',
            `### 📊 CLASSIFICAÇÃO COMPLETA`,
            rankingText
          ].join('\n'))
          .addFields([
            {
              name: '📊 ESTATÍSTICAS',
              value: [
                `• Total de membros rankeados: **${ranking.length}**`,
                `• Atualizado em: ${new Date().toLocaleString('pt-BR')}`
              ].join('\n'),
              inline: false
            }
          ])
          .setFooter({ text: 'Ascend System v9.0 • Ranking em tempo real' })
          .setTimestamp();
        
        await message.reply({ embeds: [rankingEmbed] });
        break;
      }

      // ============================================
      // $link - Solicitar link rapidamente
      // ============================================
      case 'link': {
        // Verificar se a sessão está liberada
        if (!Validators.isAllowedDay(guildId)) {
          const countdown = Validators.getCountdownTimestamp(guildId);
          
          if (countdown) {
            return message.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(Colors.Orange)
                  .setTitle('⏰ SESSÃO NÃO INICIADA')
                  .setDescription(`A sessão de hoje ainda não começou.\n\n⏰ **Início previsto:** <t:${countdown}:R>\n📅 **Horário:** <t:${countdown}:t>`)
                  .setFooter({ text: 'O link estará disponível no horário marcado' })
              ]
            });
          }
          
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ SESSÃO FECHADA')
                .setDescription(`Não há sessão disponível no momento.\n\n📅 **Próximo sábado:** ${Validators.getNextSaturday()}`)
            ]
          });
        }

        const db = getDB(guildId);

        // Verificar limite diário
        if (!db.canRequestToday(message.author.id)) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ LIMITE ATINGIDO')
                .setDescription(`Você já usou todas as suas solicitações de hoje.\n\n📅 Tente novamente amanhã ou no próximo sábado.`)
            ]
          });
        }

        // Verificar cooldown
        if (db.isOnCooldown(message.author.id)) {
          const remaining = db.getCooldownRemaining(message.author.id);
          const minutes = Math.ceil(remaining / 60000);
          
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle('⏳ AGUARDE')
                .setDescription(`Você precisa aguardar **${minutes} minuto(s)** antes de solicitar novamente.`)
            ]
          });
        }

        // Processar solicitação
        const currentTier = db.getUserTier(message.author.id);
        db.addSession(message.author.id);
        db.addJoin(message.author.id, message.author.username, currentTier);
        db.addTodayRequest(message.author.id);

        // Tentar enviar DM
        try {
          const welcomeEmbed = Embeds.welcomeMessage(guildId, message.author, currentTier);
          await message.author.send({ embeds: [welcomeEmbed] });
          
          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ LINK ENVIADO!')
                .setDescription('📨 O link de acesso foi enviado na sua **DM** (mensagem privada).\n\nVerifique suas mensagens!')
                .setFooter({ text: 'Caso não receba, verifique suas configurações de privacidade' })
            ]
          });
        } catch (dmError) {
          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ ERRO AO ENVIAR')
                .setDescription('Não foi possível enviar o link na sua DM.\n\n⚠️ **Ative as mensagens privadas** nas configurações do servidor e tente novamente.')
            ]
          });
        }

        // Verificar promoção
        const promoted = await TierManager.promote(message.member);
        if (promoted) {
          const promoEmbed = Embeds.promotion(message.author, promoted.from, promoted.to, db.getSessions(message.author.id));
          
          // Enviar no canal
          await message.channel.send({ embeds: [promoEmbed] });

          // Enviar no canal de logs
          const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
          if (logChannel) {
            await logChannel.send({
              content: `🎉 **${message.author.username}** foi promovido(a)!`,
              embeds: [promoEmbed]
            });
          }
        }
        break;
      }

      // ============================================
      // $info - Informações do bot
      // ============================================
      case 'info': {
        const db = getDB(guildId);
        const config = db.config;
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        const infoEmbed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle('🤖 ASCEND SYSTEM v9.0')
          .setDescription('Sistema profissional de progressão por tiers')
          .addFields([
            {
              name: '📊 ESTATÍSTICAS DO BOT',
              value: [
                `• **Versão:** 9.0`,
                `• **Uptime:** ${hours}h ${minutes}m ${seconds}s`,
                `• **Latência:** ${client.ws.ping}ms`,
                `• **Servidores:** ${client.guilds.cache.size}`,
                `• **Usuários totais:** ${client.users.cache.size}`
              ].join('\n'),
              inline: false
            },
            {
              name: '📋 COMANDOS SLASH',
              value: [
                '• `/mytier` - Ver seu perfil e progresso',
                '• `/config` - Painel de configuração (Owner)',
                '• `/acess` - Controlar sessão (Owner)'
              ].join('\n'),
              inline: false
            },
            {
              name: '💬 COMANDOS DE PREFIXO ($)',
              value: [
                '• `$ping` - Latência do bot',
                '• `$tier @user` - Ver tier de alguém',
                '• `$sessoes @user` - Ver sessões',
                '• `$ranking` - Top 10 do servidor',
                '• `$link` - Solicitar link rápido',
                '• `$info` - Informações do bot',
                '• `$backup` - Backup manual (Owner)'
              ].join('\n'),
              inline: false
            },
            {
              name: '📅 CONFIGURAÇÃO ATUAL',
              value: [
                `• **Sábados:** Automático`,
                `• **Horário:** ${config.settings?.sessionTime || 'Dia todo'}`,
                `• **Limite diário:** ${config.settings?.maxDailyRequests || 1}`,
                `• **Cooldown:** ${config.settings?.cooldownMinutes || 5}min`
              ].join('\n'),
              inline: false
            }
          ])
          .setFooter({ text: 'Desenvolvido com 💙 para a comunidade' })
          .setTimestamp();

        await message.reply({ embeds: [infoEmbed] });
        break;
      }

      // ============================================
      // $backup - Backup manual (apenas Owner)
      // ============================================
      case 'backup': {
        if (!Validators.isOwner(message.author.id)) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ SEM PERMISSÃO')
                .setDescription('Apenas o proprietário do bot pode executar este comando.')
            ]
          });
        }

        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Blue)
              .setTitle('💾 INICIANDO BACKUP...')
              .setDescription('O backup está sendo criado. Aguarde...')
          ]
        });

        const backupPath = await createBackup(guildId);

        if (backupPath) {
          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ BACKUP CRIADO!')
                .setDescription(`O backup foi salvo com sucesso.\n\n📁 **Local:** \`${backupPath}\``)
                .setFooter({ text: 'Backup automático ocorre a cada 6 horas' })
            ]
          });
        } else {
          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ ERRO NO BACKUP')
                .setDescription('Ocorreu um erro ao criar o backup. Verifique os logs.')
            ]
          });
        }
        break;
      }

      // ============================================
      // $help - Ajuda rápida
      // ============================================
      case 'help':
      case 'ajuda': {
        const helpEmbed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle('📚 CENTRAL DE AJUDA')
          .setDescription('Lista de todos os comandos disponíveis')
          .addFields([
            {
              name: '👤 USUÁRIOS',
              value: [
                '`/mytier` - Ver seu perfil completo',
                '`$tier @user` - Ver tier de um usuário',
                '`$sessoes @user` - Ver sessões de um usuário',
                '`$ranking` - Ver o top 10 do servidor',
                '`$link` - Solicitar link de acesso',
                '`$ping` - Verificar latência',
                '`$info` - Informações do sistema',
                '`$help` - Esta mensagem'
              ].join('\n'),
              inline: false
            },
            {
              name: '👑 ADMINISTRADOR (OWNER)',
              value: [
                '`/config` - Painel de configuração',
                '`/acess` - Controlar sessão e agendar datas',
                '`$backup` - Criar backup manual'
              ].join('\n'),
              inline: false
            },
            {
              name: '💡 DICAS',
              value: [
                '• As sessões ocorrem aos **sábados**',
                '• Use `/acess` para liberar dias extras',
                '• Configure um horário para início automático',
                '• O painel de link atualiza sozinho',
                '• Cada usuário tem limite diário de solicitações'
              ].join('\n'),
              inline: false
            }
          ])
          .setFooter({ text: 'Ascend System v9.0 • Sistema de Progressão' })
          .setTimestamp();

        await message.reply({ embeds: [helpEmbed] });
        break;
      }

      default: {
        // Comando não reconhecido
        break;
      }
    }
  } catch (error) {
    Logger.error(`❌ Erro no comando $${command}: ${error.message}`);
    
    // Tentar notificar o usuário sobre o erro
    try {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ ERRO')
            .setDescription('Ocorreu um erro ao executar este comando.\nPor favor, tente novamente.')
        ]
      });
    } catch (replyError) {
      // Silencioso - não podemos fazer nada
    }
  }
}

console.log('✅ [3/4] Slash Commands, Prefix Handler e UpdateLinkPanel carregados com sucesso!');
// ============================================
// ASCEND SYSTEM v9.0 - PARTE 4/4
// Eventos do Bot, Interações e Inicialização
// ============================================

// ============================================
// EVENTO: BOT PRONTO
// ============================================
client.once('ready', async () => {
  // Limpar console e mostrar banner
  console.clear();
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║                                                      ║');
  console.log('║         🏆 ASCEND SYSTEM v9.0 ONLINE 🏆             ║');
  console.log('║                                                      ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  🤖 Bot: ${client.user.tag}`);
  console.log(`║  📊 Tiers configurados: ${MAX_TIERS} níveis`);
  console.log(`║  🌐 Servidores: ${client.guilds.cache.size}`);
  console.log(`║  👥 Usuários: ${client.users.cache.size}`);
  console.log(`║  🕐 Horário: Configurável`);
  console.log(`║  📅 Modo: Sábados automáticos + controle manual`);
  console.log(`║  💾 Backup: Automático a cada 6h`);
  console.log('╚══════════════════════════════════════════════════════╝');

  // Registrar Slash Commands globalmente
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    
    Logger.info('📝 Registrando comandos slash globalmente...');

    const registeredCommands = await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );

    Logger.success(`✅ ${Array.isArray(registeredCommands) ? registeredCommands.length : 0} comandos slash registrados com sucesso!`);
  } catch (error) {
    Logger.error(`❌ Erro ao registrar comandos slash: ${error.message}`);
    
    // Tentar registrar por servidor como fallback
    try {
      Logger.info('📝 Tentando registrar por servidor...');
      const rest = new REST({ version: '10' }).setToken(TOKEN);
      
      for (const [, guild] of client.guilds.cache) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(client.user.id, guild.id),
            { body: slashCommands.map(cmd => cmd.toJSON()) }
          );
          Logger.success(`✅ Comandos registrados no servidor: ${guild.name}`);
        } catch (guildError) {
          Logger.warn(`⚠️ Falha no servidor ${guild.name}: ${guildError.message}`);
        }
      }
    } catch (fallbackError) {
      Logger.error(`❌ Falha total ao registrar comandos: ${fallbackError.message}`);
    }
  }

  // Definir status do bot
  client.user.setActivity({
    name: '𝙼𝚊𝚍𝚎 𝚋𝚢 𝚈𝟸𝚔_𝙽𝚊𝚝',
    type: ActivityType.Watching
  });

  // Atualizar status periodicamente (a cada 30 minutos)
  const statusMessages = [
    '📊 Sessões aos Sábados',
    '🏆 Sistema de Progressão',
    '🔗 /mytier para ver perfil',
    '𝙼𝚊𝚍𝚎 𝚋𝚢 𝚈𝟸𝚔_𝙽𝚊𝚝'
  ];
  
  let statusIndex = 0;
  setInterval(() => {
    statusIndex = (statusIndex + 1) % statusMessages.length;
    client.user.setActivity({
      name: statusMessages[statusIndex],
      type: ActivityType.Watching
    });
  }, 1800000); // 30 minutos

  // ============================================
  // INICIALIZAR CADA SERVIDOR
  // ============================================
  for (const [, guild] of client.guilds.cache) {
    try {
      const guildId = guild.id;
      Logger.info(`🔄 Inicializando servidor: ${guild.name} (${guildId})`);

      const db = getDB(guildId);

      // Atualizar nome do servidor no config
      const cfg = db.config;
      if (cfg.guildName !== guild.name) {
        cfg.guildName = guild.name;
        db.setConfig(cfg);
      }

      // Sincronizar membros com cargos reais
      const memberCount = await db.syncAll(guild);
      Logger.success(`👥 ${memberCount} membros sincronizados em ${guild.name}`);

      // Resetar cancelamento se mudou o dia
      if (cfg.settings?.sessionCancelled && !Validators.isSaturday()) {
        cfg.settings.sessionCancelled = false;
        cfg.settings.sessionOpen = null;
        db.setConfig(cfg);
        Logger.info(`🔄 Status de cancelamento resetado para ${guild.name}`);
      }

      // Limpar datas expiradas
      const cleaned = Validators.cleanExpiredDates(guildId);
      if (cleaned) {
        Logger.info(`🗑️ Datas expiradas removidas de ${guild.name}`);
      }

      // Criar/atualizar painel de link
      await updateLinkPanel(guildId);

      // Enviar log de inicialização no canal de logs
      const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        try {
          await logChannel.send({
            embeds: [Embeds.onlineLog(guild, guild.memberCount, db.config)]
          });
          Logger.success(`📋 Log enviado para #${logChannel.name}`);
        } catch (logError) {
          Logger.warn(`⚠️ Erro ao enviar log: ${logError.message}`);
        }
      } else {
        Logger.warn(`⚠️ Canal de log (${LOG_CHANNEL_ID}) não encontrado`);
      }

      // Criar backup inicial do servidor
      await createBackup(guildId);

      Logger.success(`✅ Servidor ${guild.name} inicializado com sucesso!`);
    } catch (error) {
      Logger.error(`❌ Erro ao inicializar servidor ${guild.name}: ${error.message}`);
    }
  }

  // ============================================
  // INTERVALOS AUTOMÁTICOS
  // ============================================

  // Verificar a cada 1 minuto se o horário da sessão foi atingido
  const minuteInterval = setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      try {
        const guildId = guild.id;

        // Forçar re-leitura dos arquivos
        clearDBCache(guildId);

        const wasAllowed = Validators.isAllowedDay(guildId);

        // Verificar novamente (com cache limpo)
        const isNowAllowed = Validators.isAllowedDay(guildId);

        // Se mudou de NÃO permitido para SIM (horário chegou!)
        if (!wasAllowed && isNowAllowed) {
          await updateLinkPanel(guildId);
          Logger.session(`⏰ Horário da sessão atingido! Painel atualizado para ${guild.name}`);

          // Notificar no canal de logs
          const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
          if (logChannel) {
            const notificationEmbed = new EmbedBuilder()
              .setColor(Colors.Green)
              .setTitle('⏰ SESSÃO INICIADA!')
              .setDescription([
                `O horário configurado foi atingido em **${guild.name}**.`,
                '',
                '✅ O botão de link foi **liberado** automaticamente.',
                '✅ Os usuários já podem solicitar o link de acesso.'
              ].join('\n'))
              .addFields([
                {
                  name: '🕐 HORÁRIO',
                  value: new Date().toLocaleTimeString('pt-BR'),
                  inline: true
                },
                {
                  name: '📅 DATA',
                  value: new Date().toLocaleDateString('pt-BR', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long' 
                  }),
                  inline: true
                }
              ])
              .setFooter({ text: 'Liberação automática do Ascend System' })
              .setTimestamp();

            await logChannel.send({ embeds: [notificationEmbed] });
          }
        }
      } catch (error) {
        // Silencioso para não floodar o console
      }
    }
  }, 60000); // 1 minuto

  // A cada 1 hora: sincronizar membros, limpar datas, resetar sessões
  const hourlyInterval = setInterval(async () => {
    Logger.info('🔄 Executando manutenção horária...');

    for (const [, guild] of client.guilds.cache) {
      try {
        const guildId = guild.id;
        const db = getDB(guildId);

        // Sincronizar membros
        await db.syncAll(guild);

        const cfg = db.config;
        const today = Validators.getToday();
        let configChanged = false;

        // Resetar cancelamento se não for mais sábado
        if (cfg.settings?.sessionCancelled && !Validators.isSaturday()) {
          cfg.settings.sessionCancelled = false;
          cfg.settings.sessionOpen = null;
          configChanged = true;
          Logger.info(`🔄 Cancelamento de sábado resetado para ${guild.name}`);
        }

        // Limpar datas extras expiradas
        if (cfg.settings?.extraDates?.length > 0) {
          const beforeCount = cfg.settings.extraDates.length;
          cfg.settings.extraDates = cfg.settings.extraDates.filter(date => date >= today);
          const afterCount = cfg.settings.extraDates.length;

          if (beforeCount !== afterCount) {
            configChanged = true;
            const removed = beforeCount - afterCount;
            Logger.info(`🗑️ ${removed} data(s) extra(s) expirada(s) removida(s) de ${guild.name}`);

            if (afterCount === 0) {
              cfg.settings.allowExtraDays = false;
            }
          }
        }

        // Resetar sessão manual à meia-noite
        if (cfg.settings?.sessionOpen === true && !Validators.isSaturday()) {
          const lastUpdate = cfg.updatedAt ? new Date(cfg.updatedAt).getDate() : 0;
          const todayDate = new Date().getDate();

          if (lastUpdate !== todayDate) {
            cfg.settings.sessionOpen = null;
            configChanged = true;
            Logger.info(`🔄 Sessão manual resetada (meia-noite) para ${guild.name}`);
          }
        }

        // Salvar configurações se algo mudou
        if (configChanged) {
          db.setConfig(cfg);
        }

        // Atualizar painel de link
        await updateLinkPanel(guildId);

      } catch (error) {
        Logger.error(`❌ Erro na manutenção de ${guild.name}: ${error.message}`);
      }
    }

    Logger.success('✅ Manutenção horária concluída');
  }, 3600000); // 1 hora

  // A cada 6 horas: backup automático de todos os servidores
  const backupInterval = setInterval(async () => {
    Logger.backup('💾 Iniciando backup automático de todos os servidores...');

    let backupCount = 0;
    for (const [, guild] of client.guilds.cache) {
      const backupPath = await createBackup(guild.id);
      if (backupPath) backupCount++;
    }

    Logger.backup(`✅ Backup automático concluído! ${backupCount} servidores salvos.`);
  }, 21600000); // 6 horas

  // A cada 12 horas: limpar cache e otimizar memória
  const cacheInterval = setInterval(() => {
    Logger.info('🧹 Limpando cache e otimizando memória...');
    
    // Limpar cache de dados
    guildDBCache.clear();
    
    Logger.success('✅ Cache limpo com sucesso!');
  }, 43200000); // 12 horas

  // Log final de inicialização
  Logger.success('╔══════════════════════════════════════════════════════╗');
  Logger.success('║     ✅ SISTEMA COMPLETAMENTE INICIALIZADO!           ║');
  Logger.success('╠══════════════════════════════════════════════════════╣');
  Logger.success(`║  ⏰ Manutenção: A cada 1 hora                        ║`);
  Logger.success(`║  🔍 Verificação: A cada 1 minuto                    ║`);
  Logger.success(`║  💾 Backup: A cada 6 horas                          ║`);
  Logger.success(`║  🧹 Cache: A cada 12 horas                          ║`);
  Logger.success('╚══════════════════════════════════════════════════════╝');
});

// ============================================
// EVENTO: MENSAGENS (PREFIX COMMANDS)
// ============================================
client.on('messageCreate', async (message) => {
  // Handler de comandos com prefixo $
  await handlePrefixCommand(message);
});

// ============================================
// EVENTO: MEMBRO ENTRA NO SERVIDOR
// ============================================
client.on('guildMemberAdd', async (member) => {
  // Ignorar bots
  if (member.user.bot) return;

  try {
    const guildId = member.guild.id;
    const db = getDB(guildId);
    const config = db.config;

    Logger.info(`👋 Novo membro: ${member.user.tag} entrou em ${member.guild.name}`);

    // Atribuir Tier 1 automaticamente
    const tier1Config = config.tiers['TIER_1'];
    if (tier1Config?.roleId) {
      try {
        await member.roles.add(tier1Config.roleId);
        Logger.success(`✅ Tier 1 atribuído automaticamente a ${member.user.tag}`);
      } catch (roleError) {
        Logger.warn(`⚠️ Erro ao atribuir Tier 1 para ${member.user.tag}: ${roleError.message}`);
      }
    } else {
      Logger.warn(`⚠️ Tier 1 não configurado! ${member.user.tag} não recebeu cargo.`);
    }

    // Registrar no banco de dados
    db.setUser(member.id, {
      username: member.user.username,
      displayName: member.displayName || member.user.username,
      discriminator: member.user.discriminator || '0',
      avatar: member.user.displayAvatarURL({ dynamic: true }),
      tier: 1,
      sessions: 0,
      dailyRequests: {},
      totalRequests: 0,
      joins: [],
      joinedServer: new Date().toISOString(),
      joinedDiscord: member.user.createdAt?.toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Inicializar sessões com 0
    const sessions = db.sessions;
    sessions[member.id] = 0;
    db.setSessions(sessions);

    Logger.info(`📝 ${member.user.tag} registrado no banco de dados`);

  } catch (error) {
    Logger.error(`❌ Erro ao processar entrada de ${member.user.tag}: ${error.message}`);
  }
});

// ============================================
// EVENTO: MEMBRO SAI DO SERVIDOR
// ============================================
client.on('guildMemberRemove', async (member) => {
  if (member.user.bot) return;

  try {
    Logger.info(`👋 ${member.user.tag} saiu de ${member.guild.name}`);
    
    // Opcional: Marcar usuário como inativo no banco
    const db = getDB(member.guild.id);
    const user = db.getUser(member.id);
    
    if (user) {
      user.leftServer = new Date().toISOString();
      user.active = false;
      db.setUser(member.id, user);
    }
  } catch (error) {
    Logger.error(`❌ Erro ao processar saída de ${member.user.tag}: ${error.message}`);
  }
});

// ============================================
// EVENTO: CARGO ALTERADO MANUALMENTE
// ============================================
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // Só processar se os cargos realmente mudaram
  if (oldMember.roles.cache.size === newMember.roles.cache.size) {
    return;
  }

  try {
    const guildId = newMember.guild.id;
    const db = getDB(guildId);
    const config = db.config;

    // Detectar o tier baseado nos cargos atuais
    let detectedTier = 0;
    for (let i = MAX_TIERS; i >= 1; i--) {
      const roleId = config.tiers[`TIER_${i}`]?.roleId;
      if (roleId && newMember.roles.cache.has(roleId)) {
        detectedTier = i;
        break;
      }
    }

    // Buscar tier anterior
    const oldUserData = db.getUser(newMember.id);
    const oldTier = oldUserData?.tier || 0;

    // Só atualizar se o tier realmente mudou
    if (oldTier !== detectedTier) {
      // Atualizar no banco de dados
      db.setUser(newMember.id, {
        tier: detectedTier,
        username: newMember.user.username,
        displayName: newMember.displayName || newMember.user.username,
        avatar: newMember.user.displayAvatarURL({ dynamic: true })
      });

      // Se o tier mudou, sincronizar sessões mínimas
      if (detectedTier > 0) {
        const currentSessions = db.getSessions(newMember.id);
        const minSessions = TIERS_CONFIG[detectedTier]?.sessionsNeeded || 0;

        if (currentSessions < minSessions) {
          const sessions = db.sessions;
          sessions[newMember.id] = minSessions;
          db.setSessions(sessions);
          Logger.info(`📝 Sessões de ${newMember.user.tag} ajustadas para ${minSessions} (mínimo do Tier ${detectedTier})`);
        }
      }

      // Enviar log da mudança
      const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        try {
          await logChannel.send({
            embeds: [Embeds.roleChangeLog(newMember, oldTier, detectedTier)]
          });
        } catch (logError) {
          Logger.warn(`⚠️ Erro ao enviar log de mudança de cargo: ${logError.message}`);
        }
      }

      const tierEmoji = TierManager.getTierEmoji(detectedTier);
      const tierName = TierManager.getTierName(detectedTier);
      Logger.info(`🔄 Tier de ${newMember.user.tag}: ${oldTier} → ${detectedTier} ${tierEmoji} ${tierName}`);
    }
  } catch (error) {
    Logger.error(`❌ Erro ao processar mudança de cargos: ${error.message}`);
  }
});

// ============================================
// EVENTO: INTERAÇÕES (SLASH + BOTÕES + MODAIS + MENUS)
// ============================================
client.on('interactionCreate', async (interaction) => {
  try {
    // ==========================================
    // COMANDOS SLASH
    // ==========================================
    if (interaction.isChatInputCommand()) {
      const { commandName, user, member, guild, guildId } = interaction;

      // Verificar se é um servidor
      if (!guild) {
        return interaction.reply({
          content: '❌ Este comando só pode ser usado em servidores.',
          ephemeral: true
        });
      }

      // Verificar permissão para comandos restritos
      if (['config', 'acess'].includes(commandName)) {
        if (!Validators.isOwner(user.id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('🔒 ACESSO NEGADO')
                .setDescription('Apenas o **proprietário do bot** pode usar este comando.')
                .setFooter({ text: 'Seu ID não corresponde ao OWNER_ID configurado' })
            ],
            ephemeral: true
          });
        }
      }

      // ==========================================
      // /mytier - Perfil do usuário
      // ==========================================
      if (commandName === 'mytier') {
        await interaction.deferReply({ ephemeral: true });

        try {
          const embed = Embeds.myTier(guildId, user);
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          Logger.error(`Erro no /mytier: ${error.message}`);
          await interaction.editReply({
            content: '❌ Ocorreu um erro ao carregar seu perfil. Tente novamente.'
          });
        }
      }

      // ==========================================
      // /config - Painel de configuração (Owner)
      // ==========================================
      if (commandName === 'config') {
        const db = getDB(guildId);
        const config = db.config;

        // Select menu para escolher tier
        const tierSelect = new StringSelectMenuBuilder()
          .setCustomId('cfg_tier')
          .setPlaceholder('🏆 Selecione um tier para editar...')
          .addOptions(
            Object.keys(config.tiers).map(tierKey => {
              const level = parseInt(tierKey.split('_')[1]);
              const data = config.tiers[tierKey];
              const emoji = TierManager.getTierEmoji(level);
              const name = data.name || TierManager.getTierName(level);

              return new StringSelectMenuOptionBuilder()
                .setLabel(`${emoji} ${name}`)
                .setDescription(`Sessões: ${data.sessionsNeeded} | Cargo: ${data.roleId ? '✅' : '❌'}`)
                .setValue(tierKey);
            })
          );

        // Botões de ação
        const actionButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('cfg_geral')
              .setLabel('Configurações Gerais')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('⚙️'),
            new ButtonBuilder()
              .setCustomId('cfg_session')
              .setLabel(
                config.settings?.sessionCancelled ? '🚫 Cancelada' :
                config.settings?.sessionOpen === true ? '✅ Aberta' :
                '🔄 Automática'
              )
              .setStyle(
                config.settings?.sessionCancelled ? ButtonStyle.Danger :
                config.settings?.sessionOpen === true ? ButtonStyle.Success :
                ButtonStyle.Secondary
              ),
            new ButtonBuilder()
              .setCustomId('cfg_date')
              .setLabel('Adicionar Dia Extra')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('📅'),
            new ButtonBuilder()
              .setCustomId('cfg_link')
              .setLabel('Configurar Link')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🔗')
          );

        const tierRow = new ActionRowBuilder().addComponents(tierSelect);

        await interaction.reply({
          embeds: [Embeds.configPanel(guildId)],
          components: [actionButtons, tierRow],
          ephemeral: true
        });
      }

      // ==========================================
      // /acess - Controle de sessão (Owner)
      // ==========================================
      if (commandName === 'acess') {
        await interaction.deferReply({ ephemeral: true });

        const dateInput = interaction.options.getString('data');
        const timeInput = interaction.options.getString('hora');
        const db = getDB(guildId);
        const cfg = db.config;

        // Validar hora se fornecida
        if (timeInput && !Validators.isValidTime(timeInput)) {
          return interaction.editReply({
            content: '❌ **Horário inválido!**\nUse o formato HH:MM (ex: 14:00)'
          });
        }

        // Se passou data → agendar dia extra
        if (dateInput) {
          if (!Validators.isValidDate(dateInput)) {
            return interaction.editReply({
              content: '❌ **Data inválida!**\nUse o formato YYYY-MM-DD (ex: 2024-12-25)'
            });
          }

          if (!cfg.settings.extraDates) {
            cfg.settings.extraDates = [];
          }

          const dateExists = cfg.settings.extraDates.includes(dateInput);

          if (dateExists) {
            // Remover data existente
            cfg.settings.extraDates = cfg.settings.extraDates.filter(d => d !== dateInput);
            
            if (cfg.settings.extraDates.length === 0) {
              cfg.settings.allowExtraDays = false;
            }
            
            db.setConfig(cfg);
            await updateLinkPanel(guildId);

            const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
              await logChannel.send({ embeds: [Embeds.accessLog(user, 'removed', dateInput)] });
            }

            return interaction.editReply({
              content: `❌ **Dia extra removido!**\n📅 Data: **${dateInput}**`
            });
          } else {
            // Adicionar nova data
            cfg.settings.extraDates.push(dateInput);
            cfg.settings.allowExtraDays = true;

            if (timeInput) {
              cfg.settings.sessionTime = timeInput;
            }

            db.setConfig(cfg);
            await updateLinkPanel(guildId);

            const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
              await logChannel.send({ 
                embeds: [Embeds.accessLog(user, 'added', dateInput, timeInput)] 
              });
            }

            let responseMessage = `✅ **Dia extra liberado!**\n📅 Data: **${dateInput}**`;
            if (timeInput) {
              responseMessage += `\n🕐 Horário: **${timeInput}**`;
            }

            return interaction.editReply({ content: responseMessage });
          }
        }

        // Se passou apenas hora (sem data) → configurar horário geral
        if (timeInput && !dateInput) {
          cfg.settings.sessionTime = timeInput;
          db.setConfig(cfg);
          await updateLinkPanel(guildId);

          return interaction.editReply({
            content: `🕐 **Horário da sessão atualizado!**\n📅 Próximas sessões começarão às **${timeInput}**`
          });
        }

        // Sem data e sem hora → controle manual da sessão
        if (cfg.settings?.sessionCancelled) {
          // Descancelar
          cfg.settings.sessionCancelled = false;
          cfg.settings.sessionOpen = null;
          db.setConfig(cfg);
          await updateLinkPanel(guildId);

          return interaction.editReply({
            content: '✅ **Sessão restaurada!**\nO sistema voltou ao modo automático.'
          });
        }

        if (cfg.settings?.sessionOpen === true) {
          // Fechar sessão manual
          cfg.settings.sessionOpen = false;
          db.setConfig(cfg);
          await updateLinkPanel(guildId);

          return interaction.editReply({
            content: '❌ **Sessão fechada manualmente.**\nO botão de link foi removido.'
          });
        }

        if (Validators.isSaturday()) {
          // Cancelar sábado
          cfg.settings.sessionCancelled = true;
          cfg.settings.sessionOpen = false;
          db.setConfig(cfg);
          await updateLinkPanel(guildId);

          return interaction.editReply({
            content: '🚫 **Sessão de sábado CANCELADA!**\nO botão será removido até meia-noite.'
          });
        }

        // Dia normal → abrir manualmente
        cfg.settings.sessionOpen = true;
        cfg.settings.sessionCancelled = false;
        db.setConfig(cfg);
        await updateLinkPanel(guildId);

        return interaction.editReply({
          content: '✅ **Sessão ABERTA manualmente!**\nO botão de link está disponível até meia-noite.'
        });
      }
    }

    // ==========================================
    // BOTÕES
    // ==========================================
    if (interaction.isButton()) {
      const { customId, user, member, guildId } = interaction;

      // Botão de solicitar link
      if (customId === 'request_link') {
        // Verificar se a sessão está liberada
        if (!Validators.isAllowedDay(guildId)) {
          const countdown = Validators.getCountdownTimestamp(guildId);
          
          if (countdown) {
            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(Colors.Orange)
                  .setTitle('⏰ SESSÃO NÃO INICIADA')
                  .setDescription(`A sessão começará <t:${countdown}:R>.\n\n📅 Horário: <t:${countdown}:t>`)
              ],
              ephemeral: true
            });
          }

          const daysUntil = Validators.daysUntilNextSession();
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ SESSÃO FECHADA')
                .setDescription(`Não há sessão disponível.\n📅 Próximo sábado em **${daysUntil} dia(s)**.`)
            ],
            ephemeral: true
          });
        }

        const db = getDB(guildId);

        // Verificar limite diário
        if (!db.canRequestToday(user.id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ LIMITE ATINGIDO')
                .setDescription(`Você já usou todas as suas solicitações de hoje.\n📅 Tente novamente amanhã.`)
            ],
            ephemeral: true
          });
        }

        // Verificar cooldown
        if (db.isOnCooldown(user.id)) {
          const remaining = db.getCooldownRemaining(user.id);
          const minutes = Math.ceil(remaining / 60000);
          
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle('⏳ AGUARDE')
                .setDescription(`Aguarde **${minutes} minuto(s)** antes de solicitar novamente.`)
            ],
            ephemeral: true
          });
        }

        // Mostrar modal de confirmação
        const linkModal = Modals.linkRequest();
        return await interaction.showModal(linkModal);
      }

      // Botões de configuração (verificar owner)
      if (customId.startsWith('cfg_')) {
        if (!Validators.isOwner(user.id)) {
          return interaction.reply({
            content: '❌ Apenas o proprietário do bot pode usar estas configurações.',
            ephemeral: true
          });
        }
      }

      if (customId === 'cfg_geral') {
        const modal = Modals.configGeral(guildId);
        return await interaction.showModal(modal);
      }

      if (customId === 'cfg_date') {
        const modal = Modals.accessDay();
        return await interaction.showModal(modal);
      }

      if (customId === 'cfg_link') {
        const modal = Modals.configLink(guildId);
        return await interaction.showModal(modal);
      }

      if (customId === 'cfg_session') {
        const db = getDB(guildId);
        const cfg = db.config;

        // Ciclar entre estados
        if (cfg.settings?.sessionCancelled) {
          cfg.settings.sessionCancelled = false;
          cfg.settings.sessionOpen = null;
        } else if (cfg.settings?.sessionOpen === true) {
          cfg.settings.sessionOpen = false;
        } else if (Validators.isSaturday()) {
          cfg.settings.sessionCancelled = true;
          cfg.settings.sessionOpen = false;
        } else {
          cfg.settings.sessionOpen = true;
          cfg.settings.sessionCancelled = false;
        }

        db.setConfig(cfg);
        await updateLinkPanel(guildId);

        // Atualizar o embed do /config
        await interaction.update({
          embeds: [Embeds.configPanel(guildId)],
          components: interaction.message.components
        });
      }
    }

    // ==========================================
    // MODAIS
    // ==========================================
    if (interaction.isModalSubmit()) {
      const { customId, user, member, guildId } = interaction;

      // Modal de solicitação de link
      if (customId === 'link_modal') {
        const confirmText = interaction.fields.getTextInputValue('confirm');

        if (confirmText !== 'CONFIRMAR') {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ CONFIRMAÇÃO INCORRETA')
                .setDescription('Você precisa digitar exatamente **CONFIRMAR** para receber o link.')
            ],
            ephemeral: true
          });
        }

        // Processar solicitação
        const db = getDB(guildId);
        const currentTier = db.getUserTier(user.id);

        // Registrar
        db.addTodayRequest(user.id);
        const totalSessions = db.addSession(user.id);
        db.addJoin(user.id, user.username, currentTier);

        // Enviar link
        const welcomeEmbed = Embeds.welcomeMessage(guildId, user, currentTier);
        await interaction.reply({
          embeds: [welcomeEmbed],
          ephemeral: true
        });

        // Verificar promoção
        const promoted = await TierManager.promote(member);
        if (promoted) {
          setTimeout(async () => {
            try {
              const promoEmbed = Embeds.promotion(
                user,
                promoted.from,
                promoted.to,
                totalSessions
              );

              await interaction.followUp({
                embeds: [promoEmbed],
                ephemeral: true
              });

              // Log no canal de logs
              const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
              if (logChannel) {
                await logChannel.send({
                  content: `🎉 **${user.username}** foi promovido(a)!`,
                  embeds: [promoEmbed]
                });
              }
            } catch (promoError) {
              Logger.error(`Erro ao notificar promoção: ${promoError.message}`);
            }
          }, 2000);
        }
      }

      // Verificar owner para modais de configuração
      const isConfigModal = ['config_geral', 'link_config', 'access_day'].includes(customId) || 
                           customId.startsWith('tier_');
      
      if (isConfigModal && !Validators.isOwner(user.id)) {
        return interaction.reply({
          content: '❌ Apenas o proprietário do bot pode modificar configurações.',
          ephemeral: true
        });
      }

      // Modal de configurações gerais
      if (customId === 'config_geral') {
        const maxDaily = parseInt(interaction.fields.getTextInputValue('max_daily'));
        const cooldown = parseInt(interaction.fields.getTextInputValue('cooldown'));
        const sessionTime = interaction.fields.getTextInputValue('session_time')?.trim() || null;

        if (isNaN(maxDaily) || maxDaily < 1 || isNaN(cooldown) || cooldown < 1) {
          return interaction.reply({
            content: '❌ **Valores inválidos!**\nTodos os valores devem ser números maiores que 0.',
            ephemeral: true
          });
        }

        if (sessionTime && !Validators.isValidTime(sessionTime)) {
          return interaction.reply({
            content: '❌ **Horário inválido!**\nUse o formato HH:MM (ex: 14:00) ou deixe vazio.',
            ephemeral: true
          });
        }

        const db = getDB(guildId);
        const cfg = db.config;
        cfg.settings.maxDailyRequests = maxDaily;
        cfg.settings.cooldownMinutes = cooldown;
        cfg.settings.sessionTime = sessionTime;
        db.setConfig(cfg);

        await updateLinkPanel(guildId);

        let responseMessage = '✅ **Configurações atualizadas!**\n';
        responseMessage += `📊 Limite diário: **${maxDaily}**\n`;
        responseMessage += `⏰ Cooldown: **${cooldown} minutos**\n`;
        responseMessage += sessionTime 
          ? `🕐 Horário: **${sessionTime}**` 
          : '🕐 Horário: **Dia todo**';

        await interaction.reply({ content: responseMessage, ephemeral: true });
      }

      // Modal de edição de tier
      if (customId.startsWith('tier_')) {
        const tierName = customId.replace('tier_', '');
        const roleId = interaction.fields.getTextInputValue('role_id')?.trim() || null;
        const sessionsNeeded = parseInt(interaction.fields.getTextInputValue('sessions'));
        const tierDisplayName = interaction.fields.getTextInputValue('tier_name')?.trim() || null;

        if (isNaN(sessionsNeeded) || sessionsNeeded < 0) {
          return interaction.reply({
            content: '❌ **Valor inválido!**\nO número de sessões deve ser 0 ou maior.',
            ephemeral: true
          });
        }

        const db = getDB(guildId);
        const cfg = db.config;

        if (cfg.tiers[tierName]) {
          if (roleId && /^\d{17,19}$/.test(roleId)) {
            cfg.tiers[tierName].roleId = roleId;
          } else if (roleId && !/^\d{17,19}$/.test(roleId)) {
            return interaction.reply({
              content: '❌ **ID de cargo inválido!**\nO ID deve ter 17-19 dígitos numéricos.',
              ephemeral: true
            });
          }

          cfg.tiers[tierName].sessionsNeeded = sessionsNeeded;
          
          if (tierDisplayName) {
            cfg.tiers[tierName].name = tierDisplayName;
          }

          db.setConfig(cfg);
          await updateLinkPanel(guildId);

          const level = parseInt(tierName.split('_')[1]);
          const emoji = TierManager.getTierEmoji(level);

          await interaction.reply({
            content: `✅ ${emoji} **${tierDisplayName || tierName.replace('_', ' ')}** atualizado!\n📊 Sessões necessárias: **${sessionsNeeded}**`,
            ephemeral: true
          });
        }
      }

      // Modal de configuração de link
      if (customId === 'link_config') {
        const url = interaction.fields.getTextInputValue('url')?.trim();
        const name = interaction.fields.getTextInputValue('name')?.trim();
        const description = interaction.fields.getTextInputValue('desc')?.trim();

        if (!url || !name) {
          return interaction.reply({
            content: '❌ **Campos obrigatórios!**\nURL e Nome são obrigatórios.',
            ephemeral: true
          });
        }

        if (!url.startsWith('https://') && !url.startsWith('http://')) {
          return interaction.reply({
            content: '❌ **URL inválida!**\nA URL deve começar com http:// ou https://',
            ephemeral: true
          });
        }

        const db = getDB(guildId);
        const cfg = db.config;
        cfg.link.url = url;
        cfg.link.name = name;
        cfg.link.description = description || 'Bem-vindo(a) à sessão! Siga as regras e divirta-se.';
        cfg.link.configuredAt = new Date().toISOString();
        cfg.link.configuredBy = user.id;
        db.setConfig(cfg);

        await updateLinkPanel(guildId);

        await interaction.reply({
          content: `✅ **Link configurado com sucesso!**\n🔗 **${name}**\n${url}`,
          ephemeral: true
        });
      }

      // Modal de dia extra
      if (customId === 'access_day') {
        const dateInput = interaction.fields.getTextInputValue('date')?.trim();
        const timeInput = interaction.fields.getTextInputValue('time')?.trim() || null;

        if (!Validators.isValidDate(dateInput)) {
          return interaction.reply({
            content: '❌ **Data inválida!**\nUse o formato YYYY-MM-DD (ex: 2024-12-25)',
            ephemeral: true
          });
        }

        if (timeInput && !Validators.isValidTime(timeInput)) {
          return interaction.reply({
            content: '❌ **Horário inválido!**\nUse o formato HH:MM (ex: 20:00) ou deixe vazio.',
            ephemeral: true
          });
        }

        const db = getDB(guildId);
        const cfg = db.config;

        if (!cfg.settings.extraDates) {
          cfg.settings.extraDates = [];
        }

        if (!cfg.settings.extraDates.includes(dateInput)) {
          cfg.settings.extraDates.push(dateInput);
          cfg.settings.allowExtraDays = true;

          if (timeInput) {
            cfg.settings.sessionTime = timeInput;
          }

          db.setConfig(cfg);
          await updateLinkPanel(guildId);

          let responseMessage = `✅ **Dia extra adicionado!**\n📅 Data: **${dateInput}**`;
          if (timeInput) {
            responseMessage += `\n🕐 Horário: **${timeInput}**`;
          }

          await interaction.reply({ content: responseMessage, ephemeral: true });
        } else {
          await interaction.reply({
            content: `❌ O dia **${dateInput}** já está na lista de dias extras.`,
            ephemeral: true
          });
        }
      }
    }

    // ==========================================
    // SELECT MENUS
    // ==========================================
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'cfg_tier') {
        if (!Validators.isOwner(interaction.user.id)) {
          return interaction.reply({
            content: '❌ Apenas o proprietário do bot pode modificar configurações.',
            ephemeral: true
          });
        }

        const selectedTier = interaction.values[0];
        const modal = Modals.configTier(interaction.guildId, selectedTier);
        await interaction.showModal(modal);
      }
    }

  } catch (error) {
    Logger.error(`❌ Erro crítico na interação: ${error.message}`);
    Logger.error(error.stack);

    // Tentar responder ao usuário
    const errorResponse = {
      content: '❌ Ocorreu um erro inesperado ao processar sua solicitação. Por favor, tente novamente.',
      ephemeral: true
    };

    try {
      if (interaction.deferred) {
        await interaction.editReply(errorResponse);
      } else if (!interaction.replied) {
        await interaction.reply(errorResponse);
      } else {
        await interaction.followUp(errorResponse);
      }
    } catch (replyError) {
      Logger.error(`❌ Não foi possível responder ao erro: ${replyError.message}`);
    }

    // Log do erro no canal de logs
    try {
      const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({
          embeds: [Embeds.errorLog(error, interaction.customId || 'interação desconhecida')]
        });
      }
    } catch (logError) {
      // Não podemos fazer nada se o log falhar
    }
  }
});

// ============================================
// TRATAMENTO DE ERROS GLOBAIS
// ============================================
process.on('unhandledRejection', (error) => {
  Logger.error(`🚫 ERRO NÃO TRATADO (Promise): ${error.message}`);
  Logger.error(error.stack);
});

process.on('uncaughtException', (error) => {
  Logger.error(`💥 EXCEÇÃO NÃO CAPTURADA: ${error.message}`);
  Logger.error(error.stack);
  
  // Para erros críticos, tentar continuar
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    Logger.warn('⚠️ Erro de conexão detectado. Tentando reconectar...');
  }
});

process.on('SIGINT', () => {
  Logger.warn('🛑 Sinal SIGINT recebido. Finalizando bot...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  Logger.warn('🛑 Sinal SIGTERM recebido. Finalizando bot...');
  client.destroy();
  process.exit(0);
});

// ============================================
// INICIAR O BOT
// ============================================
(async () => {
  try {
    Logger.info('🔑 Iniciando conexão com o Discord...');
    await client.login(TOKEN);
    Logger.success('✅ Bot conectado com sucesso!');
  } catch (error) {
    Logger.error(`❌ FALHA CRÍTICA AO INICIAR: ${error.message}`);
    Logger.error('Verifique se o token está correto no arquivo .env');
    process.exit(1);
  }
})();

// ============================================
// EXPORT PARA USO EXTERNO (OUTROS BOTS)
// ============================================
global.AscendSystem = {
  // Database
  getDB,
  getGuildData: getDB,
  clearDBCache,
  
  // Managers
  TierManager,
  Validators,
  Embeds,
  Modals,
  
  // Config
  TIERS_CONFIG,
  TIER_COLORS,
  TIER_EMOJIS,
  TIER_NAMES,
  MAX_TIERS,
  
  // Utilities
  updateLinkPanel,
  createBackup,
  Logger
};

console.log('✅ [4/4] Sistema completo de eventos, interações e inicialização carregado!');
console.log('🚀 Ascend System v9.0 PRONTO PARA USO!');