// The slices of a series, in the order they lie in the body. ImagePositionPatient
// (0020,0032) is the position of the first voxel, in millimetres; projected on
// the normal of the image plane (the cross product of the row and column
// directions of ImageOrientationPatient, 0020,0037) it gives the position along
// the stack, whatever the plane (axial, short axis, ...). A series that lacks
// one of these tags on a slice, or whose slices have not all the same
// orientation, is ordered by InstanceNumber instead.
export type OrderableInstance = {
  id: string;
  imageOrientationPatient: number[] | null;
  imagePositionPatient: number[] | null;
  instanceNumber: number | null;
};

const ORIENTATION_TOLERANCE = 1e-3;

function normalOf(orientation: number[]): [number, number, number] {
  const [rx, ry, rz, cx, cy, cz] = orientation;
  return [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx];
}

function sameOrientation(a: number[], b: number[]): boolean {
  return a.every(
    (value, index) => Math.abs(value - b[index]) <= ORIENTATION_TOLERANCE,
  );
}

function byInstanceNumber(a: OrderableInstance, b: OrderableInstance): number {
  const left = a.instanceNumber ?? Number.POSITIVE_INFINITY;
  const right = b.instanceNumber ?? Number.POSITIVE_INFINITY;
  if (left !== right) {
    return left < right ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

export function sortInstancesByPosition<T extends OrderableInstance>(
  instances: readonly T[],
): T[] {
  const first = instances[0]?.imageOrientationPatient;
  const positioned =
    first !== null &&
    first !== undefined &&
    instances.every(
      (instance) =>
        instance.imagePositionPatient !== null &&
        instance.imageOrientationPatient !== null &&
        sameOrientation(first, instance.imageOrientationPatient),
    );

  if (!positioned) {
    return [...instances].sort(byInstanceNumber);
  }

  const [nx, ny, nz] = normalOf(first);
  const position = (instance: T) => {
    const [x, y, z] = instance.imagePositionPatient as number[];
    return x * nx + y * ny + z * nz;
  };

  return [...instances].sort((a, b) => {
    const gap = position(a) - position(b);
    // Slices at the same place (several phases of a cine): by number.
    return Math.abs(gap) > ORIENTATION_TOLERANCE ? gap : byInstanceNumber(a, b);
  });
}
