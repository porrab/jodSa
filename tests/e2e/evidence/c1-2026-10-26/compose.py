from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).parent
FIGMA = ROOT / "figma"
APP = ROOT / "app"
PAIRS = ROOT / "pairs"
PAIRS.mkdir(exist_ok=True)

RAW_16 = Path(
    r"C:\Users\thana\AppData\Local\Temp\claude\E--claudeWorkSpace\f3f77a67-f737-4108-9ce1-0487e519b76c\scratchpad\recheck\figma\16.png"
)

try:
    FONT = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 18)
except OSError:
    FONT = ImageFont.load_default()


def crop_frame(source: str, box: tuple[int, int, int, int], output: str, width: int = 390) -> None:
    image = Image.open(FIGMA / source).convert("RGB").crop(box)
    height = round(image.height * width / image.width)
    image.resize((width, height), Image.Resampling.LANCZOS).save(FIGMA / output, quality=94)


def pair(figma_name: str, app_name: str, output: str, title: str) -> None:
    left = Image.open(FIGMA / figma_name).convert("RGB")
    right = Image.open(APP / app_name).convert("RGB")
    gap = 24
    top = 44
    canvas = Image.new("RGB", (left.width + right.width + gap, max(left.height, right.height) + top), "#f5f1e8")
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 10), title, fill="#281e14", font=FONT)
    canvas.paste(left, (0, top))
    canvas.paste(right, (left.width + gap, top))
    canvas.save(PAIRS / output, quality=90, optimize=True)


Image.open(RAW_16).convert("RGB").save(FIGMA / "16-account-detail.jpg", quality=94)
crop_frame("18-full.jpg", (444, 70, 834, 603), "18-reconcile-gap.jpg")
crop_frame("19-full.jpg", (546, 38, 738, 631), "19-reconcile-backfill.jpg")
crop_frame("20-full.jpg", (456, 41, 827, 625), "20-reconcile-remainder.jpg")

pair("16-account-detail.jpg", "16-account-detail.png", "16-account-detail.jpg", "Figma 29:2211 (left) · app 390×844 (right)")
pair("18-reconcile-gap.jpg", "18-reconcile-gap.png", "18-reconcile-gap.jpg", "Figma 30:2231 (left) · app (right)")
pair("19-reconcile-backfill.jpg", "19-reconcile-backfill.png", "19-reconcile-backfill.jpg", "Figma 30:2258 (left) · app (right)")
pair("20-reconcile-remainder.jpg", "20-reconcile-remainder.png", "20-reconcile-remainder.jpg", "Figma 30:2390 (left) · app (right)")
