const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY || 're_K1DJHynN_JKJ73ULXEa4DEjZA7HjnV3MD');

app.use(express.json());
app.use(cors());

// Statikus fájlok kiszolgálása a 'public' mappából
app.use(express.static(path.join(__dirname, 'public')));

// ADATBÁZIS MODELLEK
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
    .then(() => console.log(">>> MongoDB: Kapcsolat él!"))
    .catch(err => console.error("!!! MongoDB Hiba:", err));

// --- API ÚTVONALAK ---

// Regisztráció (@ javítva)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const domain = process.env.DOMAIN_NAME || 'szabymail.run.place';
        
        const newUser = new User({
            username,
            password: hashedPassword,
            emailAddress: `${username}@${domain}`
        });

        await newUser.save();
        res.status(201).json({ message: "Sikeres regisztráció!" });
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: "Ez a név vagy email már foglalt!" });
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

// Küldés (Resend)
app.post('/api/send', async (req, res) => {
    const token = req.headers['authorization'];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { to, subject, body } = req.body;
        
        await resend.emails.send({
            from: `SzabyMail <mail@${process.env.DOMAIN_NAME}>`,
            to: [to],
            subject: subject,
            html: `<p><strong>Feladó: ${decoded.email}</strong></p><p>${body}</p>`
        });
        res.json({ message: "Levél elküldve!" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inbox (Levelek lekérése)
app.get('/api/inbox', async (req, res) => {
    const token = req.headers['authorization'];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const emails = await Email.find({ to: decoded.email }).sort('-receivedAt');
        res.json(emails);
    } catch (e) { res.status(401).send("Hiba"); }
});

// Webhook (Levelek fogadása a Resend-től)
app.post('/api/webhook/incoming', async (req, res) => {
    try {
        const { from, to, subject, text, html } = req.body;
        const newEmail = new Email({ 
            from, 
            to, 
            subject: subject || "(Nincs tárgy)", 
            body: text || html || "" 
        });
        await newEmail.save();
        res.sendStatus(200);
    } catch (e) { res.sendStatus(500); }
});

// Catch-all: bármi másra az index.html-t adjuk
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Szerver fut a ${PORT} porton!`));
