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
app.use(express.static(path.join(__dirname, 'public')));

// --- MAILISK ADATOK (A dokumentáció alapján javítva) ---
const MAILISK_API_KEY = 'sk_KAnVXCrADIF1qYWJsP7Ao823pWsO99dQbVbD9ROP2RQ';
const MAILISK_NAMESPACE = 'e34tx612tpip'; 
const JWT_SECRET = process.env.JWT_SECRET || 'szaby_titok_456';

mongoose.connect(process.env.MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    emailAddress: { type: String, unique: true }
}));

// REGISZTRÁCIÓ
app.post('/api/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const email = `${req.body.username.toLowerCase()}@${MAILISK_NAMESPACE}.mailisk.net`;
        const newUser = new User({
            username: req.body.username,
            password: hashedPassword,
            emailAddress: email
        });
        await newUser.save();
        res.status(201).json({ message: "Sikeres regisztráció!", email });
    } catch (e) { res.status(400).json({ error: "Név foglalt!" }); }
});

// BELÉPÉS
app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        const token = jwt.sign({ email: user.emailAddress }, JWT_SECRET);
        res.json({ token, email: user.emailAddress });
    } else { res.status(401).json({ error: "Hibás adatok!" }); }
});

// INBOX LEKÉRÉSE (A dokumentáció alapján 100% javítva)
app.get('/api/inbox', async (req, res) => {
    try {
        const token = req.headers['authorization'];
        const decoded = jwt.verify(token, JWT_SECRET);
        const myEmail = decoded.email.toLowerCase();

        // 1. JAVÍTÁS: A dokumentáció szerinti pontos URL
        const url = `https://api.mailisk.com/api/emails/${MAILISK_NAMESPACE}/inbox`;
        
        const response = await fetch(url, {
            headers: { 
                'Accept': 'application/json',
                'X-Api-Key': MAILISK_API_KEY // 2. JAVÍTÁS: API kulcs fejlécben
            }
        });

        const result = await response.json();

        // 3. JAVÍTÁS: A levelek a "data" mezőben vannak
        if (!result.data || !Array.isArray(result.data)) {
            return res.json([]);
        }

        // Szűrés a bejelentkezett felhasználóra
        const filtered = result.data.filter(e => 
            e.to && e.to.some(r => r.address.toLowerCase() === myEmail)
        );

        // Formázás a dokumentációban lévő kulcsok alapján (received_date)
        const emails = filtered.map(e => ({
            id: e.id,
            from: e.from ? e.from.address : "Ismeretlen",
            subject: e.subject || "(Nincs tárgy)",
            body: e.text || e.html || "Nincs tartalom",
            date: e.received_date 
        }));

        res.json(emails);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 3000);
