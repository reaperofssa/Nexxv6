const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('views'));

// File upload setup
const upload = multer({ dest: 'public/uploads/' });

// File paths
const USERS_FILE = './users.json';
const POSTS_FILE = './posts.json';

// Helper function to load JSON files
function loadFile(filePath) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]');
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Load users and posts
let users = loadFile(USERS_FILE);
let posts = loadFile(POSTS_FILE);

// Routes
app.get('/', (req, res) => {
    const username = req.query.username || '';
    if (username && users.find((user) => user.username === username)) {
        res.redirect('/foryou');
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/login.html'));
});

app.get('/foryou', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/foryou.html'));
});

app.get('/post', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/post.html'));
});

app.get('/me', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/me.html'));
});

// Authentication API
app.post('/api/auth', (req, res) => {
    const { username, password } = req.body;
    let user = users.find((u) => u.username === username);

    if (user) {
        if (user.password === password) {
            res.json({ success: true, user });
        } else {
            res.json({ success: false, message: 'Incorrect password.' });
        }
    } else {
        const newUser = { username, password, followers: 0, following: [], profilePicture: '' };
        users.push(newUser);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user: newUser });
    }
});

// Create a post
app.post('/api/post', upload.single('file'), (req, res) => {
    const { username, caption } = req.body;
    const file = req.file ? `/uploads/${req.file.filename}` : '';
    const newPost = {
        id: posts.length + 1,
        username,
        caption,
        file,
        timestamp: Date.now(),
        likedBy: [],
        shares: 0,
    };
    posts.push(newPost);
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
    res.json({ success: true, post: newPost });
});

// Fetch posts
app.get('/api/posts', (req, res) => {
    const username = req.query.username || '';
    const formattedPosts = posts.map((post) => ({
        id: post.id,
        username: post.username,
        caption: post.caption,
        file: post.file,
        timestamp: post.timestamp,
        likes: post.likedBy.length,
        likedBy: post.likedBy,
        liked: username ? post.likedBy.includes(username) : false,
        shares: post.shares,
    }));
    res.json(formattedPosts.sort((a, b) => b.timestamp - a.timestamp));
});

// Like/unlike a post
app.post('/api/like', (req, res) => {
    const { postId, username } = req.body;
    const post = posts.find((p) => p.id === postId);

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    if (post) {
        if (post.likedBy.includes(username)) {
            post.likedBy = post.likedBy.filter((user) => user !== username);
        } else {
            post.likedBy.push(username);
        }
        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, liked: post.likedBy.includes(username), likes: post.likedBy.length });
    } else {
        res.status(404).json({ success: false, message: 'Post not found.' });
    }
});

// Share a post
app.post('/api/share', (req, res) => {
    const { postId } = req.body;
    const post = posts.find((p) => p.id === postId);

    if (post) {
        post.shares = (post.shares || 0) + 1;
        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, shares: post.shares });
    } else {
        res.status(404).json({ success: false, message: 'Post not found.' });
    }
});

// Follow/unfollow a user
app.post('/api/follow', (req, res) => {
    const { follower, followee } = req.body;
    const followerUser = users.find((u) => u.username === follower);
    const followeeUser = users.find((u) => u.username === followee);

    if (followerUser && followeeUser) {
        if (followerUser.following.includes(followee)) {
            followerUser.following = followerUser.following.filter((f) => f !== followee);
            followeeUser.followers = Math.max(0, followeeUser.followers - 1);
        } else {
            followerUser.following.push(followee);
            followeeUser.followers += 1;
        }
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, followerCount: followeeUser.followers });
    } else {
        res.status(404).json({ success: false, message: 'User not found.' });
    }
});

// Get user profile
app.get('/api/user/:username', (req, res) => {
    const username = req.params.username;
    const user = users.find((u) => u.username === username);
    const userPosts = posts.filter((p) => p.username === username);

    if (user) {
        res.json({ success: true, user, posts: userPosts });
    } else {
        res.status(404).json({ success: false, message: 'User not found.' });
    }
});

// Upload profile picture
app.post('/api/profile-picture', upload.single('file'), (req, res) => {
    const username = req.body.username;
    const user = users.find((u) => u.username === username);

    if (user) {
        user.profilePicture = `/uploads/${req.file.filename}`;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, profilePicture: user.profilePicture });
    } else {
        res.status(404).json({ success: false, message: 'User not found.' });
    }
});

// Start server
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
