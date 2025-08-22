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

    G = nx.DiGraph()
    for i, op in enumerate(input_solution.path):
        G.add_node(i, label=f"{op}")

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
    nx.draw(G, pos, with_labels=True, arrows=True, node_color="orange", labels=dict(G.nodes.data("label")))
    plt.show()
