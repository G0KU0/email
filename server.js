const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Statikus fájlok kiszolgálása a 'public' mappából
app.use(express.static(path.join(__dirname, 'public')));

// --- MAILISK ADATOK (A te egyedi kulcsaiddal) ---
const MAILISK_API_KEY = 'sk_KAnVXCrADIF1qYWJsP7Ao823pWsO99dQbVbD9ROP2RQ';
const MAILISK_NAMESPACE = 'e34tx612tpip'; 
const JWT_SECRET = process.env.JWT_SECRET || 'szaby_titok_123';

// MongoDB Csatlakozás
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log(">>> MongoDB OK"))
    .catch(err => console.error("!!! MongoDB Hiba:", err));

// Adatmodell
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    emailAddress: { type: String, unique: true }
}));

// API: REGISZTRÁCIÓ
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Automatikusan létrehozzuk a Mailisk-es címet (kisbetűvel a biztonság kedvéért)
        const email = `${username.toLowerCase()}@${MAILISK_NAMESPACE}.mailisk.net`;

        const newUser = new User({
            username,
            password: hashedPassword,
            emailAddress: email
        });

        await newUser.save();
        res.status(201).json({ message: "Sikeres regisztráció!", email });
    } catch (e) {
        res.status(400).json({ error: "Hiba: A név már foglalt vagy rossz adat." });
    }
});

// API: BELÉPÉS
app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });
        if (user && await bcrypt.compare(req.body.password, user.password)) {
            const token = jwt.sign({ email: user.emailAddress }, JWT_SECRET);
            res.json({ token, email: user.emailAddress });
        } else {
            res.status(401).json({ error: "Hibás felhasználónév vagy jelszó!" });
        }
    } catch (e) { res.status(500).json({ error: "Szerver hiba" }); }
});

// API: INBOX (Levelek lekérése a Mailisk-től)
app.get('/api/inbox', async (req, res) => {
    try {
        const token = req.headers['authorization'];
        if (!token) return res.status(401).json({ error: "Nincs token" });

        const decoded = jwt.verify(token, JWT_SECRET);
        const myEmail = decoded.email.toLowerCase();

        // Lekérjük az összes levelet a Mailisk-től
        const response = await fetch(`https://api.mailisk.com/api/emails?namespace=${MAILISK_NAMESPACE}`, {
            headers: { 'X-Api-Key': MAILISK_API_KEY }
        });
        const data = await response.json();

        if (!data.emails) return res.json([]);

        // Csak azokat szűrjük ki, amik NEKÜNK jöttek
        const filtered = data.emails.filter(e => 
            e.to.some(r => r.address.toLowerCase() === myEmail)
        );

        // Formázás a frontend számára
        const emails = filtered.map(e => ({
            id: e.id,
            from: e.from[0] ? e.from[0].address : "Ismeretlen",
            subject: e.subject || "(Nincs tárgy)",
            body: e.text || e.html || "Nincs tartalom",
            date: e.date
        }));

        res.json(emails);
    } catch (e) {
        console.error("Inbox hiba:", e.message);
        res.status(403).json({ error: "Hiba a levelek betöltésekor" });
    }
});

// Catch-all: Ha nem API-t hívunk, az index.html-t adjuk vissza
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(process.env.PORT || 3000, () => console.log("Szerver elindult!"));
