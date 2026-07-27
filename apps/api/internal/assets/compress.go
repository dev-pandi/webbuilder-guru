package assets

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"

	"golang.org/x/image/draw"

	// Side-effect imports register decoders so image.Decode handles each format.
	_ "image/gif"
	_ "golang.org/x/image/webp"
)

// CompressOptions tunes the re-encode pipeline. Zero values fall back to
// sensible defaults so callers can pass an empty struct.
type CompressOptions struct {
	// MaxDimension is the longest-edge cap in pixels. Images bigger than this
	// are downscaled with CatmullRom (high-quality sinc-ish filter); smaller
	// images are left at original dimensions.
	MaxDimension int

	// JPEGQuality is the libjpeg-equivalent quality for re-encoded JPEGs.
	// 82 is the sweet spot used by Cloudinary / Squoosh defaults.
	JPEGQuality int
}

func (o CompressOptions) withDefaults() CompressOptions {
	if o.MaxDimension <= 0 {
		o.MaxDimension = 2000
	}
	if o.JPEGQuality <= 0 || o.JPEGQuality > 100 {
		o.JPEGQuality = 82
	}
	return o
}

// CompressResult captures what changed so the handler can surface ratio in
// logs/responses (and skip storage if compression made it bigger).
type CompressResult struct {
	Data         []byte
	MIME         string
	OriginalSize int
	NewSize      int
	Resized      bool // true if pixel dimensions changed
}

// Compress reads an image, optionally downscales, and re-encodes it.
//
// What it does NOT touch:
//   - GIF (animated; re-encoding via image/gif would flatten to first frame).
//   - WebP (no pure-Go encoder in stdlib or x/image — would force cgo dep).
//
// What it DOES touch:
//   - JPEG: decode → resize-if-large → encode at JPEGQuality.
//     Strips EXIF (decode/encode drops metadata) — privacy win for phone uploads.
//   - PNG: decode → resize-if-large → encode at BestCompression.
//     If the result is bigger than the original (small icons re-encode badly),
//     the original bytes are returned instead.
//
// On any error (corrupt, unsupported), returns the original bytes unchanged —
// graceful degrade beats failing the upload.
func Compress(r io.Reader, mime string, opt CompressOptions) (*CompressResult, error) {
	opt = opt.withDefaults()

	original, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}
	out := &CompressResult{
		Data:         original,
		MIME:         mime,
		OriginalSize: len(original),
		NewSize:      len(original),
	}

	// Skip formats we can't re-encode safely.
	switch mime {
	case "image/gif", "image/webp":
		return out, nil
	case "image/png", "image/jpeg":
		// fall through
	default:
		return out, nil
	}

	img, _, err := image.Decode(bytes.NewReader(original))
	if err != nil {
		// Garbage in → return original. Better than rejecting an upload over
		// a decoder edge case (truncated CMYK JPEG, exotic colour space, etc).
		return out, nil
	}

	resized := resizeIfNeeded(img, opt.MaxDimension)
	out.Resized = resized != img

	var buf bytes.Buffer
	switch mime {
	case "image/jpeg":
		if err := jpeg.Encode(&buf, resized, &jpeg.Options{Quality: opt.JPEGQuality}); err != nil {
			return out, nil
		}
	case "image/png":
		enc := png.Encoder{CompressionLevel: png.BestCompression}
		if err := enc.Encode(&buf, resized); err != nil {
			return out, nil
		}
	}

	// Don't accept a "compression" that made the file bigger. Tiny PNGs (icons,
	// logos) often re-encode worse than the original; also covers the case
	// where a quality-100 JPEG can't beat the source.
	if buf.Len() >= len(original) && !out.Resized {
		return out, nil
	}

	out.Data = buf.Bytes()
	out.NewSize = buf.Len()
	return out, nil
}

// probeImageDimensions parse header saja pakai image.DecodeConfig — jauh
// lebih murah dari full Decode (baca beberapa KB pertama untuk metadata).
// Nil pointer kalau format tak dikenal atau file rusak — caller (renderer)
// akan tetap emit <img> tanpa width/height attr (browser fallback normal).
func probeImageDimensions(data []byte, mime string) (*int, *int) {
	// Skip untuk format yang decoderconfig-nya tidak available atau tidak worth
	// (mis. text/plain sneaked in). MIME kita udah whitelist di caller.
	switch mime {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		// fall through
	default:
		return nil, nil
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, nil
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, nil
	}
	w, h := cfg.Width, cfg.Height
	return &w, &h
}

// resizeIfNeeded downscales the image so the longest edge is at most maxDim.
// Returns the original image untouched if it's already small enough — caller
// uses pointer identity to detect the noop.
func resizeIfNeeded(src image.Image, maxDim int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= maxDim && h <= maxDim {
		return src
	}
	var nw, nh int
	if w >= h {
		nw = maxDim
		nh = int(float64(h) * float64(maxDim) / float64(w))
	} else {
		nh = maxDim
		nw = int(float64(w) * float64(maxDim) / float64(h))
	}
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
	return dst
}
