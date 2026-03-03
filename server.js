const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
// A beépített fetch-et használjuk (Node.js 18+ esetén)
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- MAILISK ADATOK ---
const MAILISK_API_KEY = 'sk_KAnVXCrADIF1qYWJsP7Ao823pWsO99dQbVbD9ROP2RQ';
const MAILISK_NAMESPACE = 'e34tx612tpip'; // A megadott azonosítód

mongoose.connect(process.env.MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({
    username: String, password: String, emailAddress: String
}));

// REGISZTRÁCIÓ (Most már a mailisk-es címeddel)
app.post('/api/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = new User({
            username: req.body.username,
            password: hashedPassword,
            // Mindenki kap egy al-címet a te mailisk tartományodon belül
            emailAddress: `${req.body.username}@${MAILISK_NAMESPACE}.mailisk.net`
        });
        await user.save();
        res.json({ message: "Sikeres regisztráció!" });
    } catch (e) { res.status(400).send("Hiba"); }
});

// BELÉPÉS
app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        const token = jwt.sign({ email: user.emailAddress }, process.env.JWT_SECRET || 'titok');
        res.json({ token, email: user.emailAddress });
    } else res.status(401).send("Hiba");
});

// INBOX LEKÉRÉSE (Most a Mailisk-től kérdezzük le!)
app.get('/api/inbox', async (req, res) => {
    const token = req.headers['authorization'];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'titok');
        const targetEmail = decoded.email;

        // Lekérjük a leveleket a Mailisk API-tól
        const response = await fetch(`https://api.mailisk.com/api/emails?namespace=${MAILISK_NAMESPACE}`, {
            headers: { 'X-Api-Key': MAILISK_API_KEY }
        });
        const data = await response.json();

        // Csak azokat a leveleket mutatjuk, amiknek a címzettje a belépett felhasználó
        const myEmails = data.emails.filter(email => 
            email.to.some(recipient => recipient.address === targetEmail)
        );

        // Átalakítjuk a formátumot, hogy a frontend megértse
        const formattedEmails = myEmails.map(e => ({
            from: e.from[0].address,
            subject: e.subject,
            body: e.text || e.html,
            receivedAt: e.date
        }));

        res.json(formattedEmails);
    } catch (e) { 
        console.error(e);
        res.status(403).send("Hiba"); 
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(process.env.PORT || 3000, () => console.log("Mailisk szerver fut!"));
