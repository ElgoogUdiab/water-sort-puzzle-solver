import json
import sys
from typing import Union

from game import Game, GameNode, GameNodeType, GameMode
from solver_runner import solve_and_print
from solver import SearchState, solve
from solution_postprocess import solution_postprocess, show_graph

def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % rgb


def hex_to_rgb(color_str: str) -> tuple[int, int, int]:
    color_str = color_str.lstrip('#')
    if len(color_str) != 6:
        raise ValueError(f"Invalid hex color: {color_str}")
    return tuple(int(color_str[i:i+2], 16) for i in (0, 2, 4))


def node_from_json(node_data: dict) -> GameNode:
    node_type = GameNodeType(node_data["nodeType"])
    pos = tuple(node_data["originalPos"])
    color = None
    if node_type == GameNodeType.KNOWN:
        color_str = node_data.get("color")
        if color_str is None:
            raise ValueError("Known node missing color")
        color = hex_to_rgb(color_str)
    return GameNode(node_type, pos, color)


def game_from_json(data: Union[str, dict]) -> Game:
    if isinstance(data, str):
        data = json.loads(data)
    groups = []
    for g in data["groups"]:
        groups.append([node_from_json(n) for n in g])
    undo = data.get("undoCount", 5)
    # Optional parameters
    game_mode_raw = data.get("gameMode", data.get("mode"))
    game_mode = GameMode.NORMAL
    if game_mode_raw is not None:
        # Accept enum name (e.g., "NORMAL") or numeric value (0/1/2)
        try:
            if isinstance(game_mode_raw, str):
                # Try by name first; fall back to int string
                try:
                    game_mode = GameMode[game_mode_raw]
                except KeyError:
                    game_mode = GameMode(int(game_mode_raw))
            else:
                game_mode = GameMode(int(game_mode_raw))
        except Exception:
            # Fall back silently to NORMAL on invalid value
            game_mode = GameMode.NORMAL

    group_capacity = data.get("groupCapacity", data.get("rows"))
    try:
        group_capacity = int(group_capacity) if group_capacity is not None else None
    except Exception:
        group_capacity = None

    return Game(groups, undo_count=undo, group_capacity=group_capacity, game_mode=game_mode)


def game_to_json(game: Game) -> dict:
    data = game.to_json()
    for group in data["groups"]:
        for node in group:
            color = node.get("color")
            if color is not None:
                node["color"] = rgb_to_hex(tuple(color))
    # Extend with optional parameters for round-trip fidelity
    data["gameMode"] = game.game_mode.name
    data["groupCapacity"] = game.group_capacity
    # Add compatibility fields some generators use
    data["mode"] = game.game_mode.value
    data["rows"] = game.group_capacity
    data["cols"] = len(game.groups)
    try:
        # Number of distinct known colors present
        colors = {tuple(n.color) for g in game.groups for n in g if n.node_type.value == '.' and n.color is not None}
        data["colors"] = len(colors)
    except Exception:
        pass
    return data


def read_json_file(path: str) -> Game:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return game_from_json(data)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: json_identifier.py <puzzle.json>")
        sys.exit(1)
    game = read_json_file(sys.argv[1])
    solved_game_search_state = solve_and_print(game)
    # solved_game_search_state = solve(SearchState(game, []))
    # g = solution_postprocess(solved_game_search_state, game)
    # build_solution_summaries(solved_game_search_state, game)
    # show_graph(g)
