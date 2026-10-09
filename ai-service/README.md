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
| `AI_MODELS_DIR` | `<repo>/models` | Folder holding the `.pth` files |
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

## Evaluation

`scripts/evaluate_brain.py` measures the service as it runs, offline: every
image goes through the service's own code (`app.preprocess`, then
`app.pipeline.analyze_brain` for the classification and `_segment` for the
masks), on CPU, in one deterministic pass, without test-time augmentation.
The service never imports it; scikit-learn and pandas are dev dependencies
only.

### Data (never committed)

Keep the datasets outside the repository, or in an ignored `data/` folder.

- **Classification**: the `Testing` folder of the Nickparvar *Brain Tumor MRI
  Dataset* (<https://www.kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset>),
  with the subfolders `glioma`, `meningioma`, `notumor`, `pituitary` (`no_tumor`
  and `normal` are read as `notumor`, as in the training notebook). The
  classifier was trained on Training (5-fold) + BraTS 2021, never on Testing,
  from the 7,200-image version of the dataset (Testing: 400 images per class).
  Another version, such as the earlier 7,023-image one (Testing 300 / 306 /
  405 / 300), is still evaluated but flagged (`matchesTrainingVersion: false`):
  its Testing images may sit in the Training split of the version used for
  training, which would make the figures optimistic.
- **Segmentation** (optional): BRISC 2025
  (<https://www.kaggle.com/datasets/briscdataset/brisc2025>). Copy the whole
  dataset: `manifest.csv` alone is not enough, its `segmentation_task` folder
  must sit next to it.

### Expected layout

```text
C:\datasets\
├── nickparvar\
│   └── Testing\                ← --nickparvar-test (its parent folder works too)
│       ├── glioma\             *.jpg
│       ├── meningioma\
│       ├── notumor\            (or no_tumor / normal)
│       └── pituitary\
└── brisc2025\                  ← --brisc-root (manifest.csv also found 1 or 2 levels below)
    ├── manifest.csv
    └── segmentation_task\      next to manifest.csv
        ├── train\
        │   ├── images\         *.jpg
        │   └── masks\          *.png
        └── test\
            ├── images\
            └── masks\
```

Nickparvar's `Training` and BRISC's `classification_task` are not used. The
BRISC archive unpacks as `brisc2025\brisc2025\manifest.csv`: either folder
can be given.

### Commands (PowerShell)

Run `--check` first: it resolves the paths, loads the weights (loaded or not,
with their SHA-256) and counts the images per class and the BRISC pairs and
test images, then stops **without any inference**. Exit code 0 when everything
is ready, 1 otherwise, with what to fix.

```powershell
cd <repository>\ai-service

# 1. Check: paths, weights, counts; no inference
.\.venv\Scripts\python.exe -m scripts.evaluate_brain --check `
  --nickparvar-test C:\datasets\nickparvar\Testing `
  --brisc-root C:\datasets\brisc2025

# 2. Evaluate: the same command without --check
.\.venv\Scripts\python.exe -m scripts.evaluate_brain `
  --nickparvar-test C:\datasets\nickparvar\Testing `
  --brisc-root C:\datasets\brisc2025
```

Paths can be pasted from the Explorer's address bar. Quotes and a trailing `\`
are removed (PowerShell hands `"C:\datasets\"` to the program as
`C:\datasets"`), `~` is expanded, and messages show the resolved path. Quote a
path that contains spaces. In PowerShell, a command continues on the next line
with a backtick, not with `\`.

`--models-dir` defaults to `AI_MODELS_DIR`, as for the service; `--output-dir`
to `evaluation/`. Each run writes a new
`evaluation/brain-<date>-<HHMMSS>-<first 8 characters of the classifier SHA-256>.json`
(SHA-256 of the three weight files, torch / timm / smp / OpenCV versions,
counts per class, every metric; the report names itself in `file`) and prints
a summary. A report is never overwritten. A **complete** run (classification
and segmentation both evaluated) is also copied to `evaluation/brain-latest.json`;
a partial run leaves that copy as it was. The figures shown in the frontend
come from `brain-latest.json`
(`frontend/src/features/ai-analyses/brain-evaluation.ts`, checked against it by
its test). Commit the JSON files: they hold no image and no patient data.
Exit codes: 0 done; 1 a path, weight or
dataset problem (nothing evaluated); 2 the segmentation part was stopped (the
classification is still evaluated).

### What it measures

**Classification**: accuracy, confusion matrix, precision / recall / F1 per
class, one-vs-rest AUC per class and macro; 95 % bootstrap intervals (1,000
draws, seed 42, percentile) for the accuracy and each class's recall;
calibration (ECE on 10 bins and the reliability table); accuracy above a
confidence threshold, from 0.50 to 0.95 by 0.05 (share of the images kept and
accuracy on them).

**Segmentation**: the test split of `segmentation-reelle.ipynb`, reproduced
exactly: `manifest.csv` rows with the class as `tumor_label` and `task ==
"segmentation"`, images and masks told apart by `is_mask`, Windows paths
converted, masks paired by file name without extension, empty masks left out,
manifest order kept; then `train_test_split(test_size=0.15, random_state=42)`
and `train_test_split(test_size=0.5, random_state=42)` on the remainder, whose
second half is the test set. Before building the pairs, the script checks that
every meningioma and pituitary file the manifest names is on disk: if any is
missing, the segmentation stops and names a few of them. It then checks that
it finds 1,635 pairs and
123 test images for meningioma, 1,757 and 132 for pituitary: any other count
stops the segmentation part before any inference, and no Dice is printed,
since another split would mix training images into the test set. The official
BRISC test folder is never used as is: the notebook mixed it into training.

Per test image, on the mask the service returns (original image size): Dice,
IoU, sensitivity, then their mean, median and 95 % bootstrap interval. For
comparison: the notebook's own measure (256 × 256, averaged per batch of 16),
and the routing (how many test images the classifier sends to that segmenter;
end-to-end Dice, 0 when the service returns no mask).

### What it does not measure

- **No clinical validation**: public 2D datasets, not representative of a
  given site's scanners, protocols or patients.
- **No patient-level split**: neither dataset identifies patients, so slices
  of one patient may sit on both sides of a split; the figures may be
  optimistic.
- The notebooks' own figures used test-time augmentation (classification) and
  mixed precision on GPU: they are shown for comparison, not reproduced.
