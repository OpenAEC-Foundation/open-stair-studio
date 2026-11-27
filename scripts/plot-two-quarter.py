"""Compare two left-turn IFC stairs at the same scale using measured nosing edges."""
from argparse import ArgumentParser
from pathlib import Path
from runpy import run_path

import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import numpy as np

measure = run_path(Path(__file__).with_name("measure-wel-tweekwart.py"))


def plan(path):
    boards, treads, cloud = [], [], []
    for vertices, faces, kind in measure["meshes"](path):
        cloud.append(vertices[:, :2])
        if kind in ("IfcPlate", "IfcBuildingElementPart"):
            height = np.ptp(vertices[:, 2])
            if abs(height - 38) < .01 or 100 < height < 200:
                parts = treads if abs(height - 38) < .01 else boards
                parts.append((vertices[:, 2].max(), measure["top_boundary"](vertices, faces)))
    for parts in (boards, treads):
        parts.sort(key=lambda p: p[0])
    assert len(boards) == 16 and len(treads) in (15, 16)
    centers = [edges.mean(axis=(0, 1)) for _, edges in boards]
    sections = []
    for i, (_, edges) in enumerate(boards):
        vectors = edges[:, 1] - edges[:, 0]
        across = vectors[np.linalg.norm(vectors, axis=1).argmax()]
        normal = np.array([-across[1], across[0]]) / np.linalg.norm(across)
        travel = centers[min(i+1, 15)] - centers[max(i-1, 0)]
        if normal @ travel < 0:
            normal *= -1
        right = np.array([normal[1], -normal[0]])
        if i == 0:
            # Rotate the first ascent to point up on the page. No reflection.
            transform = np.column_stack((right, normal))
        boundary = treads[i][1] if i < 15 else edges
        vectors = boundary[:, 1] - boundary[:, 0]
        lengths = np.linalg.norm(vectors, axis=1)
        parallel = boundary[(lengths > 500) & (abs(vectors @ normal) < .001 * lengths)]
        nose = parallel[(parallel.mean(axis=1) @ normal).argmin()]
        sections.append(nose[np.argsort(nose @ right)] @ transform)
    cloud = np.vstack(cloud) @ transform
    origin = cloud.min(axis=0)
    sections = np.array(sections) - origin
    outside_edges = []
    for i, (_, boundary) in enumerate(treads[:15]):
        # A tread straddling the outer corner of a square stringer has a
        # third point on its outside. Retain just the main measured turn.
        start, end = sections[i, 1], sections[i+1, 1]
        axis = end-start
        normal = np.array([axis[1], -axis[0]]) / np.linalg.norm(axis)
        vertices = boundary.reshape(-1, 2) @ transform - origin
        along = (vertices-start) @ axis / (axis @ axis)
        interior = vertices[(along > .01) & (along < .99)]
        edge = [start]
        if len(interior):
            distances = (interior-start) @ normal
            if distances.max() > 10:
                edge.append(interior[distances.argmax()])
        outside_edges.append(np.array([*edge, end]))
    return sections, outside_edges, np.ptp(cloud, axis=0)


def dimension(ax, start, end, label, vertical=False):
    x, y = start
    u, v = end
    tick = 20
    ax.plot([x,u], [y,v], color="#576879", linewidth=.75)
    for a,b in [start, end]:
        ax.plot([a-tick,a+tick], [b-tick,b+tick], color="#576879", linewidth=.75)
    ax.text((x+u)/2, (y+v)/2, label, rotation=90 if vertical else 0, ha="center", va="center",
            color="#233a50", size=10, bbox=dict(facecolor="white", edgecolor="none", pad=3))


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("studio", type=Path)
    parser.add_argument("manufacturer", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    plt.rcParams.update({"font.family":"DejaVu Sans", "savefig.facecolor":"white"})
    fig, axes = plt.subplots(2, 1, figsize=(9.2, 8.0))
    fig.subplots_adjust(left=.045, right=.97, bottom=.09, top=.94, hspace=.22)
    plans = [plan(args.studio), plan(args.manufacturer)]
    max_size = np.max([size for _, _, size in plans], axis=0)
    for ax, (sections, outside_edges, size), name in zip(axes, plans, ("Open Stair Studio · IFC4", "De Vries Trappen · IFC2x3")):
        width, height = size
        for i, (lower, upper) in enumerate(zip(sections, sections[1:])):
            outside = outside_edges[i]
            outline = np.array([lower[0], *outside, upper[0]])
            fill = "#b5e1d6" if 5 <= i < 10 else "#e1e9ef"
            ax.fill(*outline.T, facecolor=fill, edgecolor="none")
            ax.plot(*outside.T, color="#8799a4", linewidth=.8)
        ax.plot(*sections[:,0].T, color="#8799a4", linewidth=.8)
        for i, edge in enumerate(sections):
            ax.plot(*edge.T, color="#244251", linewidth=1.15, linestyle="--" if i==15 else "-")
        # A measured bounding rectangle includes all represented parts.
        ax.plot([0,width,width,0,0],[0,0,height,height,0],color="#8a9aa5",linestyle=(0,(3,4)),linewidth=.65)
        mm = lambda v: f"{v:.1f}".replace(".", ",")
        dimension(ax, (0,-113), (width,-113), mm(width)+" mm")
        dimension(ax, (-115,0), (-115,height), mm(height)+" mm", vertical=True)
        for i in (0, 14):
            point = (sections[i].mean(axis=0)+sections[i+1].mean(axis=0))/2
            ax.text(*point, str(i+1), ha="center", va="center", size=9, color="#233a50")
        a, b = sections[6].mean(axis=0), sections[9].mean(axis=0)
        ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="-|>", color="#146352", lw=1.7,
                                                       mutation_scale=11))
        ax.set_title(name,loc="left",color="#183747",size=13,fontweight="bold",pad=6)
        ax.set_xlim(-200,max_size[0]+70)
        ax.set_ylim(-180,max_size[1]+65)
        ax.set_aspect("equal")
        ax.axis("off")
    fig.legend(handles=[Patch(facecolor="#e1e9ef",label="Verdreven trede"),
                        Patch(facecolor="#b5e1d6",label="Rechte tussentrede")],
               loc="lower center",bbox_to_anchor=(.5,.025),frameon=False,ncol=2,fontsize=10)
    fig.savefig(args.output,dpi=175)


if __name__ == "__main__":
    main()
