"""
Story Experience asset pipeline.

    python3 scripts/process-story-frame.py 2:~/Downloads/emma-2.png 3:… 4:…

Takes one or more `index:source` pairs, and for each one:

  - centre-crops to the approved 4:5 and resizes to 1320x1650
  - forces sRGB, drops alpha, strips EXIF/ICC by rebuilding the pixel data
  - encodes WebP at the highest quality that fits under 400 KB
  - writes assets/story/emma-<index>.webp
  - renders a preview of exactly what survives the hero crop, so the safe band
    is judged by eye rather than assumed

── Where the safe band comes from ──────────────────────────────────────────────
The hero is a cover-cropped window onto the 4:5 source, so the crop is purely
vertical. The binding case is the iPhone SE (375x667), whose 305pt hero shows
y 288-1362 at rest. Frame 1 additionally pushes in to 1.01, tightening it to
y 294-1356. That single tightest band is applied to every frame here, so all
four assets stay interchangeable and Frame 1 can gain motion later without
invalidating artwork that was authored for a looser crop.

Tier A - faces, hands, the phone, every object that carries meaning - is
y 350-1150. It clears the binding band by 56px at the top and 206px at the
bottom.
"""
import os
import sys
from PIL import Image

W, H = 1320, 1650
MAX_BYTES = 400 * 1024

# iPhone SE, the binding device: a 305pt hero on a 375pt-wide screen.
SE_REST = 305 / (375 * 1.25)
# Frame 1's push-in. Was 1.04, then 1.08; the shipped value is 1.01 because the
# story is carried by the thought vignettes, not by the camera.
PUSH_IN = 1.01
TIER_A_TOP, TIER_A_BOTTOM = 350, 1150

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'story')
PREVIEW_DIR = '/tmp'


def band(fraction):
    half = ((1 - fraction) / 2) * H
    return round(half), round(H - half)


def cover_resize(img):
    """Fill 1320x1650 exactly, cropping the overflowing axis centrally."""
    src_ratio = img.width / img.height
    dst_ratio = W / H
    if abs(src_ratio - dst_ratio) < 0.001:
        return img.resize((W, H), Image.LANCZOS)
    if src_ratio > dst_ratio:                       # too wide -> crop sides
        new_w = round(img.height * dst_ratio)
        off = (img.width - new_w) // 2
        img = img.crop((off, 0, off + new_w, img.height))
    else:                                           # too tall -> crop top/bottom
        new_h = round(img.width / dst_ratio)
        off = (img.height - new_h) // 2
        img = img.crop((0, off, img.width, off + new_h))
    return img.resize((W, H), Image.LANCZOS)


def encode(img, out):
    """Highest quality that fits under the ceiling."""
    q = size = None
    for q in range(95, 59, -3):
        img.save(out, 'WEBP', quality=q, method=6)
        size = os.path.getsize(out)
        if size <= MAX_BYTES:
            return q, size
    return q, size


def process(index, src):
    img = Image.open(os.path.expanduser(src))
    print(f'\nframe {index}  <- {src}')
    print(f'  source      {img.width}x{img.height}  {img.mode}  ratio {img.width / img.height:.4f}')

    # Rebuilding the pixel data is what actually strips EXIF and any embedded
    # profile; save(exif=None) does not.
    img = img.convert('RGB')
    clean = Image.new('RGB', img.size)
    clean.putdata(list(img.getdata()))
    out_img = cover_resize(clean)

    out = os.path.join(OUT_DIR, f'emma-{index}.webp')
    q, size = encode(out_img, out)
    ok = size <= MAX_BYTES
    print(f'  encoded     {out}')
    print(f'              q={q}  {size / 1024:.1f} KB  {"OK" if ok else "OVER CEILING"} (max {MAX_BYTES / 1024:.0f} KB)')

    check = Image.open(out)
    print(f'  verified    {check.width}x{check.height}  {check.mode}  '
          f'alpha={"yes" if "A" in check.mode else "no"}  '
          f'exif={"yes" if check.getexif() else "no"}  '
          f'icc={"yes" if check.info.get("icc_profile") else "no"}')

    worst = None
    for name, frac in (('se-rest', SE_REST), ('se-pushin', SE_REST / PUSH_IN)):
        top, bottom = band(frac)
        out_img.crop((0, top, W, bottom)).save(f'{PREVIEW_DIR}/frame{index}-{name}.png')
        safe = top <= TIER_A_TOP and bottom >= TIER_A_BOTTOM
        print(f'  {name:<11} visible y {top}-{bottom}  Tier A {"OK" if safe else "VIOLATED"}')
        worst = (top, bottom)
    print(f'  preview     {PREVIEW_DIR}/frame{index}-se-rest.png  (this is what an iPhone SE shows)')
    return ok and worst[0] <= TIER_A_TOP and worst[1] >= TIER_A_BOTTOM


def main():
    pairs = []
    for arg in sys.argv[1:]:
        if ':' not in arg:
            sys.exit(f'expected <index>:<path>, got {arg!r}')
        i, p = arg.split(':', 1)
        pairs.append((int(i), p))
    if not pairs:
        sys.exit(__doc__)

    results = [(i, process(i, p)) for i, p in pairs]
    print('\n' + '-' * 60)
    for i, ok in results:
        print(f'  frame {i}: {"PASS" if ok else "NEEDS ATTENTION"}')
    if not all(ok for _, ok in results):
        sys.exit(1)


if __name__ == '__main__':
    main()
