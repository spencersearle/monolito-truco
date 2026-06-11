import random
import tkinter as tk
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageTk
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required to run this game. Install with: pip install pillow"
    ) from exc


SUITS = ["oros", "copas", "espadas", "bastos"]
SHEET_RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
GAME_RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
SHEET_COLS = 10
SHEET_ROWS = 5
AUTO_CROP = True
CROP_PAD = 2
JOKER_POSITIONS_1B = {(10, 4), (10, 5)}  # (col, row) 1-based

RANK_NAMES = {
    1: "Ancho",
    2: "Dos",
    3: "Tres",
    4: "Cuatro",
    5: "Cinco",
    6: "Seis",
    7: "Siete",
    10: "Sota",
    11: "Caballo",
    12: "Rey",
}

SUIT_NAMES = {
    "espadas": "Espadas",
    "bastos": "Bastos",
    "copas": "Copas",
    "oros": "Oros",
}


def truco_power(card) -> int:
    if card.rank == 1 and card.suit == "espadas":
        return 14
    if card.rank == 1 and card.suit == "bastos":
        return 13
    if card.rank == 7 and card.suit == "espadas":
        return 12
    if card.rank == 7 and card.suit == "oros":
        return 11
    if card.rank == 3:
        return 10
    if card.rank == 2:
        return 9
    if card.rank == 1 and card.suit in ("copas", "oros"):
        return 8
    if card.rank == 12:
        return 7
    if card.rank == 11:
        return 6
    if card.rank == 10:
        return 5
    if card.rank == 7 and card.suit in ("copas", "bastos"):
        return 4
    if card.rank == 6:
        return 3
    if card.rank == 5:
        return 2
    if card.rank == 4:
        return 1
    return 0


def envido_score(cards) -> int:
    suit_groups = {suit: [] for suit in SUITS}
    for card in cards:
        value = card.rank if card.rank <= 7 else 0
        suit_groups[card.suit].append(value)
    best = 0
    for values in suit_groups.values():
        if len(values) >= 2:
            values = sorted(values, reverse=True)
            best = max(best, values[0] + values[1] + 20)
    if best == 0:
        best = max(card.rank if card.rank <= 7 else 0 for card in cards)
    return best


@dataclass(frozen=True)
class Card:
    suit: str
    rank: int

    def label(self) -> str:
        return f"{RANK_NAMES[self.rank]} de {SUIT_NAMES[self.suit]}"


class TrucoGame:
    def __init__(self, root: tk.Tk, sheet_path: Path):
        self.root = root
        self.root.title("Truco Argentino")
        self.sheet_path = sheet_path

        self.bg_color = "#DCEBFA"  # light blue
        self.gold = "#C9A227"
        self.white = "#FFFFFF"
        self.navy = "#1E3557"

        self.canvas = tk.Canvas(root, width=1100, height=720, bg=self.bg_color, highlightthickness=0)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.panel = tk.Frame(root, bg=self.white)
        self.panel.pack(side=tk.RIGHT, fill=tk.Y)

        self.log = tk.Text(self.panel, width=34, height=24, bg=self.white, fg=self.navy, wrap=tk.WORD)
        self.log.pack(padx=12, pady=12)
        self.log.configure(state=tk.DISABLED)

        self.buttons = {}
        self._build_buttons()

        self.card_images = {}
        self.card_back = None
        self._load_cards()

        self.players = [
            {"name": "Vos", "is_human": True, "hand": []},
            {"name": "Rival 1", "is_human": False, "hand": []},
            {"name": "Compañero", "is_human": False, "hand": []},
            {"name": "Rival 2", "is_human": False, "hand": []},
        ]
        self.dealer = 0
        self.mano = 0
        self.current_player = 0
        self.trick_cards = []
        self.trick_results = []
        self.current_trick = 1

        self.pending_call = None
        self.envido_called = False
        self.truco_level = 0
        self.hand_value = 1
        self.scores = [0, 0]
        self.animating = False

        self.start_hand()

    def _build_buttons(self):
        def add_button(label, command):
            btn = tk.Button(
                self.panel,
                text=label,
                command=command,
                bg=self.bg_color,
                fg=self.navy,
                width=16,
                relief=tk.RAISED,
            )
            btn.pack(padx=12, pady=4)
            self.buttons[label] = btn

        add_button("Envido", lambda: self.envido_action("Envido"))
        add_button("Real Envido", lambda: self.envido_action("Real Envido"))
        add_button("Falta Envido", lambda: self.envido_action("Falta Envido"))
        add_button("Truco", lambda: self.truco_action("Truco"))
        add_button("Retruco", lambda: self.truco_action("Retruco"))
        add_button("Vale Cuatro", lambda: self.truco_action("Vale Cuatro"))
        add_button("Quiero", lambda: self.respond_call(True))
        add_button("No quiero", lambda: self.respond_call(False))
        add_button("Nueva Mano", self.start_hand)

    def envido_action(self, name: str):
        if self.pending_call and self.pending_call["type"] == "envido":
            self.raise_envido(name)
        else:
            self.call_envido(name)

    def truco_action(self, name: str):
        if self.pending_call and self.pending_call["type"] == "truco":
            self.raise_truco(name)
        else:
            self.call_truco(name)

    def _load_cards(self):
        sheet = Image.open(self.sheet_path).convert("RGB")
        width, height = sheet.size
        cell_w = width / SHEET_COLS
        cell_h = height / SHEET_ROWS

        bg_color = self._estimate_bg_color(sheet)
        crops = []
        all_cards = [Card(suit, rank) for suit in SUITS for rank in SHEET_RANKS]
        card_index = 0

        joker_positions = {(c - 1, r - 1) for c, r in JOKER_POSITIONS_1B}

        for col in range(SHEET_COLS):
            for row in range(SHEET_ROWS):
                x0 = int(round(col * cell_w))
                y0 = int(round(row * cell_h))
                x1 = int(round((col + 1) * cell_w))
                y1 = int(round((row + 1) * cell_h))
                region = sheet.crop((x0, y0, x1, y1))
                if AUTO_CROP:
                    region = self._auto_crop_region(region, bg_color)
                if (col, row) in joker_positions:
                    crops.append((("joker", f"J{len([c for c in crops if c[0][0]=='joker'])+1}"), region))
                else:
                    if card_index < len(all_cards):
                        card = all_cards[card_index]
                        crops.append(((card.suit, card.rank), region))
                        card_index += 1

        max_w = max(crop.size[0] for _, crop in crops)
        max_h = max(crop.size[1] for _, crop in crops)
        display_w = int(max_w * 2)
        display_h = int(max_h * 2)

        for key, crop in crops:
            crop = crop.resize((display_w, display_h), Image.LANCZOS)
            image = ImageTk.PhotoImage(crop)
            self.card_images[key] = image

        back = Image.new("RGB", (display_w, display_h), self.navy)
        border = Image.new("RGB", (display_w - 8, display_h - 8), self.bg_color)
        back.paste(border, (4, 4))
        self.card_back = ImageTk.PhotoImage(back)

    def _estimate_bg_color(self, image: Image.Image) -> tuple:
        width, height = image.size
        corners = [
            image.getpixel((0, 0)),
            image.getpixel((width - 1, 0)),
            image.getpixel((0, height - 1)),
            image.getpixel((width - 1, height - 1)),
        ]
        return max(set(corners), key=corners.count)

    def _auto_crop_region(self, region: Image.Image, bg_color: tuple) -> Image.Image:
        bg = Image.new("RGB", region.size, bg_color)
        diff = ImageChops.difference(region, bg)
        bbox = diff.getbbox()
        if not bbox:
            return region
        left, top, right, bottom = bbox
        left = max(left - CROP_PAD, 0)
        top = max(top - CROP_PAD, 0)
        right = min(right + CROP_PAD, region.size[0])
        bottom = min(bottom + CROP_PAD, region.size[1])
        return region.crop((left, top, right, bottom))
    def log_message(self, msg: str):
        self.log.configure(state=tk.NORMAL)
        self.log.insert(tk.END, msg + "\n")
        self.log.see(tk.END)
        self.log.configure(state=tk.DISABLED)

    def start_hand(self):
        self.trick_cards = []
        self.trick_results = []
        self.current_trick = 1
        self.trick_leader = self.mano
        self.envido_called = False
        self.pending_call = None
        self.truco_level = 0
        self.hand_value = 1

        deck = [Card(suit, rank) for suit in SUITS for rank in GAME_RANKS]
        random.shuffle(deck)

        for player in self.players:
            player["hand"] = [deck.pop() for _ in range(3)]

        self.dealer = (self.dealer + 1) % 4
        self.mano = (self.dealer - 1) % 4
        self.current_player = self.mano
        self.trick_leader = self.mano

        self.log_message("--- Nueva mano ---")
        self.log_message(f"Mano: {self.players[self.mano]['name']}")

        self.render()
        self.advance_ai_turns()

    def current_team(self, player_index: int) -> int:
        return 0 if player_index in (0, 2) else 1

    def call_envido(self, call_name: str):
        if self.pending_call or self.envido_called:
            return
        if self.current_trick != 1 or len(self.trick_cards) >= 2:
            return
        if not self.can_call_envido(0):
            return
        caller = 0
        self.pending_call = {
            "type": "envido",
            "caller": caller,
            "name": call_name,
            "stack": [call_name],
        }
        self.envido_called = True
        self.log_message(f"Vos cantaste {call_name}.")
        self.render()
        self.root.after(500, self.ai_respond_envido)

    def raise_envido(self, call_name: str):
        if not self.pending_call or self.pending_call["type"] != "envido":
            return
        if call_name in self.pending_call["stack"]:
            return
        self.pending_call["stack"].append(call_name)
        self.pending_call["caller"] = 0
        self.log_message(f"Vos cantaste {call_name}.")
        self.render()
        self.root.after(500, self.ai_respond_envido)

    def call_truco(self, call_name: str):
        if self.pending_call:
            return
        next_level = {"Truco": 1, "Retruco": 2, "Vale Cuatro": 3}[call_name]
        if next_level <= self.truco_level:
            return
        caller = 0
        self.pending_call = {
            "type": "truco",
            "caller": caller,
            "level": next_level,
            "name": call_name,
        }
        self.log_message(f"Vos cantaste {call_name}.")
        self.render()
        self.root.after(500, self.ai_respond_truco)

    def raise_truco(self, call_name: str):
        if not self.pending_call or self.pending_call["type"] != "truco":
            return
        next_level = {"Truco": 1, "Retruco": 2, "Vale Cuatro": 3}[call_name]
        if next_level <= self.pending_call["level"]:
            return
        self.pending_call["caller"] = 0
        self.pending_call["level"] = next_level
        self.pending_call["name"] = call_name
        self.log_message(f"Vos cantaste {call_name}.")
        self.render()
        self.root.after(500, self.ai_respond_truco)

    def respond_call(self, accepted: bool):
        if not self.pending_call:
            return
        if self.pending_call["type"] == "truco":
            self.resolve_truco_response(accepted, responder=0)
        elif self.pending_call["type"] == "envido":
            self.resolve_envido_response(accepted, responder=0)

    def resolve_truco_response(self, accepted: bool, responder: int):
        call = self.pending_call
        caller_team = self.current_team(call["caller"])
        responder_team = self.current_team(responder)
        if accepted:
            self.truco_level = call["level"]
            self.hand_value = [1, 2, 3, 4][self.truco_level]
            self.log_message(f"{self.players[responder]['name']} dijo Quiero.")
        else:
            points = [1, 1, 2, 3][call["level"]]
            self.scores[caller_team] += points
            self.log_message(f"{self.players[responder]['name']} dijo No quiero. {points} puntos.")
            self.pending_call = None
            self.end_hand(caller_team)
            return
        self.pending_call = None
        self.render()
        self.advance_ai_turns()

    def resolve_envido_response(self, accepted: bool, responder: int):
        call = self.pending_call
        caller_team = self.current_team(call["caller"])
        responder_team = self.current_team(responder)

        if accepted:
            points = self.envido_points(call)
            winner_team = self.envido_winner_team()
            self.scores[winner_team] += points
            self.log_message(
                f"{self.players[responder]['name']} dijo Quiero. Envido {points} puntos para {self.team_name(winner_team)}."
            )
        else:
            reject_points = self.envido_reject_points(call)
            self.scores[caller_team] += reject_points
            self.log_message(
                f"{self.players[responder]['name']} dijo No quiero. {reject_points} puntos para {self.team_name(caller_team)}."
            )
        self.pending_call = None
        self.render()
        self.advance_ai_turns()

    def envido_points(self, call) -> int:
        stack = call["stack"]
        last = stack[-1]
        if last == "Envido":
            return 2
        if last == "Real Envido":
            return 3
        if last == "Falta Envido":
            return 30 - max(self.scores)
        return 2

    def envido_reject_points(self, call) -> int:
        stack = call["stack"]
        if len(stack) == 1:
            return 1
        prev = stack[-2]
        if prev == "Envido":
            return 2
        if prev == "Real Envido":
            return 3
        return 2

    def envido_winner_team(self) -> int:
        team_scores = [0, 0]
        for idx, player in enumerate(self.players):
            score = envido_score(player["hand"])
            team_scores[self.current_team(idx)] = max(team_scores[self.current_team(idx)], score)
        if team_scores[0] > team_scores[1]:
            return 0
        if team_scores[1] > team_scores[0]:
            return 1
        return self.current_team(self.mano)

    def ai_respond_envido(self):
        if not self.pending_call or self.pending_call["type"] != "envido":
            return
        responder = self.next_opponent_player(self.pending_call["caller"])
        score = envido_score(self.players[responder]["hand"])
        if score >= 28:
            accepted = True
        else:
            accepted = score >= 24 and random.random() > 0.3
        self.resolve_envido_response(accepted, responder)

    def ai_respond_truco(self):
        if not self.pending_call or self.pending_call["type"] != "truco":
            return
        responder = self.next_opponent_player(self.pending_call["caller"])
        strength = max(truco_power(card) for card in self.players[responder]["hand"])
        accepted = strength >= 7 or random.random() > 0.4
        self.resolve_truco_response(accepted, responder)

    def next_opponent_player(self, player_index: int) -> int:
        idx = (player_index + 1) % 4
        while self.current_team(idx) == self.current_team(player_index):
            idx = (idx + 1) % 4
        return idx

    def advance_ai_turns(self):
        if self.pending_call:
            return
        if self.current_player == 0:
            self.render()
            return
        if self.ai_maybe_call_envido_or_truco():
            return
        self.root.after(500, self.ai_play_card)

    def ai_play_card(self):
        if self.pending_call:
            return
        player = self.players[self.current_player]
        if not player["hand"]:
            return
        card = max(player["hand"], key=truco_power)
        player["hand"].remove(card)
        self.play_card(self.current_player, card)

    def ai_maybe_call_envido_or_truco(self) -> bool:
        if self.pending_call:
            return False

        player = self.players[self.current_player]
        if not player["hand"]:
            return False

        if self.can_call_envido(self.current_player):
            score = envido_score(player["hand"])
            if score >= 28 or (score >= 26 and random.random() < 0.35):
                self.pending_call = {
                    "type": "envido",
                    "caller": self.current_player,
                    "name": "Envido",
                    "stack": ["Envido"],
                }
                self.envido_called = True
                self.log_message(f"{player['name']} cantó Envido.")
                self.render()
                return True

        if self.truco_level < 3 and self.current_trick == 1:
            strength = max(truco_power(card) for card in player["hand"])
            if strength >= 11 and random.random() < 0.5:
                call_name = ["Truco", "Retruco", "Vale Cuatro"][self.truco_level]
                next_level = self.truco_level + 1
                self.pending_call = {
                    "type": "truco",
                    "caller": self.current_player,
                    "level": next_level,
                    "name": call_name,
                }
                self.log_message(f"{player['name']} cantó {call_name}.")
                self.render()
                return True
        return False

    def play_card(self, player_index: int, card: Card):
        self.log_message(f"{self.players[player_index]['name']} jugó {card.label()}.")
        self.render()
        self.animate_card_play(player_index, card)

    def animate_card_play(self, player_index: int, card: Card):
        if self.animating:
            self.finish_play_card(player_index, card)
            return
        self.animating = True
        start_x, start_y = self.player_anchor(player_index)
        target_x, target_y = self.trick_target(player_index)
        img = self.card_images[(card.suit, card.rank)]
        item = self.canvas.create_image(start_x, start_y, image=img)
        steps = 12
        dx = (target_x - start_x) / steps
        dy = (target_y - start_y) / steps

        def step(n=0):
            if n >= steps:
                self.canvas.delete(item)
                self.animating = False
                self.finish_play_card(player_index, card)
                return
            self.canvas.move(item, dx, dy)
            self.root.after(20, step, n + 1)

        step()

    def finish_play_card(self, player_index: int, card: Card):
        self.trick_cards.append((player_index, card))
        self.render()

        if len(self.trick_cards) == 4:
            self.resolve_trick()
        else:
            self.current_player = (self.current_player + 1) % 4
            self.advance_ai_turns()

    def resolve_trick(self):
        powers = [(player, truco_power(card)) for player, card in self.trick_cards]
        highest = max(power for _, power in powers)
        winners = [player for player, power in powers if power == highest]
        teams = {self.current_team(player) for player in winners}
        if len(teams) > 1:
            self.trick_results.append(None)
            self.log_message("Parda en la baza.")
            self.current_player = self.trick_leader
        else:
            team = teams.pop()
            self.trick_results.append(team)
            winner_player = next(
                player for player, _ in self.trick_cards if player in winners
            )
            self.log_message(f"Baza para {self.team_name(team)}.")
            self.current_player = winner_player

        self.trick_cards = []
        self.current_trick += 1
        self.trick_leader = self.current_player

        hand_winner = self.check_hand_winner()
        if hand_winner is not None:
            self.scores[hand_winner] += self.hand_value
            self.log_message(f"Mano para {self.team_name(hand_winner)}. {self.hand_value} puntos.")
            self.end_hand(hand_winner)
        else:
            self.render()
            self.advance_ai_turns()

    def check_hand_winner(self):
        wins_team0 = self.trick_results.count(0)
        wins_team1 = self.trick_results.count(1)
        if wins_team0 >= 2:
            return 0
        if wins_team1 >= 2:
            return 1
        if len(self.trick_results) == 2:
            if self.trick_results[0] is None:
                if self.trick_results[1] is None:
                    return self.current_team(self.mano)
                return self.trick_results[1]
            if self.trick_results[1] is None:
                return self.trick_results[0]
        if len(self.trick_results) == 3:
            if wins_team0 > wins_team1:
                return 0
            if wins_team1 > wins_team0:
                return 1
            return self.current_team(self.mano)
        return None

    def end_hand(self, winner_team: int):
        if self.scores[winner_team] >= 30:
            self.log_message(f"¡{self.team_name(winner_team)} ganaron la partida!")
        self.render()

    def team_name(self, team_index: int) -> str:
        return "Ustedes" if team_index == 0 else "Rivales"

    def render(self):
        self.canvas.delete("all")
        self.canvas.create_rectangle(20, 20, 820, 700, fill=self.bg_color, outline=self.gold, width=4)
        self.canvas.create_rectangle(860, 20, 1080, 700, fill=self.white, outline=self.gold, width=2)

        self.canvas.create_text(120, 40, text="Truco Argentino", fill=self.navy, font=("Helvetica", 20, "bold"))
        self.canvas.create_text(120, 70, text="Azul, Oro y Blanco", fill=self.gold, font=("Helvetica", 12, "italic"))

        self.draw_scores()
        self.draw_hands()
        self.draw_trick()

        self.update_buttons()

    def draw_scores(self):
        self.canvas.create_text(
            620,
            60,
            text=f"Ustedes: {self.scores[0]}  |  Rivales: {self.scores[1]}",
            fill=self.navy,
            font=("Helvetica", 14, "bold"),
        )
        self.canvas.create_text(
            620,
            90,
            text=f"Valor de la mano: {self.hand_value}",
            fill=self.navy,
            font=("Helvetica", 12),
        )

    def draw_hands(self):
        for idx, player in enumerate(self.players):
            x, y = self.player_anchor(idx)
            self.canvas.create_text(x, y - 40, text=player["name"], fill=self.navy, font=("Helvetica", 12, "bold"))
            if player["is_human"]:
                for i, card in enumerate(player["hand"]):
                    img = self.card_images[(card.suit, card.rank)]
                    img_id = self.canvas.create_image(x + i * 90 - 90, y, image=img)
                    self.canvas.tag_bind(img_id, "<Button-1>", lambda e, c=card: self.on_card_click(c))
            else:
                for i in range(len(player["hand"])):
                    self.canvas.create_image(x + i * 26 - 26, y, image=self.card_back)

    def draw_trick(self):
        for player, card in self.trick_cards:
            x, y = self.trick_target(player)
            img = self.card_images[(card.suit, card.rank)]
            self.canvas.create_image(x, y, image=img)

    def update_buttons(self):
        for btn in self.buttons.values():
            btn.configure(state=tk.DISABLED)

        if self.pending_call:
            if self.pending_call["caller"] != 0:
                self.buttons["Quiero"].configure(state=tk.NORMAL)
                self.buttons["No quiero"].configure(state=tk.NORMAL)
                if self.pending_call["type"] == "truco":
                    level = self.pending_call["level"]
                    if level == 1:
                        self.buttons["Retruco"].configure(state=tk.NORMAL)
                    elif level == 2:
                        self.buttons["Vale Cuatro"].configure(state=tk.NORMAL)
                if self.pending_call["type"] == "envido":
                    stack = self.pending_call["stack"]
                    if "Real Envido" not in stack:
                        self.buttons["Real Envido"].configure(state=tk.NORMAL)
                    if "Falta Envido" not in stack:
                        self.buttons["Falta Envido"].configure(state=tk.NORMAL)
            return

        if self.current_player == 0:
            if self.can_call_envido(0):
                self.buttons["Envido"].configure(state=tk.NORMAL)
                self.buttons["Real Envido"].configure(state=tk.NORMAL)
                self.buttons["Falta Envido"].configure(state=tk.NORMAL)

            if self.truco_level < 1:
                self.buttons["Truco"].configure(state=tk.NORMAL)
            elif self.truco_level == 1:
                self.buttons["Retruco"].configure(state=tk.NORMAL)
            elif self.truco_level == 2:
                self.buttons["Vale Cuatro"].configure(state=tk.NORMAL)

        self.buttons["Nueva Mano"].configure(state=tk.NORMAL)

    def on_card_click(self, card: Card):
        if self.animating:
            return
        if self.current_player != 0:
            return
        if card not in self.players[0]["hand"]:
            return
        if self.pending_call:
            return
        self.players[0]["hand"].remove(card)
        self.play_card(0, card)

    def can_call_envido(self, player_index: int) -> bool:
        if self.pending_call or self.envido_called:
            return False
        if self.current_trick != 1 or len(self.trick_cards) >= 2:
            return False
        last_two = {(self.mano + 2) % 4, (self.mano + 3) % 4}
        return player_index in last_two

    def player_anchor(self, player_index: int) -> tuple:
        positions = {
            0: (420, 560),
            1: (680, 300),
            2: (420, 80),
            3: (160, 300),
        }
        return positions[player_index]

    def trick_target(self, player_index: int) -> tuple:
        center_x, center_y = 420, 320
        offsets = {
            0: (0, 120),
            1: (140, 0),
            2: (0, -120),
            3: (-140, 0),
        }
        dx, dy = offsets[player_index]
        return center_x + dx, center_y + dy


if __name__ == "__main__":
    root = tk.Tk()
    sheet = Path(__file__).with_name("trucoCardSheet.jpg")
    if not sheet.exists():
        raise SystemExit("trucoCardSheet.jpg not found in the project folder.")
    game = TrucoGame(root, sheet)
    root.mainloop()
