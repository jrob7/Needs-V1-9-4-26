const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024 } });
const app = express();
const httpServer = http.createServer(app);
const port = process.env.PORT || 3000;
// 🔥 REQUIRED FOR IMAGE HYDRATION
const NODE_API = process.env.NODE_API || "http://localhost:3000";
const fundraisersCol = () => client.db('Need').collection('Fundraisers');
const path = require('path');





// ── JWT ───────────────────────────────────────────────────────────────────────
// Move JWT_SECRET to an environment variable before going to production:
//   export JWT_SECRET="a-long-random-string"
const JWT_SECRET = process.env.JWT_SECRET || 'needs-dev-secret-CHANGE-BEFORE-PRODUCTION';

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.userId = payload.userId; // available to every protected route
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.)/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed'));
      }
    },
    credentials: true,
  },
});

// Verify JWT on socket handshake
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  socket.on('join_conversation', (conversationId) => {
    socket.join(conversationId);
  });
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(conversationId);
  });
  socket.on('typing', (conversationId) => {
    socket.to(conversationId).emit('user_typing');
  });
  socket.on('stop_typing', (conversationId) => {
    socket.to(conversationId).emit('user_stop_typing');
  });
});

const atlasURI = 'mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority';

// ── Nominatim geocoder (free, no API key, 1 req/s limit) ─────────────────────
async function geocodeAddress(addressText) {
  if (!addressText || !addressText.trim()) return null;
  const q = encodeURIComponent(addressText.trim());
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NeedsApp/1.0 (jrehurst7@gmail.com)' },
      signal: AbortSignal.timeout(6000),
    });
    const results = await res.json();
    if (results.length > 0) {
      return { type: 'Point', coordinates: [parseFloat(results[0].lon), parseFloat(results[0].lat)] };
    }
  } catch {}
  return null;
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow native apps (no origin), any localhost port, and LAN IP for dev devices
    if (!origin || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.)/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for large base64 data
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploadImage', bodyParser.text({ type: 'text/plain', limit: '50mb' })); // For image uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use("/uploads", express.static("uploads"));



// ✅ Middleware to log every request
app.use((req, res, next) => {
    console.log(`🔥 Incoming Request: ${req.method} ${req.originalUrl}`);
    console.log(`📡 Headers:`, req.headers);
    console.log(`📦 Body:`, req.body);
    next();
});

// ✅ Middleware to log every response
app.use((req, res, next) => {
    const oldSend = res.send;
    res.send = function (data) {
        console.log(`✅ Response Status: ${res.statusCode}`);
        console.log(`📨 Response Data:`, data);
        oldSend.apply(res, arguments);
    };
    next();
});

const client = new MongoClient(atlasURI);

client.connect()
    .then(() => {
        console.log('Connected to MongoDB Atlas');
        const database = client.db('Need');
        const bucket = new GridFSBucket(database);
        const imageBucket = new GridFSBucket(database, { bucketName: 'images' });
        const needRequestsCollection = database.collection('NeedRequests'); // ✅ Define collection

        /**
         * Utility function to retrieve Base64-encoded image data
         */
        const getImageData = async (files_id) => {
            return new Promise((resolve, reject) => {
                const downloadStream = bucket.openDownloadStream(new ObjectId(files_id));
                let imageData = '';
                downloadStream.on('data', (chunk) => {
                    imageData += chunk.toString('base64');
                });
                downloadStream.on('end', () => {
                    resolve(imageData);
                });
                downloadStream.on('error', (error) => {
                    console.error(`Error fetching image data for file ID ${files_id}`, error);
                    reject(error);
                });
            });
        };


        /**
 * ✅ Route to ask Llama AI for missing information
 */
        app.post('/askLlama', async (req, res) => {
          const { query } = req.body;
          
          if (!query) {
              return res.status(400).json({ error: "Query is required" });
          }
      
          try {
              console.log(`📡 Sending Query to Flask: ${query}`);
      
              const aiResponse = await fetch('http://127.0.0.1:5001/ask', { 
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query }),
              });
      
              if (!aiResponse.ok) {
                  throw new Error(`Flask responded with status: ${aiResponse.status} ${aiResponse.statusText}`);
              }
      
              const data = await aiResponse.json();
      
              console.log("🟢 Flask Response:", data);
              res.status(200).json(data);
      
          } catch (error) {
              console.error('❌ Error querying Llama:', error);
              res.status(500).json({ error: "Failed to process AI request" });
          }
      });
      
  
        /**
         * Route to create a new user
         */
        app.post('/createUser', async (req, res) => {
            console.log('Received request for /createUser:', req.body);

            try {
                const { firstName, lastName, organization, email, password, phoneNumber, streetAddress, zipcode, accountType, businessType, profilePicture } = req.body;
                const isBusiness = accountType === 'business';

                // Validate input — business accounts only need email/password;
                // the rest of their info lives on the business listing itself.
                if (!email || !password) {
                    console.error('Validation failed: Missing required fields');
                    return res.status(400).json({ error: 'Email and password are required' });
                }
                if (!isBusiness && (!firstName || !lastName || !phoneNumber || !streetAddress || !zipcode)) {
                    console.error('Validation failed: Missing required fields');
                    return res.status(400).json({ error: 'All fields are required' });
                }

                const hashedPassword = await bcrypt.hash(password, 12);
                const newUser = {
                    firstName: firstName || null,
                    lastName: lastName || null,
                    organization: organization || null,
                    email,
                    password: hashedPassword,
                    phoneNumber: phoneNumber || null,
                    streetAddress: streetAddress || null,
                    zipcode: zipcode || null,
                    accountType: isBusiness ? 'business' : 'individual',
                    businessType: isBusiness ? (businessType || null) : null,
                    profilePicture: profilePicture || null,
                    cashCredits: 0,
                    helpingCredits: 0,
                    TrustScore: 0,
                    reliability: 0,
                    responsiveness: 0,
                    recommended: 0,
                    experiences: 0,
                };
                console.log('Attempting to insert new user into database...');
                const collection = database.collection('Users');
                const result = await collection.insertOne(newUser);

                const token = jwt.sign(
                  { userId: result.insertedId.toString() },
                  JWT_SECRET,
                  { expiresIn: '30d' }
                );

                console.log('User created successfully with ID:', result.insertedId);
                const { password: _pw, ...safeUser } = newUser;
                res.status(201).json({ ...safeUser, _id: result.insertedId, token });
            } catch (error) {
                console.error('Error creating user:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });




  /**
  * Route to validate user login
  */
   /**
 * POST /login
 * Body: { email, password }
 */
// POST /login  (no bcrypt version)
app.post('/login', async (req, res) => {
    try {
      let { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
  
      // Normalize inputs
      const normEmail = String(email).trim().toLowerCase();
      const normPw    = String(password).normalize('NFKC').trim();
  
      // Use your selected DB (e.g., const database = client.db('Need'))
      const users = database.collection('Users');
  
      // Find by exact lowercased email first, then fallback to case-insensitive exact match
      let user = await users.findOne({ email: normEmail });
      if (!user) {
        user = await users.findOne({
          email: {
            $regex: `^${normEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            $options: 'i',
          },
        });
      }
  
      if (!user) {
        return res.status(401).json({ error: 'Invalid email' });
      }
  
      // Support both bcrypt hashes (new accounts) and legacy plain-text passwords
      const dbPw = user.password ?? user.Password;
      const isBcrypt = typeof dbPw === 'string' && dbPw.startsWith('$2');
      const ok = isBcrypt
        ? await bcrypt.compare(normPw, dbPw)
        : dbPw != null && normPw === String(dbPw);

      if (!ok) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      const token = jwt.sign(
        { userId: user._id.toString() },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.status(200).json({
        message: 'Login successful',
        token,
        userId: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        accountType: user.accountType || 'individual',
        businessType: user.businessType || null,
      });
    } catch (error) {
      console.error('Error during login:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });





        app.get('/getUserDetails', async (req, res) => {
            console.log('Request received with userId:', req.query.userId);
            const { userId } = req.query;
          
            if (!userId) {
              return res.status(400).json({ error: 'Missing userId in query parameters' });
            }
          
            if (!ObjectId.isValid(userId)) {
              return res.status(400).json({ error: 'Invalid userId format' });
            }
          
            try {
              const UsersCollection = database.collection('Users'); // Access the 'Users' collection
              const user = await UsersCollection.findOne({ _id: new ObjectId(userId) });
          
              if (!user) {
                return res.status(404).json({ error: 'User not found' });
              }
          
              // Remove sensitive fields like password
              delete user.password;

              // Business accounts have no firstName/lastName — resolve their
              // listing's name so callers don't have to special-case this.
              user.displayName = await resolveDisplayName(user);

              console.log('User details retrieved:', user);

              // Respond with all user details dynamically
              res.json(user);
            } catch (err) {
              console.error('Error retrieving user details:', err);
              res.status(500).json({ error: 'Internal Server Error' });
            }
          });
          



     //     ✅ Route to create a structured NeedRequest (Uses Llama AI for validation) Also modified for chatgpt
 app.post('/createNeedRequest', async (req, res) => {
  try {
    let { searchText, urgency, bidprice, userId, mediaType, mediaUri, fileName, location, threadId, initialMatchNames } = req.body;
    const rawContext = req.body.context || searchText || '';

    // Strip markdown bold markers the AI sometimes returns (**text**)
    const stripMd = (s) => (s || '').replace(/\*\*/g, '').trim();

    // Detect AI template placeholders — treat them as missing values
    const isTemplate = (s) => !s || /what is the user requesting|when do they want|how much|N\/A/i.test(s);

    searchText = isTemplate(searchText) ? null : stripMd(searchText);
    urgency    = isTemplate(urgency)    ? null : stripMd(urgency);

    // Normalise bidprice: reject "N/A" strings, parse numeric value
    const rawBid = String(bidprice || '').replace(/[^0-9.]/g, '');
    bidprice = rawBid ? parseFloat(rawBid) : 0;

    if (!searchText || !urgency) {
      // Fall back to the raw user text rather than calling the Llama fallback,
      // which was the source of the template text in the first place.
      searchText = searchText || stripMd(rawContext) || 'General Inquiry';
      urgency    = urgency    || 'Anytime';
    }

    // Add media info
    const media = (mediaType && mediaUri)
      ? { type: mediaType, uri: mediaUri, fileName }
      : null;

    // Handle location — use GPS coordinates sent from client
    let geoLocation = null;
    if (location && location.type === "Point" && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      geoLocation = {
        type: "Point",
        coordinates: location.coordinates.map(Number)
      };
    }

    const newNeedRequest = {
      searchText,
      urgency,
      bidprice,
      needType: req.body.needType || 'item',  // ✅ save needType
      mealType: req.body.mealType || null,    // ✅ save mealType
      context: req.body.context || searchText, // ✅ include context
      userId: ObjectId.isValid(userId) ? new ObjectId(userId) : null,
      media,  // ✅ still supports image/video metadata
      threadId: threadId || null,  // ✅ store thread link to ChatGPT conversation
      notifiedCount: 0,                     // ✅ new field to track notifications sent
      date: new Date(),
      location: geoLocation || { type: "Point", coordinates: [] }, // ✅ always present
      initialMatchNames: Array.isArray(initialMatchNames) ? initialMatchNames : [], // ← Tab2 exclusion list
    };

    const result = await needRequestsCollection.insertOne(newNeedRequest);
    console.log('✅ NeedRequest Created Successfully:', newNeedRequest);
    res.status(201).json({ ...newNeedRequest, _id: result.insertedId });

  } catch (error) {
    console.error('❌ Error creating NeedRequest:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}); 
      

     


      // GET /createNeedRequest  -> return NeedRequests with a usable `media` for Tab2
app.get('/createNeedRequest', async (req, res) => {
  try {
    const collection = database.collection('NeedRequests');
    const docs = await collection.find({ archived: { $ne: true } }).sort({ date: -1 }).toArray();

    const toDataUri = (b64) => `data:image/jpeg;base64,${b64}`;

    const hydrated = await Promise.all(
      docs.map(async (n) => {
        // if already has a usable http(s)/data URI, keep it as-is
        // skip file:// paths (iOS simulator local paths) — unusable on web
        if (n?.media?.uri && /^(https?:|data:)/i.test(n.media.uri)) return n;
        if (n?.media?.uri) delete n.media; // clear invalid URI so images[] fallback runs

        let uri = null;
        let type = 'image';
        let fileName = null;

        if (Array.isArray(n.images) && n.images.length > 0) {
          const first = n.images[0];

          // GridFS ObjectId
          if (ObjectId.isValid(first)) {
            try {
              const b64 = await getImageData(first);
              if (b64 && b64.length > 50) uri = toDataUri(b64);
            } catch (e) {
              console.warn('gridfs fetch failed for', first, e?.message);
            }
          }
          // data URI
          else if (typeof first === 'string' && /^data:image\//i.test(first)) {
            uri = first;
          }
          // http(s) URL
          else if (typeof first === 'string' && /^https?:\/\//i.test(first)) {
            uri = first;
          }
          // already-base64-but-no-prefix (rare) – add a JPEG prefix
          else if (typeof first === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(first.trim())) {
            uri = toDataUri(first.trim());
          }
          // local uploaded filename only — bare name like img_12345.jpg, no slashes or colons
          else if (typeof first === 'string' && /\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i.test(first.trim())
                   && !first.includes('/') && !first.includes(':')) {
            const fname = first.trim();
            uri = `${NODE_API}/uploads/${fname}`;
            if (/\.(mp4|mov)$/i.test(fname)) type = 'video';
          }
        }

        return uri ? { ...n, media: { type, uri, fileName } } : n;
      })
    );
// Ensure all essential fields (including context) are serialized correctly
const result = hydrated.map(n => ({
  _id: n._id?.toString(),
  userId: n.userId?.toString?.(),
  searchText: n.searchText || '',
  urgency: n.urgency || '',
  bidprice: n.bidprice || 0,
  needType: (() => {
    if (n.needType && n.needType !== 'item') return n.needType;
    const txt = (n.searchText || n.context || '').toLowerCase();
    if (/taco|food|restaurant|eat|pizza|burger|sushi|lunch|dinner|breakfast|seafood|fish|chicken|beef|pork|shrimp/.test(txt)) return 'food';
    if (/plumb|electric|clean|repair|fix|install|mow|paint|handyman|pipe|leak|lawn|hvac|carpenter|weld/.test(txt)) return 'service';
    return n.needType || 'item';
  })(),
  mealType: n.mealType || null,     // ← ADD THIS (for food broad query)
  context: n.context || '', // ✅ include context for SingleItemView
  media: n.media || null,
  images: n.images || [],
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
  location: n.location || null, // ✅ restore geocoordinates for map markers
  initialMatchNames: n.initialMatchNames || [], // ← Tab2 exclusion list
}));

res.status(200).json(result);

  } catch (error) {
    console.error('Error fetching NeedRequest documents:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /myNeedRequests?userId=X -> the signed-in user's own needs, for the
// Notifications > Activity tab (Active Requests / Completed / Archived).
app.get('/myNeedRequests', requireAuth, async (req, res) => {
  try {
    const userId = req.userId; // from verified token
    if (!userId || !ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    const collection = database.collection('NeedRequests');
    const docs = await collection
      .find({ userId: new ObjectId(userId) })
      .sort({ date: -1 })
      .toArray();

    res.status(200).json(docs.map(n => ({
      _id: n._id?.toString(),
      userId: n.userId?.toString?.(),
      searchText: n.searchText || '',
      urgency: n.urgency || '',
      bidprice: n.bidprice || 0,
      needType: n.needType || 'item',
      context: n.context || '',
      media: n.media || null,
      archived: !!n.archived,
      completedAt: n.completedAt || null,
      date: n.date || null,
    })));
  } catch (error) {
    console.error('Error fetching myNeedRequests:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /needRequests/:id/archive -> mark a need archived (or unarchive with ?archived=false)
app.patch('/needRequests/:id/archive', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid need id' });
    }
    const archived     = req.body?.archived !== false; // default true
    const completedAt  = req.body?.completedAt || null;

    const update = { archived };
    if (completedAt) update.completedAt = completedAt;

    const collection = database.collection('NeedRequests');
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Need not found' });
    }
    res.status(200).json({ _id: id, archived, completedAt });
  } catch (error) {
    console.error('Error archiving need:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


        /**
         * Route to upload image metadata
         */
        app.post('/uploadImageMetadata', async (req, res) => {
            try {
                const { userId, mediaPath } = req.body;

                if (!userId || !mediaPath) {
                    return res.status(400).json({ error: 'User ID and media path are required' });
                }

                const metadata = {
                    userId,
                    mediaPath,
                    date: new Date(),
                };

                const collection = database.collection('LocalImages');
                const result = await collection.insertOne(metadata);

                console.log('Image metadata uploaded successfully with ID:', result.insertedId);
                res.status(201).json({ message: 'Image metadata uploaded successfully', metadata });
            } catch (error) {
                console.error('Error uploading image metadata:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        /**
         * Route to upload video metadata
         */
        app.post('/uploadVideoMetadata', async (req, res) => {
            try {
                const { userId, mediaPath } = req.body;

                if (!userId || !mediaPath) {
                    return res.status(400).json({ error: 'User ID and media path are required' });
                }

                const metadata = {
                    userId,
                    mediaPath,
                    date: new Date(),
                };

                const collection = database.collection('LocalVideos');
                const result = await collection.insertOne(metadata);

                console.log('Video metadata uploaded successfully with ID:', result.insertedId);
                res.status(201).json({ message: 'Video metadata uploaded successfully', metadata });
            } catch (error) {
                console.error('Error uploading video metadata:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        /**
         * Route to fetch user's media metadata
         */
        app.get('/getUserMediaMetadata', async (req, res) => {
            try {
                const { userId } = req.query;

                if (!userId) {
                    return res.status(400).json({ error: 'User ID is required' });
                }

                const imagesCollection = database.collection('LocalImages');
                const videosCollection = database.collection('LocalVideos');

                const images = await imagesCollection.find({ userId }).toArray();
                const videos = await videosCollection.find({ userId }).toArray();

                res.status(200).json({ images, videos });
            } catch (error) {
                console.error('Error fetching user media metadata:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        app.get('/getUserProfile', async (req, res) => {
            const { userId } = req.query;
          
            if (!userId) {
              return res.status(400).json({ error: 'Missing userId' });
            }
          
            if (!ObjectId.isValid(userId)) {
              return res.status(400).json({ error: 'Invalid userId format' });
            }
          
            try {
              // Fetch user details
              const user = await database.collection('Users').findOne({ _id: new ObjectId(userId) });
          
              if (!user) {
                return res.status(404).json({ error: 'User not found' });
              }
          
              // Fetch profile image and intro media metadata
              const [profileImage, introMedia] = await Promise.all([
                database.collection('LocalImages').findOne({ userId }),
                database.collection('LocalVideos').findOne({ userId }),
              ]);
          
              // Respond with user details and media
              res.json({
                name: user.firstName || 'N/A',
                TrustScore: user.TrustScore ?? 0, // Default to 0 if undefined
                profilePicture: profileImage?.mediaPath || null,
                introMedia: introMedia?.mediaPath || null,
              });
          
              console.log('TrustScore is:', user.TrustScore);
            } catch (error) {
              console.error('Error fetching user profile:', error);
          
              if (!res.headersSent) {
                res.status(500).json({ error: 'Internal Server Error' });
              }
            }
          });
          
       
          app.post('/updateUserMedia', async (req, res) => {
            const { userId, type, mediaPath } = req.body;
          
            if (!userId || !type || !mediaPath) {
              return res.status(400).json({ error: 'Missing required fields' });
            }
          
            try {
              // Determine the correct collection based on the media type
              const collection = type === 'profileImage' ? 'LocalImages' : 'LocalVideos';
          
              // Update or insert the document in the correct collection
              await database.collection(collection).updateOne(
                { userId }, // Match by userId
                { $set: { mediaPath, uploadedAt: new Date() } }, // Update mediaPath and timestamp
                { upsert: true } // Create a new document if it doesn't exist
              );
          
              res.json({ success: true });
            } catch (error) {
              console.error('Error updating user media:', error);
              res.status(500).json({ error: 'Internal Server Error' });
            }
          });
          
        
          app.post('/uploadImage', async (req, res) => {
            try {
              const base64 = req.body;
              if (!base64 || typeof base64 !== 'string') {
                return res.status(400).json({ error: 'Invalid base64 input' });
              }
              const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
              const buffer = Buffer.from(cleanBase64, 'base64');
              const filename = `img_${Date.now()}.jpg`;

              await new Promise((resolve, reject) => {
                const uploadStream = imageBucket.openUploadStream(filename, { contentType: 'image/jpeg' });
                uploadStream.on('error', reject);
                uploadStream.on('finish', () => {
                  const url = `${NODE_API}/images/${uploadStream.id}`;
                  console.log('📸 Saved image to GridFS:', uploadStream.id);
                  res.status(201).json({ imageUrl: uploadStream.id.toString(), url });
                  resolve();
                });
                uploadStream.end(buffer);
              });
            } catch (err) {
              console.error('❌ Error in /uploadImage:', err);
              res.status(500).json({ error: 'Image upload failed' });
            }
          });

          // React Native picks the video and uploads it as multipart/form-data
          // (no base64) — multer reads it into memory, then it's streamed into
          // GridFS so it can be played back from any device via /videos/:id.
          app.post('/uploadVideo', videoUpload.single('video'), async (req, res) => {
            try {
              if (!req.file) {
                return res.status(400).json({ error: 'No video file received' });
              }

              const filename = `vid_${Date.now()}.mp4`;
              const uploadStream = bucket.openUploadStream(filename, {
                contentType: req.file.mimetype || 'video/mp4',
              });

              Readable.from(req.file.buffer).pipe(uploadStream)
                .on('error', (err) => {
                  console.error('❌ GridFS video upload error:', err);
                  res.status(500).json({ error: 'Video upload failed' });
                })
                .on('finish', () => {
                  console.log('🎥 Saved video to GridFS:', uploadStream.id);
                  res.status(201).json({
                    videoId: uploadStream.id.toString(),
                    url: `${NODE_API}/videos/${uploadStream.id}`,
                  });
                });
            } catch (err) {
              console.error("❌ Error in /uploadVideo:", err);
              res.status(500).json({ error: "Video upload failed" });
            }
          });



        // GET /searchResults?searchText=...&urgency=...&bidprice=...&max=50&skip=0
        app.get('/searchResults', async (req, res) => {
          try {
            const { searchText = '', urgency, bidprice, max = 50, skip = 0 } = req.query;
        
            const query = {};
        
            if (searchText) {
              const text = new RegExp(searchText.trim(), 'i');
              query.$or = [
                { title: { $regex: text } },
                { description: { $regex: text } },
                { searchText: { $regex: text } }, // supports legacy NeedRequests
              ];
            }
        
            if (urgency) query.urgency = String(urgency).trim();
        
            if (bidprice) {
              const n = parseInt(String(bidprice).trim(), 10);
              if (!Number.isNaN(n)) query.bidprice = { $lte: n };
            }
        
            console.log('🔍 Searching MongoDB with:', query);
        
            const collection = database.collection('UploadedItems');
        
            const docs = await collection
              .find(query)
              .sort({ date: -1 })
              .skip(Number(skip) || 0)
              .limit(Math.min(Number(max) || 50, 100))
              .toArray();
        
            console.log(`✅ Found ${docs.length} Results`);
        
            const results = await Promise.all(
              docs.map(async (need) => {
                let media = null;
        
                if (Array.isArray(need.images) && need.images.length > 0) {
                  const first = need.images[0];
        
                  if (typeof first === 'string' && /^https?:\/\//i.test(first)) {
                    media = { type: 'image', uri: first };
                  } else {
                    try {
                      const b64 = await getImageData(first);
                      if (b64 && b64.length > 50) {
                        media = { type: 'image', uri: `data:image/png;base64,${b64}` };
                      }
                    } catch (err) {
                      console.warn('⚠️ image hydrate failed for', first, err?.message);
                    }
                  }
                }
        
                return {
                  ...need,
                  media,
                  userId: need.userId ? need.userId.toString() : null,
                };
              })
            );
        
            return res.status(200).json(results);
          } catch (error) {
            console.error('❌ Error in /searchResults:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
          }
        });


        // --- Transactions collection ---
const transactionsCol = client.db("Need").collection("NeedTransactions");

// Helper to stringify ObjectIds before sending JSON
const asClient = (doc) => ({
  ...doc,
  _id: doc._id?.toString?.(),
  fromUserId: doc.fromUserId?.toString?.(),
  toUserId: doc.toUserId?.toString?.(),
  needId: doc.needId ? doc.needId.toString?.() : null,
});

// --- CREATE a transaction (frontend provides names directly) ---
app.post('/transactions', requireAuth, async (req, res) => {
  try {
    const fromUserId = req.userId;
    let {
      toUserId,
      amount,
      needId,
      needTitle,
      fromName,
      toName,
    } = req.body || {};

    // --- Validate IDs ---
    if (!toUserId) {
      return res.status(400).json({ error: 'toUserId is required' });
    }
    if (!ObjectId.isValid(toUserId)) {
      return res.status(400).json({ error: 'Invalid toUserId' });
    }

    // --- Normalize title ---
    needTitle = (needTitle || '').toString().trim();
    if (!needTitle) needTitle = 'Untitled';

    // --- Create document (use names directly from frontend) ---
    const doc = {
      fromUserId: new ObjectId(fromUserId),
      toUserId: new ObjectId(toUserId),
      amount: Number(amount) || 0,
      needId: needId && ObjectId.isValid(needId) ? new ObjectId(needId) : null,
      needTitle,
      fromName: fromName || null,  // ✅ trusted from frontend
      toName: toName || null,      // ✅ trusted from frontend
      status: 'completed',
      createdAt: new Date(),
    };

    // --- Save transaction ---
    const out = await transactionsCol.insertOne(doc);

    // --- Respond with client-safe version ---
    return res.status(201).json(asClient({ _id: out.insertedId, ...doc }));

  } catch (e) {
    console.error('❌ POST /transactions failed', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// LIST transactions for a user (as sender or receiver)
app.get('/transactions', requireAuth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const userId = req.userId;
    const q = userId && ObjectId.isValid(userId)
      ? { $or: [{ fromUserId: new ObjectId(userId) }, { toUserId: new ObjectId(userId) }] }
      : {};

    const docs = await transactionsCol
      .find(q)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .toArray();

    res.json(docs.map(asClient));
  } catch (e) {
    console.error('GET /transactions failed', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



/**
 * POST /createFundraiser
 * Body: { title, description, targetAmount, mediaType?, mediaUri?, fileName?, createdBy? }
 * - createdBy should be the logged-in user's id (string). We will coerce to ObjectId if valid.
 */
app.post('/createFundraiser', requireAuth, async (req, res) => {
  try {
    let { title, description, targetAmount, mediaType, mediaUri, fileName, location } = req.body || {};

    title = (title || '').toString().trim();
    description = (description || '').toString().trim();
    const target = Number.isFinite(Number(targetAmount)) ? Number(targetAmount) : 0;

    const createdById = ObjectId.isValid(req.userId) ? new ObjectId(req.userId) : null;

    // Handle location (always include)
    let geoLocation = null;
    if (location && location.type === "Point" && Array.isArray(location.coordinates)) {
      geoLocation = {
        type: "Point",
        coordinates: location.coordinates.map(Number)
      };
    }

    const doc = {
      title: title || 'Fundraiser',
      description,
      targetAmount: target,
      createdBy: createdById,
      media: (mediaType || mediaUri || fileName)
        ? { type: mediaType || null, uri: mediaUri || null, fileName: fileName || null }
        : null,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      location: geoLocation || { type: "Point", coordinates: [] } // ✅ always included
    };

    const out = await fundraisersCol().insertOne(doc);

    const toClient = {
      _id: out.insertedId.toString(),
      ...doc,
      createdBy: createdById ? createdById.toString() : null,
    };

    res.status(201).json(toClient);
  } catch (e) {
    console.error('POST /createFundraiser failed', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- Fundraisers list ---
app.get('/fundraisers', async (req, res) => {
  try {
    const col = database.collection('Fundraisers');

    // Optional filters (by creator, status) via query string
    const q = {};
    if (req.query.createdBy && ObjectId.isValid(req.query.createdBy)) {
      q.createdBy = new ObjectId(req.query.createdBy);
    }
    if (req.query.status) {
      q.status = req.query.status;
    }

    const docs = await col.find(q).sort({ createdAt: -1 }).toArray();

    // Normalize ObjectIds and include location only if present
    const out = docs.map(d => ({
      _id: d._id?.toString(),
      title: d.title,
      description: d.description,
      targetAmount: d.targetAmount,
      createdBy: d.createdBy ? d.createdBy.toString() : null,
      media: d.media || null,          // { type, uri, fileName } or null
      status: d.status || 'active',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      ...(d.location ? { location: d.location } : {}), // ✅ only include if exists
    }));

    res.json(out);
  } catch (e) {
    console.error('GET /fundraisers failed', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


/**
 * POST /fundraiserContribution
 * Body: { userId, fundraiserId, amount, note? }
 * - Records a contribution to a fundraiser as a transaction
 */
app.post('/fundraiserContribution', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    let { fundraiserId, amount, note } = req.body || {};

    if (!fundraiserId || !amount) {
      return res.status(400).json({ error: 'fundraiserId and amount are required' });
    }

    if (!ObjectId.isValid(fundraiserId)) {
      return res.status(400).json({ error: 'Invalid fundraiserId' });
    }

    const fundraisersCol = client.db('Need').collection('Fundraisers');
    const transactionsCol = client.db('Need').collection('FundraiserTransactions');

    const fundraiser = await fundraisersCol.findOne({ _id: new ObjectId(fundraiserId) });

    if (!fundraiser) {
      return res.status(404).json({ error: 'Fundraiser not found' });
    }

    const doc = {
      fromUserId: new ObjectId(userId),
      toUserId: fundraiser.createdBy || null,
      needId: new ObjectId(fundraiserId),
      needTitle: fundraiser.title || 'Fundraiser',
      amount: Number(amount),
      note: note?.toString?.().trim() || null,
      type: 'fundraiser',
      status: 'completed',
      createdAt: new Date(),
    };

    const result = await transactionsCol.insertOne(doc);

    res.status(201).json({
      _id: result.insertedId.toString(),
      ...doc,
      fromUserId: doc.fromUserId.toString(),
      toUserId: doc.toUserId?.toString() || null,
      needId: doc.needId.toString(),
    });
  } catch (e) {
    console.error('POST /fundraiserContribution failed', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/fundraiser-transparency', async (req, res) => {
  const { fundraiserId, userId } = req.query;

  if (!fundraiserId || !userId) {
    return res.status(400).json({ error: 'Missing fundraiserId or userId' });
  }

  try {
    const col = client.db('Need').collection('FundraiserTransactions');

    const query = {
      needId: new ObjectId(fundraiserId),
      type: 'fundraiser',
      status: 'completed',
    };

    console.log("📡 Transparency query:", query);

    const allTx = await col.find(query).toArray();
    console.log("📦 Matching transactions:", allTx);

    let userDonation = 0;
    let otherDonations = 0;
    let disbursed = 0;
    let recipientId = null;

    for (const tx of allTx) {
      const amount = Number(tx.amount || 0);

      if (tx.fromUserId?.toString() === userId) {
        userDonation += amount;
      } else {
        otherDonations += amount;
      }

      if ((tx.status || '').toLowerCase() === 'disbursed') {
        disbursed += amount;
      }

      if (!recipientId && tx.toUserId) {
        recipientId = tx.toUserId.toString();
      }
    }

    const totalRaised = userDonation + otherDonations;

    res.json({
      userDonation,
      otherDonations,
      totalRaised,
      disbursed,
      recipientId,
    });
  } catch (e) {
    console.error('❌ fundraiser-transparency error:', e);
    res.status(500).json({ error: 'Failed to fetch fundraiser transparency data' });
  }
});

// GET /fundraiserById?fundraiserId=...
app.get('/fundraiserById', async (req, res) => {
  try {
    const { fundraiserId } = req.query;

    if (!fundraiserId || !ObjectId.isValid(fundraiserId)) {
      return res.status(400).json({ error: "Valid fundraiserId is required" });
    }

    const col = client.db('Need').collection('Fundraisers');
    const doc = await col.findOne({ _id: new ObjectId(fundraiserId) });

    if (!doc) {
      return res.status(404).json({ error: "Fundraiser not found" });
    }

    // normalize media like you do for NeedRequests
    let media = null;
    if (doc.media?.uri) {
      media = doc.media;
    } else if (Array.isArray(doc.images) && doc.images.length > 0) {
      const first = doc.images[0];
      if (ObjectId.isValid(first)) {
        try {
          const b64 = await getImageData(first);
          if (b64 && b64.length > 50) {
            media = { type: "image", uri: `data:image/png;base64,${b64}` };
          }
        } catch (e) {
          console.warn("⚠️ fundraiser image hydrate failed", e?.message);
        }
      } else if (typeof first === "string") {
        media = { type: "image", uri: first };
      }
    }

    const out = {
      _id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      targetAmount: doc.targetAmount,
      createdBy: doc.createdBy ? doc.createdBy.toString() : null,
      media,   // ✅ hydrated media
      status: doc.status || "active",
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };

    console.log("🎯 Returning fundraiser with media:", out);
    res.json(out);
  } catch (err) {
    console.error("❌ GET /fundraiserById failed", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
        

// Fetch NeedTransactions and Fundraiser Transactions /////////////////////////

// ✅ GET /fundraiser-transactions
app.get('/fundraiser-transactions', async (req, res) => {
  try {
    const db = client.db('Need');
    const col = db.collection('FundraiserTransactions');

    // optional filter by user or fundraiserId
    const query = { status: 'completed' };
    if (req.query.userId && ObjectId.isValid(req.query.userId)) {
      query.$or = [
        { fromUserId: new ObjectId(req.query.userId) },
        { toUserId: new ObjectId(req.query.userId) },
      ];
    }
    if (req.query.fundraiserId && ObjectId.isValid(req.query.fundraiserId)) {
      query.needId = new ObjectId(req.query.fundraiserId);
    }

    const docs = await col.find(query).sort({ createdAt: -1 }).toArray();

    const out = docs.map((d) => ({
      _id: d._id?.toString(),
      fromUserId: d.fromUserId?.toString() || null,
      toUserId: d.toUserId?.toString() || null,
      fromName: d.fromName || 'Anonymous',
      toName: d.toName || 'Recipient',
      needId: d.needId?.toString() || null,
      needTitle: d.needTitle || '(Untitled Fundraiser)',
      amount: d.amount || 0,
      type: 'fundraiser',
      status: d.status || 'completed',
      createdAt: d.createdAt,
    }));

    console.log(`📦 Returning ${out.length} fundraiser transactions`);
    res.json(out);
  } catch (err) {
    console.error('❌ GET /fundraiser-transactions failed:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// ✅ GET /need-transactions
app.get('/need-transactions', async (req, res) => {
  try {
    const db = client.db('Need');
    const col = db.collection('NeedTransactions');

    // optional filter by user
    const query = { status: 'completed' };
    if (req.query.userId && ObjectId.isValid(req.query.userId)) {
      query.$or = [
        { fromUserId: new ObjectId(req.query.userId) },
        { toUserId: new ObjectId(req.query.userId) },
      ];
    }

    const docs = await col.find(query).sort({ createdAt: -1 }).toArray();

    const out = docs.map((d) => ({
      _id: d._id?.toString(),
      fromUserId: d.fromUserId?.toString() || null,
      toUserId: d.toUserId?.toString() || null,
      fromName: d.fromName || 'Anonymous',
      toName: d.toName || 'Recipient',
      needId: d.needId?.toString() || null,
      needTitle: d.needTitle || '(Untitled Need)',
      amount: d.amount || 0,
      type: 'need',
      status: d.status || 'completed',
      createdAt: d.createdAt,
    }));

    console.log(`📦 Returning ${out.length} need transactions`);
    res.json(out);
  } catch (err) {
    console.error('❌ GET /need-transactions failed:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.post('/createNeedInquiry', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    let { title, description, urgency, bidprice, images } = req.body;

    // Validate inputs
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    if (!urgency || !bidprice) {
      return res.status(400).json({ error: 'Urgency and bidprice are required' });
    }
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'At least one uploaded image is required' });
    }

    // Normalize images: allow GridFS ID, filename, base64 URI, or URL
    const parsedImages = [];
    for (const raw of images) {
      const v = (typeof raw === 'string' ? raw : String(raw)).trim();

      if (/^https?:\/\//i.test(v)) {
        // Full http(s) URL
        parsedImages.push(v);
      }
      else if (ObjectId.isValid(v)) {
        // Legacy GridFS ID
        parsedImages.push(new ObjectId(v));
      }
      else if (/^data:image\/[a-zA-Z]+;base64,/.test(v)) {
        // Base64 encoded data URI
        parsedImages.push(v);
      }
      else if (/^[\w,\s-]+\.(jpg|jpeg|png|gif|webp)$/i.test(v)) {
        // New-style local filename from uploadImage (e.g. img_12345.jpg)
        parsedImages.push(v);
      }
      else {
        return res.status(400).json({ error: `Invalid image reference: ${v}` });
      }
    }

    // Normalize fields
    title = title.trim();
    description = description.trim();
    urgency = urgency.trim();
    const normalizedBidprice = parseInt(String(bidprice).trim(), 10);

    if (Number.isNaN(normalizedBidprice)) {
      return res.status(400).json({ error: 'Bidprice must be a number' });
    }

    // Construct item document
    const newItem = {
      userId: new ObjectId(userId),
      title,
      description,
      urgency,
      bidprice: normalizedBidprice,
      images: parsedImages,
      date: new Date(),
    };

    const collection = database.collection('UploadedItems');
    const result = await collection.insertOne(newItem);

    console.log('✅ Item created:', newItem);

    res.status(201).json({ ...newItem, _id: result.insertedId });

  } catch (error) {
    console.error('❌ Error creating NeedInquiry:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// For fetching all images to view all uploaded items' media
app.get("/media/:id", async (req, res) => {
  try {
    const bucket = new GridFSBucket(database, { bucketName: "fs" });
    const fileId = new ObjectId(req.params.id);

    const stream = bucket.openDownloadStream(fileId);

    stream.on("error", (err) => {
      console.error("❌ media stream error:", err);
      res.status(404).send("File not found");
    });

    res.set("Content-Type", "image/jpeg");
    stream.pipe(res);
  } catch (err) {
    console.error("❌ /media/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Streams a video uploaded via /uploadVideo back out of GridFS — supports
// HTTP Range requests so expo-av's <Video> can seek properly.
app.get('/videos/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).send('Invalid video id');
    const fileId = new ObjectId(req.params.id);
    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files.length) return res.status(404).send('Video not found');

    const file = files[0];
    const contentType = file.contentType || 'video/mp4';
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : file.length - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
      });
      bucket.openDownloadStream(fileId, { start, end: end + 1 }).pipe(res);
    } else {
      res.set('Content-Type', contentType);
      res.set('Content-Length', file.length);
      bucket.openDownloadStream(fileId).pipe(res);
    }
  } catch (err) {
    console.error('❌ /videos/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serves images stored in GridFS images bucket
app.get('/images/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).send('Invalid image id');
    const fileId = new ObjectId(req.params.id);
    const db = client.db('Need');
    const imgBucket = new GridFSBucket(db, { bucketName: 'images' });
    const files = await imgBucket.find({ _id: fileId }).toArray();
    if (!files.length) return res.status(404).send('Image not found');
    res.set('Content-Type', files[0].contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    imgBucket.openDownloadStream(fileId).pipe(res);
  } catch (err) {
    console.error('❌ /images/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// browse all media retrieval
app.get('/uploadedItemsAll', async (req, res) => {
  try {
    console.log("🔥 /uploadedItemsAll HIT");

    const collection = database.collection('UploadedItems');
    const docs = await collection.find({}).sort({ date: -1 }).toArray();
    console.log(`📦 Found ${docs.length} uploaded items`);

    const results = docs.map(doc => {
      let media = null;

      if (Array.isArray(doc.images) && doc.images.length > 0) {
        const first = doc.images[0];

        // Case 1: NEW IMAGE FORMAT (local filename like "img_123.jpg")
        if (/^img_\d+\.jpg$/i.test(first)) {
          media = {
            type: "image",
            uri: `http://localhost:3000/uploads/${first}`,
          };
        }

        // Case 2: FULL URL (in case future uploads store URLs)
        else if (/^https?:\/\//i.test(first)) {
          media = { type: "image", uri: first };
        }

        // Case 3: OLD GRIDFS ObjectId → leave NULL for now
        else if (/^[0-9a-fA-F]{24}$/.test(first)) {
          console.log("ℹ️ Old GridFS image detected, skipping:", first);
        }
      }

      return {
        ...doc,
        media,
        userId: doc.userId ? doc.userId.toString() : null,
      };
    });

    res.status(200).json(results);
  } catch (err) {
    console.error("❌ /uploadedItemsAll error:", err);
    res.status(500).json({ error: "Failed to load items" });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANTS & SERVICES
// ─────────────────────────────────────────────────────────────────────────────

// A business account's profile picture should be the first photo they chose
// for their listing. Only fills it in if it's not already set, so it never
// clobbers a photo the user picked themselves on the Account tab.
const setProfilePictureIfMissing = async (userId, candidateUrl) => {
  if (!candidateUrl || !userId || !ObjectId.isValid(userId)) return;
  const uid = new ObjectId(userId);
  const user = await database.collection('Users').findOne({ _id: uid }, { projection: { profilePicture: 1 } });
  if (user && !user.profilePicture) {
    await database.collection('Users').updateOne({ _id: uid }, { $set: { profilePicture: candidateUrl } });
  }
};

// Business accounts have no firstName/lastName — their display name lives on
// their Service/Restaurant listing instead. Used anywhere a person's name
// needs to be shown (messages, notifications) so businesses don't show as
// blank/"Someone".
const resolveDisplayName = async (user) => {
  if (!user) return 'Someone';
  if (user.accountType === 'business') {
    const collection = user.businessType === 'restaurant' ? 'Restaurants' : 'Services';
    const listing = await database.collection(collection).findOne({ userId: user._id });
    const name = (listing?.businessName || listing?.name || '').trim();
    if (name) return name;
  }
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Someone';
};

app.post('/createRestaurant', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, userId: req.userId, createdAt: new Date(), updatedAt: new Date() };
    if (ObjectId.isValid(payload.userId)) payload.userId = new ObjectId(payload.userId);
    const geoPoint = await geocodeAddress(payload.address);
    if (geoPoint) payload.geoPoint = geoPoint;
    const result = await database.collection('Restaurants').insertOne(payload);
    console.log('✅ Restaurant created:', result.insertedId);
    const firstPhoto = payload.coverImageUrl || (payload.topDishes || []).find(d => d.imageUrl)?.imageUrl;
    await setProfilePictureIfMissing(payload.userId, firstPhoto);
    res.json({ success: true, _id: result.insertedId.toString(), ...payload });
  } catch (err) {
    console.error('❌ /createRestaurant error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /myRestaurant?userId=X -> the signed-in business user's own restaurant listing
app.get('/myRestaurant', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const doc = await database.collection('Restaurants').findOne({ userId: new ObjectId(userId) });
    if (!doc) return res.status(404).json({ error: 'No restaurant found for this user' });
    res.json({ ...doc, _id: doc._id.toString(), userId: doc.userId.toString() });
  } catch (err) {
    console.error('❌ /myRestaurant error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /restaurants/:id -> update an existing restaurant listing
app.put('/restaurants/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid restaurant id' });
    const { _id, userId, ...updates } = req.body || {};
    updates.updatedAt = new Date();
    if (updates.address) {
      const geoPoint = await geocodeAddress(updates.address);
      if (geoPoint) updates.geoPoint = geoPoint;
    }
    const result = await database.collection('Restaurants').updateOne(
      { _id: new ObjectId(id) }, { $set: updates }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Restaurant not found' });
    const firstPhoto = updates.coverImageUrl || (updates.topDishes || []).find(d => d.imageUrl)?.imageUrl;
    await setProfilePictureIfMissing(userId, firstPhoto);
    res.json({ success: true, _id: id, ...updates });
  } catch (err) {
    console.error('❌ PUT /restaurants/:id error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/restaurants', async (req, res) => {
  try {
    const { search = '', max = 10 } = req.query;
    const query = search ? { $or: [
      { name:    { $regex: search, $options: 'i' } },
      { cuisine: { $regex: search, $options: 'i' } },
      { tagline: { $regex: search, $options: 'i' } },
    ]} : {};
    const docs = await database.collection('Restaurants').find(query).limit(Number(max)).toArray();
    res.json(docs.map(d => ({ ...d, _id: d._id.toString() })));
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// NONPROFITS & COMMUNITY RESOURCES
// ─────────────────────────────────────────────────────────────────────────────

app.post('/createNonprofit', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, userId: req.userId, createdAt: new Date(), updatedAt: new Date() };
    if (ObjectId.isValid(payload.userId)) payload.userId = new ObjectId(payload.userId);
    const geoPoint = await geocodeAddress(payload.address || payload.serviceArea);
    if (geoPoint) payload.geoPoint = geoPoint;
    const result = await database.collection('Nonprofits').insertOne(payload);
    console.log('✅ Nonprofit created:', result.insertedId);
    await setProfilePictureIfMissing(payload.userId, payload.logoUrl);
    res.json({ success: true, _id: result.insertedId.toString(), ...payload });
  } catch (err) {
    console.error('❌ /createNonprofit error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/myNonprofit', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const doc = await database.collection('Nonprofits').findOne({ userId: new ObjectId(userId) });
    if (!doc) return res.status(404).json({ error: 'No nonprofit found for this user' });
    res.json({ ...doc, _id: doc._id.toString(), userId: doc.userId.toString() });
  } catch (err) {
    console.error('❌ /myNonprofit error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/nonprofits/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid nonprofit id' });
    const { _id, userId, ...updates } = req.body || {};
    updates.updatedAt = new Date();
    if (updates.address || updates.serviceArea) {
      const geoPoint = await geocodeAddress(updates.address || updates.serviceArea);
      if (geoPoint) updates.geoPoint = geoPoint;
    }
    const result = await database.collection('Nonprofits').updateOne(
      { _id: new ObjectId(id) }, { $set: updates }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Nonprofit not found' });
    await setProfilePictureIfMissing(userId, updates.logoUrl);
    res.json({ success: true, _id: id, ...updates });
  } catch (err) {
    console.error('❌ PUT /nonprofits/:id error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/createService', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, userId: req.userId, createdAt: new Date(), updatedAt: new Date() };
    if (ObjectId.isValid(payload.userId)) payload.userId = new ObjectId(payload.userId);
    const geoPoint = await geocodeAddress(payload.businessAddress || payload.serviceArea);
    if (geoPoint) payload.geoPoint = geoPoint;
    const result = await database.collection('Services').insertOne(payload);
    console.log('✅ Service created:', result.insertedId);
    await setProfilePictureIfMissing(payload.userId, (payload.portfolioImageUrls || [])[0]);
    res.json({ success: true, _id: result.insertedId.toString(), ...payload });
  } catch (err) {
    console.error('❌ /createService error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /myService?userId=X -> the signed-in business user's own service listing
app.get('/myService', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const doc = await database.collection('Services').findOne({ userId: new ObjectId(userId) });
    if (!doc) return res.status(404).json({ error: 'No service found for this user' });
    res.json({ ...doc, _id: doc._id.toString(), userId: doc.userId.toString() });
  } catch (err) {
    console.error('❌ /myService error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /services/:id -> update an existing service listing
app.put('/services/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid service id' });
    const { _id, userId, ...updates } = req.body || {};
    updates.updatedAt = new Date();
    if (updates.businessAddress || updates.serviceArea) {
      const geoPoint = await geocodeAddress(updates.businessAddress || updates.serviceArea);
      if (geoPoint) updates.geoPoint = geoPoint;
    }
    const result = await database.collection('Services').updateOne(
      { _id: new ObjectId(id) }, { $set: updates }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Service not found' });
    await setProfilePictureIfMissing(userId, (updates.portfolioImageUrls || [])[0]);
    res.json({ success: true, _id: id, ...updates });
  } catch (err) {
    console.error('❌ PUT /services/:id error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/services', async (req, res) => {
  try {
    const { search = '', max = 10 } = req.query;
    const query = search ? { $or: [
      { businessName: { $regex: search, $options: 'i' } },
      { category:    { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ]} : {};
    const docs = await database.collection('Services').find(query).limit(Number(max)).toArray();
    res.json(docs.map(d => ({ ...d, _id: d._id.toString() })));
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/searchUploadedItems', async (req, res) => {
  try {
    const { title = '', maxPrice, urgency } = req.query;
    const query = {};
    if (title) query.$or = [
      { title:       { $regex: title, $options: 'i' } },
      { description: { $regex: title, $options: 'i' } },
    ];
    if (maxPrice) query.bidprice = { $lte: Number(maxPrice) };
    if (urgency)  query.urgency  = { $regex: urgency, $options: 'i' };
    const docs = await database.collection('UploadedItems').find(query).limit(10).toArray();
    res.json(docs.map(d => ({ ...d, _id: d._id.toString(), userId: d.userId?.toString() || null })));
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/getUserActivity', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || !ObjectId.isValid(userId)) return res.status(400).json({ error: 'Valid userId required' });
    const uid = new ObjectId(userId);
    const [requested, filled] = await Promise.all([
      database.collection('NeedRequests').countDocuments({ userId: uid }),
      database.collection('NeedTransactions').countDocuments({ toUserId: uid }),
    ]);
    res.json({ totalNeedsRequested: requested, totalNeedsFilled: filled });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/updateUserProfile', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { about, recommendations, firstName, lastName, profilePicture } = req.body;
    const update = {};
    if (about !== undefined)           update.about = about;
    if (recommendations !== undefined) update.recommendations = recommendations;
    if (firstName !== undefined)       update.firstName = firstName;
    if (lastName !== undefined)        update.lastName = lastName;
    if (profilePicture !== undefined)  update.profilePicture = profilePicture;
    update.updatedAt = new Date();
    await database.collection('Users').updateOne({ _id: new ObjectId(userId) }, { $set: update });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/updateNeedCoins', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { amount } = req.body;
    await database.collection('Users').updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { needCoins: Number(amount) || 0 }, $set: { updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/updateUserRatings', requireAuth, async (req, res) => {
  try {
    const { userId, reliability, responsiveness, recommended } = req.body;
    if (!userId || !ObjectId.isValid(userId)) return res.status(400).json({ error: 'Valid userId required' });
    const overall = (
      parseFloat(reliability || 0) * 0.3 +
      parseFloat(responsiveness || 0) * 0.3 +
      parseFloat(recommended || 0) * 0.4
    ).toFixed(1);
    await database.collection('Users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { reliability, responsiveness, recommended, overallRating: parseFloat(overall), updatedAt: new Date() } }
    );
    res.json({ success: true, overallRating: overall });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});


// ─────────────────────────────────────────────────────────────────────────────
// MESSAGING & NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/getConversations', requireAuth, async (req, res) => {
  try {
    const userId = req.userId; // from verified token
    if (!userId || !ObjectId.isValid(userId)) return res.status(400).json({ error: 'Valid userId required' });
    const conversations = await database.collection('Conversations')
      .find({ participants: new ObjectId(userId) }).sort({ updatedAt: -1 }).toArray();
    const hydrated = await Promise.all(conversations.map(async (conv) => {
      const otherRaw = conv.participants.find(p => p.toString() !== userId.toString());
      let other = { name: 'Unknown', profilePicture: null };
      if (otherRaw) {
        try {
          const otherOid = new ObjectId(otherRaw.toString());
          const u = await database.collection('Users').findOne({ _id: otherOid });
          if (u) {
            const rawPic = u.profilePicture || u.profileImageUrl || null;
            const resolvedPic = rawPic ? (rawPic.startsWith('http') ? rawPic : `${NODE_API}/uploads/${rawPic.replace(/^\/?(uploads\/)?/, '')}`) : null;
            const displayName = await resolveDisplayName(u);
            other = { _id: u._id.toString(), name: displayName, profilePicture: resolvedPic, firstName: u.firstName || '', lastName: u.lastName || '' };
          }
        } catch (e) {}
      }
      return { ...conv, _id: conv._id.toString(), other, lastMessage: conv.lastMessage || '', lastMessageAt: conv.updatedAt || conv.createdAt, unreadCount: (conv.unread || {})[userId] || 0 };
    }));
    res.json(hydrated);
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/getMessages', requireAuth, async (req, res) => {
  try {
    const { conversationId, limit = 50 } = req.query;
    const userId = req.userId; // from verified token
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });
    const convOid = ObjectId.isValid(conversationId) ? new ObjectId(conversationId) : null;
    if (!convOid) return res.status(400).json({ error: 'Invalid conversationId' });
    const messages = await database.collection('Messages').find({ conversationId: convOid }).sort({ createdAt: 1 }).limit(Number(limit)).toArray();
    if (userId) await database.collection('Conversations').updateOne({ _id: convOid }, { $set: { [`unread.${userId}`]: 0 } });
    res.json(messages.map(m => ({ ...m, _id: m._id.toString(), conversationId: m.conversationId.toString(), senderId: m.senderId?.toString?.() || m.senderId })));
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/sendMessage', requireAuth, async (req, res) => {
  try {
    const { recipientId, text, regardingTitle, regardingId, type, data, mediaUrl, mediaType } = req.body;
    const senderId = req.userId; // always from verified token
    if (!senderId || !recipientId || !text) return res.status(400).json({ error: 'recipientId and text required' });
    const sId = new ObjectId(senderId), rId = new ObjectId(recipientId);
    let conv = await database.collection('Conversations').findOne({ participants: { $all: [sId, rId], $size: 2 } });
    if (!conv) {
      const ins = await database.collection('Conversations').insertOne({ participants: [sId, rId], lastMessage: text, regardingTitle: regardingTitle || null, regardingId: regardingId || null, unread: { [recipientId]: 1 }, createdAt: new Date(), updatedAt: new Date() });
      conv = { _id: ins.insertedId };
    } else {
      await database.collection('Conversations').updateOne({ _id: conv._id }, { $set: { lastMessage: text, updatedAt: new Date() }, $inc: { [`unread.${recipientId}`]: 1 } });
    }
    const message = {
      conversationId: conv._id, senderId: sId, text,
      type: type || 'text', data: data || null,
      mediaUrl: mediaUrl || null, mediaType: mediaType || null,
      createdAt: new Date(), read: false,
    };
    const result = await database.collection('Messages').insertOne(message);
    let senderName = 'Someone';
    try { const sender = await database.collection('Users').findOne({ _id: sId }); senderName = await resolveDisplayName(sender); } catch {}
    await database.collection('Notifications').insertOne({ userId: rId, type: 'message', title: senderName, body: text.length > 60 ? text.slice(0, 60) + '…' : text, fromUserId: sId, conversationId: conv._id, read: false, createdAt: new Date() });
    const savedMessage = { ...message, _id: result.insertedId.toString(), conversationId: conv._id.toString(), senderId: senderId.toString() };
    io.to(conv._id.toString()).emit('new_message', savedMessage);
    res.json(savedMessage);
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

// PATCH /messages/:id -> generic field update (e.g. marking an interactive
// message's embedded data as answered once the recipient submits a response)
app.patch('/messages/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid message id' });
    const { _id, ...updates } = req.body || {};
    const result = await database.collection('Messages').updateOne({ _id: new ObjectId(id) }, { $set: updates });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Message not found' });
    // Push the update to all conversation participants in real-time
    const msg = await database.collection('Messages').findOne({ _id: new ObjectId(id) }, { projection: { conversationId: 1 } });
    if (msg?.conversationId) {
      io.to(msg.conversationId.toString()).emit('message_updated', { _id: id, ...updates });
    }
    res.json({ success: true, _id: id, ...updates });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

// PATCH /notifications/:id -> generic field update (e.g. flagging that a
// business already requested more info, so the button stays disabled)
app.patch('/notifications/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid notification id' });
    const { _id, ...updates } = req.body || {};
    const result = await database.collection('Notifications').updateOne({ _id: new ObjectId(id) }, { $set: updates });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true, _id: id, ...updates });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/startConversation', requireAuth, async (req, res) => {
  try {
    const { recipientId, regardingTitle, regardingId } = req.body;
    const senderId = req.userId;
    if (!recipientId) return res.status(400).json({ error: 'recipientId required' });
    const sId = new ObjectId(senderId), rId = new ObjectId(recipientId);
    let conv = await database.collection('Conversations').findOne({ participants: { $all: [sId, rId], $size: 2 } });
    if (!conv) {
      const ins = await database.collection('Conversations').insertOne({ participants: [sId, rId], lastMessage: '', regardingTitle: regardingTitle || null, regardingId: regardingId || null, unread: {}, createdAt: new Date(), updatedAt: new Date() });
      conv = { _id: ins.insertedId };
    }
    res.json({ conversationId: conv._id.toString() });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// APPOINTMENTS
// Schema: { serviceUserId, requesterId, conversationId, quoteMessageId,
//           needText, businessName, price, date, time, address,
//           status: 'proposed'|'confirmed'|'completed'|'cancelled',
//           createdAt, updatedAt }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/appointments', requireAuth, async (req, res) => {
  try {
    const { serviceUserId, requesterId, conversationId, quoteMessageId,
            needText, businessName, price, date, time, address } = req.body;
    if (!serviceUserId || !requesterId) return res.status(400).json({ error: 'serviceUserId and requesterId required' });
    const doc = {
      serviceUserId: ObjectId.isValid(serviceUserId) ? new ObjectId(serviceUserId) : null,
      requesterId:   ObjectId.isValid(requesterId)   ? new ObjectId(requesterId)   : null,
      conversationId: conversationId && ObjectId.isValid(conversationId) ? new ObjectId(conversationId) : null,
      quoteMessageId: quoteMessageId || null,
      needText: needText || null,
      businessName: businessName || null,
      price: price || null,
      date: date || null,
      time: time || null,
      address: address || null,
      status: 'confirmed',
      createdAt: new Date(), updatedAt: new Date(),
    };
    const result = await database.collection('Appointments').insertOne(doc);
    res.json({ success: true, _id: result.insertedId.toString(), ...doc,
      serviceUserId: doc.serviceUserId?.toString(), requesterId: doc.requesterId?.toString(),
      conversationId: doc.conversationId?.toString() });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/appointments', requireAuth, async (req, res) => {
  try {
    const userId = req.userId; // from verified token
    if (!userId || !ObjectId.isValid(userId)) return res.status(400).json({ error: 'Valid userId required' });
    const uid = new ObjectId(userId);
    const docs = await database.collection('Appointments')
      .find({ $or: [{ serviceUserId: uid }, { requesterId: uid }] })
      .sort({ createdAt: -1 }).toArray();
    res.json(docs.map(d => ({ ...d,
      _id: d._id.toString(),
      serviceUserId: d.serviceUserId?.toString() || null,
      requesterId: d.requesterId?.toString() || null,
      conversationId: d.conversationId?.toString() || null,
    })));
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.patch('/appointments/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid appointment id' });
    const { _id, ...updates } = req.body || {};
    updates.updatedAt = new Date();
    await database.collection('Appointments').updateOne({ _id: new ObjectId(id) }, { $set: updates });
    res.json({ success: true, _id: id, ...updates });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

// POST /appointments/:id/review
// Handles the post-appointment follow-up: saves a review from either the
// requester or the business, updates their ratings, awards NeedCoins, and
// checks if both sides agree on completion status.
app.post('/appointments/:id/review', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid appointment id' });

    const reviewerId = req.userId;
    const {
      revieweeId,      // who is being rated
      role,            // 'requester' | 'business'
      completionStatus,// 'completed' | 'inProgress' | 'notCompleted'
      notCompletedReason, // if notCompleted
      reliability, responsiveness, recommended, // 1-5 stars (optional)
    } = req.body;

    const apt = await database.collection('Appointments').findOne({ _id: new ObjectId(id) });
    if (!apt) return res.status(404).json({ error: 'Appointment not found' });

    // ── Save review on the appointment doc ────────────────────────────────
    const reviewField = role === 'requester' ? 'requesterReview' : 'businessReview';
    const reviewData  = {
      completionStatus,
      notCompletedReason: notCompletedReason || null,
      reliability:    reliability    || null,
      responsiveness: responsiveness || null,
      recommended:    recommended    || null,
      submittedAt:    new Date(),
    };
    await database.collection('Appointments').updateOne(
      { _id: new ObjectId(id) },
      { $set: { [reviewField]: reviewData, updatedAt: new Date() } }
    );

    // ── If completed + stars provided: update reviewee's ratings ──────────
    let overallRating = null;
    if (completionStatus === 'completed' && reliability && responsiveness && recommended) {
      const r    = parseFloat(reliability);
      const resp = parseFloat(responsiveness);
      const rec  = parseFloat(recommended);
      overallRating = ((r * 0.3) + (resp * 0.3) + (rec * 0.4)).toFixed(1);

      if (revieweeId && ObjectId.isValid(revieweeId)) {
        await database.collection('Users').updateOne(
          { _id: new ObjectId(revieweeId) },
          { $set: { reliability: r, responsiveness: resp, recommended: rec,
                    overallRating: parseFloat(overallRating), updatedAt: new Date() } }
        );
      }

      // Award 100 NeedCoins to the reviewer for leaving a review
      await database.collection('Users').updateOne(
        { _id: new ObjectId(reviewerId) },
        { $inc: { needCoins: 100 }, $set: { updatedAt: new Date() } }
      );
    }

    // ── Check if both parties have now responded ───────────────────────────
    const updatedApt  = await database.collection('Appointments').findOne({ _id: new ObjectId(id) });
    const requesterReview = updatedApt.requesterReview;
    const businessReview  = updatedApt.businessReview;
    let finalStatus = null;

    if (requesterReview && businessReview) {
      const bothCompleted =
        requesterReview.completionStatus === 'completed' &&
        businessReview.completionStatus  === 'completed';

      finalStatus = bothCompleted ? 'completed' : 'disputed';
      await database.collection('Appointments').updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: finalStatus, updatedAt: new Date() } }
      );
    }

    res.json({
      success: true,
      overallRating,
      coinAwarded: completionStatus === 'completed' && reliability ? 100 : 0,
      finalStatus,
    });
  } catch (err) {
    console.error('❌ /appointments/:id/review error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/getNotifications', requireAuth, async (req, res) => {
  try {
    const userId = req.userId; // from verified token
    const { limit = 30 } = req.query;
    if (!userId || !ObjectId.isValid(userId)) return res.status(400).json({ error: 'Valid userId required' });
    const notifications = await database.collection('Notifications').find({ userId: new ObjectId(userId) }).sort({ createdAt: -1 }).limit(Number(limit)).toArray();
    res.json(notifications.map(n => ({ ...n, _id: n._id.toString(), userId: n.userId?.toString() || null, fromUserId: n.fromUserId?.toString() || null, conversationId: n.conversationId?.toString() || null })));
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/markNotificationsRead', requireAuth, async (req, res) => {
  try {
    const userId = req.userId; // from verified token
    const { notificationIds } = req.body;
    if (!userId && (!notificationIds || !notificationIds.length)) return res.status(400).json({ error: 'userId or notificationIds required' });
    const query = notificationIds?.length ? { _id: { $in: notificationIds.map(id => new ObjectId(id)) } } : { userId: new ObjectId(userId) };
    await database.collection('Notifications').updateMany(query, { $set: { read: true } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/getUnreadCounts', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const [msgCount, notifCount] = await Promise.all([
      database.collection('Conversations').aggregate([{ $match: { participants: new ObjectId(userId) } }, { $group: { _id: null, total: { $sum: `$unread.${userId}` } } }]).toArray().then(r => r[0]?.total || 0),
      database.collection('Notifications').countDocuments({ userId: new ObjectId(userId), read: false }),
    ]);
    res.json({ messages: msgCount, notifications: notifCount });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/searchUsers', async (req, res) => {
  try {
    const { q = '', excludeId } = req.query;
    if (!q.trim()) return res.json([]);
    const regex = new RegExp(q.trim(), 'i');
    const query = { $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] };
    if (excludeId && ObjectId.isValid(excludeId)) query._id = { $ne: new ObjectId(excludeId) };
    const users = await database.collection('Users').find(query).limit(20).project({ firstName: 1, lastName: 1, profilePicture: 1, memberSince: 1 }).toArray();
    res.json(users.map(u => ({ ...u, _id: u._id.toString() })));
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

// ── Create a match notification (called by Tab2 when prefetch completes) ───
app.post('/createNotification', async (req, res) => {
  try {
    const { userId, type, title, body, needId, needText, fromUserId, fromName } = req.body;
    if (!userId || !ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Valid userId required' });
    }

    // Deduplicate — skip if an unread notification of the same type for this needId already exists
    if (needId) {
      const existing = await database.collection('Notifications').findOne({
        userId: new ObjectId(userId),
        type:   type || 'match',
        needId: String(needId),
        read:   false,
      });
      if (existing) {
        console.log('🔔 Duplicate notification skipped for needId:', needId);
        return res.json({ success: true, duplicate: true });
      }
    }

    // Resolve the requester's real name/picture server-side — the client's
    // cached profile context is often empty, which is what caused these to
    // show up as "Someone" instead of the requester's actual first name.
    let resolvedFromName = fromName || null;
    let resolvedFromPic  = null;
    let resolvedBody = body;
    if (fromUserId && ObjectId.isValid(fromUserId)) {
      const fromUser = await database.collection('Users').findOne({ _id: new ObjectId(fromUserId) });
      if (fromUser) {
        resolvedFromName = (fromUser.firstName || '').trim() || (await resolveDisplayName(fromUser));
        resolvedFromPic  = fromUser.profilePicture || fromUser.profileImageUrl || null;
      }
      if (type === 'lead') {
        resolvedBody = `${resolvedFromName || 'Someone'} needs help with: "${needText || ''}"`;
      }
    }

    const doc = {
      userId:     new ObjectId(userId),
      type:       type     || 'match',
      title:      title    || '🍽️ Local matches found',
      body:       resolvedBody || `Matches found for: ${needText || 'your request'}`,
      needId:     needId   ? String(needId) : null,
      needText:   needText || null,
      fromUserId: fromUserId && ObjectId.isValid(fromUserId) ? new ObjectId(fromUserId) : null,
      fromName:   resolvedFromName,
      fromPic:    resolvedFromPic,
      read:       false,
      createdAt:  new Date(),
    };

    const result = await database.collection('Notifications').insertOne(doc);
    console.log('✅ Notification created:', result.insertedId, '| needId:', needId);
    res.json({ success: true, _id: result.insertedId.toString() });
  } catch (err) {
    console.error('❌ /createNotification error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Render
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

    })

// ── Offer Codes (module-scope — uses client.db per request) ──────────────────

function generateOfferCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg()}-${seg()}`;
}

// POST /offerCodes/generate — user taps "Redeem", gets a unique one-time code
app.post('/offerCodes/generate', async (req, res) => {
  try {
    const db = client.db('Need');
    const { userId, restaurantId } = req.body;
    if (!userId || !restaurantId) return res.status(400).json({ error: 'userId and restaurantId required' });
    if (!ObjectId.isValid(userId) || !ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ error: 'Invalid userId or restaurantId' });
    }
    const uId = new ObjectId(userId);
    const rId = new ObjectId(restaurantId);

    const existing = await db.collection('OfferCodes').findOne({
      userId: uId, restaurantId: rId, redeemed: false,
    });
    if (existing) return res.json({ code: existing.code, createdAt: existing.createdAt });

    let code;
    for (let i = 0; i < 10; i++) {
      const candidate = generateOfferCode();
      const conflict = await db.collection('OfferCodes').findOne({ code: candidate });
      if (!conflict) { code = candidate; break; }
    }
    if (!code) return res.status(500).json({ error: 'Could not generate unique code' });

    const restaurant = await db.collection('Restaurants').findOne({ _id: rId });
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    const record = {
      code,
      restaurantId: rId,
      restaurantName:   restaurant.name               || '',
      offerHeadline:    restaurant.offer?.headline    || '',
      offerDescription: restaurant.offer?.description || '',
      offerBgColor:     restaurant.offer?.bgColor     || 'orange',
      offerImageUrl:    restaurant.offer?.imageUrl    || null,
      needCoins:        restaurant.offer?.needCoins   || 0,
      userId: uId,
      redeemed: false, redeemedAt: null, createdAt: new Date(),
    };
    await db.collection('OfferCodes').insertOne(record);
    res.json({ code, createdAt: record.createdAt });
  } catch (err) {
    console.error('❌ /offerCodes/generate error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /offerCodes/redeem — business confirms a code, deducts NeedCoins from user
app.post('/offerCodes/redeem', async (req, res) => {
  try {
    const db = client.db('Need');
    const { code, restaurantId } = req.body;
    if (!code || !restaurantId) return res.status(400).json({ error: 'code and restaurantId required' });
    if (!ObjectId.isValid(restaurantId)) return res.status(400).json({ error: 'Invalid restaurantId' });

    const record = await db.collection('OfferCodes').findOne({
      code: code.trim().toUpperCase(),
      restaurantId: new ObjectId(restaurantId),
    });
    if (!record) return res.status(404).json({ error: 'Code not found for this restaurant' });
    if (record.redeemed) return res.status(409).json({ error: 'This code has already been redeemed' });

    const user = await db.collection('Users').findOne({ _id: record.userId });
    const cost = record.needCoins || 0;
    const userCoins = user?.needCoins || 0;

    if (cost > 0 && userCoins < cost) {
      return res.status(402).json({
        error: 'insufficient_coins',
        message: `Sorry, this customer doesn't have enough NeedCoins yet. They need ${cost} but only have ${userCoins}. Encourage them to keep earning rewards!`,
        required: cost,
        available: userCoins,
      });
    }

    await db.collection('Users').updateOne(
      { _id: record.userId },
      { $inc: { needCoins: -cost }, $set: { updatedAt: new Date() } }
    );
    const redeemedAt = new Date();
    await db.collection('OfferCodes').updateOne(
      { _id: record._id },
      { $set: { redeemed: true, redeemedAt } }
    );
    // Queue a restaurant follow-up for the user (dedup: one per user+restaurant)
    const rObjId = new ObjectId(restaurantId);
    const existingFollowUp = await db.collection('RestaurantFollowUps').findOne({
      userId: record.userId, restaurantId: rObjId, completed: false,
    });
    if (!existingFollowUp) {
      const triggerAt = new Date(redeemedAt.getTime() + 2 * 60 * 1000); // 2 minutes
      await db.collection('RestaurantFollowUps').insertOne({
        userId: record.userId, restaurantId: rObjId,
        restaurantName: record.restaurantName || '',
        source: 'offer', triggerAt, completed: false, completedAt: null, createdAt: redeemedAt,
      });
    }
    res.json({ success: true, userId: record.userId.toString(), needCoins: cost, offerHeadline: record.offerHeadline, restaurantName: record.restaurantName });
  } catch (err) {
    console.error('❌ /offerCodes/redeem error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /offerCodes/history?restaurantId=X — redemption history for business
app.get('/offerCodes/history', async (req, res) => {
  try {
    const db = client.db('Need');
    const { restaurantId } = req.query;
    if (!restaurantId || !ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ error: 'Valid restaurantId required' });
    }
    const records = await db.collection('OfferCodes')
      .find({ restaurantId: new ObjectId(restaurantId), redeemed: true })
      .sort({ redeemedAt: -1 }).limit(100).toArray();
    res.json(records.map(r => ({
      ...r, _id: r._id.toString(),
      restaurantId: r.restaurantId.toString(),
      userId: r.userId.toString(),
    })));
  } catch (err) {
    console.error('❌ /offerCodes/history error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /visitCodes/generate — user taps "Get Visit Reward", gets a unique one-time check-in code
app.post('/visitCodes/generate', async (req, res) => {
  try {
    const db = client.db('Need');
    const { userId, restaurantId } = req.body;
    if (!userId || !restaurantId) return res.status(400).json({ error: 'userId and restaurantId required' });
    if (!ObjectId.isValid(userId) || !ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ error: 'Invalid userId or restaurantId' });
    }
    const uId = new ObjectId(userId);
    const rId = new ObjectId(restaurantId);

    const existing = await db.collection('VisitCodes').findOne({
      userId: uId, restaurantId: rId, redeemed: false,
    });
    if (existing) return res.json({ code: existing.code, createdAt: existing.createdAt });

    const restaurant = await db.collection('Restaurants').findOne({ _id: rId });
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    let code;
    for (let i = 0; i < 10; i++) {
      const candidate = generateOfferCode();
      const conflict = await db.collection('VisitCodes').findOne({ code: candidate });
      if (!conflict) { code = candidate; break; }
    }
    if (!code) return res.status(500).json({ error: 'Could not generate unique code' });

    const record = {
      code,
      restaurantId: rId,
      restaurantName: restaurant.name || '',
      needCoins: 10,
      userId: uId,
      redeemed: false, redeemedAt: null, createdAt: new Date(),
    };
    await db.collection('VisitCodes').insertOne(record);
    res.json({ code, createdAt: record.createdAt });
  } catch (err) {
    console.error('❌ /visitCodes/generate error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /visitCodes/redeem — business confirms visit, ADDS 10 NeedCoins to user
app.post('/visitCodes/redeem', async (req, res) => {
  try {
    const db = client.db('Need');
    const { code, restaurantId } = req.body;
    if (!code || !restaurantId) return res.status(400).json({ error: 'code and restaurantId required' });
    if (!ObjectId.isValid(restaurantId)) return res.status(400).json({ error: 'Invalid restaurantId' });

    const record = await db.collection('VisitCodes').findOne({
      code: code.trim().toUpperCase(),
      restaurantId: new ObjectId(restaurantId),
    });
    if (!record) return res.status(404).json({ error: 'Code not found for this restaurant' });
    if (record.redeemed) return res.status(409).json({ error: 'This visit code has already been redeemed' });

    await db.collection('Users').updateOne(
      { _id: record.userId },
      { $inc: { needCoins: record.needCoins }, $set: { updatedAt: new Date() } }
    );
    const redeemedAt = new Date();
    await db.collection('VisitCodes').updateOne(
      { _id: record._id },
      { $set: { redeemed: true, redeemedAt } }
    );
    // Queue a restaurant follow-up for the user (dedup: one per user+restaurant)
    const existingFollowUp = await db.collection('RestaurantFollowUps').findOne({
      userId: record.userId, restaurantId: new ObjectId(restaurantId), completed: false,
    });
    if (!existingFollowUp) {
      const triggerAt = new Date(redeemedAt.getTime() + 2 * 60 * 1000); // 2 minutes
      await db.collection('RestaurantFollowUps').insertOne({
        userId: record.userId, restaurantId: new ObjectId(restaurantId),
        restaurantName: record.restaurantName || '',
        source: 'visit', triggerAt, completed: false, completedAt: null, createdAt: redeemedAt,
      });
    }
    res.json({ success: true, userId: record.userId.toString(), needCoins: record.needCoins, restaurantName: record.restaurantName });
  } catch (err) {
    console.error('❌ /visitCodes/redeem error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /visitCodes/history?restaurantId=X — visit check-in history for business
app.get('/visitCodes/history', async (req, res) => {
  try {
    const db = client.db('Need');
    const { restaurantId } = req.query;
    if (!restaurantId || !ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ error: 'Valid restaurantId required' });
    }
    const records = await db.collection('VisitCodes')
      .find({ restaurantId: new ObjectId(restaurantId), redeemed: true })
      .sort({ redeemedAt: -1 }).limit(100).toArray();
    res.json(records.map(r => ({
      ...r, _id: r._id.toString(),
      restaurantId: r.restaurantId.toString(),
      userId: r.userId.toString(),
    })));
  } catch (err) {
    console.error('❌ /visitCodes/history error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /restaurantFollowUps/pending?userId=X — returns one ready follow-up for the user
app.get('/restaurantFollowUps/pending', requireAuth, async (req, res) => {
  try {
    const db = client.db('Need');
    const userId = req.userId;
    const now = new Date();
    const record = await db.collection('RestaurantFollowUps').findOne({
      userId: new ObjectId(userId),
      completed: false,
      triggerAt: { $lte: now },
    });
    if (!record) return res.json(null);
    res.json({ ...record, _id: record._id.toString(), userId: record.userId.toString(), restaurantId: record.restaurantId.toString() });
  } catch (err) {
    console.error('❌ /restaurantFollowUps/pending error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /restaurantFollowUps/complete — saves rating, awards 20 NeedCoins, marks done
app.post('/restaurantFollowUps/complete', requireAuth, async (req, res) => {
  try {
    const db = client.db('Need');
    const userId = req.userId;
    const { followUpId, reliability, responsiveness, recommended, wouldRecommend } = req.body;
    if (!followUpId) return res.status(400).json({ error: 'followUpId required' });
    if (!ObjectId.isValid(followUpId)) return res.status(400).json({ error: 'Invalid followUpId' });

    const record = await db.collection('RestaurantFollowUps').findOne({ _id: new ObjectId(followUpId) });
    if (!record) return res.status(404).json({ error: 'Follow-up not found' });
    if (record.completed) return res.status(409).json({ error: 'Already completed' });

    const allRated = reliability && responsiveness && recommended;
    const COINS = allRated ? 20 : 0;

    if (allRated) {
      await db.collection('Users').updateOne(
        { _id: new ObjectId(userId) },
        { $inc: { needCoins: COINS }, $set: { updatedAt: new Date() } }
      );
      await db.collection('Restaurants').updateOne(
        { _id: record.restaurantId },
        { $push: { visitReviews: { userId: new ObjectId(userId), reliability, responsiveness, recommended, createdAt: new Date() } } }
      );
    }

    let addedReco = null;
    if (wouldRecommend === true && record.restaurantId) {
      const restaurant = await db.collection('Restaurants').findOne(
        { _id: record.restaurantId },
        { projection: { name: 1, tagline: 1, coverImageUrl: 1 } }
      );
      if (restaurant) {
        addedReco = {
          type: 'food',
          name: restaurant.name || record.restaurantName || '',
          tagline: restaurant.tagline || '',
          coverImageUrl: restaurant.coverImageUrl || null,
        };
        await db.collection('Users').updateOne(
          { _id: new ObjectId(userId) },
          { $addToSet: { recommendations: addedReco } }
        );
      }
    }

    await db.collection('RestaurantFollowUps').updateOne(
      { _id: new ObjectId(followUpId) },
      { $set: { completed: true, completedAt: new Date(), reliability: reliability || null, responsiveness: responsiveness || null, recommended: recommended || null, wouldRecommend: wouldRecommend ?? null } }
    );
    res.json({ success: true, coinAwarded: COINS, addedReco });
  } catch (err) {
    console.error('❌ /restaurantFollowUps/complete error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});