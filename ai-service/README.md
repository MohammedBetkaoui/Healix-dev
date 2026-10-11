# HealixDZ AI service (brain and pathology pipelines)

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

## Pathology pipelines

Two Keras models (TensorFlow 2.20.0 / Keras 3.13.2, `.keras` files), each
behind its own endpoint, independent of the brain pipeline.

| Model id | File | Input | SHA-256 |
| --- | --- | --- | --- |
| pathology-breakhis-classification | `EfficientNetB0_BreakHis_phase2.keras` | 224×224 | `c8cbd905cc039ed4775c98043e04d357bcfcaf971c4b9cc592a3600f97348e6b` |
| pathology-unet-pannuke-segmentation | `pannuke_unet_efficientnetb0_phase2_best.keras` | 256×256 | `8d05b1f068d4fa9f25ed3ed9f05027d7fd68ef74af0bab15e798e6f324a5a248` |

The classifier's inference settings sit next to its weights:
`breakhis_inference_config.json` (the BreakHis notebook's
`inference_config.json`, renamed), SHA-256
`ea0646849ab49e9ce148f902895693f6a304f2e329d9cb2e591fe07c8025f552`.

The models are loaded with `keras.saving.load_model(path, compile=False,
safe_mode=True)` only (`safe_mode` refuses Python code stored in the archive,
such as a `Lambda` layer). A model stays **not loaded**, with its error, when:

- its file is missing (`weights_missing`), does not load, or has another input
  or output shape than (None, 224, 224, 3) → (None, 1) for the classifier and
  (None, 256, 256, 3) → (None, 256, 256, 6) for the segmenter (`load_failed`);
- for the classifier, `breakhis_inference_config.json` is missing
  (`config_missing`), or its `decision_threshold` is not 0.13 or its
  `positive_class` not `malignant` (`config_invalid`).

There is no degraded load. TensorFlow's thread pools are capped
(`AI_TF_INTRA_OP_THREADS`, `AI_TF_INTER_OP_THREADS`) so that a pathology
analysis leaves CPU to the PyTorch models, and each pathology model runs one
inference at a time (one lock per model). Importing TensorFlow adds about
10 s to the start-up.

### Breast histopathology classification (BreakHis)

Benign or malignant, on one microscopy image (PNG or JPEG).

Preprocessing, as `load_image` in the notebook: RGB, 3 channels →
`tf.cast` to float32 **without dividing by 255** (EfficientNetB0 normalizes
internally) → `tf.image.resize(…, (224, 224), method="bilinear",
antialias=True)` → `tf.clip_by_value(…, 0, 255)`.

Test-time augmentation, always: 4 views (the image, `tf.image.flip_left_right`,
`tf.image.flip_up_down`, both flips), score = mean of the 4 sigmoid outputs.
Decision: `malignant` when the score is at least the threshold read from the
config (0.13, chosen on the validation patients for the best F1), `benign`
otherwise.

The score is **not calibrated**: it is a malignancy score, never a
probability.

The magnification (40, 100, 200 or 400, required) is not a model input: it
is checked, returned and logged.

### Nuclei segmentation (PanNuke)

Six classes, in output index order: 0 background, 1 neoplastic,
2 inflammatory, 3 connective, 4 dead, 5 epithelial. RGB → float32 / 255
(range [0, 1]) → model, 256×256 exactly → argmax of the softmax.

- A 256×256 image: one pass.
- A larger image (each side at least 256 px): 256×256 tiles overlapping by
  32 px (stride 224). The image is mirrored by 16 px at its top and left
  edges, and up to a whole number of tiles at its bottom and right edges;
  each tile keeps only its central 224×224, and these centres cover the image
  exactly once.
- A side under 256 px: 422 `image_too_small`. A side over
  `AI_NUCLEI_MAX_SIDE` (default 4096): 422 `image_dimensions_too_large`.

No nucleus is counted: the output is a class per pixel, and pixel shares.
On a 12-thread laptop CPU, a tile takes about 0.14 s (a 4096×4096 image is
361 tiles) and a classification about 0.5 s.

## Install

Python 3.12. Versions are pinned to training: torch 2.10.0, timm 1.0.25
(segmentation-models-pytorch 0.5.0 loads the v5 weights strictly) for the
brain; tensorflow-cpu 2.20.0 and keras 3.13.2 for the pathology models.

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
| `AI_MODELS_DIR` | `<repo>/models` | Folder holding the `.pth` and `.keras` files and `breakhis_inference_config.json` |
| `AI_SERVICE_HOST` | `127.0.0.1` | |
| `AI_SERVICE_PORT` | `8001` | |
| `AI_MAX_IMAGE_BYTES` | `20971520` (20 MB) | Larger uploads: 413 |
| `AI_MAX_IMAGE_PIXELS` | `50000000` | Larger images: 422 |
| `AI_NUCLEI_MAX_SIDE` | `4096` | Nuclei segmentation: longer sides get 422 |
| `AI_TF_INTRA_OP_THREADS` | half the CPUs | TensorFlow threads per operation |
| `AI_TF_INTER_OP_THREADS` | `2` | TensorFlow operations run in parallel |

## Run

```bash
AI_SERVICE_TOKEN=<secret> AI_MODELS_DIR=../models .venv/Scripts/python -m app.main
```

## API

All routes but `/health` require `X-Service-Token` (constant-time comparison).

- `GET /health` → `{ "status": "ok" }`
- `GET /models` → `{ "models": [{ modelId, file, loaded, weightsSha256, error }] }`:
  the three brain models, then the two pathology ones; the BreakHis
  classifier also has `config: { file, sha256 }`.
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

- `POST /analyze/pathology/breast-classification` (multipart: `image`, PNG
  or JPEG; `magnification`: `40`, `100`, `200` or `400`) →

```json
{
  "modelId": "pathology-breakhis-classification",
  "weightsSha256": "…",
  "malignancyScore": 0.81,
  "threshold": 0.13,
  "decision": "malignant",
  "views": [0.79, 0.83, 0.8, 0.82],
  "magnification": 200,
  "durationMs": 480
}
```

`views`: the scores of the image, of its left-right flip, its up-down flip
and both flips; `malignancyScore` is their mean.

- `POST /analyze/pathology/nuclei-segmentation` (multipart: `image`, PNG or
  JPEG) →

```json
{
  "modelId": "pathology-unet-pannuke-segmentation",
  "weightsSha256": "…",
  "labelMapPng": "…base64…",
  "classFractions": {
    "background": 0.87,
    "nucleusTypes": { "neoplastic": 0.52, "inflammatory": 0.11, "connective": 0.3, "dead": 0.01, "epithelial": 0.06 }
  },
  "tiled": true,
  "tileCount": 9,
  "durationMs": 1600
}
```

`labelMapPng`: base64 of a one-channel PNG at the image's size, each pixel
its class index (0–5). `classFractions.background`: share of all the pixels;
`nucleusTypes`: share of each type among the non-background pixels (`null`
when there is none).

Errors, on every endpoint: 401 token, 413 too large, 422 `invalid_image`
(not a decodable PNG/JPEG), 503 `model_not_loaded` (the classifier, for
`/analyze/brain`). Pathology only, 422: `invalid_magnification` (missing, or
not 40, 100, 200 or 400), `image_too_small` (`minSide`: 256),
`image_dimensions_too_large` (`maxSide`).

## Tests

```bash
.venv/Scripts/python -m pytest
```

Tests that need the weights read `AI_MODELS_DIR` (default `../models`) and
are skipped when the files are absent. Routing is tested with stand-in
modules, independently of the weights; so are the pathology pipelines (test-time
augmentation, threshold, tiling and rebuilt label map), and the Keras loading
with tiny models saved by the tests.

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

## Pathology evaluation

`scripts/evaluate_pathology.py` measures the pathology pipelines as the service
runs them, with the same structure and rules as `evaluate_brain.py`: every
image goes through the service's own code (`app.pathology_pipeline.analyze_breast`
and `analyze_nuclei`, from the image bytes: the PanNuke patches and mosaics are
first encoded as PNG, losslessly), on CPU, with the service's thread settings.
The service never imports it.

### Data (never committed)

- **BreakHis**: BreaKHis v1, breast tumour histopathology images
  (<https://web.inf.ufpr.br/vri/databases/breast-cancer-histopathological-database-breakhis/>;
  the notebook used the Kaggle copy <https://www.kaggle.com/datasets/ambarish/breakhis>).
  Give the folder that holds `BreaKHis_v1` (or `BreaKHis_v1` itself). The
  images are searched at any depth below it; the Kaggle archive nests
  `BreaKHis_v1\BreaKHis_v1\histology_slides\breast\…`, which works as is.
  `Folds.csv` is not used.
- **PanNuke**: <https://warwick.ac.uk/fac/cross_fac/tia/data/pannuke> (licence
  CC BY-NC-SA 4.0: non-commercial use). Give the folder that holds `fold_1`,
  `fold_2` and `fold_3`, as in the `PanNuke_Segmentation` archive the notebook
  used. Only `fold_3` is read; its `images.npy`, `masks.npy` and `types.npy`
  are found once each at any depth inside it, and memory-mapped (Fold 3 is
  12.8 GB unpacked, never loaded whole; about 13 GB of free disk space).

```text
C:\datasets\
├── breakhis\                    ← --breakhis-root (BreaKHis_v1 itself works too)
│   └── BreaKHis_v1\
│       └── …\histology_slides\breast\
│           ├── benign\SOB\…\*.png
│           └── malignant\SOB\…\*.png
└── pannuke\                     ← --pannuke-root
    ├── fold_1\  fold_2\         (not read: training and validation folds)
    └── fold_3\
        └── Fold 3\
            ├── images\fold3\images.npy, types.npy
            └── masks\fold3\masks.npy
```

### Commands (PowerShell)

```powershell
cd <repository>\ai-service

# 1. Check: paths, weights, BreakHis split, Fold 3 size; no inference
.\.venv\Scripts\python.exe -m scripts.evaluate_pathology --check `
  --breakhis-root C:\datasets\breakhis `
  --pannuke-root C:\datasets\pannuke

# 2. Evaluate: the same command without --check
.\.venv\Scripts\python.exe -m scripts.evaluate_pathology `
  --breakhis-root C:\datasets\breakhis `
  --pannuke-root C:\datasets\pannuke
```

Paths are read as for `evaluate_brain.py` (quotes and a trailing `\` removed,
`~` expanded). `--models-dir` defaults to `AI_MODELS_DIR`, `--output-dir` to
`evaluation/`. Each run writes a new
`evaluation/pathology-<date>-<HHMMSS>-<classifier SHA-256[:8]>-<segmenter SHA-256[:8]>.json`
(SHA-256 of both models and of the BreakHis config, TensorFlow / Keras /
OpenCV versions, every metric; the report names itself in `file`), never
over an existing one, and prints a summary. A **complete** run (BreakHis and
PanNuke both evaluated, tiling check included) is also copied to
`evaluation/pathology-latest.json`; a partial run leaves that copy as it was.
Exit codes: 0 done; 1 a path or weight problem (nothing evaluated); 2 a part
was stopped (the other one is still evaluated). On a laptop CPU, count about
10 minutes for BreakHis and 25 for PanNuke.

### What it measures

**BreakHis**: the test split of the notebook, rebuilt exactly: every image
below `BreaKHis_v1`, sorted; the class from its path (`…/benign/…` or
`…/malignant/…`, checked against the `SOB_B` / `SOB_M` of its name), the
patient and magnification from its name
`SOB_<B|M>_<subtype>-<patient>-<magnification>-<n>.png`; one row per patient
(sorted, label of its first image); then
`train_test_split(test_size=0.30, random_state=42, stratify=label)` and
`train_test_split(test_size=0.50, random_state=42, stratify=label)` on the
remainder, whose second part is the test set. The script checks, before any
inference, that the test set is exactly the 13 patients 14-11031, 14-12773,
14-14946, 14-15704, 14-16456, 14-19854C, 14-21978AB, 14-22704, 14-2773,
14-29315EF, 14-3909, 14-4372 and 14-9146, with 1,346 images (347 benign,
999 malignant). Anything else stops the BreakHis part: another split would
mix training patients into the test set.

At the service's threshold (0.13): accuracy, sensitivity, specificity,
precision, F1, ROC AUC and PR AUC (average precision), confusion matrix; 95 %
intervals from 1,000 bootstrap draws of **patients** (all the images of each
drawn patient; seed 42), a draw where a metric is undefined being left out of
it; the same metrics per magnification; per patient, the mean score and the
majority decision of its images. Compared with the notebook (cell 20):
accuracy 0.8819, ROC AUC 0.9392, matrix [[262, 85], [74, 925]].

**PanNuke**: Fold 3, the notebook's test fold (2,722 patches; any other count
stops the part). Reference mask: channel c (0–4) > 0 → class c + 1; a pixel
under several channels → 255, left out; any other → background. Dice and IoU
per class from pixel counts pooled over the whole fold (not a mean per
image), mean Dice of the five nucleus types, and the same per tissue
(`types.npy`). The notebook's figures (background 0.9625, neoplastic 0.7119,
inflammatory 0.6239, connective 0.5600, dead 0.3056, epithelial 0.6230,
nuclei mean 0.5649) come from its cell 10, which evaluates
`val_dataset.take(316)`: **Fold 2**, the validation fold the checkpoint was
selected on, not Fold 3. They are shown for comparison; a gap is expected.

**Tiled path**: consecutive Fold 3 patches assembled into 2 × 2 mosaics
(512 × 512; 680 mosaics), segmented through the service's large-image path
(9 tiles each), and compared with the same patches segmented one by one: share
of identical pixels and Dice per class between the two, then the Dice of each
path against the reference on those patches. It is the only measure of that
path.

### What it does not measure

- **No clinical validation**: public datasets, not representative of a given
  laboratory's staining, scanners or patients.
- **BreakHis**: 13 test patients only, so wide intervals; one decision per
  image (no slide or patient decision in the service); the score is not
  calibrated, and the magnification is not a model input.
- **PanNuke**: a class per pixel, not nuclei: no count, no instance
  separation, no detection quality (PQ). One fold, the notebook's test fold:
  no cross-validation of this model. The mosaics join unrelated patches: the
  tiled path is not measured on real large images.
- The notebooks ran on GPU: small numerical differences with this CPU run are
  possible.
