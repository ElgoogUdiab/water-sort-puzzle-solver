from game import Game, visualize_game
from solver import SearchState, solve


def solve_and_print(game: Game) -> None:
    visualize_game(game).save("debug/input.png")
    solved_state = solve(SearchState(game, []))
    if solved_state.state_game.is_winning_state:
        print(*solved_state.path, sep="\n")
    else:
        print("Follow the steps, update the blocks, and run again:")
        for step in solved_state.path:
            new_game = game.apply_op(step)
            print(step)
            if new_game.unknown_revealed_count > game.unknown_revealed_count:
                revealed_set = set(n[0].original_pos for n in new_game.unknown_revealed_nodes) - \
                               set(n[0].original_pos for n in game.unknown_revealed_nodes)
                assert len(revealed_set) == 1
                revealed = revealed_set.pop()
                print(f"Update node at column {revealed[0] + 1}, row {revealed[1] + 1}")
            game = new_game
        visualize_game(game).save("final_state.png")
