from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).parent
FIGMA = Image.open(ROOT / "figma" / "06-add-manual-a3.png").convert("RGB")
APP_FULL = Image.open(ROOT / "app" / "06-add-manual-a3-full.png").convert("RGB")
APP_FOCUS = Image.open(ROOT / "app" / "06-add-manual-a3-focus.png").convert("RGB")
OUT = ROOT / "pairs"
OUT.mkdir(exist_ok=True)

try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 18)
except OSError:
    font = ImageFont.load_default()


def pair(left: Image.Image, right: Image.Image, filename: str, title: str) -> None:
    gap = 24
    top = 44
    width = left.width + right.width + gap
    height = max(left.height, right.height) + top
    canvas = Image.new("RGB", (width, height), "#f5f1e8")
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 10), title, fill="#281e14", font=font)
    canvas.paste(left, (0, top))
    canvas.paste(right, (left.width + gap, top))
    canvas.save(OUT / filename, quality=88, optimize=True)


pair(
    FIGMA,
    APP_FULL,
    "06-add-manual-a3-full.jpg",
    "A3 · Figma 27:1357 (left) · app 390×844 (right)",
)
pair(
    FIGMA.crop((0, 650, FIGMA.width, FIGMA.height)),
    APP_FOCUS.crop((0, 400, APP_FOCUS.width, APP_FOCUS.height)),
    "06-add-manual-a3-focus.jpg",
    "A3 display-name field · Figma (left) · app (right)",
)
