from typing import Optional, Self
from game import Game, GameNode, GameNodeType, GameOperation, GameMode
from functools import total_ordering
import heapq

DEBUG = False

@total_ordering
class SearchState:
    instance_count = 0
    @classmethod
    def assign_new_instance_id(cls):
        result = cls.instance_count
        cls.instance_count += 1
        return result
    
    def __init__(self, state, path):
        self.state_game: Game = state
        self.path: list[GameOperation] = path
        self.instance_id = self.assign_new_instance_id()
    
    @property
    def value(self) -> tuple[int, ...]:
        """Priority tuple for the search queue.

        - Unknown-aware mode: prefer states that revealed more unknowns, can
          reveal in the next move, just revealed something, and with shorter
          paths; then fall back to structural heuristics.
        - Normal mode: fall back to existing structural heuristic.
        """
        if self.state_game._contain_unknown:
            unknown_revealed = self.state_game.unknown_revealed_count
            # More immediate reveal options is better
            revealable_next = getattr(self.state_game, 'revealable_in_one', 0)
            just_revealed_penalty = 0 if self.state_game.revealed_new else 1
            return (
                -unknown_revealed,
                -revealable_next,
                just_revealed_penalty,
                len(self.path),
                *self.state_game.heuristic,
                self.instance_id,
            )
        return (len(self.path), *self.state_game.heuristic, self.instance_id)
    
    def __eq__(self, other: Self):
        return self.value == other.value
    
    def __lt__(self, other: Self):
        return self.value < other.value

def is_a_more_valueable_than_b(a: SearchState, b: SearchState):
    if (a_count := a.state_game.unknown_revealed_count) > (b_count := b.state_game.unknown_revealed_count):
        return True
    if a_count < b_count:
        return False
    # Prefer states that can reveal in the very next move
    a_next = getattr(a.state_game, 'revealable_in_one', 0)
    b_next = getattr(b.state_game, 'revealable_in_one', 0)
    if a_next != b_next:
        return a_next > b_next
    # Shorter path is better
    if len(a.path) != len(b.path):
        return len(a.path) < len(b.path)
    # Fallback to fewer segments
    return a.state_game.segments < b.state_game.segments

def solve_no_unknown(start_state: SearchState) -> SearchState:
    """Solve when the starting game contains no unknowns."""
    SearchStateQueue = [start_state]
    discovered_dict: dict[frozenset[frozenset[GameNode]], tuple[Game, int]] = {}

    searched_state_count = 0
    best_solution_length = float('inf')  # Track best solution found
    
    while SearchStateQueue:
        current_search_state = heapq.heappop(SearchStateQueue)
        state_game = current_search_state.state_game

        # Prune paths that are already longer than best solution
        if len(current_search_state.path) >= best_solution_length:
            continue

        discovered = discovered_dict.get(state_game._to_frozensets, None)
        if discovered is not None:
            if discovered[1] >= state_game.undo_count:
                continue

        searched_state_count += 1
        if DEBUG:
            print(f"{state_game.segments=}")
            print(f"{searched_state_count=}")

        if state_game.is_winning_state:
            best_solution_length = len(current_search_state.path)
            return current_search_state

        path = current_search_state.path
        discovered_dict[state_game._to_frozensets] = (state_game, state_game.undo_count)
        ops = state_game.ops()
        if DEBUG:
            print(f"{ops=}")
        for op in ops:
            new_path = path + [op]
            # Only add to queue if path length is promising
            if len(new_path) < best_solution_length:
                heapq.heappush(SearchStateQueue, SearchState(state_game.apply_op(op), new_path))

    return start_state


def solve_with_unknown(start_state: SearchState, depth: int = 8) -> SearchState:
    """Solve when the starting game contains unknowns, using iterative deepening with candidate states."""
    SearchStateQueue = [start_state]
    discovered_dict: dict[frozenset[frozenset[GameNode]], tuple[Game, int]] = {}
    candidate_state: Optional[SearchState] = None
    candidate_search_state_count: int | float = float('inf')

    searched_state_count = 0
    while SearchStateQueue:
        current_search_state = heapq.heappop(SearchStateQueue)
        state_game = current_search_state.state_game

        discovered = discovered_dict.get(state_game._to_frozensets, None)
        if discovered is not None:
            if discovered[1] >= state_game.undo_count:
                continue

        searched_state_count += 1
        if DEBUG:
            print(f"{state_game.segments=}")
            # visualize_game(state_game).save(f"debug/search_{depth}_{searched_state_count:06d}.png")
            print(f"{searched_state_count=}")

        if depth == 0:
            if candidate_state is None:
                candidate_state = current_search_state
            else:
                # Choose the state with fewer segments as the better candidate
                if current_search_state.state_game.segments < candidate_state.state_game.segments:
                    candidate_state = current_search_state
        else:
            if state_game.is_meaningful_state:
                for _ in range(1):
                    # Whether to set a candidate state
                    if candidate_state is None:
                        if searched_state_count > 1:
                            if DEBUG:
                                print(f"Setting first candidate state at search state {searched_state_count}")
                            candidate_state = current_search_state
                            candidate_search_state_count = searched_state_count
                        break

                    if is_a_more_valueable_than_b(current_search_state, candidate_state):
                        if DEBUG:
                            print(f"Updating candidate state to state {searched_state_count} ({current_search_state.state_game.unknown_revealed_count}, {len(current_search_state.path)} -> {candidate_state.state_game.unknown_revealed_count}, {len(candidate_state.path)})")
                        candidate_state = current_search_state
                        candidate_search_state_count = searched_state_count

            if searched_state_count > 2 * candidate_search_state_count:
                if DEBUG:
                    print(f"Too long since last candidate state update. Start search from last candidate state")
                return solve_with_unknown(candidate_state, depth=depth-1)

        path = current_search_state.path

        discovered_dict[state_game._to_frozensets] = (state_game, state_game.undo_count)
        ops = state_game.ops()
        if DEBUG:
            print(f"{ops=}")
        for op in ops:
            heapq.heappush(SearchStateQueue, SearchState(state_game.apply_op(op), path + [op]))

    if candidate_state is not None:
        return candidate_state
    return start_state


def solve(start_state: SearchState, depth: int = 8) -> SearchState:
    """Mux: dispatch to specialized solvers based on presence of unknowns."""
    if not start_state.state_game._contain_unknown:
        solution = solve_no_unknown(start_state)
    else:
        solution = solve_with_unknown(start_state, depth)
    
    # Apply postprocessing for NORMAL and NO_COMBO game modes with no unknowns (reorder steps)
    if (start_state.state_game.game_mode in {GameMode.NORMAL, GameMode.NO_COMBO} and 
        not start_state.state_game._contain_unknown):
        from solution_postprocess import solution_postprocess, priority_topo_sort, solution_to_graph
        from game import OperationStepForward
        
        # Generate optimized step order
        G = solution_to_graph(solution)
        ordered_nodes = list(priority_topo_sort(G, start_state.state_game))
        
        # Rebuild the solution path with optimized order
        optimized_path = []
        for node in ordered_nodes:
            node_data = G.nodes[node]
            op = OperationStepForward(node_data['op_src'], node_data['op_dst'])
            optimized_path.append(op)
        
        # Create new SearchState with optimized path
        solution = SearchState(solution.state_game, optimized_path)
    
    return solution
