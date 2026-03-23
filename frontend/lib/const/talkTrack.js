export const TALK_TRACK = [
  {
    heading: "Scenario",
    content: [
      {
        heading: "The Situation",
        body: "Field units operate in environments where connectivity is unreliable or actively denied — terrain, interference, or deliberate jamming can cut off communication at any moment. Squads still need to coordinate, share positions, and report back to Command regardless of network conditions.",
      },
      {
        heading: "The Problem",
        body: "Command needs a live operational picture — where are the units, are they active or out of contact, and what are they reporting? Traditional systems fail the moment connectivity drops. When a unit goes silent, Command loses all visibility into their last known position and has no way to distinguish a technical failure from a tactical emergency.",
      },
      {
        heading: "What This Dashboard Shows",
        body: [
          "Map markers — each pin is a field device (soldier/unit). Green = actively syncing, grey = stale (last known position).",
          "Node Status panel — at a glance, which units are active and which have gone out of contact, with time since last update.",
          "Comms Feed — chat messages sent from ATAK devices in the field, appearing in real time as connectivity is restored.",
          "Staleness — when a unit loses connectivity, their marker turns grey with a STALE badge. Command retains the last known position and knows exactly when contact was lost.",
        ],
      },
      {
        heading: "The Demo Flow",
        body: [
          "Point to the map: each marker is a live field device. Watch the position update in real time as the Android device moves.",
          "Send a chat message from the ATAK app — it appears in the Comms Feed within seconds.",
          "Disconnect the Android device from Wi-Fi to simulate jamming. The marker goes grey (STALE) — Command still sees last known position.",
          "Reconnect the device. The marker instantly snaps back to green and the position updates — demonstrating Ditto's instant sync on reconnect.",
        ],
      },
    ],
  },
  {
    heading: "How It Works",
    content: [
      {
        heading: "End-to-End Architecture",
        body: "Android devices run ATAK CIV with the Ditto Edge Sync plugin installed. Ditto forms a secure peer-to-peer mesh between devices over BLE and Wi-Fi Direct — no infrastructure required. A Ditto Big Peer running on Ditto Cloud acts as the cloud coordination hub. The Ditto MongoDB Connector replicates all field collections (positions, chat, map items) to MongoDB Atlas in real time the moment any device has connectivity. This dashboard's FastAPI backend reads from Atlas and the Next.js frontend polls every 2 seconds.",
      },
      {
        heading: "Data Flow",
        body: [
          "ATAK device → Ditto Edge Sync plugin (on-device)",
          "Ditto P2P mesh → other field devices (offline, no infrastructure)",
          "Ditto Big Peer on Ditto Cloud → synchronisation hub",
          "Ditto MongoDB Connector → MongoDB Atlas (cloud)",
          "FastAPI backend → reads Atlas collections (read-only)",
          "This dashboard → polls backend every 2 seconds",
        ],
      },
      {
        heading: "Collections in Atlas",
        body: [
          "track — PLI (Position Location Information): transient device positions shown as map markers",
          "chat — messages sent from ATAK devices, shown in the Comms Feed",
          "mapitem — persistent map graphics drawn in ATAK (visible on the map)",
        ],
      },
    ],
  },
  {
    heading: "Why MongoDB?",
    content: [
      {
        heading: "Flexible Document Model",
        body: "ATAK produces Cursor-on-Target (CoT) events for positions, chat messages, and map graphics — all structurally different. MongoDB stores them as flexible BSON documents with no rigid schema. When the team later adds biometric sensors (heart rate) or environmental readings (temperature, wind speed), the new fields simply appear in existing documents. No migrations, no downtime, no schema changes.",
      },
      {
        heading: "Queryable Encryption",
        body: "Every field device stores its data encrypted on-device using MongoDB Queryable Encryption. The encryption keys live only at Command. If a soldier's device is captured, the enemy cannot read location history, chat logs, or movement patterns — the data is cryptographically useless without Command's keys. This is demonstrated live via MongoDB Compass or Atlas UI during the demo.",
      },
      {
        heading: "Real-Time Sync at the Edge",
        body: "MongoDB Change Streams provide instant push updates. The Ditto connector uses them to propagate field data to Atlas the moment a device comes online. Combined with Ditto's offline-first P2P mesh, the architecture degrades gracefully in contested environments and recovers instantly when connectivity is restored — exactly the behaviour shown in this dashboard.",
      },
    ],
  },
];
