"""Compose DS-5 Figma/app evidence pairs from exported PNG directories."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SCREENS = [
    ("01", "Login", "26:1095", "01", ["01-login"]),
    ("02", "Signup", "26:1127", "02", ["02-signup"]),
    ("03", "Home", "26:1166", "03", ["03-home"]),
    ("03b", "Home - today empty", "42:3786", "03b", ["03b-home-empty-today"]),
    ("04", "Home - first run", "26:1287", "04", ["04-home-first-run"]),
    ("05", "Balance breakdown sheet", "26:1368", "05", ["05-breakdown-a", "05-breakdown-b"]),
    ("06", "Add - manual expense", "27:1357", "06", ["06-add-manual-a", "06-add-manual-b"]),
    ("07", "Add - transfer", "27:1487", "07", ["07-add-transfer-a", "07-add-transfer-b"]),
    ("10", "Add - slip confirm", "28:1781", "10", ["10-slip-confirm-a", "10-slip-confirm-b"]),
    ("11", "Add - slip queue", "28:1893", "11", ["11-slip-queue-a", "11b-slip-queue-parsed-a"]),
    ("12", "Close with unsaved slips", "28:2001", "12", ["12-close-dialog"]),
    ("13", "Transactions", "29:1937", "13", ["13-transactions"]),
    ("14", "Transaction detail sheet", "29:2082", "14", ["14-tx-detail-a", "14-tx-detail-b"]),
    ("15", "Accounts", "29:2119", "15", ["15-accounts"]),
    ("16", "Account detail sheet", "29:2211", "16", ["16-account-detail-a", "16-account-detail-b"]),
    ("17", "Account form", "29:2288", "17", ["17-account-form-a", "17-account-form-b"]),
    ("21", "Budgets", "31:2339", "21", ["21-budgets"]),
    ("22", "Budgets - overview", "31:2423", "22", ["22-budgets-overview"]),
    ("23", "Budget form", "31:2545", "23", ["23-budget-form-a", "23-budget-form-b"]),
    ("24", "Groups", "31:2606", "24", ["24-groups"]),
    ("25", "Group detail", "31:2671", "25", ["25-group-detail"]),
    ("26", "Recurring", "32:2652", "26", ["26-recurring"]),
    ("27", "Recurring form", "32:2742", "27", ["27-recurring-form-a", "27-recurring-form-b"]),
    ("28", "Import", "32:2828", "28", ["28-import"]),
    ("29", "Invest - holdings", "33:2848", "29", ["29-invest-holdings"]),
    ("30", "Invest - overview", "33:2932", "30", ["30-invest-overview"]),
    ("31", "Invest - plan", "33:3043", "31", ["31-invest-plan"]),
    ("32", "Holding detail sheet", "33:3140", "32", ["32-holding-detail-a", "32-holding-detail-b"]),
    ("33", "Add trade", "33:3189", "33", ["33-add-trade-a", "33-add-trade-b"]),
    ("34", "Sessions", "34:3093", "34", ["34-sessions"]),
    ("35", "Trip manage", "34:3164", "35", ["35-trip-manage"]),
    ("36", "Payment session detail", "34:3227", "36", ["36-payment-detail"]),
    ("37", "Guest pay", "34:3288", "37", ["37-guest-pay"]),
    ("38", "Guest trip", "34:3318", "38", ["38-guest-trip-prejoin"]),
    ("39", "More", "34:3351", "39", ["39-more"]),
    ("40", "Settings", "34:3436", "40", ["40-settings"]),
    ("D1", "Home - dark", "34:3525", "D1", ["D1-home-dark"]),
    ("D2", "Transactions - dark", "34:3545", "D2", ["D2-transactions-dark"]),
    ("D3", "Add transfer - dark", "34:3568", "D3", ["D3-add-transfer-dark-a", "D3-add-transfer-dark-b"]),
    ("D4", "Invest overview - dark", "34:3621", "D4", ["D4-invest-overview-dark"]),
]


def fit(path: Path, width: int) -> Image.Image:
    image = Image.open(path).convert("RGB")
    height = max(1, round(image.height * width / image.width))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Directory containing figma/ and app/")
    parser.add_argument("--output", type=Path, default=Path("tests/e2e/evidence/ds-5/pairs"))
    parser.add_argument(
        "--screen",
        action="append",
        dest="screens",
        help="Compose only this screen id (repeatable); defaults to the full DS-5 set.",
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
    except OSError:
        font = ImageFont.load_default()

    width = 520
    manifest = ["# DS-5 visual evidence", "", "Figma export is left; app at 390×844 is right.", ""]
    missing: list[str] = []
    selected = [screen for screen in SCREENS if not args.screens or screen[0] in args.screens]
    unknown = sorted(set(args.screens or []) - {screen[0] for screen in SCREENS})
    if unknown:
        raise SystemExit("Unknown screen ids: " + ", ".join(unknown))

    for screen_id, title, node, figma_name, app_names in selected:
        figma_path = args.source / "figma" / f"{figma_name}.png"
        app_paths = [args.source / "app" / f"{name}.png" for name in app_names]
        absent = [str(path) for path in [figma_path, *app_paths] if not path.exists()]
        if absent:
            missing.extend(absent)
            continue
        figma = fit(figma_path, width)
        apps = [fit(path, width) for path in app_paths]
        app_height = sum(image.height for image in apps) + 12 * (len(apps) - 1)
        canvas = Image.new("RGB", (width * 2 + 48, 64 + max(figma.height, app_height)), (245, 245, 245))
        draw = ImageDraw.Draw(canvas)
        draw.text((16, 14), f"{screen_id}  {title} · Figma {node} (left) · app 390x844 (right)", fill=(40, 30, 20), font=font)
        canvas.paste(figma, (16, 54))
        y = 54
        for app in apps:
            canvas.paste(app, (width + 32, y))
            y += app.height + 12
        slug = title.lower().replace(" - ", "-").replace(" ", "-")
        output_name = f"{screen_id}-{slug}.jpg"
        canvas.save(args.output / output_name, "JPEG", quality=82, optimize=True)
        manifest.append(f"- `{screen_id}` — {title} — Figma `{node}` — [{output_name}](pairs/{output_name})")

    if missing:
        raise SystemExit("Missing inputs:\n" + "\n".join(missing))
    manifest.extend(["", f"Total: {len(selected)} paired states.", ""])
    (args.output.parent / "README.md").write_text("\n".join(manifest), encoding="utf-8")
    print(f"wrote {len(selected)} pairs to {args.output}")


if __name__ == "__main__":
    main()
