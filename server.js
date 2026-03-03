const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// --- ADATBÁZIS MODELLEK ---

// Felhasználó modell
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    emailAddress: { type: String, unique: true } // pl. teszt@teoldalad.hu
});

// Email üzenet modell
const EmailSchema = new mongoose.Schema({
    from: String,
    to: String,
    subject: String,
    body: String,
    receivedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Email = mongoose.model('Email', EmailSchema);

// MongoDB csatlakozás
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Sikeres MongoDB csatlakozás!"))
    .catch(err => console.error("Hiba a csatlakozásnál:", err));

// --- MIDDLEWARE (Védelem) ---
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- ÚTVONALAK (ROUTES) ---

// 1. REGISZTRÁCIÓ (Új email fiók létrehozása)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({
            username,
            password: hashedPassword,
            emailAddress: username + process.env.DOMAIN_NAME
        });

        await newUser.save();
        res.status(201).json({ message: "Sikeres regisztráció!", email: newUser.emailAddress });
    } catch (error) {
        res.status(400).json({ error: "Ez a név már foglalt vagy hiba történt." });
    }
});

// 2. BEJELENTKEZÉS
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ username: user.username, email: user.emailAddress }, process.env.JWT_SECRET);
        res.json({ token, email: user.emailAddress });
    } else {
        res.status(401).json({ error: "Hibás adatok!" });
    }
});

// 3. WEBHOOK (Itt fogadja a leveleket pl. Mailguntól vagy ForwardEmail-től)
// Fontos: Ezt a címet kell megadnod a külső szolgáltatónál!
app.post('/api/webhook/incoming', async (req, res) => {
    try {
        // A külső szolgáltatók általában POST body-ban küldik az adatokat
        const { from, to, subject, body } = req.body;

        const newEmail = new Email({
            from: from,
            to: to,
            subject: subject || "(Nincs tárgy)",
            body: body || ""
        });

        await newEmail.save();
        console.log(`Új levél érkezett: ${to}`);
        res.status(200).send("OK");
    } catch (error) {
        console.error("Webhook hiba:", error);
        res.status(500).send("Hiba");
    }
});

// 4. BEJÖVŐ LEVELEK LEKÉRDEZÉSE (Védett útvonal)
app.get('/api/inbox', authenticateToken, async (req, res) => {
    try {
        const myEmails = await Email.find({ to: req.user.email }).sort({ receivedAt: -1 });
        res.json(myEmails);
    } catch (error) {
        res.status(500).json({ error: "Hiba a levelek lekérésekor." });
    }
});

// Szerver indítása
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Szerver fut a ${PORT} porton.`);
});
