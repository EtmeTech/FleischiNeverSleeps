import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import time
import uuid
from urllib.parse import urlparse

PORT = 8080
PUBLIC_DIR = "public"

LOBBIES_LOCK = threading.Lock()
LOBBIES = {}  # lobby_id -> dict

def default_world_state():
    return {
        "drawerOpen": False,
        "keyPickedUp": False,
        "keyInserted": False,
        "doorUnlocked": False,
        "terminalInput": "",
        "elevatorClosed": False,
        "elevatorSolved": False,
        "fleischDoors": [],
        "schoolStairDoors": [],
        "boilerValves": [],
        "libraryLevers": [],
        "monstersStage": "",
        "monsters": []
    }

def cleanup_stale_lobbies():
    now = time.time()
    stale_lobbies = []
    for lid, lobby in list(LOBBIES.items()):
        players = lobby.get("players", {})
        # 90 Sekunden (1:30 Min) Timeout wie gewünscht!
        stale_pids = [pid for pid, p in players.items() if now - p.get("lastSeen", 0) > 90.0]
        for pid in stale_pids:
            players.pop(pid, None)
        if not players and (now - lobby.get("createdAt", now) > 30.0):
            stale_lobbies.append(lid)
        elif lobby.get("hostId") not in players and players:
            lobby["hostId"] = next(iter(players.keys()))
    for lid in stale_lobbies:
        LOBBIES.pop(lid, None)

class ThreadingNoCacheServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

class GameHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def log_message(self, format, *args):
        if "/api/mp/" in (self.path or ""):
            return
        super().log_message(format, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def _send_json(self, data, status=200):
        raw = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except BrokenPipeError:
            pass

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/mp/lobbies":
            with LOBBIES_LOCK:
                cleanup_stale_lobbies()
                result = []
                for lid, lob in LOBBIES.items():
                    result.append({
                        "id": lid,
                        "name": lob["name"],
                        "difficulty": lob["difficulty"],
                        "hasPassword": bool(lob.get("password")),
                        "stage": lob.get("stage", "act1"),
                        "hostName": lob.get("hostName", "Host"),
                        "playerCount": len(lob.get("players", {})),
                        "maxPlayers": lob.get("maxPlayers", 8)
                    })
            return self._send_json({"ok": True, "lobbies": result})
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        body = self._read_json()

        if parsed.path == "/api/mp/create":
            lobby_name = str(body.get("lobbyName") or "Lobby").strip()[:24] or "Lobby"
            difficulty = str(body.get("difficulty") or "praeti").strip().lower()
            if difficulty not in ("mats", "praeti", "milan"):
                difficulty = "praeti"
            password = str(body.get("password") or "")
            stage = str(body.get("stage") or "act1").strip()
            player_id = str(body.get("playerId") or uuid.uuid4().hex[:10])
            player_name = str(body.get("playerName") or "Spieler").strip()[:16] or "Spieler"
            player_color = str(body.get("color") or "#00ff66")

            lid = uuid.uuid4().hex[:8]
            now = time.time()
            with LOBBIES_LOCK:
                cleanup_stale_lobbies()
                LOBBIES[lid] = {
                    "id": lid,
                    "name": lobby_name,
                    "difficulty": difficulty,
                    "password": password,
                    "stage": stage,
                    "hostId": player_id,
                    "hostName": player_name,
                    "maxPlayers": 8,
                    "createdAt": now,
                    "worldState": default_world_state(),
                    "events": [],
                    "players": {
                        player_id: {
                            "id": player_id,
                            "name": player_name,
                            "color": player_color,
                            "x": 0.0,
                            "y": 1.6,
                            "z": 2.5,
                            "yaw": 0.0,
                            "pitch": 0.0,
                            "crouch": False,
                            "moving": False,
                            "sprinting": False,
                            "atLaptop": False,
                            "lockerId": -1,
                            "grabbed": False,
                            "grabTimer": 0.0,
                            "stage": stage,
                            "lastSeen": now
                        }
                    }
                }
            return self._send_json({
                "ok": True,
                "lobby": {
                    "id": lid,
                    "name": lobby_name,
                    "difficulty": difficulty,
                    "stage": stage,
                    "hostId": player_id,
                    "worldState": LOBBIES[lid]["worldState"]
                }
            })

        if parsed.path == "/api/mp/join":
            lid = str(body.get("lobbyId") or "")
            password = str(body.get("password") or "")
            player_id = str(body.get("playerId") or uuid.uuid4().hex[:10])
            player_name = str(body.get("playerName") or "Spieler").strip()[:16] or "Spieler"
            player_color = str(body.get("color") or "#00e5ff")

            with LOBBIES_LOCK:
                cleanup_stale_lobbies()
                lob = LOBBIES.get(lid)
                if not lob:
                    return self._send_json({"ok": False, "error": "Lobby nicht gefunden."}, 404)
                if lob.get("password") and lob["password"] != password:
                    return self._send_json({"ok": False, "error": "Falsches Passwort!"}, 403)
                now = time.time()
                lob["players"][player_id] = {
                    "id": player_id,
                    "name": player_name,
                    "color": player_color,
                    "x": 0.0,
                    "y": 1.6,
                    "z": 2.5,
                    "yaw": 0.0,
                    "pitch": 0.0,
                    "crouch": False,
                    "moving": False,
                    "sprinting": False,
                    "atLaptop": False,
                    "lockerId": -1,
                    "grabbed": False,
                    "grabTimer": 0.0,
                    "stage": lob.get("stage", "act1"),
                    "lastSeen": now
                }
                return self._send_json({
                    "ok": True,
                    "lobby": {
                        "id": lid,
                        "name": lob["name"],
                        "difficulty": lob["difficulty"],
                        "stage": lob.get("stage", "act1"),
                        "hostId": lob.get("hostId"),
                        "worldState": lob["worldState"]
                    }
                })

        if parsed.path == "/api/mp/leave":
            lid = str(body.get("lobbyId") or "")
            player_id = str(body.get("playerId") or "")
            with LOBBIES_LOCK:
                lob = LOBBIES.get(lid)
                if lob and player_id in lob.get("players", {}):
                    lob["players"].pop(player_id, None)
                cleanup_stale_lobbies()
            return self._send_json({"ok": True})

        if parsed.path == "/api/mp/sync":
            lid = str(body.get("lobbyId") or "")
            player_id = str(body.get("playerId") or "")
            with LOBBIES_LOCK:
                cleanup_stale_lobbies()
                lob = LOBBIES.get(lid)
                if not lob:
                    return self._send_json({"ok": False, "error": "Lobby geschlossen."}, 404)
                now = time.time()
                p = lob["players"].get(player_id)
                if not p:
                    p = {"id": player_id}
                    lob["players"][player_id] = p

                p["name"] = str(body.get("playerName") or p.get("name") or "Spieler")[:16]
                p["color"] = str(body.get("color") or p.get("color") or "#00ff66")
                p["x"] = float(body.get("x", 0.0))
                p["y"] = float(body.get("y", 1.6))
                p["z"] = float(body.get("z", 2.5))
                p["yaw"] = float(body.get("yaw", 0.0))
                p["pitch"] = float(body.get("pitch", 0.0))
                p["crouch"] = bool(body.get("crouch", False))
                p["moving"] = bool(body.get("moving", False))
                p["sprinting"] = bool(body.get("sprinting", False))
                p["atLaptop"] = bool(body.get("atLaptop", False))
                p["lockerId"] = int(body.get("lockerId", -1))
                p["grabbed"] = bool(body.get("grabbed", False))
                p["grabTimer"] = float(body.get("grabTimer", 0.0))
                p["lastSeen"] = now

                ws = lob.setdefault("worldState", default_world_state())

                client_stage = str(body.get("stage") or "")
                stage_order = ["act1", "fleischrooms", "school", "labyrinth", "boiler", "library", "gym"]
                if client_stage in stage_order:
                    p["stage"] = client_stage
                    cur_stage = lob.get("stage", "act1")
                    if cur_stage in stage_order and stage_order.index(client_stage) > stage_order.index(cur_stage):
                        lob["stage"] = client_stage

                # Falls Host (oder einziger Spieler im aktuellen Level) Monster-Daten sendet -> speichern
                host_id = lob.get("hostId")
                monsters_payload = body.get("monsters")
                if isinstance(monsters_payload, list) and client_stage != "school":
                    # Host hat Priorität, oder falls Host in anderem Stage ist
                    host_player = lob["players"].get(host_id)
                    is_authority = (player_id == host_id) or (not host_player) or (host_player.get("stage") != client_stage)
                    if is_authority:
                        ws["monstersStage"] = client_stage
                        ws["monsters"] = monsters_payload[:20]

                incoming_events = body.get("events") or []
                for ev in incoming_events:
                    if not isinstance(ev, dict) or not ev.get("type"):
                        continue
                    etype = str(ev.get("type"))
                    if etype == "drawer_open":
                        ws["drawerOpen"] = True
                    elif etype == "key_pickup":
                        ws["drawerOpen"] = True
                        ws["keyPickedUp"] = True
                    elif etype == "key_insert":
                        ws["keyInserted"] = True
                    elif etype == "terminal_input":
                        ws["terminalInput"] = str(ev.get("value") or "")[:34]
                    elif etype == "door_unlock":
                        ws["doorUnlocked"] = True
                    elif etype == "elevator_close":
                        ws["elevatorClosed"] = True
                    elif etype == "elevator_solve":
                        ws["elevatorSolved"] = True
                    elif etype == "fleisch_door":
                        key_str = str(ev.get("doorKey") or "")
                        if key_str and key_str not in ws["fleischDoors"]:
                            ws["fleischDoors"].append(key_str)
                    elif etype == "school_stair_door":
                        lbl = str(ev.get("label") or "")
                        if lbl and lbl not in ws["schoolStairDoors"]:
                            ws["schoolStairDoors"].append(lbl)
                    elif etype == "boiler_valve":
                        v_idx = int(ev.get("index", -1))
                        if v_idx >= 0 and v_idx not in ws["boilerValves"]:
                            ws["boilerValves"].append(v_idx)
                    elif etype == "library_lever":
                        l_idx = int(ev.get("index", -1))
                        if l_idx >= 0 and l_idx not in ws["libraryLevers"]:
                            ws["libraryLevers"].append(l_idx)

                    ev_obj = dict(ev)
                    ev_obj["id"] = uuid.uuid4().hex[:10]
                    ev_obj["senderId"] = player_id
                    ev_obj["ts"] = now
                    lob["events"].append(ev_obj)

                lob["events"] = [e for e in lob["events"] if now - e["ts"] < 15.0][-50:]

                last_event_ts = float(body.get("lastEventTs", 0.0))
                recent_events = [
                    e for e in lob.get("events", [])
                    if e["ts"] > last_event_ts and e["senderId"] != player_id
                ]

                others = [
                    val for key, val in lob["players"].items()
                    if key != player_id and (now - val.get("lastSeen", 0) <= 90.0)
                ]
                return self._send_json({
                    "ok": True,
                    "lobby": {
                        "id": lid,
                        "name": lob["name"],
                        "difficulty": lob["difficulty"],
                        "stage": lob.get("stage", "act1"),
                        "hostId": lob.get("hostId"),
                        "playerCount": len(lob["players"]),
                        "worldState": ws
                    },
                    "players": others,
                    "events": recent_events,
                    "serverTime": now
                })

        return self._send_json({"ok": False, "error": "Unbekannter Endpunkt"}, 404)

def start_server():
    with ThreadingNoCacheServer(("0.0.0.0", PORT), GameHTTPHandler) as httpd:
        print(f"[FleischiNeverSleeps] Server + Multiplayer aktiv auf http://0.0.0.0:{PORT}")
        httpd.serve_forever()

def launch_app():
    bust = int(time.time())
    url = f"http://127.0.0.1:{PORT}/index.html?v={bust}"
    if sys.platform.startswith("linux"):
        subprocess.run([
            "chromium-browser",
            f"--app={url}",
            "--start-fullscreen",
            "--no-first-run",
            "--disable-pinch",
            "--disk-cache-dir=/dev/null",
            "--disk-cache-size=1"
        ])
    elif sys.platform == "win32":
        subprocess.run(f'start msedge --app="{url}" --start-fullscreen', shell=True)

if __name__ == "__main__":
    threading.Thread(target=start_server, daemon=True).start()
    launch_app()
