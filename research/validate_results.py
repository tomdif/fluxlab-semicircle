#!/usr/bin/env python3
"""Check scientific invariants and prevent incomplete output publication."""
import json,math,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'fusion'
d=json.loads((root/'results.json').read_text())
e=json.loads((root/'equilibrium.json').read_text())
assert len(d['cases'])==12 and len(d['traces'])==3
assert d['config']['train_points']==384 and d['config']['holdout_points']==768
for case in d['cases']:
    assert case['train_after_rms_T']<=case['train_before_rms_T']+1e-12
    assert max(map(abs,case['correction_fraction']))<=.02+1e-12
    a,b,c=case['rms_squared_coefficients_T2']
    assert math.isclose(math.sqrt(a),case['before_rms_T'],rel_tol=1e-12)
    assert math.isclose(math.sqrt(a+b+c),case['after_rms_T'],rel_tol=1e-12)
    assert math.isfinite(case['noisy_after_rms_T'])
for trace in d['traces'].values():
    assert len(trace['poincare'])==6 and min(map(len,trace['poincare']))>=20
    p=trace['particles'];assert len(p['records'])==24
    assert p['max_relative_energy_error']<1e-6
    assert p['envelope_exits']==sum(r['observation_envelope_exit'] for r in p['records'])
v=d['validation']
assert v['independent_numpy_relative_rms']<1e-7 and v['doubled_quadrature_relative_rms']<1e-7
for c in v['particle_tolerance_checks'].values():
    assert c['max_survivor_final_position_difference_m']<1e-6
    assert c['envelope_exit_classifications_agree']
assert hashlib.sha256(json.dumps(d['geometry']['fourier_dofs']).encode()).hexdigest()==d['geometry']['sha256_fourier_dofs']
assert len(e['cases'])==3 and e['coupled_to_coil_study'] is False and e['fixed_boundary'] is True
assert [c['central_pressure_Pa'] for c in e['cases']]==[0,500,1000]
assert e['cases'][0]['volume_average_beta']==0
for c in e['cases']:
    assert c['optimizer_success'] and c['resolution']['L']==10
    assert len(c['R_m'])==500 and len(c['Z_m'])==500
    assert c['force_residual_over_magnetic_pressure_gradient']<1e-4
    if c['central_pressure_Pa']:
        assert c['volume_average_force_residual_N_m3']/c['volume_average_pressure_gradient_N_m3']<.02
print('PASS: complete datasets; bounded fits; slider identity; field and orbit accuracy; pressure residual gates; provenance hash.')
