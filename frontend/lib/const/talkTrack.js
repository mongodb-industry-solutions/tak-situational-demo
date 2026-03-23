export const TALK_TRACK = [
  {
    heading: "Instructions & Talk Track",
    content: [
      {
        heading: "Solution Overview",
        body: "This dashboard is the Command Vehicle view for a MongoDB + Ditto tactical edge demo. Real Android devices running ATAK CIV with the Ditto Edge Sync plugin form a peer-to-peer mesh in the field — no cell towers, no satellite required. When connectivity is restored, the Ditto MongoDB Connector syncs all field data (positions, chat, map items) to MongoDB Atlas, and this dashboard instantly reflects the full operational picture.",
      },
      {
        heading: "How to Demo",
        body: [
          "Open this dashboard on the command laptop before the demo begins.",
          "Point to the map: each marker is a live field device (soldier/unit). Green = active, grey = stale (position is last known).",
          "Open the ATAK app on the Android device. Move the device — watch the marker update in real time on the map.",
          "Send a chat message from ATAK. It appears in the Comms Feed panel on the right.",
          "Disconnect the Android device from Wi-Fi (simulate jamming / denied comms). The marker turns grey with a ⚠ STALE badge — Command knows the unit is out of contact but retains last known position.",
          "Reconnect the device. The marker immediately goes green again and the position snaps to current — demonstrating instant sync on reconnect via Ditto.",
        ],
      },
    ],
  },
  {
    heading: "Behind the Scenes",
    content: [
      {
        heading: "Architecture",
        body: "Android ATAK devices run the Ditto Edge Sync plugin. Ditto forms a secure peer-to-peer mesh (BLE / WiFi) between devices — fully offline. A Ditto Big Peer on Ditto Cloud acts as the coordination hub. The Ditto MongoDB Connector replicates all Ditto collections (track, chat, mapitem) to MongoDB Atlas in real time. This dashboard reads from Atlas via a FastAPI backend.",
      },
      {
        image: {
          src: "/img/high-level-architecture.svg",
          alt: "Architecture: ATAK → Ditto Mesh → MongoDB Connector → Atlas → Dashboard",
        },
      },
    ],
  },
  {
    heading: "Why MongoDB?",
    content: [
      {
        heading: "Flexible Document Model",
        body: "ATAK produces Cursor-on-Target (CoT) XML events for positions, map items, and chat — all structurally different. MongoDB stores them as flexible BSON documents in the same database without rigid schemas. If the team later adds biometric sensors (heart rate) or environmental data (temperature, wind speed), the new fields simply appear in existing documents. No migrations, no downtime.",
      },
      {
        heading: "Queryable Encryption",
        body: "Every field device stores its MongoDB data encrypted on-device using MongoDB Queryable Encryption. The encryption keys live only at Command. If a soldier's device is captured, the enemy cannot read location history, voice-to-text logs, or movement patterns — the data is cryptographically useless without Command's keys.",
      },
      {
        heading: "Real-time & Edge-first",
        body: "MongoDB Change Streams provide instant push updates. The Ditto connector uses them to propagate field data to Atlas the moment a device comes online. Combined with Ditto's offline-first P2P mesh, the result is an architecture that degrades gracefully in contested environments and recovers instantly when connectivity is restored.",
      },
    ],
  },
];
