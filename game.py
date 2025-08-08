from dataclasses import dataclass
from enum import Enum
from typing import Hashable, Optional, Self, Union
from collections import Counter
import numpy as np
from PIL import Image
from frozenlist import FrozenList
from functools import cached_property, cache

class GameOperation:
    @staticmethod
    def str_to_operation(in_str: str) -> 'GameOperation':
        if '->' in in_str:
            src, dst = [int(i) - 1 for i in in_str.split(" -> ")]
            return OperationStepForward(src, dst)
        if in_str == "Undo":
            return OperationUndo()
        raise ValueError("Unknown operation!")


@dataclass(frozen=True)
class OperationStepForward(GameOperation):
    src: int
    dst: int
    def __repr__(self):
        return f"{self.src + 1} -> {self.dst + 1}"
    def __eq__(self, other: Self):
        return self.src == other.src and self.dst == other.dst

# A singleton
class OperationUndo(GameOperation):
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __repr__(self):
        return "Undo"

class GameNodeType(Enum):
    UNKNOWN = '?'
    UNKNOWN_REVEALED = '!'
    KNOWN = '.'
    EMPTY = '_'

@dataclass(frozen=True, eq=True)
class GameNode:
    node_type: GameNodeType
    original_pos: tuple[int, int]
    color: Optional[Union[tuple[int, int, int], Hashable]] = None
    def __post_init__(self):
        if self.node_type == GameNodeType.UNKNOWN:
            assert self.node_type == GameNodeType.UNKNOWN and self.color is None
        if self.node_type == GameNodeType.UNKNOWN_REVEALED:
            assert self.node_type == GameNodeType.UNKNOWN_REVEALED and self.color is None
        if self.node_type == GameNodeType.EMPTY:
            assert self.node_type == GameNodeType.EMPTY and self.color is None

class GameMode(Enum):
    NORMAL = 0
    NO_COMBO = 1
    QUEUE = 2

class Game:
    def __init__(
        self,
        groups: list[list[GameNode]],
        undo_count: int=5,
        group_capacity: Optional[int]=None,
        game_mode: GameMode=GameMode.NORMAL,
    ):
        # groups are in bottom-to-top order (so that pop matches the pouring-out action and append matches the pouring-in action)
        if group_capacity is None:
            assert(len(length_set := set(len(i) for i in groups)) == 1), "All groups should have same length!"
            self.group_capacity = length_set.pop()
        else:
            self.group_capacity = group_capacity
        self.groups: FrozenList[FrozenList[GameNode]] = FrozenList()
        self._contain_unknown: bool = False
        self.undo_count = undo_count
        self.game_mode = game_mode

        self.previous_state: Optional[Game] = None
        self.all_revealed: set[tuple[int, int]] = set()
        self.revealed_new: bool = False


        node_counter: Counter[tuple[GameNodeType, Optional[tuple[int, int, int]]]] = Counter()
        for group in groups:
            self.groups.append(current_group := FrozenList())

            if any(i.node_type in {GameNodeType.UNKNOWN, GameNodeType.UNKNOWN_REVEALED} for i in group):
                self._contain_unknown = True
            
            empty_ended = False
            for node in reversed(group):
                if node.node_type == GameNodeType.EMPTY:
                    if empty_ended:
                        raise ValueError("Empty node after non-empty node!")
                else:
                    node_counter[(node.node_type, node.color)] += 1
                    empty_ended = True
                    current_group.append(node)
            
            current_group.reverse()
            current_group.freeze()
        self.groups.freeze()
        
        # node assertion
        known_total = 0
        for key, value in node_counter.items():
            if key[0] == GameNodeType.KNOWN:
                assert value <= self.group_capacity
                known_total += value
        assert (known_total + node_counter[(GameNodeType.UNKNOWN, None)] + node_counter[(GameNodeType.UNKNOWN_REVEALED, None)]) % self.group_capacity == 0
    
    def is_group_completed(self, group: FrozenList[GameNode]):
        if len(group) != self.group_capacity:
            return False
        if not all(node.node_type == GameNodeType.KNOWN for node in group):
            return False
        if len(set(node.color for node in group)) != 1:
            return False
        return True

    def ops(self) -> list[GameOperation]:
        result = []
        available_dests: list[int] = []
        empty_flag = False

        for i, dst_group in enumerate(self.groups):
            if len(dst_group) < self.group_capacity:
                if len(dst_group) == 0:
                    if empty_flag:
                        continue
                    empty_flag = True
                available_dests.append(i)

        for src, src_group in enumerate(self.groups):
            # Empty group as start
            if len(src_group) == 0:
                continue
            # Completed group as start
            if self.is_group_completed(src_group):
                continue
            
            if self.game_mode in {GameMode.NORMAL, GameMode.NO_COMBO}:
                op_item = src_group[-1]
            elif self.game_mode in {GameMode.QUEUE}:
                op_item = src_group[0]

            temp_result = []
            for dst in available_dests:
                if src == dst:
                    continue

                dst_group = self.groups[dst]

                # Prevent moving an entire uniform-color group into an empty tube
                if op_item.node_type == GameNodeType.KNOWN and len(set(node.color for node in src_group)) == 1 and len(dst_group) == 0:
                    continue
                    
                # Dedicated destination available for given source
                if op_item.node_type == GameNodeType.KNOWN and len(dst_group) > 0 and dst_group[-1].color == op_item.color and len(set(node.color for node in dst_group)) == 1:
                    temp_result = [OperationStepForward(src, dst)]
                    break
                
                # Empty destination
                if len(dst_group) == 0:
                    temp_result.append(OperationStepForward(src, dst))
                    continue
                
                # Normal color match
                if dst_group[-1].node_type == GameNodeType.KNOWN and dst_group[-1].color == op_item.color:
                    temp_result.append(OperationStepForward(src, dst))
                    continue

            result.extend(temp_result)

        if self._contain_unknown and self.previous_state is not None and self.undo_count > 0:
            result.append(OperationUndo())

        return result
    
    def apply_op(self, op: GameOperation) -> 'Game':
        if isinstance(op, OperationUndo):
            new_groups = []
            for old_group in self.previous_state.groups:
                new_groups.append(new_group := [])
                for node in old_group:
                    if node.original_pos not in self.all_revealed:
                        new_group.append(node)
                    else:
                        new_group.append(GameNode(GameNodeType.UNKNOWN_REVEALED, node.original_pos))
                        
            new_state = Game(new_groups, self.undo_count-1, self.group_capacity, self.game_mode)
            new_state.previous_state = self.previous_state.previous_state
            new_state.all_revealed = self.all_revealed.copy()

        elif isinstance(op, OperationStepForward):
            new_groups = [[*group] for group in self.groups]

            src_group, dst_group = new_groups[op.src], new_groups[op.dst]

            if self.game_mode == GameMode.QUEUE:
                op_item = src_group[0]
            else:
                op_item = src_group[-1]

            if op_item.node_type == GameNodeType.UNKNOWN_REVEALED:
                dst_group.append(src_group.pop())
            elif op_item.node_type == GameNodeType.KNOWN:
                if self.game_mode == GameMode.NO_COMBO:
                    dst_group.append(src_group.pop())
                elif self.game_mode == GameMode.NORMAL:
                    while src_group and src_group[-1].color == op_item.color and len(dst_group) < self.group_capacity:
                        dst_group.append(src_group.pop())
                elif self.game_mode == GameMode.QUEUE:
                    while src_group and src_group[0].color == op_item.color and len(dst_group) < self.group_capacity:
                        dst_group.append(src_group.pop(0))

            reveal_unknown_flag = None
            if src_group and src_group[-1].node_type == GameNodeType.UNKNOWN:
                reveal_unknown_flag = src_group[-1].original_pos
                src_group[-1] = GameNode(GameNodeType.UNKNOWN_REVEALED, reveal_unknown_flag)

            new_state = Game(new_groups, self.undo_count, self.group_capacity, self.game_mode)
            new_state.previous_state = self
            new_state.all_revealed = self.all_revealed.copy()

            if reveal_unknown_flag is not None:
                new_state.all_revealed.add(reveal_unknown_flag)
                new_state.revealed_new = True

        return new_state
    
    @cached_property
    def is_winning_state(self) -> bool:
        for group in self.groups:
            if len(group) == 0:
                continue
            if self.is_group_completed(group):
                continue
            return False
        return True
    
    @cached_property
    def unknown_count(self) -> int:
        c = 0
        for group in self.groups:
            for n in group:
                if n.node_type == GameNodeType.UNKNOWN:
                    c += 1
        return c

    @cached_property
    def unknown_revealed_nodes(self) -> list[tuple[GameNode, tuple[int, int]]]:
        result = []
        for group_num, group in enumerate(self.groups):
            for node_index, n in enumerate(group):
                if n.node_type == GameNodeType.UNKNOWN_REVEALED:
                    result.append((n, (group_num, self.group_capacity - node_index - 1)))
        return result

    @cached_property
    def unknown_revealed_count(self) -> int:
        return len(self.unknown_revealed_nodes)
    
    @cached_property
    def is_meaningful_state(self) -> bool:
        if not self.revealed_new:
            return False
        for group in self.groups:
            if any(node.node_type == GameNodeType.UNKNOWN_REVEALED for node in group):
                return True
        return False
    
    @cached_property
    def segments(self):
        segments = 0
        for group in self.groups:
            last_n = None
            for i, n in enumerate(group):
                if i == 0:
                    segments += 1
                else:
                    if last_n.node_type != n.node_type:
                        segments += 1
                    elif n.node_type in {GameNodeType.UNKNOWN, GameNodeType.UNKNOWN_REVEALED}:
                        segments += 1
                    elif n.color != last_n.color:
                        segments += 1
                last_n = n
        return segments
    
    @cached_property
    def completed_group_count(self):
        return sum(
            1 for group in self.groups if self.is_group_completed(group)
        )
    
    @cached_property
    def heuristic(self) -> tuple[int]:
        result = (
            self.segments,
            self.completed_group_count,
        )
        return result

    @cached_property
    def _to_frozensets(self):
        return frozenset(tuple(group) for group in self.groups)

    @cached_property
    def _to_hashable(self):
        return (self._to_frozensets(), self.undo_count)
    
    @cached_property
    def __hash__(self) -> int:
        return hash(self._to_hashable())

    def __eq__(self, other: Self) -> bool:
        return self._to_hashable() == other._to_hashable()

def visualize_game(game: Game, scale:int = 20) -> Image:
    game_size = (game.group_capacity, len(game.groups))
    image_np = np.ones((*game_size, 3), dtype="u1") * 255
    for col, group in enumerate(game.groups):
        group = [*group]
        group.reverse()
        for row, node in enumerate(group, start=game.group_capacity - len(group)):
            if node.node_type == GameNodeType.KNOWN:
                image_np[row, col] = node.color
            elif node.node_type == GameNodeType.UNKNOWN:
                image_np[row, col] = (0, 0, 0)
            elif node.node_type == GameNodeType.UNKNOWN_REVEALED:
                image_np[row, col] = (240, 240, 240)
    return Image.fromarray(np.repeat(np.repeat(image_np, scale, axis=0), scale, axis=1))
