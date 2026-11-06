# Rain World P2P Multiplayer Architecture & Signaling System

Complete architectural plan and server implementation for real-time WebRTC peer-to-peer multiplayer, distributed room-host physics simulation, client-side hit registration, adaptive combat audio, and a free-tier compatible PythonAnywhere Flask signaling server.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural parameters have been aligned with your preferences and runtime environment constraints:

- **Confirmed Decision 1 (Lobby UX)**: Players connect through an interactive **Room List (Список кімнат)**, where they can browse available rooms, create a new room with custom name and cycle settings, or enter a direct room code.
- **Confirmed Decision 2 (Signaling Protocol)**: The PythonAnywhere backend will use an **optimized HTTP REST polling protocol** with full CORS support. Because PythonAnywhere free tier WSGI restricts persistent WebSocket daemons, HTTP REST with short polling guarantees 100% compatibility and zero server costs.
- **Confirmed Decision 3 (Scale & Session Cycle)**: Each room supports **up to 12 players** connected via WebRTC DataChannels, accompanied by an in-game Rain World Cycle Timer that triggers the shelter/rain flood session restart.
- **Confirmed Decision 4 (Server Deployment Code)**: You will be provided with a standalone, production-ready `flask_app.py` script ready to copy directly into your PythonAnywhere account at `larinarten.pythonanywhere.com`.

---

## 1. Overview & Core Concept

The game transitions from a single-player simulation into a decentralized **P2P Survival & PvP Arena**:
1. **Lightweight Matchmaker (PythonAnywhere)**: The free Flask server acts purely as a handshake broker. It holds active room listings, player registers, and relays WebRTC SDP offers, answers, and ICE candidates. Once peers establish a direct `RTCDataChannel`, the server is no longer involved in game traffic.
2. **Direct P2P DataChannel**: Player inputs, movement coordinates, weapon throws, stuns, and berry consumption sync directly between browsers with minimal latency.
3. **Distributed World Simulation ("Кожен — хост своєї локації")**:
   - The first player to enter a room becomes the **Room Host** (zero-ping host advantage for that zone).
   - If Player 1 is in `SU_A01` and Player 2 is in `SU_A02`, Player 1's phone simulates `SU_A01` physics and creatures, while Player 2's device simulates `SU_A02`. Neither device overheats calculating off-screen rooms.
   - If a device struggles with performance, a "Client Dummy" toggle delegates room authority to a peer.
4. **Client-Side Hit Registration ("Favor the Shooter")**:
   - Attackers calculate collisions locally. If a spear hits on your screen, the impact is immediately locked in and an authoritative damage packet is sent to the target.
5. **Adaptive Combat Audio & Concussion Low-Pass**:
   - Combat music intensifies when weapons are thrown or fly close.
   - If a player retreats into a pipe, a 10-second fade-out timer engages.
   - When a player suffers a fatal blow, the Web Audio graph immediately engages a 350 Hz Low-Pass BiquadFilter, creating a realistic concussive muffled bass effect.

---

## 2. User Experience & Visual Design

### A. Multiplayer Room Browser & Lobby Modal
- **Entry Point**: A prominent **"МЕРЕЖА [P2P]"** button in the top ambient menu bar and title screen.
- **Modal Layout**:
  - **Header**: Connection status badge (e.g. `● ОФЛАЙН`, `● ПОШУК СЕРВЕРА`, `● ПІДКЛЮЧЕНО ДО larinarten.pythonanywhere.com`), player nickname input, and custom signaling server URL field (defaulting to `https://larinarten.pythonanywhere.com`).
  - **Room Browser**: List of active rooms displaying Room Name, Host Slugcat, Player Count (e.g. `3 / 12`), Current Cycle Time remaining, and a `"ПРИЄДНАТИСЯ"` button.
  - **Room Creation**: Quick button `"СТВОРИТИ КІМНАТУ"` with options for Room Name, Cycle Duration (e.g. 5 min, 8 min), and Friendly Fire toggle.
- **Slugcat Customization & Identification**:
  - Each of the 12 players receives a distinctive Rain World slugcat color palette (Survivor White, Monk Pale Yellow, Hunter Crimson, Nightcat Dark Indigo, Gourmand Cream, Rivulet Cyan, Artificer Amber, Saint Olive, etc.) and player tag floating smoothly above their head.

### B. In-Game Network HUD & Indicators
- **Latency & Peer Indicator**: Unobtrusive text indicator in the top right showing `P2P: 24ms · 4 Гравці`.
- **Rain Cycle Countdown**: Rain World cycle timer in the HUD showing time remaining until the torrential flood restarts the cycle.
- **Hit Feedback**: Instant screen flash and blood/spark splatter when landing a spear on a peer.

---

## 3. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│               PythonAnywhere Flask Signaling                     │
│               https://larinarten.pythonanywhere.com             │
│                                                                 │
│  [GET /api/rooms]               [POST /api/create_room]         │
│  [POST /api/join_room]          [POST /api/signal/offer]        │
│  [POST /api/signal/answer]      [POST /api/signal/ice]          │
└──────────────▲──────────────────────────────────▲───────────────┘
               │ HTTP Handshake                   │ HTTP Handshake
               │ (SDP / ICE polling)              │ (SDP / ICE polling)
┌──────────────▼──────────────┐   WebRTC P2P      ┌──────────────▼──────────────┐
│        Player 1 (Host)      │  Direct Channel   │        Player 2 (Peer)      │
│  Simulates Room A (0ms)     │◄─────────────────►│  Simulates Room B (0ms)     │
│  Renders Slugcat 1 & 2      │  DataChannel Mesh │  Renders Slugcat 1 & 2      │
│  Web Audio PvP Engine       │ (up to 12 peers)  │  Web Audio PvP Engine       │
└─────────────────────────────┘                   └─────────────────────────────┘
```

### Network Packet Schema (Binary / JSON over DataChannel)
```typescript
export type PacketType = 
  | 'PLAYER_STATE'    // x, y, vx, vy, state, animFrame, heldItem, direction
  | 'THROW_ITEM'      // itemId, itemType, startX, startY, vx, vy
  | 'HIT_CONFIRM'     // attackerId, targetId, damage, weaponType, impactX, impactY
  | 'ROOM_CHANGE'     // playerId, fromRoom, toRoom, isHostClaimed
  | 'HOST_TRANSFER'   // newHostId, roomKey
  | 'CYCLE_SYNC'      // remainingCycleSeconds, isFloodActive
  | 'MOB_SYNC';       // creatureId, room, x, y, hp, state (sent by room host)
```

### Complete PythonAnywhere Flask Server Code (`flask_app.py`)
This exact code will be supplied in the implementation so you can paste it directly into your `flask_app.py` on PythonAnywhere:
- Implements CORS (`flask_cors`).
- In-memory room registry with 30-minute stale room cleanup.
- Message mailboxes for WebRTC SDP Offers, Answers, and ICE candidates partitioned by player session ID.
- Zero external database required; scales smoothly within the free tier.

---

## 4. Implementation Steps & Milestones

1. **Signaling Client & Server Script**:
   - Create `src/network/SignalingClient.ts` handling HTTP REST polling with PythonAnywhere.
   - Provide the complete standalone `flask_app.py` script for PythonAnywhere.
2. **WebRTC P2P DataChannel Mesh (`src/network/WebRTCManager.ts`)**:
   - Establish STUN connections (`stun:stun.l.google.com:19302`) and DataChannels.
   - Handle player join/leave, heartbeat, and reconnection logic for up to 12 peers.
3. **Multiplayer Room Lobby UI (`src/components/MultiplayerLobbyModal.tsx`)**:
   - Room list browser, room creation, server status checker, and player nickname input.
4. **Distributed Simulation & Client-Side Hit-Reg Integration**:
   - Integrate remote slugcat rendering and interpolated position smoothing inside `OutskirtsLocation.tsx`.
   - Implement "Favor the Shooter" combat packet dispatcher for spears and stones.
   - Implement room authority routing for creatures and platforms.
5. **Adaptive PvP Audio & Concussion Engine**:
   - Update `RainWorldSynth.ts` with combat tension loops, 10s pipe exit fade-out, and Low-Pass filter on mortality.
6. **Verification & Testing**:
   - Build and verify compilation with `compile_applet`.
