/**
 * iOS lens selection for `CameraView`.
 *
 * On multi-lens iPhones the native default resolves to a *virtual* device
 * (`builtInTripleCamera` / `builtInDualWideCamera`). A virtual device starts at
 * zoom factor 1.0, which is the **ultra-wide** element — so the scanner opened
 * at 0.5x. Passing `selectedLens` pins the plain wide-angle lens (1x) instead.
 *
 * `selectedLens` is matched natively against `AVCaptureDevice.localizedName`,
 * not against the `builtIn*` constant the Expo docs suggest, so we have to pick
 * a name out of the list the camera reports. Every qualifier ("Ultra Wide",
 * "Dual", "Triple", "Telephoto") is *appended* to the plain name, in English and
 * in localized names alike — so the shortest name is the plain wide-angle lens.
 */
export function pickWideAngleLens(lenses: string[]): string | undefined {
  let best: string | undefined;
  for (const lens of lenses) {
    if (!lens) continue;
    if (
      best === undefined ||
      lens.length < best.length ||
      (lens.length === best.length && lens < best)
    ) {
      best = lens;
    }
  }
  return best;
}
