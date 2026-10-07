# HealixDZ AI service (brain pipeline)

Inference service called by the NestJS backend only. CPU, FastAPI, listens on
`127.0.0.1` by default. It receives the bytes of one image and nothing else:
no patient identity ever reaches it.

**Decision support only.** The models are not certified as medical devices.

## Pipeline

1. **Classification** (always): `brain-efficientnetb4-tumor-classification`,
   4 classes in index order `glioma, meningioma, notumor, pituitary`, softmax.
2. **Segmentation** (conditional, fixed routing on the top class):
   - `meningioma` → `brain-unet-meningioma-segmentation`
   - `pituitary` → `brain-unet-pituitary-segmentation`
   - `glioma`, `notumor` → none (`segmentationSkippedReason: "not_applicable_for_class"`).

   The segmenters are never callable on their own: they were only evaluated
   on images that contain their tumour type.

| Model id | File | Input | SHA-256 |
| --- | --- | --- | --- |
| brain-efficientnetb4-tumor-classification | `fold_5_best.pth` | 224×224 | `311d2cbb171266721871f46f7f841b1dffef0c0fec40853745f55be9939ae654` |
| brain-unet-meningioma-segmentation | `healixdz_seg_meningioma_v5_best.pth` | 256×256 | `95c94047da1daaf71744e6076c5f01401c0af09d5f87335477359681ba7c939d` |
| brain-unet-pituitary-segmentation | `healixdz_seg_pituitary_v5_best.pth` | 256×256 | `cfd8fc4e55e6a4d7ca97e9613a95451d9680426bdd714f818786ab0e9983dd89` |

Weights are dictionaries with the parameters under `model_state`, loaded with
`torch.load(..., map_location="cpu", weights_only=True)` and
`load_state_dict(..., strict=True)` only. A file that does not load strictly
leaves its model **not loaded** (`error: "load_failed"`); there is no
`strict=False` fallback.

**Never loaded** (out of scope): `healixdz_seg_best.pth` (glioma, needs a
T1ce/FLAIR/T2 composite), the v2 `*_best.pth` files without `v5` (biased
pseudo-masks), the v4 flair/multimodal files.

### Preprocessing (as in training)

Colour decode (3 channels) → BGR→RGB → resize (224 for the classifier, 256
for the segmenters) with `cv2.INTER_LINEAR` → `/255` → mean
`[0.485, 0.456, 0.406]`, std `[0.229, 0.224, 0.225]`. One deterministic pass,
no test-time augmentation. Segmentation: sigmoid, threshold 0.5, mask resized
to the original image size with nearest-neighbour interpolation.

## Install

Python 3.12. Versions are pinned to training: torch 2.10.0, timm 1.0.25
(segmentation-models-pytorch 0.5.0 loads the v5 weights strictly).

```bash
uv venv .venv --python 3.12
uv pip install --python .venv -r requirements-dev.txt \
  --index-url https://pypi.org/simple \
  --extra-index-url https://download.pytorch.org/whl/cpu \
  --index-strategy unsafe-best-match
```

`requirements.txt` / `requirements-dev.txt` are compiled from the `.in` files
(command at the top of `requirements.in`).

## Configuration (environment)

| Variable | Default | |
| --- | --- | --- |
| `AI_SERVICE_TOKEN` | *(empty: every protected call refused)* | Shared secret, sent by the backend as `X-Service-Token` |
| `AI_MODELS_DIR` | `models` | Folder holding the `.pth` files |
| `AI_SERVICE_HOST` | `127.0.0.1` | |
| `AI_SERVICE_PORT` | `8001` | |
| `AI_MAX_IMAGE_BYTES` | `20971520` (20 MB) | Larger uploads: 413 |
| `AI_MAX_IMAGE_PIXELS` | `50000000` | Larger images: 422 |

## Run

```bash
AI_SERVICE_TOKEN=<secret> AI_MODELS_DIR=../models .venv/Scripts/python -m app.main
```

## API

All routes but `/health` require `X-Service-Token` (constant-time comparison).

- `GET /health` → `{ "status": "ok" }`
- `GET /models` → `{ "models": [{ modelId, file, loaded, weightsSha256, error }] }`
- `POST /analyze/brain` (multipart, field `image`, PNG or JPEG) →

```json
{
  "classification": {
    "modelId": "brain-efficientnetb4-tumor-classification",
    "weightsSha256": "…",
    "predictions": [{ "label": "meningioma", "probability": 0.93 }, "… 4 entries, descending"]
  },
  "segmentation": null,
  "segmentationSkippedReason": "not_applicable_for_class",
  "imageWidth": 512,
  "imageHeight": 512,
  "durationMs": 180
}
```

`segmentation`, when present: `{ modelId, weightsSha256, maskPng (base64,
one-channel PNG 0/255 at the original size), areaPx, areaRatio }`.
`segmentationSkippedReason`: `null`, `"not_applicable_for_class"` or
`"model_not_loaded"`.

Errors: 401 token, 413 too large, 422 not a decodable PNG/JPEG, 503
classifier not loaded.

## Tests

```bash
.venv/Scripts/python -m pytest
```

Tests that need the weights read `AI_MODELS_DIR` (default `../models`) and
are skipped when the files are absent. Routing is tested with stand-in
modules, independently of the weights.
