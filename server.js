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

// --- FONTOS: Statikus fájlok kiszolgálása ---
app.use(express.static(path.join(__dirname, 'public')));

// --- ADATBÁZIS MODELLEK ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    emailAddress: { type: String, unique: true }
}));

const Email = mongoose.model('Email', new mongoose.Schema({
    from: String,
    to: String,
    subject: String,
    body: String,
    receivedAt: { type: Date, default: Date.now }
}));

mongoose.connect(process.env.MONGO_URI).then(() => console.log("MongoDB Kapcsolat OK"));

// --- API ÚTVONALAK ---

// Regisztráció (Javított kukac kezelés)
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
    } catch (e) { res.status(400).json({ error: "Hiba: A név már foglalt." }); }
});

// Belépés
app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        const token = jwt.sign({ email: user.emailAddress }, process.env.JWT_SECRET);
        res.json({ token, email: user.emailAddress });
    } else { res.status(401).json({ error: "Hibás adatok!" }); }
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

// Fogadás (Webhook)
app.post('/api/webhook/incoming', async (req, res) => {
    const { from, to, subject, text } = req.body;
    const newEmail = new Email({ from, to, subject, body: text });
    await newEmail.save();
    res.sendStatus(200);
});

// Inbox lekérés
app.get('/api/inbox', async (req, res) => {
    const token = req.headers['authorization'];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const emails = await Email.find({ to: decoded.email }).sort('-receivedAt');
        res.json(emails);
    } catch (e) { res.status(401).send("Hiba"); }
});

// Minden egyéb kérésre az index.html-t adjuk (Javítja a fehér oldalt)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(process.env.PORT || 3000, () => console.log("Szerver elindult"));
