from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from typing import Tuple

import micropip
import pandas as pd
import pyodide
from quadratic_py import code_trace, plotly_patch, process_output

from .quadratic_api.quadratic import getCell, getCells
from .utils import attempt_fix_await, to_quadratic_type

cells_accessed = []

def error_result(
    error: Exception, code: str, cells_accessed: list[list], sout: StringIO, line_number: int,
) -> dict:
    error_class = error.__class__.__name__
    detail = error.args[0]
    return {
        "output_value": None,
        "array_output": None,
        "cells_accessed": cells_accessed,
        "std_out": sout.getvalue(),
        "success": False,
        "input_python_stack_trace": "{} on line {}: {}".format(
            error_class, line_number, detail
        ),
        "line_number": line_number,
        "formatted_code": code,
    }

# Wrapper to getCell() to capture cells_accessed
async def getCellInner(p_x: int, p_y: int, sheet: str=None) -> int | float | str | bool | None:
    cells_accessed.append([p_x, p_y, sheet])

    return await getCell(p_x, p_y, sheet)

# Wrapper to getCells() to capture cells_accessed
async def getCellsInner(p0: Tuple[int, int], p1: Tuple[int, int], sheet: str=None, first_row_header: bool=False) -> pd.DataFrame:
    # mark cells as accessed by this cell
    for x in range(p0[0], p1[0] + 1):
        for y in range(p0[1], p1[1] + 1):
            cells_accessed.append([x, y, sheet])

    return await getCells(p0, p1, sheet, first_row_header)

async def run_python(code: str, pos: Tuple[int, int]):
    globals = {
        "getCells": getCellsInner,
        "getCell": getCellInner,
        "c": getCellInner,
        "result": None,
        "cell": getCellInner,
        "cells": getCellsInner,
    }

    sout = StringIO()
    serr = StringIO()
    output_value = None
    globals['pos'] = lambda: (pos.x, pos.y)
    globals['rel_cell'] = lambda x, y: getCellInner(x + pos.x, y + pos.y)
    globals['rc'] = globals['rel_cell']

    try:
        plotly_html = await plotly_patch.intercept_plotly_html(code)

        # Capture STDOut to sout
        with redirect_stdout(sout):
            with redirect_stderr(serr):
                # preprocess and fix code
                output_value = await pyodide.code.eval_code_async(
                    attempt_fix_await(code),
                    globals=globals,
                    return_mode="last_expr_or_assign",
                    quiet_trailing_semicolon=False,
                )

    except plotly_patch.FigureDisplayError as err:
        return error_result(err, code, cells_accessed, sout, err.source_line)
    except SyntaxError as err:
        return error_result(err, code, cells_accessed, sout, err.lineno)
    except Exception as err:
        return error_result(err, code, cells_accessed, sout, code_trace.line_number_from_traceback())
    else:
        # Successfully Created a Result
        await micropip.install(
            "autopep8"
        )  # fixes a timing bug where autopep8 is not yet installed when attempting to import
        import autopep8

        # Attempt to format code
        formatted_code = code
        try:
            formatted_code = autopep8.fix_code(
                code, options={"ignore": ["E402"]}
            )  # Ignore E402 : otherwise breaks imports
        except Exception:
            pass

        # Process the output
        output = process_output.process_output_value(output_value)
        array_output = output["array_output"]
        output_value = output["output_value"]
        output_type = output["output_type"]
        output_size = output["output_size"]
        typed_array_output = output["typed_array_output"]

        # Plotly HTML
        if plotly_html is not None and plotly_html.result is not None:
            if output_value is not None or array_output is not None:
                err = RuntimeError(
                    "Cannot return result from cell that has displayed a figure "
                    f"(displayed on line {plotly_html.result_set_from_line})"
                )

                return error_result(
                    err, code, cells_accessed, sout, code_trace.get_return_line(code)
                )
            else:
                output_value = (plotly_html.result, 'text')
                output_type = "Chart"

        return {
            "output": output_value,
            "array_output": typed_array_output,
            "output_type": output_type,
            "output_size": output_size,
            "cells_accessed": cells_accessed,
            "std_out": sout.getvalue(),
            "std_err": serr.getvalue(),
            "success": True,
            "input_python_stack_trace": None,
            "code": code,
            "formatted_code": formatted_code,
        }

print("[Python WebWorker] initialized")
