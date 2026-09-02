import { pickWideAngleLens } from '../utils/cameraLens';

describe('pickWideAngleLens', () => {
  it('picks the plain wide-angle lens on a triple-camera iPhone', () => {
    // The order the native side reports (alphabetically sorted).
    expect(
      pickWideAngleLens([
        'Back Camera',
        'Back Dual Camera',
        'Back Dual Wide Camera',
        'Back Telephoto Camera',
        'Back Triple Camera',
        'Back Ultra Wide Camera',
      ]),
    ).toBe('Back Camera');
  });

  it('picks the plain lens when the names are localized', () => {
    expect(
      pickWideAngleLens([
        'Πίσω κάμερα',
        'Πίσω κάμερα διπλού ευρέος φακού',
        'Πίσω κάμερα υπερευρέος φακού',
      ]),
    ).toBe('Πίσω κάμερα');
  });

  it('handles a single-lens device', () => {
    expect(pickWideAngleLens(['Back Camera'])).toBe('Back Camera');
  });

  it('returns undefined when nothing is reported, so the native default stands', () => {
    expect(pickWideAngleLens([])).toBeUndefined();
    expect(pickWideAngleLens([''])).toBeUndefined();
  });

  it('is deterministic when two names tie on length', () => {
    expect(pickWideAngleLens(['B Camera', 'A Camera'])).toBe('A Camera');
  });
});
