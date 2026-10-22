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
