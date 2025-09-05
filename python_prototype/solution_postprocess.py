from game import Game, GameOperation, OperationStepForward, GameNode, GameNodeType
from solver import SearchState
from typing import TypeGuard, List, Tuple
import networkx as nx

import matplotlib.pyplot as plt
from networkx.drawing.nx_pydot import graphviz_layout

def is_ops_all_step_forward(xs: list[GameOperation]) -> TypeGuard[list[OperationStepForward]]:
    return all(isinstance(x, OperationStepForward) for x in xs)

def solution_to_graph(input_solution: SearchState) -> nx.DiGraph:
    assert is_ops_all_step_forward(input_solution.path)

    # Reconstruct intermediate game states in order from start to end
    states = []
    game_ptr = input_solution.state_game
    while game_ptr is not None:
        states.append(game_ptr)
        game_ptr = game_ptr.previous_state
    states.reverse()
    assert len(states) == len(input_solution.path) + 1

    G = nx.DiGraph()
    for i, op in enumerate(input_solution.path):
        src_group = states[i].groups[op.src]
        op_item = src_group[-1]
        next_src_group = states[i + 1].groups[op.src]
        op_revealing_color = (
            next_src_group[-1].color if len(next_src_group) > 0 else None
        )
        G.add_node(
            i,
            label=f"{op}",
            op_src=op.src,
            op_dst=op.dst,
            op_color=op_item.color,
            op_revealing_color=op_revealing_color,
        )

    G.add_node("s", label="s")
    G.add_node("t", label="t")

    last_op_on_group_index = [-1] * len(input_solution.state_game.groups)

    for i, op in enumerate(input_solution.path):
        if (es_1 := last_op_on_group_index[op.src]) != -1:
            G.add_edge(es_1, i)
        if (es_2 := last_op_on_group_index[op.dst]) != -1:
            G.add_edge(es_2, i)
        if es_1 == es_2 == -1:
            G.add_edge("s", i)
        last_op_on_group_index[op.src] = last_op_on_group_index[op.dst] = i

    src_nodes = set()
    for src, _ in G.edges:
        src_nodes.add(src)

    for i in range(len(input_solution.path)):
        if i not in src_nodes:
            G.add_edge(i, "t")

    TR = nx.transitive_reduction(G)
    TR.add_nodes_from(G.nodes(data=True))

    return TR

def solution_postprocess(input_solution: SearchState, initial_game: Game) -> nx.DiGraph:
    G = solution_to_graph(input_solution)

    # Produce the prioritized topological order once
    ordered_nodes: list[int] = list(priority_topo_sort(G, initial_game))

    # Prefix labels with sequence numbers for readability
    for ind, node in enumerate(ordered_nodes, start=1):
        node_obj = G.nodes[node]
        node_obj['seq_index'] = ind
        node_obj['label'] = f"{ind:02d}: {node_obj['label']}"

    # Compute collapsable flags using a simulated game state
    game_state = initial_game
    for node in ordered_nodes:
        node_data = G.nodes[node]

        forward_ops = [
            op for op in game_state.ops() if isinstance(op, OperationStepForward)
        ]
        if len(forward_ops) == 1:
            only = forward_ops[0]
            collapsable = (only.src == node_data.get('op_src') and only.dst == node_data.get('op_dst'))
        else:
            collapsable = False
        node_data['collapsable'] = collapsable

        # Advance simulation
        game_state = game_state.apply_op(
            OperationStepForward(node_data.get('op_src'), node_data.get('op_dst'))
        )

    return G


def build_solution_summaries(input_solution: SearchState, initial_game: Game) -> List[Tuple[str, list[OperationStepForward]]]:
    """Return grouped English summaries and their operations.

    - Prefers grouping consecutive steps that merge the same color into the
      same destination tube: "Merge #RRGGBB from tubes S... into tube D".
    - Otherwise groups consecutive steps that empty the same source tube:
      "Empty tube S into tubes D...".
    - Appends "(completes tube)" if any step in the group completes a tube.
    - Returns a list of (summary, [OperationStepForward...]) following the
      prioritized step order.
    """
    G = solution_to_graph(input_solution)
    ordered_nodes: list[int] = list(priority_topo_sort(G, initial_game))

    def color_to_hex(c: tuple[int, int, int] | None) -> str:
        if isinstance(c, tuple):
            return f"#{c[0]:02X}{c[1]:02X}{c[2]:02X}"
        return "unknown color"

    # Build linear step info with post-move completion flags
    steps: list[dict] = []
    sim = initial_game
    for node in ordered_nodes:
        nd = G.nodes[node]
        src = nd.get('op_src')
        dst = nd.get('op_dst')
        color = nd.get('op_color') if isinstance(nd.get('op_color'), tuple) else None
        op = OperationStepForward(src, dst)
        sim_next = sim.apply_op(op)
        completes = sim_next.is_group_completed(sim_next.groups[dst])
        steps.append({
            'src': src,
            'dst': dst,
            'color': color,
            'color_hex': color_to_hex(color),
            'op': op,
            'completes': completes,
        })
        sim = sim_next

    n = len(steps)
    i = 0
    results: List[Tuple[str, list[OperationStepForward]]] = []

    while i < n:
        # Try to extend two possible run types from i
        c0 = steps[i]['color']
        d0 = steps[i]['dst']
        s0 = steps[i]['src']

        # Length if grouping by (color, dst)
        j = i + 1
        while j < n and steps[j]['color'] == c0 and steps[j]['dst'] == d0:
            j += 1
        merge_len = j - i

        # Length if grouping by (src)
        k = i + 1
        while k < n and steps[k]['src'] == s0:
            k += 1
        empty_len = k - i

        mode = 'merge' if merge_len >= empty_len else 'empty'
        end = (i + merge_len) if mode == 'merge' else (i + empty_len)
        segment = steps[i:end]

        if mode == 'merge':
            # Merge #color from sources into a single destination
            color_hex = segment[0]['color_hex']
            dst = segment[0]['dst'] + 1
            sources = sorted({s['src'] + 1 for s in segment})
            sources_str = ", ".join(map(str, sources))
            summary = f"Merge {color_hex} from tubes {sources_str} into tube {dst}"
        else:
            # Empty source into multiple destinations
            src = segment[0]['src'] + 1
            dests = sorted({s['dst'] + 1 for s in segment})
            dests_str = ", ".join(map(str, dests))
            summary = f"Empty tube {src} into tubes {dests_str}"

        if any(s['completes'] for s in segment):
            summary += " (completes tube)"

        ops = [s['op'] for s in segment]
        results.append((summary, ops))
        i = end

    return results

def priority_topo_sort(G: nx.DiGraph, initial_game: Game):
    """Yield a prioritised topological ordering of ``G``.

    This function implements a Kahn style algorithm but, when multiple nodes
    have zero in-degree, it scores them using information from the previously
    selected operation and the current game state.  The candidate with the
    highest score is dequeued and yielded immediately, so the caller can
    consume the order lazily.

    The scoring priorities are, from high to low:

    1. The move completes a tube in the current game state.
    2. ``op_color`` equals the previous operation's ``op_color``.
    3. ``op_color`` equals the previous operation's ``op_revealing_color``.
    4. ``{op_src, op_dst}`` intersects with that of the previous operation.

    Nodes ``"s"`` and ``"t"`` are skipped in the yielded order.
    """

    indegree = {node: G.in_degree(node) for node in G.nodes}
    zero_indegree: list = [n for n, d in indegree.items() if d == 0]

    prev_color = None
    prev_reveal = None
    prev_groups: set | None = None
    game_state = initial_game

    def score(node) -> int:
        """Score a candidate node based on the priorities above."""

        if node in {"s", "t"}:
            return -1
        node_data = G.nodes[node]
        node_color = node_data.get("op_color")
        node_src = node_data.get("op_src")
        node_dst = node_data.get("op_dst")
        s = 0

        # Top priority: completing a tube after applying the move
        op = OperationStepForward(node_src, node_dst)
        if game_state.is_group_completed(game_state.apply_op(op).groups[node_dst]):
            s += 8
        if prev_color is not None and node_color == prev_color:
            s += 4
        if prev_reveal is not None and node_color == prev_reveal:
            s += 2
        if prev_groups and (node_src in prev_groups or node_dst in prev_groups):
            s += 1
        return s

    while zero_indegree:
        if "s" in zero_indegree:
            current = "s"
            zero_indegree.remove("s")
        else:
            current = max(
                zero_indegree,
                key=lambda n: (score(n), -n if isinstance(n, int) else float("-inf")),
            )
            zero_indegree.remove(current)

        for succ in G.successors(current):
            indegree[succ] -= 1
            if indegree[succ] == 0:
                zero_indegree.append(succ)

        if current in {"s", "t"}:
            continue

        node_data = G.nodes[current]
        prev_color = node_data.get("op_color")
        prev_reveal = node_data.get("op_revealing_color")
        prev_groups = {node_data.get("op_src"), node_data.get("op_dst")}

        # Advance the simulated game state to reflect the yielded operation
        game_state = game_state.apply_op(
            OperationStepForward(node_data.get("op_src"), node_data.get("op_dst"))
        )

        yield current

def show_graph(G: nx.DiGraph):
    pos = graphviz_layout(G, prog="dot", root=G.nodes["s"])
    node_colors = []
    edge_colors = []
    for n in G.nodes:
        if n in {"s", "t"}:
            node_colors.append("lightgray")
            edge_colors.append("black")
        else:
            color = G.nodes[n].get("op_color")
            if isinstance(color, tuple):
                node_colors.append([c / 255 for c in color])
            else:
                node_colors.append("lightgray")

            reveal_color = G.nodes[n].get("op_revealing_color")
            if isinstance(reveal_color, tuple):
                edge_colors.append([c / 255 for c in reveal_color])
            else:
                edge_colors.append("lightgray")
    nx.draw(
        G,
        pos,
        with_labels=True,
        arrows=True,
        node_color=node_colors,
        edgecolors=edge_colors,
        linewidths=2,
        labels=dict(G.nodes.data("label")),
    )
    plt.show()
