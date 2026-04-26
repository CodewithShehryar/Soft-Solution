const express = require('express');
const cors = require('cors');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const path = require('path');
const { createClerkClient } = require('@clerk/clerk-sdk-node');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const app = express();

const server = http.createServer(app);
key = (path.join(__dirname, 'views', 'key.pem'));
cert = (path.join(__dirname, 'views', 'cert.pem'));
// Read your SSL certificates
const sslOptions = {
    key: fs.readFileSync(key),
    cert: fs.readFileSync(cert)
};

// Create HTTPS server
//const server = https.createServer(sslOptions, app);

const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100MB
});

// --- MONGODB CONNECTION ---
const mongoURI = process.env.database_api; //"mongodb+srv://Matrix:Matrix@cluster0.bcbok8s.mongodb.net/SoftSolution?retryWrites=true&w=majority";
mongoose.connect(mongoURI)
    .then(() => console.log("✅ Connected to MongoDB: SoftSolution"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- CHAT SCHEMA ---
const chatSchema = new mongoose.Schema({
    userId: String,
    userName: String,
    userImage: String,
    message: String,
    fileName: String,
    fileData: String,
    type: { type: String, enum: ['text', 'file'] },
    sender: { type: String, enum: ['user', 'admin'] },
    timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model('UserChat', chatSchema);

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- REAL-TIME CHAT ENGINE ---
io.on('connection', (socket) => {

    socket.on('join-chat', async (userId) => {
        socket.join(userId);
        try {
            const history = await Chat.find({ userId }).sort({ timestamp: 1 });
            socket.emit('chat-history', history);
        } catch (err) {
            console.error("Error fetching history:", err);
        }
    });

    socket.on('send-to-admin', async (data) => {
        try {
            const newMessage = new Chat({
                ...data,
                sender: 'user',
                userImage: data.userImage // Explicitly ensure this is saved
            });
            await newMessage.save();
            io.emit('new-user-message', data);
            io.to(data.userId).emit('receive-reply', data);
        } catch (err) {
            console.error("Error saving message:", err);
        }
    });

    // Locate this in your server.js
    socket.on('admin-reply', async (data) => {
        try {
            const newReply = new Chat({
                userId: data.userId,
                userName: data.userName,   // Added to keep records complete
                userImage: data.userImage, // Added to keep records complete
                message: data.message,
                fileName: data.fileName,   // CRITICAL: Save the filename
                fileData: data.fileData,   // CRITICAL: Save the base64 data
                type: data.type || 'text', // CRITICAL: Save the type (text/file)
                sender: 'admin'
            });
            await newReply.save();

            // Broadcast to the user's room
            io.to(data.userId).emit('receive-reply', data);
        } catch (err) {
            console.error("Error saving admin reply:", err);
        }
    });
}); // FIXED: Added missing closing brace for io.on('connection')

// --- API ENDPOINTS ---
app.get('/api/admin/active-chats', async (req, res) => {
    try {
        const uniqueUsers = await Chat.aggregate([
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: "$userId",
                    userName: { $first: "$userName" },
                    userImage: { $first: "$userImage" },
                    lastMessage: { $first: "$message" },
                    timestamp: { $first: "$timestamp" }
                }
            },
            { $sort: { timestamp: -1 } }
        ]);
        res.json(uniqueUsers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const response = await clerkClient.users.getUserList({ limit: 100 });
        const users = (response.data || response).map(user => ({
            id: user.id,
            // Only use firstName here. Added 'User' as a fallback.
            name: user.firstName || 'User', 
            email: user.emailAddresses[0]?.emailAddress,
            image: user.imageUrl,
            phone: user.unsafeMetadata?.phone || 'N/A',
            company: user.unsafeMetadata?.company || 'N/A'
        }));
        res.json(users);
    } catch (err) { 
        res.status(500).json({ error: "Fetch error" }); 
    }
});

// --- ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/Chat', (req, res) => res.sendFile(path.join(__dirname, 'views', 'chat.html')));
app.get('/Profile', (req, res) => res.sendFile(path.join(__dirname, 'views', 'profile.html')));
app.get('/admin-chat-detail', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin-chat-detail.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin-panel.html')));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === "12345") {
        res.json({ status: 'success' });
    } else {
        res.status(401).json({ status: 'error' });
    }
});

server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));