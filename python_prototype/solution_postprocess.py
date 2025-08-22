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
