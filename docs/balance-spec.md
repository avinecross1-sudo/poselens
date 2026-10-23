# Balance & Ground Contact Spec

## Foot contact detection
For each foot (L/R): sample heel, ball, toe points in world space.
- contact = distance(point, ground plane) < 2cm.
- Foot states: planted (>= 2 contacts), edge (1 contact), floating (0 contacts).

## Support polygon
- Convex hull of all contact points across both feet, projected onto ground plane.
- If no contact: empty polygon, warning = "no ground contact".

## Center of mass
- Segment centroids from mannequin transform graph (hips, spine, chest, head, upper/lower arms, hands, thighs, shins, feet).
- Segment masses from body preset mass ratios (default human ratios; heavier presets shift mass toward hips/torso).
- CoM = weighted average of segment centroids in world space.

### Default segment mass ratios
Fractions of total body mass, from standard adult anthropometric tables
(Dempster, as tabulated by Winter). Per side for paired segments; totals 1.0.

| Segment | Ratio | Notes |
|---|---|---|
| head (incl. neck) | 0.081 | |
| chest | 0.216 | thorax |
| spine | 0.139 | abdomen |
| hips | 0.142 | pelvis |
| upperArm L/R | 0.028 each | |
| forearm L/R | 0.016 each | |
| hand L/R | 0.006 each | |
| thigh L/R | 0.100 each | |
| shin L/R | 0.0465 each | |
| foot L/R (incl. toe) | 0.0145 each | |

Shoulders have no mass of their own (counted in chest).

### Preset adjustment
Applied on top of the default ratios, then renormalized so all ratios sum to 1.0.
- Torso shift: `torsoBoost = MAX_TORSO_BOOST * max(0, mass - MASS_NEUTRAL) / (1 - MASS_NEUTRAL)`,
  with `MASS_NEUTRAL = 0.5` and `MAX_TORSO_BOOST = 0.25`. Multiply hips and spine ratios by `(1 + torsoBoost)`.
  Mass slider at or below 0.5 leaves ratios unchanged.
- Head scale: once a head-size slider exists (Phase 2), multiply the head ratio by `headScale^3`
  (mass follows volume). Child and Chibi presets rely on this.
- Ratios are recomputed whenever body sliders change, so CoM responds to sliders.
- CoM = weighted average of segment centroids in world space.

## Warnings
- "CoM outside support polygon" if projected CoM is outside hull by > 2cm.
- "Feet sliding" if a foot is in planted state but world position delta between frames > 1mm.
- "Weight shift" line drawn from CoM down to ground point closest to hull.

## UI
- CoM marker: filled circle, color by warning state.
- Support polygon: semi-transparent fill on ground plane.
- Contact points: small dots at each detected contact.
- Lean indicator: arrow from CoM to hull centroid, scaled by distance.

## As implemented (Phase 4)
Code: `src/lib/balance.ts` (pure), `src/state/balanceSlice.ts` (store sync), `src/three/balanceOverlay.ts` (viewport).
- Contact samples per foot: inner and outer sole corners of the heel (back of the foot box), the ball (back edge of the
  toe box) and the toe tip (front of the toe box), so tiptoe keeps ball and toe and lifts the heel. A part is in contact
  when either corner is below 2 cm; planted / edge / floating count parts.
- Segment centroids: capsule midpoints, box and sphere centres. The foot's ratio is split 80 / 20 between the foot box
  and the toe box. Shoulders and the neck carry no mass of their own (neck is in the head ratio). The stylized override
  applies to the centroids like to the figure.
- CoM outside: distance from the CoM's ground point to the convex hull (a segment or a point when the contacts are
  collinear) > 2 cm. Warning text: `CoM outside support polygon by N cm`; with no contact: `No ground contact`.
- Feet sliding is checked between consecutive updates of a live drag (same body): a foot planted before and after whose
  contact centre moved > 1 mm gives `Left/Right foot sliding`. The warning stays until the next edit outside a drag.
- Weight shift: the line from the CoM's ground point to the closest point of the polygon is drawn when outside.
  Weight per foot = the CoM's position along the line between the two feet's contact centres (100% on the only foot down).
- Lean indicator: arrow on the ground from the CoM's ground point to the polygon centroid; the HUD reads the lean angle
  (atan of that distance over CoM height) and its direction in the figure's own frame.
- With the default model the mass slider alone moves the CoM by about 1–2 cm over its whole range (more torso mass lifts
  it toward the hips). Head size moves it much more (Chibi CoM sits about 4% of height higher than Realistic Average).
- Viewport: CoM sphere and plumb line (green, red when outside, amber without contact), polygon fill and outline, contact
  dots, lean arrow (yellow), weight-shift line (pink). `CoM outside` and `sliding` warnings show even with the overlay off.
