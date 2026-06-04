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
    argentSale: 0,
    psilocybeRouge: 0,
    psilocybeViolet: 0,
    psilocybeVert: 0
};

if (fs.existsSync(FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(FILE, "utf8"));

        stock.sporex = Number(data.sporex) || 0;
        stock.heroine = Number(data.heroine) || 0;
        stock.argentSale = Number(data.argentSale || data.argentsale) || 0;
        stock.psilocybeRouge = Number(data.psilocybeRouge) || 0;
        stock.psilocybeViolet = Number(data.psilocybeViolet) || 0;
        stock.psilocybeVert = Number(data.psilocybeVert) || 0;

    } catch (e) {
        console.log("Erreur JSON stock, reset automatique");

        stock = {
            sporex: 0,
            heroine: 0,
            argentSale: 0,
            psilocybeRouge: 0,
            psilocybeViolet: 0,
            psilocybeVert: 0
        };
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
                    { name: "Argent Sale", value: "argentSale" },
                    { name: "Psilocybe Rouge", value: "psilocybeRouge" },
                    { name: "Psilocybe Violet", value: "psilocybeViolet" },
                    { name: "Psilocybe Vert", value: "psilocybeVert" }
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
                    { name: "Argent Sale", value: "argentSale" },
                    { name: "Psilocybe Rouge", value: "psilocybeRouge" },
                    { name: "Psilocybe Violet", value: "psilocybeViolet" },
                    { name: "Psilocybe Vert", value: "psilocybeVert" }
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

    if (message.id && global.processedMessages?.has(message.id)) return;
    if (!global.processedMessages) global.processedMessages = new Set();
    global.processedMessages.add(message.id);

    if (global.processedMessages.size > 1000) {
        global.processedMessages.clear();
    }

    let changed = false;

const handle = (text) => {
    if (!text) return;

    const clean = normalize(text);

    const match = clean.match(/(\d+)\s*x\s*(.+)/i);
    if (!match) return;

    const amount = parseInt(match[1]);

    let itemText = match[2].toLowerCase();

    itemText = itemText
        .replace(/\*\*.*?\*\*/g, "")
        .replace(/a deposé|a depose|a retiré|a retire/gi, "")
        .trim();

    let item = null;

    // 💊 ITEMS CLASSIQUES
    if (itemText.includes("sporex")) item = "sporex";
    else if (itemText.includes("heroine")) item = "heroine";
    else if (itemText.includes("argent")) item = "argentSale";

    // 🍄 PSILOCYBES (FIX IMPORTANT)
    else if (itemText.includes("psilocybe rouge")) item = "psilocybeRouge";
    else if (itemText.includes("psilocybe violet")) item = "psilocybeViolet";
    else if (itemText.includes("psilocybe vert")) item = "psilocybeVert";

    if (!item) return;

    const isRemove = /(retir|retire|retiré)/i.test(clean);
    const isAdd = /(depos|depose|posé|pose)/i.test(clean);

    stock[item] = Number(stock[item]) || 0;

    if (isRemove) stock[item] -= amount;
    else if (isAdd) stock[item] += amount;

    changed = true;
};

    // CONTENT
    handle(message.content);

    // EMBEDS
if (message.embeds?.length) {
    for (const embed of message.embeds) {

        const title = embed.title ?? embed.data?.title;
        const description = embed.description ?? embed.data?.description;

        handle(title);
        handle(description);

        const fields = embed.fields ?? embed.data?.fields;

        if (fields?.length) {
            for (const f of fields) {
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
                            `💊 SporeX: **${stock.sporex || 0}**`,
                            `🧪 Heroine: **${stock.heroine || 0}**`,
                            `💰 Argent Sale: **${stock.argentSale || 0}**`,
                            `🍄 Psilocybe Rouge: **${stock.psilocybeRouge || 0}**`,
                            `🍄 Psilocybe Violet: **${stock.psilocybeViolet || 0}**`,
                            `🍄 Psilocybe Vert: **${stock.psilocybeVert || 0}**`
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

    const freshStock = {
        sporex: Number(stock.sporex) || 0,
        heroine: Number(stock.heroine) || 0,
        argentSale: Number(stock.argentSale) || 0,
        psilocybeRouge: Number(stock.psilocybeRouge) || 0,
        psilocybeViolet: Number(stock.psilocybeViolet) || 0,
        psilocybeVert: Number(stock.psilocybeVert) || 0
    };

    return interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("📦 Stock actuel")
                .setColor(0x00ff99)
                .addFields(
                    { name: "💊 SporeX", value: `${freshStock.sporex}`, inline: true },
                    { name: "🧪 Heroine", value: `${freshStock.heroine}`, inline: true },
                    { name: "💰 Argent Sale", value: `${freshStock.argentSale}`, inline: true },
                    { name: "🍄 Psilocybe Rouge", value: `${freshStock.psilocybeRouge}`, inline: true },
                    { name: "🍄 Psilocybe Violet", value: `${freshStock.psilocybeViolet}`, inline: true },
                    { name: "🍄 Psilocybe Vert", value: `${freshStock.psilocybeVert}`, inline: true },
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