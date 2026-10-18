# FluxLab confinement research pilot

[Live workbench](https://tomdif.github.io/fluxlab-semicircle/fusion/)

This is an executed **vacuum magnetic-field recovery** experiment, plus a separate plasma-equilibrium benchmark. It is not a fusion-reactor design, a reproduction of a paper's alpha-loss percentages, or evidence of net energy.

## Result

The preselected first placement-error realization improves from **420.241 to 359.029 µT** held-out vector RMS (14.6%). Across all twelve declared seeds the reduction ranges from **6.0% to 31.0%**, with **17.25% median**. The largest fitted current adjustment across the ensemble is 1.123%, below the imposed 2% bound. No case was selected for favorable performance.

This recovers part of the original field after a disturbance. It does **not** improve on the ideal published design. Current corrections cannot cancel all spatial errors caused by displaced coils.

The 24-particle, 100 µs test yields 1/24 exits from a numerical observation envelope for the baseline and 0/24 for both displaced and corrected fields. The envelope is not a physical loss boundary. These small, short trajectories do not support a confinement improvement claim; the disturbed case already has the same count as the corrected case.

## Reproduce

Python 3.12 was used. From the repository root:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r research/requirements.txt
python research/run_study.py
OPENBLAS_NUM_THREADS=2 python research/equilibrium_scan.py
python research/build_dashboard.py
python research/validate_results.py
```

The field study takes roughly 25 seconds in the original environment; equilibrium compilation and solves can take several minutes. Timing varies by hardware. These are CPU calculations and require no proprietary solver. `fusion/index.html` is generated, portable HTML with all display data embedded. JSON exports preserve scalar metrics and Fourier coefficients; the embedded plot coordinates are rounded for size. Unrounded raw data are in `fusion/results.json`.

To run a coarse equilibrium comparison, use `python research/equilibrium_scan.py --resolution 6 --output equilibrium_L6.json`. The archived L6 run used a tighter optimizer gradient tolerance (1e-8 versus 1e-6); resolution, not solver success alone, must be assessed. This is a resolution-sensitivity check, not a fully converged scan.

## Baseline and objective

- SIMSOPT 1.11.1 `get_data('giuliani', coil_order=16, points_per_period=16, magnetic_axis_order=10, length=18, nsurfaces=5)`.
- Published source: Giuliani et al., *Direct computation of magnetic surfaces in Boozer coordinates and coil optimization for quasi-symmetry*, J. Plasma Phys. (2022), DOI [10.1017/S0022377822000563](https://doi.org/10.1017/S0022377822000563).
- Four unique coil shapes, expanded by two field periods and stellarator symmetry to 16 physical closed filaments. Original geometry and current scale, approximately 1 m major radius and 0.295 T RMS in the sampled tube. No reactor-size or reactor-field rescaling.
- Every physical coil is then assigned an independent current supply. This is an **assumption for the correction experiment**, not the electrical architecture of a built device. Filament current is an effective ampere-turn representation; winding-pack currents, resistance and losses are not determined.
- Each physical coil receives an independent Cartesian translation, normally distributed with σ = 1 mm **per coordinate**. This is not a 1 mm hard tolerance. No shape or tilt errors are included. Twelve seeds: 20261018 through 20261029.
- Training: 384 independent positions in a circular 8 cm cross-sectional tube around the reference magnetic axis. Holdout: 768 independently drawn positions in the same distribution, never used in the fit. No claim of extrapolation beyond this volume.

For nominal per-coil field contributions A and fractional current corrections δ, solve:

```text
minimize ||A δ − (B_reference − A 1)||²
subject to −0.02 ≤ δ_i ≤ 0.02
```

All three Cartesian components are fitted. The reported RMS is `sqrt(mean(||B − B_reference||²))`, not a per-component RMS. A nonzero target and tight bounds prevent the trivial zero-field solution. Geometry is fixed during the fit. The slider uses the exact quadratic RMS response to scaling δ from zero to its fitted value; it does not rerun trajectories or an equilibrium solver.

The noise experiment adds independent 10 µT standard-deviation noise to each target component at training points, refits the same geometry, and evaluates against the noise-free holdout target. This is a simple measurement-noise sensitivity test, not a sensor or dynamic feedback model.

## Field and orbit checks

- Original symmetry-expanded field versus independently fitted Fourier copies.
- Direct C++ SIMSOPT Biot–Savart versus a separate NumPy periodic quadrature implementation at 48 held-out points (1024 points per loop).
- 256 versus 512 quadrature points per loop and explicit current superposition.
- Six field-line starts at φ = 0, R = R_axis + [0.015 … 0.09] m, Z = Z_axis. SIMSOPT field-line integration parameter runs to 600 (`dx/ds = B`, not physical seconds), with tolerance 1e-9. Approximately 25–26 φ = 0 returns per line.
- Twenty-four deuteron guiding centers: 1 keV, 100 µs, positions seeded in the same 8 cm tube, pitch uniformly sampled in [−0.95, 0.95], identical for baseline, disturbed and corrected fields. Collisionless vacuum guiding-center mode (`gc_vac`), no electric field. These are **not fusion alpha particles**.
- Fixed numerical observation envelope: 0.55 < R < 1.50 m, −0.40 < Z < 0.40 m. Exits mean leaving this envelope only. It is neither a last closed flux surface nor a reactor wall.
- Energy drift from the guiding-center kinetic energy and conserved magnetic moment is checked along each integrated path.
- Six predetermined trajectories for baseline and corrected fields are repeated at 1e-10 tolerance. Surviving endpoint differences are below 34 nm; checked exit classifications agree. The exiting baseline trajectory stops at slightly different integrator steps: endpoint difference 6.18 mm and exit-time difference 0.149 µs. This stopping criterion is not a root-localized wall-hit calculation.

The very small field-implementation differences (about 5e-16 relative RMS at the sampled points) indicate numerical agreement only. They say nothing about coil manufacturing accuracy or the adequacy of the vacuum model. Test-particle trajectories also do not determine the bulk plasma's energy confinement time.

## Separate pressure benchmark

DESC 0.17.2 loads its packaged `precise_QA` equilibrium. This is **a different baseline from the Giuliani coils**. Central pressures of 0, 500 and 1000 Pa use `p(ρ)=p0(1−ρ²)`. Boundary shape, toroidal flux and the example's net toroidal-current profile are fixed; the rotational transform is not prescribed independently. DESC solves the internal MHD force balance `J × B = ∇p`.

The main scan uses L=M=N=10, optimization grids 20, and independent evaluation grid resolution 24. Both physical force residual and beta are reported, along with optimizer status. Archived L=M=N=6 results expose the effect of under-resolution. Optimization success does not imply exact force balance. Neither scan is a free-boundary response to the perturbed coils, and no stability calculation is presented.

## What must come next

1. A loss surface and matched longer particle ensembles at a justified device scale, with convergence, collisions and uncertainty estimates.
2. A coupled free-boundary finite-beta equilibrium for the actual coil set, including plasma-current contributions to external-field targets.
3. Stability, neoclassical and turbulent transport, exhaust and heat-load calculations.
4. Coil engineering: finite winding packs and leads, clearance, force/stress, insulation, cooling and supply limits.
5. Dynamic control with sensing, actuator bandwidth, latency, faults and independent disturbance cases; then experimental validation.

None of these steps can be replaced by a smaller vacuum RMS. Density, temperature, confinement, heating, fuel cycle and plant energy balance remain unmodeled.

## Provenance and prior work

- [SIMSOPT configuration documentation](https://simsopt.readthedocs.io/latest/simsopt.configs.html) and [source](https://github.com/hiddenSymmetries/simsopt).
- [Giuliani et al. 2022](https://arxiv.org/abs/2203.03753): published coil baseline. Full expanded Fourier coefficients, nominal currents and axis coefficients are archived in `fusion/results.json`, with a coefficient SHA-256.
- [Wechsung et al. 2022](https://arxiv.org/abs/2203.10164): prior work on coil manufacturing errors and correction; DOI 10.1088/1361-6587/ac89ee. This pilot is not a novelty claim or a reproduction of that paper's full method.
- [DESC](https://desc-docs.readthedocs.io/en/latest/) and [source](https://github.com/PlasmaControl/DESC): equilibrium solver and packaged example.

SIMSOPT and its bundled baseline data are distributed under its MIT license, included as `SIMSOPT-LICENSE.txt`. DESC’s MIT license is included as `DESC-LICENSE.txt`. The authors and projects above do not endorse this application.
