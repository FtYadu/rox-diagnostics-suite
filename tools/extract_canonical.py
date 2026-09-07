#!/usr/bin/env python3
"""Extract data/canonical/*.json for the ROX Diagnostics Lovable project from the legacy
globatROX workspace (R11_Oversea.xml, service-process XMLs, programming flows, Menuinfo.xml).

Output shapes follow packages/canonical-schema/src/index.ts. Extra fields that the schema
must learn (`saAlg`, `did` on snapshot signals, `loop`/`quit`/`securityAccess` step kinds)
are documented in CANONICAL_NOTES.md next to the output.
"""
from __future__ import annotations

import glob
import hashlib
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, OrderedDict

ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/x/globatool"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/x/canonical"
WS = f"{ROOT}/LKWorkspace/Vehicle/113799ab-21a6-4a2e-839d-b12e203d30f5"
OVERSEA_XML = f"{WS}/R11_Oversea/R11_Oversea.xml"
os.makedirs(OUT, exist_ok=True)

DOMAIN = {"Body": "Body", "Chassis": "Chassis", "Power": "Powertrain", "Autopilot": "ADAS", "Infotainment": "Infotainment"}


def hx(s: str | None, default: int = 0) -> int:
    if not s or s in ("null", "None"):
        return default
    try:
        return int(s, 16)
    except ValueError:
        return default


def num(s: str | None, default=None):
    if s is None or s in ("", "null"):
        return default
    try:
        return int(s)
    except ValueError:
        try:
            return float(s)
        except ValueError:
            return default


def clean(s: str | None, default: str = "") -> str:
    if s is None:
        return default
    s = s.replace("\r", " ").replace("\n", " ").strip()
    return s if s and s != "null" else default


def value_type(item: ET.Element) -> str:
    fmt = (item.findtext("StringFormat") or "").strip().lower()
    typ = (item.attrib.get("Type") or "").lower()
    if fmt == "ascii":
        return "ascii"
    if item.find("Values") is not None and len(item.find("Values")) > 0:
        return "enum"
    if typ == "int":
        return "int"
    if typ == "float":
        return "float"
    if fmt == "hex" and typ == "array":
        return "hex"
    return "uint"


def scaling(item: ET.Element) -> dict:
    d = {}
    sc = num(item.findtext("Scale"), 1)
    off = num(item.findtext("Offset"), 0)
    if sc not in (None, 1):
        d["factor"] = sc
    if off not in (None, 0):
        d["offset"] = off
    if (item.attrib.get("Type") or "").lower() == "int":
        d["signed"] = True
    vals = item.find("Values")
    if vals is not None and len(vals):
        d["enum"] = {v.attrib.get("Value", ""): clean(v.attrib.get("Name"), "?") for v in vals if v.attrib.get("Value")}
    return d


def data_items(container: ET.Element | None):
    """Response/Request Items that carry data (skip SID/DID/subfunction plumbing)."""
    if container is None:
        return []
    out = []
    for it in container.iter("Item"):
        use = it.attrib.get("ItemUseType", "")
        if use in ("SID", "DID") or it.attrib.get("Name") in ("ServiceID", "dataIdentifier"):
            continue
        if "Response Service Id" in (it.attrib.get("Name") or ""):
            continue
        out.append(it)
    return out


def signal_layout(item: ET.Element, base_byte: int = 1) -> dict:
    d = {
        "name": clean(item.attrib.get("Name") or item.attrib.get("Describle"), "field"),
        "byteStart": max(0, num(item.attrib.get("ByteStart"), base_byte) - base_byte),
        "length": max(1, num(item.attrib.get("Size"), 1) or 1),
        "type": value_type(item),
    }
    bit = num(item.attrib.get("StartBit"), 0)
    if bit and 0 < bit <= 7:
        d["bitStart"] = bit
    if item.attrib.get("Unit"):
        d["unit"] = item.attrib["Unit"]
    d.update(scaling(item))
    return d


def did_entry(el: ET.Element, sa_default: int) -> dict:
    req = el.find("Request")
    did = None
    if req is not None:
        for it in req.iter("Item"):
            if it.attrib.get("ItemUseType") == "DID" or it.attrib.get("Name") == "dataIdentifier":
                did = hx(it.attrib.get("DefaultValue"))
                break
    resp_items = data_items(el.find("Response"))
    first = resp_items[0] if resp_items else None
    size = num(el.attrib.get("DIDSize"), -1)
    if size is None or size < 1:
        size = sum(max(1, num(i.attrib.get("Size"), 1) or 1) for i in resp_items) or 1
    d = {
        "did": did if did is not None else 0,
        "label": clean(el.attrib.get("Name"), f"DID {did:04X}" if did else "DID"),
        "length": int(size),
        "type": value_type(first) if first is not None else "hex",
    }
    if first is not None:
        if first.attrib.get("Unit"):
            d["unit"] = first.attrib["Unit"]
        rng = first.find("ItemRange")
        if rng is not None:
            mn, mx = num(rng.findtext("Min")), num(rng.findtext("Max"))
            if mn is not None and mn > -100000:
                d["min"] = mn
            if mx is not None and mx < 100000:
                d["max"] = mx
        d.update(scaling(first))
    sa = num(el.attrib.get("SA"), 0) or 0
    if sa:
        d["saLevel"] = sa
        d["session"] = 3
    return d


# ---------------------------------------------------------------- vehicle XML
tree = ET.parse(OVERSEA_XML)
veh = tree.getroot().find("Vehicle")
ecus, addresses, services, dids, dtcs, routines, iocontrol = [], [], [], [], [], [], []
addr_to_id: dict[int, str] = {}
seen_ids: Counter = Counter()
sa_table: dict[str, dict] = {}

for e in veh.findall("ECU"):
    a = e.attrib
    ecu_id = a["Name"]
    seen_ids[ecu_id] += 1
    if seen_ids[ecu_id] > 1:
        ecu_id = f"{ecu_id}_I"  # second CDS definition (Intelligent CDC) — same address 0x1118
    cfg = e.find("Configuration")
    address = int(cfg.findtext("ECUAddress"))
    addr_to_id.setdefault(address, ecu_id)
    tester = int(cfg.findtext("TesterAddress"))
    functional = int(cfg.findtext("FunctionAddress"))

    # security levels from Service 27 request-seed values
    levels = []
    for s in e.find("Services").iter("Service"):
        if s.attrib.get("ID") == "27" and "RequestSeed" in s.attrib.get("Name", ""):
            for v in s.find("Request").iter("Value"):
                lv = hx(v.attrib.get("Value"))
                if lv and lv % 2 == 1:
                    levels.append(lv)
    levels = sorted(set(levels))

    # services
    svc = []
    for s in e.find("Services").iter("Service"):
        sid = hx(s.attrib.get("ID"))
        if sid == 1:
            continue
        subs = []
        req = s.find("Request")
        if req is not None:
            for it in req.iter("Item"):
                nm = (it.attrib.get("Name") or "").lower()
                if any(k in nm for k in ("sub", "type", "reportsupported", "reportdtc", "reportnumber", "resettype", "controltype", "routinecontroltype", "securityaccesstype", "zerosubfunction")) and it.find("Values") is not None:
                    subs = sorted({hx(v.attrib.get("Value")) for v in it.find("Values") if v.attrib.get("Value")})
                    break
        entry = {"sid": sid, "name": clean(s.attrib.get("Name"), f"SID {sid:02X}"), "subFunctions": subs}
        sa = num(s.attrib.get("SA"), 0) or 0
        if sa:
            entry["saLevel"] = sa
            entry["session"] = 3
        svc.append(entry)
    services.append({"id": ecu_id, "services": svc})

    # DIDs
    rdbi = [did_entry(x, 0) for x in e.find("RDBIS")]
    drdbi = [did_entry(x, 0) for x in e.find("DRDBIS")]
    wdbi = [did_entry(x, 0) for x in e.find("WDBIS")]
    for w in wdbi:
        w.setdefault("session", 3)
        w.setdefault("saLevel", 1)
    snap = []
    sd = e.find("DTC").find("SnapShotData")
    if sd is not None:
        for it in sd.iter("Item"):
            lay = signal_layout(it, num(it.attrib.get("ByteStart"), 4) or 4)
            lay["did"] = hx(it.attrib.get("DID"))
            snap.append(lay)
    dids.append({"id": ecu_id, "rdbi": rdbi, "drdbi": drdbi, "wdbi": wdbi, "snapshotLayout": snap})

    # DTCs
    dtc = e.find("DTC")
    mask = None
    ra = dtc.find("ReadAll")
    rl = dtc.find("ReadList")
    for node in (rl, ra):
        if node is None:
            continue
        for it in node.iter("Item"):
            if "statusmask" in (it.attrib.get("Name") or "").lower() or "dtcstatus" in (it.attrib.get("Name") or "").lower():
                mask = hx(it.attrib.get("DefaultValue"), None)
                break
        if mask is not None:
            break
    mask = 0x0D  # confirmed|pending|testFailed — exactly what the dealer tool sends (19 02 0D, 102x in Aug–Sep 2026 traces)
    codes = []
    cc = dtc.find("DTCCodes")
    if cc is not None:
        for it in cc:
            raw = hx(it.attrib.get("DefaultValue"))
            text = clean(it.attrib.get("Name"))
            if not re.match(r"^[PCBU][0-9A-F]{6}$", text, re.I):
                # derive from raw 3-byte code
                first = (raw >> 22) & 0x3
                text = "PCBU"[first] + f"{raw & 0x3FFFFF:06X}"[-6:]
            sev = num(it.attrib.get("Level"), 2) or 2
            sev = min(3, max(1, int(sev)))
            codes.append({"code": raw, "codeText": text.upper(), "name": clean(it.attrib.get("Describle"), text.upper()), "severity": sev})
    dtcs.append({"id": ecu_id, "statusMask": mask, "dtcs": codes})

    # routines
    rt = []
    for r in e.find("Routines"):
        subs = []
        if r.attrib.get("StartRoutine") == "True":
            subs.append("start")
        if r.attrib.get("StopRoutine") == "True":
            subs.append("stop")
        if r.attrib.get("RequestRoutineResults") == "True":
            subs.append("status")
        params = []
        req = r.find("Request")
        if req is not None:
            for it in req.iter("Item"):
                if it.attrib.get("IsParameter") == "true" and (num(it.attrib.get("Size"), 0) or 0) > 0 and "StartRoutine" in (it.attrib.get("TI") or ""):
                    params.append(signal_layout(it, 5))
        entry = {"rid": hx(r.attrib.get("RID")), "name": clean(r.attrib.get("Name"), f"Routine {r.attrib.get('RID')}"), "subFunctions": subs or ["start"]}
        if params:
            entry["params"] = params
        sa = num(r.attrib.get("SA"), 0) or 0
        if sa:
            entry["saLevel"] = sa
        entry["session"] = 3
        rt.append(entry)
    routines.append({"id": ecu_id, "routines": rt})

    # IO control
    io = []
    OPT = {0: "returnControl", 1: "resetToDefault", 2: "freeze", 3: "shortTermAdjust"}
    for c in e.find("IOCtrls"):
        did = None
        params = []
        opts = set()
        req = c.find("Request")
        if req is not None:
            seen_ctrl = False
            for it in req.iter("Item"):
                nm = it.attrib.get("Name") or ""
                if nm == "dataIdentifier":
                    did = hx(it.attrib.get("DefaultValue"))
                elif nm == "inputOutputControlParameter":
                    seen_ctrl = True
                    vals = it.find("Values")
                    if vals is not None:
                        for v in vals:
                            opts.add(OPT.get(hx(v.attrib.get("Value")), "shortTermAdjust"))
                elif seen_ctrl and nm not in ("ServiceID",):
                    params.append(signal_layout(it, 5))
        maskattr = (c.attrib.get("ControlParamMask") or "").replace(",", " ").split()
        for m in maskattr:
            opts.add(OPT.get(hx(m), "shortTermAdjust"))
        entry = {"did": did or 0, "label": clean(c.attrib.get("Name"), "IO control"), "options": sorted(opts) or ["shortTermAdjust"]}
        if params:
            entry["params"] = params
        sa = num(c.attrib.get("SA"), 0) or 0
        if sa:
            entry["saLevel"] = sa
        io.append(entry)
    iocontrol.append({"id": ecu_id, "ioControls": io})

    ident = [d for d in rdbi if 0xF180 <= d["did"] <= 0xF1FF]
    live = [d for d in rdbi if not (0xF180 <= d["did"] <= 0xF1FF)] + drdbi
    ecus.append(OrderedDict(
        id=ecu_id, fullName=clean(a.get("Des"), ecu_id), subSystem=a.get("subSystem"),
        domain=DOMAIN.get(a.get("subSystem"), a.get("subSystem")), bus="DoIP", address=address,
        secondaryAddresses=[], saLevels=levels, identDids=ident, liveDids=live, writeDids=wdbi,
        ioControls=io, routines=rt, dtcs=codes, snapshotLayout=snap, dtcStatusMask=mask,
        timing={"p2": int(cfg.findtext("P2")), "p2Star": int(cfg.findtext("P2Star")), "s3": int(cfg.findtext("S3Time"))},
        doip={"ip": cfg.findtext("IPAddress"), "port": int(cfg.findtext("DestinationPort")), "gatewayAddress": int(cfg.findtext("GatewayAddress"))},
        ecuType=a.get("Type"),
    ))
    addresses.append({"id": ecu_id, "bus": "DoIP", "address": address, "secondaryAddresses": []})

# ---------------------------------------------------------------- processes
files = sorted(glob.glob(f"{WS}/R11_Oversea/*/Process/*.xml")) + sorted(glob.glob(f"{WS}/R11_China/*/Process/*.xml"))
CMP = {"Equal": "eq", "NotEqual": "neq", "Little": "lt", "LittleEqual": "lte", "Great": "gt", "GreatEqual": "gte"}
LEVEL = {"warning": "warning", "information": "information", "error": "error", "warn": "warning", "info": "information"}
sa_pairs: dict = {}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def literal(v: str):
    v = clean(v, "0")
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    if re.fullmatch(r"-?\d+\.\d+", v):
        return float(v)
    return v


def convert_condition(cond: ET.Element) -> dict:
    ones = list(cond.iter("OneCondition"))
    if not ones:
        return {"left": "ResponseStatus", "comparator": "eq", "right": 1}
    o = ones[0]
    l, r = o.find("LeftValue"), o.find("RightValue")
    left = clean(l.attrib.get("Value"), "ResponseStatus") if l is not None else "ResponseStatus"
    right = literal(r.attrib.get("Value")) if r is not None else 1
    if r is not None and r.attrib.get("IsVariable") == "true":
        right = "{" + str(right) + "}"
    c = {"left": left, "comparator": CMP.get(o.find("OpSign").attrib.get("Value", "Equal"), "eq"), "right": right}
    if len(ones) > 1:
        c["extra"] = [
            {"connect": x.find("ConnectSign").attrib.get("Value", "AND") if x.find("ConnectSign") is not None else "AND",
             "left": clean(x.find("LeftValue").attrib.get("Value"), "ResponseStatus"),
             "comparator": CMP.get(x.find("OpSign").attrib.get("Value", "Equal"), "eq"),
             "right": literal(x.find("RightValue").attrib.get("Value"))}
            for x in ones[1:]
        ]
    return c


def convert_steps(container: ET.Element | None, ecu_hint: str, ctx: dict) -> list:
    steps: list = []
    if container is None:
        return steps
    for el in container:
        t = el.tag
        if t == "Output":
            item = el.find("Item")
            text = clean(el.attrib.get("Description"))
            if item is not None:
                iv = clean(item.attrib.get("Value"))
                if item.attrib.get("IsVariable") == "true":
                    iv = "{" + iv + "}"
                text = (text + " — " + iv).strip(" —") if iv and iv != text else (text or iv)
            steps.append({"kind": "output", "level": LEVEL.get((el.attrib.get("Level") or "information").lower(), "information"), "text": text or "…"})
        elif t == "Input":
            it = el.attrib.get("InputType", "Common")
            step = {"kind": "input", "prompt": clean(el.attrib.get("Description"), "Enter value"), "variable": clean(el.attrib.get("Value"), "input"),
                    "inputType": "choice" if it == "Enumerate" else ("vin" if "vin" in clean(el.attrib.get("Value")).lower() else "text")}
            opts = [clean(x.attrib.get("Name") or x.attrib.get("Value")) for x in el.iter("EnumItem")]
            if opts:
                step["options"] = opts
                step["optionValues"] = [clean(x.attrib.get("Value")) for x in el.iter("EnumItem")]
            steps.append(step)
            ctx["inputs"] += 1
        elif t == "Delay":
            steps.append({"kind": "delay", "ms": max(1, num(el.attrib.get("Value"), 100) or 100), **({"label": clean(el.attrib.get("Description"))} if clean(el.attrib.get("Description")) else {})})
        elif t == "Assign":
            v = el.attrib.get("Value")
            steps.append({"kind": "setVar", "variable": clean(el.attrib.get("VariableName"), "var"),
                          "value": literal(v) if el.attrib.get("IsConst") != "false" else "{" + clean(v) + "}"})
        elif t == "Math":
            parts = []
            SYM = {"Add": "+", "Del": "-", "Sub": "-", "Mul": "*", "Div": "/"}
            for mv in el.findall("MathValue"):
                ov = mv.find("OpValue")
                val = clean(ov.attrib.get("Value"), "0")
                if ov.attrib.get("IsVariable") == "true":
                    val = "{" + val + "}"
                parts.append(val)
                parts.append(SYM.get(mv.find("Symbol").attrib.get("Value", "Add"), "+"))
            expr = " ".join(parts[:-1]) if parts else "0"
            steps.append({"kind": "setVar", "variable": clean(el.attrib.get("Variable"), "var"), "value": expr, "expression": True})
        elif t == "Quit":
            steps.append({"kind": "quit", "error": el.attrib.get("ErrorEnd", "False").lower() == "true", "text": clean(el.attrib.get("Description"), "Process stopped")})
        elif t == "FastSA":
            addr = num(el.attrib.get("EcuAddress"), 0) or 0
            ecu_id = addr_to_id.get(addr, ecu_hint)
            level = num(el.attrib.get("SeedLevel"), 1) or 1
            alg = num(el.attrib.get("SAAlg"), 1) or 0
            sa_pairs.setdefault(ecu_id, {}).setdefault(str(level), alg)
            ctx["sa"].append((level, alg))
            sa_step = {"kind": "securityAccess", "ecuId": ecu_id, "level": level, "alg": alg, "session": 3}
            if el.attrib.get("NegativeExit", "false").lower() == "true":
                sa_step["negativeExit"] = "abort"
            steps.append(sa_step)
        elif t == "EcuService":
            addr = hx(el.attrib.get("TargetAddress"))
            ecu_id = addr_to_id.get(addr, ecu_hint)
            sid = hx(el.attrib.get("ServiceID"))
            ctx["sids"].add(f"0x{sid:02X}")
            req_sigs = list(el.find("Request").iter("Signal")) if el.find("Request") is not None else []
            sub = None
            request = []
            for s in req_sigs:
                bs, sz = num(s.attrib.get("ByteStart"), 2) or 2, num(s.attrib.get("Size"), 1) or 1
                const = s.attrib.get("IsConst", "true") != "false"
                val = clean(s.attrib.get("Value"))
                if bs == 2 and sz == 1 and const and sub is None and sid not in (0x22, 0x2E, 0x14, 0x3E):
                    sub = hx(val)
                    continue
                f = {"name": clean(s.attrib.get("Describle"), f"byte{bs}"), "length": sz}
                if const:
                    f["value"] = val.upper()
                else:
                    f["variable"] = val
                request.append(f)
            step = {"kind": "ecuService", "ecuId": ecu_id, "sid": sid, "request": request,
                    "label": clean(el.attrib.get("Description")) or clean(el.attrib.get("Name"), f"SID {sid:02X}")}
            if sub is not None:
                step["subFunction"] = sub
            pr = el.find("PositiveResponse")
            if pr is not None:
                lay = []
                for s in pr.iter("Signal"):
                    if s.attrib.get("IsConst", "true") == "false":
                        lay.append({"name": clean(s.attrib.get("Value"), "resp"), "byteStart": max(0, (num(s.attrib.get("ByteStart"), 1) or 1) - 1),
                                    "length": num(s.attrib.get("Size"), 1) or 1, "type": "hex"})
                if lay:
                    step["responseLayout"] = lay
                    step["storeAs"] = lay[0]["name"]
            if el.attrib.get("NegativeExit", "false").lower() == "true":
                step["negativeExit"] = "abort"
            if sid in (0x2E, 0x2F, 0x31, 0x14, 0x11, 0x34, 0x36, 0x37) or ctx["sa"]:
                step["session"] = 3
            if ctx["sa"]:
                step["saLevel"] = ctx["sa"][-1][0]
                step["saAlg"] = ctx["sa"][-1][1]
            steps.append(step)
            # branch handling on ResponseStatus
            for child in el.findall("ChildStep"):
                steps.extend(convert_steps(child, ecu_id, ctx))
        elif t == "If":
            cond = convert_condition(el.find("Condition")) if el.find("Condition") is not None else {"left": "ResponseStatus", "comparator": "eq", "right": 1}
            then = []
            for child in el.findall("ChildStep"):
                then.extend(convert_steps(child, ecu_hint, ctx))
            els = []
            for e2 in el.findall("Else"):
                for child in e2.findall("ChildStep"):
                    els.extend(convert_steps(child, ecu_hint, ctx))
            if not then and not els:
                continue  # empty branch scaffolding (the legacy editor emits 3 empty Ifs per service)
            step = {"kind": "if", "condition": cond, "then": then}
            if els:
                step["else"] = els
            lab = clean(el.attrib.get("Description"))
            if lab:
                step["label"] = lab
            steps.append(step)
        elif t == "Else":
            pass  # handled inside If
        elif t == "Loop":
            cond = convert_condition(el.find("Condition")) if el.find("Condition") is not None else None
            body = []
            for child in el.findall("ChildStep"):
                body.extend(convert_steps(child, ecu_hint, ctx))
            steps.append({"kind": "loop", "while": cond, "maxIterations": 200, "steps": body})
        elif t == "DllCallback":
            steps.append({"kind": "dllCallback", "function": clean(el.attrib.get("FunctionName"), "?"), "dll": clean(el.attrib.get("DllName")),
                          "variables": [clean(v.attrib.get("Name")) for v in el.iter("VariableName")],
                          "label": "Legacy native callback — not executable by the agent"})
        elif t == "Frame":
            pass
        elif t == "ChildStep":
            steps.extend(convert_steps(el, ecu_hint, ctx))
        elif t.startswith("Programm_"):
            steps.append({"kind": "programming", "op": t.replace("Programm_", ""), "attrs": {k: v for k, v in el.attrib.items() if k != "Description"}})
        else:
            pass
    return steps


def category(name: str, sids: set, ecu: str) -> str:
    n = name.lower()
    if any(k in n for k in ("key", "immo", "sk brush", "sk ", "security constant")):
        return "Immobiliser"
    if "reset" in n:
        return "Reset"
    if any(k in n for k in ("calibrat", "learning", "matching", "index", "abpmi")):
        return "Calibration"
    if any(k in n for k in ("test", "check", "drive", "release", "pump")):
        return "Actuator test"
    if any(k in n for k in ("vin", "config", "write", "baseline", "code")):
        return "Coding"
    return "Service"


processes = []
menu_children: dict[str, list] = {}
for f in files:
    root = ET.parse(f).getroot()
    p = root.find("Processes").find("Process")
    ecu_dir = f.split("/")[-3]
    market = "China" if "/R11_China/" in f else "Oversea"
    ecu_id = ecu_dir if ecu_dir in {e["id"] for e in ecus} else addr_to_id.get(0, ecu_dir)
    name = clean(p.attrib.get("Name"), os.path.basename(f)[:-4])
    name = re.sub(r"\s+", " ", name)
    ctx = {"sids": set(), "sa": [], "inputs": 0}
    vars_ = [{"name": v.attrib.get("Name"), "type": v.attrib.get("Type"), "initial": clean(v.attrib.get("InitialValue")), "description": clean(v.attrib.get("Description"))}
             for v in p.find("Variables")] if p.find("Variables") is not None else []
    steps = convert_steps(p.find("ChildStep"), ecu_id, ctx)
    pid = f"{ecu_id.lower()}__{slug(os.path.basename(f)[:-4])}" + ("__china" if market == "China" else "")
    proc = OrderedDict(
        id=pid, name=name, ecu=ecu_id, category=category(name + " " + os.path.basename(f), ctx["sids"], ecu_id),
        udsServices=sorted(ctx["sids"]), securityLevel=max([l for l, _ in ctx["sa"]] + [0]),
        requiresVin=any("vin" in (v["name"] or "").lower() for v in vars_) or "vin" in name.lower(),
        variables=vars_, steps=steps, sourceFile=os.path.relpath(f, WS), market=market,
        description=clean(p.attrib.get("Description")),
    )
    if ctx["sa"]:
        proc["securityAlg"] = ctx["sa"][0][1]
    processes.append(proc)
    menu_children.setdefault(ecu_id, []).append({"id": f"menu-{pid}", "label": name, "ecuId": ecu_id, "processId": pid})

# ---------------------------------------------------------------- flows
flows = []
for f in sorted(glob.glob(f"{WS}/R11_Oversea/*/Programming/*.xml")):
    try:
        root = ET.parse(f).getroot()
    except ET.ParseError:
        continue
    p = root.find("Processes").find("Process")
    ecu = f.split("/")[-3]
    phases = []
    for el in p.iter():
        if el.tag == "Programm_UnlockECU":
            phases.append(f"Security access (level {el.attrib.get('SeedLevel')}, {el.attrib.get('SALevel')})")
        elif el.tag == "Programm_Download":
            phases.append(f"Download module {el.attrib.get('MoudleID')}")
    flows.append({"id": f"{ecu.lower()}__{slug(os.path.basename(f)[:-4])}", "name": clean(p.attrib.get("Name"), os.path.basename(f)), "type": p.attrib.get("StepType", "Programming"),
                  "ecus": [ecu], "phases": phases[:12], "sourceFile": os.path.relpath(f, WS), "version": p.attrib.get("Version"), "flowVersion": p.attrib.get("FlowVersion"),
                  "programmingLevelSAAlg": num(p.attrib.get("ProgrammingLevelSAAlg")), "extendLevelSAAlg": num(p.attrib.get("ExtendLevelSAAlg")),
                  "blockLength": num(p.attrib.get("UserDefineBlockLength")), "crc": p.attrib.get("IsUseCRC") == "True"})
for f in sorted(glob.glob(f"{ROOT}/LKWorkspace/Vehicle_Flow/*/*/*.xml")):
    flows.append({"id": slug(f.split("/")[-3] + "-" + os.path.basename(f)[:-4]), "name": os.path.basename(f)[:-4], "type": "Programming (encrypted)", "ecus": [],
                  "phases": [], "sourceFile": os.path.relpath(f, ROOT), "encrypted": True})

# ---------------------------------------------------------------- menu
menu_root = []
mx = ET.parse(f"{ROOT}/Menu/Menuinfo.xml").getroot()
for m in mx.findall("menu"):
    node = {"id": f"menu-{m.attrib.get('menuId')}", "label": clean(m.attrib.get("name"), "menu"), "children": [
        {"id": f"menu-{c.attrib.get('menuId')}", "label": clean(c.attrib.get("name"), "item")} for c in m.findall("menuchildren")]}
    menu_root.append(node)
menu_root.append({"id": "menu-ecus", "label": "Service functions by ECU", "children": [
    {"id": f"menu-ecu-{k}", "label": k, "ecuId": k, "children": v} for k, v in sorted(menu_children.items())]})

# ---------------------------------------------------------------- write
vehicle = {"name": "ROX 01 (Polar Stone 01)", "code": "R11_Oversea", "vinExample": "HJ4ABBHK7SN075057", "bus": "DoIP",
           "doip": {"vehicleIp": "192.168.0.100", "port": 13400, "testerAddress": tester, "functionalAddress": functional, "gatewayAddress": 0x001A,
                    "recommendedTesterIp": "192.168.0.110/24"},
           "markets": {"R11_Oversea": "Oversea / MEA (42 ECU definitions)", "R11_China": "China (40 ECUs; ASCM_RL/RR absent)"},
           "securityAccessTable": sa_pairs}
out_files = {
    "ecus.json": {"vehicle": vehicle, "ecus": ecus},
    "addresses.json": {"testerAddress": tester, "functionalAddress": functional, "ecus": addresses},
    "services.json": {"ecus": services},
    "dids.json": {"ecus": dids},
    "dtcs.json": {"ecus": dtcs},
    "routines.json": {"ecus": routines},
    "iocontrol.json": {"ecus": iocontrol},
    "processes.json": {"processes": processes},
    "flows.json": {"flows": flows},
    "menu.json": {"root": menu_root},
}
h = hashlib.sha256()
for name, obj in out_files.items():
    data = json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=False)
    with open(f"{OUT}/{name}", "w", encoding="utf-8") as fh:
        fh.write(data + "\n")
    h.update(name.encode()); h.update(data.encode())
checksum = h.hexdigest()
with open(f"{OUT}/CHECKSUM.txt", "w") as fh:
    fh.write(checksum + "\n")

counts = {
    "ecus": len(ecus), "rdbiDids": sum(len(d["rdbi"]) for d in dids), "drdbiDids": sum(len(d["drdbi"]) for d in dids),
    "wdbiDids": sum(len(d["wdbi"]) for d in dids), "ioControls": sum(len(x["ioControls"]) for x in iocontrol),
    "routines": sum(len(x["routines"]) for x in routines), "processes": len(processes), "dtcs": sum(len(x["dtcs"]) for x in dtcs),
    "flows": len(flows), "checksum": checksum,
}
print(json.dumps(counts, indent=1))
kinds = Counter()
def walk(steps):
    for s in steps:
        kinds[s["kind"]] += 1
        for k in ("then", "else", "steps"):
            if k in s and s[k]:
                walk(s[k])
for p in processes:
    walk(p["steps"])
print("step kinds:", dict(kinds))
print("categories:", Counter(p["category"] for p in processes))
