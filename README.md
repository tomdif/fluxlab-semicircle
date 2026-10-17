# FluxLab — The magnetic field of a semicircle

[Open the live demo](https://tomdif.github.io/fluxlab-semicircle/)

A self-contained, offline HTML lesson and coil design workbench. Download `index.html` and open it in a modern browser; no installation, server, network, or external libraries are required for the calculations. Reference links need a connection.

## What it includes

- A full-space Biot–Savart derivation and its incomplete elliptic-integral representation, with real-amplitude conventions and exceptional cases.
- Both an open semicircular arc contribution and a closed loop with a straight diameter return.
- Interactive field maps, 3D coil geometry, axial profiles, probe values, and up to six coils.
- An independent comparison of the elliptic representation against direct adaptive Gauss–Legendre integration.
- A reproducible 100-point browser check, plus automated checks for special cases, symmetry, singularities, the optimizer, and import validation.
- Current optimization with explicit RMS-versus-heating tradeoff messages; JSON, CSV, PNG, and standalone HTML export.

## Reproduce or edit

The generated `index.html` is the deployable application. Edit files under `src/`, then run:

```sh
python3 build.py
npm test
```

Python 3 and a modern Node.js runtime are sufficient. There are no packages to install. The builder embeds styles, scripts, the diagram, and Blob worker code into one HTML file. `src/index.html` is a build template; use the generated root `index.html` to run the app.

GitHub Pages serves the `main` branch at the repository root. `.nojekyll` keeps the deployment static.

## Model and interpretation

This is a vacuum, steady-current, thin-filament model. Wire interiors are excluded. Turns are coincident filaments. Heating is winding-only I²R at 20 °C, excluding leads and temperature rise. An open arc is a partial circuit contribution; a physical steady current needs a return path.

The field formulas are exact identities within this model. Their displayed values are numerical evaluations. Agreement tests check implementations and are not global error bounds. Near ill-conditioned elliptic coordinates the comparison reports its limitation; the map still uses direct integration.

The optimizer's RMS is target mismatch, not numerical integration error. A nonzero efficiency preference can accept more mismatch to reduce heating. Lowering the current bound below the initial currents can also worsen the fit relative to that infeasible starting point. At zero efficiency preference and a feasible starting point, the accuracy-only fit should not increase the RMS.

All computation occurs in the browser. The app saves designs in local browser storage and has no analytics or server-side processing.

## References

- [Richard Fitzpatrick: the Biot–Savart law](https://farside.ph.utexas.edu/teaching/jk1/lectures/node50.html)
- [NIST DLMF §19.2: elliptic integral definitions](https://dlmf.nist.gov/19.2)
