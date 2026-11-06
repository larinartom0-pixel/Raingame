export const PYTHONANYWHERE_FLASK_CODE = `"""
Rain World WebRTC Signaling Server for PythonAnywhere (Free Tier WSGI)
Domain: https://larinarten.pythonanywhere.com
Author: Rain World P2P Engine

ІНСТРУКЦІЯ ДЛЯ ВСТАНОВЛЕННЯ НА PYTHONANYWHERE:
1. Зайдіть у свій акаунт: https://www.pythonanywhere.com
2. Перейдіть у вкладку "Web".
3. Натисніть на посилання до конфігураційного файлу або відкрийте:
   /home/ваш_логін/mysite/flask_app.py
4. Повністю вставте цей код у файл flask_app.py і збережіть.
5. Відкрийте Bash консоль на PythonAnywhere та встановіть бібліотеки:
   pip install flask flask-cors
6. На вкладці "Web" натисніть зелену кнопку "Reload larinarten.pythonanywhere.com"!
"""

import time
from flask import Flask, request, jsonify

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

def cleanup_stale_data():
    now = time.time()
    for room_id in list(rooms.keys()):
        room = rooms[room_id]
        active_players = {}
        for pid, pdata in room['players'].items():
            if now - pdata.get('lastSeen', now) < 60:
                active_players[pid] = pdata
            else:
                if pid in signals:
                    signals.pop(pid, None)

        room['players'] = active_players
        if len(active_players) == 0 and (now - room.get('createdAt', now)) > 90:
            rooms.pop(room_id, None)

    for pid in list(signals.keys()):
        signals[pid] = [s for s in signals[pid] if now - s.get('timestamp', now) < 90]
        if len(signals[pid]) == 0:
            signals.pop(pid, None)

@app.route('/')
def home():
    return jsonify({
        "status": "online",
        "service": "Rain World WebRTC Signaling Server",
        "version": "1.1.0",
        "active_rooms": len(rooms),
        "endpoint": "/api/rooms"
    })

@app.route('/api/status', methods=['GET', 'OPTIONS'])
def status():
    if request.method == 'OPTIONS':
        return ('', 204)
    cleanup_stale_data()
    return jsonify({
        "online": True,
        "roomsCount": len(rooms),
        "serverTime": int(time.time() * 1000)
    })

@app.route('/api/rooms', methods=['GET', 'POST', 'OPTIONS'])
def handle_rooms():
    if request.method == 'OPTIONS':
        return ('', 204)

    cleanup_stale_data()

    if request.method == 'GET':
        room_list = []
        now = time.time()
        for r_id, r in rooms.items():
            cycle_duration = r.get('cycleDurationSeconds', 300)
            elapsed = now - r.get('createdAt', now)
            remaining = max(0, int(cycle_duration - (elapsed % cycle_duration)))

            room_list.append({
                "id": r_id,
                "name": r.get('name', 'Rain World Room'),
                "hostId": r.get('hostId', ''),
                "hostName": r.get('hostName', 'Slugcat Host'),
                "playerCount": len(r.get('players', {})),
                "maxPlayers": r.get('maxPlayers', 12),
                "cycleDurationSeconds": cycle_duration,
                "cycleRemainingSeconds": remaining,
                "createdAt": int(r.get('createdAt', now) * 1000),
                "friendlyFire": r.get('friendlyFire', True)
            })
        return jsonify(room_list)

    if request.method == 'POST':
        data = request.get_json(force=True) or {}
        room_id = data.get('id') or f"RW-{int(time.time() % 100000):04d}"
        host_id = data.get('hostId', 'host-1')
        host_name = data.get('hostName', 'Слимакокіт-Хост')
        room_name = data.get('name', f"Кімната {room_id}")
        cycle_sec = int(data.get('cycleDurationSeconds', 300))
        max_players = min(12, int(data.get('maxPlayers', 12)))

        now = time.time()
        rooms[room_id] = {
            "id": room_id,
            "name": room_name,
            "hostId": host_id,
            "hostName": host_name,
            "cycleDurationSeconds": cycle_sec,
            "maxPlayers": max_players,
            "friendlyFire": data.get('friendlyFire', True),
            "createdAt": now,
            "players": {
                host_id: {
                    "id": host_id,
                    "name": host_name,
                    "lastSeen": now
                }
            }
        }

        return jsonify({
            "success": True,
            "room": {
                "id": room_id,
                "name": room_name,
                "hostId": host_id,
                "hostName": host_name,
                "playerCount": 1,
                "maxPlayers": max_players,
                "cycleDurationSeconds": cycle_sec,
                "cycleRemainingSeconds": cycle_sec,
                "createdAt": int(now * 1000),
                "friendlyFire": data.get('friendlyFire', True)
            }
        }), 201

@app.route('/api/rooms/<room_id>/join', methods=['POST', 'OPTIONS'])
def join_room(room_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    cleanup_stale_data()
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "Кімнату не знайдено"}), 404

    data = request.get_json(force=True) or {}
    player_id = data.get('playerId')
    player_name = data.get('playerName', 'Гість Слимакокіт')

    if not player_id:
        return jsonify({"error": "playerId is required"}), 400

    if len(room['players']) >= room.get('maxPlayers', 12) and player_id not in room['players']:
        return jsonify({"error": "Кімната заповнена (макс 12 гравців)"}), 403

    now = time.time()
    room['players'][player_id] = {
        "id": player_id,
        "name": player_name,
        "lastSeen": now
    }

    other_players = [
        {"id": pid, "name": p["name"]}
        for pid, p in room['players'].items()
        if pid != player_id
    ]

    return jsonify({
        "success": True,
        "roomId": room_id,
        "roomName": room['name'],
        "hostId": room['hostId'],
        "cycleRemainingSeconds": max(0, int(room['cycleDurationSeconds'] - ((now - room['createdAt']) % room['cycleDurationSeconds']))),
        "peers": other_players
    })

@app.route('/api/rooms/<room_id>/leave', methods=['POST', 'OPTIONS'])
def leave_room(room_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    data = request.get_json(force=True) or {}
    player_id = data.get('playerId')
    room = rooms.get(room_id)
    if room and player_id in room['players']:
        room['players'].pop(player_id, None)
        signals.pop(player_id, None)
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
    player_id = data.get('playerId')
    room = rooms.get(room_id)
    if room and player_id in room['players']:
        room['players'][player_id]['lastSeen'] = time.time()
        return jsonify({"status": "ok"})
    return jsonify({"status": "not_in_room"}), 404

@app.route('/api/rooms/<room_id>/signal/send', methods=['POST', 'OPTIONS'])
def send_signal(room_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    data = request.get_json(force=True) or {}
    sender_id = data.get('senderId')
    target_id = data.get('targetId')
    signal_type = data.get('type')
    payload = data.get('payload')

    if not sender_id or not target_id or not payload:
        return jsonify({"error": "Invalid signaling payload"}), 400

    if target_id not in signals:
        signals[target_id] = []

    signals[target_id].append({
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

    room = rooms.get(room_id)
    if room and player_id in room['players']:
        room['players'][player_id]['lastSeen'] = time.time()

    pending = signals.pop(player_id, [])
    return jsonify(pending)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
`;
