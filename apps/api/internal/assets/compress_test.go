package assets

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

// makeJPEG returns a synthetic JPEG of (w,h) at the given quality.
func makeJPEG(t *testing.T, w, h, quality int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	// Gradient — non-trivial content so the encoder actually has something to compress.
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
		t.Fatalf("jpeg encode: %v", err)
	}
	return buf.Bytes()
}

func makePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 200, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("png encode: %v", err)
	}
	return buf.Bytes()
}

func TestCompress_JPEGShrinksWhenOversized(t *testing.T) {
	// 3000x2000 quality-95 JPEG: well above default 2000px cap.
	src := makeJPEG(t, 3000, 2000, 95)
	res, err := Compress(bytes.NewReader(src), "image/jpeg", CompressOptions{})
	if err != nil {
		t.Fatalf("compress: %v", err)
	}
	if !res.Resized {
		t.Errorf("expected Resized=true for 3000x2000 source")
	}
	if res.NewSize >= res.OriginalSize {
		t.Errorf("expected size reduction; got %d -> %d", res.OriginalSize, res.NewSize)
	}
	// Confirm output is still a valid JPEG of the expected dims.
	img, _, derr := image.Decode(bytes.NewReader(res.Data))
	if derr != nil {
		t.Fatalf("decode output: %v", derr)
	}
	if b := img.Bounds(); b.Dx() != 2000 || b.Dy() != int(2000*2000/3000) {
		t.Errorf("unexpected output dims %dx%d", b.Dx(), b.Dy())
	}
}

func TestCompress_JPEGSmallSourceKeptOrShrunkByQuality(t *testing.T) {
	// 800x600 quality-95 JPEG: no resize, but quality 82 should shrink bytes.
	src := makeJPEG(t, 800, 600, 95)
	res, _ := Compress(bytes.NewReader(src), "image/jpeg", CompressOptions{})
	if res.Resized {
		t.Errorf("expected no resize for 800x600 source")
	}
	if res.NewSize > res.OriginalSize {
		t.Errorf("quality re-encode made file bigger: %d -> %d", res.OriginalSize, res.NewSize)
	}
}

func TestCompress_GIFUntouched(t *testing.T) {
	// Synthetic 1x1 GIF — minimal valid file.
	gif := []byte{
		0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
		0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00,
		0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00,
		0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
	}
	res, _ := Compress(bytes.NewReader(gif), "image/gif", CompressOptions{})
	if !bytes.Equal(res.Data, gif) {
		t.Errorf("GIF should be passed through unchanged")
	}
	if res.NewSize != res.OriginalSize {
		t.Errorf("size should match: %d vs %d", res.OriginalSize, res.NewSize)
	}
}

func TestCompress_PNGRevertsWhenReencodeIsLarger(t *testing.T) {
	// 16x16 PNG with simple content — re-encode at BestCompression often
	// produces a LARGER file than the stdlib's default Encode. The function
	// must detect this and return the original bytes.
	src := makePNG(t, 16, 16)
	res, _ := Compress(bytes.NewReader(src), "image/png", CompressOptions{})
	// Don't assert NewSize<=OriginalSize universally; the contract is:
	// "if recompress is bigger AND we didn't resize, keep original."
	if !res.Resized && res.NewSize > res.OriginalSize {
		t.Errorf("expected fallback to original; got %d -> %d", res.OriginalSize, res.NewSize)
	}
}

func TestCompress_CorruptDataFallsBack(t *testing.T) {
	garbage := []byte("not an image at all")
	res, err := Compress(bytes.NewReader(garbage), "image/jpeg", CompressOptions{})
	if err != nil {
		t.Fatalf("compress should not error on bad data: %v", err)
	}
	if !bytes.Equal(res.Data, garbage) {
		t.Errorf("expected pass-through on decode failure")
	}
}

func TestCompress_UnsupportedMIMEPassedThrough(t *testing.T) {
	data := []byte("svg-like-bytes")
	res, _ := Compress(bytes.NewReader(data), "image/svg+xml", CompressOptions{})
	if !bytes.Equal(res.Data, data) {
		t.Errorf("expected pass-through for unsupported MIME")
	}
}

func TestResizeIfNeeded_AspectRatio(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 4000, 2000))
	out := resizeIfNeeded(src, 2000)
	b := out.Bounds()
	if b.Dx() != 2000 {
		t.Errorf("expected width 2000, got %d", b.Dx())
	}
	if b.Dy() != 1000 {
		t.Errorf("expected height 1000 (2:1 ratio), got %d", b.Dy())
	}
}

func TestResizeIfNeeded_NoopForSmall(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 500, 500))
	out := resizeIfNeeded(src, 2000)
	if out != src {
		t.Errorf("expected pointer equality for already-small image")
	}
}
