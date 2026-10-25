import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import {
  VOLUMETRY_IMAGE_PHASES,
  type VolumetryImagePhase,
} from '../volumetry/volumetry';

// A cine holds 2 to 30 phases, and a stack up to 100 slices (ai-service.client.ts);
// which ones exist in this run is checked in the service.
const MAX_PHASE_INDEX = 29;
const MAX_SLICE_INDEX = 99;

// What a physician changes on a cardiac volumetry before deciding (PATCH .../volumetry):
// the end-diastole and end-systole phases, the slices left out of the volumes, and the
// height and weight that give the body surface to index with. Everything is optional,
// each field replaces what was in force, and the measures are calculated again from the
// stored areas, with no new inference. The height and the weight are turned into a
// surface at once and are not kept.
export class CorrectVolumetryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PHASE_INDEX)
  edPhase?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PHASE_INDEX)
  esPhase?: number;

  // Replaces the whole list: [] puts every slice back.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SLICE_INDEX + 1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_SLICE_INDEX, { each: true })
  excludedSlices?: number[];

  // ED and ES chosen again, from the curve of the slices kept (they move when a
  // slice is left out); not with edPhase or esPhase.
  @IsOptional()
  @IsBoolean()
  automatic?: boolean;

  // Both or neither (checked in the service).
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(400)
  weightKg?: number;
}

// Which image of a cardiac volumetry (GET .../mask, .../overlay and .../slice): the
// phase kept by the model (its ED or its ES) and the slice, from the base (0).
export class VolumetryImageQueryDto {
  @IsOptional()
  @IsIn(VOLUMETRY_IMAGE_PHASES)
  phase?: VolumetryImagePhase;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_SLICE_INDEX)
  slice?: number;
}
