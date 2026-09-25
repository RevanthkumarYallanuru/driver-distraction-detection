"""Builds kaggle_vgg16_statefarm.ipynb from train_vgg16_statefarm.py (# %% cells)."""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
source = (HERE / "train_vgg16_statefarm.py").read_text(encoding="utf-8")

SETUP = """# Kaggle setup (do this once)
1. Kaggle -> Create -> New Notebook -> File -> Import Notebook -> upload this .ipynb
2. Right panel -> **Add Input** -> Competitions -> *State Farm Distracted Driver Detection*
   (accept the competition rules on its page first)
3. Right panel -> Session options -> **Accelerator: GPU T4 x1** (or P100)
4. Run all. Training takes roughly 1.5-3 hours on a T4.
5. Download `output/vgg16_statefarm.pt` from the Output panel and copy it to the
   project's `models/` folder.

To change settings (e.g. the paper's exact random split), edit the `ARGS` cell."""

RESULTS = """from IPython.display import Image as IPImage, display
for name in ("acc_curve.png", "loss_curve.png", "confusion_matrix.png"):
    display(IPImage(f"{ARGS_OUT}/{name}"))"""


def cell(kind, text):
    lines = text.strip("\n").splitlines(keepends=True)
    c = {"cell_type": kind, "metadata": {}, "source": lines}
    if kind == "code":
        c.update(execution_count=None, outputs=[])
    return c


cells = [cell("markdown", SETUP)]
for chunk in re.split(r"^# %%.*$", source, flags=re.M):
    chunk = chunk.strip("\n")
    if not chunk:
        continue
    if chunk.startswith("# #") or all(l.startswith("#") or not l.strip() for l in chunk.splitlines()):
        md = "\n".join(l[2:] if l.startswith("# ") else l.lstrip("#") for l in chunk.splitlines())
        cells.append(cell("markdown", md))
    elif chunk.startswith('if __name__ == "__main__":'):
        cells.append(cell("code",
            '# Settings: split = "random" (paper) or "driver" (held-out drivers)\n'
            'ARGS_OUT = "/kaggle/working/output"\n'
            'ARGS = ["--split", "driver", "--flip", "label-swap", "--out", ARGS_OUT]\n'
            "meta = main(ARGS)\nmeta"))
        cells.append(cell("code", RESULTS))
    else:
        cells.append(cell("code", chunk))

nb = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python"},
        "accelerator": "GPU",
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}
(HERE / "kaggle_vgg16_statefarm.ipynb").write_text(json.dumps(nb, indent=1), encoding="utf-8")
print(f"wrote {len(cells)} cells")
