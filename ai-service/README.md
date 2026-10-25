# HealixDZ AI service (brain, pathology and cardiology pipelines)

Inference service called by the NestJS backend only. CPU, FastAPI, listens on
`127.0.0.1` by default. It receives the bytes of one image or one ECG signal
file and nothing else: no patient identity ever reaches it.

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
| pathology-unet-pannuke-segmentation | `pannuke_unet_efficientnetb0_phase2_best.keras` | 256×256 | `02b26d77988f7aa38a15f39e7ba9a7a8946380563e26d1ca705c805d688bbf3c` |

An earlier file under the same name, SHA-256
`8d05b1f068d4fa9f25ed3ed9f05027d7fd68ef74af0bab15e798e6f324a5a248`, was the
wrong model (mean nuclei Dice 0.012 on Fold 3) and is discarded: never deploy
it. Its reports stay in `evaluation/` as history
(`pathology-2026-10-11-183500-c8cbd905-8d05b1f0.json`,
`pathology-2026-10-12-132137-c8cbd905-8d05b1f0.json`); the deployed file is
measured by `pathology-2026-10-12-184302-c8cbd905-02b26d77.json`.

Both models come from the training notebooks at the root of the repository:
[`notebooks/breakhis-classification-efficientnetb0.ipynb`](../notebooks/breakhis-classification-efficientnetb0.ipynb)
and [`notebooks/pannuke-segmentation.ipynb`](../notebooks/pannuke-segmentation.ipynb).
"The notebook" below is one of them.

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

The class map also comes as a colour overlay, from `app/nuclei_palette.json`
(Okabe-Ito colours, legible on H&E), read when the module loads:

| Class | Colour |
| --- | --- |
| neoplastic | `#D55E00` |
| inflammatory | `#0072B2` |
| connective | `#009E73` |
| dead | `#6E6E6E` |
| epithelial | `#F0E442` |

Background pixels stay transparent. A palette without exactly these five
types, or with a colour that is not `#RRGGBB`, stops the service at start-up.
On a 12-thread laptop CPU, a tile takes about 0.14 s (a 4096×4096 image is
361 tiles) and a classification about 0.5 s.

## Cardiology pipeline (ECG 12 leads)

One PyTorch model, `cardio-ecg-resnet1d-ptbxl-superdiagnostic`
(`app/ecg_models.py`, `app/ecg_input.py`, `app/ecg_pipeline.py`), behind its
own endpoint, independent of the other pipelines.

| Model id | File | Input | SHA-256 |
| --- | --- | --- | --- |
| cardio-ecg-resnet1d-ptbxl-superdiagnostic | `cardio-ecg-resnet1d-ptbxl.pt` | 12 × 1000 (10 s at 100 Hz) | `258e4e4de3c5b876b71bf172d335666ee75b3f5f0cae9806b1a71096e5a7b55a` |

HealixDzECGNet, a ResNet1D-34 trained on PTB-XL 1.0.1 (`records100`,
`strat_fold` 1–8 train, 9 validation, 10 test) for 5 **multi-label**
superclasses: `NORM, MI, STTC, CD, HYP`, a sigmoid each, compared with its own
threshold.

**The model card is the single source of truth**:
`cardio-ecg-resnet1d-ptbxl.json`, next to the weights, gives the lead order,
the sampling rate, the window, the band-pass filter, the normalisation, the
per-class thresholds and the notebook's test figures. Its `sha256` must be
the weights' (`error: "weights_sha256_mismatch"` otherwise); `/models` shows
both files and their SHA-256. A copy of the card is committed in
`tests/fixtures/ecg/model-card.json` (the frontend copies its test figures
from it; a test checks it is the deployed card).

**Input** (`POST /analyze/cardio/ecg`, 20 MB at most):

- **CSV/TXT**: a header naming the 12 leads (any order, case-insensitive:
  `aVR`, `AVR`, `avr`), an optional time column (`time`, `t`, `temps`, `ms`,
  `s`), `,`, `;` or tab as separator, decimal comma accepted with `;`. The
  sampling rate is **required** (`samplingRate`, 100 to 1000 Hz); `unit`:
  `mV` (default) or `uV`.
- **WFDB in a `.zip`**: one `.hea` and its `.dat` (4 entries, 50 MB
  unpacked at most, no absolute or `..` path); rate and unit come from the
  header. Extracted into a temporary folder, always deleted.
- A future format (DICOM waveform) is a new reader in `ecg_input._READERS`;
  paper, PDF or photographed ECGs are out of scope.

**Checks** (422, `detail.code`): `ecg_unsupported_format`,
`ecg_unsafe_archive`, `ecg_missing_leads` (with `missing`),
`ecg_sampling_rate_required`, `ecg_sampling_rate_invalid`, `ecg_unit_invalid`,
`ecg_too_short` (under 10 s: never padded), `ecg_too_long` (over 60 s),
`ecg_non_finite` (over 1 % NaN/inf; below, they become 0 as in training),
`ecg_flat_lead` (standard deviation under 0.01 mV), `ecg_amplitude_out_of_range`
(over 30 mV peak to peak: most likely µV declared as mV). 413
`file_too_large`.

**Preprocessing** (as in the notebook): `scipy.signal.resample_poly` to the
card's rate (reduced fraction; none at 100 Hz) → windows of 10 s every 5 s,
the last one aligned on the end of the signal (a 30 s ECG is 5 windows) →
Butterworth band-pass (order 3, 0.5–40 Hz, `filtfilt`) → z-score per lead
(eps 1e-8) → float32 inference on CPU, one at a time → sigmoid, averaged over
the windows.

**Decision support only**: the answer holds the probabilities, the card's
thresholds and the classes at or above them; never an urgency level nor a
course of action.

Measured precision against the notebook's fixtures (`tests/fixtures/ecg/`,
5 PTB-XL test ECGs): within 1e-3 at 100 Hz. At 500 Hz (the same ECGs from
`records500`), within 0.05, except one class close to its threshold (ECG 162,
MI 0.557 → 0.483): PTB-XL's own 100 Hz records differ from the 500 Hz ones
by a similar amount, and the model is sensitive near the threshold; the test
allows 0.1 for classes within 0.05 of their threshold and compares the
positive classes only away from it.

## Cardiology — MRI segmentation

`cardio-seg-acdc-unet-effb4` segments one short-axis cine-MRI slice into
background, left-ventricular cavity (`LV`), right-ventricular cavity (`RV`)
and left-ventricular myocardium (`MYO`). Its protected endpoint is
`POST /analyze/cardio/segmentation-mri`, multipart field `image`.

The model card `models/cardio-seg-acdc-unet-effb4.json` is the only source of
truth for the architecture, preprocessing, labels, test patients and test
metrics. The service checks the weights against the card's SHA-256 before
loading them and exposes both the weights and card hashes through `/models`.
Inference is float32 on CPU and serialized with the model's own lock.

Accepted inputs are grayscale PNG/JPEG images and single-frame DICOM files.
Clearly coloured images and multi-frame DICOM files are refused. DICOM
`MONOCHROME1` pixels are inverted before preprocessing; `PixelSpacing`, when
present and valid, is used to report areas in mm². Each side must be between
64 and 1024 pixels.

The response contains a one-channel class-map PNG, a transparent RGBA overlay,
the displayable analysed slice, the per-structure pixel count and optional
area in mm², pixel spacing, `noStructureFound`, and the model/weights/card
identifiers. It deliberately contains no diagnosis, volume or ejection
fraction: a single slice cannot provide them. Overlay colours live in
`app/cardio_seg_palette.json` and are validated at startup.

## Cardiology — MRI volumetry (cine stack)

`POST /analyze/cardio/volume-mri`, multipart field `stack`: a **.zip of
single-frame DICOM files** holding a whole short-axis cine (every slice, every
phase), up to 600 files and 300 MiB unpacked (`AI_MAX_STACK_BYTES`). The same
model (`cardio-seg-acdc-unet-effb4`) segments **every slice of every phase**, by
batches of 8, with exactly the preprocessing of the single-slice pipeline (only
the forward pass is shared: `predict_labels_batch`); the areas of `LV`, `RV` and
`MYO` in mm² are counted slice by slice and phase by phase, and
`app/cardio_volume_measures.py` turns them into volumes, ejection fractions and
the mass of the myocardium. A measurement aid for the physician to check, never
a diagnosis.

Reading the stack (`app/cardio_volume_input.py`): the images are grouped by
position in space (`ImagePositionPatient` projected on the normal of the plane)
and, inside a position, ordered by phase (`TriggerTime` when every image of the
position has one, else `InstanceNumber`). Both usual organisations give the same
stack: one series per position with N phases, or one series holding everything.
Refusals, 422 `cardio_volume_*`: `unsupported_format` (not a zip), `no_dicom`,
`unsafe_archive` (`reason`: `unsafe_path`, `too_many_files`, `too_large`),
`not_mr`, `multiframe`, `not_grayscale`, `undecodable`, `missing_geometry`
(`missing`: the tags that are absent), `mixed_orientation` (a normal more than 5°
from the first), `mixed_geometry` (`reason`: `pixel_spacing` or `image_size`),
`unequal_phases` (`phasesPerPosition`), `too_few_slices` (under 6),
`too_few_phases` (under 2), `too_many_phases` (over 30). An uneven step between
slices (more than 20 % from the median) is a warning, not a refusal.

Method. The volume of a structure at a phase is the sum over the slices of
(area in mm² x **step between slices** in mm) / 1000, in ml (Simpson's discs): the
step is the distance between successive positions along the normal, not
`SliceThickness`, which can leave a gap. ED and ES are the phases of the largest
and smallest LV volume. LV: EDV, ESV, SV = EDV − ESV, EF = SV / EDV; RV: the same;
mass of the LV myocardium = MYO volume at ED x 1.05 g/ml; cardiac output = SV x
heart rate, **only** when the heart rate is known (`HeartRate`, else
`NominalInterval`); values indexed to the body surface (Mosteller) when
`PatientSize` and `PatientWeight` are both there. The LVEF class is that of the
2021 ESC heart-failure guidelines (McDonagh et al., Eur Heart J 2021;42:3599-3726):
reduced ≤ 40 %, mildly reduced 41–49 %, preserved ≥ 50 %, read on the EF rounded
to the unit. The base is the end of the stack where the LV cavity is larger (the
DICOM geometry does not say which end is the apex): the answer says the order was
inferred, with a warning (`slice_order_uncertain`) when the two ends look alike.

The answer: `phases`, `slices` (`positionMm`, `stepMm`, base first), `sliceGapMm`,
`phaseTimesMs`, `areasMm2[phase][slice]` (`LV`, `RV`, `MYO`), `lvVolumeCurveMl`,
`edPhase` / `esPhase` (the automatic ones), `measures`, `bsaM2`, `heartRateBpm`,
`labelMapsPng` and `slicesPng` (`ed` and `es` only, one PNG per slice: the other
phases keep their areas, which are enough to recalculate), `warnings`, the model,
weights and card identifiers, `durationMs`. The height and the weight themselves
never leave the service, only the surface computed from them.
`compute_measures(areas, spacing, ed, es, excluded_slices, bsa, hr)` is pure: the
backend runs it again, written in TypeScript, when the physician moves ED or ES or
excludes a slice, and both are checked against
`tests/fixtures/cardio-volume/measures-cases.json` (inputs by hand, expected values
in exact rational arithmetic).

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
| `AI_MODELS_DIR` | `<repo>/models` | Folder holding the model weights, model cards and `breakhis_inference_config.json` |
| `AI_SERVICE_HOST` | `127.0.0.1` | |
| `AI_SERVICE_PORT` | `8001` | |
| `AI_MAX_IMAGE_BYTES` | `20971520` (20 MB) | Larger uploads (images and ECG files): 413 |
| `AI_MAX_IMAGE_PIXELS` | `50000000` | Larger images: 422 |
| `AI_MAX_STACK_BYTES` | `314572800` (300 MiB) | Larger cine stacks (the .zip): 413 `stack_too_large` |
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
  the three brain models, the two pathology ones, the ECG model and the
  cardiac MRI model; card-backed models also have `config: { file, sha256 }`.
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
  "overlayPng": "…base64…",
  "tiled": true,
  "tileCount": 9,
  "imageWidth": 600,
  "imageHeight": 500,
  "durationMs": 1600
}
```

`labelMapPng`: base64 of a one-channel PNG at the image's size, each pixel
its class index (0–5). `overlayPng`: base64 of an RGBA PNG of the same size,
each nucleus pixel in its type's colour with alpha 255, the background with
alpha 0. `classFractions.background`: share of all the pixels;
`nucleusTypes`: share of each type among the non-background pixels (`null`
each, when no pixel is a nucleus).

- `POST /analyze/cardio/ecg` (multipart: `file`, CSV/TXT or `.zip`;
  `samplingRate`, required for a CSV/TXT; `unit`: `mV` or `uV`) →

```json
{
  "modelId": "cardio-ecg-resnet1d-ptbxl-superdiagnostic",
  "weightsSha256": "…",
  "configSha256": "…",
  "probabilities": { "NORM": 0.04, "MI": 0.83, "STTC": 0.61, "CD": 0.1, "HYP": 0.05 },
  "thresholds": { "NORM": 0.6408, "MI": 0.5788, "STTC": 0.5285, "CD": 0.8064, "HYP": 0.8121 },
  "positive": ["MI", "STTC"],
  "windows": 5,
  "inputSamplingRate": 500,
  "durationSeconds": 30.0,
  "trace": { "I": ["… 1000 values"], "II": ["…"], "… 12 leads": [] },
  "traceSamplingRate": 100,
  "durationMs": 120
}
```

`positive`: the classes at or above their threshold, by decreasing
probability (possibly none). `trace`: the first 10 s at the card's rate,
band-pass filtered, **not** normalised, in mV rounded to the µV: what the
interface draws. 503 `model_not_loaded` without the model; the ECG refusals
are listed under *Cardiology pipeline*.

- `POST /analyze/cardio/segmentation-mri` (multipart: `image`, grayscale
  PNG/JPEG or single-frame DICOM) → `{ modelId, weightsSha256, configSha256,
  labelMapPng, overlayPng, slicePng, structures, pixelSpacingMm,
  noStructureFound, source, imageWidth, imageHeight, durationMs }`.
  `labelMapPng` contains class indices 0–3. `areaMm2` is `null` without valid
  DICOM pixel spacing. The endpoint returns 503 `model_not_loaded` when the
  model is unavailable.
- `POST /analyze/cardio/volume-mri` (multipart: `stack`, a .zip of single-frame
  DICOM files, a whole short-axis cine) → volumes, ejection fractions and
  myocardial mass: see *Cardiology — MRI volumetry*. 413 `stack_too_large`, 422
  `cardio_volume_*`, 503 `model_not_loaded`.

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
are skipped when the files are absent (`tests/test_cardio.py` and
`tests/test_cardio_seg.py`). Routing is tested with stand-in
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

**BreakHis**: the test split of the notebook
(`notebooks/breakhis-classification-efficientnetb0.ipynb`), rebuilt exactly: every image
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

**PanNuke**: Fold 3, the test fold of `notebooks/pannuke-segmentation.ipynb`
(2,722 patches; any other count
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

## Cardiology evaluation — ECG

`scripts/evaluate_cardio.py` replays the service's own ECG code
(`app.ecg_pipeline.predict`: windows, band-pass, z-score, inference, mean of
the sigmoid outputs; `app.ecg_input.validate_signal` for the checks) on the
notebook's test fold, on CPU. The service never imports it.

### Data (never committed)

PTB-XL 1.0.1 (<https://physionet.org/content/ptb-xl/1.0.1/>, licence CC BY
4.0). Give the folder that holds `ptbxl_database.csv`, `scp_statements.csv`
and `records100/`. Labels as in the notebook: the diagnostic SCP statements
of likelihood ≥ 50 mapped to their superclass, ECGs without any left out,
`strat_fold` 10 as test (2,055 ECGs).

### Commands (PowerShell)

```powershell
cd <repository>\ai-service

# Quick check on the first 100 ECGs: writes cardio-<date>-<sha8>-partial.json,
# never cardio-latest.json
.\.venv\Scripts\python.exe -m scripts.evaluate_cardio --ptbxl C:\datasets\ptb-xl-1.0.1 --limit 100

# Full test fold
.\.venv\Scripts\python.exe -m scripts.evaluate_cardio --ptbxl C:\datasets\ptb-xl-1.0.1
```

Writes `evaluation/cardio-<date>-<sha256[:8] of the weights>.json`, copied to
`evaluation/cardio-latest.json`: AUC per class and macro, sensitivity,
specificity, PPV, F1 and counts at the card's thresholds, the ECGs the
service's checks would refuse (still scored, as in the notebook), the weights
and card SHA-256 and the library versions. Exit code 1 when the macro AUC
differs from the card's test figure by more than 0.005; 2 when the dataset or
the model is missing. The backend quotes `cardio-latest.json` in the PDF
report and on the result page when its SHA-256 is the analysis's own;
otherwise the card's test figures, marked as the notebook's.

Not run yet in this repository (PTB-XL is not on the development machine):
the figures shown today are the notebook's.

### What it does not measure

- **No clinical validation**: PTB-XL is one public dataset, recorded with one
  type of device; performances must be confirmed on the establishment's ECGs.
- The 5 superclasses only: no rhythm statement, no measurement (intervals,
  axis).
- The notebook ran on GPU: small numerical differences are possible.

## Cardiology evaluation — MRI segmentation

Do not run this evaluation without the complete preprocessed ACDC dataset.
The command uses `patientXXX_frameYY_slice_Z.h5` files when present. For phases
without 2D files, it reads `patientXXX_frameYY.h5` from `ACDC_testing_volumes`
and takes slices along axis 0 (`image` and `label` keys):

```powershell
cd <repository>\ai-service
.\.venv\Scripts\python.exe -m scripts.evaluate_cardio_seg --acdc C:\datasets\ACDC_preprocessed
```

Before any inference, the script groups slices by patient and phase and stops
unless their volume count matches the model card. It remaps the original ACDC
labels to the service's `LV`, `RV`, `MYO` order, runs each slice through the
production preprocessing/inference path, and computes 3D Dice per volume at
256 × 256. A structure absent from both prediction and reference has a `NaN`
Dice and is excluded from that structure's mean and standard deviation.

Reports are written as `evaluation/cardio-seg-<date>-<sha8>.json` and copied
to `evaluation/cardio-seg-latest.json`. Exit code 1 means the measured mean
differs from the model card beyond its allowed tolerance; exit code 2 means
the dataset or model is unavailable or the expected test split was not found.

## Cardiology evaluation — MRI volumetry

The same dataset and the same rules as the segmentation evaluation, for the
ejection fractions and the volumes. Never run without the complete test set:

```powershell
cd <repository>\ai-service
.\.venv\Scripts\python.exe -m scripts.evaluate_cardio_volume --acdc C:\datasets\ACDC_preprocessed
# with the original NIfTI (volumes in ml and mass), and the figures of the thesis:
.\.venv\Scripts\python.exe -m scripts.evaluate_cardio_volume --acdc C:\datasets\ACDC_preprocessed `
    --acdc-nifti C:\datasets\ACDC\database --figures C:\datasets\figures
```

With the preprocessed slices (ED and ES only, no pixel spacing) it measures the
**LV and RV ejection fractions** from the predicted and the true masks: the
spacing cancels out in the ratio of two volumes of the same patient, and ED is the
phase whose true LV is the larger. With `--acdc-nifti` (`database/training` and
`database/testing`, with `pixdim` and `Info.cfg`) it also measures the **LV
end-diastolic and end-systolic volumes in ml and the LV mass**, at the ED and ES of
`Info.cfg`; each frame is rescaled to [0, 1] over its volume first, as the
preprocessing that wrote the h5 files did (not checkable without the Kaggle files
next to the NIfTI). For each measure: mean absolute error, bias and 95 % limits of
agreement (Bland-Altman, bias ± 1.96 SD of the differences), Pearson's r. The 3D
Dice of the segmentation is computed on the way and compared with the card's: the
volumes only mean something while the batch inference still reproduces the
notebook.

The number of volumes (44) is checked before any inference. Reports:
`evaluation/cardio-volume-<date>-<sha8>.json`, copied to
`evaluation/cardio-volume-latest.json` (the backend prints the LVEF bias and limits
of agreement of that file in the report of an analysis, and nothing when it is
missing). `--figures` writes `lvef-bland-altman.pdf` and `lvef-predicted-vs-truth.pdf`
and **refuses a folder inside the repository**. Exit code 1: the mean Dice differs
from the card's by more than 0.005; exit code 2: data, model or folder missing, or
not what the card expects. No image of the database is written.

### Sample stack from ACDC (never committed)

```powershell
.\.venv\Scripts\python.exe -m scripts.make_sample_cine_dicom `
    --acdc-patient C:\datasets\ACDC\database\training\patient001 --output C:\datasets\cine-patient001.zip
```

Turns one patient (`patient001_4d.nii.gz` and `Info.cfg`) into a cine DICOM stack
ready to import in HealixDZ: all the phases, one series per position (or
`--organisation single-series`), position, orientation, `PixelSpacing`,
`SliceThickness`, `TriggerTime`, `PatientSize` and `PatientWeight`, new UIDs and a
made-up patient. `--heart-rate` and `--rr-interval-ms` give a heart rate and a
phase timing that ACDC does not hold. It needs nibabel (development dependency).
The pixel data is ACDC's: **the licence forbids sharing it, so the archive stays on
your machine**.
