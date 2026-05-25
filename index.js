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
    "1507716876170690663",
    "1506672783797518368"
];

const LOG_CHANNEL_ID = "1508485239683416195";
const ALLOWED_COMMAND_CHANNEL_ID = "1508485239683416195";

// ===== STOCK =====
const FILE = "./stock.json";

let stock = {
    sporex: 0,
    heroine: 0,
    argentSale: 0
};

if (fs.existsSync(FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(FILE));

        stock = {
            sporex: Number(data.sporex) || 0,
            heroine: Number(data.heroine) || 0,
            argentSale: Number(data.argentSale || data.argentsale) || 0
        };

    } catch (e) {
        stock = { sporex: 0, heroine: 0, argentSale: 0 };
    }
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
                .setDescription("Choisir un item")
                .setRequired(true)
                .addChoices(
                    { name: "SporeX", value: "sporex" },
                    { name: "Heroine", value: "heroine" },
                    { name: "Argent Sale", value: "argentSale" }
                )
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
                .setDescription("Choisir un item")
                .setRequired(true)
                .addChoices(
                    { name: "SporeX", value: "sporex" },
                    { name: "Heroine", value: "heroine" },
                    { name: "Argent Sale", value: "argentSale" }
                )
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

    const handle = (text) => {
        if (!text) return;

        const clean = normalize(text);
        console.log("📩 PART:", clean);

        // 🔥 MATCH ROBUSTE (support accents + espaces + multi mots)
const match = clean.match(/(\d+)\s*x\s*(.+)/i);
if (!match) return;

const amount = parseInt(match[1]);
const itemText = match[2].toLowerCase();

// nettoyage IMPORTANT
const itemClean = itemText
    .replace(/a deposé|a depose|a retiré|a retire/gi, "")
    .trim();

let item = null;

if (itemClean.includes("sporex")) item = "sporex";
else if (itemClean.includes("heroine")) item = "heroine";
else if (itemClean.includes("argent")) item = "argentSale";

if (!item) return;

const isRemove = /(retir|retire|retiré)/i.test(clean);
const isAdd = /(depos|depose|posé|pose|a deposé|a depose)/i.test(clean);

stock[item] = Number(stock[item]) || 0;

if (isRemove) {
    stock[item] -= amount;
} else if (isAdd) {
    stock[item] += amount;
}

changed = true;
    };

    // ===== CONTENT =====
    handle(message.content);

    // ===== EMBEDS (FIX IMPORTANT) =====
    if (message.embeds?.length) {
        for (const embed of message.embeds) {

            handle(embed.title);
            handle(embed.description);

            if (embed.fields?.length) {
                for (const f of embed.fields) {
                    handle(f.name);
                    handle(f.value);
                }
            }
        }
    }

    if (!changed) return;

    saveStock();

    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (ch) {
        ch.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("📦 Stock update")
                    .setColor(0x00ff99)
                    .setDescription(
    [
        `💊 SporeX: **${Number(stock.sporex) || 0}**`,
        `🧪 Heroine: **${Number(stock.heroine) || 0}**`,
        `💰 Argent Sale: **${Number(stock.argentSale) || 0}**`
    ].join("\n")
)
            ]
        });
    }
});

// ===== COMMANDS =====
client.on(Events.InteractionCreate, async (interaction) => {

    if (!interaction.isChatInputCommand()) return;

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
                        { name: "💊 SporeX", value: `${Number(stock.sporex) || 0}`, inline: true },
                        { name: "🧪 Heroine", value: `${Number(stock.heroine) || 0}`, inline: true },
                        { name: "💰 Argent Sale", value: `${Number(stock.argentSale) || 0}`, inline: true },
                    )
            ]
        });
    }

    // ➕ ADD
    if (interaction.commandName === "stockadd") {

        const item = interaction.options.getString("item");
        const amount = interaction.options.getInteger("amount");

        if (stock[item] === undefined) stock[item] = 0;

        stock[item] = (stock[item] || 0) + amount;
        saveStock();

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("➕ Stock ajouté")
                    .setColor(0x00ff00)
                    .addFields(
                        { name: "Item", value: item, inline: true },
                        { name: "Ajouté", value: `${amount}`, inline: true },
                        { name: "Total", value: `${stock[item]}` }
                    )
            ]
        });
    }

    // ➖ REMOVE
    if (interaction.commandName === "stockremove") {

        const item = interaction.options.getString("item");
        const amount = interaction.options.getInteger("amount");

        if (stock[item] === undefined) stock[item] = 0;

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
                        { name: "Total", value: `${stock[item]}` }
                    )
            ]
        });
    }

});

client.login(TOKEN);