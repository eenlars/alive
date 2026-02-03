Analytics Page Works

  Overview - The Big Picture

  The analytics system has 4 main parts:

  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
  │   1. TRIGGER    │────▶│   2. CLIENT     │────▶│   3. SERVER     │────▶│   4. DISPLAY    │
  │   (Index.tsx)   │     │   (visitors.ts) │     │   (vite-plugin) │     │   (Analytics)   │
  │   Records visit │     │   Sends request │     │   Saves to DB   │     │   Shows stats   │
  │   when page loads│     │   to /api/...   │     │   + geolocation │     │   + map         │
  └─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘

  ---
  Part 1: Triggering the Visit Record

  File: src/pages/Index.tsx:7-11

  useEffect(() => {
    // Record visit only once when the homepage loads (additional idempotency check possible by ip)
    recordVisit();
  }, []);

  What this does:
  - When someone opens the homepage, React's useEffect runs once (empty [] dependency)
  - It calls recordVisit() from the visitors library
  - This is a "fire and forget" call - user doesn't wait for it

  ---
  Part 2: The Client-Side Library

  File: src/lib/visitors.ts

  This file handles sending visit data to the server. Key parts:

  2a. Session ID Management (lines 29-42)

  const getOrCreateSessionId = (): string => {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();  // Generate unique ID
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  };

  Why this matters:
  - Each browser tab gets a unique session ID stored in sessionStorage
  - This lets you count unique visitors, not just page loads
  - sessionStorage clears when tab closes (vs localStorage which persists)

  2b. Avoiding Duplicate Counts (lines 52-57)

  const lastRecorded = sessionStorage.getItem(VISIT_RECORDED_KEY);
  if (lastRecorded === currentHour) {
    console.log('Visit already recorded for this hour');
    return;  // Don't send again!
  }

  Why this matters:
  - If you refresh the page 10 times, you're still counted as 1 visitor
  - Only counts you again when the hour changes (e.g., 14:00 → 15:00)

  2c. Sending the Data (lines 62-81)

  const response = await fetch('/api/visitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      timestamp: now.getTime(),
    }),
  });

  What gets sent:
  - sessionId: Your unique browser ID
  - timestamp: When you visited (in milliseconds)

  Note: The client does NOT send IP/location - the server figures that out!

  ---
  Part 3: The Server-Side API

  File: vite-plugin-api.js (lines 203-322)

  This is a Vite plugin that adds API endpoints to the dev server. In production, this same logic runs in the Hono server.

  3a. Database Setup (lines 13-39)

  const db = new Database(dbPath);  // SQLite file: visitors.db

  // Table 1: Unique visitors
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      first_visit DATETIME,
      last_visit DATETIME
    )
  `);

  // Table 2: Hourly breakdown with location
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitor_hourly (
      session_id TEXT NOT NULL,
      hour TEXT NOT NULL,        -- e.g., "2025-12-02 14:00"
      timestamp BIGINT NOT NULL,
      ip TEXT,
      country TEXT,
      city TEXT,
      lat REAL,                  -- For map
      lon REAL,                  -- For map
      UNIQUE(session_id, hour)   -- Can't double-count same person in same hour
    )
  `);

  Two tables:
  1. visitors - Tracks each unique session (for "total visitors" count)
  2. visitor_hourly - Tracks visits per hour with location data

  3b. Recording a Visit (POST /api/visitors, lines 254-318)

  When the client sends a POST request:

  Step 1: Get the visitor's IP address
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
             req.headers['x-real-ip'] ||
             req.socket.remoteAddress;

  Step 2: Look up their location using a free API
  const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`);
  const geoData = await geoResponse.json();
  // Returns: { country: "Netherlands", city: "Amsterdam", lat: 52.37, lon: 4.89 }

  Step 3: Save to database
  // Insert new visitor OR update last_visit time
  db.prepare(`
    INSERT INTO visitors (session_id, first_visit, last_visit)
    VALUES (?, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET last_visit = datetime('now')
  `).run(sessionId);

  // Insert hourly record (ignored if duplicate hour)
  db.prepare(`
    INSERT OR IGNORE INTO visitor_hourly (session_id, hour, timestamp, ip, country, city, lat, lon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, hour, timestamp, ip, country, city, lat, lon);

  3c. Fetching Stats (GET /api/visitors, lines 205-253)

  // Count total unique visitors
  const total = db.prepare('SELECT COUNT(DISTINCT session_id) as total FROM visitors').get();

  // Count current hour visitors
  const currentHour = db.prepare(`
    SELECT COUNT(DISTINCT session_id) as count FROM visitor_hourly WHERE hour = ?
  `).get(currentHour);

  // Get hourly breakdown
  const hourly = db.prepare(`
    SELECT hour, COUNT(DISTINCT session_id) as count
    FROM visitor_hourly
    GROUP BY hour
    ORDER BY hour DESC
  `).all();

  // Get all visitor records (for the map)
  const visitors = db.prepare(`
    SELECT session_id, hour, timestamp, ip, country, city, lat, lon
    FROM visitor_hourly
    ORDER BY timestamp DESC
  `).all();

  Returns JSON like:
  {
    "currentHour": 5,
    "total": 142,
    "hourly": {
      "2025-12-02 14:00": 5,
      "2025-12-02 13:00": 12,
      "2025-12-02 12:00": 8
    },
    "visitors": [
      { "sessionId": "abc123", "country": "Netherlands", "city": "Amsterdam", "lat": 52.37, "lon": 4.89, ... }
    ]
  }

  ---
  Part 4: The Analytics Dashboard

  File: src/pages/Analytics.tsx

  4a. Password Protection (lines 31-42)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'password') {  // Hardcoded password
      setIsAuthenticated(true);
      sessionStorage.setItem('analytics_auth', 'true');  // Remember for session
      loadStats();
    }
  };

  4b. Fetching & Displaying Stats (lines 24-29, 133-167)

  const loadStats = async () => {
    const data = await getVisitorStats();  // Calls GET /api/visitors
    setStats(data);
  };

  Display cards:
  <p className="text-4xl font-bold">{stats?.currentHour || 0}</p>  // Current hour
  <p className="text-4xl font-bold">{stats?.total || 0}</p>        // All-time total

  4c. Hourly Bar Chart (lines 189-211)

  {sortedHours.map((hour) => {
    const count = hourlyData[hour];
    const percentage = (count / maxCount) * 100;  // Relative to busiest hour

    return (
      <div>
        <span>{hour}</span>
        <span>{count} visitors</span>
        <div style={{ width: `${percentage}%` }} className="bg-primary h-full" />
      </div>
    );
  })}

  ---
  Part 5: The Visitor Map

  File: src/components/VisitorMap.tsx

  Uses Leaflet (a free mapping library) to show visitor locations.

  // Filter visitors that have coordinates
  const locatedVisitors = visitors.filter(v => v.lat && v.lon);

  // Create map centered on average location
  const map = L.map(mapRef.current).setView(centerLatLng, 2);

  // Add OpenStreetMap tiles (free)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  // Add a marker for each visitor
  locatedVisitors.forEach((visitor) => {
    const marker = L.marker([visitor.lat, visitor.lon]);
    marker.bindPopup(`${visitor.city}, ${visitor.country}`);
    marker.addTo(map);
  });

  ---
  Data Flow Summary

  User visits websitename.nl
           │
           ▼
  ┌─────────────────────────────────────┐
  │ Index.tsx: useEffect → recordVisit()│
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │ visitors.ts: Check if already       │
  │ recorded this hour. If not, POST    │
  │ { sessionId, timestamp } to server  │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │ Server: Extract IP from headers,    │
  │ lookup location via ip-api.com,     │
  │ save to SQLite database             │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │ Analytics.tsx: Fetch stats,         │
  │ display counts + hourly bars        │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │ VisitorMap.tsx: Plot locations      │
  │ on Leaflet/OpenStreetMap            │
  └─────────────────────────────────────┘

  ---
  Key Concepts for Beginners

  | Concept        | What It Means                                          |
  |----------------|--------------------------------------------------------|
  | Session ID     | A unique identifier for each browser tab/session       |
  | sessionStorage | Browser storage that clears when you close the tab     |
  | SQLite         | A simple file-based database (visitors.db)             |
  | IP Geolocation | Converting an IP address to country/city/coordinates   |
  | Vite Plugin    | Code that extends the dev server with custom endpoints |
  | Leaflet        | Free JavaScript library for interactive maps           |