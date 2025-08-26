from game import GameOperation, OperationStepForward
from solver import SearchState
from typing import TypeGuard
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

def solution_postprocess(input_solution: SearchState) -> nx.DiGraph:
    G = solution_to_graph(input_solution)
    return G

def priority_topo_sort(G: nx.DiGraph) -> list:
    """Topologically sort ``G`` while prioritising preferred operations.

    The function implements a Kahn style algorithm but, when multiple nodes
    have zero in-degree, it scores them using information from the previously
    selected operation.  The candidate with the highest score is dequeued.

    Priorities (higher to lower):

    1. ``op_color`` equals the previous operation's ``op_color``.
    2. ``op_color`` equals the previous operation's ``op_revealing_color``.
    3. ``{op_src, op_dst}`` intersects with that of the previous operation.

    Nodes ``"s"`` and ``"t"`` are skipped in the returned order.
    """

    indegree = {node: G.in_degree(node) for node in G.nodes}
    zero_indegree: list = [n for n, d in indegree.items() if d == 0]

    result: list = []
    prev_color = None
    prev_reveal = None
    prev_groups: set | None = None

    def score(node) -> int:
        if node in {"s", "t"}:
            return -1
        node_data = G.nodes[node]
        node_color = node_data.get("op_color")
        node_src = node_data.get("op_src")
        node_dst = node_data.get("op_dst")
        s = 0
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

        result.append(current)
        node_data = G.nodes[current]
        prev_color = node_data.get("op_color")
        prev_reveal = node_data.get("op_revealing_color")
        prev_groups = {node_data.get("op_src"), node_data.get("op_dst")}

    return result

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
                edge_colors.append("gray")
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
