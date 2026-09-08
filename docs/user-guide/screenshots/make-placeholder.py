#!/usr/bin/env python3
"""make-placeholder.py — Generate placeholder PNG untuk screenshot yang belum
di-capture. Dipakai sebagai fallback supaya PDF/HTML tidak show broken-image
sebelum node capture.mjs dijalankan.

Setiap PNG:
  - 1400×880 (2:1-ish, cukup untuk print A4 landscape max)
  - Background gradient soft
  - Filename + description di tengah
  - Watermark "PLACEHOLDER — screenshot belum di-capture"

Usage:
    python3 make-placeholder.py
"""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent

# (filename, human-readable description)
PLACEHOLDERS = [
    ("guru-dashboard-ringkasan.png",
     "Dashboard Ringkasan situs guru\n6 stat card + Tulisan Terbaru + Tanggapan Terbaru"),
    ("guru-sidebar-dropdown.png",
     "Sidebar dashboard situs\nDropdown 'Guru ▾' terbuka menampilkan 5 menu"),
    ("guru-tulisan-list.png",
     "Halaman list Tulisan\nTabs 6 rubrik + tabel + tombol Tulisan Baru"),
    ("guru-tulisan-form.png",
     "Form editor Tulisan\nRubric selector, RichEditor, toggle Aktifkan Tanggapan"),
    ("guru-forum-list.png",
     "Halaman Forum Diskusi\nTabel topik + CTA Topik Baru + info tanggapan wajib aktif"),
    ("guru-tanggapan-moderasi.png",
     "Halaman Moderasi Tanggapan\nTab filter Semua/Pending/Approved/Rejected + Setujui/Tolak/Hapus"),
    ("guru-pembelajaran-list.png",
     "Halaman list Pembelajaran\nTabel materi (tanpa kolom views/tanggapan — spec §19)"),
    ("guru-promosi-list.png",
     "Halaman Ruang Promosi\nGrid banner 2:1 + status badge + toggle Aktif per banner"),
    ("guru-profile-settings.png",
     "Form Profil Guru\n4 section: Identitas, Hero & Quote, Biografi, Tautan Sosial"),
    ("guru-portal-directory.png",
     "Portal Direktori Guru publik (/guru)\nGrid kartu guru 3-kolom + search & sort"),
    ("admin-banners.png",
     "Admin Moderasi Banner Guru (/admin/banners)\nList cross-site + Aktifkan/Nonaktifkan"),
]

WIDTH, HEIGHT = 1400, 880


def font(size: int):
    """Try common macOS/Linux system fonts, fallback ke default bitmap."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def font_bold(size: int):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def gradient_bg(img: Image.Image, top_hex: str, bot_hex: str):
    """Vertical gradient dari top_hex ke bot_hex."""
    top = tuple(int(top_hex[i:i+2], 16) for i in (1, 3, 5))
    bot = tuple(int(bot_hex[i:i+2], 16) for i in (1, 3, 5))
    draw = ImageDraw.Draw(img)
    for y in range(HEIGHT):
        t = y / HEIGHT
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b))


def draw_text_centered(draw, text, y_center, font_obj, fill):
    bbox = draw.textbbox((0, 0), text, font=font_obj)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (WIDTH - w) // 2
    y = y_center - h // 2
    draw.text((x, y), text, font=font_obj, fill=fill)


def build_placeholder(filename: str, description: str, out_path: Path):
    img = Image.new("RGB", (WIDTH, HEIGHT), "#f8fafc")
    gradient_bg(img, "#eef2ff", "#f5f3ff")  # soft indigo → violet
    draw = ImageDraw.Draw(img)

    # Icon area — camera emoji-like circle at top
    icon_r = 60
    icon_cx, icon_cy = WIDTH // 2, 200
    draw.ellipse(
        [icon_cx - icon_r, icon_cy - icon_r, icon_cx + icon_r, icon_cy + icon_r],
        fill="#c7d2fe", outline="#818cf8", width=3,
    )
    # Simple picture-frame glyph di tengah lingkaran
    draw.rectangle(
        [icon_cx - 32, icon_cy - 22, icon_cx + 32, icon_cy + 22],
        outline="#4338ca", width=3,
    )
    draw.line([(icon_cx - 32, icon_cy + 10), (icon_cx - 8, icon_cy - 8),
               (icon_cx + 12, icon_cy + 12), (icon_cx + 32, icon_cy)],
              fill="#4338ca", width=3)

    # Label "PLACEHOLDER"
    draw_text_centered(draw, "PLACEHOLDER SCREENSHOT", 320,
                       font_bold(28), "#4f46e5")

    # Filename (mono-ish)
    draw_text_centered(draw, filename, 380, font_bold(36), "#1e1b4b")

    # Description — multi-line, split by \n
    y = 460
    for line in description.split("\n"):
        draw_text_centered(draw, line, y, font(22), "#4b5563")
        y += 34

    # Instructions footer
    footer_y = HEIGHT - 100
    draw_text_centered(
        draw,
        "Untuk mengganti dengan screenshot asli, jalankan:",
        footer_y, font(20), "#6b7280",
    )
    draw_text_centered(
        draw,
        "node capture.mjs guru        (di docs/user-guide/capture-screenshots/)",
        footer_y + 34, font_bold(22), "#111827",
    )

    # Border
    draw.rectangle([0, 0, WIDTH - 1, HEIGHT - 1], outline="#c7d2fe", width=6)

    img.save(out_path, "PNG", optimize=True)


def main():
    for filename, desc in PLACEHOLDERS:
        out = HERE / filename
        if out.exists():
            print(f"  · skip {filename} (sudah ada — pakai screenshot asli)")
            continue
        build_placeholder(filename, desc, out)
        size_kb = out.stat().st_size / 1024
        print(f"  ✓ {filename} ({size_kb:.0f} KB)")
    print(f"\nSelesai. {len(PLACEHOLDERS)} placeholder di {HERE}")


if __name__ == "__main__":
    main()
