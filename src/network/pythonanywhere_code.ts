export const PYTHONANYWHERE_FLASK_CODE = `"""
================================================================================
UNIVERSAL MULTI-GAME WebRTC P2P SIGNALING SERVER (PythonAnywhere Free Tier WSGI)
Host URL: https://larinarten.pythonanywhere.com
Version: 2.0.0 (Multi-Game Isolation + Custom Metadata + Zero-Edit Universal API)
================================================================================

[FOR HUMAN OWNER — PYTHONANYWHERE DEPLOYMENT]
1. Log into https://www.pythonanywhere.com -> "Files" -> open your flask_app.py
   (usually /home/<yourusername>/mysite/flask_app.py).
2. Replace the entire file content with THIS script and click "Save".
3. (Once) In a Bash console run: pip install flask flask-cors
   (Even without flask-cors, fallback CORS headers are built in.)
4. Go to the "Web" tab and click the green "Reload <yourusername>.pythonanywhere.com" button.
5. After deploying this v2.0.0 server once, you NEVER need to edit server code
   again for new P2P games — every game isolates itself via gameId.

--------------------------------------------------------------------------------
[FOR AI ASSISTANTS BUILDING NEW P2P GAMES — INTEGRATION SPECIFICATION]
IMPORTANT: DO NOT MODIFY THIS SERVER CODE!
Adapt your game's client networking to talk to this already-running server at:
  https://larinarten.pythonanywhere.com

1. MANDATORY GAME ISOLATION (gameId):
   - Invent a unique lowercase slug for YOUR game (e.g. "space-brawl-p2p",
     "pixel-chess-online", "rain-game").
   - Send gameId on EVERY request:
       * Query param ?gameId=<your-game-id> on ALL GET and POST requests, AND
       * JSON field "gameId": "<your-game-id>" in ALL POST JSON bodies.
   - All rooms, player slots, and WebRTC signaling queues are strictly
     namespaced by (gameId, roomId). Players from one game will NEVER see or
     collide with rooms or signals from any other game.

2. CUSTOM GAME FIELDS (meta):
   - Do NOT ask to add game-specific columns to this server.
   - Put any custom room settings (map, mode, seed, passwordHash, difficulty,
     tickRate, etc.) inside "meta": { ... } when calling POST /api/rooms.
   - Put any custom player info (avatar, team, characterId, etc.) inside
     "playerMeta": { ... } when calling POST /join.
   - The server stores and returns meta / playerMeta automatically.

3. VERSION COMPATIBILITY:
   - Pass "version": "1.0.0" (semver) when creating a room.
   - Pass "clientVersion": "1.0.0" when joining a room.
   - If clientVersion < room.version, the server returns HTTP 426 with
     {"errorCode": "VERSION_OUTDATED", "requiredVersion": "...", "error": "..."}.

4. API ENDPOINTS CONTRACT:
   - GET  /api/status?gameId=<id>
       -> {"online": true, "gameId": "<id>", "roomsCount": N, "totalRoomsCount": M, "serverTime": ms}
   - GET  /api/rooms?gameId=<id>
       -> Array of rooms ONLY for <id>:
          [{ id, gameId, name, hostId, hostName, version, playerCount, maxPlayers,
             cycleDurationSeconds, cycleRemainingSeconds, createdAt, friendlyFire, meta }]
   - POST /api/rooms?gameId=<id>
       Body: { gameId, id? (optional custom id), name, hostId, hostName,
               version?, maxPlayers? (1..64, default 12), meta? }
       -> 201 {"success": true, "room": {...}}
   - POST /api/rooms/<roomId>/join?gameId=<id>
       Body: { gameId, playerId, playerName, clientVersion?, playerMeta? }
       -> 200 {"success": true, "gameId", "roomId", "roomName", "roomVersion",
               "hostId", "meta", "cycleRemainingSeconds",
               "peers": [{"id", "name", "meta"}]}
       -> Errors: 404 ROOM_NOT_FOUND | 400 MISSING_PLAYER_ID | 426 VERSION_OUTDATED | 403 ROOM_FULL
   - POST /api/rooms/<roomId>/leave?gameId=<id>
       Body: { gameId, playerId }
       -> Automatically promotes next peer to hostId if host leaves.
   - POST /api/rooms/<roomId>/heartbeat?gameId=<id>
       Body: { gameId, playerId }
       -> Send every 10-15s (players time out after 60s of no heartbeat/poll).
   - POST /api/rooms/<roomId>/signal/send?gameId=<id>
       Body: { gameId, senderId, targetId, type ("offer"|"answer"|"ice"), payload }
   - GET  /api/rooms/<roomId>/signal/poll/<playerId>?gameId=<id>
       -> Returns & flushes pending signals array: [{ senderId, type, payload, timestamp }]
          Poll every 500-800ms while connected (also refreshes player lastSeen).

5. CLIENT WEBRTC P2P BEST PRACTICES:
   - ICE servers: stun:stun.l.google.com:19302, stun:stun1.l.google.com:19302,
     stun:stun.cloudflare.com:3478.
   - Avoid offer glare: Only the newly joining client calls createOffer() for
     each peer returned in /join peers[]; existing peers simply wait for
     the incoming "offer" via /signal/poll and reply with "answer".
   - Buffer incoming ICE candidates in pendingIceCandidates[] until
     pc.setRemoteDescription(...) completes, then flush them.
   - For fast real-time action games use unordered DataChannel:
     pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 }).
     For turn-based / reliable state use default { ordered: true }.
   - Call leave on disconnect and navigator.sendBeacon / keepalive: true
     fetch on beforeunload / pagehide.
================================================================================
"""

import re
import time
from flask import Flask, request, jsonify

# Safe import for flask_cors
try:
    from flask_cors import CORS
    has_cors = True
except ImportError:
    has_cors = False

app = Flask(__name__)

if has_cors:
    CORS(app, resources={r"/api/*": {"origins": "*"}})
else:
    @app.after_request
    def add_cors_headers(response):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, DELETE'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response

rooms = {}
signals = {}


def resolve_game_id(data=None):
    raw = request.args.get('gameId') or request.args.get('appId')
    if not raw and isinstance(data, dict):
        raw = data.get('gameId') or data.get('appId')
    if not raw:
        return 'default'
    clean = re.sub(r'[^a-zA-Z0-9._-]', '-', str(raw).strip().lower())[:64]
    return clean or 'default'


def make_room_key(game_id, room_id):
    return f"{game_id}::{room_id}"


def make_signal_key(game_id, room_id, player_id):
    return f"{game_id}::{room_id}::{player_id}"


def parse_version(ver_str):
    if not ver_str:
        return (1, 0, 0)
    clean = str(ver_str).strip().lstrip('vV')
    parts = []
    for p in clean.split('.'):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def cleanup_stale_data():
    now = time.time()
    for rkey in list(rooms.keys()):
        room = rooms[rkey]
        gid = room.get('gameId', 'default')
        rid = room.get('id', '')
        active_players = {}
        for pid, pdata in room['players'].items():
            if now - pdata.get('lastSeen', now) < 60:
                active_players[pid] = pdata
            else:
                signals.pop(make_signal_key(gid, rid, pid), None)

        room['players'] = active_players

        if len(active_players) > 0 and room.get('hostId') not in active_players:
            new_host = next(iter(active_players.keys()))
            room['hostId'] = new_host
            room['hostName'] = active_players[new_host].get('name', 'Host')

        if len(active_players) == 0 and (now - room.get('createdAt', now)) > 90:
            rooms.pop(rkey, None)
            prefix = f"{gid}::{rid}::"
            for skey in list(signals.keys()):
                if skey.startswith(prefix):
                    signals.pop(skey, None)

    for skey in list(signals.keys()):
        signals[skey] = [s for s in signals[skey] if now - s.get('timestamp', now) < 90]
        if len(signals[skey]) == 0:
            signals.pop(skey, None)


def serialize_room(r, now):
    cycle_duration = r.get('cycleDurationSeconds', 300)
    elapsed = now - r.get('createdAt', now)
    remaining = max(0, int(cycle_duration - (elapsed % cycle_duration))) if cycle_duration > 0 else 0
    return {
        "id": r.get('id', ''),
        "gameId": r.get('gameId', 'default'),
        "name": r.get('name', 'P2P Room'),
        "hostId": r.get('hostId', ''),
        "hostName": r.get('hostName', 'Host'),
        "version": r.get('version', '1.0.0'),
        "playerCount": len(r.get('players', {})),
        "maxPlayers": r.get('maxPlayers', 12),
        "cycleDurationSeconds": cycle_duration,
        "cycleRemainingSeconds": remaining,
        "createdAt": int(r.get('createdAt', now) * 1000),
        "friendlyFire": r.get('friendlyFire', True),
        "meta": r.get('meta', {})
    }


@app.route('/')
def home():
    cleanup_stale_data()
    active_games = sorted({r.get('gameId', 'default') for r in rooms.values()})
    return jsonify({
        "status": "online",
        "service": "Universal Multi-Game WebRTC Signaling Server",
        "version": "2.0.0",
        "active_rooms": len(rooms),
        "active_games": active_games,
        "endpoint": "/api/rooms?gameId=<your-game-id>"
    })


@app.route('/api/status', methods=['GET', 'OPTIONS'])
def status():
    if request.method == 'OPTIONS':
        return ('', 204)
    cleanup_stale_data()
    raw_gid = request.args.get('gameId') or request.args.get('appId')
    if raw_gid:
        gid = resolve_game_id()
        game_rooms_count = sum(1 for r in rooms.values() if r.get('gameId') == gid)
    else:
        gid = None
        game_rooms_count = len(rooms)

    return jsonify({
        "online": True,
        "gameId": gid,
        "roomsCount": game_rooms_count,
        "totalRoomsCount": len(rooms),
        "activeGamesCount": len({r.get('gameId', 'default') for r in rooms.values()}),
        "serverTime": int(time.time() * 1000)
    })


@app.route('/api/rooms', methods=['GET', 'POST', 'OPTIONS'])
def handle_rooms():
    if request.method == 'OPTIONS':
        return ('', 204)

    cleanup_stale_data()

    if request.method == 'GET':
        include_all = request.args.get('all') == '1' or request.args.get('gameId') == '*'
        gid = None if include_all else resolve_game_id()
        now = time.time()
        room_list = [
            serialize_room(r, now)
            for r in rooms.values()
            if include_all or r.get('gameId', 'default') == gid
        ]
        return jsonify(room_list)

    if request.method == 'POST':
        data = request.get_json(force=True) or {}
        gid = resolve_game_id(data)
        room_id = str(data.get('id') or f"ROOM-{int(time.time() % 100000):04d}").strip()
        host_id = str(data.get('hostId') or 'host-1').strip()
        host_name = str(data.get('hostName') or 'Host').strip()
        room_name = str(data.get('name') or f"Room {room_id}").strip()
        room_version = str(data.get('version', '1.0.0')).lstrip('vV')
        cycle_sec = max(0, int(data.get('cycleDurationSeconds', 300)))
        max_players = max(1, min(64, int(data.get('maxPlayers', 12))))
        room_meta = data.get('meta') if isinstance(data.get('meta'), dict) else {}
        host_meta = data.get('playerMeta') if isinstance(data.get('playerMeta'), dict) else {}

        now = time.time()
        rkey = make_room_key(gid, room_id)
        rooms[rkey] = {
            "id": room_id,
            "gameId": gid,
            "name": room_name,
            "hostId": host_id,
            "hostName": host_name,
            "version": room_version,
            "cycleDurationSeconds": cycle_sec,
            "maxPlayers": max_players,
            "friendlyFire": bool(data.get('friendlyFire', True)),
            "meta": room_meta,
            "createdAt": now,
            "players": {
                host_id: {
                    "id": host_id,
                    "name": host_name,
                    "meta": host_meta,
                    "lastSeen": now
                }
            }
        }

        return jsonify({
            "success": True,
            "room": serialize_room(rooms[rkey], now)
        }), 201


@app.route('/api/rooms/<room_id>/join', methods=['POST', 'OPTIONS'])
def join_room(room_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    cleanup_stale_data()
    data = request.get_json(force=True) or {}
    gid = resolve_game_id(data)
    rkey = make_room_key(gid, room_id)
    room = rooms.get(rkey)
    if not room:
        return jsonify({
            "error": "Кімнату не знайдено",
            "errorCode": "ROOM_NOT_FOUND"
        }), 404

    player_id = data.get('playerId')
    player_name = str(data.get('playerName') or 'Player').strip()
    player_meta = data.get('playerMeta') if isinstance(data.get('playerMeta'), dict) else (
        data.get('meta') if isinstance(data.get('meta'), dict) else {}
    )
    client_version = str(data.get('clientVersion', '')).lstrip('vV')
    room_version = str(room.get('version', '1.0.0')).lstrip('vV')

    if not player_id:
        return jsonify({
            "error": "playerId is required",
            "errorCode": "MISSING_PLAYER_ID"
        }), 400

    if client_version and parse_version(client_version) < parse_version(room_version):
        return jsonify({
            "error": f"Ваша версія гри (v{client_version}) застаріла! Кімната створена на новішій версії (v{room_version}). Оновіть гру.",
            "errorCode": "VERSION_OUTDATED",
            "requiredVersion": room_version
        }), 426

    if len(room['players']) >= room.get('maxPlayers', 12) and player_id not in room['players']:
        return jsonify({
            "error": f"Кімната заповнена (макс {room.get('maxPlayers', 12)} гравців)",
            "errorCode": "ROOM_FULL"
        }), 403

    now = time.time()
    room['players'][player_id] = {
        "id": player_id,
        "name": player_name,
        "meta": player_meta,
        "lastSeen": now
    }

    other_players = [
        {"id": pid, "name": p["name"], "meta": p.get("meta", {})}
        for pid, p in room['players'].items()
        if pid != player_id
    ]

    cycle_sec = room.get('cycleDurationSeconds', 300)
    remaining = max(0, int(cycle_sec - ((now - room['createdAt']) % cycle_sec))) if cycle_sec > 0 else 0

    return jsonify({
        "success": True,
        "gameId": gid,
        "roomId": room_id,
        "roomName": room['name'],
        "roomVersion": room_version,
        "hostId": room['hostId'],
        "meta": room.get('meta', {}),
        "cycleRemainingSeconds": remaining,
        "peers": other_players
    })


@app.route('/api/rooms/<room_id>/leave', methods=['POST', 'OPTIONS'])
def leave_room(room_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    data = request.get_json(force=True, silent=True) or {}
    gid = resolve_game_id(data)
    player_id = data.get('playerId') or request.args.get('playerId')
    room = rooms.get(make_room_key(gid, room_id))
    if room and player_id in room['players']:
        room['players'].pop(player_id, None)
        signals.pop(make_signal_key(gid, room_id, player_id), None)
        if room['hostId'] == player_id and len(room['players']) > 0:
            new_host = next(iter(room['players'].keys()))
            room['hostId'] = new_host
            room['hostName'] = room['players'][new_host]['name']

    return jsonify({"success": True})


@app.route('/api/rooms/<room_id>/heartbeat', methods=['POST', 'OPTIONS'])
def heartbeat(room_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    data = request.get_json(force=True) or {}
    gid = resolve_game_id(data)
    player_id = data.get('playerId')
    room = rooms.get(make_room_key(gid, room_id))
    if room and player_id in room['players']:
        room['players'][player_id]['lastSeen'] = time.time()
        return jsonify({"status": "ok"})
    return jsonify({"status": "not_in_room"}), 404


@app.route('/api/rooms/<room_id>/signal/send', methods=['POST', 'OPTIONS'])
def send_signal(room_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    data = request.get_json(force=True) or {}
    gid = resolve_game_id(data)
    sender_id = data.get('senderId')
    target_id = data.get('targetId')
    signal_type = data.get('type')
    payload = data.get('payload')

    if not sender_id or not target_id or payload is None:
        return jsonify({
            "error": "Invalid signaling payload",
            "errorCode": "INVALID_SIGNAL"
        }), 400

    skey = make_signal_key(gid, room_id, target_id)
    if skey not in signals:
        signals[skey] = []

    signals[skey].append({
        "senderId": sender_id,
        "type": signal_type,
        "payload": payload,
        "timestamp": time.time()
    })

    return jsonify({"success": True})


@app.route('/api/rooms/<room_id>/signal/poll/<player_id>', methods=['GET', 'OPTIONS'])
def poll_signals(room_id, player_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    gid = resolve_game_id()
    room = rooms.get(make_room_key(gid, room_id))
    if room and player_id in room['players']:
        room['players'][player_id]['lastSeen'] = time.time()

    pending = signals.pop(make_signal_key(gid, room_id, player_id), [])
    return jsonify(pending)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
`;
