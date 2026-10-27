from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FIGMA = ROOT / "figma"
APP = ROOT / "app"
PAIRS = ROOT / "pairs"
PAIRS.mkdir(parents=True, exist_ok=True)

ITEMS = [
    ("16-account-detail", "Figma 29:2211 (left) · app 390×844 (right)"),
    ("18-reconcile-gap", "Figma 30:2231 (left) · app 390×844 (right)"),
    ("19-reconcile-backfill", "Figma 30:2258 (left) · app 390×844 (right)"),
    ("20-reconcile-remainder", "Figma 30:2390 (left) · app 390×844 (right)"),
]

font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
for stem, title in ITEMS:
    left = Image.open(FIGMA / f"{stem}.jpg").convert("RGB")
    right = Image.open(APP / f"{stem}.png").convert("RGB")
    target_height = max(left.height, right.height)
    if left.height != target_height:
        left = left.resize((round(left.width * target_height / left.height), target_height))
    if right.height != target_height:
        right = right.resize((round(right.width * target_height / right.height), target_height))
    gutter = 24
    header = 42
    canvas = Image.new("RGB", (left.width + right.width + gutter, target_height + header), "#f7f2e8")
    canvas.paste(left, (0, header))
    canvas.paste(right, (left.width + gutter, header))
    ImageDraw.Draw(canvas).text((12, 10), title, fill="#34291e", font=font)
    canvas.save(PAIRS / f"{stem}.jpg", quality=92)
