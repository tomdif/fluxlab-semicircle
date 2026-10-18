#!/usr/bin/env python3
"""Separate fixed-boundary pressure benchmark; not coupled to Giuliani coils."""
import os
os.environ.setdefault('OMP_NUM_THREADS','2')
os.environ.setdefault('OPENBLAS_NUM_THREADS','2')
os.environ.setdefault('JAX_ENABLE_X64','true')
import json,time,argparse
from pathlib import Path
import numpy as np
import desc, desc.examples
from desc.grid import LinearGrid, QuadratureGrid
from desc.profiles import PowerSeriesProfile

parser=argparse.ArgumentParser()
parser.add_argument('--resolution',type=int,default=10)
parser.add_argument('--output',default='equilibrium.json')
args=parser.parse_args()
OUT=Path(__file__).resolve().parents[1]/'fusion'/args.output
t0=time.time()
eq=desc.examples.get('precise_QA')
q=args.resolution
eq.change_resolution(L=q,M=q,N=q,L_grid=2*q,M_grid=2*q,N_grid=2*q)
scan=dict(solver='DESC',version=desc.__version__,baseline='DESC precise_QA example',
    coupled_to_coil_study=False,fixed_boundary=True,
    pressure_profile='p(rho)=p0*(1-rho^2)',
    constraints='Fixed boundary, toroidal flux, and net toroidal-current profile (DESC example defaults)',
    warning='Fixed-boundary equilibrium benchmark; no stability or transport certification.',
    optimizer_tolerances=dict(ftol=1e-8,xtol=1e-8,gtol=1e-6),
    cases=[])
for p0 in [0,500,1000]:
    print('Solving central pressure',p0,flush=True)
    eq.pressure=PowerSeriesProfile([p0,0,-p0])
    eq,result=eq.solve(maxiter=30,ftol=1e-8,xtol=1e-8,gtol=1e-6,verbose=2)
    grid=QuadratureGrid(L=2*q+4,M=2*q+4,N=2*q+4,NFP=eq.NFP)
    d=eq.compute(['<beta>_vol','<|F|>_vol','<|grad(p)|>_vol','<|grad(|B|^2)|/2mu0>_vol'],grid=grid)
    surface=eq.compute(['R','Z'],grid=LinearGrid(rho=np.array([0,.25,.5,.75,1.]),theta=100,zeta=np.array([0.]),NFP=eq.NFP))
    row=dict(central_pressure_Pa=p0,optimizer_success=bool(result.success),
        optimizer_message=str(result.message),iterations=int(result.nit),
        volume_average_beta=float(d['<beta>_vol']),
        volume_average_force_residual_N_m3=float(d['<|F|>_vol']),
        volume_average_pressure_gradient_N_m3=float(d['<|grad(p)|>_vol']),
        force_residual_over_magnetic_pressure_gradient=float(d['<|F|>_vol']/d['<|grad(|B|^2)|/2mu0>_vol']),
        R_m=np.asarray(surface['R']).tolist(),Z_m=np.asarray(surface['Z']).tolist(),
        resolution=dict(L=eq.L,M=eq.M,N=eq.N),Psi_Wb=float(eq.Psi))
    scan['cases'].append(row);scan['elapsed_seconds']=time.time()-t0
    OUT.write_text(json.dumps(scan,indent=2,allow_nan=False,default=lambda x:np.asarray(x).tolist())+'\n')
    print('RESULT',p0,row['volume_average_beta'],row['volume_average_force_residual_N_m3'],flush=True)
print('DONE',scan['elapsed_seconds'],flush=True)
