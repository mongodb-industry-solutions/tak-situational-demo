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
          "Map markers — each pin is a field device. Green = actively syncing, grey = stale (last known position).",
          "Node Status panel — which units are active and which have gone out of contact, with time since last update.",
          "Comms Feed — messages sent from field devices, appearing in real time as connectivity is restored.",
          "Staleness — when a unit loses connectivity, their marker turns grey. Command retains the last known position and knows exactly when contact was lost.",
        ],
      },
      {
        heading: "What You'll See",
        body: [
          "A live map with field device positions updating in real time as devices move.",
          "Chat messages from the field appearing in the Comms Feed within seconds of being sent.",
          "A device going offline: its marker turns grey and is marked STALE — last known position is preserved.",
          "The device reconnecting: the marker instantly returns to green and the position updates — demonstrating seamless sync on reconnect.",
        ],
      },
    ],
  },
  {
    heading: "How It Works",
    content: [
      {
        heading: "End-to-End Architecture",
        body: "Android devices run ATAK CIV with the Ditto Edge Sync plugin installed. Ditto forms a secure peer-to-peer mesh between devices over BLE and Wi-Fi Direct — no infrastructure required. A Ditto Big Peer on Ditto Cloud acts as the coordination hub. The Ditto MongoDB Connector replicates all field data to MongoDB Atlas in real time the moment any device has connectivity. This dashboard reads from Atlas and updates automatically.",
      },
      {
        heading: "Data Flow",
        body: [
          "Field devices form a secure offline mesh — positions, chat, and map data sync peer-to-peer with no cell towers or satellite.",
          "When any device reaches connectivity, the Ditto cloud hub reconciles the mesh state and pushes it to MongoDB Atlas.",
          "This Command dashboard reads from Atlas and reflects the full operational picture in real time.",
        ],
      },
    ],
  },
  {
    heading: "Why MongoDB?",
    content: [
      {
        heading: "Flexible Document Model",
        body: "ATAK produces different types of events — position updates, chat messages, map graphics — all with different shapes. MongoDB stores them as flexible documents with no rigid schema. When the team later adds biometric sensors or environmental readings, the new data simply appears alongside the existing records. No migrations, no downtime, no schema changes.",
      },
      {
        heading: "Queryable Encryption",
        body: "Field device data is encrypted at rest using MongoDB Queryable Encryption. The encryption keys live only at Command. If a device is captured, the adversary cannot read location history, chat logs, or movement patterns — the data is cryptographically useless without Command's keys.",
      },
      {
        heading: "Real-Time Sync at the Edge",
        body: "MongoDB's real-time capabilities propagate field data to the command picture the moment a device comes online. Combined with Ditto's offline-first mesh, the architecture degrades gracefully in contested environments and recovers instantly when connectivity is restored.",
      },
    ],
  },
];
