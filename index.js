const express = require("express");
const app = express();

app.get("/", (req, res) => {
    res.send("Bot Discord en ligne ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("🌐 Serveur web actif sur le port " + PORT);
});

const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;

const TARGET_WEBHOOKS = [
    "1506738453776306278",
    "1507716876170690663"
];

const LOG_CHANNEL_ID = "1508485239683416195";
const ALLOWED_COMMAND_CHANNEL_ID = "1508485239683416195";

// ===== STOCK =====
const FILE = "./stock.json";

let stock = { sporex: 0, heroine: 0 };

if (fs.existsSync(FILE)) {
    stock = JSON.parse(fs.readFileSync(FILE));
}

function saveStock() {
    fs.writeFileSync(FILE, JSON.stringify(stock, null, 2));
}

// ===== NORMALIZE =====
function normalize(text) {
    return (text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

// ===== EXTRACT ALL TEXT =====
function extractText(message) {

    let parts = [];

    if (message.content) parts.push(message.content);

    if (message.embeds?.length) {
        for (const e of message.embeds) {

            if (e.title) parts.push(e.title);
            if (e.description) parts.push(e.description);

            if (e.fields?.length) {
                for (const f of e.fields) {
                    parts.push(`${f.name} ${f.value}`);
                }
            }
        }
    }

    return normalize(parts.join(" "));
}

// ===== PROCESS LINE (FIX FINAL ROBUSTE) =====
function processLine(line) {

    // 👉 match: 1x heroine / 10x sporex etc
    const match = line.match(/(\d+)\s*x\s*([a-zA-Z]+)/i);
    if (!match) return;

    const amount = parseInt(match[1]);
    const itemRaw = match[2].toLowerCase();

    let item = null;
    if (itemRaw.includes("sporex")) item = "sporex";
    if (itemRaw.includes("heroine")) item = "heroine";
    if (!item) return;

    const isRemove = /retir|retire|retiré/i.test(line);
    const isAdd = /depos|depots|depose|posé|pose/i.test(line);

    if (!stock[item]) stock[item] = 0;

    if (isRemove) stock[item] -= amount;
    else if (isAdd) stock[item] += amount;
}

// ===== BOT =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ===== SLASH COMMANDS =====
const commands = [
    new SlashCommandBuilder()
        .setName("stock")
        .setDescription("Affiche le stock actuel"),

    new SlashCommandBuilder()
        .setName("stockadd")
        .setDescription("Ajouter du stock")
        .addStringOption(o =>
            o.setName("item")
                .setDescription("sporex ou heroine")
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("amount")
                .setDescription("quantité à ajouter")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("stockremove")
        .setDescription("Retirer du stock")
        .addStringOption(o =>
            o.setName("item")
                .setDescription("sporex ou heroine")
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("amount")
                .setDescription("quantité à retirer")
                .setRequired(true)
        )
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ===== READY =====
client.once(Events.ClientReady, async () => {

    console.log(`Bot connecté : ${client.user.tag}`);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );

    console.log("Slash commands OK");
});

// ===== WEBHOOK HANDLER =====
client.on("messageCreate", async (message) => {

    if (!message.webhookId) return;
    if (!TARGET_WEBHOOKS.includes(message.webhookId)) return;

    let changed = false;

    const process = (text) => {

        if (!text) return;

        const clean = normalize(text);

        console.log("📩 PART:", clean);

        const match = clean.match(/(\d+)\s*x\s*(sporex|heroine)/i);
        if (!match) return;

        const amount = parseInt(match[1]);
        const item = match[2].toLowerCase();

        const isRemove = /retir/.test(clean);
        const isAdd = /depos|pose/.test(clean);

        if (!stock[item]) stock[item] = 0;

        if (isRemove) stock[item] -= amount;
        else if (isAdd) stock[item] += amount;

        changed = true;
    };

    // 🔥 1. CONTENT
    process(message.content);

    // 🔥 2. EACH EMBED INDIVIDUALLY (IMPORTANT FIX)
    for (const embed of message.embeds) {

        process(embed.title);
        process(embed.description);

        if (embed.fields) {
            for (const f of embed.fields) {
                process(f.name);
                process(f.value);
            }
        }
    }

    if (!changed) return;

    saveStock();

    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (ch) {
        ch.send(`📦 Stock :
- sporex: ${stock.sporex}
- heroine: ${stock.heroine}`);
    }
});

// ===== SLASH COMMAND =====
client.on(Events.InteractionCreate, async (interaction) => {

    if (!interaction.isChatInputCommand()) return;

    // 🔒 salon lock
    if (interaction.channelId !== ALLOWED_COMMAND_CHANNEL_ID) {
        return interaction.reply({
            content: "❌ Commande uniquement dans le salon autorisé.",
            ephemeral: true
        });
    }

    // 📦 STOCK
    if (interaction.commandName === "stock") {

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("📦 Stock actuel")
                    .setColor(0x00ff99)
                    .addFields(
                        { name: "💊 SporeX", value: `${stock.sporex}`, inline: true },
                        { name: "🧪 Heroine", value: `${stock.heroine}`, inline: true }
                    )
            ]
        });
    }

    // ➕ STOCK ADD
    if (interaction.commandName === "stockadd") {

        const item = interaction.options.getString("item").toLowerCase();
        const amount = interaction.options.getInteger("amount");

        if (!stock[item]) stock[item] = 0;

        stock[item] += amount;
        saveStock();

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("➕ Stock ajouté")
                    .setColor(0x00ff00)
                    .addFields(
                        { name: "Item", value: item, inline: true },
                        { name: "Ajouté", value: `${amount}`, inline: true },
                        { name: "Total", value: `${stock[item]}`, inline: true }
                    )
            ]
        });
    }

    // ➖ STOCK REMOVE
    if (interaction.commandName === "stockremove") {

        const item = interaction.options.getString("item").toLowerCase();
        const amount = interaction.options.getInteger("amount");

        if (!stock[item]) stock[item] = 0;

        stock[item] -= amount;
        saveStock();

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("➖ Stock retiré")
                    .setColor(0xff0000)
                    .addFields(
                        { name: "Item", value: item, inline: true },
                        { name: "Retiré", value: `${amount}`, inline: true },
                        { name: "Total", value: `${stock[item]}`, inline: true }
                    )
            ]
        });
    }

});

client.login(TOKEN);