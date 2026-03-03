const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// EZ JAVÍTJA A "CANNOT GET /" HIBÁT:
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

// MongoDB csatlakozás
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Adatbázis csatlakozva!"))
    .catch(err => console.error("MongoDB hiba:", err));

// --- ÚTVONALAK ---

// Regisztráció - JAVÍTOTT KUKAC JEL:
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Itt adjuk hozzá a @ jelet automatikusan
        const teljesEmail = `${username}@${process.env.DOMAIN_NAME}`;

        const newUser = new User({
            username,
            password: hashedPassword,
            emailAddress: teljesEmail
        });

        await newUser.save();
        res.status(201).json({ message: "Sikeres regisztráció!", email: teljesEmail });
    } catch (e) { 
        res.status(400).json({ error: "Ez a felhasználónév már foglalt!" }); 
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
        res.status(401).json({ error: "Hibás adatok!" }); 
    }
});

// WEBHOOK (Ide küldi a levelet a postás/továbbító)
app.post('/api/webhook/incoming', async (req, res) => {
    const { from, to, subject, body } = req.body;
    const newEmail = new Email({ from, to, subject, body });
    await newEmail.save();
    console.log(`Új levél érkezett: ${to}`);
    res.status(200).send("OK");
});

// Inbox lekérése
app.get('/api/inbox', async (req, res) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).send("Nincs belépve");
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const emails = await Email.find({ to: decoded.email }).sort({ receivedAt: -1 });
        res.json(emails);
    } catch (e) { 
        res.status(403).send("Lejárt munkamenet"); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Szerver fut a ${PORT} porton!`));
