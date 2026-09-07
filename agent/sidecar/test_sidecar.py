import subprocess, sys, os
env = dict(os.environ, ROX_SEEDKEY_MOCK="1")
def run(inp, env=env):
    p = subprocess.run([sys.executable, "rox_seedkey_sidecar.py"], input=inp, capture_output=True, text=True, env=env)
    return p.returncode, p.stdout.strip(), p.stderr.strip()
rc,out,err = run("17 4A3F91C2 11\n"); assert rc==0 and len(out)==8, (rc,out,err); print("mock key:",out)
rc,out,err = run("1 00000000 1\n"); assert rc==3 and "already unlocked" in err; print("zero seed ->",err)
rc,out,err = run("1 ZZ 1\n"); assert rc==2; print("bad hex ->",err)
rc,out,err = run("1 4A3F 1\n", dict(os.environ, ROX_SEEDKEY_DLL="/nonexistent.dll")); assert rc==2 and "not found" in err; print("no dll ->",err)
print("sidecar tests: PASS")
