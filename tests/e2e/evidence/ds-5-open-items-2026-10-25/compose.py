from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).parent
APP = ROOT / "app"
OUT = ROOT / "pairs"
FIGMA = Path(
    r"C:\Users\thana\AppData\Local\Temp\claude\E--claudeWorkSpace"
    r"\f3f77a67-f737-4108-9ce1-0487e519b76c\scratchpad\recheck\figma"
)
SCREENS = [
    ("06", "Add - manual expense", "27:1357", "06-add-manual-expense"),
    ("10", "Add - slip confirm", "28:1781", "10-add-slip-confirm"),
    ("15", "Accounts", "29:2119", "15-accounts"),
    ("29", "Invest - holdings", "33:2848", "29-invest-holdings"),
]
WIDTH = 520


def fit(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGB")
    ratio = WIDTH / image.width
    return image.resize((WIDTH, round(image.height * ratio)), Image.Resampling.LANCZOS)


OUT.mkdir(exist_ok=True)
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 21)
except OSError:
    font = ImageFont.load_default()

for screen_id, title, node, filename in SCREENS:
    figma = fit(FIGMA / f"{screen_id}.png")
    app = fit(APP / f"{filename}.png")
    canvas = Image.new("RGB", (WIDTH * 2 + 48, max(figma.height, app.height) + 66), "#f5f5f5")
    draw = ImageDraw.Draw(canvas)
    draw.text(
        (16, 14),
        f"{screen_id}  {title} · Figma {node} (left) · app 390×844 (right)",
        fill="#281e14",
        font=font,
    )
    canvas.paste(figma, (16, 50))
    canvas.paste(app, (WIDTH + 32, 50))
    canvas.save(OUT / f"{filename}.jpg", quality=82, optimize=True)
