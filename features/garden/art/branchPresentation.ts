import type { TreeTopology } from "../types";

function branchLength(branch: TreeTopology["branches"][number]): number {
  return Math.hypot(
    branch.end[0] - branch.start[0],
    branch.end[1] - branch.start[1],
    branch.end[2] - branch.start[2],
  );
}

/**
 * Keeps the authored botanical graph intact while omitting only unadorned,
 * hair-thin terminal construction strokes that read as thorns or wire cages.
 */
export function visibleBranchIndexes(topology: TreeTopology): Set<number> {
  const parents = new Set(
    topology.branches.flatMap((branch) =>
      branch.parentId ? [branch.parentId] : [],
    ),
  );
  const organParents = new Set(
    topology.foliage.flatMap((organ) =>
      organ.parentBranchId ? [organ.parentBranchId] : [],
    ),
  );
  const visible = new Set<number>();

  topology.branches.forEach((branch, index) => {
    const terminal = !parents.has(branch.id);
    const adorned = organParents.has(branch.id);
    const midpointY = (branch.start[1] + branch.end[1]) * 0.5;
    const short = branchLength(branch) < 0.36;
    const lowerTrunkStub =
      terminal &&
      !adorned &&
      midpointY < -1.15 &&
      branch.order >= 1 &&
      short;
    const bareConstructionTip =
      terminal &&
      !adorned &&
      branch.order >= 4 &&
      branch.radiusStart < 0.026 &&
      short;
    if (!lowerTrunkStub && !bareConstructionTip) visible.add(index);
  });

  return visible;
}

export function terminalBranchIndexes(topology: TreeTopology): number[] {
  const parents = new Set(
    topology.branches.flatMap((branch) =>
      branch.parentId ? [branch.parentId] : [],
    ),
  );
  const visible = visibleBranchIndexes(topology);
  return topology.branches.flatMap((branch, index) =>
    visible.has(index) && !parents.has(branch.id) ? [index] : [],
  );
}
