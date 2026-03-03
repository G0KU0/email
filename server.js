const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();

// --- KONFIGURÁCIÓ ---
// A Resend API kulcsodat érdemes a Render felületén (Environment Variables) megadni RESEND_API_KEY néven!
const resend = new Resend(process.env.RESEND_API_KEY || 're_K1DJHynN_JKJ73ULXEa4DEjZA7HjnV3MD');
const JWT_SECRET = process.env.JWT_SECRET || 'titkos_kulcs_123';
const DOMAIN = process.env.DOMAIN_NAME || 'szabymail.run.place';

app.use(express.json());
app.use(cors());

// --- 1. JAVÍTÁS: STATIKUS FÁJLOK ÉS FŐOLDAL ---
// Ez a rész gondoskodik róla, hogy a 'public' mappában lévő index.html megjelenjen
app.use(express.static(path.join(__dirname, 'public')));

// --- ADATBÁZIS MODELLEK ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    emailAddress: { type: String, unique: true }
}));

const Email = mongoose.model('Email', new mongoose.Schema({
    from: String,
    to: String,
    subject: String,
    body: String,
    receivedAt: { type: Date, default: Date.now }
}));

// MongoDB Csatlakozás
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log(">>> Sikeres MongoDB csatlakozás!"))
    .catch(err => console.error("!!! MongoDB hiba:", err));

// --- API ÚTVONALAK ---

// 2. JAVÍTÁS: REGISZTRÁCIÓ (KUKAC JEL AUTOMATIKUSAN)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Összeállítjuk a teljes e-mail címet a kukaccal
        const teljesEmail = `${username}@${DOMAIN}`;

        const newUser = new User({
            username,
            password: hashedPassword,
            emailAddress: `${username}@${domain}`
        });

        await newUser.save();
        res.status(201).json({ message: "Sikeres regisztráció!", email: teljesEmail });
    } catch (e) {
        res.status(400).json({ error: "Ez a felhasználónév már foglalt!" });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ email: user.emailAddress }, JWT_SECRET);
        res.json({ token, email: user.emailAddress });
    } else {
        res.status(401).json({ error: "Hibás felhasználónév vagy jelszó!" });
    }
});

// LEVÉL KÜLDÉSE (Resend API használatával)
app.post('/api/send', async (req, res) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: "Nincs jogosultságod!" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { to, subject, body } = req.body;

        await resend.emails.send({
            from: `SzabyMail <mail@${DOMAIN}>`, // A Resend-nek valid feladó kell
            to: [to],
            subject: subject,
            html: `<strong>Üzenet tőle: ${decoded.email}</strong><br><p>${body}</p>`
        });

        res.json({ message: "Levél sikeresen elküldve!" });
    } catch (error) {
        res.status(500).json({ error: "Küldési hiba: " + error.message });
    }
});

// 3. JAVÍTÁS: WEBHOOK FOGADÁSA (RE-SEND INBOUND)
// Ezt a végpontot hívja meg a Resend, ha levél érkezik neked
app.post('/api/webhook/incoming', async (req, res) => {
    try {
        const { from, to, subject, text, html } = req.body;

        const newEmail = new Email({
            from: from,
            to: to,
            subject: subject || "(Nincs tárgy)",
            body: text || html || ""
        });

        await newEmail.save();
        console.log(`Új levél érkezett: ${to}`);
        res.status(200).send("OK");
    } catch (error) {
        console.error("Webhook hiba:", error);
        res.status(500).send("Hiba");
    }
});

// INBOX LEKÉRÉSE
app.get('/api/inbox', async (req, res) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).send("Nincs token");

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const emails = await Email.find({ to: decoded.email }).sort({ receivedAt: -1 });
        res.json(emails);
    } catch (e) {
        res.status(403).send("Hiba az azonosításnál");
    }
});

// 4. JAVÍTÁS: CATCH-ALL ÚTVONAL
// Bármilyen egyéb kérés esetén az index.html-t adjuk vissza
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Szerver indítása
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`Szerver elindult a ${PORT} porton!`);
    console.log(`Domain: ${DOMAIN}`);
    console.log(`-----------------------------------------`);
});
