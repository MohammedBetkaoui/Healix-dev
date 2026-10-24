import {
  sortInstancesByPosition,
  type OrderableInstance,
} from './dicom-instance-order';

const AXIAL = [1, 0, 0, 0, 1, 0];
const SAGITTAL = [0, 1, 0, 0, 0, -1];

const slice = (
  id: string,
  position: number[] | null,
  orientation: number[] | null,
  instanceNumber: number | null,
): OrderableInstance => ({
  id,
  imageOrientationPatient: orientation,
  imagePositionPatient: position,
  instanceNumber,
});

const ids = (instances: OrderableInstance[]) =>
  instances.map((item) => item.id);

describe('sortInstancesByPosition', () => {
  it('orders axial slices along z, whatever their instance numbers', () => {
    const sorted = sortInstancesByPosition([
      slice('c', [-100, -100, 30], AXIAL, 1),
      slice('a', [-100, -100, -10], AXIAL, 3),
      slice('b', [-100, -100, 10], AXIAL, 2),
    ]);

    expect(ids(sorted)).toEqual(['a', 'b', 'c']);
  });

  it('projects on the normal of the plane: sagittal slices go along x', () => {
    // Row (0,1,0) x column (0,0,-1) = (-1, 0, 0): positions run against x.
    const sorted = sortInstancesByPosition([
      slice('far', [50, 0, 0], SAGITTAL, 1),
      slice('near', [-50, 0, 0], SAGITTAL, 2),
    ]);

    expect(ids(sorted)).toEqual(['far', 'near']);
  });

  it('breaks a tie (several phases at one position) by instance number', () => {
    const sorted = sortInstancesByPosition([
      slice('ph2', [0, 0, 5], AXIAL, 12),
      slice('ph1', [0, 0, 5], AXIAL, 11),
      slice('below', [0, 0, 0], AXIAL, 20),
    ]);

    expect(ids(sorted)).toEqual(['below', 'ph1', 'ph2']);
  });

  it('falls back on the instance number when a slice has no position', () => {
    const sorted = sortInstancesByPosition([
      slice('x', [0, 0, 99], AXIAL, 2),
      slice('y', null, AXIAL, 1),
      slice('z', [0, 0, -99], AXIAL, 3),
    ]);

    expect(ids(sorted)).toEqual(['y', 'x', 'z']);
  });

  it('falls back on the instance number when the orientations differ', () => {
    const sorted = sortInstancesByPosition([
      slice('b', [0, 0, 0], AXIAL, 2),
      slice('a', [0, 0, 50], SAGITTAL, 1),
    ]);

    expect(ids(sorted)).toEqual(['a', 'b']);
  });

  it('puts an instance without a number last, and is stable on the identifier', () => {
    const sorted = sortInstancesByPosition([
      slice('n2', null, null, null),
      slice('n1', null, null, null),
      slice('first', null, null, 1),
    ]);

    expect(ids(sorted)).toEqual(['first', 'n1', 'n2']);
  });

  it('does not modify the list it is given', () => {
    const input = [slice('b', null, null, 2), slice('a', null, null, 1)];

    sortInstancesByPosition(input);

    expect(ids(input)).toEqual(['b', 'a']);
  });

  it('handles an empty series', () => {
    expect(sortInstancesByPosition([])).toEqual([]);
  });
});
