#!/usr/bin/env python3
"""Reproducible, vacuum-field correction pilot. Not a reactor prediction.

Run from any directory with the pinned research requirements installed.
All cases (including the first, selected in advance) are retained.
"""
import os
os.environ.setdefault('OMP_NUM_THREADS', '2')
import json, hashlib, time, platform
from pathlib import Path
import numpy as np
import scipy
from scipy.optimize import lsq_linear
import simsopt
from simsopt.configs import get_data
from simsopt.geo import CurveXYZFourier
from simsopt.field import (BiotSavart, Coil, Current, compute_fieldlines,
    trace_particles, MinRStoppingCriterion, MaxRStoppingCriterion,
    MinZStoppingCriterion, MaxZStoppingCriterion)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'fusion'
BASE_SEED = 20261018
POSITION_SIGMA_M = .001  # each Cartesian coordinate, independently
CURRENT_LIMIT = .02
NTRAIN, NTEST, NCASES = 384, 768, 12
NCOIL_POINTS = 256
PARTICLE_TIME = 1e-4
PARTICLE_ENERGY = 1000 * 1.602176634e-19  # 1 keV deuterons, NOT fusion alphas
MASS, CHARGE = 3.3435837724e-27, 1.602176634e-19
TOL = 1e-9

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')

def field(bs, pts):
    bs.set_points(np.ascontiguousarray(pts)); return bs.B().copy()

def axis_rz(phi, axis):
    dofs = axis.local_full_x
    modes = np.arange(11)
    angle = np.asarray(phi)[..., None] * 2 * modes
    return (np.sum(np.cos(angle) * dofs[:11], axis=-1),
            np.sum(np.sin(angle[..., 1:]) * dofs[11:], axis=-1))

def sample_tube(n, seed, axis):
    rng = np.random.default_rng(seed)
    phi = rng.uniform(0, 2*np.pi, n)
    theta = rng.uniform(0, 2*np.pi, n)
    radius = .08 * np.sqrt(rng.random(n))
    ra, za = axis_rz(phi, axis)
    r, z = ra + radius*np.cos(theta), za + radius*np.sin(theta)
    return np.column_stack([r*np.cos(phi), r*np.sin(phi), z])

def clone_coils(coils, offsets=None, nquad=NCOIL_POINTS):
    result = []
    for k, coil in enumerate(coils):
        curve = CurveXYZFourier(len(coil.curve.quadpoints), 16)
        curve.least_squares_fit(coil.curve.gamma())
        newcurve = CurveXYZFourier(nquad, 16)
        newcurve.local_x = curve.local_full_x
        if offsets is not None:
            for d, name in enumerate(['xc(0)', 'yc(0)', 'zc(0)']):
                newcurve.set(name, newcurve.get(name) + offsets[k, d])
        result.append(Coil(newcurve, Current(coil.current.get_value())))
    return result

def response(coils, pts):
    return np.column_stack([field(BiotSavart([c]), pts).ravel() for c in coils])

def rms(v):
    return float(np.sqrt(np.mean(np.sum(v.reshape(-1, 3)**2, axis=1))))

def independent_field(coils, pts):
    """Separate NumPy implementation of periodic Biot-Savart quadrature."""
    ans = np.zeros_like(pts)
    for c in clone_coils(coils, nquad=1024):
        x, dx = c.curve.gamma(), c.curve.gammadash()/1024
        for start in range(0, len(pts), 32):
            r = pts[start:start+32, None, :] - x[None, :, :]
            ans[start:start+32] += 1e-7*c.current.get_value()*np.sum(
                np.cross(dx[None, :, :], r)/np.linalg.norm(r, axis=2)[..., None]**3, axis=1)
    return ans

def limits():
    # A numerical observation envelope, deliberately NOT called a plasma boundary.
    return [MinRStoppingCriterion(.55), MaxRStoppingCriterion(1.5),
            MinZStoppingCriterion(-.4), MaxZStoppingCriterion(.4)]

def orbit_metrics(bs, starts, pitch, axis, tol):
    speed = np.sqrt(2*PARTICLE_ENERGY/MASS)
    paths, hits = trace_particles(bs, starts, speed*pitch, tmax=PARTICLE_TIME,
        mass=MASS, charge=CHARGE, Ekin=PARTICLE_ENERGY, tol=tol,
        mode='gc_vac', stopping_criteria=limits())
    records, preview = [], []
    for k, path in enumerate(paths):
        xyz = path[:, 1:4]; b = np.linalg.norm(field(bs, xyz), axis=1)
        mu = (speed**2 - path[0, 4]**2)/(2*b[0])
        energy = .5*MASS*(path[:, 4]**2 + 2*mu*b)
        phi = np.arctan2(xyz[:, 1], xyz[:, 0]); ra, za = axis_rz(phi, axis)
        rho = np.hypot(np.hypot(xyz[:, 0], xyz[:, 1])-ra, xyz[:, 2]-za)
        records.append(dict(id=k, pitch=float(pitch[k]), final_time_s=float(path[-1, 0]),
            observation_envelope_exit=bool(path[-1, 0] < PARTICLE_TIME-1e-12),
            max_axis_distance_m=float(rho.max()),
            max_relative_energy_error=float(np.max(np.abs(energy/PARTICLE_ENERGY-1))),
            final_xyz_m=xyz[-1].tolist()))
        if k < 6:
            preview.append(path[np.linspace(0, len(path)-1, min(280, len(path))).astype(int), :4].tolist())
    return dict(records=records, preview=preview,
        envelope_exits=sum(x['observation_envelope_exit'] for x in records),
        max_relative_energy_error=max(x['max_relative_energy_error'] for x in records))

def main():
    t0 = time.time(); OUT.mkdir(exist_ok=True)
    basecurves, currents, axis, nfp, original = get_data('giuliani',
        coil_order=16, points_per_period=16, magnetic_axis_order=10,
        length=18, nsurfaces=5)
    coils = clone_coils(original.coils); baseline = BiotSavart(coils)
    train = sample_tube(NTRAIN, BASE_SEED+1000, axis)
    test = sample_tube(NTEST, BASE_SEED+1001, axis)
    target_train, target_test = field(baseline, train), field(baseline, test)
    bscale = rms(target_test)
    cases, first = [], None
    # One fixed procedure, no selecting a favorable seed or retuning on holdout data.
    for k in range(NCASES):
        rng = np.random.default_rng(BASE_SEED+k)
        offsets = rng.normal(0, POSITION_SIGMA_M, (len(coils), 3))
        disturbed = clone_coils(coils, offsets)
        atrain, atest = response(disturbed, train), response(disturbed, test)
        residual_train = target_train.ravel() - atrain.sum(axis=1)
        fit = lsq_linear(atrain, residual_train, bounds=(-CURRENT_LIMIT, CURRENT_LIMIT),
                         tol=1e-12, lsmr_tol=1e-12, max_iter=500)
        if not fit.success: raise RuntimeError(fit.message)
        before = atest.sum(axis=1)-target_test.ravel()
        after = before + atest@fit.x
        change = (atest@fit.x).reshape(-1,3)
        residual = before.reshape(-1,3)
        # Measured-field noise sensitivity: re-fit with 10 microtesla iid component noise.
        noisy = lsq_linear(atrain, residual_train+rng.normal(0, 10e-6, residual_train.size),
                          bounds=(-CURRENT_LIMIT, CURRENT_LIMIT), tol=1e-12)
        singular = np.linalg.svd(atrain, compute_uv=False)
        row = dict(seed=BASE_SEED+k, offsets_m=offsets.tolist(),
            correction_fraction=fit.x.tolist(),
            rms_squared_coefficients_T2=[float(np.mean(np.sum(residual**2,axis=1))),
                float(2*np.mean(np.sum(residual*change,axis=1))),float(np.mean(np.sum(change**2,axis=1)))],
            before_rms_T=rms(before), after_rms_T=rms(after),
            noisy_after_rms_T=rms(before+atest@noisy.x),
            train_before_rms_T=rms(residual_train), train_after_rms_T=rms(atrain@fit.x-residual_train),
            max_residual_T=float(np.linalg.norm(after.reshape(-1, 3),axis=1).max()),
            improvement_pct=100*(1-rms(after)/rms(before)),
            singular_values=singular.tolist(),
            condition_number=float(singular[0]/singular[-1]),
            active_bounds=int(np.sum(np.abs(fit.x)>CURRENT_LIMIT-1e-7)))
        cases.append(row)
        if first is None:
            corrected = clone_coils(disturbed)
            for c, fraction in zip(corrected, fit.x):
                c.current.local_x = [c.current.get_value()*(1+fraction)]
            first = (BiotSavart(disturbed), BiotSavart(corrected))
        print(f'Case {k+1}: {rms(before)*1e6:.3f} -> {rms(after)*1e6:.3f} uT ({row["improvement_pct"]:.1f}%)', flush=True)
    check_pts = test[:48]
    direct = field(baseline, check_pts)
    independent = independent_field(coils, check_pts)
    refined = field(BiotSavart(clone_coils(coils, nquad=512)), check_pts)
    restored = field(first[1], test)
    predicted = response(first[1].coils, test).sum(axis=1).reshape(-1, 3)
    validation = dict(independent_numpy_relative_rms=rms(independent-direct)/rms(direct),
        doubled_quadrature_relative_rms=rms(refined-direct)/rms(direct),
        cloned_baseline_relative_rms=rms(field(original, check_pts)-direct)/rms(direct),
        superposition_relative_rms=rms(predicted-restored)/rms(restored))
    assert validation['independent_numpy_relative_rms'] < 1e-7
    assert validation['doubled_quadrature_relative_rms'] < 1e-7
    assert max(abs(x) for row in cases for x in row['correction_fraction']) <= CURRENT_LIMIT+1e-12
    config=dict(baseline='Giuliani et al. 2022, length=18, nsurfaces=5',
        simsopt_version=simsopt.__version__, python=platform.python_version(),
        numpy=np.__version__, scipy=scipy.__version__, seed=BASE_SEED,
        coil_count=len(coils), independent_current_supplies_assumed=len(coils),
        field_periods=nfp, field_rms_T=bscale, position_sigma_per_coordinate_m=POSITION_SIGMA_M,
        current_fraction_bound=CURRENT_LIMIT, train_points=NTRAIN, holdout_points=NTEST,
        fit_tube_radius_m=.08, noise_std_per_component_T=10e-6,
        particle_species='deuteron', particle_energy_eV=1000,
        particle_time_s=PARTICLE_TIME, particle_tolerance=TOL,
        observation_envelope=dict(Rmin_m=.55,Rmax_m=1.5,Zmin_m=-.4,Zmax_m=.4),
        boundary_warning='Observation envelope only; not the last closed flux surface or a wall.')
    geometry=dict(coils=[c.curve.gamma()[::4].tolist() for c in coils],
        currents_A=[c.current.get_value() for c in coils],
        fourier_dofs=[c.curve.local_full_x.tolist() for c in coils],
        axis_dofs=axis.local_full_x.tolist())
    geometry['sha256_fourier_dofs'] = hashlib.sha256(json.dumps(geometry['fourier_dofs']).encode()).hexdigest()
    study=dict(config=config,cases=cases,validation=validation,geometry=geometry)
    save('results.json',study)
    # Seeded common ensemble: no changes of positions/pitches between cases.
    starts = sample_tube(24, BASE_SEED+2000, axis)
    pitch = np.random.default_rng(BASE_SEED+2001).uniform(-.95,.95,len(starts))
    study['particle_initials']=dict(xyz_m=starts.tolist(), pitch=pitch.tolist())
    study['traces']={}
    ra, za = axis_rz(np.array([0.]),axis)
    for label, bs in zip(['baseline','displaced','corrected'],[baseline,*first]):
        print('Tracing',label,flush=True)
        paths, hits = compute_fieldlines(bs, ra[0]+np.linspace(.015,.09,6),
            np.full(6,za[0]),tmax=600,tol=TOL,phis=[0.],stopping_criteria=limits())
        poincare=[]
        for h in hits:
            if len(h):
                h=h[h[:,1]>=0]
                poincare.append(np.column_stack([np.hypot(h[:,2],h[:,3]),h[:,4]]).tolist())
            else: poincare.append([])
        orbits=orbit_metrics(bs,starts,pitch,axis,TOL)
        study['traces'][label]=dict(poincare=poincare,particles=orbits,
            fieldline_final_parameters=[float(p[-1,0]) for p in paths])
        save('results.json',study)
        print(label,'exits',orbits['envelope_exits'],'energyerror',orbits['max_relative_energy_error'],flush=True)
    # Tolerance convergence on six fixed trajectories, baseline AND candidate.
    checks={}
    for label,bs in [('baseline',baseline),('corrected',first[1])]:
        fine=orbit_metrics(bs,starts[:6],pitch[:6],axis,TOL/10)
        coarse=study['traces'][label]['particles']['records'][:6]
        checks[label]=dict(max_final_position_difference_m=max(float(np.linalg.norm(
            np.array(a['final_xyz_m'])-b['final_xyz_m'])) for a,b in zip(fine['records'],coarse)),
            max_relative_energy_error=fine['max_relative_energy_error'],
            envelope_exit_classifications_agree=all(a['observation_envelope_exit']==b['observation_envelope_exit'] for a,b in zip(fine['records'],coarse)))
        checks[label]['max_survivor_final_position_difference_m']=max(float(np.linalg.norm(
            np.array(a['final_xyz_m'])-b['final_xyz_m'])) for a,b in zip(fine['records'],coarse)
            if not a['observation_envelope_exit'] and not b['observation_envelope_exit'])
        checks[label]['max_exit_time_difference_s']=max([abs(a['final_time_s']-b['final_time_s'])
            for a,b in zip(fine['records'],coarse) if a['observation_envelope_exit']] or [0.])
    study['validation']['particle_tolerance_checks']=checks
    study['elapsed_seconds']=time.time()-t0
    save('results.json',study)
    print('DONE',study['elapsed_seconds'],validation,flush=True)

if __name__=='__main__': main()
