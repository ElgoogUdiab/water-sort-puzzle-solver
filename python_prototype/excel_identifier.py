import win32com.client
from game import Game, GameNode, GameNodeType, GameMode
from solver_runner import solve_and_print

BOUNDARY_COLOR = (0,0,0)
EMPTY_COLOR = (255,255,255)

def bgr_to_rgb(bgr_color):
    """
    将 Excel win32com 返回的 BGR 颜色值转换为 RGB 元组。

    Args:
        bgr_color (float or int): 从 cell.Interior.Color 获取的颜色值。

    Returns:
        tuple: 一个包含 (R, G, B) 值的元组。
    """
    # 首先，确保值是整数
    color_val = int(bgr_color)
    
    # 使用位运算提取各个颜色分量
    red = color_val & 255
    green = (color_val >> 8) & 255
    blue = (color_val >> 16) & 255
    
    return (red, green, blue)

def identify_range(ws, THRESHOLD=255):
    row, col = 1, 1
    while True:
        cell = ws.Cells(row, col)
        bg_color = cell.Interior.Color
        if bgr_to_rgb(bg_color) == (0,0,0):
            break
        row += 1
        if row > THRESHOLD:
            raise ValueError("Incorrect sheet!")
    black_row = row

    row, col = 1, 1
    while True:
        cell = ws.Cells(row, col)
        bg_color = cell.Interior.Color
        if bgr_to_rgb(bg_color) == (0,0,0):
            break
        col += 1
        if col > THRESHOLD:
            raise ValueError("Incorrect sheet!")
    black_col = col

    return (black_row-1, black_col-1)

def read_board(ws, sheet_range) -> Game:
    groups = []
    for col in range(sheet_range[1]):
        after_known_node = False
        groups.append(current_group := [])
        for row in range(sheet_range[0]):
            cell = ws.Cells(row+1, col+1)
            bg_color = bgr_to_rgb(cell.Interior.Color)
            if bg_color == EMPTY_COLOR:
                if after_known_node:
                    current_group.append(GameNode(GameNodeType.UNKNOWN, (col, row)))
                else:
                    current_group.append(GameNode(GameNodeType.EMPTY, (col, row)))
            else:
                after_known_node = True
                current_group.append(GameNode(GameNodeType.KNOWN, (col, row), bg_color))
        current_group.reverse()
    game_mode = GameMode(int(input("Game Mode (0: Normal, 1: No combo move, 2: Queue output): ")))
    return Game(groups, game_mode=game_mode)

def read_current_excel_sheet() -> Game:
    # 获取正在运行的 Excel 应用程序
    excel = win32com.client.Dispatch("Excel.Application")

    # 获取所有打开的工作簿
    workbooks = excel.Workbooks

    # 假设你要读取第一个打开的工作簿
    wb = workbooks.Item(1)  # 你也可以根据文件名获取，wb = workbooks("文件名.xlsx")

    # 获取活动工作表
    ws = wb.ActiveSheet

    sheet_range = identify_range(ws)
    
    return read_board(ws, sheet_range)

if __name__ == "__main__":
    game = read_current_excel_sheet()
    solve_and_print(game)
