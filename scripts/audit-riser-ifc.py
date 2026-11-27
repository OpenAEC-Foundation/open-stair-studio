"""Audit actual cut volumes using OpenCascade through IfcOpenShell.

uv run --no-project --python 3.12 --with ifcopenshell==0.9.0.post1 --with pytest scripts/audit-riser-ifc.py
"""
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util.shape import get_volume


with TemporaryDirectory() as folder:
    subprocess.run(["node", "scripts/verify-riser-ifc.mjs", folder], check=True)
    verified = 0
    for file in Path(folder).glob("*.ifc"):
        model = ifcopenshell.open(str(file))
        volumes = json.loads(file.with_suffix(".json").read_text(encoding="utf-8"))
        hosts = model.by_type("IfcPlate") + model.by_type("IfcMember") + model.by_type("IfcSlab")
        settings = ifcopenshell.geom.settings()
        for host in hosts:
            shape = ifcopenshell.geom.create_shape(settings, host)
            actual = get_volume(shape.geometry)
            expected = volumes[host.Tag]
            # Round nosings use a 24-chord quarter circle in IFC and an
            # analytical section in the cutting list. Straight faces are exact.
            tolerance = 1e-7 if host.ObjectType == "Houten trede" else 1e-8
            assert expected > 0 and abs(actual-expected) < tolerance, (
                file.name, host.Tag, actual, expected
            )
            verified += 1
    print(f"OpenCascade verified the net IFC volumes of {verified} treads, stringers, risers and landings.")
