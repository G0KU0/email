const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

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

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Adatbázis aktív!"))
    .catch(err => console.error("DB Hiba:", err));

// --- ÚTVONALAK ---

// Regisztráció - Itt rakjuk össze a @-os címet
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // ITT TÖRTÉNIK A VARÁZSLAT: felhasználó + @ + domain
        const teljesEmail = `${username}@${process.env.DOMAIN_NAME}`;

        const newUser = new User({
            username,
            password: hashedPassword,
            emailAddress: teljesEmail
        });

        await newUser.save();
        res.status(201).json({ message: `Sikeres! Az új címed: ${teljesEmail}` });
    } catch (e) { 
        res.status(400).json({ error: "Ez a név már foglalt!" }); 
    }
});

// Belépés
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ email: user.emailAddress }, process.env.JWT_SECRET);
        res.json({ token, email: user.emailAddress });
    } else { 
        res.status(401).json({ error: "Hibás felhasználónév vagy jelszó!" }); 
    }
});

// Webhook a bejövő leveleknek
app.post('/api/webhook/incoming', async (req, res) => {
    const { from, to, subject, body } = req.body;
    const newEmail = new Email({ from, to, subject, body });
    await newEmail.save();
    res.status(200).send("OK");
});

// Levelek lekérése
app.get('/api/inbox', async (req, res) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).send("Nincs token");
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const emails = await Email.find({ to: decoded.email }).sort({ receivedAt: -1 });
        res.json(emails);
    } catch (e) { 
        res.status(403).send("Lejárt munkamenet"); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Szerver elindult!`));
